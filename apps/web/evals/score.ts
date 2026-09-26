/**
 * Scorer: combines a run's rules grades and judge grades into one verdict per slide, writes a
 * report, compares against the saved baseline, and optionally gates (exit 1 on regression).
 *
 *   npm run eval:score -w @voxdeck/web                     # score the latest run
 *   npm run eval:score -w @voxdeck/web -- --run <runId>
 *   npm run eval:score -w @voxdeck/web -- --set-baseline   # save this run as evals/baseline.json
 *   npm run eval:score -w @voxdeck/web -- --gate           # exit 1 if worse than the baseline (CI)
 *
 * Verdict per slide (the README pass rule):
 *   PASS        no hard rule failed AND faithfulness >= 4 AND 100% critical coverage AND no must-not-say hit
 *   FAIL        any of the above missed (reasons listed)
 *   INCOMPLETE  rules passed but the judge hasn't scored it yet
 *   ERROR       the judge errored on this slide
 *
 * Writes runs/<runId>/scorecard.json and report.md.
 */
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import type { JudgeGrade } from "./grade-judge.ts";
import type { RuleResult } from "./rules.ts";

type Row = { id: string; deckId: string; slideType: string; difficulty: string; mustMentionCritical: string[] };
type Dataset = { version: string; rows: Row[] };
type Output = { rowId: string; repeat: number; narration: string; wordCount: number; isModelOutput: boolean };
type RulesGrade = { rowId: string; repeat: number; passRules: boolean; results: RuleResult[] };
type Verdict = "PASS" | "FAIL" | "INCOMPLETE" | "ERROR";

export type SlideScore = {
  rowId: string;
  repeat: number;
  deckId: string;
  slideType: string;
  difficulty: string;
  verdict: Verdict;
  reasons: string[];
  faithfulness: number | null;
  style: number | null;
  criticalCoveragePct: number | null;
  optionalCoveragePct: number | null;
  words: number;
  tags: string[];
  narration: string;
};

export type Scorecard = {
  runId: string;
  label: string;
  scoredAt: string;
  datasetVersion: string;
  pipeline: Record<string, unknown> | null;
  judge: Record<string, unknown> | null;
  metrics: {
    slides: number;
    pass: number;
    fail: number;
    incomplete: number;
    error: number;
    passRatePct: number;
    avgFaithfulness: number | null;
    avgStyle: number | null;
    fullCriticalCoveragePct: number | null;
    avgWords: number;
    fallbackOutputs: number;
    violationsByTag: Record<string, number>;
  };
  byDeck: Record<string, { slides: number; passRatePct: number }>;
  bySlideType: Record<string, { slides: number; passRatePct: number }>;
  byDifficulty: Record<string, { slides: number; passRatePct: number }>;
  /** Per golden row across repeats: share of repeats that passed. */
  rows: Record<string, { passes: number; repeats: number }>;
  slides: SlideScore[];
};

/** Regression gate vs baseline. */
export const GATE = {
  maxPassRateDropPts: 2,
  maxFaithfulnessDrop: 0.1,
  /** [N] invented numbers and [H] hallucinations may not increase. */
  noIncreaseTags: ["[N]", "[H]"],
  allowFallbacks: 0,
};

const EVALS = import.meta.dirname;
const { values: args } = parseArgs({
  options: {
    run: { type: "string" },
    runs: { type: "string", default: path.join(EVALS, "runs") },
    dataset: { type: "string", default: path.join(EVALS, "golden", "narration-v2.json") },
    baseline: { type: "string", default: path.join(EVALS, "baseline.json") },
    "set-baseline": { type: "boolean", default: false },
    gate: { type: "boolean", default: false },
  },
});

const readJsonl = <T>(p: string): T[] =>
  existsSync(p) ? readFileSync(p, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l) as T) : [];
const readJson = <T>(p: string): T | null => (existsSync(p) ? (JSON.parse(readFileSync(p, "utf8")) as T) : null);
const avg = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 100) / 100 : null);
const pct = (n: number, d: number) => (d ? Math.round((n / d) * 1000) / 10 : 0);

function main() {
  const dataset = JSON.parse(readFileSync(args.dataset!, "utf8")) as Dataset;
  const rows = new Map(dataset.rows.map((r) => [r.id, r]));

  const candidates = existsSync(args.runs!)
    ? readdirSync(args.runs!).filter((d) => existsSync(path.join(args.runs!, d, "outputs.jsonl")))
    : [];
  const runId =
    args.run ?? candidates.sort((a, b) => statSync(path.join(args.runs!, b)).mtimeMs - statSync(path.join(args.runs!, a)).mtimeMs)[0];
  if (!runId) throw new Error("No runs found. Run npm run eval:run first.");
  const dir = path.join(args.runs!, runId);

  const outputs = readJsonl<Output>(path.join(dir, "outputs.jsonl"));
  const rules = new Map(readJsonl<RulesGrade>(path.join(dir, "grades-rules.jsonl")).map((g) => [`${g.rowId}#${g.repeat}`, g]));
  const judge = new Map(readJsonl<JudgeGrade>(path.join(dir, "grades-judge.jsonl")).map((g) => [`${g.rowId}#${g.repeat}`, g]));
  const runMeta = readJson<{ label?: string; pipeline?: Record<string, unknown>; dataset?: { version?: string } }>(path.join(dir, "run.json"));
  const judgeMeta = readJson<{ judge?: Record<string, unknown> }>(path.join(dir, "judge-summary.json"));
  if (!rules.size) console.warn("! No rules grades for this run. Run npm run eval:rules first.");
  if (!judge.size) console.warn("! No judge grades for this run. Run npm run eval:judge first; slides will be INCOMPLETE.");
  if (runMeta?.dataset?.version && runMeta.dataset.version !== dataset.version) {
    throw new Error(`Run used dataset ${runMeta.dataset.version} but scoring against ${dataset.version}.`);
  }

  // ---------- per-slide verdicts ----------
  const slides: SlideScore[] = outputs.map((o) => {
    const key = `${o.rowId}#${o.repeat}`;
    const row = rows.get(o.rowId)!;
    const r = rules.get(key);
    const j = judge.get(key);
    const reasons: string[] = [];
    const tags = new Set<string>();

    const hardFails = (r?.results ?? []).filter((x) => x.hard && x.status === "fail");
    for (const f of hardFails) {
      reasons.push(`rule ${f.rule}: ${f.detail}`);
      for (const t of ["[H]", "[L]", "[N]", "[O]"]) if (f.detail.includes(t)) tags.add(t);
    }

    if (j?.faithfulness) {
      const f = j.faithfulness;
      if (f.score < 4) {
        const bad = f.claims.filter((c) => c.supported !== "yes").map((c) => `${c.tag ? `[${c.tag}] ` : ""}${c.claim}`);
        reasons.push(`faithfulness ${f.score}/5: ${bad.join(" | ") || f.reason}`);
      }
      for (const c of f.claims) if (c.supported !== "yes" && c.tag) tags.add(`[${c.tag}]`);
      if (f.mustNotSayHits.length) reasons.push(`must-not-say: ${f.mustNotSayHits.join(" | ")}`);
    }
    if (j?.coverage && j.criticalCoveragePct !== null && j.criticalCoveragePct < 100) {
      const hit = new Set(j.coverage.critical.filter((c) => c.hit).map((c) => c.item));
      const missed = row.mustMentionCritical.filter((_, i) => !hit.has(i + 1));
      reasons.push(`missed critical: ${missed.join(" | ")}`);
    }

    let verdict: Verdict;
    if (hardFails.length) verdict = "FAIL";
    else if (j?.error) {
      verdict = "ERROR";
      reasons.push(`judge error: ${j.error}`);
    } else if (!j?.judged) verdict = "INCOMPLETE";
    else verdict = j.judgePass ? "PASS" : "FAIL";

    return {
      rowId: o.rowId,
      repeat: o.repeat,
      deckId: row.deckId,
      slideType: row.slideType,
      difficulty: row.difficulty,
      verdict,
      reasons,
      faithfulness: j?.faithfulness?.score ?? null,
      style: j?.style?.score ?? null,
      criticalCoveragePct: j?.criticalCoveragePct ?? null,
      optionalCoveragePct: j?.optionalCoveragePct ?? null,
      words: o.wordCount,
      tags: [...tags],
      narration: o.narration,
    };
  });

  // ---------- aggregates ----------
  const group = (key: "deckId" | "slideType" | "difficulty") =>
    Object.fromEntries(
      [...new Set(slides.map((s) => s[key]))].sort().map((k) => {
        const list = slides.filter((s) => s[key] === k);
        return [k, { slides: list.length, passRatePct: pct(list.filter((s) => s.verdict === "PASS").length, list.length) }];
      }),
    );
  const count = (v: Verdict) => slides.filter((s) => s.verdict === v).length;
  const judged = slides.filter((s) => s.faithfulness !== null);
  const violationsByTag: Record<string, number> = { "[H]": 0, "[L]": 0, "[N]": 0, "[O]": 0 };
  for (const s of slides) for (const t of s.tags) violationsByTag[t] = (violationsByTag[t] ?? 0) + 1;
  const rowsAgg: Scorecard["rows"] = {};
  for (const s of slides) {
    const a = (rowsAgg[s.rowId] ??= { passes: 0, repeats: 0 });
    a.repeats++;
    if (s.verdict === "PASS") a.passes++;
  }

  const card: Scorecard = {
    runId,
    label: runMeta?.label ?? "",
    scoredAt: new Date().toISOString(),
    datasetVersion: dataset.version,
    pipeline: runMeta?.pipeline ?? null,
    judge: judgeMeta?.judge ?? null,
    metrics: {
      slides: slides.length,
      pass: count("PASS"),
      fail: count("FAIL"),
      incomplete: count("INCOMPLETE"),
      error: count("ERROR"),
      passRatePct: pct(count("PASS"), slides.length),
      avgFaithfulness: avg(judged.map((s) => s.faithfulness!)),
      avgStyle: avg(judged.map((s) => s.style!).filter((x) => x !== null)),
      fullCriticalCoveragePct: judged.length
        ? pct(judged.filter((s) => s.criticalCoveragePct === null || s.criticalCoveragePct === 100).length, judged.length)
        : null,
      avgWords: avg(slides.map((s) => s.words)) ?? 0,
      fallbackOutputs: outputs.filter((o) => !o.isModelOutput).length,
      violationsByTag,
    },
    byDeck: group("deckId"),
    bySlideType: group("slideType"),
    byDifficulty: group("difficulty"),
    rows: rowsAgg,
    slides,
  };

  // ---------- baseline comparison ----------
  const baseline = readJson<Scorecard>(args.baseline!);
  const comparable = baseline && baseline.datasetVersion === card.datasetVersion && baseline.runId !== card.runId;
  if (baseline && baseline.datasetVersion !== card.datasetVersion) {
    console.warn(`! Baseline uses dataset ${baseline.datasetVersion}, this run ${card.datasetVersion}; not comparing.`);
  }
  const gateFailures: string[] = [];
  const regressions: string[] = [];
  const fixes: string[] = [];
  if (comparable) {
    const m = card.metrics;
    const b = baseline.metrics;
    if (b.passRatePct - m.passRatePct > GATE.maxPassRateDropPts)
      gateFailures.push(`pass rate ${b.passRatePct}% -> ${m.passRatePct}%`);
    if (b.avgFaithfulness !== null && m.avgFaithfulness !== null && b.avgFaithfulness - m.avgFaithfulness > GATE.maxFaithfulnessDrop)
      gateFailures.push(`faithfulness ${b.avgFaithfulness} -> ${m.avgFaithfulness}`);
    for (const t of GATE.noIncreaseTags)
      if ((m.violationsByTag[t] ?? 0) > (b.violationsByTag[t] ?? 0))
        gateFailures.push(`${t} violations ${b.violationsByTag[t] ?? 0} -> ${m.violationsByTag[t]}`);
    for (const [rowId, now] of Object.entries(card.rows)) {
      const before = baseline.rows[rowId];
      if (!before) continue;
      const wasPass = before.passes === before.repeats;
      const isPass = now.passes === now.repeats;
      if (wasPass && !isPass) regressions.push(rowId);
      if (!wasPass && isPass) fixes.push(rowId);
    }
  }
  if (card.metrics.fallbackOutputs > GATE.allowFallbacks)
    gateFailures.push(`${card.metrics.fallbackOutputs} fallback outputs (not model narrations)`);
  if (card.metrics.incomplete || card.metrics.error)
    gateFailures.push(`${card.metrics.incomplete} incomplete and ${card.metrics.error} errored slides`);

  // ---------- write ----------
  writeFileSync(path.join(dir, "scorecard.json"), JSON.stringify({ ...card, comparison: comparable ? { baselineRunId: baseline.runId, regressions, fixes, gateFailures } : null }, null, 2) + "\n");

  const d = (now: number | null, before: number | null | undefined, unit = "") =>
    now === null ? "n/a" : comparable && before != null ? `${now}${unit} (${now - before >= 0 ? "+" : ""}${Math.round((now - before) * 100) / 100})` : `${now}${unit}`;
  const b = comparable ? baseline.metrics : null;
  const m = card.metrics;
  const lines: string[] = [
    `# Narration eval: ${runId}`,
    "",
    `- Label: ${card.label || "(none)"}`,
    `- Narrator: ${String(card.pipeline?.provider ?? "?")} / ${String(card.pipeline?.model ?? "?")}, git ${String(card.pipeline?.gitSha ?? "?")}${card.pipeline?.gitDirty ? " (dirty)" : ""}`,
    `- Judge: ${String(card.judge?.provider ?? "none")} / ${String(card.judge?.model ?? "")} ${String(card.judge?.promptVersion ?? "")}`,
    `- Dataset: ${card.datasetVersion}`,
    `- Baseline: ${comparable ? baseline.runId : "none"}`,
    "",
    "## Headline",
    "",
    "| Metric | Value |",
    "|---|---|",
    `| Pass rate | ${d(m.passRatePct, b?.passRatePct, "%")} (${m.pass}/${m.slides}) |`,
    `| Avg faithfulness | ${d(m.avgFaithfulness, b?.avgFaithfulness)} |`,
    `| Full critical coverage | ${d(m.fullCriticalCoveragePct, b?.fullCriticalCoveragePct, "%")} |`,
    `| Avg style | ${d(m.avgStyle, b?.avgStyle)} |`,
    `| Avg words | ${d(m.avgWords, b?.avgWords)} |`,
    `| Violations [H] / [L] / [N] / [O] | ${m.violationsByTag["[H]"]} / ${m.violationsByTag["[L]"]} / ${m.violationsByTag["[N]"]} / ${m.violationsByTag["[O]"]} |`,
    `| Fallback outputs | ${m.fallbackOutputs} |`,
    `| Incomplete / errors | ${m.incomplete} / ${m.error} |`,
    "",
    "## By slide type",
    "",
    "| Type | Slides | Pass rate |",
    "|---|---|---|",
    ...Object.entries(card.bySlideType).map(([k, v]) => `| ${k} | ${v.slides} | ${d(v.passRatePct, baseline?.bySlideType?.[k]?.passRatePct, "%")} |`),
    "",
    "## By difficulty",
    "",
    "| Difficulty | Slides | Pass rate |",
    "|---|---|---|",
    ...Object.entries(card.byDifficulty).map(([k, v]) => `| ${k} | ${v.slides} | ${d(v.passRatePct, baseline?.byDifficulty?.[k]?.passRatePct, "%")} |`),
  ];
  if (comparable) {
    lines.push("", "## Versus baseline", "", `- Regressions (passed before, fail now): ${regressions.join(", ") || "none"}`, `- Fixes (failed before, pass now): ${fixes.join(", ") || "none"}`);
  }
  lines.push("", "## Gate", "", gateFailures.length ? gateFailures.map((g) => `- FAIL: ${g}`).join("\n") : "- PASS");
  const failing = slides.filter((s) => s.verdict !== "PASS");
  if (failing.length) {
    lines.push("", "## Slides not passing", "");
    for (const s of failing) {
      lines.push(`### ${s.rowId} #${s.repeat}: ${s.verdict}`, "", `> ${s.narration || "(empty)"}`, "");
      for (const r of s.reasons) lines.push(`- ${r}`);
      lines.push("");
    }
  }
  writeFileSync(path.join(dir, "report.md"), lines.join("\n") + "\n");

  if (args["set-baseline"]) {
    writeFileSync(args.baseline!, JSON.stringify(card, null, 2) + "\n");
  }

  // ---------- print ----------
  console.log(`\nScore: ${runId}`);
  console.log(`  PASS ${m.pass}  FAIL ${m.fail}  INCOMPLETE ${m.incomplete}  ERROR ${m.error}   pass rate ${d(m.passRatePct, b?.passRatePct, "%")}`);
  console.log(`  faithfulness ${d(m.avgFaithfulness, b?.avgFaithfulness)}  style ${d(m.avgStyle, b?.avgStyle)}  full critical coverage ${d(m.fullCriticalCoveragePct, b?.fullCriticalCoveragePct, "%")}`);
  console.log(`  violations [H] ${m.violationsByTag["[H]"]}  [L] ${m.violationsByTag["[L]"]}  [N] ${m.violationsByTag["[N]"]}  [O] ${m.violationsByTag["[O]"]}   fallbacks ${m.fallbackOutputs}`);
  if (comparable) console.log(`  vs baseline ${baseline.runId}: ${regressions.length} regressions, ${fixes.length} fixes`);
  console.log(`  gate: ${gateFailures.length ? `FAIL (${gateFailures.join("; ")})` : "PASS"}`);
  console.log(`  report: ${path.relative(process.cwd(), path.join(dir, "report.md"))}`);
  if (args["set-baseline"]) console.log(`  baseline saved: ${path.relative(process.cwd(), args.baseline!)}`);

  if (args.gate && gateFailures.length) process.exit(1);
}

main();

/**
 * Scorer: combines a run's rules grades and judge grades into one verdict per slide, computes run
 * metrics (quality, violations, length, duration, latency, cost), writes a report comparing the run
 * with the previous run and the baseline, appends it to the history, and optionally gates.
 *
 *   npm run eval:score -w @voxdeck/web                     # score the latest run
 *   npm run eval:score -w @voxdeck/web -- --run <runId>
 *   npm run eval:score -w @voxdeck/web -- --set-baseline   # save this run as evals/baseline.json
 *   npm run eval:score -w @voxdeck/web -- --gate           # exit 1 if the gate fails (CI)
 *
 * Verdict per slide (the pass rule):
 *   PASS        no hard rule failed AND faithfulness >= 4 AND 100% critical coverage AND zero violations
 *   FAIL        any of the above missed (reasons listed)
 *   INCOMPLETE  rules passed but the judge hasn't scored it yet
 *   ERROR       the judge errored on this slide
 *
 * Cost needs prices (USD per 1M tokens) in env: EVAL_NARRATOR_PRICE_IN, EVAL_NARRATOR_PRICE_OUT,
 * EVAL_JUDGE_PRICE_IN, EVAL_JUDGE_PRICE_OUT. Without them only tokens are reported.
 *
 * Writes runs/<runId>/scorecard.json and report.md; appends evals/history.jsonl and rewrites
 * evals/HISTORY.md (one row per scored run).
 */
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import type { JudgeGrade } from "./grade-judge.ts";
import type { RuleResult } from "./rules.ts";
import { latestDataset } from "./paths.ts";

type Row = { id: string; deckId: string; slideType: string; difficulty: string; mustMentionCritical: string[] };
type Dataset = { version: string; rows: Row[] };
type Usage = { calls: number; inputTokens: number; outputTokens: number; ms: number };
type Output = {
  rowId: string;
  repeat: number;
  narration: string;
  wordCount: number;
  estDurationSec?: number;
  durationSec?: number | null;
  isModelOutput: boolean;
  deckLatencyMs?: number;
  deckId: string;
  llm?: Usage;
  split?: string;
};
type RulesGrade = { rowId: string; repeat: number; passRules: boolean; results: RuleResult[] };
type Verdict = "PASS" | "FAIL" | "INCOMPLETE" | "ERROR";
const TAGS = ["[H]", "[L]", "[N]", "[O]"] as const;

export type SlideScore = {
  rowId: string;
  repeat: number;
  deckId: string;
  slideType: string;
  difficulty: string;
  split: string;
  verdict: Verdict;
  reasons: string[];
  faithfulness: number | null;
  style: number | null;
  criticalCoveragePct: number | null;
  optionalCoveragePct: number | null;
  words: number;
  durationSec: number | null;
  durationIsEstimate: boolean;
  llm: Usage;
  tags: string[];
  narration: string;
};

type Metrics = {
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
  avgDurationSec: number | null;
  durationIsEstimate: boolean;
  fallbackOutputs: number;
  violationsByTag: Record<string, number>;
  latency: { avgSlideMs: number | null; p95SlideMs: number | null; avgDeckSec: number | null; slidesRetried: number };
  tokens: { narratorIn: number; narratorOut: number; narratorCalls: number; judgeIn: number; judgeOut: number; judgeCalls: number };
  costUsd: { narrator: number | null; judge: number | null; perSlideNarrator: number | null };
};

export type Scorecard = {
  runId: string;
  label: string;
  scoredAt: string;
  datasetVersion: string;
  datasetSha: string | null;
  split: string;
  pipeline: Record<string, unknown> | null;
  judge: Record<string, unknown> | null;
  metrics: Metrics;
  byDeck: Record<string, { slides: number; passRatePct: number }>;
  bySlideType: Record<string, { slides: number; passRatePct: number; violations: Record<string, number> }>;
  byDifficulty: Record<string, { slides: number; passRatePct: number }>;
  /** Per golden row across repeats. */
  rows: Record<string, { passes: number; repeats: number }>;
  slides: SlideScore[];
};

/** Ship rules. A run fails the gate if any of these is broken. */
export const GATE = {
  /** Faithfulness must never drop vs baseline. */
  maxFaithfulnessDrop: 0,
  /** Pass rate may not drop more than this many points vs baseline. */
  maxPassRateDropPts: 2,
  /** Absolute caps: hallucinations and wrong numbers must stay at 0. */
  maxViolations: { "[H]": 0, "[N]": 0 } as Record<string, number>,
  /** Every output must be a real model narration, every slide judged. */
  maxFallbacks: 0,
  allowIncomplete: false,
  /** Fail if the judge model + prompt version has no human calibration record at >= this agreement. */
  requireCalibratedJudge: false,
  minJudgeAgreementPct: 85,
};

const EVALS = import.meta.dirname;
const { values: args } = parseArgs({
  options: {
    run: { type: "string" },
    runs: { type: "string", default: path.join(EVALS, "runs") },
    dataset: { type: "string", default: latestDataset() },
    baseline: { type: "string", default: path.join(EVALS, "baseline.json") },
    history: { type: "string", default: path.join(EVALS, "history.jsonl") },
    "set-baseline": { type: "boolean", default: false },
    gate: { type: "boolean", default: false },
  },
});

const readJsonl = <T>(p: string): T[] =>
  existsSync(p) ? readFileSync(p, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l) as T) : [];
const readJson = <T>(p: string): T | null => (existsSync(p) ? (JSON.parse(readFileSync(p, "utf8")) as T) : null);
const round = (x: number, d = 2) => Math.round(x * 10 ** d) / 10 ** d;
const avg = (xs: number[]) => (xs.length ? round(xs.reduce((a, b) => a + b, 0) / xs.length) : null);
const pct = (n: number, d: number) => (d ? round((n / d) * 100, 1) : 0);
const p95 = (xs: number[]) => (xs.length ? [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.ceil(xs.length * 0.95) - 1)] : null);
const price = (name: string) => (process.env[name] ? Number(process.env[name]) : null);
const cost = (tin: number, tout: number, pin: number | null, pout: number | null) =>
  pin === null || pout === null ? null : round((tin * pin + tout * pout) / 1e6, 4);

function listRuns(dir: string) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((d) => existsSync(path.join(dir, d, "outputs.jsonl")) && !d.startsWith("golden-selfcheck"))
    .sort((a, b) => statSync(path.join(dir, a)).mtimeMs - statSync(path.join(dir, b)).mtimeMs);
}

function main() {
  for (const f of [".env.local", ".env"]) {
    const p = path.resolve(EVALS, "..", f);
    if (existsSync(p)) process.loadEnvFile(p);
  }
  const dataset = JSON.parse(readFileSync(args.dataset!, "utf8")) as Dataset;
  const rows = new Map(dataset.rows.map((r) => [r.id, r]));

  const runs = listRuns(args.runs!);
  const runId = args.run ?? runs[runs.length - 1];
  if (!runId) throw new Error("No runs found. Run npm run eval:run first.");
  const dir = path.join(args.runs!, runId);

  const outputs = readJsonl<Output>(path.join(dir, "outputs.jsonl"));
  const rules = new Map(readJsonl<RulesGrade>(path.join(dir, "grades-rules.jsonl")).map((g) => [`${g.rowId}#${g.repeat}`, g]));
  const judge = new Map(readJsonl<JudgeGrade>(path.join(dir, "grades-judge.jsonl")).map((g) => [`${g.rowId}#${g.repeat}`, g]));
  const runMeta = readJson<{
    label?: string;
    pipeline?: Record<string, unknown>;
    dataset?: { version?: string; sha256?: string };
    filters?: { split?: string };
  }>(path.join(dir, "run.json"));
  const judgeMeta = readJson<{ judge?: Record<string, unknown>; usage?: Usage }>(path.join(dir, "judge-summary.json"));
  if (!rules.size) console.warn("! No rules grades for this run. Run npm run eval:rules first.");
  if (!judge.size) console.warn("! No judge grades for this run. Run npm run eval:judge first; slides will be INCOMPLETE.");
  if (runMeta?.dataset?.version && runMeta.dataset.version !== dataset.version) {
    throw new Error(`Run used dataset ${runMeta.dataset.version} but scoring against ${dataset.version}.`);
  }
  const split = runMeta?.filters?.split ?? "all";

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
      for (const t of TAGS) if (f.detail.includes(t)) tags.add(t);
    }
    if (j?.faithfulness) {
      const f = j.faithfulness;
      if (f.score < 4) {
        const bad = f.claims.filter((c) => c.supported !== "yes").map((c) => `${c.tag ? `[${c.tag}] ` : ""}${c.claim}`);
        reasons.push(`faithfulness ${f.score}/5: ${bad.join(" | ") || f.reason}`);
      }
      for (const c of f.claims) if (c.supported === "no" && c.tag) tags.add(`[${c.tag}]`);
      if (f.mustNotSayHits.length) {
        reasons.push(`must-not-say: ${f.mustNotSayHits.join(" | ")}`);
        for (const h of f.mustNotSayHits) for (const t of TAGS) if (h.includes(t)) tags.add(t);
      }
    }
    if (j?.coverage && j.criticalCoveragePct !== null && j.criticalCoveragePct < 100) {
      const hit = new Set(j.coverage.critical.filter((c) => c.hit).map((c) => c.item));
      reasons.push(`missed critical: ${row.mustMentionCritical.filter((_, i) => !hit.has(i + 1)).join(" | ")}`);
    }

    let verdict: Verdict;
    if (hardFails.length) verdict = "FAIL";
    else if (j?.error) {
      verdict = "ERROR";
      reasons.push(`judge error: ${j.error}`);
    } else if (!j?.judged) verdict = "INCOMPLETE";
    else verdict = j.judgePass && tags.size === 0 ? "PASS" : "FAIL";
    if (verdict === "FAIL" && !reasons.length && tags.size) reasons.push(`violations: ${[...tags].join(" ")}`);

    const measured = o.durationSec ?? null;
    return {
      rowId: o.rowId,
      repeat: o.repeat,
      deckId: row.deckId,
      slideType: row.slideType,
      difficulty: row.difficulty,
      split: o.split ?? "dev",
      verdict,
      reasons,
      faithfulness: j?.faithfulness?.score ?? null,
      style: j?.style?.score ?? null,
      criticalCoveragePct: j?.criticalCoveragePct ?? null,
      optionalCoveragePct: j?.optionalCoveragePct ?? null,
      words: o.wordCount,
      durationSec: measured ?? o.estDurationSec ?? null,
      durationIsEstimate: measured === null,
      llm: o.llm ?? { calls: 0, inputTokens: 0, outputTokens: 0, ms: 0 },
      tags: [...tags],
      narration: o.narration,
    };
  });

  // ---------- aggregates ----------
  const passRate = (list: SlideScore[]) => pct(list.filter((s) => s.verdict === "PASS").length, list.length);
  const tagCount = (list: SlideScore[]) =>
    Object.fromEntries(TAGS.map((t) => [t, list.filter((s) => s.tags.includes(t)).length]));
  const group = <K extends "deckId" | "difficulty">(key: K) =>
    Object.fromEntries(
      [...new Set(slides.map((s) => s[key]))].sort().map((k) => {
        const list = slides.filter((s) => s[key] === k);
        return [k, { slides: list.length, passRatePct: passRate(list) }];
      }),
    );
  const bySlideType = Object.fromEntries(
    [...new Set(slides.map((s) => s.slideType))].sort().map((k) => {
      const list = slides.filter((s) => s.slideType === k);
      return [k, { slides: list.length, passRatePct: passRate(list), violations: tagCount(list) }];
    }),
  );
  const count = (v: Verdict) => slides.filter((s) => s.verdict === v).length;
  const judged = slides.filter((s) => s.faithfulness !== null);
  const rowsAgg: Scorecard["rows"] = {};
  for (const s of slides) {
    const a = (rowsAgg[s.rowId] ??= { passes: 0, repeats: 0 });
    a.repeats++;
    if (s.verdict === "PASS") a.passes++;
  }
  const slideMs = slides.map((s) => s.llm.ms).filter((x) => x > 0);
  const deckLatencies = [...new Map(outputs.map((o) => [`${o.deckId}#${o.repeat}`, o.deckLatencyMs ?? 0])).values()].filter((x) => x > 0);
  const nIn = slides.reduce((n, s) => n + s.llm.inputTokens, 0);
  const nOut = slides.reduce((n, s) => n + s.llm.outputTokens, 0);
  const ju = judgeMeta?.usage ?? { calls: 0, inputTokens: 0, outputTokens: 0, ms: 0 };
  const narratorCost = cost(nIn, nOut, price("EVAL_NARRATOR_PRICE_IN"), price("EVAL_NARRATOR_PRICE_OUT"));
  const durations = slides.map((s) => s.durationSec).filter((x): x is number => x !== null);

  const metrics: Metrics = {
    slides: slides.length,
    pass: count("PASS"),
    fail: count("FAIL"),
    incomplete: count("INCOMPLETE"),
    error: count("ERROR"),
    passRatePct: passRate(slides),
    avgFaithfulness: avg(judged.map((s) => s.faithfulness!)),
    avgStyle: avg(judged.map((s) => s.style).filter((x): x is number => x !== null)),
    fullCriticalCoveragePct: judged.length
      ? pct(judged.filter((s) => s.criticalCoveragePct === null || s.criticalCoveragePct === 100).length, judged.length)
      : null,
    avgWords: avg(slides.map((s) => s.words)) ?? 0,
    avgDurationSec: avg(durations),
    durationIsEstimate: slides.some((s) => s.durationIsEstimate),
    fallbackOutputs: outputs.filter((o) => !o.isModelOutput).length,
    violationsByTag: tagCount(slides),
    latency: {
      avgSlideMs: avg(slideMs),
      p95SlideMs: p95(slideMs),
      avgDeckSec: deckLatencies.length ? round(avg(deckLatencies)! / 1000, 1) : null,
      slidesRetried: slides.filter((s) => s.llm.calls > 1).length,
    },
    tokens: {
      narratorIn: nIn,
      narratorOut: nOut,
      narratorCalls: slides.reduce((n, s) => n + s.llm.calls, 0),
      judgeIn: ju.inputTokens,
      judgeOut: ju.outputTokens,
      judgeCalls: ju.calls,
    },
    costUsd: {
      narrator: narratorCost,
      judge: cost(ju.inputTokens, ju.outputTokens, price("EVAL_JUDGE_PRICE_IN"), price("EVAL_JUDGE_PRICE_OUT")),
      perSlideNarrator: narratorCost === null || !slides.length ? null : round(narratorCost / slides.length, 5),
    },
  };

  const card: Scorecard = {
    runId,
    label: runMeta?.label ?? "",
    scoredAt: new Date().toISOString(),
    datasetVersion: dataset.version,
    datasetSha: runMeta?.dataset?.sha256 ?? null,
    split,
    pipeline: runMeta?.pipeline ?? null,
    judge: judgeMeta?.judge ?? null,
    metrics,
    byDeck: group("deckId"),
    bySlideType,
    byDifficulty: group("difficulty"),
    rows: rowsAgg,
    slides,
  };

  // ---------- comparisons ----------
  const sameBasis = (other: Scorecard | null): other is Scorecard =>
    Boolean(other && other.runId !== card.runId && other.datasetVersion === card.datasetVersion && other.split === card.split);
  const baseline = readJson<Scorecard>(args.baseline!);
  const previous = (() => {
    const idx = runs.indexOf(runId);
    for (let i = idx - 1; i >= 0; i--) {
      const sc = readJson<Scorecard>(path.join(args.runs!, runs[i], "scorecard.json"));
      if (sameBasis(sc)) return sc;
    }
    return null;
  })();
  // `let` on purpose: a const alias would make TS narrow `baseline` to never below.
  let baselineComparable = false;
  baselineComparable = sameBasis(baseline);
  if (baseline && !baselineComparable && baseline.runId !== card.runId)
    console.warn(`! Baseline is on dataset ${baseline.datasetVersion} / split ${baseline.split}; this run is ${card.datasetVersion} / ${split}. Not comparing.`);
  for (const other of [baseline, previous])
    if (sameBasis(other) && other.datasetSha && card.datasetSha && other.datasetSha !== card.datasetSha)
      console.warn(`! Dataset ${card.datasetVersion} was edited in place since ${other.runId}; bump the version when you change rows.`);

  const flips = (other: Scorecard) => {
    const regressions: string[] = [];
    const fixes: string[] = [];
    for (const [rowId, now] of Object.entries(card.rows)) {
      const before = other.rows[rowId];
      if (!before) continue;
      const was = before.passes === before.repeats;
      const is = now.passes === now.repeats;
      if (was && !is) regressions.push(rowId);
      if (!was && is) fixes.push(rowId);
    }
    return { regressions, fixes };
  };

  // ---------- calibration ----------
  const calib = (() => {
    const model = String(card.judge?.model ?? "");
    const version = String(card.judge?.promptVersion ?? "");
    const file = path.join(EVALS, "calibration", `${model.replace(/[^\w.-]/g, "_")}__${version}.json`);
    const rec = readJson<{ agreement?: { passFailPct?: number }; outputs?: number }>(file);
    return { model, version, found: Boolean(rec), agreementPct: rec?.agreement?.passFailPct ?? null, outputs: rec?.outputs ?? 0 };
  })();
  const calibrated = calib.found && calib.agreementPct !== null && calib.agreementPct >= GATE.minJudgeAgreementPct;

  // ---------- gate ----------
  const gate: string[] = [];
  const b = sameBasis(baseline) ? baseline.metrics : null;
  if (b) {
    if (b.passRatePct - metrics.passRatePct > GATE.maxPassRateDropPts)
      gate.push(`pass rate ${b.passRatePct}% -> ${metrics.passRatePct}% (max drop ${GATE.maxPassRateDropPts} pts)`);
    if (b.avgFaithfulness !== null && metrics.avgFaithfulness !== null && b.avgFaithfulness - metrics.avgFaithfulness > GATE.maxFaithfulnessDrop)
      gate.push(`faithfulness ${b.avgFaithfulness} -> ${metrics.avgFaithfulness} (must not drop)`);
  }
  for (const [t, max] of Object.entries(GATE.maxViolations))
    if ((metrics.violationsByTag[t] ?? 0) > max) gate.push(`${t} violations ${metrics.violationsByTag[t]} (max ${max})`);
  if (metrics.fallbackOutputs > GATE.maxFallbacks) gate.push(`${metrics.fallbackOutputs} fallback outputs (not model narrations)`);
  if (!GATE.allowIncomplete && (metrics.incomplete || metrics.error))
    gate.push(`${metrics.incomplete} incomplete and ${metrics.error} errored slides`);
  if (GATE.requireCalibratedJudge && !calibrated) gate.push(`judge ${calib.model} ${calib.version} is not calibrated against human scores`);

  const vsBaseline = sameBasis(baseline) ? { runId: baseline.runId, ...flips(baseline) } : null;
  const vsPrevious = previous ? { runId: previous.runId, ...flips(previous) } : null;

  writeFileSync(
    path.join(dir, "scorecard.json"),
    JSON.stringify({ ...card, comparison: { vsBaseline, vsPrevious, gate, judgeCalibration: calib } }, null, 2) + "\n",
  );

  // ---------- report ----------
  const P = previous?.metrics ?? null;
  const B = b;
  const fmt = (x: number | null | undefined, unit = "") => (x === null || x === undefined ? "n/a" : `${x}${unit}`);
  const arrow = (before: number | null | undefined, now: number | null, unit = "") =>
    before === null || before === undefined || now === null ? fmt(now, unit) : before === now ? `${fmt(now, unit)} (=)` : `${fmt(before, unit)} → ${fmt(now, unit)}`;
  const tagStr = (v: Record<string, number>) => TAGS.map((t) => `${t} ${v[t] ?? 0}`).join(" · ");
  const m = metrics;
  const L: string[] = [
    `# Narration eval: ${runId}`,
    "",
    `- Label: ${card.label || "(none)"}`,
    `- Narrator: ${String(card.pipeline?.provider ?? "?")} / ${String(card.pipeline?.model ?? "?")}, git ${String(card.pipeline?.gitSha ?? "?")}${card.pipeline?.gitDirty ? " (uncommitted changes)" : ""}`,
    `- Judge: ${String(card.judge?.provider ?? "none")} / ${String(card.judge?.model ?? "")} ${String(card.judge?.promptVersion ?? "")} — ${calibrated ? `calibrated, ${calib.agreementPct}% agreement with humans` : calib.found ? `calibration below ${GATE.minJudgeAgreementPct}% (${calib.agreementPct}%)` : "NOT calibrated against human scores yet"}`,
    `- Dataset: ${card.datasetVersion} (${card.datasetSha ?? "?"}), split: ${split}`,
    `- Previous run: ${previous?.runId ?? "none"} · Baseline: ${B ? baseline!.runId : "none"}`,
    "",
    "## Headline",
    "",
    "| Metric | Previous → now | Baseline |",
    "|---|---|---|",
    `| Pass rate | ${arrow(P?.passRatePct, m.passRatePct, "%")} (${m.pass}/${m.slides}) | ${fmt(B?.passRatePct, "%")} |`,
    `| Avg faithfulness | ${arrow(P?.avgFaithfulness, m.avgFaithfulness)} | ${fmt(B?.avgFaithfulness)} |`,
    `| Full critical coverage | ${arrow(P?.fullCriticalCoveragePct, m.fullCriticalCoveragePct, "%")} | ${fmt(B?.fullCriticalCoveragePct, "%")} |`,
    `| Avg style | ${arrow(P?.avgStyle, m.avgStyle)} | ${fmt(B?.avgStyle)} |`,
    ...TAGS.map((t) => `| Violations ${t} | ${arrow(P?.violationsByTag[t], m.violationsByTag[t])} | ${fmt(B?.violationsByTag[t])} |`),
    `| Avg length (words) | ${arrow(P?.avgWords, m.avgWords)} | ${fmt(B?.avgWords)} |`,
    `| Avg duration${m.durationIsEstimate ? " (est. 150 wpm)" : ""} | ${arrow(P?.avgDurationSec, m.avgDurationSec, "s")} | ${fmt(B?.avgDurationSec, "s")} |`,
    `| Avg LLM time per slide | ${arrow(P?.latency.avgSlideMs, m.latency.avgSlideMs, "ms")} (p95 ${fmt(m.latency.p95SlideMs, "ms")}) | ${fmt(B?.latency.avgSlideMs, "ms")} |`,
    `| Avg deck generation | ${arrow(P?.latency.avgDeckSec, m.latency.avgDeckSec, "s")} | ${fmt(B?.latency.avgDeckSec, "s")} |`,
    `| Slides needing a retry | ${arrow(P?.latency.slidesRetried, m.latency.slidesRetried)} | ${fmt(B?.latency.slidesRetried)} |`,
    `| Narrator tokens in / out | ${m.tokens.narratorIn} / ${m.tokens.narratorOut} (${m.tokens.narratorCalls} calls) | |`,
    `| Narrator cost | ${m.costUsd.narrator === null ? "set EVAL_NARRATOR_PRICE_IN/OUT" : `$${m.costUsd.narrator} ($${m.costUsd.perSlideNarrator}/slide)`} | ${B?.costUsd.narrator == null ? "" : `$${B.costUsd.narrator}`} |`,
    `| Judge tokens / cost | ${m.tokens.judgeIn} / ${m.tokens.judgeOut} (${m.tokens.judgeCalls} calls)${m.costUsd.judge === null ? "" : `, $${m.costUsd.judge}`} | |`,
    `| Fallback outputs | ${arrow(P?.fallbackOutputs, m.fallbackOutputs)} | ${fmt(B?.fallbackOutputs)} |`,
    `| Incomplete / errors | ${m.incomplete} / ${m.error} | |`,
    "",
    "## By slide type",
    "",
    "| Type | Slides | Pass rate (previous → now) | Violations |",
    "|---|---|---|---|",
    ...Object.entries(card.bySlideType).map(([k, v]) => {
      const pv = previous?.bySlideType?.[k];
      const vio = TAGS.filter((t) => (v.violations[t] ?? 0) || (pv?.violations?.[t] ?? 0))
        .map((t) => `${t} ${arrow(pv?.violations?.[t], v.violations[t] ?? 0)}`)
        .join(", ");
      return `| ${k} | ${v.slides} | ${arrow(pv?.passRatePct, v.passRatePct, "%")} | ${vio || "none"} |`;
    }),
    "",
    "## By difficulty",
    "",
    "| Difficulty | Slides | Pass rate (previous → now) |",
    "|---|---|---|",
    ...Object.entries(card.byDifficulty).map(([k, v]) => `| ${k} | ${v.slides} | ${arrow(previous?.byDifficulty?.[k]?.passRatePct, v.passRatePct, "%")} |`),
    "",
    "## What changed",
    "",
    vsPrevious ? `- vs previous (${vsPrevious.runId}): regressions ${vsPrevious.regressions.join(", ") || "none"}; fixes ${vsPrevious.fixes.join(", ") || "none"}` : "- vs previous: no earlier run on the same dataset and split",
    vsBaseline ? `- vs baseline (${vsBaseline.runId}): regressions ${vsBaseline.regressions.join(", ") || "none"}; fixes ${vsBaseline.fixes.join(", ") || "none"}` : "- vs baseline: none set (npm run eval:score -- --set-baseline)",
    "",
    "## Gate",
    "",
    gate.length ? gate.map((g) => `- FAIL: ${g}`).join("\n") : "- PASS",
  ];
  const failing = slides.filter((s) => s.verdict !== "PASS");
  if (failing.length) {
    L.push("", "## Slides not passing", "");
    for (const s of failing) {
      L.push(`### ${s.rowId} #${s.repeat}: ${s.verdict}${s.tags.length ? ` ${s.tags.join(" ")}` : ""}`, "", `> ${s.narration || "(empty)"}`, "");
      for (const r of s.reasons) L.push(`- ${r}`);
      L.push("");
    }
  }
  writeFileSync(path.join(dir, "report.md"), L.join("\n") + "\n");

  // ---------- history (results store across runs) ----------
  const entry = {
    runId,
    label: card.label,
    scoredAt: card.scoredAt,
    dataset: `${card.datasetVersion}@${card.datasetSha ?? "?"}`,
    split,
    narrator: `${String(card.pipeline?.provider ?? "?")}/${String(card.pipeline?.model ?? "?")}`,
    git: String(card.pipeline?.gitSha ?? "?") + (card.pipeline?.gitDirty ? "*" : ""),
    judge: `${String(card.judge?.model ?? "none")} ${String(card.judge?.promptVersion ?? "")}`.trim(),
    passRatePct: m.passRatePct,
    avgFaithfulness: m.avgFaithfulness,
    fullCriticalCoveragePct: m.fullCriticalCoveragePct,
    avgStyle: m.avgStyle,
    violations: m.violationsByTag,
    avgWords: m.avgWords,
    avgSlideMs: m.latency.avgSlideMs,
    narratorCostUsd: m.costUsd.narrator,
    fallbacks: m.fallbackOutputs,
    gate: gate.length ? "FAIL" : "PASS",
  };
  const history = readJsonl<typeof entry>(args.history!).filter((h) => h.runId !== runId);
  history.push(entry);
  history.sort((a, b2) => a.runId.localeCompare(b2.runId));
  writeFileSync(args.history!, history.map((h) => JSON.stringify(h)).join("\n") + "\n");
  const H = [
    "# Narration eval history",
    "",
    "One row per scored run (newest last). Generated by `npm run eval:score`; details in each run's `report.md`.",
    "",
    "| Run | Label | Dataset / split | Narrator | Git | Pass | Faith. | Crit. cov. | Style | [H] [L] [N] [O] | Words | ms/slide | Cost | Gate |",
    "|---|---|---|---|---|---|---|---|---|---|---|---|---|---|",
    ...history.map(
      (h) =>
        `| ${h.runId} | ${h.label || ""} | ${h.dataset} / ${h.split} | ${h.narrator} | ${h.git} | ${h.passRatePct}% | ${fmt(h.avgFaithfulness)} | ${fmt(h.fullCriticalCoveragePct, "%")} | ${fmt(h.avgStyle)} | ${TAGS.map((t) => h.violations[t] ?? 0).join(" ")} | ${h.avgWords} | ${fmt(h.avgSlideMs)} | ${h.narratorCostUsd === null ? "" : `$${h.narratorCostUsd}`} | ${h.gate} |`,
    ),
  ];
  writeFileSync(path.join(EVALS, "HISTORY.md"), H.join("\n") + "\n");

  if (args["set-baseline"]) writeFileSync(args.baseline!, JSON.stringify(card, null, 2) + "\n");

  // ---------- print ----------
  console.log(`\nScore: ${runId}  (dataset ${card.datasetVersion}, split ${split})`);
  console.log(`  PASS ${m.pass}  FAIL ${m.fail}  INCOMPLETE ${m.incomplete}  ERROR ${m.error}   pass rate ${arrow(P?.passRatePct, m.passRatePct, "%")}`);
  console.log(`  faithfulness ${arrow(P?.avgFaithfulness, m.avgFaithfulness)}  style ${arrow(P?.avgStyle, m.avgStyle)}  full critical coverage ${arrow(P?.fullCriticalCoveragePct, m.fullCriticalCoveragePct, "%")}`);
  console.log(`  violations ${tagStr(m.violationsByTag)}   fallbacks ${m.fallbackOutputs}`);
  console.log(`  words ${m.avgWords}  duration ${fmt(m.avgDurationSec, "s")}${m.durationIsEstimate ? " (est.)" : ""}  LLM ${fmt(m.latency.avgSlideMs, "ms")}/slide  retries ${m.latency.slidesRetried}  tokens ${m.tokens.narratorIn}/${m.tokens.narratorOut}${m.costUsd.narrator === null ? "" : `  $${m.costUsd.narrator}`}`);
  if (vsPrevious) console.log(`  vs previous: ${vsPrevious.regressions.length} regressions, ${vsPrevious.fixes.length} fixes`);
  if (vsBaseline) console.log(`  vs baseline: ${vsBaseline.regressions.length} regressions, ${vsBaseline.fixes.length} fixes`);
  if (!calibrated) console.log(`  ! judge not calibrated against human scores (npm run eval:calibrate)`);
  console.log(`  gate: ${gate.length ? `FAIL\n    - ${gate.join("\n    - ")}` : "PASS"}`);
  console.log(`  report: ${path.relative(process.cwd(), path.join(dir, "report.md"))}`);
  if (args["set-baseline"]) console.log(`  baseline saved: ${path.relative(process.cwd(), args.baseline!)}`);

  if (args.gate && gate.length) process.exit(1);
}

main();

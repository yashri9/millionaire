/**
 * Rules grader: reads a runner output and applies the deterministic rules in rules.ts.
 *
 *   npm run eval:rules -w @voxdeck/web                     # grade the latest run
 *   npm run eval:rules -w @voxdeck/web -- --run <runId>    # grade a specific run
 *   npm run eval:rules -w @voxdeck/web -- --golden         # self-check: grade the golden scripts
 *   npm run eval:rules -w @voxdeck/web -- --fail-on-hard   # exit 1 if any slide fails (CI)
 *
 * Writes runs/<runId>/grades-rules.jsonl and rules-summary.json, and prints a scorecard.
 * Grounding always uses the golden visible slide text, never the OCR text the run used,
 * so an OCR mistake that leads to a wrong number still counts as wrong.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { gradeDeckRepetition, gradeRules, passesRules, type RuleId, type RuleResult } from "./rules.ts";

type Row = {
  id: string;
  deckId: string;
  slideType: string;
  difficulty: string;
  slideText: string;
  slideLines: string[];
  goldenScript: string;
  bannedTerms?: string[];
};
type Dataset = { version: string; decks: Record<string, { companyName: string }>; rows: Row[] };
type Output = {
  rowId: string;
  deckId: string;
  repeat: number;
  narration: string;
  isModelOutput: boolean;
  error: string | null;
  wordCount: number;
  durationSec?: number | null;
};

const EVALS = import.meta.dirname;
const { values: args } = parseArgs({
  options: {
    run: { type: "string" },
    runs: { type: "string", default: path.join(EVALS, "runs") },
    dataset: { type: "string", default: path.join(EVALS, "golden", "narration-v2.json") },
    golden: { type: "boolean", default: false },
    "fail-on-hard": { type: "boolean", default: false },
    quiet: { type: "boolean", default: false },
  },
});

const dataset = JSON.parse(readFileSync(args.dataset!, "utf8")) as Dataset;
const rowsById = new Map(dataset.rows.map((r) => [r.id, r]));
const visibleText = (r: Row) => (r.slideLines?.length ? r.slideLines.join("\n") : r.slideText);
const words = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;

// ---------- load outputs ----------
let runId: string;
let outDir: string;
let outputs: Output[];

if (args.golden) {
  runId = `golden-selfcheck_${dataset.version}`;
  outDir = path.join(args.runs!, runId);
  outputs = dataset.rows.map((r) => ({
    rowId: r.id,
    deckId: r.deckId,
    repeat: 1,
    narration: r.goldenScript,
    isModelOutput: true,
    error: null,
    wordCount: words(r.goldenScript),
  }));
} else {
  const runs = existsSync(args.runs!)
    ? readdirSync(args.runs!).filter(
        (d) => existsSync(path.join(args.runs!, d, "outputs.jsonl")) && !d.startsWith("golden-selfcheck"),
      )
    : [];
  runId =
    args.run ??
    runs.sort((a, b) => statSync(path.join(args.runs!, b)).mtimeMs - statSync(path.join(args.runs!, a)).mtimeMs)[0];
  if (!runId) throw new Error(`No runs found in ${args.runs}. Run npm run eval:run first.`);
  outDir = path.join(args.runs!, runId);
  outputs = readFileSync(path.join(outDir, "outputs.jsonl"), "utf8")
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l) as Output);
}

// ---------- grade ----------
type Graded = Output & { slideType: string; difficulty: string; passRules: boolean; results: RuleResult[] };
const graded: Graded[] = [];

const groups = new Map<string, Output[]>(); // deck + repeat, for repetition
for (const o of outputs) {
  const k = `${o.deckId}#${o.repeat}`;
  groups.set(k, [...(groups.get(k) ?? []), o]);
}

for (const [, group] of groups) {
  const rep = gradeDeckRepetition(group.map((o) => ({ key: o.rowId, narration: o.narration })));
  for (const o of group) {
    const row = rowsById.get(o.rowId);
    if (!row) throw new Error(`Output row ${o.rowId} is not in dataset ${dataset.version}`);
    const others = dataset.rows
      .filter((r) => r.deckId === row.deckId && r.id !== row.id)
      .map((r) => ({ rowId: r.id, slideText: visibleText(r) }));
    const results = gradeRules({
      narration: o.narration,
      isModelOutput: o.isModelOutput,
      error: o.error,
      wordCount: o.wordCount ?? words(o.narration),
      durationSec: o.durationSec ?? null,
      slideText: visibleText(row),
      otherSlides: others,
      deckTitle: dataset.decks[row.deckId]?.companyName ?? row.deckId,
      bannedTerms: row.bannedTerms ?? [],
    });
    if (o.narration.trim()) results.push(rep.get(o.rowId)!);
    graded.push({ ...o, slideType: row.slideType, difficulty: row.difficulty, passRules: passesRules(results), results });
  }
}

// ---------- summarise ----------
const byRule = new Map<RuleId, Record<string, number>>();
for (const g of graded)
  for (const x of g.results) {
    const c = byRule.get(x.rule) ?? { pass: 0, fail: 0, warn: 0, skip: 0 };
    c[x.status]++;
    byRule.set(x.rule, c);
  }
const passRate = (list: Graded[]) => (list.length ? Math.round((list.filter((g) => g.passRules).length / list.length) * 100) : 0);
const groupRate = (key: "slideType" | "difficulty" | "deckId") =>
  Object.fromEntries(
    [...new Set(graded.map((g) => g[key]))].map((k) => {
      const list = graded.filter((g) => g[key] === k);
      return [k, { slides: list.length, passRate: passRate(list) }];
    }),
  );
const tagCounts = { "[H]": 0, "[L]": 0, "[N]": 0 };
for (const g of graded)
  for (const x of g.results)
    if (x.status === "fail") for (const t of Object.keys(tagCounts) as (keyof typeof tagCounts)[]) if (x.detail.includes(t)) tagCounts[t]++;

const summary = {
  runId,
  datasetVersion: dataset.version,
  gradedAt: new Date().toISOString(),
  outputs: graded.length,
  passRules: graded.filter((g) => g.passRules).length,
  passRatePct: passRate(graded),
  violationsByTag: tagCounts,
  byRule: Object.fromEntries(byRule),
  byDeck: groupRate("deckId"),
  bySlideType: groupRate("slideType"),
  byDifficulty: groupRate("difficulty"),
  failures: graded
    .filter((g) => !g.passRules)
    .map((g) => ({
      rowId: g.rowId,
      repeat: g.repeat,
      failed: g.results.filter((x) => x.hard && x.status === "fail").map((x) => `${x.rule}: ${x.detail}`),
    })),
};

mkdirSync(outDir, { recursive: true });
writeFileSync(
  path.join(outDir, "grades-rules.jsonl"),
  graded
    .map((g) => JSON.stringify({ rowId: g.rowId, repeat: g.repeat, passRules: g.passRules, results: g.results }))
    .join("\n") + "\n",
);
writeFileSync(path.join(outDir, "rules-summary.json"), JSON.stringify(summary, null, 2) + "\n");

// ---------- print ----------
console.log(`\nRules grade: ${runId}  (dataset ${dataset.version})`);
console.log(`  ${summary.passRules}/${summary.outputs} slides pass the rules (${summary.passRatePct}%)`);
console.log(`  violations: [H] ${tagCounts["[H]"]}  [L] ${tagCounts["[L]"]}  [N] ${tagCounts["[N]"]}\n`);
console.log("  rule             pass  fail  warn  skip");
for (const [rule, c] of byRule)
  console.log(`  ${rule.padEnd(16)} ${String(c.pass).padStart(4)}  ${String(c.fail).padStart(4)}  ${String(c.warn).padStart(4)}  ${String(c.skip).padStart(4)}`);
if (!args.quiet) {
  if (summary.failures.length) {
    console.log("\n  Failures:");
    for (const f of summary.failures) console.log(`   ${f.rowId}#${f.repeat}  ${f.failed.join(" | ")}`);
  }
  const warns = graded.flatMap((g) => g.results.filter((x) => x.status === "warn").map((x) => `${g.rowId}#${g.repeat}  ${x.rule}: ${x.detail}`));
  if (warns.length) {
    console.log("\n  Warnings:");
    for (const w of warns) console.log(`   ${w}`);
  }
}
console.log(`\n  saved to ${path.relative(process.cwd(), outDir)}/rules-summary.json`);

if (args["fail-on-hard"] && summary.failures.length) process.exit(1);

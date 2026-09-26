/**
 * Judge calibration: do the LLM judge's verdicts agree with a human's?
 *
 * 1. Export a blind sheet (no judge scores in it) from one or more judged runs:
 *      npm run eval:calibrate -w @voxdeck/web -- export --n 40
 *      npm run eval:calibrate -w @voxdeck/web -- export --run <runId> --n 40
 *    -> evals/calibration/sheet_<judge>__<promptVersion>_<date>.csv  (+ a hidden .key.json)
 *
 * 2. A human fills three columns per row in any spreadsheet app, then saves as CSV:
 *      human_faithfulness_1_5, human_critical_all_hit (y/n), human_pass (y/n)
 *
 * 3. Compare:
 *      npm run eval:calibrate -w @voxdeck/web -- compare --sheet evals/calibration/sheet_....csv
 *    -> evals/calibration/<judgeModel>__<promptVersion>.json (read by eval:score and the gate)
 *
 * Re-run whenever the judge model or a judge prompt (JUDGE_PROMPT_VERSION) changes.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import type { JudgeGrade } from "./grade-judge.ts";
import { latestDataset } from "./paths.ts";

const EVALS = import.meta.dirname;
const CAL = path.join(EVALS, "calibration");
const { positionals, values: args } = parseArgs({
  allowPositionals: true,
  options: {
    run: { type: "string", multiple: true },
    runs: { type: "string", default: path.join(EVALS, "runs") },
    dataset: { type: "string", default: latestDataset() },
    n: { type: "string", default: "40" },
    sheet: { type: "string" },
    min: { type: "string", default: "85" },
  },
});

type Row = { id: string; slideLines: string[]; slideText: string; mustMentionCritical: string[]; mustNotSay: string[] };
type Output = { rowId: string; repeat: number; narration: string };
type KeyEntry = { sampleId: string; runId: string; rowId: string; repeat: number; judge: { faithfulness: number; criticalAllHit: boolean; pass: boolean } };
type Key = { judge: { provider: string; model: string; promptVersion: string }; createdAt: string; samples: KeyEntry[] };

// ---------- CSV ----------
const cell = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { row.push(field); field = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some((f) => f !== "")) rows.push(row);
      row = [];
    } else field += ch;
  }
  row.push(field);
  if (row.some((f) => f !== "")) rows.push(row);
  return rows;
}

// ---------- stats ----------
/** Cohen's kappa for two binary raters. */
export function cohensKappa(pairs: [boolean, boolean][]): number | null {
  const n = pairs.length;
  if (!n) return null;
  const agree = pairs.filter(([a, b]) => a === b).length / n;
  const pa = pairs.filter(([a]) => a).length / n;
  const pb = pairs.filter(([, b]) => b).length / n;
  const chance = pa * pb + (1 - pa) * (1 - pb);
  return chance === 1 ? 1 : Math.round(((agree - chance) / (1 - chance)) * 100) / 100;
}

function judgeTag(j: { provider?: unknown; model?: unknown; promptVersion?: unknown }) {
  return `${String(j.model ?? "unknown").replace(/[^\w.-]/g, "_")}__${String(j.promptVersion ?? "unknown")}`;
}

// ---------- export ----------
function exportSheet() {
  const dataset = JSON.parse(readFileSync(args.dataset!, "utf8")) as { rows: Row[] };
  const rows = new Map(dataset.rows.map((r) => [r.id, r]));
  const available = existsSync(args.runs!)
    ? readdirSync(args.runs!).filter((d) => existsSync(path.join(args.runs!, d, "grades-judge.jsonl")) && !d.startsWith("golden-selfcheck"))
    : [];
  const runIds = args.run?.length
    ? args.run
    : available.sort((a, b) => statSync(path.join(args.runs!, b)).mtimeMs - statSync(path.join(args.runs!, a)).mtimeMs).slice(0, 1);
  if (!runIds.length) throw new Error("No judged runs found. Run eval:judge first.");

  let judgeInfo: Key["judge"] | null = null;
  const pool: (KeyEntry & { narration: string })[] = [];
  for (const runId of runIds) {
    const dir = path.join(args.runs!, runId);
    const summary = JSON.parse(readFileSync(path.join(dir, "judge-summary.json"), "utf8")) as { judge: Key["judge"] };
    if (judgeInfo && judgeTag(judgeInfo) !== judgeTag(summary.judge)) throw new Error("Runs were judged by different judges/prompt versions; export them separately.");
    judgeInfo = summary.judge;
    const outputs = new Map(
      readFileSync(path.join(dir, "outputs.jsonl"), "utf8").split("\n").filter(Boolean).map((l) => {
        const o = JSON.parse(l) as Output;
        return [`${o.rowId}#${o.repeat}`, o];
      }),
    );
    for (const l of readFileSync(path.join(dir, "grades-judge.jsonl"), "utf8").split("\n").filter(Boolean)) {
      const g = JSON.parse(l) as JudgeGrade;
      if (!g.judged || !g.faithfulness) continue;
      pool.push({
        sampleId: "",
        runId,
        rowId: g.rowId,
        repeat: g.repeat,
        narration: outputs.get(`${g.rowId}#${g.repeat}`)?.narration ?? "",
        judge: {
          faithfulness: g.faithfulness.score,
          criticalAllHit: g.criticalCoveragePct === null || g.criticalCoveragePct === 100,
          pass: Boolean(g.judgePass),
        },
      });
    }
  }

  // Balance judge-pass and judge-fail so disagreement in both directions shows up; order is fixed by hash.
  const n = Math.max(1, Number(args.n) || 40);
  const order = (e: KeyEntry) => createHash("sha256").update(`${e.runId}|${e.rowId}|${e.repeat}`).digest("hex");
  const fails = pool.filter((e) => !e.judge.pass).sort((a, b) => order(a).localeCompare(order(b)));
  const passes = pool.filter((e) => e.judge.pass).sort((a, b) => order(a).localeCompare(order(b)));
  const takeFails = Math.min(fails.length, Math.ceil(n / 2));
  const sample = [...fails.slice(0, takeFails), ...passes.slice(0, n - takeFails)]
    .sort((a, b) => order(a).localeCompare(order(b)))
    .map((e, i) => ({ ...e, sampleId: `S${String(i + 1).padStart(3, "0")}` }));
  if (sample.length < 30) console.warn(`! Only ${sample.length} judged outputs available; aim for 30-50. Add more runs with --run.`);

  mkdirSync(CAL, { recursive: true });
  const stamp = new Date().toISOString().slice(0, 10);
  const base = `sheet_${judgeTag(judgeInfo!)}_${stamp}`;
  const header = ["sample_id", "row_id", "slide_text", "critical_items", "must_not_say", "narration", "human_faithfulness_1_5", "human_critical_all_hit", "human_pass", "notes"];
  const lines = [header.map(cell).join(",")];
  for (const s of sample) {
    const row = rows.get(s.rowId)!;
    lines.push(
      [
        s.sampleId,
        s.rowId,
        row.slideLines?.join("\n") || row.slideText,
        row.mustMentionCritical.map((m, i) => `${i + 1}. ${m}`).join("\n"),
        row.mustNotSay.join("\n"),
        s.narration,
        "",
        "",
        "",
        "",
      ]
        .map(cell)
        .join(","),
    );
  }
  writeFileSync(path.join(CAL, `${base}.csv`), lines.join("\n") + "\n");
  const key: Key = { judge: judgeInfo!, createdAt: new Date().toISOString(), samples: sample.map(({ narration: _n, ...k }) => k) };
  writeFileSync(path.join(CAL, `${base}.key.json`), JSON.stringify(key, null, 2) + "\n");
  console.log(`Exported ${sample.length} samples (${takeFails} judge-fail, ${sample.length - takeFails} judge-pass) from ${runIds.join(", ")}`);
  console.log(`  sheet: ${path.relative(process.cwd(), path.join(CAL, `${base}.csv`))}`);
  console.log("  Fill human_faithfulness_1_5, human_critical_all_hit (y/n), human_pass (y/n) without looking at the judge's scores, then run compare.");
}

// ---------- compare ----------
function compare() {
  if (!args.sheet) throw new Error("compare needs --sheet <path to the filled CSV>");
  const keyPath = args.sheet.replace(/\.csv$/, ".key.json");
  if (!existsSync(keyPath)) throw new Error(`Missing key file ${keyPath} (created by export).`);
  const key = JSON.parse(readFileSync(keyPath, "utf8")) as Key;
  const [header, ...body] = parseCsv(readFileSync(args.sheet, "utf8"));
  const col = (name: string) => {
    const i = header.indexOf(name);
    if (i < 0) throw new Error(`Sheet is missing column ${name}`);
    return i;
  };
  const [cId, cF, cC, cP] = ["sample_id", "human_faithfulness_1_5", "human_critical_all_hit", "human_pass"].map(col);
  const yes = (v: string) => /^(y|yes|true|1|pass)$/i.test(v.trim());
  const filled = (v: string) => v.trim() !== "";

  const byId = new Map(key.samples.map((s) => [s.sampleId, s]));
  const rows = body
    .filter((r) => filled(r[cP] ?? ""))
    .map((r) => ({ s: byId.get(r[cId])!, hF: Number(r[cF]), hC: yes(r[cC] ?? ""), hP: yes(r[cP]) }))
    .filter((x) => x.s);
  if (!rows.length) throw new Error("No rows with human_pass filled in.");

  const pairsPass: [boolean, boolean][] = rows.map((x) => [x.hP, x.s.judge.pass]);
  const pairsCov: [boolean, boolean][] = rows.map((x) => [x.hC, x.s.judge.criticalAllHit]);
  const withF = rows.filter((x) => Number.isFinite(x.hF) && x.hF >= 1 && x.hF <= 5);
  const pctOf = (k: number, n: number) => (n ? Math.round((k / n) * 1000) / 10 : null);

  const result = {
    judge: key.judge,
    comparedAt: new Date().toISOString(),
    sheet: path.relative(EVALS, args.sheet),
    outputs: rows.length,
    agreement: {
      passFailPct: pctOf(pairsPass.filter(([a, b]) => a === b).length, rows.length),
      passFailKappa: cohensKappa(pairsPass),
      criticalCoveragePct: pctOf(pairsCov.filter(([a, b]) => a === b).length, rows.length),
      faithfulnessExactPct: pctOf(withF.filter((x) => x.hF === x.s.judge.faithfulness).length, withF.length),
      faithfulnessWithin1Pct: pctOf(withF.filter((x) => Math.abs(x.hF - x.s.judge.faithfulness) <= 1).length, withF.length),
      faithfulnessMeanDiff: withF.length
        ? Math.round((withF.reduce((a, x) => a + (x.s.judge.faithfulness - x.hF), 0) / withF.length) * 100) / 100
        : null,
    },
    confusion: {
      bothPass: pairsPass.filter(([h, j]) => h && j).length,
      bothFail: pairsPass.filter(([h, j]) => !h && !j).length,
      judgeTooLenient: pairsPass.filter(([h, j]) => !h && j).length,
      judgeTooStrict: pairsPass.filter(([h, j]) => h && !j).length,
    },
    disagreements: rows
      .filter((x) => x.hP !== x.s.judge.pass || (Number.isFinite(x.hF) && Math.abs(x.hF - x.s.judge.faithfulness) > 1))
      .map((x) => ({ sampleId: x.s.sampleId, runId: x.s.runId, rowId: x.s.rowId, human: { pass: x.hP, faithfulness: x.hF }, judge: x.s.judge })),
  };
  mkdirSync(CAL, { recursive: true });
  const out = path.join(CAL, `${judgeTag(key.judge)}.json`);
  writeFileSync(out, JSON.stringify(result, null, 2) + "\n");

  const a = result.agreement;
  const ok = (a.passFailPct ?? 0) >= Number(args.min);
  console.log(`Calibration: ${key.judge.model} ${key.judge.promptVersion} on ${rows.length} outputs`);
  console.log(`  pass/fail agreement ${a.passFailPct}% (kappa ${a.passFailKappa})  critical coverage ${a.criticalCoveragePct}%`);
  console.log(`  faithfulness exact ${a.faithfulnessExactPct}%, within 1 point ${a.faithfulnessWithin1Pct}%, judge minus human ${a.faithfulnessMeanDiff}`);
  console.log(`  judge too lenient on ${result.confusion.judgeTooLenient}, too strict on ${result.confusion.judgeTooStrict}`);
  if (rows.length < 30) console.log(`  ! only ${rows.length} scored outputs; 30-50 gives a trustworthy number`);
  console.log(`  ${ok ? "TRUSTWORTHY" : "NOT TRUSTWORTHY YET"} (threshold ${args.min}%). Saved ${path.relative(process.cwd(), out)}`);
  if (!ok) console.log("  Read the disagreements in that file, tighten the judge prompt, bump JUDGE_PROMPT_VERSION, re-judge and recalibrate.");
}

if (import.meta.filename === path.resolve(process.argv[1] ?? "")) {
  const cmd = positionals[0];
  if (cmd === "export") exportSheet();
  else if (cmd === "compare") compare();
  else {
    console.error("Usage: eval:calibrate -- export [--run <runId>...] [--n 40]  |  compare --sheet <filled.csv>");
    process.exit(1);
  }
}

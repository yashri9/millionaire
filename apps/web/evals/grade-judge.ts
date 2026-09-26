/**
 * LLM judge grader: scores a run's narrations for faithfulness, coverage and style.
 *
 *   npm run eval:judge -w @voxdeck/web                    # latest run, slides that passed the rules
 *   npm run eval:judge -w @voxdeck/web -- --all           # judge every slide, even rule failures
 *   npm run eval:judge -w @voxdeck/web -- --with-image    # attach the slide image (Anthropic judge only)
 *   npm run eval:judge -w @voxdeck/web -- --golden        # judge the golden scripts (calibration check)
 *   npm run eval:judge -w @voxdeck/web -- --no-cache      # ignore cached judgments (e.g. after changing the judge)
 *
 * Judge model: JUDGE_PROVIDER (anthropic | groq | xai | openai), JUDGE_MODEL, JUDGE_API_KEY,
 * JUDGE_BASE_URL. Defaults to Anthropic when ANTHROPIC_API_KEY is set. Results are cached in
 * .cache/judge, so re-running costs nothing unless the narration, prompt or judge model changed.
 *
 * Writes runs/<runId>/grades-judge.jsonl and judge-summary.json.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import type { z } from "zod";
import {
  COVERAGE_SYSTEM,
  CoverageSchema,
  FAITHFULNESS_SYSTEM,
  FaithfulnessSchema,
  JUDGE_PROMPT_VERSION,
  STYLE_SYSTEM,
  StyleSchema,
  callJudge,
  coveragePct,
  coverageUser,
  faithfulnessUser,
  judgeConfigFromEnv,
  judgePasses,
  parseJudgeReply,
  styleUser,
  type Coverage,
  type Faithfulness,
  type JudgeCase,
  type JudgeConfig,
  type Style,
} from "./judge.ts";

type Row = {
  id: string;
  deckId: string;
  slideType: string;
  difficulty: string;
  slideText: string;
  slideLines: string[];
  slideImagePath: string;
  goldenScript: string;
  mustMentionCritical: string[];
  mustMentionOptional: string[];
  mustNotSay: string[];
};
type Dataset = { version: string; decks: Record<string, { companyName: string }>; rows: Row[] };
type Output = { rowId: string; deckId: string; repeat: number; narration: string };

export type JudgeGrade = {
  rowId: string;
  repeat: number;
  judged: boolean;
  skippedReason: string | null;
  faithfulness: Faithfulness | null;
  coverage: Coverage | null;
  style: Style | null;
  criticalCoveragePct: number | null;
  optionalCoveragePct: number | null;
  judgePass: boolean | null;
  error: string | null;
};

const EVALS = import.meta.dirname;
const WEB_ROOT = path.resolve(EVALS, "..");
for (const f of [".env.local", ".env"]) {
  const p = path.join(WEB_ROOT, f);
  if (existsSync(p)) process.loadEnvFile(p);
}

const { values: args } = parseArgs({
  options: {
    run: { type: "string" },
    runs: { type: "string", default: path.join(EVALS, "runs") },
    dataset: { type: "string", default: path.join(EVALS, "golden", "narration-v2.json") },
    golden: { type: "boolean", default: false },
    all: { type: "boolean", default: false },
    "with-image": { type: "boolean", default: false },
    concurrency: { type: "string", default: "4" },
    "no-cache": { type: "boolean", default: false },
  },
});

const dataset = JSON.parse(readFileSync(args.dataset!, "utf8")) as Dataset;
const rowsById = new Map(dataset.rows.map((r) => [r.id, r]));
const cfg = judgeConfigFromEnv();
if (!cfg) {
  console.error(
    "No judge model configured. Set ANTHROPIC_API_KEY (default judge), or JUDGE_PROVIDER + JUDGE_MODEL + JUDGE_API_KEY.",
  );
  process.exit(1);
}
const judge: JudgeConfig = cfg;

// ---------- locate run ----------
let runId: string;
let outputs: Output[];
if (args.golden) {
  runId = `golden-selfcheck_${dataset.version}`;
  outputs = dataset.rows.map((r) => ({ rowId: r.id, deckId: r.deckId, repeat: 1, narration: r.goldenScript }));
} else {
  const all = existsSync(args.runs!)
    ? readdirSync(args.runs!).filter((d) => existsSync(path.join(args.runs!, d, "outputs.jsonl")) && !d.startsWith("golden-selfcheck"))
    : [];
  runId = args.run ?? all.sort((a, b) => statSync(path.join(args.runs!, b)).mtimeMs - statSync(path.join(args.runs!, a)).mtimeMs)[0];
  if (!runId) throw new Error("No runs found. Run npm run eval:run first.");
  outputs = readFileSync(path.join(args.runs!, runId, "outputs.jsonl"), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
}
const outDir = path.join(args.runs!, runId);
mkdirSync(outDir, { recursive: true });

// Narrator identity, to warn about self-grading.
const runMetaPath = path.join(outDir, "run.json");
if (existsSync(runMetaPath)) {
  const meta = JSON.parse(readFileSync(runMetaPath, "utf8")) as { pipeline?: { model?: string } };
  if (meta.pipeline?.model && meta.pipeline.model === judge.model) {
    console.warn(`! Judge model (${judge.model}) is the narrator model. Scores will be biased; set JUDGE_MODEL to a different model.`);
  }
}

// Only judge slides that passed the hard rules, unless --all or no rules grade exists.
const rulesPath = path.join(outDir, "grades-rules.jsonl");
const rulesPass = new Map<string, boolean>();
if (existsSync(rulesPath)) {
  for (const l of readFileSync(rulesPath, "utf8").split("\n").filter(Boolean)) {
    const g = JSON.parse(l) as { rowId: string; repeat: number; passRules: boolean };
    rulesPass.set(`${g.rowId}#${g.repeat}`, g.passRules);
  }
} else if (!args.all && !args.golden) {
  console.warn("! No grades-rules.jsonl for this run; judging every slide. Run npm run eval:rules first to skip rule failures.");
}

// ---------- cached judge call ----------
const CACHE = path.join(EVALS, ".cache", "judge");
mkdirSync(CACHE, { recursive: true });
let calls = 0;
let cacheHits = 0;

async function ask<T>(system: string, user: string, schema: z.ZodType<T, z.ZodTypeDef, unknown>, image?: { base64: string; mediaType: string }): Promise<T> {
  const key = createHash("sha256")
    .update([JUDGE_PROMPT_VERSION, judge.label, judge.model, system, user, image ? createHash("sha256").update(image.base64).digest("hex") : ""].join("\u0000"))
    .digest("hex");
  const file = path.join(CACHE, `${key}.json`);
  if (!args["no-cache"] && existsSync(file)) {
    cacheHits++;
    return schema.parse(JSON.parse(readFileSync(file, "utf8")));
  }
  let lastErr: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    calls++;
    const raw = await callJudge(judge, system, attempt ? `${user}\n\nYour previous reply was not valid JSON for the schema. Reply with the JSON object only.` : user, image);
    try {
      const parsed = parseJudgeReply(raw, schema);
      writeFileSync(file, JSON.stringify(parsed));
      return parsed;
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr;
}

async function gradeOne(o: Output): Promise<JudgeGrade> {
  const base: JudgeGrade = {
    rowId: o.rowId,
    repeat: o.repeat,
    judged: false,
    skippedReason: null,
    faithfulness: null,
    coverage: null,
    style: null,
    criticalCoveragePct: null,
    optionalCoveragePct: null,
    judgePass: null,
    error: null,
  };
  const row = rowsById.get(o.rowId);
  if (!row) return { ...base, error: `row ${o.rowId} not in dataset` };
  if (!o.narration?.trim()) return { ...base, skippedReason: "empty narration" };
  if (!args.all && rulesPass.get(`${o.rowId}#${o.repeat}`) === false) return { ...base, skippedReason: "failed hard rules" };

  const c: JudgeCase = {
    rowId: row.id,
    narration: o.narration,
    slideText: row.slideLines?.length ? row.slideLines.join("\n") : row.slideText,
    deckTitle: dataset.decks[row.deckId]?.companyName ?? row.deckId,
    mustMentionCritical: row.mustMentionCritical,
    mustMentionOptional: row.mustMentionOptional,
    mustNotSay: row.mustNotSay,
  };
  const image =
    args["with-image"] && judge.provider === "anthropic"
      ? { base64: readFileSync(path.join(WEB_ROOT, row.slideImagePath)).toString("base64"), mediaType: "image/jpeg" }
      : undefined;

  try {
    const [faithfulness, coverage, style] = await Promise.all([
      ask(FAITHFULNESS_SYSTEM, faithfulnessUser(c), FaithfulnessSchema, image),
      ask(COVERAGE_SYSTEM, coverageUser(c), CoverageSchema),
      ask(STYLE_SYSTEM, styleUser(c), StyleSchema),
    ]);
    const crit = coveragePct(coverage, c.mustMentionCritical.length, "critical");
    const opt = coveragePct(coverage, c.mustMentionOptional.length, "optional");
    return {
      ...base,
      judged: true,
      faithfulness,
      coverage,
      style,
      criticalCoveragePct: crit,
      optionalCoveragePct: opt,
      judgePass: judgePasses(faithfulness, crit),
    };
  } catch (err) {
    return { ...base, error: err instanceof Error ? err.message : String(err) };
  }
}

// ---------- run with a concurrency limit ----------
async function main() {
  const limit = Math.max(1, Number(args.concurrency) || 4);
  const grades: JudgeGrade[] = new Array(outputs.length);
  let next = 0;
  let done = 0;
  await Promise.all(
    Array.from({ length: limit }, async () => {
      while (next < outputs.length) {
        const i = next++;
        grades[i] = await gradeOne(outputs[i]);
        done++;
        process.stdout.write(`\r  judged ${done}/${outputs.length}`);
      }
    }),
  );
  process.stdout.write("\n");

  writeFileSync(path.join(outDir, "grades-judge.jsonl"), grades.map((g) => JSON.stringify(g)).join("\n") + "\n");

  const judged = grades.filter((g) => g.judged);
  const avg = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 100) / 100 : null);
  const summary = {
    runId,
    judge: { provider: judge.label, model: judge.model, promptVersion: JUDGE_PROMPT_VERSION, withImage: Boolean(args["with-image"]) },
    gradedAt: new Date().toISOString(),
    outputs: grades.length,
    judged: judged.length,
    skipped: grades.filter((g) => g.skippedReason).length,
    errors: grades.filter((g) => g.error).length,
    judgePass: judged.filter((g) => g.judgePass).length,
    avgFaithfulness: avg(judged.map((g) => g.faithfulness!.score)),
    avgStyle: avg(judged.map((g) => g.style!.score)),
    fullCriticalCoverage: judged.filter((g) => g.criticalCoveragePct === null || g.criticalCoveragePct === 100).length,
    avgOptionalCoveragePct: avg(judged.map((g) => g.optionalCoveragePct).filter((x): x is number => x !== null)),
    unsupportedClaimsByTag: judged
      .flatMap((g) => g.faithfulness!.claims.filter((c) => c.supported !== "yes" && c.tag))
      .reduce<Record<string, number>>((acc, c) => ((acc[`[${c.tag}]`] = (acc[`[${c.tag}]`] ?? 0) + 1), acc), {}),
    mustNotSayHits: judged.reduce((n, g) => n + g.faithfulness!.mustNotSayHits.length, 0),
    calls,
    cacheHits,
  };
  writeFileSync(path.join(outDir, "judge-summary.json"), JSON.stringify(summary, null, 2) + "\n");

  console.log(`\nJudge: ${runId}  (${judge.label} / ${judge.model}, ${JUDGE_PROMPT_VERSION})`);
  console.log(`  judged ${summary.judged}, skipped ${summary.skipped}, errors ${summary.errors}  |  ${calls} calls, ${cacheHits} cached`);
  console.log(`  judge pass ${summary.judgePass}/${summary.judged}  |  faithfulness ${summary.avgFaithfulness}  style ${summary.avgStyle}`);
  console.log(`  full critical coverage ${summary.fullCriticalCoverage}/${summary.judged}  |  must-not-say hits ${summary.mustNotSayHits}`);
  console.log(`  saved to ${path.relative(process.cwd(), outDir)}/judge-summary.json`);
  for (const g of grades.filter((x) => x.error)) console.log(`  ERROR ${g.rowId}#${g.repeat}: ${g.error}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

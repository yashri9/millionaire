/**
 * Narration eval RUNNER: generates narration for every golden row and saves it.
 * It never scores anything; graders read its output.
 *
 *   npm run eval:run -w @voxdeck/web                      # text mode, all decks
 *   npm run eval:run -w @voxdeck/web -- --mode e2e        # Vision OCR from the slide images
 *   npm run eval:run -w @voxdeck/web -- --deck meesho --repeats 3 --label "prompt v7"
 *
 * Modes
 *   text  Feeds the golden slideLines (known-correct visible text). Failures = narration step.
 *   e2e   Runs Cloud Vision on the slide image + the PDF text layer, then pickSlideText,
 *         exactly like deckProcessor.ts. Failures = OCR or narration.
 *
 * Both modes then call the production path: structureSlideContent -> (route's labeled-facts
 * fill) -> generateNarrationForDeck, with the same provider/model/temperature as the app.
 *
 * Output: evals/runs/<runId>/{run.json, outputs.jsonl, outputs.csv}
 */
import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import {
  buildLabeledFacts,
  detectChartFromOcr,
  pickSlideText,
  structureSlideContent,
  type NarrationResult,
  type SlideContent,
} from "@voxdeck/narration";

// ---------- types ----------
type GoldenRow = {
  id: string;
  deckId: string;
  slideNum: number;
  slideType: string;
  difficulty: string;
  slideText: string;
  slideLines: string[];
  slideImagePath: string;
  deckContext: string;
  goldenScript: string;
  mustMentionCritical: string[];
  mustMentionOptional: string[];
  mustNotSay: string[];
};
type GoldenDataset = {
  name: string;
  version: string;
  decks: Record<string, { companyName: string; textLayerPath: string }>;
  rows: GoldenRow[];
};
type Mode = "text" | "e2e";

type OutputRecord = {
  runId: string;
  rowId: string;
  deckId: string;
  slideNum: number;
  repeat: number;
  mode: Mode;
  /** Text the pipeline actually used for this slide. */
  inputText: string;
  textSource: "golden" | "vision" | "text-layer";
  pickReason: string | null;
  structured: { titleText: string | null; bodyLines: number; labeledFacts: number; ocrDetectedChart: boolean };
  narration: string;
  generationMethod: string;
  /** false = the app fell back to extractive/chart-bridge; NOT a model output. */
  isModelOutput: boolean;
  lowConfidenceFlags: string[];
  omittedContent: string[];
  wordCount: number;
  /** Estimate at 150 wpm until TTS runs in the loop. */
  estDurationSec: number;
  deckLatencyMs: number;
  error: string | null;
};

// ---------- setup ----------
const WEB_ROOT = path.resolve(import.meta.dirname, "..");
const EVALS = path.join(WEB_ROOT, "evals");

for (const f of [".env.local", ".env"]) {
  const p = path.join(WEB_ROOT, f);
  if (existsSync(p)) process.loadEnvFile(p);
}

const { values: args } = parseArgs({
  options: {
    mode: { type: "string", default: "text" },
    dataset: { type: "string", default: path.join(EVALS, "golden", "narration-v2.json") },
    deck: { type: "string" },
    rows: { type: "string" },
    repeats: { type: "string", default: "1" },
    label: { type: "string", default: "" },
    out: { type: "string", default: path.join(EVALS, "runs") },
    "require-llm": { type: "boolean", default: false },
  },
});

const mode = args.mode as Mode;
if (mode !== "text" && mode !== "e2e") throw new Error(`--mode must be text or e2e, got ${args.mode}`);
const repeats = Math.max(1, Number(args.repeats) || 1);

const words = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;
const sh = (cmd: string) => {
  try {
    return execSync(cmd, { cwd: WEB_ROOT, stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
  } catch {
    return null;
  }
};

// ---------- OCR (e2e mode) ----------
const VISION_CACHE = path.join(EVALS, ".cache", "vision");

async function visionText(imagePath: string): Promise<string | null> {
  const bytes = readFileSync(imagePath);
  const sha = createHash("sha256").update(bytes).digest("hex");
  const cached = path.join(VISION_CACHE, `${sha}.json`);
  if (existsSync(cached)) return (JSON.parse(readFileSync(cached, "utf8")) as { text: string }).text;

  const { googleVisionApiKey, googleVisionOcr } = await import("@/lib/google-vision");
  if (!googleVisionApiKey()) throw new Error("e2e mode needs GOOGLE_VISION_API_KEY (or GOOGLE_TTS_API_KEY)");
  const result = await googleVisionOcr(bytes.toString("base64"));
  mkdirSync(VISION_CACHE, { recursive: true });
  writeFileSync(cached, JSON.stringify(result));
  return result.text;
}

function textLayerFor(deck: GoldenDataset["decks"][string], slideNum: number): string {
  const p = path.join(WEB_ROOT, deck.textLayerPath);
  if (!existsSync(p)) return "";
  const pages = JSON.parse(readFileSync(p, "utf8")) as { n: number; text: string }[];
  return pages.find((x) => x.n === slideNum)?.text ?? "";
}

// ---------- slide building (mirrors pdf-parse.ts + /api/script/generate) ----------
async function buildSlide(row: GoldenRow, total: number, deck: GoldenDataset["decks"][string]) {
  let text: string;
  let textSource: OutputRecord["textSource"];
  let pickReason: string | null = null;

  if (mode === "text") {
    text = row.slideLines.join("\n");
    textSource = "golden";
  } else {
    const vision = await visionText(path.join(WEB_ROOT, row.slideImagePath));
    const pick = pickSlideText(textLayerFor(deck, row.slideNum), vision);
    text = pick.text;
    textSource = pick.source;
    pickReason = pick.reason;
  }

  const ocrDetectedChart = detectChartFromOcr(text);
  // OCR/flat text has no run geometry, same as the app's OCR path.
  const slide: SlideContent = structureSlideContent({
    slideNo: row.slideNum,
    totalSlides: total,
    runs: [],
    flatText: text,
    extractionMethod: mode === "e2e" && textSource === "text-layer" ? "text-layer" : "ocr",
    ocrDetectedChart,
  });
  if (!slide.labeledFacts?.length) {
    slide.labeledFacts = buildLabeledFacts({
      titleText: slide.titleText,
      bodyText: slide.bodyText,
      possibleChartRegions: slide.possibleChartRegions,
    });
  }
  return { slide, text, textSource, pickReason };
}

// ---------- main ----------
async function main() {
  const dataset = JSON.parse(readFileSync(args.dataset!, "utf8")) as GoldenDataset;
  const deckFilter = args.deck?.split(",").map((s) => s.trim());
  const rowFilter = args.rows?.split(",").map((s) => s.trim());

  const { generateNarrationForDeck } = await import("@/lib/prompts");
  const { providerStatus } = await import("@/lib/llm");
  const provider = providerStatus();

  const runId = `${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)}_${mode}`;
  const outDir = path.join(args.out!, runId);
  mkdirSync(outDir, { recursive: true });

  const deckIds = Object.keys(dataset.decks).filter((d) => !deckFilter || deckFilter.includes(d));
  if (rowFilter) {
    console.warn("! --rows set: slides run without their full deck, so neighbour context differs from production.");
  }
  if (!provider.keySet) {
    console.warn(
      `! No API key for LLM_PROVIDER=${provider.provider}. The app will use its extractive fallback,` +
        " so outputs are NOT model narrations (isModelOutput=false).",
    );
  }

  const records: OutputRecord[] = [];
  const started = Date.now();

  for (const deckId of deckIds) {
    const deck = dataset.decks[deckId];
    const allRows = dataset.rows.filter((r) => r.deckId === deckId).sort((a, b) => a.slideNum - b.slideNum);
    const rows = rowFilter ? allRows.filter((r) => rowFilter.includes(r.id)) : allRows;
    if (!rows.length) continue;

    const built = [];
    for (const row of rows) built.push({ row, ...(await buildSlide(row, allRows.length, deck)) });

    for (let rep = 1; rep <= repeats; rep++) {
      process.stdout.write(`${deckId} (${rows.length} slides) repeat ${rep}/${repeats} ... `);
      const t0 = Date.now();
      let results: NarrationResult[] = [];
      let error: string | null = null;
      try {
        results = await generateNarrationForDeck(
          built.map((b) => b.slide),
          { companyName: deck.companyName, deckPurpose: rows[0].deckContext },
        );
      } catch (err) {
        error = err instanceof Error ? err.message : String(err);
      }
      const deckLatencyMs = Date.now() - t0;
      console.log(error ? `ERROR: ${error}` : `${(deckLatencyMs / 1000).toFixed(1)}s`);

      for (const b of built) {
        const res = results.find((r) => r.slideNo === b.row.slideNum);
        const narration = res?.narration ?? "";
        records.push({
          runId,
          rowId: b.row.id,
          deckId,
          slideNum: b.row.slideNum,
          repeat: rep,
          mode,
          inputText: b.text,
          textSource: b.textSource,
          pickReason: b.pickReason,
          structured: {
            titleText: b.slide.titleText,
            bodyLines: b.slide.bodyText.length,
            labeledFacts: b.slide.labeledFacts?.length ?? 0,
            ocrDetectedChart: b.slide.ocrDetectedChart ?? false,
          },
          narration,
          generationMethod: res?.generationMethod ?? "none",
          isModelOutput: res?.generationMethod === "llm",
          lowConfidenceFlags: res?.lowConfidenceFlags ?? [],
          omittedContent: res?.omittedContent ?? [],
          wordCount: words(narration),
          estDurationSec: Math.round((words(narration) / 2.5) * 10) / 10,
          deckLatencyMs,
          error: error ?? (res ? null : "no result for slide"),
        });
      }
    }
  }

  // ---------- write ----------
  writeFileSync(path.join(outDir, "outputs.jsonl"), records.map((r) => JSON.stringify(r)).join("\n") + "\n");

  const csvCell = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const csv = [
    ["row_id", "repeat", "model_script", "generation_method", "length_words", "est_duration_sec", "error"],
    ...records.map((r) => [r.rowId, r.repeat, r.narration, r.generationMethod, r.wordCount, r.estDurationSec, r.error]),
  ]
    .map((line) => line.map(csvCell).join(","))
    .join("\n");
  writeFileSync(path.join(outDir, "outputs.csv"), csv + "\n");

  const nonModel = records.filter((r) => !r.isModelOutput);
  const meta = {
    runId,
    label: args.label,
    startedAt: new Date(started).toISOString(),
    durationSec: Math.round((Date.now() - started) / 1000),
    mode,
    repeats,
    dataset: { name: dataset.name, version: dataset.version, path: path.relative(WEB_ROOT, args.dataset!) },
    pipeline: {
      provider: provider.provider,
      model: provider.model,
      llmKeySet: provider.keySet,
      temperature: 0.35,
      gitSha: sh("git rev-parse --short HEAD"),
      gitDirty: Boolean(sh("git status --porcelain")),
    },
    filters: { deck: deckFilter ?? null, rows: rowFilter ?? null },
    counts: {
      outputs: records.length,
      modelOutputs: records.length - nonModel.length,
      fallbackOutputs: nonModel.length,
      errors: records.filter((r) => r.error).length,
      over34Words: records.filter((r) => r.wordCount > 34).length,
    },
    node: process.version,
  };
  writeFileSync(path.join(outDir, "run.json"), JSON.stringify(meta, null, 2) + "\n");

  console.log(`\nRun ${runId}`);
  console.log(`  provider ${meta.pipeline.provider} / ${meta.pipeline.model}  (key set: ${meta.pipeline.llmKeySet})`);
  console.log(
    `  ${meta.counts.outputs} outputs | ${meta.counts.modelOutputs} model | ${meta.counts.fallbackOutputs} fallback | ${meta.counts.errors} errors`,
  );
  console.log(`  saved to ${path.relative(process.cwd(), outDir)}`);

  if (args["require-llm"] && nonModel.length) {
    console.error(`\n${nonModel.length} outputs are fallbacks, not model narrations. Failing (--require-llm).`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

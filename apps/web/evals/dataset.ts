/**
 * Dataset tool: validate, stats, harvest production feedback, and cut a new version.
 *
 *   npm run eval:dataset -w @voxdeck/web -- validate           # structure + goldens pass the rules
 *   npm run eval:dataset -w @voxdeck/web -- stats              # rows by split / deck / type / difficulty
 *   npm run eval:dataset -w @voxdeck/web -- harvest --from feedback.jsonl
 *   npm run eval:dataset -w @voxdeck/web -- new-version        # v2 + reviewed candidates -> v3
 *
 * Feedback events (one JSON object per line), exported from the app once it records them:
 *   {"deckTitle":"acme-q3","slideNo":4,"slideText":"line 1\nline 2","aiNarration":"...",
 *    "finalNarration":"... or null","action":"edit"|"regenerate"|"shorten"|"punch"|"report",
 *    "note":"optional reason","createdAt":"ISO"}
 *
 * harvest turns them into rows in golden/candidates.jsonl (reviewStatus "candidate"). A human fills
 * the rubric (critical / optional / must_not_say / bannedTerms / slideType / difficulty), fixes the
 * golden script and sets reviewStatus to "reviewed". new-version then copies the current dataset,
 * appends the reviewed candidates, bumps the version and removes them from candidates.jsonl.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { GOLDEN_DIR, latestDataset } from "./paths.ts";
import { gradeRules, passesRules } from "./rules.ts";

type Row = {
  id: string;
  deckId: string;
  slideNum: number;
  slideType: string;
  difficulty: string;
  slideText: string;
  slideLines: string[];
  slideImagePath?: string | null;
  deckContext?: string;
  goldenScript: string;
  mustMentionCritical: string[];
  mustMentionOptional: string[];
  mustNotSay: string[];
  bannedTerms?: string[];
  reviewStatus: string;
  split?: "dev" | "holdout";
  source?: Record<string, unknown>;
  failedNarration?: string;
};
type Dataset = {
  name: string;
  version: string;
  status?: string;
  decks: Record<string, { companyName: string; textLayerPath?: string | null }>;
  rows: Row[];
  notes?: Record<string, string>;
};
type FeedbackEvent = {
  deckTitle: string;
  slideNo: number;
  slideText: string;
  aiNarration: string;
  finalNarration?: string | null;
  action: "edit" | "regenerate" | "shorten" | "punch" | "report";
  note?: string;
  createdAt?: string;
};

const CANDIDATES = path.join(GOLDEN_DIR, "candidates.jsonl");
const { positionals, values: args } = parseArgs({
  allowPositionals: true,
  options: {
    dataset: { type: "string", default: latestDataset() },
    from: { type: "string" },
    "holdout-pct": { type: "string", default: "20" },
  },
});

const load = (): Dataset => JSON.parse(readFileSync(args.dataset!, "utf8")) as Dataset;
const words = (s: string) => s.trim().split(/\s+/).filter(Boolean);
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const splitFor = (id: string) => (parseInt(sha(`holdout:${id}`).slice(0, 8), 16) % 100 < Number(args["holdout-pct"]) ? "holdout" : "dev");
const readCandidates = (): Row[] =>
  existsSync(CANDIDATES) ? readFileSync(CANDIDATES, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l) as Row) : [];

/** Word-level similarity (0-1) so trivial edits (punctuation, one word) can be skipped. */
export function similarity(a: string, b: string): number {
  const A = words(a.toLowerCase().replace(/[^\w\s]/g, ""));
  const B = words(b.toLowerCase().replace(/[^\w\s]/g, ""));
  if (!A.length && !B.length) return 1;
  const dp = Array.from({ length: A.length + 1 }, () => new Array<number>(B.length + 1).fill(0));
  for (let i = 1; i <= A.length; i++)
    for (let j = 1; j <= B.length; j++) dp[i][j] = A[i - 1] === B[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
  return (2 * dp[A.length][B.length]) / (A.length + B.length);
}

export function validateRows(ds: Dataset, root = path.resolve(GOLDEN_DIR, "..", "..")) {
  const errors: string[] = [];
  const warnings: string[] = [];
  const ids = new Set<string>();
  for (const r of ds.rows) {
    const at = `${r.id}:`;
    if (ids.has(r.id)) errors.push(`${at} duplicate id`);
    ids.add(r.id);
    if (!ds.decks[r.deckId]) errors.push(`${at} deck ${r.deckId} not in decks`);
    if (!r.slideLines?.length) errors.push(`${at} no slideLines (the runner needs line-broken text)`);
    if (!r.goldenScript?.trim()) errors.push(`${at} empty goldenScript`);
    if (!r.mustMentionCritical?.length) errors.push(`${at} no critical must_mention items`);
    if (!r.slideType || !r.difficulty) errors.push(`${at} missing slideType or difficulty`);
    if (!r.split) errors.push(`${at} missing split (dev/holdout)`);
    if (!r.mustNotSay?.length) warnings.push(`${at} no must_not_say traps`);
    if (r.slideImagePath && !existsSync(path.join(root, r.slideImagePath))) warnings.push(`${at} image not found: ${r.slideImagePath}`);
    if (!/reviewed/i.test(r.reviewStatus ?? "")) warnings.push(`${at} reviewStatus is "${r.reviewStatus}"`);

    if (r.goldenScript?.trim()) {
      const others = ds.rows.filter((o) => o.deckId === r.deckId && o.id !== r.id).map((o) => ({ rowId: o.id, slideText: o.slideLines.join("\n") }));
      const results = gradeRules({
        narration: r.goldenScript,
        isModelOutput: true,
        error: null,
        wordCount: words(r.goldenScript).length,
        slideText: r.slideLines.join("\n"),
        otherSlides: others,
        deckTitle: ds.decks[r.deckId]?.companyName ?? r.deckId,
        bannedTerms: r.bannedTerms ?? [],
      });
      if (!passesRules(results))
        errors.push(`${at} golden fails its own rules: ${results.filter((x) => x.hard && x.status === "fail").map((x) => `${x.rule} (${x.detail})`).join("; ")}`);
    }
  }
  const holdout = ds.rows.filter((r) => r.split === "holdout").length;
  const share = ds.rows.length ? Math.round((holdout / ds.rows.length) * 100) : 0;
  if (share < 10 || share > 30) warnings.push(`holdout is ${share}% of rows (aim for ~20%)`);
  return { errors, warnings };
}

function validate() {
  const ds = load();
  const { errors, warnings } = validateRows(ds);
  console.log(`Dataset ${ds.version}: ${ds.rows.length} rows, ${Object.keys(ds.decks).length} decks`);
  for (const w of warnings) console.log(`  warn  ${w}`);
  for (const e of errors) console.log(`  ERROR ${e}`);
  const unreviewed = ds.rows.filter((r) => !/reviewed/i.test(r.reviewStatus ?? "")).length;
  console.log(`  ${errors.length} errors, ${warnings.length} warnings${unreviewed ? ` (${unreviewed} rows not yet human-reviewed)` : ""}`);
  if (errors.length) process.exit(1);
}

function stats() {
  const ds = load();
  const by = (k: keyof Row) =>
    Object.entries(ds.rows.reduce<Record<string, number>>((acc, r) => ((acc[String(r[k])] = (acc[String(r[k])] ?? 0) + 1), acc), {}))
      .sort((a, b) => b[1] - a[1])
      .map(([key, n]) => `${key} ${n}`)
      .join(", ");
  console.log(`Dataset ${ds.version}: ${ds.rows.length} rows`);
  console.log(`  split       ${by("split")}`);
  console.log(`  deck        ${by("deckId")}`);
  console.log(`  difficulty  ${by("difficulty")}`);
  console.log(`  slide type  ${by("slideType")}`);
  const cand = readCandidates();
  if (cand.length) console.log(`  candidates  ${cand.length} (${cand.filter((c) => /reviewed/i.test(c.reviewStatus)).length} reviewed)`);
}

function harvest() {
  if (!args.from) throw new Error("harvest needs --from <feedback.jsonl>");
  const events = readFileSync(args.from, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l) as FeedbackEvent);
  const existing = readCandidates();
  const ds = load();
  const seen = new Set([...existing, ...ds.rows].map((r) => sha(`${r.slideLines?.join("\n")}|${r.failedNarration ?? ""}`)));
  const added: Row[] = [];
  let trivial = 0;
  let dupes = 0;
  for (const e of events) {
    const final = e.finalNarration?.trim() ?? "";
    if (e.action === "edit" && final && similarity(e.aiNarration, final) > 0.9) {
      trivial++;
      continue;
    }
    const slideLines = e.slideText.split("\n").map((l) => l.trim()).filter(Boolean);
    const key = sha(`${slideLines.join("\n")}|${e.aiNarration}`);
    if (seen.has(key)) {
      dupes++;
      continue;
    }
    seen.add(key);
    const deckId = e.deckTitle.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "deck";
    const id = `cand-${key.slice(0, 8)}`;
    added.push({
      id,
      deckId,
      slideNum: e.slideNo,
      slideType: "",
      difficulty: "",
      slideText: slideLines.join(" "),
      slideLines,
      slideImagePath: null,
      goldenScript: e.action === "edit" || e.action === "shorten" || e.action === "punch" ? final : "",
      failedNarration: e.aiNarration,
      mustMentionCritical: [],
      mustMentionOptional: [],
      mustNotSay: [],
      bannedTerms: [],
      reviewStatus: "candidate",
      split: splitFor(id),
      source: { signal: e.action, note: e.note ?? null, deckTitle: e.deckTitle, createdAt: e.createdAt ?? null },
    });
  }
  writeFileSync(CANDIDATES, [...existing, ...added].map((r) => JSON.stringify(r)).join("\n") + (existing.length + added.length ? "\n" : ""));
  console.log(`Harvested ${added.length} candidate rows (${trivial} trivial edits skipped, ${dupes} duplicates skipped).`);
  console.log(`  ${path.relative(process.cwd(), CANDIDATES)}: fill each row's rubric, fix goldenScript, set reviewStatus "reviewed", then run new-version.`);
  console.log("  Note: a harvested deck needs the rest of its slides in the dataset for neighbour context; add them or accept the gap.");
}

function newVersion() {
  const ds = load();
  const cand = readCandidates();
  const ready = cand.filter((c) => /reviewed/i.test(c.reviewStatus));
  const next = Number(ds.version.replace(/^v/, "")) + 1;
  const out: Dataset = structuredClone(ds);
  out.version = `v${next}`;
  for (const r of ready) {
    if (!out.decks[r.deckId]) out.decks[r.deckId] = { companyName: String(r.source?.deckTitle ?? r.deckId), textLayerPath: null };
    const { failedNarration: _f, ...row } = r;
    out.rows.push(row);
  }
  const { errors } = validateRows(out);
  if (errors.length) {
    console.log(`Not writing v${next}: ${errors.length} validation errors`);
    for (const e of errors) console.log(`  ERROR ${e}`);
    process.exit(1);
  }
  const file = path.join(GOLDEN_DIR, `narration-v${next}.json`);
  if (existsSync(file)) throw new Error(`${file} already exists`);
  writeFileSync(file, JSON.stringify(out, null, 2) + "\n");
  writeFileSync(CANDIDATES, cand.filter((c) => !ready.includes(c)).map((r) => JSON.stringify(r)).join("\n") + (cand.length > ready.length ? "\n" : ""));
  console.log(`Wrote ${path.relative(process.cwd(), file)}: ${ds.rows.length} + ${ready.length} rows. Every eval tool now defaults to v${next}.`);
  console.log(`  Scores on v${next} are not comparable with ${ds.version}: run a fresh baseline (eval:all, then eval:score -- --set-baseline).`);
}

if (import.meta.filename === path.resolve(process.argv[1] ?? "")) {
  const cmd = positionals[0];
  if (cmd === "validate") validate();
  else if (cmd === "stats") stats();
  else if (cmd === "harvest") harvest();
  else if (cmd === "new-version") newVersion();
  else {
    console.error("Usage: eval:dataset -- validate | stats | harvest --from <file.jsonl> | new-version");
    process.exit(1);
  }
}

/**
 * Rule graders for narration evals: deterministic, free, no API calls.
 * Each rule returns pass / fail / warn / skip with a reason. "fail" on a HARD rule fails the
 * slide; "warn" is reported but does not fail it. Fuzzy checks (paraphrased coverage, unsupported
 * claims, tone) are left to the LLM judge.
 */
import { stripAxisNoise } from "@voxdeck/narration";

export type RuleStatus = "pass" | "fail" | "warn" | "skip";
export type RuleResult = { rule: RuleId; status: RuleStatus; hard: boolean; detail: string };
export type RuleId =
  | "pipeline"
  | "length"
  | "duration"
  | "numbers"
  | "banned_phrases"
  | "placeholders"
  | "formatting"
  | "banned_terms"
  | "name_leak"
  | "repetition";

export type RuleInput = {
  narration: string;
  isModelOutput: boolean;
  error: string | null;
  wordCount: number;
  /** Real TTS duration if the run measured one; estimates are not graded. */
  durationSec?: number | null;
  /** Visible text of THIS slide (golden, not OCR) - the ground truth for grounding. */
  slideText: string;
  /** Visible text of the OTHER slides in the same deck, by row id. */
  otherSlides: { rowId: string; slideText: string }[];
  /** Deck title as the model saw it (e.g. upload filename). */
  deckTitle: string;
  /** Literal strings that must not appear for this row (dataset `bannedTerms`). */
  bannedTerms: string[];
};

export const LIMITS = { minWords: 15, maxWords: 40, pipelineCapWords: 34, minSec: 8, maxSec: 15 };

/** Meta narration a presenter would never say. */
export const BANNED_PHRASES: RegExp[] = [
  /\bas you can see\b/i,
  /\bthis slide\b/i,
  /\bon this slide\b/i,
  /\bthe (?:graph|chart|table|diagram)s? (?:shows?|above|below|here)\b/i,
  /\bplease (?:review|refer|see|look|note)\b/i,
  /\bin the (?:graph|chart|table|image)\b/i,
  /\b(?:next|previous) slide\b/i,
  /\bslide (?:number )?\d+\b/i,
];

/** Unfilled template text read aloud. */
export const PLACEHOLDERS: RegExp[] = [
  /\b[XY]\s+(?:target|customers?|pricing|price|users?|dollars?)\b/,
  /\bour\s+[XY]\b/,
  /\byour uncle\b/i,
  /\blorem ipsum\b/i,
  /\[(?:insert|placeholder|tbd)[^\]]*\]/i,
  /\bTBD\b/,
  /https?:\/\/|www\.|youtu\.?be/i,
];

const FORMATTING: { re: RegExp; what: string }[] = [
  { re: /[*#•]/, what: "markdown or bullet characters" },
  { re: /^\s*[-–]\s/m, what: "list dash" },
  { re: /\[\d+\]|\(\s*source[^)]*\)/i, what: "citation artifact" },
  { re: /\n/, what: "line break" },
  { re: /[\u{1F300}-\u{1FAFF}]/u, what: "emoji" },
];

const APPROX_TOLERANCE = 0.15;

const r = (rule: RuleId, hard: boolean, status: RuleStatus, detail: string): RuleResult => ({
  rule,
  hard,
  status,
  detail,
});

// ---------- number parsing (value-based) ----------
export type NumberMention = { raw: string; value: number; pct: boolean };

const SMALL: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17,
  eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70,
  eighty: 80, ninety: 90,
};
const SCALE: Record<string, number> = { hundred: 100, thousand: 1e3, million: 1e6, billion: 1e9 };
const SUFFIX: Record<string, number> = { k: 1e3, thousand: 1e3, m: 1e6, mn: 1e6, million: 1e6, b: 1e9, bn: 1e9, billion: 1e9 };

/**
 * Every number in a text as a value: digits ("$1,05,449", "1.3M", "20-30M+", "65%") and spoken
 * forms ("six hundred twenty-five thousand", "a hundred percent", "three-million-dollar").
 * Spoken numbers below 10 without a scale or "percent" are ignored ("two modes", "one click").
 */
export function numberMentions(text: string): NumberMention[] {
  const out: NumberMention[] = [];
  const digitRe = /(\d[\d,]*(?:\.\d+)?)(?!\d)(?:\s*(billion|million|thousand|mn|bn|[kmb])(?![a-z]))?\+?\s*(%|percent)?/gi;
  let m: RegExpExecArray | null;
  while ((m = digitRe.exec(text))) {
    const base = Number(m[1].replace(/,/g, ""));
    if (Number.isNaN(base)) continue;
    const mult = m[2] ? SUFFIX[m[2].toLowerCase()] ?? 1 : 1;
    out.push({ raw: m[0].trim(), value: base * mult, pct: Boolean(m[3]) });
  }

  const tokens = text.toLowerCase().replace(/-/g, " ").match(/[a-z]+|\d+/g) ?? [];
  let i = 0;
  while (i < tokens.length) {
    const t = tokens[i];
    const startsNumber = t in SMALL || (t === "a" && tokens[i + 1] in SCALE);
    if (!startsNumber) { i++; continue; }
    const start = i;
    let total = 0, current = 0, sawScale = false, sawWord = false;
    for (; i < tokens.length; i++) {
      const w = tokens[i];
      if (w === "a" && !sawWord && tokens[i + 1] in SCALE) { current = 1; continue; }
      if (w === "and" && sawWord && (tokens[i + 1] in SMALL)) continue;
      if (w in SMALL) { current += SMALL[w]; sawWord = true; continue; }
      if (w in SCALE) {
        sawScale = true;
        if (w === "hundred") current = (current || 1) * 100;
        else { total += (current || 1) * SCALE[w]; current = 0; }
        continue;
      }
      break;
    }
    const value = total + current;
    const pct = tokens[i] === "percent";
    if (sawWord || sawScale) {
      if (value >= 10 || sawScale || pct) out.push({ raw: tokens.slice(start, i + (pct ? 1 : 0)).join(" "), value, pct });
    }
    if (i === start) i++;
  }
  return out;
}

const same = (a: NumberMention, b: NumberMention) =>
  a.pct === b.pct && Math.abs(a.value - b.value) <= Math.max(Math.abs(b.value), 1) * 1e-9;
const near = (a: NumberMention, b: NumberMention) =>
  a.pct === b.pct && a.value >= 10 && Math.abs(a.value - b.value) / Math.max(Math.abs(b.value), 1) <= APPROX_TOLERANCE;

/**
 * Every number spoken must be on this slide. Classifies misses as:
 *   axis     - matches only a chart tick / "Week N" label -> warn
 *   rounded  - within 15% of a number on this slide ("about three thousand" for 3,314) -> warn
 *   [L] leak - not on this slide, but on another slide of the same deck -> fail
 *   [N]      - on no slide at all -> fail
 */
export function checkNumbers(input: RuleInput): RuleResult {
  const spoken = numberMentions(input.narration);
  if (!spoken.length) return r("numbers", true, "pass", "no numbers stated");

  const here = numberMentions(stripAxisNoise(input.slideText));
  const hereRaw = numberMentions(input.slideText);
  const others = input.otherSlides.map((o) => ({ rowId: o.rowId, nums: numberMentions(o.slideText) }));

  const axis: string[] = [], rounded: string[] = [], leaks: string[] = [], invented: string[] = [];
  for (const n of spoken) {
    if (here.some((h) => same(n, h))) continue;
    if (hereRaw.some((h) => same(n, h))) { axis.push(n.raw); continue; }
    if (here.some((h) => near(n, h))) { rounded.push(n.raw); continue; }
    const src = others.find((o) => o.nums.some((h) => same(n, h)));
    if (src) leaks.push(`${n.raw} (from ${src.rowId})`);
    else invented.push(n.raw);
  }

  const notes = [];
  if (invented.length) notes.push(`[N] not on any slide: ${invented.join(", ")}`);
  if (leaks.length) notes.push(`[L] from another slide: ${leaks.join(", ")}`);
  if (rounded.length) notes.push(`rounded: ${rounded.join(", ")}`);
  if (axis.length) notes.push(`only an axis/week label: ${axis.join(", ")}`);
  if (invented.length || leaks.length) return r("numbers", true, "fail", notes.join("; "));
  if (notes.length) return r("numbers", true, "warn", notes.join("; "));
  return r("numbers", true, "pass", `${spoken.length} number(s) all on slide`);
}

export function checkBannedTerms(input: RuleInput): RuleResult {
  const hay = input.narration.toLowerCase();
  const hits = input.bannedTerms.filter((t) => {
    const esc = t.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const edgeStart = /^\w/.test(t) ? "\\b" : "";
    const edgeEnd = /\w$/.test(t) ? "\\b" : "";
    return new RegExp(`${edgeStart}${esc}${edgeEnd}`, "i").test(hay);
  });
  if (!input.bannedTerms.length) return r("banned_terms", true, "skip", "no banned terms for this row");
  return hits.length
    ? r("banned_terms", true, "fail", `said: ${hits.join(", ")}`)
    : r("banned_terms", true, "pass", `${input.bannedTerms.length} checked`);
}

const CALENDAR = /^(January|February|March|April|May|June|July|August|September|October|November|December|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)$/;

/**
 * Soft leak check for names: capitalised words that are not on this slide or in the deck title
 * but are on another slide of the deck. Heuristic, so it only warns.
 */
export function checkNameLeak(input: RuleInput): RuleResult {
  const hereLower = `${input.slideText} ${input.deckTitle}`.toLowerCase();
  const tokens = input.narration
    .split(/(?<=[.!?])\s+/)
    .flatMap((sentence) => sentence.split(/\s+/).slice(1)) // skip sentence-initial capital
    .map((w) => w.replace(/[^A-Za-z'-]/g, "").replace(/'s$/, ""))
    .filter((w) => /^[A-Z][a-z]{3,}/.test(w));
  const leaked = new Set<string>();
  for (const w of tokens) {
    if (hereLower.includes(w.toLowerCase()) || CALENDAR.test(w)) continue;
    const src = input.otherSlides.find((o) => new RegExp(`\\b${w}\\b`, "i").test(o.slideText));
    if (src) leaked.add(`${w} (from ${src.rowId})`);
  }
  return leaked.size
    ? r("name_leak", false, "warn", `[L]? names from other slides: ${[...leaked].join(", ")}`)
    : r("name_leak", false, "pass", "no names from other slides");
}

/** All per-slide rules. Deck-level repetition is added by gradeDeckRepetition. */
export function gradeRules(input: RuleInput): RuleResult[] {
  const out: RuleResult[] = [];
  const n = input.narration.trim();

  if (input.error) out.push(r("pipeline", true, "fail", `error: ${input.error}`));
  else if (!n) out.push(r("pipeline", true, "fail", "empty narration"));
  else if (!input.isModelOutput) out.push(r("pipeline", true, "fail", "extractive fallback, not a model output"));
  else out.push(r("pipeline", true, "pass", "model output"));

  if (!n) return out; // nothing else is meaningful

  const w = input.wordCount;
  if (w < LIMITS.minWords || w > LIMITS.maxWords)
    out.push(r("length", true, "fail", `${w} words (allowed ${LIMITS.minWords}-${LIMITS.maxWords})`));
  else if (w > LIMITS.pipelineCapWords)
    out.push(r("length", true, "warn", `${w} words: over the pipeline's ${LIMITS.pipelineCapWords}-word cap`));
  else out.push(r("length", true, "pass", `${w} words`));

  if (input.durationSec == null) out.push(r("duration", true, "skip", "no measured TTS duration in this run"));
  else if (input.durationSec < LIMITS.minSec || input.durationSec > LIMITS.maxSec)
    out.push(r("duration", true, "fail", `${input.durationSec}s (allowed ${LIMITS.minSec}-${LIMITS.maxSec})`));
  else out.push(r("duration", true, "pass", `${input.durationSec}s`));

  out.push(checkNumbers(input));

  const phrases = BANNED_PHRASES.map((re) => n.match(re)?.[0]).filter(Boolean);
  out.push(
    phrases.length
      ? r("banned_phrases", true, "fail", `meta narration: "${phrases.join('", "')}"`)
      : r("banned_phrases", true, "pass", "none"),
  );

  const ph = PLACEHOLDERS.map((re) => n.match(re)?.[0]).filter(Boolean);
  out.push(
    ph.length ? r("placeholders", true, "fail", `[H] template text: "${ph.join('", "')}"`) : r("placeholders", true, "pass", "none"),
  );

  const fmt = FORMATTING.filter((f) => f.re.test(n)).map((f) => f.what);
  out.push(fmt.length ? r("formatting", true, "fail", fmt.join(", ")) : r("formatting", true, "pass", "clean"));

  out.push(checkBannedTerms(input));
  out.push(checkNameLeak(input));
  return out;
}

/** Deck-level: the same sentence (6+ words) used on two or more slides. Warn only. */
export function gradeDeckRepetition(narrations: { key: string; narration: string }[]): Map<string, RuleResult> {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();
  const seen = new Map<string, string[]>();
  for (const { key, narration } of narrations) {
    for (const s of narration.split(/(?<=[.!?])\s+/)) {
      const k = norm(s);
      if (k.split(" ").length < 6) continue;
      seen.set(k, [...(seen.get(k) ?? []), key]);
    }
  }
  const out = new Map<string, RuleResult>();
  for (const { key } of narrations) {
    const dupes = [...seen.entries()].filter(([, keys]) => keys.includes(key) && new Set(keys).size > 1);
    out.set(
      key,
      dupes.length
        ? r("repetition", false, "warn", `sentence repeated on ${[...new Set(dupes.flatMap(([, k]) => k))].filter((k) => k !== key).join(", ")}`)
        : r("repetition", false, "pass", "no repeated sentences"),
    );
  }
  return out;
}

/** Slide passes the rules layer if no HARD rule failed. */
export const passesRules = (results: RuleResult[]) => !results.some((x) => x.hard && x.status === "fail");

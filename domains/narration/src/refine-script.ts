import { draftPitchLine } from "./draft-pitch.ts";
import { extractEssentialPoints } from "./essential-points.ts";

export type RefineMode = "shorten" | "punch" | "regenerate";

export type RefineInput = {
  mode: RefineMode;
  currentLine: string;
  pageText?: string;
  title?: string;
  essentialPoints?: string[];
  pageNum?: number;
  totalPages?: number;
  /** Bump to force a different regenerate variant */
  seed?: number;
};

const SOFTENERS =
  /\b(basically|actually|really|very|just|kind of|sort of|a bit|quite|simply|essentially|in order to|as you can see|what I want to say is|I want to|I'd like to|we're going to|going to)\b/gi;

const HEDGE =
  /\b(maybe|perhaps|might|could potentially|try to|hope to|I think|I believe)\b/gi;

function words(s: string): string[] {
  return s.trim().split(/\s+/).filter(Boolean);
}

function join(ws: string[]): string {
  return ws.join(" ").replace(/\s+([,.!?])/g, "$1").trim();
}

function ensurePeriod(s: string): string {
  const t = s.trim();
  if (!t) return t;
  return /[.!?]$/.test(t) ? t : `${t}.`;
}

/** Shorten: same meaning, fewer words. Never invent new claims. */
export function shortenLine(current: string): string {
  let text = current.trim();
  if (!text) return text;

  text = text.replace(SOFTENERS, " ").replace(HEDGE, " ");
  text = text.replace(/\s+/g, " ").trim();

  // Drop trailing clauses after em-dash / semicolon when long
  const parts = text.split(/\s+[â€”â€“-]\s+|;\s+/);
  if (parts.length > 1 && words(text).length > 18) {
    text = parts[0].trim();
  }

  // Keep first sentence if multi-sentence and long
  const sentences = text.split(/(?<=[.!?])\s+/);
  if (sentences.length > 1 && words(text).length > 22) {
    text = sentences[0];
  }

  let ws = words(text);
  if (ws.length > 18) ws = ws.slice(0, 18);
  return ensurePeriod(join(ws));
}

/** Punch: same meaning, sharper delivery. Preserve facts/numbers. */
export function punchLine(current: string): string {
  let text = current.trim();
  if (!text) return text;

  text = text.replace(SOFTENERS, " ").replace(HEDGE, " ");
  text = text.replace(/\s+/g, " ").trim();

  // Swap limp openers for direct ones without changing the claim
  text = text
    .replace(/^here(?:'s| is) (?:the beat that matters|why this matters)[:\sâ€”-]*/i, "")
    .replace(/^this is the moment I want you to remember\s*[â€”â€“-]?\s*/i, "")
    .replace(/^start here:\s*/i, "")
    .replace(/^two things:\s*/i, "")
    .trim();

  // Emphasize numbers by leading with them when buried mid-line
  const numMatch = text.match(
    /(\$?\d[\d,.]*\s*(?:%|x|X|k|K|m|M|b|B)?|\d+\s*(?:percent|days|weeks|months|years))/
  );
  if (numMatch && numMatch.index && numMatch.index > 12 && words(text).length > 10) {
    const claim = text.replace(numMatch[0], "").replace(/\s+/g, " ").replace(/^[,:\sâ€”â€“-]+/, "").trim();
    text = `${numMatch[0]} â€” ${uncap(claim)}`;
  } else if (!/^[A-Z0-9$]/.test(text)) {
    text = text.charAt(0).toUpperCase() + text.slice(1);
  } else {
    // Tighten "and the proof is" style
    text = text
      .replace(/\band the proof is\b/gi, "proof:")
      .replace(/\bthat lands because\b/gi, "because")
      .replace(/\bso the ask is simple:\s*/gi, "Ask: ");
  }

  let ws = words(text);
  if (ws.length > 28) ws = ws.slice(0, 28);
  return ensurePeriod(join(ws));
}

function uncap(s: string): string {
  if (!s) return s;
  return s.charAt(0).toLowerCase() + s.slice(1);
}

const REGEN_FRAMES = [
  (a: string, b?: string) =>
    b ? `Don't miss this: ${uncap(a)}. ${b}.` : `Don't miss this: ${uncap(a)}.`,
  (a: string, b?: string) =>
    b ? `The stake here is ${uncap(a)} â€” backed by ${uncap(b)}.` : `The stake here is ${uncap(a)}.`,
  (a: string, b?: string) =>
    b ? `If you only take one point: ${uncap(a)}. Then ${uncap(b)}.` : `If you only take one point: ${uncap(a)}.`,
  (a: string, b?: string) =>
    b ? `${a}. Put differently, ${uncap(b)}.` : `${a}.`,
  (a: string, b?: string) =>
    b ? `What changes the conversation is ${uncap(a)}, plus ${uncap(b)}.` : `What changes the conversation is ${uncap(a)}.`,
];

/**
 * Regenerate: different wording/angle for the same essentials.
 * Avoids returning the same string as `currentLine`.
 */
export function regenerateLine(input: RefineInput): string {
  const points =
    input.essentialPoints?.filter((p) => p.trim()).slice(0, 4) ??
    extractEssentialPoints(input.pageText ?? "", {
      title: input.title,
      limit: 4,
    });

  const seed = input.seed ?? Date.now();
  const frame = REGEN_FRAMES[Math.abs(seed) % REGEN_FRAMES.length];

  let next: string;
  if (points.length >= 1) {
    next = frame(points[0], points[1]);
  } else {
    next = draftPitchLine({
      pageText: input.pageText ?? "",
      pageNum: input.pageNum ?? 1,
      title: input.title,
      totalPages: input.totalPages,
      essentialPoints: points,
    });
    // Shift opener using seed so repeated clicks differ
    const alts = [
      `Another way to say it: ${uncap(input.currentLine)}`,
      `Flip the angle: ${uncap(input.currentLine)}`,
    ];
    next = alts[Math.abs(seed) % alts.length];
  }

  next = ensurePeriod(next.replace(/\s+/g, " ").trim());
  const cur = input.currentLine.trim().toLowerCase();
  if (next.toLowerCase() === cur) {
    next = ensurePeriod(
      `Put simply â€” ${uncap(points[0] ?? input.currentLine)}`.replace(/\s+/g, " "),
    );
  }

  const ws = words(next);
  if (ws.length > 32) next = ensurePeriod(join(ws.slice(0, 32)));
  return next;
}

export function refineScript(input: RefineInput): string {
  const current = input.currentLine.trim();
  if (input.mode === "shorten") {
    return current ? shortenLine(current) : current;
  }
  if (input.mode === "punch") {
    return current ? punchLine(current) : current;
  }
  return regenerateLine(input);
}

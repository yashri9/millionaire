import "server-only";

/**
 * prompts.ts — narration + grounded Q&A prompts, ported from the FastAPI
 * prototype (backend/server.py). Keeps the exact discipline:
 *  - narration: one spoken line per slide, JSON array, matching length
 *  - Q&A: answer ONLY from the deck; if unsure, escalate (never invent)
 */
import { callLLM } from "@/lib/llm";
import { DEFAULT_NARRATION_INSTRUCTIONS } from "@/lib/narrationPromptDefaults";

const MAX_TEXT_PER_SLIDE = 1200;

/** Rough spoken pace used to translate a target duration into a per-slide word budget. */
const WORDS_PER_MINUTE = 150;
const MIN_WORDS_PER_SLIDE = 12;
const MAX_WORDS_PER_SLIDE = 120;

export const NARRATION_DURATIONS = [1, 2, 5] as const;
export type NarrationDurationMinutes = (typeof NARRATION_DURATIONS)[number];

const NARRATION_OUTPUT_CONTRACT =
  "\n\nReturn ONLY a raw JSON array of strings, same length and order as the input " +
  "slides, nothing else — no markdown, no code fences, no commentary.";

/** Total target words spread evenly across every slide, clamped to a sane per-slide range. */
export function wordsPerSlide(durationMinutes: number, slideCount: number): number {
  const total = durationMinutes * WORDS_PER_MINUTE;
  const perSlide = Math.round(total / Math.max(1, slideCount));
  return Math.min(MAX_WORDS_PER_SLIDE, Math.max(MIN_WORDS_PER_SLIDE, perSlide));
}

export type SlideInput = { index: number; title?: string; text?: string };

export async function generateNarration(
  slides: SlideInput[],
  durationMinutes: number = 1,
  customInstructions?: string | null,
): Promise<string[]> {
  const budget = wordsPerSlide(durationMinutes, slides.length);
  const instructions = (customInstructions?.trim() || DEFAULT_NARRATION_INSTRUCTIONS)
    .replaceAll("{budget}", String(budget))
    .replaceAll("{slideCount}", String(slides.length));
  const system = instructions + NARRATION_OUTPUT_CONTRACT;

  const payload = slides.map((s) => ({
    slide: s.index,
    text: (s.text ?? "").slice(0, MAX_TEXT_PER_SLIDE),
  }));

  // Rough tokens-per-word overhead for the model's output budget, with headroom.
  const maxTokens = Math.min(4000, Math.max(1600, Math.round(budget * slides.length * 2)));
  const raw = await callLLM(system, JSON.stringify(payload), maxTokens);
  const lines = JSON.parse(raw);
  if (!Array.isArray(lines) || lines.length !== slides.length) {
    throw new Error("Model returned a mismatched script length");
  }
  return lines.map((l) => String(l));
}

export type AskResult = {
  escalate: boolean;
  answer: string;
  slide_ref: number | null;
  confidence: number;
};

/**
 * Grounded Q&A. CRITICAL discipline (PRD §4.12 / §8): the recipient must NEVER
 * see a raw error. On any parse/model failure the caller should auto-escalate
 * with a warm hand-off. This function throws only on hard failures; callers
 * wrap it and fall back to an escalation result.
 */
export async function answerQuestion(
  question: string,
  slides: SlideInput[],
  repName: string,
): Promise<AskResult> {
  const deckText = slides
    .map((s) => `Slide ${s.index}:\n${(s.text ?? "").trim()}`)
    .join("\n\n");

  const system =
    "You answer a prospect's question about a sales deck they just viewed. You may " +
    "ONLY use the deck content below — never use outside knowledge, never invent " +
    "numbers, pricing, dates, security/compliance claims, or commitments not present " +
    "in the text.\n\nDECK CONTENT:\n" +
    deckText +
    '\n\nRespond with ONLY raw JSON, no markdown, in exactly this shape:\n' +
    '{"escalate": boolean, "answer": "string", "slide_ref": number or null, "confidence": number between 0 and 1}\n\n' +
    "Rules:\n" +
    "- If the deck clearly answers the question: escalate=false, confidence>=0.7, " +
    "slide_ref=the 1-indexed slide, answer=a plain 1-2 sentence answer in a human, non-salesy voice.\n" +
    "- If the question needs anything not in the deck (exact contract terms, custom " +
    "pricing, security/compliance detail, unstated timelines, or anything you're not " +
    "confident about): escalate=true, confidence<0.5, slide_ref=null, and " +
    `answer="Good question — let me get ${repName} to answer that directly for you."`;

  const raw = await callLLM(system, question, 400);
  const parsed = JSON.parse(raw) as AskResult;
  return {
    escalate: Boolean(parsed.escalate),
    answer: parsed.answer ?? escalationLine(repName),
    slide_ref: parsed.slide_ref ?? null,
    confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0,
  };
}

export function escalationLine(repName: string): string {
  return `Good question — let me get ${repName} to answer that directly for you.`;
}

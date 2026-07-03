import "server-only";

/**
 * prompts.ts — narration + grounded Q&A prompts, ported from the FastAPI
 * prototype (backend/server.py). Keeps the exact discipline:
 *  - narration: one spoken line per slide, JSON array, matching length
 *  - Q&A: answer ONLY from the deck; if unsure, escalate (never invent)
 */
import { callLLM } from "@/lib/llm";

const MAX_TEXT_PER_SLIDE = 1200;

export type SlideInput = { index: number; title?: string; text?: string };

export async function generateNarration(slides: SlideInput[]): Promise<string[]> {
  const system =
    "You write spoken narration scripts for B2B sales pitch decks, read aloud by " +
    "text-to-speech, one segment per slide, playing in sync as each slide is shown. " +
    "Write exactly one spoken line per slide (max 32 words), building a coherent arc " +
    "across the slides in order. Tone: confident, plain, like a skilled human rep " +
    "talking to a busy prospect. No hype adjectives, no exclamation marks, no emoji. " +
    "Return ONLY a raw JSON array of strings, same length and order as the input " +
    "slides, nothing else — no markdown, no code fences, no commentary.";

  const payload = slides.map((s) => ({
    slide: s.index,
    text: (s.text ?? "").slice(0, MAX_TEXT_PER_SLIDE),
  }));

  const raw = await callLLM(system, JSON.stringify(payload), 1600);
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

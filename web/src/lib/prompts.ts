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

const NARRATION_SYSTEM_PROMPT =
  "You write spoken narration for a B2B sales pitch deck, read aloud by text-to-speech " +
  "in sync as each slide is shown to a prospect who can see the slide at the same time.\n\n" +
  "Rules:\n" +
  "- One spoken line per slide, max 32 words.\n" +
  "- Never just restate the slide's title or bullets verbatim — the viewer can already " +
  "read those. Add the color, reasoning, or implication a live rep would add out loud.\n" +
  "- Build one coherent arc across all slides in order, like a single rep talking start to " +
  "finish, not isolated captions.\n" +
  "- Vary sentence openers — do not start consecutive lines with the same phrase " +
  "(e.g. 'Now,' / 'Next,' / 'Moving on,') more than once across the whole deck.\n" +
  "- The first slide should hook interest; the last slide should land on a clear " +
  "next step or ask, not a summary.\n" +
  "- Tone: confident, plain, like a skilled human rep talking to a busy prospect. " +
  "No hype adjectives, no exclamation marks, no emoji, no filler like 'as you can see.'\n\n" +
  'Return ONLY raw JSON in exactly this shape: {"lines": ["...", "..."]}, same length ' +
  "and order as the input slides — no markdown, no code fences, no commentary.";

export async function generateNarration(slides: SlideInput[]): Promise<string[]> {
  const payload = slides.map((s) => ({
    slide: s.index,
    text: (s.text ?? "").slice(0, MAX_TEXT_PER_SLIDE),
  }));

  for (let attempt = 0; attempt < 2; attempt++) {
    const raw = await callLLM(NARRATION_SYSTEM_PROMPT, JSON.stringify(payload), 1600, {
      jsonMode: true,
    });
    try {
      const parsed = JSON.parse(raw);
      const lines = Array.isArray(parsed) ? parsed : parsed.lines;
      if (Array.isArray(lines) && lines.length === slides.length) {
        return lines.map((l) => String(l));
      }
    } catch {
      /* fall through to retry */
    }
  }
  throw new Error("Model returned a mismatched script length");
}

export async function regenerateOneLine(
  slides: SlideInput[],
  existingLines: string[],
  targetIndex: number,
): Promise<string> {
  const system =
    "You write spoken narration for a B2B sales pitch deck. Below is the full deck " +
    "(all slides) and the current narration line for every slide except one, marked " +
    "[REWRITE THIS ONE]. Write a single new line (max 32 words) for that slide only — " +
    "it must fit naturally between the line before it and the line after it, matching " +
    "the tone and continuing the arc. Return ONLY that one line as plain text, nothing else.";

  const context = slides
    .map(
      (s, i) =>
        `Slide ${s.index}: ${(s.text ?? "").slice(0, 400)}\nCurrent line: ${
          i === targetIndex ? "[REWRITE THIS ONE]" : existingLines[i]
        }`,
    )
    .join("\n\n");

  const raw = await callLLM(system, context, 200);
  return raw.trim().replace(/^["']|["']$/g, "");
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

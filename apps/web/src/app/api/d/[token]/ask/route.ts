import { NextResponse } from "next/server";
import { getPublishedDeckByToken } from "@/lib/recipient";
import { answerQuestion, escalationLine, type AskResult } from "@/lib/prompts";
import { createServiceClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/env";
import { ASK_LIMIT, isOverLimit, overLimitMessage } from "@/lib/rateLimit";

type Ctx = { params: Promise<{ token: string }> };

/**
 * POST /api/d/:token/ask — grounded Q&A (PUBLIC, no login).
 *
 * Ported discipline from the FastAPI prototype (PRD §4.12 / §8 / §11.6):
 *  - answer ONLY from the deck; if unsure, escalate (handled in the prompt)
 *  - the recipient must NEVER see a raw error — ANY failure (LLM down, bad
 *    JSON, missing key) falls back to a warm hand-off escalation
 *  - rate-limit per session (default 20) → graceful "continue over email"
 *
 * This route is intentionally the most complete recipient endpoint. Session
 * creation + persisting the question/escalation notification are wired where
 * Supabase is configured; otherwise it still answers (LLM only).
 */
export async function POST(req: Request, { params }: Ctx) {
  const { token } = await params;

  let question = "";
  let sessionId: string | null = null;
  try {
    const body = await req.json();
    question = String(body?.question ?? "").trim();
    sessionId = body?.session_id ?? null;
  } catch {
    /* ignore malformed body */
  }

  const lookup = await getPublishedDeckByToken(token);
  if (!lookup.ok) {
    // In unconfigured dev mode there is no deck; still answer politely.
    if (lookup.reason === "unconfigured") {
      return NextResponse.json(escalationResult("the rep"));
    }
    return NextResponse.json({ active: false, reason: lookup.reason }, { status: 404 });
  }
  const deck = lookup.deck;

  if (!question) {
    return NextResponse.json(escalationResult(deck.repName));
  }

  // Rate limit per session (PRD §11.6) — best-effort where DB is available.
  if (isSupabaseConfigured() && sessionId) {
    try {
      const db = createServiceClient();
      const { count } = await db
        .from("questions")
        .select("id", { count: "exact", head: true })
        .eq("session_id", sessionId);
      if (count != null && isOverLimit(count)) {
        return NextResponse.json({
          escalate: true,
          slide_ref: null,
          confidence: 0,
          answer: overLimitMessage(deck.repName),
          rate_limited: true,
          limit: ASK_LIMIT,
        });
      }
    } catch {
      /* non-fatal — never block a recipient on a counting error */
    }
  }

  // Grounded answer; auto-escalate on ANY failure (never surface a raw error).
  let result: AskResult;
  try {
    result = await answerQuestion(question, deck.slides, deck.repName);
  } catch {
    result = escalationResult(deck.repName);
  }

  // Persist question + escalation notification where possible (non-fatal).
  if (isSupabaseConfigured() && sessionId) {
    try {
      const db = createServiceClient();
      await db.from("questions").insert({
        session_id: sessionId,
        text: question,
        answer_text: result.answer,
        escalated: result.escalate,
        confidence: result.confidence,
        slide_ref: result.slide_ref,
      });
      // TODO(phase1): on escalate, insert an events row (type=escalated) and
      // send the escalation email (lib/email.sendEscalationEmail) to the owner.
    } catch {
      /* non-fatal */
    }
  }

  return NextResponse.json(result);
}

function escalationResult(repName: string): AskResult {
  return { escalate: true, answer: escalationLine(repName), slide_ref: null, confidence: 0 };
}

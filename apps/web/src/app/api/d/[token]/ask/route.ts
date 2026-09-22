import { NextResponse } from "next/server";
import { getPublishedDeckByToken } from "@/lib/recipient";
import { answerQuestion, escalationLine, type AskResult } from "@/lib/prompts";
import { createServiceClient } from "@/lib/supabase/server";
import { isSupabaseConfigured, publicEnv } from "@/lib/env";
import { ASK_LIMIT, isOverLimit, overLimitMessage } from "@/lib/rateLimit";
import { checkRateLimit, clientIp, rateLimitHeaders } from "@/lib/rate-limit";
import { enqueueJob } from "@/lib/jobs";
import { timingSafeEqual } from "crypto";

type Ctx = { params: Promise<{ token: string }> };

function tokensEqual(a: string, b: string): boolean {
  try {
    const ba = Buffer.from(a);
    const bb = Buffer.from(b);
    if (ba.length !== bb.length) return false;
    return timingSafeEqual(ba, bb);
  } catch {
    return false;
  }
}

/**
 * POST /api/d/:token/ask — grounded Q&A (PUBLIC, no login).
 */
export async function POST(req: Request, { params }: Ctx) {
  const { token } = await params;
  const ip = clientIp(req);

  // IP + token abuse protection (in addition to per-session question cap).
  const ipLimit = await checkRateLimit(`ask:ip:${ip}`, 30, 60);
  if (!ipLimit.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please try again shortly.", rate_limited: true },
      { status: 429, headers: rateLimitHeaders(ipLimit) },
    );
  }
  const tokenLimit = await checkRateLimit(`ask:token:${token}`, 60, 60);
  if (!tokenLimit.allowed) {
    return NextResponse.json(
      { error: "Too many requests for this deck. Please try again shortly.", rate_limited: true },
      { status: 429, headers: rateLimitHeaders(tokenLimit) },
    );
  }

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
    const fail = await checkRateLimit(`ask:invalid:${ip}`, 10, 300);
    if (!fail.allowed) {
      return NextResponse.json(
        { active: false, reason: "rate_limited" },
        { status: 429, headers: rateLimitHeaders(fail) },
      );
    }
    if (lookup.reason === "unconfigured") {
      return NextResponse.json(escalationResult("the rep"));
    }
    return NextResponse.json({ active: false, reason: lookup.reason }, { status: 404 });
  }
  const deck = lookup.deck;
  // Soft constant-time compare against returned token when present.
  if (deck.token && !tokensEqual(deck.token, token)) {
    return NextResponse.json({ active: false, reason: "not_found" }, { status: 404 });
  }

  if (!question) {
    return NextResponse.json(escalationResult(deck.repName));
  }

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
      /* non-fatal */
    }
  }

  let result: AskResult;
  try {
    result = await answerQuestion(question, deck.slides, deck.repName);
  } catch {
    result = escalationResult(deck.repName);
  }

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

      if (result.escalate) {
        await db.from("events").insert({
          session_id: sessionId,
          type: "escalated",
          payload: { question },
        });

        const ownerEmail = deck.ownerEmail;
        if (ownerEmail) {
          await enqueueJob(
            "escalation_notify",
            deck.deckId,
            {
              to: ownerEmail,
              repName: deck.repName,
              question,
              analyticsUrl: `${publicEnv.appUrl}/decks/${deck.deckId}/analytics`,
            },
            "escalation_notify",
          );
          try {
            const secret = process.env.CRON_SECRET || "";
            void fetch(`${publicEnv.appUrl}/api/jobs/run`, {
              method: "POST",
              headers: secret ? { authorization: `Bearer ${secret}` } : {},
            });
          } catch {
            /* cron will pick up */
          }
        }
      }
    } catch {
      /* non-fatal */
    }
  }

  return NextResponse.json(result, { headers: rateLimitHeaders(tokenLimit) });
}

function escalationResult(repName: string): AskResult {
  return { escalate: true, answer: escalationLine(repName), slide_ref: null, confidence: 0 };
}

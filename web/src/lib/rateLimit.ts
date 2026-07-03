import "server-only";

/**
 * rateLimit.ts — recipient Q&A rate limiting (PRD §11.6).
 *
 * Limit is per recipient SESSION (default 20 questions, env-configurable).
 * The durable source of truth is a COUNT of `questions` rows for the session
 * in Postgres — checked in the /api/d/[token]/ask route before calling the LLM.
 * When exceeded, return a graceful "let's continue over email with {rep}"
 * message — NOT an error.
 *
 * This helper centralizes the limit value + the graceful message.
 */
import { serverEnv } from "@/lib/env";

export const ASK_LIMIT = serverEnv.askRateLimitPerSession;

export function overLimitMessage(repName: string): string {
  return `We've covered a lot here — for anything more, ${repName} would love to continue over email. I'll make sure they follow up.`;
}

export function isOverLimit(questionCountThisSession: number): boolean {
  return questionCountThisSession >= ASK_LIMIT;
}

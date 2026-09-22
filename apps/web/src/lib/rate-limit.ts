import "server-only";

import { createServiceClient } from "@/lib/supabase/server";

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  limit: number;
  retryAfterSec: number;
};

/**
 * Postgres sliding-window rate limiter (free — no Upstash).
 * Window size in seconds; limit = max requests per window per key.
 */
export async function checkRateLimit(
  key: string,
  limit: number,
  windowSec: number,
): Promise<RateLimitResult> {
  const supabase = createServiceClient();
  const windowMs = Math.max(1, windowSec) * 1000;
  const now = Date.now();
  const windowStart = new Date(Math.floor(now / windowMs) * windowMs).toISOString();

  const { data: existing } = await supabase
    .from("rate_limits")
    .select("count")
    .eq("key", key)
    .eq("window_start", windowStart)
    .maybeSingle();

  const current = existing?.count ?? 0;
  if (current >= limit) {
    const retryAfterSec = Math.max(
      1,
      Math.ceil((Math.floor(now / windowMs) * windowMs + windowMs - now) / 1000),
    );
    return { allowed: false, remaining: 0, limit, retryAfterSec };
  }

  if (existing) {
    await supabase
      .from("rate_limits")
      .update({ count: current + 1 })
      .eq("key", key)
      .eq("window_start", windowStart);
  } else {
    await supabase.from("rate_limits").insert({
      key,
      window_start: windowStart,
      count: 1,
    });
  }

  return {
    allowed: true,
    remaining: Math.max(0, limit - current - 1),
    limit,
    retryAfterSec: 0,
  };
}

export function clientIp(req: Request): string {
  const xf = req.headers.get("x-forwarded-for");
  if (xf) return xf.split(",")[0]?.trim() || "unknown";
  return req.headers.get("x-real-ip") || "unknown";
}

export function rateLimitHeaders(result: RateLimitResult): HeadersInit {
  return {
    "X-RateLimit-Limit": String(result.limit),
    "X-RateLimit-Remaining": String(result.remaining),
    ...(result.allowed
      ? {}
      : { "Retry-After": String(result.retryAfterSec) }),
  };
}

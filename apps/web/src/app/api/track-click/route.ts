import { handle, ApiError } from "@/lib/http";
import { createServiceClient } from "@/lib/supabase/server";
import { checkRateLimit, clientIp, rateLimitHeaders } from "@/lib/rate-limit";

/**
 * POST /api/track-click — record outbound ?ref= attribution (PUBLIC, no login).
 */
export async function POST(req: Request) {
  return handle(async () => {
    const ip = clientIp(req);
    const limit = await checkRateLimit(`track-click:ip:${ip}`, 60, 60);
    if (!limit.allowed) {
      throw new ApiError(429, "Too many requests. Please try again shortly.");
    }

    const body = (await req.json().catch(() => null)) as
      | { ref?: unknown; path?: unknown; user_agent?: unknown }
      | null;

    const ref = typeof body?.ref === "string" ? body.ref.trim().slice(0, 200) : "";
    if (!ref) throw new ApiError(400, "Missing ref");

    const path =
      typeof body?.path === "string" && body.path.startsWith("/")
        ? body.path.slice(0, 500)
        : "/";
    const userAgent =
      typeof body?.user_agent === "string"
        ? body.user_agent.slice(0, 500)
        : (req.headers.get("user-agent") ?? null);

    const db = createServiceClient();
    const { error } = await db.from("link_clicks").insert({
      ref,
      path,
      user_agent: userAgent,
    });
    if (error) {
      console.error("[track-click] insert failed", error.message);
      throw new ApiError(500, "Could not record click");
    }

    return Response.json({ ok: true }, { headers: rateLimitHeaders(limit) });
  });
}

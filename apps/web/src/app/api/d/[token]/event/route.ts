import { handle, ApiError } from "@/lib/http";
import { getPublishedDeckByToken } from "@/lib/recipient";
import { createServiceClient } from "@/lib/supabase/server";
import { checkRateLimit, clientIp, rateLimitHeaders } from "@/lib/rate-limit";

type Ctx = { params: Promise<{ token: string }> };

const VALID_TYPES = new Set(["opened", "slide_viewed", "question_asked", "completed"]);

/**
 * POST /api/d/:token/event — log recipient events (PUBLIC, no login).
 */
export async function POST(req: Request, { params }: Ctx) {
  return handle(async () => {
    const { token } = await params;
    const ip = clientIp(req);
    const limit = await checkRateLimit(`event:ip:${ip}`, 120, 60);
    if (!limit.allowed) {
      throw new ApiError(429, "Too many requests. Please try again shortly.");
    }

    const result = await getPublishedDeckByToken(token);
    if (!result.ok) {
      const fail = await checkRateLimit(`event:invalid:${ip}`, 20, 300);
      if (!fail.allowed) throw new ApiError(429, "Too many requests");
      throw new ApiError(404, "Link is not active");
    }

    const body = (await req.json().catch(() => null)) as
      | { session_id?: string; type?: string; payload?: Record<string, unknown> }
      | null;
    const sessionId = body?.session_id;
    const type = body?.type;
    if (!sessionId || !type || !VALID_TYPES.has(type)) throw new ApiError(400, "Invalid event");

    const db = createServiceClient();
    const { data: session } = await db
      .from("sessions")
      .select("id, share_id")
      .eq("id", sessionId)
      .eq("share_id", result.deck.shareId)
      .maybeSingle();
    if (!session) throw new ApiError(404, "Session not found for this link");

    await db.from("events").insert({ session_id: sessionId, type, payload: body?.payload ?? {} });

    const patch: { last_seen_at: string; completed?: boolean } = {
      last_seen_at: new Date().toISOString(),
    };
    if (type === "completed") patch.completed = true;
    await db.from("sessions").update(patch).eq("id", sessionId);

    return Response.json({ ok: true }, { headers: rateLimitHeaders(limit) });
  });
}

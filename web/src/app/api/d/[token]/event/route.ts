import { handle, notImplemented } from "@/lib/http";
import { getPublishedDeckByToken } from "@/lib/recipient";
import { ApiError } from "@/lib/http";

type Ctx = { params: Promise<{ token: string }> };

/**
 * POST /api/d/:token/event — log recipient events (PUBLIC, no login).
 * type: opened | slide_viewed | completed. Writes via the service role client
 * against a session tied to the share (PRD §4.12 / §5 events).
 *
 * TODO(phase1): resolve-or-create session for this token, insert an events row
 * (with payload like {slide_index, dwell_seconds}), touch session.last_seen_at.
 */
export async function POST(_req: Request, { params }: Ctx) {
  return handle(async () => {
    const { token } = await params;
    const result = await getPublishedDeckByToken(token);
    if (!result.ok) throw new ApiError(404, "Link is not active");
    return notImplemented("Upsert session + insert events row via service client");
  });
}

import { handle } from "@/lib/http";
import { createSession, getPublishedDeckByToken } from "@/lib/recipient";
import { createServiceClient } from "@/lib/supabase/server";
import { signSlideImagePaths } from "@/lib/storage";
import { NextResponse } from "next/server";

type Ctx = { params: Promise<{ token: string }> };

/**
 * GET /api/d/:token — fetch published deck for viewing (PUBLIC, no login).
 * Served entirely via the service-role recipient lookup. Invalid/revoked token
 * returns a clean 404 payload — the UI renders a branded "link not active"
 * page, never a stack trace (PRD §4.12).
 */
export async function GET(_req: Request, { params }: Ctx) {
  return handle(async () => {
    const { token } = await params;
    const result = await getPublishedDeckByToken(token);
    if (!result.ok) {
      return NextResponse.json({ active: false, reason: result.reason }, { status: 404 });
    }
    const sessionId = await createSession(result.deck.shareId);
    const signed = await signSlideImagePaths(
      createServiceClient(),
      result.deck.slides.map((s) => ({
        ...s,
        image_path: s.image_path,
        thumb_path: s.thumb_path,
      })),
    );
    return NextResponse.json({
      active: true,
      sessionId,
      deck: {
        ...result.deck,
        slides: signed.map((s) => ({
          ...s,
          thumbnail: s.thumb_url || s.image_url,
        })),
      },
    });
  });
}

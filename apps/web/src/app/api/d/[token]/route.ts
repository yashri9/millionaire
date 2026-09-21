import { handle } from "@/lib/http";
import { getPublishedDeckByToken } from "@/lib/recipient";
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
    return NextResponse.json({ active: true, deck: result.deck });
  });
}

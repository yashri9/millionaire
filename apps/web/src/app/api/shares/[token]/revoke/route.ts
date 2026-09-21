import { requireUser } from "@/lib/auth";
import { handle, ApiError } from "@/lib/http";
import { createServerClient } from "@/lib/supabase/server";

type Ctx = { params: Promise<{ token: string }> };

/**
 * POST /api/shares/:token/revoke — revoke a share link (PRD §4.9).
 * Owner-only: verified via the share -> deck ownership chain (RLS + explicit
 * check). Recipient then sees a clean "link not active" page.
 */
export async function POST(_req: Request, { params }: Ctx) {
  return handle(async () => {
    const { token } = await params;
    const user = await requireUser();
    const supabase = await createServerClient();
    // RLS ensures the user can only see shares for decks they own.
    const { data: share } = await supabase
      .from("shares")
      .select("id, deck_id")
      .eq("token", token)
      .maybeSingle();
    if (!share) throw new ApiError(404, "Share not found");

    const { error } = await supabase.from("shares").update({ status: "revoked" }).eq("id", share.id);
    if (error) throw error;

    return Response.json({ ok: true });
  });
}

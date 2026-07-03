import { requireUser } from "@/lib/auth";
import { assertDeckOwner } from "@/lib/ownership";
import { handle, ApiError } from "@/lib/http";
import { createServerClient } from "@/lib/supabase/server";
import { publicEnv } from "@/lib/env";

type Ctx = { params: Promise<{ id: string }> };

/** GET /api/decks/:id — deck + slides + latest script + active share (owner only). */
export async function GET(_req: Request, { params }: Ctx) {
  return handle(async () => {
    const { id } = await params;
    const user = await requireUser();
    await assertDeckOwner(id, user.id);

    const supabase = await createServerClient();
    const [{ data: deck }, { data: slides }, { data: script }, { data: share }] = await Promise.all([
      supabase.from("decks").select("*").eq("id", id).single(),
      supabase.from("slides").select("*").eq("deck_id", id).order("order_index"),
      supabase
        .from("script_versions")
        .select("*")
        .eq("deck_id", id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("shares")
        .select("token, status")
        .eq("deck_id", id)
        .eq("status", "active")
        .maybeSingle(),
    ]);
    return Response.json({
      deck,
      slides: slides ?? [],
      script,
      share: share ? { token: share.token, url: `${publicEnv.appUrl}/d/${share.token}` } : null,
    });
  });
}

/** PATCH /api/decks/:id — update title / last_viewed_slide_index (owner only). */
export async function PATCH(req: Request, { params }: Ctx) {
  return handle(async () => {
    const { id } = await params;
    const user = await requireUser();
    await assertDeckOwner(id, user.id);

    const body = (await req.json()) as { title?: string; last_viewed_slide_index?: number };
    const patch: Record<string, string | number> = {};
    if (typeof body.title === "string" && body.title.trim()) patch.title = body.title.trim();
    if (typeof body.last_viewed_slide_index === "number") patch.last_viewed_slide_index = body.last_viewed_slide_index;
    if (Object.keys(patch).length === 0) throw new ApiError(400, "Nothing to update");

    const supabase = await createServerClient();
    const { data, error } = await supabase.from("decks").update(patch).eq("id", id).select("*").single();
    if (error) throw error;
    return Response.json({ deck: data });
  });
}

/** DELETE /api/decks/:id — soft-delete (owner only, PRD §4.11). */
export async function DELETE(_req: Request, { params }: Ctx) {
  return handle(async () => {
    const { id } = await params;
    const user = await requireUser();
    await assertDeckOwner(id, user.id);

    const supabase = await createServerClient();
    const { error } = await supabase.from("decks").update({ deleted_at: new Date().toISOString() }).eq("id", id);
    if (error) throw error;
    return Response.json({ ok: true });
  });
}

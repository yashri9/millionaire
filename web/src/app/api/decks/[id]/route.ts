import { requireUser } from "@/lib/auth";
import { assertDeckOwner } from "@/lib/ownership";
import { handle, notImplemented } from "@/lib/http";
import { createServerClient } from "@/lib/supabase/server";

type Ctx = { params: Promise<{ id: string }> };

/** GET /api/decks/:id — deck + slides + latest script (owner only). */
export async function GET(_req: Request, { params }: Ctx) {
  return handle(async () => {
    const { id } = await params;
    const user = await requireUser();
    await assertDeckOwner(id, user.id);

    const supabase = await createServerClient();
    const [{ data: deck }, { data: slides }, { data: script }] = await Promise.all([
      supabase.from("decks").select("*").eq("id", id).single(),
      supabase.from("slides").select("*").eq("deck_id", id).order("order_index"),
      supabase
        .from("script_versions")
        .select("*")
        .eq("deck_id", id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
    return Response.json({ deck, slides: slides ?? [], script });
  });
}

/** PATCH /api/decks/:id — update title / last_viewed_slide_index (owner only). */
export async function PATCH(_req: Request, { params }: Ctx) {
  return handle(async () => {
    const { id } = await params;
    const user = await requireUser();
    await assertDeckOwner(id, user.id);
    return notImplemented("Update title / last_viewed_slide_index");
  });
}

/** DELETE /api/decks/:id — soft-delete (owner only, PRD §4.11). */
export async function DELETE(_req: Request, { params }: Ctx) {
  return handle(async () => {
    const { id } = await params;
    const user = await requireUser();
    await assertDeckOwner(id, user.id);
    return notImplemented("Set deleted_at = now() (30-day soft-delete window)");
  });
}

import { requireUser } from "@/lib/auth";
import { assertDeckOwner } from "@/lib/ownership";
import { handle, ApiError } from "@/lib/http";
import { createServerClient } from "@/lib/supabase/server";

type Ctx = { params: Promise<{ id: string }> };
type Narration = { slide_id: string; text: string }[];

/**
 * PATCH /api/decks/:id/script — autosave narration edits (PRD §4.7).
 * Lightweight, debounced from the client (1.5s). Updates the current DRAFT
 * script_versions row; if the latest row is already published (post-publish
 * edit) a new draft row is created instead, per the deck state machine
 * (published -> draft on edit, existing share/token untouched until republish).
 */
export async function PATCH(req: Request, { params }: Ctx) {
  return handle(async () => {
    const { id } = await params;
    const user = await requireUser();
    const deck = await assertDeckOwner(id, user.id);

    const body = (await req.json()) as { narration?: Narration };
    if (!Array.isArray(body.narration)) throw new ApiError(400, "narration must be an array");

    const supabase = await createServerClient();
    const { data: latest } = await supabase
      .from("script_versions")
      .select("id, is_published")
      .eq("deck_id", id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    let script;
    if (latest && !latest.is_published) {
      const { data, error } = await supabase
        .from("script_versions")
        .update({ narration: body.narration })
        .eq("id", latest.id)
        .select("*")
        .single();
      if (error) throw error;
      script = data;
    } else {
      const { data, error } = await supabase
        .from("script_versions")
        .insert({ deck_id: id, is_published: false, narration: body.narration })
        .select("*")
        .single();
      if (error) throw error;
      script = data;
    }

    if (deck.status === "published") {
      await supabase.from("decks").update({ status: "draft" }).eq("id", id);
    }

    return Response.json({ script });
  });
}

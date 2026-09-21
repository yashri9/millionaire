import { requireUser, assertEmailVerified } from "@/lib/auth";
import { assertDeckOwner } from "@/lib/ownership";
import { handle, ApiError } from "@/lib/http";
import { createServerClient } from "@/lib/supabase/server";
import { generateShareToken } from "@/lib/tokens";
import { publicEnv } from "@/lib/env";

type Ctx = { params: Promise<{ id: string }> };

/**
 * POST /api/decks/:id/publish — validate + snapshot + create/rotate share
 * (PRD §4.8). Publish requires verified email + every slide has narration +
 * at least one slide.
 *
 * Adopted §14 default: republishing creates a NEW immutable script_versions
 * snapshot; the existing share token is preserved (links already sent keep
 * working) — only the share's script_version_id pointer advances.
 */
export async function POST(_req: Request, { params }: Ctx) {
  return handle(async () => {
    const { id } = await params;
    const user = await requireUser();
    assertEmailVerified(user);
    await assertDeckOwner(id, user.id);

    const supabase = await createServerClient();
    const [{ data: slides }, { data: draft }] = await Promise.all([
      supabase.from("slides").select("id").eq("deck_id", id).order("order_index"),
      supabase
        .from("script_versions")
        .select("id, narration")
        .eq("deck_id", id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    if (!slides || slides.length === 0) throw new ApiError(409, "Add at least one slide before publishing");
    if (!draft) throw new ApiError(409, "Generate a script before publishing");

    const narrationBySlide = new Map<string, string>(
      (draft.narration as { slide_id: string; text: string }[]).map((n) => [n.slide_id, n.text]),
    );
    const missing = slides.filter((s) => !narrationBySlide.get(s.id)?.trim());
    if (missing.length > 0) {
      throw new ApiError(409, `${missing.length} slide(s) are missing narration — finish the script before publishing`);
    }

    const { data: snapshot, error: snapshotError } = await supabase
      .from("script_versions")
      .insert({ deck_id: id, is_published: true, narration: draft.narration })
      .select("id")
      .single();
    if (snapshotError || !snapshot) throw snapshotError ?? new Error("Failed to snapshot the script");

    const { data: existingShare } = await supabase
      .from("shares")
      .select("id, token")
      .eq("deck_id", id)
      .eq("status", "active")
      .maybeSingle();

    let token: string;
    if (existingShare) {
      const { error } = await supabase
        .from("shares")
        .update({ script_version_id: snapshot.id })
        .eq("id", existingShare.id);
      if (error) throw error;
      token = existingShare.token;
    } else {
      token = generateShareToken();
      const { error } = await supabase
        .from("shares")
        .insert({ deck_id: id, token, script_version_id: snapshot.id, status: "active" });
      if (error) throw error;
    }

    await supabase.from("decks").update({ status: "published" }).eq("id", id);

    return Response.json({ token, url: `${publicEnv.appUrl}/d/${token}` });
  });
}

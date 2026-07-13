import { requireUser } from "@/lib/auth";
import { assertDeckOwner } from "@/lib/ownership";
import { handle, ApiError } from "@/lib/http";
import { createServerClient } from "@/lib/supabase/server";
import { regenerateOneLine } from "@/lib/prompts";
import { LLMError } from "@/lib/llm";

type Ctx = { params: Promise<{ id: string }> };
type Narration = { slide_id: string; text: string }[];

/**
 * POST /api/decks/:id/script/regenerate-line — rewrite narration for one slide
 * while keeping the rest of the deck's arc intact.
 */
export async function POST(req: Request, { params }: Ctx) {
  return handle(async () => {
    const { id } = await params;
    const user = await requireUser();
    const deck = await assertDeckOwner(id, user.id);

    const body = (await req.json()) as { slide_id?: string };
    if (!body.slide_id) throw new ApiError(400, "slide_id is required");

    const supabase = await createServerClient();
    const { data: slides, error: slidesError } = await supabase
      .from("slides")
      .select("id, order_index, title, bullets")
      .eq("deck_id", id)
      .order("order_index");
    if (slidesError) throw slidesError;
    if (!slides || slides.length === 0) throw new ApiError(409, "This deck has no slides");

    const targetIndex = slides.findIndex((s) => s.id === body.slide_id);
    if (targetIndex === -1) throw new ApiError(404, "Slide not found");

    const { data: latest } = await supabase
      .from("script_versions")
      .select("id, is_published, narration")
      .eq("deck_id", id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const existingById: Record<string, string> = {};
    if (latest && Array.isArray(latest.narration)) {
      for (const n of latest.narration as Narration) existingById[n.slide_id] = n.text;
    }

    const slideInputs = slides.map((s) => ({
      index: s.order_index,
      title: s.title ?? undefined,
      text: [s.title, ...(s.bullets ?? [])].filter(Boolean).join("\n"),
    }));
    const existingLines = slides.map((s) => existingById[s.id] ?? "");

    let newLine: string;
    try {
      newLine = await regenerateOneLine(slideInputs, existingLines, targetIndex);
    } catch (err) {
      if (err instanceof LLMError) throw new ApiError(502, err.message);
      throw new ApiError(502, "The model returned something we couldn't use. Try again.");
    }

    const narration: Narration = slides.map((s) => ({
      slide_id: s.id,
      text: s.id === body.slide_id ? newLine : (existingById[s.id] ?? ""),
    }));

    let script;
    if (latest && !latest.is_published) {
      const { data, error } = await supabase
        .from("script_versions")
        .update({ narration })
        .eq("id", latest.id)
        .select("*")
        .single();
      if (error) throw error;
      script = data;
    } else {
      const { data, error } = await supabase
        .from("script_versions")
        .insert({ deck_id: id, is_published: false, narration })
        .select("*")
        .single();
      if (error) throw error;
      script = data;
    }

    if (deck.status === "published") {
      await supabase.from("decks").update({ status: "draft" }).eq("id", id);
    }

    return Response.json({ narration: newLine, slide_id: body.slide_id, script });
  });
}

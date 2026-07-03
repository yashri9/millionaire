import { requireUser } from "@/lib/auth";
import { assertDeckOwner } from "@/lib/ownership";
import { handle, ApiError } from "@/lib/http";
import { createServerClient } from "@/lib/supabase/server";
import { generateNarration } from "@/lib/prompts";
import { LLMError } from "@/lib/llm";

type Ctx = { params: Promise<{ id: string }> };

/**
 * POST /api/decks/:id/generate-script — call the LLM to draft narration and
 * create a draft script_versions row (PRD §4.6). Explicit user action only;
 * always creates a fresh draft row rather than mutating in place, so a bad
 * regenerate never destroys the slides that fed it.
 */
export async function POST(_req: Request, { params }: Ctx) {
  return handle(async () => {
    const { id } = await params;
    const user = await requireUser();
    await assertDeckOwner(id, user.id);

    const supabase = await createServerClient();
    const { data: slides, error: slidesError } = await supabase
      .from("slides")
      .select("id, order_index, title, bullets")
      .eq("deck_id", id)
      .order("order_index");
    if (slidesError) throw slidesError;
    if (!slides || slides.length === 0) throw new ApiError(409, "This deck has no slides to write narration for");

    let lines: string[];
    try {
      lines = await generateNarration(
        slides.map((s) => ({
          index: s.order_index,
          title: s.title,
          text: [s.title, ...(s.bullets ?? [])].filter(Boolean).join("\n"),
        })),
      );
    } catch (err) {
      if (err instanceof LLMError) throw new ApiError(502, err.message);
      throw new ApiError(502, "The model returned something we couldn't use. Try again.");
    }

    const narration = slides.map((s, i) => ({ slide_id: s.id, text: lines[i] ?? "" }));
    const { data: version, error: versionError } = await supabase
      .from("script_versions")
      .insert({ deck_id: id, is_published: false, narration })
      .select("*")
      .single();
    if (versionError) throw versionError;

    return Response.json({ script: version });
  });
}

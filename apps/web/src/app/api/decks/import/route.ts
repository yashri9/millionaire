import { requireUser } from "@/lib/auth";
import { handle, ApiError } from "@/lib/http";
import { createServerClient } from "@/lib/supabase/server";

type ImportSlide = {
  order_index: number;
  title?: string;
  bullets?: string[];
  script?: string;
};

/**
 * POST /api/decks/import — promote a device draft (parsed slides + scripts)
 * into a real cloud deck. Used when the original PDF is no longer available
 * but the user still has local slide content.
 */
export async function POST(request: Request) {
  return handle(async () => {
    const user = await requireUser();
    const body = (await request.json()) as {
      title?: string;
      slides?: ImportSlide[];
    };

    const title =
      typeof body.title === "string" && body.title.trim()
        ? body.title.trim()
        : "Untitled deck";
    const slides = Array.isArray(body.slides) ? body.slides : [];
    if (slides.length === 0) {
      throw new ApiError(400, "At least one slide is required to import a draft");
    }

    const supabase = await createServerClient();
    const { data: deck, error: insertError } = await supabase
      .from("decks")
      .insert({
        user_id: user.id,
        title,
        status: "draft",
        rendered: false,
        render_warning: "Imported from a device draft (no source PDF / page images).",
      })
      .select("id, title, status, created_at, updated_at")
      .single();
    if (insertError || !deck) {
      throw insertError ?? new Error("Failed to create deck");
    }

    const ordered = [...slides].sort((a, b) => a.order_index - b.order_index);
    const { data: insertedSlides, error: slidesError } = await supabase
      .from("slides")
      .insert(
        ordered.map((s, i) => ({
          deck_id: deck.id,
          order_index: Number.isFinite(s.order_index) ? s.order_index : i + 1,
          title: (s.title ?? `Slide ${i + 1}`).slice(0, 500),
          bullets: Array.isArray(s.bullets) ? s.bullets : [],
        })),
      )
      .select("id, order_index");
    if (slidesError) throw slidesError;

    const byOrder = new Map(
      (insertedSlides ?? []).map((s) => [s.order_index, s.id] as const),
    );
    const narration = ordered.map((s, i) => {
      const order = Number.isFinite(s.order_index) ? s.order_index : i + 1;
      return {
        slide_id: byOrder.get(order) ?? "",
        text: typeof s.script === "string" ? s.script : "",
      };
    }).filter((n) => n.slide_id);

    if (narration.length > 0) {
      const { error: scriptError } = await supabase.from("script_versions").insert({
        deck_id: deck.id,
        is_published: false,
        narration,
      });
      if (scriptError) throw scriptError;
    }

    return Response.json({ deck }, { status: 201 });
  });
}

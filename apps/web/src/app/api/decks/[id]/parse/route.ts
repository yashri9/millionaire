import { requireUser } from "@/lib/auth";
import { assertDeckOwner } from "@/lib/ownership";
import { handle, ApiError } from "@/lib/http";
import { createServerClient, createServiceClient } from "@/lib/supabase/server";
import { processDeckUpload, buildRenderWarning } from "@/lib/deckProcessor";
import { uploadRenderedImages } from "@/lib/storage";
import { serverEnv } from "@/lib/env";

type Ctx = { params: Promise<{ id: string }> };

/**
 * POST /api/decks/:id/parse — retry parsing after a parse_failed upload
 * (PRD §6). Re-downloads the stored source file and re-runs the parse +
 * render pipeline, replacing any previously-parsed slides.
 */
export async function POST(_req: Request, { params }: Ctx) {
  return handle(async () => {
    const { id } = await params;
    const user = await requireUser();
    await assertDeckOwner(id, user.id);

    const supabase = await createServerClient();
    const { data: full } = await supabase.from("decks").select("source_file_url").eq("id", id).single();
    if (!full?.source_file_url) throw new ApiError(409, "No uploaded file to parse for this deck");

    const storage = createServiceClient();
    const { data: blob, error: downloadError } = await storage.storage
      .from(serverEnv.decksBucket)
      .download(full.source_file_url);
    if (downloadError || !blob) throw new ApiError(502, `Could not read the stored file: ${downloadError?.message}`);

    const filename = full.source_file_url.split("/").pop() ?? "upload";
    const basePath = `${user.id}/${id}`;
    const bytes = await blob.arrayBuffer();

    try {
      const processed = await processDeckUpload(bytes, filename);
      const { paths: imagePaths, failedSlides } = await uploadRenderedImages(storage, basePath, processed.images);
      const { rendered, render_warning } = buildRenderWarning(processed, failedSlides);

      await supabase.from("slides").delete().eq("deck_id", id);
      const { error: slidesError } = await supabase.from("slides").insert(
        processed.slides.map((s) => ({
          deck_id: id,
          order_index: s.order_index,
          title: s.title,
          bullets: s.bullets,
          image_path: imagePaths.get(s.order_index)?.image_path ?? null,
          thumb_path: imagePaths.get(s.order_index)?.thumb_path ?? null,
        })),
      );
      if (slidesError) throw slidesError;

      const { data: updated } = await supabase
        .from("decks")
        .update({ status: "draft", rendered, render_warning })
        .eq("id", id)
        .select("*")
        .single();
      return Response.json({ deck: updated, warning: render_warning });
    } catch (err) {
      await supabase.from("decks").update({ status: "parse_failed" }).eq("id", id);
      throw new ApiError(422, `Parsing failed: ${(err as Error).message}`);
    }
  });
}

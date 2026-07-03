import { requireUser } from "@/lib/auth";
import { handle, ApiError } from "@/lib/http";
import { createServerClient, createServiceClient } from "@/lib/supabase/server";
import { parseDeck, validateUpload } from "@/lib/parse";
import { serverEnv } from "@/lib/env";

/** GET /api/decks — list the authenticated user's decks (PRD §6). */
export async function GET() {
  return handle(async () => {
    const user = await requireUser();
    const supabase = await createServerClient();
    const { data, error } = await supabase
      .from("decks")
      .select("id, title, status, last_viewed_slide_index, created_at, updated_at")
      .eq("user_id", user.id)
      .is("deleted_at", null)
      .order("updated_at", { ascending: false });
    if (error) throw error;
    return Response.json({ decks: data ?? [] });
  });
}

/**
 * POST /api/decks — upload a .pptx/.pdf, store it, and parse it into slides
 * (PRD §4.5). Parsing runs inline (synchronously) rather than through a
 * background job queue — deliberate simplification for v1: officeparser/
 * pdf-parse are fast enough at the 25MB cap that a queue + poller (lib/jobs.ts)
 * would be infra without a matching need yet.
 */
export async function POST(request: Request) {
  return handle(async () => {
    const user = await requireUser();

    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw new ApiError(400, "No file uploaded");

    const validationError = validateUpload(file.name, file.size);
    if (validationError) throw new ApiError(400, validationError);

    const supabase = await createServerClient();
    const title = file.name.replace(/\.(pptx|pdf)$/i, "") || "Untitled deck";

    const { data: deck, error: insertError } = await supabase
      .from("decks")
      .insert({ user_id: user.id, title, status: "uploading" })
      .select("id, title, status, last_viewed_slide_index, created_at, updated_at")
      .single();
    if (insertError || !deck) throw insertError ?? new Error("Failed to create deck");

    const bytes = await file.arrayBuffer();

    // Storage bucket has no configured RLS policies (kept private per
    // supabase/README.md — read/write only ever happens server-side), so we
    // use the service-role client here, same as the recipient path.
    const storage = createServiceClient();
    const storagePath = `${user.id}/${deck.id}/${file.name}`;
    const { error: uploadError } = await storage.storage
      .from(serverEnv.decksBucket)
      .upload(storagePath, bytes, { contentType: file.type || undefined, upsert: true });
    if (uploadError) {
      await supabase.from("decks").update({ status: "parse_failed" }).eq("id", deck.id);
      throw new ApiError(502, `Could not store the upload: ${uploadError.message}`);
    }
    await supabase.from("decks").update({ source_file_url: storagePath }).eq("id", deck.id);

    try {
      const { slides } = await parseDeck(bytes, file.name);
      const { error: slidesError } = await supabase.from("slides").insert(
        slides.map((s) => ({
          deck_id: deck.id,
          order_index: s.order_index,
          title: s.title,
          bullets: s.bullets,
        })),
      );
      if (slidesError) throw slidesError;

      const { data: updated } = await supabase
        .from("decks")
        .update({ status: "draft" })
        .eq("id", deck.id)
        .select("id, title, status, last_viewed_slide_index, created_at, updated_at")
        .single();
      return Response.json({ deck: updated ?? deck }, { status: 201 });
    } catch (err) {
      await supabase.from("decks").update({ status: "parse_failed" }).eq("id", deck.id);
      return Response.json(
        {
          deck: { ...deck, status: "parse_failed" },
          warning: `Upload saved, but parsing failed: ${(err as Error).message}`,
        },
        { status: 201 },
      );
    }
  });
}

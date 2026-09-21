import { requireUser } from "@/lib/auth";
import { handle, ApiError } from "@/lib/http";
import { createServerClient, createServiceClient } from "@/lib/supabase/server";
import { validateUpload } from "@/lib/parse";
import { serverEnv } from "@/lib/env";

/**
 * POST /api/decks/prepare — create a draft deck and a signed Storage upload URL.
 * The browser uploads the PDF directly (avoids Vercel's 4.5MB body cap), then
 * POST /api/decks/:id/parse to process it.
 */
export async function POST(request: Request) {
  return handle(async () => {
    const user = await requireUser();
    const body = (await request.json().catch(() => ({}))) as {
      filename?: string;
      size?: number;
      contentType?: string;
    };
    const filename = String(body.filename ?? "").trim();
    const size = Number(body.size ?? 0);
    if (!filename) throw new ApiError(400, "filename is required");

    const validationError = validateUpload(filename, size);
    if (validationError) throw new ApiError(400, validationError);

    const supabase = await createServerClient();
    const title = filename.replace(/\.(pptx|pdf)$/i, "") || "Untitled deck";
    const { data: deck, error: insertError } = await supabase
      .from("decks")
      .insert({ user_id: user.id, title, status: "uploading" })
      .select("id, title, status, created_at, updated_at")
      .single();
    if (insertError || !deck) {
      throw insertError ?? new Error("Failed to create deck");
    }

    const storage = createServiceClient();
    const path = `${user.id}/${deck.id}/${filename}`;
    const { data: signed, error: signError } = await storage.storage
      .from(serverEnv.decksBucket)
      .createSignedUploadUrl(path);

    if (signError || !signed?.signedUrl) {
      await supabase.from("decks").update({ status: "parse_failed" }).eq("id", deck.id);
      throw new ApiError(502, `Could not create upload URL: ${signError?.message ?? "unknown"}`);
    }

    await supabase.from("decks").update({ source_file_url: path }).eq("id", deck.id);

    return Response.json({
      deck,
      path,
      token: signed.token,
      signedUrl: signed.signedUrl,
      contentType: body.contentType || "application/pdf",
    });
  });
}

import { requireUser } from "@/lib/auth";
import { handle, ApiError } from "@/lib/http";
import { createServerClient } from "@/lib/supabase/server";
import { validateUpload } from "@/lib/parse";
import { publicEnv } from "@/lib/env";

/**
 * POST /api/decks/prepare — create a draft deck row and return TUS upload target.
 * Browser uploads directly to *.storage.supabase.co (not through Vercel).
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

    const path = `${user.id}/${deck.id}/${filename}`;
    await supabase.from("decks").update({ source_file_url: path }).eq("id", deck.id);

    const projectUrl = publicEnv.supabaseUrl.replace(/\/$/, "");
    // Prefer direct Storage hostname for TUS (avoids proxy JWS issues).
    const tusEndpoint = projectUrl.includes(".supabase.co")
      ? projectUrl.replace("://", "://").replace(".supabase.co", ".storage.supabase.co") +
        "/storage/v1/upload/resumable"
      : `${projectUrl}/storage/v1/upload/resumable`;

    // Fix hostname construction: https://xxx.supabase.co → https://xxx.storage.supabase.co
    const directHost = (() => {
      try {
        const u = new URL(projectUrl);
        if (u.hostname.endsWith(".supabase.co") && !u.hostname.includes(".storage.")) {
          u.hostname = u.hostname.replace(".supabase.co", ".storage.supabase.co");
        }
        return `${u.origin}/storage/v1/upload/resumable`;
      } catch {
        return tusEndpoint;
      }
    })();

    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.access_token) {
      throw new ApiError(401, "Session expired. Please sign in again.");
    }

    return Response.json({
      deck,
      path,
      contentType: body.contentType || "application/pdf",
      tus: {
        endpoint: directHost,
        bucketName: process.env.SUPABASE_DECKS_BUCKET || "decks",
        objectName: path,
        accessToken: session.access_token,
        anonKey: publicEnv.supabaseAnonKey,
        chunkSize: 6 * 1024 * 1024,
        retryDelays: [0, 3000, 5000, 10000, 20000],
      },
    });
  });
}

import { requireUser } from "@/lib/auth";
import { handle, notImplemented } from "@/lib/http";
import { createServerClient } from "@/lib/supabase/server";

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
 * POST /api/decks — create a deck (upload trigger, PRD §4.5).
 * TODO(phase1): accept multipart file, validate type/size (lib/parse
 * validateUpload), store to Supabase Storage, insert deck(status=uploading) +
 * enqueue parse job (lib/jobs).
 */
export async function POST() {
  return handle(async () => {
    await requireUser();
    return notImplemented("Store upload to Storage, insert deck row, enqueue parse job");
  });
}

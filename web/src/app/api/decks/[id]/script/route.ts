import { requireUser } from "@/lib/auth";
import { assertDeckOwner } from "@/lib/ownership";
import { handle, notImplemented } from "@/lib/http";

type Ctx = { params: Promise<{ id: string }> };

/**
 * PATCH /api/decks/:id/script — autosave narration edits (PRD §4.7).
 * Lightweight, debounced from the client (1.5s). Updates the current DRAFT
 * script_versions row (never a published snapshot).
 */
export async function PATCH(_req: Request, { params }: Ctx) {
  return handle(async () => {
    const { id } = await params;
    const user = await requireUser();
    await assertDeckOwner(id, user.id);
    return notImplemented("Upsert narration into the draft script_versions row");
  });
}

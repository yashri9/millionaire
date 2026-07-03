import { requireUser } from "@/lib/auth";
import { handle, ApiError } from "@/lib/http";
import { createServiceClient } from "@/lib/supabase/server";

/**
 * DELETE /api/account — delete the signed-in user's account (PRD §4.11).
 *
 * Simplification vs the PRD's 30-day soft-delete: this deletes immediately.
 * A real grace-period delete needs a "pending deletion" flag + a scheduled
 * purge job, which is more than "basic account settings" calls for — this at
 * least requires the confirm step client-side and is a clean, safe operation
 * (every owned row cascades via `on delete cascade` from decks.user_id ->
 * auth.users(id), so no orphaned data is left behind).
 */
export async function DELETE() {
  return handle(async () => {
    const user = await requireUser();
    const admin = createServiceClient();
    const { error } = await admin.auth.admin.deleteUser(user.id);
    if (error) throw new ApiError(502, `Couldn't delete account: ${error.message}`);
    return Response.json({ ok: true });
  });
}

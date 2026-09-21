import "server-only";

/**
 * Ownership enforcement (PRD §11): every deck/script/share mutation must verify
 * the row belongs to the authenticated user SERVER-SIDE. Never trust a
 * client-supplied user_id or an unchecked deck id.
 *
 * Note: RLS in the DB is the primary guard, but we also assert here so routes
 * fail fast with a clean 403/404 and the intent is explicit in code.
 */
import { createServerClient } from "@/lib/supabase/server";
import { ApiError } from "@/lib/http";

export async function assertDeckOwner(deckId: string, userId: string) {
  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from("decks")
    .select("id, user_id, status, deleted_at")
    .eq("id", deckId)
    .is("deleted_at", null)
    .single();

  if (error || !data) throw new ApiError(404, "Deck not found");
  if (data.user_id !== userId) throw new ApiError(403, "You don't have access to this deck");
  return data;
}

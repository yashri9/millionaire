import "server-only";

/**
 * recipient.ts — server-side lookup for the public /d/[token] runtime.
 *
 * Uses the SERVICE ROLE client (bypasses RLS) because the recipient has no
 * login. Only ever returns PUBLISHED content for an ACTIVE share, and only the
 * fields a prospect should see — never deck ownership internals.
 *
 * Shared by the recipient page (SSR) and the /api/d/[token] routes so the
 * "active share -> published version -> slides + narration" resolution lives
 * in exactly one place.
 */
import { createServiceClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/env";

export type RecipientDeck = {
  token: string;
  deckId: string;
  shareId: string;
  scriptVersionId: string;
  repName: string;
  title: string;
  slides: { index: number; title: string; bullets: string[]; narration: string; text: string }[];
};

export type RecipientLookup =
  | { ok: true; deck: RecipientDeck }
  | { ok: false; reason: "inactive" | "not_found" | "unconfigured" };

/** Creates a session row for a fresh recipient page view (PRD §4.10/§4.12). */
export async function createSession(shareId: string): Promise<string | null> {
  const db = createServiceClient();
  const { data, error } = await db.from("sessions").insert({ share_id: shareId }).select("id").single();
  if (error || !data) return null;
  return data.id;
}

export async function getPublishedDeckByToken(token: string): Promise<RecipientLookup> {
  if (!isSupabaseConfigured()) return { ok: false, reason: "unconfigured" };

  const db = createServiceClient();

  const { data: share } = await db
    .from("shares")
    .select("id, deck_id, script_version_id, status")
    .eq("token", token)
    .single();

  if (!share) return { ok: false, reason: "not_found" };
  if (share.status !== "active") return { ok: false, reason: "inactive" };

  const [{ data: deck }, { data: slides }, { data: version }] = await Promise.all([
    db.from("decks").select("id, title").eq("id", share.deck_id).single(),
    db.from("slides").select("order_index, title, bullets, id").eq("deck_id", share.deck_id).order("order_index"),
    db.from("script_versions").select("narration").eq("id", share.script_version_id).single(),
  ]);

  if (!deck || !slides) return { ok: false, reason: "not_found" };

  const narrationBySlide = new Map<string, string>(
    (version?.narration ?? []).map((n: { slide_id: string; text: string }) => [n.slide_id, n.text]),
  );

  return {
    ok: true,
    deck: {
      token,
      deckId: deck.id,
      shareId: share.id,
      scriptVersionId: share.script_version_id,
      // rep_name lives on the sender profile in the real build; TODO wire it.
      repName: "the rep",
      title: deck.title,
      slides: slides.map((s: { order_index: number; title: string; bullets: string[]; id: string }) => ({
        index: s.order_index,
        title: s.title,
        bullets: s.bullets ?? [],
        narration: narrationBySlide.get(s.id) ?? "",
        // Grounds answerQuestion() (lib/prompts.ts reads SlideInput.text) —
        // without this, Q&A was answering from empty per-slide content.
        text: [s.title, ...(s.bullets ?? [])].filter(Boolean).join("\n"),
      })),
    },
  };
}

import type { Highlight } from "@/lib/highlight-store";
import type { DeckSlide, StoredDeck } from "@/lib/deck-store";

/** Immutable snapshot of a published deck — same schema as editor persistence. */
export type PublishedShare = {
  token: string;
  deckId: string;
  title: string;
  revision: number;
  publishedAt: number;
  slides: DeckSlide[];
  /** slideKey (e.g. "01") → highlights */
  highlights: Record<string, Highlight[]>;
};

const KEY = (token: string) => `voxdeck:share:${token}`;
const KEY_BY_DECK = (deckId: string) => `voxdeck:share-token:${deckId}`;

export function saveShare(share: PublishedShare) {
  localStorage.setItem(KEY(share.token), JSON.stringify(share));
  localStorage.setItem(KEY_BY_DECK(share.deckId), share.token);
  window.dispatchEvent(new CustomEvent("voxdeck:share", { detail: { token: share.token } }));
}

export function getShare(token: string): PublishedShare | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(KEY(token));
    return raw ? (JSON.parse(raw) as PublishedShare) : null;
  } catch {
    return null;
  }
}

export function getShareTokenForDeck(deckId: string): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(KEY_BY_DECK(deckId));
}

export function publishDeckSnapshot(opts: {
  deck: StoredDeck;
  highlights: Record<string, Highlight[]>;
  token?: string;
}): PublishedShare {
  const existing = getShareTokenForDeck(opts.deck.id);
  const token =
    opts.token ||
    existing ||
    (typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID().slice(0, 10)
      : Math.random().toString(36).slice(2, 12));

  const share: PublishedShare = {
    token,
    deckId: opts.deck.id,
    title: opts.deck.title,
    revision: opts.deck.revision ?? 0,
    publishedAt: Date.now(),
    slides: opts.deck.slides,
    highlights: opts.highlights,
  };
  saveShare(share);
  return share;
}

/** Drop the local record of a deck's link (after unpublish/revoke). */
export function forgetShare(deckId: string) {
  const token = getShareTokenForDeck(deckId);
  if (token) localStorage.removeItem(KEY(token));
  localStorage.removeItem(KEY_BY_DECK(deckId));
  window.dispatchEvent(new CustomEvent("voxdeck:share", { detail: { token: null } }));
}

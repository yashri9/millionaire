// Client-side deck store — persists uploaded decks in localStorage per-id.
// Falls back to the demo seed deck for id "01" when nothing is uploaded.
import { SEED_SLIDES, type SeedSlide } from "@/lib/deck-seed";

export type SlideWord = {
  text: string;
  x: number;  // 0..1 (left, from top-left origin)
  y: number;  // 0..1 (top)
  w: number;  // 0..1
  h: number;  // 0..1
};

export type DeckSlide = SeedSlide & {
  thumbnail?: string;  // data URL of rendered page (small)
  pageText?: string;   // original extracted text
  words?: SlideWord[]; // word-level bboxes from the PDF text layer
};

export type StoredDeck = {
  id: string;
  title: string;
  createdAt: number;
  slides: DeckSlide[];
};

const KEY_DECK = (id: string) => `voxdeck:deck:${id}`;
const KEY_INDEX = "voxdeck:decks";

export function saveDeck(deck: StoredDeck) {
  localStorage.setItem(KEY_DECK(deck.id), JSON.stringify(deck));
  const list = listDecks().filter((d) => d.id !== deck.id);
  list.unshift({ id: deck.id, title: deck.title, createdAt: deck.createdAt, count: deck.slides.length });
  localStorage.setItem(KEY_INDEX, JSON.stringify(list));
  window.dispatchEvent(new CustomEvent("voxdeck:decks"));
}

export function getDeck(id: string): StoredDeck | null {
  try {
    const raw = localStorage.getItem(KEY_DECK(id));
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export type DeckIndexEntry = { id: string; title: string; createdAt: number; count: number };

export function listDecks(): DeckIndexEntry[] {
  try {
    const raw = localStorage.getItem(KEY_INDEX);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

export function deleteDeck(id: string) {
  localStorage.removeItem(KEY_DECK(id));
  const list = listDecks().filter((d) => d.id !== id);
  localStorage.setItem(KEY_INDEX, JSON.stringify(list));
  window.dispatchEvent(new CustomEvent("voxdeck:decks"));
}

/** Load slides for editor/preview — user-uploaded deck first, seed fallback. */
export function loadSlidesFor(id: string): { title: string; slides: DeckSlide[] } {
  const stored = getDeck(id);
  if (stored) return { title: stored.title, slides: stored.slides };
  return { title: "Scapia · Series B Fundraise", slides: SEED_SLIDES };
}

export function newDeckId(): string {
  // short, URL-friendly
  return Math.random().toString(36).slice(2, 8);
}

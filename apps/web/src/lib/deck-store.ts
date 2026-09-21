// Client-side deck store — persists uploaded decks in localStorage per-id.
import type { SeedSlide } from "@/lib/deck-seed";
import type { GenerationMethod, SlideContent } from "@voxdeck/narration";
import type { Highlight } from "@/lib/highlight-store";

export type SlideWord = {
  text: string;
  x: number; // 0..1 (left, from top-left origin)
  y: number; // 0..1 (top)
  w: number; // 0..1
  h: number; // 0..1
};

export type DeckSlide = SeedSlide & {
  /** Pitch-critical claims for this slide (editable). */
  essentialPoints?: string[];
  thumbnail?: string; // data URL of rendered page (small)
  pageText?: string; // original extracted text
  words?: SlideWord[]; // word-level bboxes from the PDF text layer
  /** Structured content used for grounded generation. */
  slideContent?: SlideContent;
  /** How the current script was produced. */
  generationMethod?: GenerationMethod;
  /** Gate / fallback notes (number-mismatch, chart-bridge, etc.). */
  lowConfidenceFlags?: string[];
};

export type StoredDeck = {
  id: string;
  title: string;
  createdAt: number;
  /** Monotonic persistence revision — bumped on every successful save. */
  revision?: number;
  updatedAt?: number;
  slides: DeckSlide[];
  /**
   * Highlights keyed by slide number (`"01"`, …).
   * Single source of truth when present; legacy `voxdeck:highlights:*` is migrated in.
   */
  highlights?: Record<string, Highlight[]>;
};

const KEY_DECK = (id: string) => `voxdeck:deck:${id}`;
const KEY_INDEX = "voxdeck:decks";
const KEY_HIGHLIGHTS_LEGACY = (id: string) => `voxdeck:highlights:${id}`;

function readLegacyHighlights(id: string): Record<string, Highlight[]> {
  try {
    const raw = localStorage.getItem(KEY_HIGHLIGHTS_LEGACY(id));
    return raw ? (JSON.parse(raw) as Record<string, Highlight[]>) : {};
  } catch {
    return {};
  }
}

function normalizeDeck(deck: StoredDeck): StoredDeck {
  let highlights = deck.highlights ?? {};
  if (Object.keys(highlights).length === 0) {
    highlights = readLegacyHighlights(deck.id);
  } else {
    // Seed legacy working copy once so editor/preview share the same key
    try {
      const legacy = localStorage.getItem(KEY_HIGHLIGHTS_LEGACY(deck.id));
      if (!legacy) {
        localStorage.setItem(KEY_HIGHLIGHTS_LEGACY(deck.id), JSON.stringify(highlights));
      }
    } catch {
      /* ignore */
    }
  }
  return {
    ...deck,
    revision: deck.revision ?? 0,
    updatedAt: deck.updatedAt ?? deck.createdAt,
    highlights,
  };
}

export function saveDeck(deck: StoredDeck) {
  const next: StoredDeck = {
    ...deck,
    revision: deck.revision ?? 0,
    updatedAt: deck.updatedAt ?? Date.now(),
    highlights: deck.highlights ?? {},
  };
  localStorage.setItem(KEY_DECK(next.id), JSON.stringify(next));
  // Keep legacy highlight key in sync for older readers
  localStorage.setItem(KEY_HIGHLIGHTS_LEGACY(next.id), JSON.stringify(next.highlights ?? {}));
  const list = listDecks().filter((d) => d.id !== next.id);
  list.unshift({
    id: next.id,
    title: next.title,
    createdAt: next.createdAt,
    count: next.slides.length,
  });
  localStorage.setItem(KEY_INDEX, JSON.stringify(list));
  window.dispatchEvent(new CustomEvent("voxdeck:decks"));
  window.dispatchEvent(
    new CustomEvent("voxdeck:highlights", { detail: { deckId: next.id } }),
  );
}

/**
 * Persist a full deck snapshot at a specific local revision.
 * Returns the new stored revision (server/local confirmation).
 */
export function persistDeckRevision(
  deckId: string,
  patch: {
    title?: string;
    slides?: DeckSlide[];
    highlights?: Record<string, Highlight[]>;
  },
  localRevision: number,
): { ok: true; revision: number; updatedAt: number } | { ok: false; error: string } {
  try {
    const existing = getDeck(deckId);
    if (!existing) {
      return { ok: false, error: "Deck not found" };
    }
    const updatedAt = Date.now();
    const next: StoredDeck = {
      ...existing,
      title: patch.title ?? existing.title,
      slides: patch.slides ?? existing.slides,
      highlights: patch.highlights ?? existing.highlights ?? {},
      revision: localRevision,
      updatedAt,
    };
    saveDeck(next);
    return { ok: true, revision: localRevision, updatedAt };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Save failed",
    };
  }
}

export function getDeck(id: string): StoredDeck | null {
  try {
    const raw = localStorage.getItem(KEY_DECK(id));
    if (!raw) return null;
    return normalizeDeck(JSON.parse(raw) as StoredDeck);
  } catch {
    return null;
  }
}

export type DeckIndexEntry = { id: string; title: string; createdAt: number; count: number };

export function listDecks(): DeckIndexEntry[] {
  try {
    const raw = localStorage.getItem(KEY_INDEX);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function deleteDeck(id: string) {
  localStorage.removeItem(KEY_DECK(id));
  localStorage.removeItem(KEY_HIGHLIGHTS_LEGACY(id));
  const list = listDecks().filter((d) => d.id !== id);
  localStorage.setItem(KEY_INDEX, JSON.stringify(list));
  window.dispatchEvent(new CustomEvent("voxdeck:decks"));
}

/** Load slides for editor/preview. Returns empty slides when the deck is missing. */
export function loadSlidesFor(id: string): { title: string; slides: DeckSlide[]; revision: number } {
  if (typeof window === "undefined") {
    return { title: "Untitled deck", slides: [], revision: 0 };
  }
  const stored = getDeck(id);
  if (stored) {
    return {
      title: stored.title,
      slides: stored.slides,
      revision: stored.revision ?? 0,
    };
  }
  return { title: "Deck not found", slides: [], revision: 0 };
}

export function newDeckId(): string {
  return Math.random().toString(36).slice(2, 8);
}

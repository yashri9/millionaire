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

/** Safari/WebKit Web Storage is typically ~5MB (UTF-16). Stay under that. */
const STORAGE_BUDGET_BYTES = 4.5 * 1024 * 1024;

export const DECK_SAVE_QUOTA_MESSAGE =
  "This deck is too large to save in this browser. Try a shorter PDF, or remove unused decks and retry.";

export class DeckStorageError extends Error {
  constructor(message = DECK_SAVE_QUOTA_MESSAGE) {
    super(message);
    this.name = "DeckStorageError";
  }
}

export function isQuotaExceededError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { name?: string; code?: number; message?: string };
  const name = e.name ?? "";
  const msg = (e.message ?? "").toLowerCase();
  return (
    name === "QuotaExceededError" ||
    name === "NS_ERROR_DOM_QUOTA_REACHED" ||
    e.code === 22 ||
    e.code === 1014 ||
    msg.includes("quota")
  );
}

function utf16Bytes(value: string): number {
  return value.length * 2;
}

function localStorageUsedBytes(): number {
  let bytes = 0;
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key) continue;
    bytes += utf16Bytes(key) + utf16Bytes(localStorage.getItem(key) ?? "");
  }
  return bytes;
}

function bytesForExistingKey(key: string): number {
  const existing = localStorage.getItem(key);
  return existing ? utf16Bytes(key) + utf16Bytes(existing) : 0;
}

function assertFitsLocalStorage(entries: Array<[string, string]>) {
  let projected = localStorageUsedBytes();
  for (const [key, value] of entries) {
    projected -= bytesForExistingKey(key);
    projected += utf16Bytes(key) + utf16Bytes(value);
  }
  if (projected > STORAGE_BUDGET_BYTES) {
    throw new DeckStorageError(DECK_SAVE_QUOTA_MESSAGE);
  }
}

function writeLocalStorage(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch (err) {
    if (isQuotaExceededError(err)) {
      throw new DeckStorageError(DECK_SAVE_QUOTA_MESSAGE);
    }
    throw err;
  }
}

export function saveDeck(deck: StoredDeck) {
  const next: StoredDeck = {
    ...deck,
    revision: deck.revision ?? 0,
    updatedAt: deck.updatedAt ?? Date.now(),
    highlights: deck.highlights ?? {},
  };
  const deckValue = JSON.stringify(next);
  const highlightsValue = JSON.stringify(next.highlights ?? {});
  const list = listDecks().filter((d) => d.id !== next.id);
  list.unshift({
    id: next.id,
    title: next.title,
    createdAt: next.createdAt,
    count: next.slides.length,
  });
  const indexValue = JSON.stringify(list);

  assertFitsLocalStorage([
    [KEY_DECK(next.id), deckValue],
    [KEY_HIGHLIGHTS_LEGACY(next.id), highlightsValue],
    [KEY_INDEX, indexValue],
  ]);

  writeLocalStorage(KEY_DECK(next.id), deckValue);
  // Keep legacy highlight key in sync for older readers
  writeLocalStorage(KEY_HIGHLIGHTS_LEGACY(next.id), highlightsValue);
  writeLocalStorage(KEY_INDEX, indexValue);
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
    if (e instanceof DeckStorageError || isQuotaExceededError(e)) {
      return { ok: false, error: DECK_SAVE_QUOTA_MESSAGE };
    }
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

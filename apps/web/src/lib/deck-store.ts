/**
 * Client deck store — Supabase is the canonical source of truth.
 * localStorage is only a cache (cloud decks) or an explicit device-draft layer.
 */
import type { SeedSlide } from "@/lib/deck-seed";
import type { GenerationMethod, SlideContent } from "@voxdeck/narration";
import type { Highlight } from "@/lib/highlight-store";
import {
  loadServerDeck,
  storedDeckFromServer,
  type ServerDeckPayload,
} from "@/lib/studio-api";

export type SlideWord = {
  text: string;
  x: number;
  y: number;
  w: number;
  h: number;
};

export type DeckSlide = SeedSlide & {
  essentialPoints?: string[];
  thumbnail?: string;
  pageText?: string;
  words?: SlideWord[];
  slideContent?: SlideContent;
  generationMethod?: GenerationMethod;
  lowConfidenceFlags?: string[];
  /** Postgres slides.id — required for cloud script PATCH. */
  serverSlideId?: string;
};

export type DeckPersistence = "cloud" | "local_draft";

export type StoredDeck = {
  id: string;
  title: string;
  createdAt: number;
  revision?: number;
  updatedAt?: number;
  /** ISO timestamp from decks.updated_at — used for stale-write detection. */
  serverUpdatedAt?: string;
  persistence?: DeckPersistence;
  slides: DeckSlide[];
  highlights?: Record<string, Highlight[]>;
};

export type DeckIndexEntry = {
  id: string;
  title: string;
  createdAt: number;
  count: number;
  persistence?: DeckPersistence;
};

const CACHE_VERSION = 2;
const KEY_DECK = (id: string) => `voxdeck:deck:${id}`;
const KEY_INDEX = "voxdeck:decks";
const KEY_CACHE_META = "voxdeck:cache-meta";
const KEY_HIGHLIGHTS_LEGACY = (id: string) => `voxdeck:highlights:${id}`;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isCloudDeckId(id: string): boolean {
  return UUID_RE.test(id);
}

export function isLocalDraftId(id: string): boolean {
  return id.startsWith("local:") || !isCloudDeckId(id);
}

export function persistenceOf(deck: Pick<StoredDeck, "id" | "persistence">): DeckPersistence {
  if (deck.persistence) return deck.persistence;
  return isCloudDeckId(deck.id) ? "cloud" : "local_draft";
}

function ensureCacheVersion() {
  if (typeof window === "undefined") return;
  try {
    const raw = localStorage.getItem(KEY_CACHE_META);
    const meta = raw ? (JSON.parse(raw) as { version?: number }) : null;
    if (meta?.version === CACHE_VERSION) return;
    localStorage.setItem(KEY_CACHE_META, JSON.stringify({ version: CACHE_VERSION }));
    // Re-tag index entries with persistence without wiping user drafts.
    const list = listCachedIndex();
    const next = list.map((d) => ({
      ...d,
      persistence: d.persistence ?? (isCloudDeckId(d.id) ? "cloud" : "local_draft"),
    }));
    localStorage.setItem(KEY_INDEX, JSON.stringify(next));
  } catch {
    /* ignore */
  }
}

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
    persistence: persistenceOf(deck),
    revision: deck.revision ?? 0,
    updatedAt: deck.updatedAt ?? deck.createdAt,
    highlights,
  };
}

/** Safari/WebKit Web Storage is typically ~5MB (UTF-16). Stay under that. */
const STORAGE_BUDGET_BYTES = 4.5 * 1024 * 1024;

export const DECK_SAVE_QUOTA_MESSAGE =
  "This deck is too large to save on this device. Try a shorter PDF, or remove unused device drafts and retry.";

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

function listCachedIndex(): DeckIndexEntry[] {
  try {
    ensureCacheVersion();
    const raw = localStorage.getItem(KEY_INDEX);
    return raw ? (JSON.parse(raw) as DeckIndexEntry[]) : [];
  } catch {
    return [];
  }
}

function writeIndex(list: DeckIndexEntry[]) {
  writeLocalStorage(KEY_INDEX, JSON.stringify(list));
  window.dispatchEvent(new CustomEvent("voxdeck:decks"));
}

/** Cache a deck after a successful server load/save. */
export function cacheDeck(deck: StoredDeck) {
  ensureCacheVersion();
  const next = normalizeDeck({
    ...deck,
    persistence: deck.persistence ?? (isCloudDeckId(deck.id) ? "cloud" : "local_draft"),
  });
  const deckValue = JSON.stringify(next);
  const highlightsValue = JSON.stringify(next.highlights ?? {});
  const list = listCachedIndex().filter((d) => d.id !== next.id);
  list.unshift({
    id: next.id,
    title: next.title,
    createdAt: next.updatedAt ?? next.createdAt,
    count: next.slides.length,
    persistence: next.persistence,
  });
  const indexValue = JSON.stringify(list);

  assertFitsLocalStorage([
    [KEY_DECK(next.id), deckValue],
    [KEY_HIGHLIGHTS_LEGACY(next.id), highlightsValue],
    [KEY_INDEX, indexValue],
  ]);

  writeLocalStorage(KEY_DECK(next.id), deckValue);
  writeLocalStorage(KEY_HIGHLIGHTS_LEGACY(next.id), highlightsValue);
  writeLocalStorage(KEY_INDEX, indexValue);
  window.dispatchEvent(new CustomEvent("voxdeck:decks"));
  window.dispatchEvent(
    new CustomEvent("voxdeck:highlights", { detail: { deckId: next.id } }),
  );
  // Best-effort IndexedDB mirror for large decks (P2).
  void import("@/lib/idb-deck-cache")
    .then((m) => m.idbPutDeck(next))
    .catch(() => {
      /* ignore */
    });
}

/**
 * @deprecated Prefer cacheDeck / saveLocalDraft. Kept for call sites that
 * intentionally write the local cache layer.
 */
export function saveDeck(deck: StoredDeck) {
  cacheDeck(deck);
}

/** Explicit device-draft save — never presented as a cloud deck. */
export function saveLocalDraft(deck: Omit<StoredDeck, "persistence" | "id"> & { id?: string }) {
  const id = deck.id?.startsWith("local:")
    ? deck.id
    : `local:${Math.random().toString(36).slice(2, 10)}`;
  const next: StoredDeck = {
    ...deck,
    id,
    persistence: "local_draft",
    revision: deck.revision ?? 0,
    updatedAt: deck.updatedAt ?? Date.now(),
    highlights: deck.highlights ?? {},
  };
  cacheDeck(next);
  return next;
}

/** Read cache only — does not hit the network. */
export function getCachedDeck(id: string): StoredDeck | null {
  if (typeof window === "undefined") return null;
  try {
    ensureCacheVersion();
    const raw = localStorage.getItem(KEY_DECK(id));
    if (!raw) return null;
    return normalizeDeck(JSON.parse(raw) as StoredDeck);
  } catch {
    return null;
  }
}

/**
 * @deprecated Sync cache read. Prefer fetchDeck() for cloud decks.
 * Still used by highlight-store and sync helpers.
 */
export function getDeck(id: string): StoredDeck | null {
  return getCachedDeck(id);
}

/** Local index (cache + drafts). Not the account library. */
export function listCachedDecks(): DeckIndexEntry[] {
  if (typeof window === "undefined") return [];
  return listCachedIndex();
}

/** @deprecated Use listCachedDecks / listLocalDrafts / GET /api/decks. */
export function listDecks(): DeckIndexEntry[] {
  return listCachedDecks();
}

/** Device drafts that have never been uploaded (or used legacy short ids). */
export function listLocalDrafts(): DeckIndexEntry[] {
  return listCachedDecks().filter(
    (d) => d.persistence === "local_draft" || isLocalDraftId(d.id),
  );
}

export function removeCachedDeck(id: string) {
  if (typeof window === "undefined") return;
  localStorage.removeItem(KEY_DECK(id));
  localStorage.removeItem(KEY_HIGHLIGHTS_LEGACY(id));
  const list = listCachedIndex().filter((d) => d.id !== id);
  writeIndex(list);
}

/** @deprecated Prefer removeCachedDeck after successful server delete. */
export function deleteDeck(id: string) {
  removeCachedDeck(id);
}

export function loadSlidesFor(id: string): {
  title: string;
  slides: DeckSlide[];
  revision: number;
} {
  if (typeof window === "undefined") {
    return { title: "Untitled deck", slides: [], revision: 0 };
  }
  const stored = getCachedDeck(id);
  if (stored) {
    return {
      title: stored.title,
      slides: stored.slides,
      revision: stored.revision ?? 0,
    };
  }
  return { title: "Deck not found", slides: [], revision: 0 };
}

/** @deprecated Cloud decks must use server UUIDs. Use saveLocalDraft for drafts. */
export function newDeckId(): string {
  return `local:${Math.random().toString(36).slice(2, 10)}`;
}

export type FetchDeckResult =
  | { ok: true; deck: StoredDeck; source: "server" | "cache" | "local_draft" }
  | { ok: false; error: string; status?: number };

/**
 * Server-first deck load. localStorage is used only as cache / draft.
 */
export async function fetchDeck(id: string): Promise<FetchDeckResult> {
  if (!id) return { ok: false, error: "Missing deck id", status: 400 };

  if (isLocalDraftId(id)) {
    const draft = getCachedDeck(id);
    if (draft) return { ok: true, deck: draft, source: "local_draft" };
    try {
      const { idbGetDeck } = await import("@/lib/idb-deck-cache");
      const fromIdb = await idbGetDeck(id);
      if (fromIdb) return { ok: true, deck: fromIdb, source: "local_draft" };
    } catch {
      /* ignore */
    }
    return { ok: false, error: "Device draft not found on this browser", status: 404 };
  }

  try {
    const res = await fetch(`/api/decks/${id}`);
    const data = (await res.json().catch(() => ({}))) as ServerDeckPayload & {
      error?: string;
    };

    if (res.status === 401) {
      return { ok: false, error: "Session expired. Please sign in again.", status: 401 };
    }
    if (res.status === 403) {
      return { ok: false, error: "You don't have access to this deck.", status: 403 };
    }
    if (res.status === 404) {
      removeCachedDeck(id);
      return { ok: false, error: "Deck not found", status: 404 };
    }
    if (!res.ok || !data.deck || !data.slides) {
      const cached = getCachedDeck(id);
      if (cached) return { ok: true, deck: cached, source: "cache" };
      return {
        ok: false,
        error: data.error || "Couldn't reach Voxdeck. Check your connection and retry.",
        status: res.status,
      };
    }

    const deck = storedDeckFromServer(data);
    const prev = getCachedDeck(id);
    if (prev?.highlights && Object.keys(prev.highlights).length > 0) {
      deck.highlights = prev.highlights;
    }
    try {
      cacheDeck(deck);
    } catch {
      /* quota — still return server deck */
    }
    return { ok: true, deck, source: "server" };
  } catch {
    const cached = getCachedDeck(id);
    if (cached) return { ok: true, deck: cached, source: "cache" };
    return {
      ok: false,
      error: "Couldn't reach Voxdeck. Check your connection and retry.",
    };
  }
}

export type PersistCloudResult =
  | { ok: true; revision: number; updatedAt: number; serverUpdatedAt: string }
  | { ok: false; error: string; offline?: boolean; conflict?: boolean };

/**
 * Persist narration/title to Supabase, then refresh the local cache.
 */
export async function persistCloudDeckRevision(
  deckId: string,
  patch: {
    title?: string;
    slides?: DeckSlide[];
    highlights?: Record<string, Highlight[]>;
  },
  localRevision: number,
  expectedServerUpdatedAt?: string,
): Promise<PersistCloudResult> {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return { ok: false, error: "Offline — Changes not synced", offline: true };
  }
  if (!isCloudDeckId(deckId)) {
    // Local drafts stay local until explicitly uploaded.
    try {
      const existing = getCachedDeck(deckId);
      if (!existing) return { ok: false, error: "Device draft not found" };
      const updatedAt = Date.now();
      cacheDeck({
        ...existing,
        title: patch.title ?? existing.title,
        slides: patch.slides ?? existing.slides,
        highlights: patch.highlights ?? existing.highlights ?? {},
        revision: localRevision,
        updatedAt,
        persistence: "local_draft",
      });
      return {
        ok: true,
        revision: localRevision,
        updatedAt,
        serverUpdatedAt: "",
      };
    } catch (e) {
      if (e instanceof DeckStorageError || isQuotaExceededError(e)) {
        return { ok: false, error: DECK_SAVE_QUOTA_MESSAGE };
      }
      return { ok: false, error: e instanceof Error ? e.message : "Save failed" };
    }
  }

  const existing = getCachedDeck(deckId);
  const slides = patch.slides ?? existing?.slides ?? [];
  let withIds = slides;

  if (withIds.some((s) => !s.serverSlideId)) {
    const loaded = await loadServerDeck(deckId);
    if (!loaded?.slides?.length) {
      return { ok: false, error: "Couldn't load deck from server to save." };
    }
    const byOrder = new Map(loaded.slides.map((s) => [s.order_index, s.id]));
    withIds = withIds.map((s) => ({
      ...s,
      serverSlideId: s.serverSlideId ?? byOrder.get(Number(s.n)) ?? byOrder.get(parseInt(s.n, 10)),
    }));
  }

  const narration = withIds
    .filter((s) => s.serverSlideId)
    .map((s) => ({ slide_id: s.serverSlideId as string, text: s.script ?? "" }));

  if (narration.length === 0) {
    return { ok: false, error: "No slides available to save." };
  }

  const res = await fetch(`/api/decks/${deckId}/script`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      narration,
      title: patch.title,
      expected_updated_at: expectedServerUpdatedAt ?? existing?.serverUpdatedAt,
    }),
  });
  const data = (await res.json().catch(() => ({}))) as {
    error?: string;
    code?: string;
    deck?: { updated_at?: string; title?: string };
  };

  if (res.status === 401) {
    return { ok: false, error: "Session expired. Please sign in again." };
  }
  if (res.status === 403) {
    return { ok: false, error: "You don't have access to this deck." };
  }
  if (res.status === 409 || data.code === "stale_revision") {
    return {
      ok: false,
      error: data.error || "Deck was updated on another device. Reload and try again.",
      conflict: true,
    };
  }
  if (!res.ok) {
    return {
      ok: false,
      error: data.error || "Changes couldn't be saved.",
    };
  }

  const updatedAt = Date.now();
  const serverUpdatedAt = data.deck?.updated_at ?? new Date().toISOString();
  const next: StoredDeck = {
    id: deckId,
    title: patch.title ?? data.deck?.title ?? existing?.title ?? "Untitled deck",
    createdAt: existing?.createdAt ?? updatedAt,
    updatedAt,
    revision: localRevision,
    serverUpdatedAt,
    persistence: "cloud",
    slides: withIds,
    highlights: patch.highlights ?? existing?.highlights ?? {},
  };
  try {
    cacheDeck(next);
  } catch {
    /* ignore quota on cache write after successful server save */
  }
  return { ok: true, revision: localRevision, updatedAt, serverUpdatedAt };
}

/**
 * Local-only revision write (cache/draft). Prefer persistCloudDeckRevision.
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
    const existing = getCachedDeck(deckId);
    if (!existing) {
      return { ok: false, error: "Deck not found" };
    }
    const updatedAt = Date.now();
    cacheDeck({
      ...existing,
      title: patch.title ?? existing.title,
      slides: patch.slides ?? existing.slides,
      highlights: patch.highlights ?? existing.highlights ?? {},
      revision: localRevision,
      updatedAt,
    });
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

export async function deleteCloudDeck(id: string): Promise<{ ok: boolean; error?: string }> {
  if (isLocalDraftId(id)) {
    removeCachedDeck(id);
    return { ok: true };
  }
  const res = await fetch(`/api/decks/${id}`, { method: "DELETE" });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    return { ok: false, error: data.error || "Couldn't delete deck on the server." };
  }
  removeCachedDeck(id);
  return { ok: true };
}

export async function promoteLocalDraft(localId: string): Promise<FetchDeckResult> {
  const draft = getCachedDeck(localId);
  if (!draft || persistenceOf(draft) !== "local_draft") {
    return { ok: false, error: "Device draft not found" };
  }
  const res = await fetch("/api/decks/import", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      title: draft.title,
      slides: draft.slides.map((s, i) => ({
        order_index: Number(s.n) || i + 1,
        title: s.title,
        bullets: s.essentialPoints ?? [],
        script: s.script,
      })),
    }),
  });
  const data = (await res.json().catch(() => ({}))) as {
    deck?: { id: string };
    error?: string;
  };
  if (!res.ok || !data.deck?.id) {
    return {
      ok: false,
      error: data.error || "Couldn't upload this device draft.",
      status: res.status,
    };
  }
  removeCachedDeck(localId);
  return fetchDeck(data.deck.id);
}

export type { ServerDeckPayload };

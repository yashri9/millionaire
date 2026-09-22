"use client";

/**
 * IndexedDB working-copy cache via Dexie (P2).
 * Supabase remains canonical; Dexie replaces fragile localStorage for large decks.
 */
import Dexie, { type Table } from "dexie";
import type { StoredDeck } from "@/lib/deck-store";

export type DexieDeckRow = StoredDeck & {
  cachedAt: number;
};

class VoxdeckDB extends Dexie {
  decks!: Table<DexieDeckRow, string>;

  constructor() {
    super("voxdeck");
    this.version(1).stores({
      decks: "id, updatedAt, cachedAt, persistence",
    });
  }
}

let db: VoxdeckDB | null = null;

function getDb() {
  if (typeof window === "undefined") return null;
  if (!db) db = new VoxdeckDB();
  return db;
}

export async function idbPutDeck(deck: StoredDeck): Promise<void> {
  const d = getDb();
  if (!d) return;
  await d.decks.put({ ...deck, cachedAt: Date.now() });
}

export async function idbGetDeck(id: string): Promise<StoredDeck | null> {
  const d = getDb();
  if (!d) return null;
  const row = await d.decks.get(id);
  if (!row) return null;
  const { cachedAt: _c, ...deck } = row;
  return deck;
}

export async function idbDeleteDeck(id: string): Promise<void> {
  const d = getDb();
  if (!d) return;
  await d.decks.delete(id);
}

export async function idbListDrafts(): Promise<StoredDeck[]> {
  const d = getDb();
  if (!d) return [];
  const rows = await d.decks
    .filter((r) => r.persistence === "local_draft" || String(r.id).startsWith("local:"))
    .toArray();
  return rows.map(({ cachedAt: _c, ...deck }) => deck);
}

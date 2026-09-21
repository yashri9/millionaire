"use client";

import { useEffect, useState, useCallback } from "react";
import { getDeck } from "@/lib/deck-store";

/** Where startMs/endMs came from — real audio word times vs estimated from script duration. */
export type HighlightTimingSource = "audio" | "estimated";

type HighlightTiming = {
  triggerWordIndex: number;
  endWordIndex?: number;
  startMs?: number;
  endMs?: number;
  timingSource?: HighlightTimingSource;
  scriptFingerprint?: string;
  needsReview?: boolean;
  holdMs: number;
};

export type TextHighlight = HighlightTiming & {
  id: string;
  kind: "text";
  phrase: { start: number; end: number };
  text: string;
};

export type RegionHighlight = HighlightTiming & {
  id: string;
  kind: "region";
  shape: "rect" | "square" | "oval";
  /** Percent units 0–100 relative to the slide stage. */
  bbox: { x: number; y: number; w: number; h: number };
  snappedTo?: string;
};

export type Highlight = TextHighlight | RegionHighlight;

const KEY_LEGACY = (deckId: string) => `voxdeck:highlights:${deckId}`;

export function scriptFingerprint(script: string): string {
  let h = 0;
  for (let i = 0; i < script.length; i++) {
    h = (h * 31 + script.charCodeAt(i)) | 0;
  }
  return `${script.length}:${h}`;
}

/**
 * Working copy of highlights (immediate). Deck document.highlights is updated
 * only by autosave so unsaved slide edits are never overwritten.
 */
export function getAllHighlights(deckId: string): Record<string, Highlight[]> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(KEY_LEGACY(deckId));
    if (raw) return JSON.parse(raw) as Record<string, Highlight[]>;
  } catch {
    /* fall through */
  }
  const deck = getDeck(deckId);
  return deck?.highlights ? { ...deck.highlights } : {};
}

/**
 * Persist highlight working copy immediately for Preview/Review.
 * Does not write the deck document (autosave owns that + revision).
 */
export function writeAllHighlights(deckId: string, data: Record<string, Highlight[]>) {
  try {
    window.localStorage.setItem(KEY_LEGACY(deckId), JSON.stringify(data));
    window.dispatchEvent(
      new CustomEvent("voxdeck:highlights", { detail: { deckId } }),
    );
  } catch {
    /* ignore quota */
  }
}

function emitDirty(
  deckId: string,
  changeType:
    | "highlight_created"
    | "highlight_updated"
    | "highlight_deleted"
    | "highlight_timing_updated",
) {
  window.dispatchEvent(
    new CustomEvent("voxdeck:deck-dirty", { detail: { deckId, changeType } }),
  );
}

export function useHighlights(deckId: string, slideKey: string) {
  const [items, setItems] = useState<Highlight[]>([]);

  useEffect(() => {
    const load = () => setItems(getAllHighlights(deckId)[slideKey] ?? []);
    load();
    const onChange = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (!detail || detail.deckId === deckId) load();
    };
    window.addEventListener("voxdeck:highlights", onChange);
    window.addEventListener("voxdeck:decks", onChange);
    window.addEventListener("storage", onChange);
    return () => {
      window.removeEventListener("voxdeck:highlights", onChange);
      window.removeEventListener("voxdeck:decks", onChange);
      window.removeEventListener("storage", onChange);
    };
  }, [deckId, slideKey]);

  const add = useCallback(
    (h: Omit<Highlight, "id">) => {
      const all = getAllHighlights(deckId);
      const next: Highlight = { ...(h as Highlight), id: crypto.randomUUID() };
      all[slideKey] = [...(all[slideKey] ?? []), next];
      writeAllHighlights(deckId, all);
      emitDirty(deckId, "highlight_created");
    },
    [deckId, slideKey],
  );

  const update = useCallback(
    (id: string, patch: Partial<Highlight>) => {
      const all = getAllHighlights(deckId);
      all[slideKey] = (all[slideKey] ?? []).map((h) =>
        h.id === id ? ({ ...h, ...patch, id: h.id, kind: h.kind } as Highlight) : h,
      );
      writeAllHighlights(deckId, all);
      const timing =
        patch.startMs != null ||
        patch.endMs != null ||
        patch.triggerWordIndex != null ||
        patch.endWordIndex != null;
      emitDirty(deckId, timing ? "highlight_timing_updated" : "highlight_updated");
    },
    [deckId, slideKey],
  );

  const remove = useCallback(
    (id: string) => {
      const all = getAllHighlights(deckId);
      all[slideKey] = (all[slideKey] ?? []).filter((h) => h.id !== id);
      writeAllHighlights(deckId, all);
      emitDirty(deckId, "highlight_deleted");
    },
    [deckId, slideKey],
  );

  const markStaleForScript = useCallback(
    (script: string) => {
      const fp = scriptFingerprint(script);
      const all = getAllHighlights(deckId);
      const list = all[slideKey] ?? [];
      let changed = false;
      const next = list.map((h) => {
        if (h.scriptFingerprint && h.scriptFingerprint !== fp && !h.needsReview) {
          changed = true;
          return { ...h, needsReview: true };
        }
        return h;
      });
      if (changed) {
        all[slideKey] = next;
        writeAllHighlights(deckId, all);
      }
    },
    [deckId, slideKey],
  );

  return { items, add, update, remove, markStaleForScript };
}

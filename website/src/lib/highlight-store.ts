import { useEffect, useState, useCallback } from "react";

export type TextHighlight = {
  id: string;
  kind: "text";
  phrase: { start: number; end: number };  // char offsets in the script
  text: string;                             // captured phrase text
  triggerWordIndex: number;
  holdMs: number;
};

export type RegionHighlight = {
  id: string;
  kind: "region";
  shape: "rect" | "ellipse";
  bbox: { x: number; y: number; w: number; h: number }; // 0-1 slide-relative
  snappedTo?: string;
  triggerWordIndex: number;
  holdMs: number;
};

export type Highlight = TextHighlight | RegionHighlight;

const KEY = (deckId: string) => `voxdeck:highlights:${deckId}`;

function readAll(deckId: string): Record<string, Highlight[]> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(KEY(deckId));
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function writeAll(deckId: string, data: Record<string, Highlight[]>) {
  try {
    window.localStorage.setItem(KEY(deckId), JSON.stringify(data));
    window.dispatchEvent(new CustomEvent("voxdeck:highlights", { detail: { deckId } }));
  } catch {
    /* ignore quota */
  }
}

export function useHighlights(deckId: string, slideKey: string) {
  const [items, setItems] = useState<Highlight[]>([]);

  useEffect(() => {
    const load = () => setItems(readAll(deckId)[slideKey] ?? []);
    load();
    const onChange = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (!detail || detail.deckId === deckId) load();
    };
    window.addEventListener("voxdeck:highlights", onChange);
    window.addEventListener("storage", onChange);
    return () => {
      window.removeEventListener("voxdeck:highlights", onChange);
      window.removeEventListener("storage", onChange);
    };
  }, [deckId, slideKey]);

  const add = useCallback((h: Omit<Highlight, "id">) => {
    const all = readAll(deckId);
    const next: Highlight = { ...(h as Highlight), id: crypto.randomUUID() };
    all[slideKey] = [...(all[slideKey] ?? []), next];
    writeAll(deckId, all);
  }, [deckId, slideKey]);

  const remove = useCallback((id: string) => {
    const all = readAll(deckId);
    all[slideKey] = (all[slideKey] ?? []).filter((h) => h.id !== id);
    writeAll(deckId, all);
  }, [deckId, slideKey]);

  return { items, add, remove };
}

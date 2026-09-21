"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  DeckAutosaveController,
  createInitialAutosaveSnapshot,
  type DeckAutosaveSnapshot,
  type DeckChangeType,
  type PersistResult,
  AUTOSAVE_DEBOUNCE_MS,
} from "@/lib/deck-autosave";
import { getAllHighlights } from "@/lib/highlight-store";
import { getDeck, persistDeckRevision, type DeckSlide } from "@/lib/deck-store";

export type UseDeckAutosaveOptions = {
  deckId: string;
  /** Live slides from editor React state — captured on each persist. */
  getSlides: () => DeckSlide[];
  getTitle?: () => string;
  debounceMs?: number;
};

export function useDeckAutosave(opts: UseDeckAutosaveOptions) {
  const { deckId, getSlides, getTitle, debounceMs = AUTOSAVE_DEBOUNCE_MS } = opts;
  const getSlidesRef = useRef(getSlides);
  const getTitleRef = useRef(getTitle);
  getSlidesRef.current = getSlides;
  getTitleRef.current = getTitle;

  const [snap, setSnap] = useState<DeckAutosaveSnapshot>(() => {
    const deck = typeof window !== "undefined" ? getDeck(deckId) : null;
    return createInitialAutosaveSnapshot(deck?.revision ?? 0, deck?.updatedAt ?? null);
  });

  const controllerRef = useRef<DeckAutosaveController | null>(null);

  useEffect(() => {
    const deck = getDeck(deckId);
    const controller = new DeckAutosaveController(
      async (localRevision): Promise<PersistResult> => {
        if (typeof navigator !== "undefined" && navigator.onLine === false) {
          return { ok: false, error: "Offline — Changes not synced", offline: true };
        }
        const existing = getDeck(deckId);
        if (!existing) {
          return { ok: false, error: "Deck not found" };
        }
        const result = persistDeckRevision(
          deckId,
          {
            title: getTitleRef.current?.() ?? existing.title,
            slides: getSlidesRef.current(),
            highlights: getAllHighlights(deckId),
          },
          localRevision,
        );
        if (!result.ok) return result;
        return { ok: true, revision: result.revision, updatedAt: result.updatedAt };
      },
      {
        debounceMs,
        initial: createInitialAutosaveSnapshot(deck?.revision ?? 0, deck?.updatedAt ?? null),
        getOnline: () =>
          typeof navigator === "undefined" ? true : navigator.onLine !== false,
      },
    );
    controllerRef.current = controller;
    setSnap(controller.getSnapshot());
    const unsub = controller.subscribe(setSnap);

    const onDirty = (e: Event) => {
      const detail = (e as CustomEvent).detail as
        | { deckId?: string; changeType?: DeckChangeType }
        | undefined;
      if (detail?.deckId && detail.deckId !== deckId) return;
      controller.markDirty(detail?.changeType);
    };
    const onOnline = () => {
      if (controller.getSnapshot().status === "offline") {
        void controller.retry();
      }
    };
    const onOffline = () => {
      const s = controller.getSnapshot();
      if (s.localRevision > s.savedRevision) {
        controller.markDirty("other");
      }
    };
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      const s = controller.getSnapshot();
      if (s.localRevision > s.savedRevision || s.status === "dirty" || s.status === "saving") {
        void controller.flush();
        e.preventDefault();
        e.returnValue = "";
      }
    };

    window.addEventListener("voxdeck:deck-dirty", onDirty);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    window.addEventListener("beforeunload", onBeforeUnload);

    return () => {
      unsub();
      controller.dispose();
      controllerRef.current = null;
      window.removeEventListener("voxdeck:deck-dirty", onDirty);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, [deckId, debounceMs]);

  const markDirty = useCallback((changeType?: DeckChangeType) => {
    controllerRef.current?.markDirty(changeType);
  }, []);

  const flush = useCallback(async () => {
    const c = controllerRef.current;
    if (!c) return snap;
    return c.flush();
  }, [snap]);

  const retry = useCallback(async () => {
    const c = controllerRef.current;
    if (!c) return snap;
    return c.retry();
  }, [snap]);

  return {
    status: snap.status,
    localRevision: snap.localRevision,
    savedRevision: snap.savedRevision,
    lastError: snap.lastError,
    lastSavedAt: snap.lastSavedAt,
    markDirty,
    flush,
    retry,
    isDirty:
      snap.status === "dirty" ||
      snap.status === "saving" ||
      snap.status === "error" ||
      snap.status === "offline" ||
      snap.localRevision > snap.savedRevision,
  };
}

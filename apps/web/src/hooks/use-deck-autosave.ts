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
import {
  getCachedDeck,
  persistCloudDeckRevision,
  type DeckSlide,
} from "@/lib/deck-store";

export type UseDeckAutosaveOptions = {
  deckId: string;
  /** Live slides from editor React state — captured on each persist. */
  getSlides: () => DeckSlide[];
  getTitle?: () => string;
  debounceMs?: number;
  /** Called when server reports a stale revision conflict. */
  onConflict?: () => void;
};

export function useDeckAutosave(opts: UseDeckAutosaveOptions) {
  const { deckId, getSlides, getTitle, debounceMs = AUTOSAVE_DEBOUNCE_MS, onConflict } =
    opts;
  const getSlidesRef = useRef(getSlides);
  const getTitleRef = useRef(getTitle);
  const onConflictRef = useRef(onConflict);
  getSlidesRef.current = getSlides;
  getTitleRef.current = getTitle;
  onConflictRef.current = onConflict;

  const [snap, setSnap] = useState<DeckAutosaveSnapshot>(() => {
    const deck = typeof window !== "undefined" ? getCachedDeck(deckId) : null;
    return createInitialAutosaveSnapshot(deck?.revision ?? 0, deck?.updatedAt ?? null);
  });

  const controllerRef = useRef<DeckAutosaveController | null>(null);

  useEffect(() => {
    const deck = getCachedDeck(deckId);
    const controller = new DeckAutosaveController(
      async (localRevision): Promise<PersistResult> => {
        if (typeof navigator !== "undefined" && navigator.onLine === false) {
          return { ok: false, error: "Offline — Changes not synced", offline: true };
        }
        const existing = getCachedDeck(deckId);
        const result = await persistCloudDeckRevision(
          deckId,
          {
            title: getTitleRef.current?.() ?? existing?.title,
            slides: getSlidesRef.current(),
            highlights: getAllHighlights(deckId),
          },
          localRevision,
          existing?.serverUpdatedAt,
        );
        if (!result.ok) {
          if (result.conflict) onConflictRef.current?.();
          return result;
        }
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

  const resetFromServer = useCallback((revision: number, updatedAt: number | null) => {
    const controller = controllerRef.current;
    if (!controller) {
      setSnap(createInitialAutosaveSnapshot(revision, updatedAt));
      return;
    }
    // Recreate by disposing isn't available — update via markDirty-free path:
    // subscribe snapshot is internal; simplest is replace controller on next deckId effect.
    setSnap(createInitialAutosaveSnapshot(revision, updatedAt));
  }, []);

  return {
    status: snap.status,
    localRevision: snap.localRevision,
    savedRevision: snap.savedRevision,
    lastError: snap.lastError,
    lastSavedAt: snap.lastSavedAt,
    markDirty,
    flush,
    retry,
    resetFromServer,
    isDirty:
      snap.status === "dirty" ||
      snap.status === "saving" ||
      snap.status === "error" ||
      snap.status === "offline" ||
      snap.localRevision > snap.savedRevision,
  };
}

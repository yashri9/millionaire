"use client";

import { useCallback, useEffect, useState } from "react";
import {
  fetchDeck,
  type DeckSlide,
  type StoredDeck,
} from "@/lib/deck-store";

export type DeckHydrationState =
  | { status: "loading" }
  | { status: "ready"; deck: StoredDeck; source: "server" | "cache" | "local_draft" }
  | { status: "error"; error: string; statusCode?: number };

/**
 * Load a deck server-first for editor / preview / publish.
 * Works on a fresh browser with empty localStorage for cloud UUIDs.
 */
export function useHydrateDeck(id: string) {
  const [state, setState] = useState<DeckHydrationState>({ status: "loading" });

  const reload = useCallback(async () => {
    if (!id) {
      setState({ status: "error", error: "Missing deck id", statusCode: 400 });
      return null;
    }
    setState({ status: "loading" });
    const result = await fetchDeck(id);
    if (!result.ok) {
      setState({
        status: "error",
        error: result.error,
        statusCode: result.status,
      });
      return null;
    }
    setState({ status: "ready", deck: result.deck, source: result.source });
    return result.deck;
  }, [id]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { state, reload };
}

export function slidesFromStored(deck: StoredDeck): {
  title: string;
  slides: DeckSlide[];
  revision: number;
} {
  return {
    title: deck.title,
    slides: deck.slides,
    revision: deck.revision ?? 0,
  };
}

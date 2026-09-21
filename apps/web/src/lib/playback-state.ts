/**
 * Shared deterministic playback state from audio clock + slide data.
 * Used by Editor preview, Review/Rehearse, and Published deck.
 */

import type { Highlight } from "@/lib/highlight-store";
import {
  getHighlightState,
  highlightWindowMs,
  type HighlightPlaybackState,
} from "@/lib/highlight-timing";
import { getActiveTokenIndex, type Token } from "@/lib/word-timing";

export type { HighlightPlaybackState };
export { getHighlightState } from "@/lib/highlight-timing";

export type PlaybackState = {
  slideId: string;
  currentTimeMs: number;
  isPlaying: boolean;
  activeWordIndex: number | null;
  activeHighlightIds: string[];
  highlightStates: Record<string, HighlightPlaybackState>;
};

export function getPlaybackState(opts: {
  slideId: string;
  script: string;
  durationSec: number;
  currentTimeMs: number;
  isPlaying: boolean;
  highlights: Highlight[];
  tokens?: Token[];
}): PlaybackState {
  const {
    slideId,
    script,
    durationSec,
    currentTimeMs,
    isPlaying,
    highlights,
    tokens,
  } = opts;

  const activeWordIndex =
    tokens && tokens.length > 0
      ? (() => {
          const idx = getActiveTokenIndex(tokens, currentTimeMs / 1000);
          return idx >= 0 ? idx : null;
        })()
      : null;

  const highlightStates: Record<string, HighlightPlaybackState> = {};
  const activeHighlightIds: string[] = [];

  for (const h of highlights) {
    const win = highlightWindowMs(script, durationSec, h);
    if (!win) {
      highlightStates[h.id] = "before";
      continue;
    }
    const state = getHighlightState(currentTimeMs, win.startMs, win.endMs);
    highlightStates[h.id] = state;
    if (state === "active") activeHighlightIds.push(h.id);
  }

  return {
    slideId,
    currentTimeMs,
    isPlaying,
    activeWordIndex,
    activeHighlightIds,
    highlightStates,
  };
}

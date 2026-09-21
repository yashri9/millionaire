import { timeTokens } from "@/lib/word-timing";
import type { Highlight } from "@/lib/highlight-store";

export type HighlightPlaybackState = "before" | "active" | "completed";

export function getHighlightState(
  currentTimeMs: number,
  startTimeMs: number,
  endTimeMs: number,
): HighlightPlaybackState {
  if (currentTimeMs < startTimeMs) return "before";
  if (currentTimeMs <= endTimeMs) return "active";
  return "completed";
}

/**
 * Window for a highlight driven by narration time:
 * - Starts when the narrator *reaches* the start word (token.startMs)
 * - Ends when the narrator *finishes* the end word (token.endMs)
 * - Uses stored startMs/endMs when present (audio or estimated)
 */
export function highlightWindowMs(
  script: string,
  durationSec: number,
  h: Highlight,
): { startMs: number; endMs: number; durationMs: number } | null {
  if (
    typeof h.startMs === "number" &&
    typeof h.endMs === "number" &&
    h.endMs > h.startMs &&
    !h.needsReview
  ) {
    const durationMs = h.endMs - h.startMs;
    return { startMs: h.startMs, endMs: h.endMs, durationMs };
  }

  const tokens = timeTokens(script, Math.max(0.5, durationSec));
  const startTok = tokens[h.triggerWordIndex];
  if (!startTok) return null;

  const startMs = startTok.startMs;

  let endMs: number;
  if (typeof h.endWordIndex === "number" && tokens[h.endWordIndex]) {
    endMs = Math.max(startMs + 50, tokens[h.endWordIndex].endMs);
  } else if (typeof h.endMs === "number" && h.endMs > startMs) {
    endMs = h.endMs;
  } else {
    endMs = startMs + Math.max(200, h.holdMs);
  }

  const durationMs = Math.max(50, endMs - startMs);
  return { startMs, endMs, durationMs };
}

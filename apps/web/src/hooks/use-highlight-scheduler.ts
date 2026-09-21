"use client";

import { useMemo } from "react";
import type { Highlight } from "@/lib/highlight-store";
import { highlightWindowMs } from "@/lib/highlight-timing";

export type ActiveHighlight = {
  highlight: Highlight;
  triggerMs: number;
  progress: number; // 0 → 1 across its active window
};

export { highlightWindowMs } from "@/lib/highlight-timing";

/** Given elapsed time (seconds from the narration clock), returns active highlights. */
export function useHighlightScheduler(
  script: string,
  durationSec: number,
  highlights: Highlight[],
  elapsedSec: number,
) {
  const nowMs = elapsedSec * 1000;

  return useMemo<ActiveHighlight[]>(() => {
    const out: ActiveHighlight[] = [];
    for (const h of highlights) {
      const win = highlightWindowMs(script, durationSec, h);
      if (!win) continue;
      if (nowMs >= win.startMs && nowMs < win.endMs) {
        out.push({
          highlight: h,
          triggerMs: win.startMs,
          progress: Math.min(1, (nowMs - win.startMs) / win.durationMs),
        });
      }
    }
    return out;
  }, [script, durationSec, highlights, nowMs]);
}

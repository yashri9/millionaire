import { useMemo } from "react";
import { timeTokens } from "@/lib/word-timing";
import type { Highlight } from "@/lib/highlight-store";

export type ActiveHighlight = {
  highlight: Highlight;
  triggerMs: number;
  progress: number;  // 0 → 1 across its hold window
};

/** Given the current elapsed time (seconds), returns the highlights whose
 * trigger word has fired and whose hold window hasn't ended yet. */
export function useHighlightScheduler(
  script: string,
  durationSec: number,
  highlights: Highlight[],
  elapsedSec: number,
) {
  const tokens = useMemo(() => timeTokens(script, durationSec), [script, durationSec]);
  const nowMs = elapsedSec * 1000;

  return useMemo<ActiveHighlight[]>(() => {
    const out: ActiveHighlight[] = [];
    for (const h of highlights) {
      const tok = tokens[h.triggerWordIndex];
      if (!tok) continue;
      const triggerMs = tok.endMs;
      const endMs = triggerMs + h.holdMs;
      if (nowMs >= triggerMs && nowMs < endMs) {
        out.push({
          highlight: h,
          triggerMs,
          progress: Math.min(1, (nowMs - triggerMs) / h.holdMs),
        });
      }
    }
    return out;
  }, [tokens, highlights, nowMs]);
}

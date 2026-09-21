"use client";

import { memo, useMemo } from "react";
import { timeTokens, type Token, type TokenTimingSource } from "@/lib/word-timing";

type Props = {
  script: string;
  /** Preferred: tokens from the active narration clip. */
  tokens?: Token[];
  speakingIdx: number;
  /** Fallback duration if tokens empty. */
  durationSec?: number;
  timingSource?: TokenTimingSource | null;
  className?: string;
  /** Compact density for the editor narration bar. */
  compact?: boolean;
};

/**
 * Audio-driven karaoke transcript. Active word comes from speakingIdx
 * (derived from audio.currentTime + alignment). Layout is stable —
 * no font-size/weight changes that reflow text during playback.
 */
export const SyncedTranscript = memo(function SyncedTranscript({
  script,
  tokens: tokensProp,
  speakingIdx,
  durationSec = 8,
  timingSource,
  className = "",
  compact = false,
}: Props) {
  const tokens = useMemo(() => {
    if (tokensProp && tokensProp.length > 0) return tokensProp;
    if (!script.trim()) return [] as Token[];
    return timeTokens(script, durationSec);
  }, [tokensProp, script, durationSec]);

  const source = timingSource ?? tokens[0]?.source ?? null;

  if (!script.trim()) {
    return (
      <p className={`text-sm text-muted-foreground ${className}`}>
        No narration yet.
      </p>
    );
  }

  return (
    <div className={className}>
      {source === "estimated" && (
        <div className="mb-1 font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
          Estimated timing
        </div>
      )}
      <p
        className={`flex flex-wrap gap-x-1.5 gap-y-1 leading-relaxed ${
          compact ? "text-[12px]" : "text-base"
        }`}
      >
        {tokens.map((t) => {
          const spoken = speakingIdx >= 0 && t.index < speakingIdx;
          const active = t.index === speakingIdx;
          return (
            <span
              key={t.id}
              data-token-id={t.id}
              data-token-index={t.index}
              className={`rounded px-0.5 transition-colors duration-100 ${
                active
                  ? "bg-accent text-foreground"
                  : spoken
                    ? "text-foreground/55"
                    : "text-foreground"
              }`}
            >
              {t.text}
            </span>
          );
        })}
      </p>
    </div>
  );
});

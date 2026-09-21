"use client";

import { useEffect, useMemo, useState } from "react";
import { timeTokens, tokenize } from "@/lib/word-timing";

type Props = {
  open: boolean;
  script: string;
  /** Estimated or actual narration duration (seconds) for timing labels. */
  durationSec?: number;
  timingSource?: "audio" | "estimated";
  phraseRange?: { start: number; end: number };
  targetLabel?: string;
  /** Prefill when re-syncing an existing highlight. */
  initialStart?: number | null;
  initialEnd?: number | null;
  onPick: (startWordIndex: number, endWordIndex: number) => void;
  onCancel: () => void;
};

/**
 * Compact timing panel: pick start word + end word from the transcript.
 * Does not start, stop, or advance narration — parent must pause playback
 * before opening this panel.
 */
export function TriggerPicker({
  open,
  script,
  durationSec = 8,
  timingSource = "estimated",
  phraseRange,
  targetLabel,
  initialStart = null,
  initialEnd = null,
  onPick,
  onCancel,
}: Props) {
  const tokens = useMemo(() => tokenize(script), [script]);
  const timed = useMemo(
    () => timeTokens(script, Math.max(0.5, durationSec)),
    [script, durationSec],
  );
  const [startIdx, setStartIdx] = useState<number | null>(null);
  const [endIdx, setEndIdx] = useState<number | null>(null);

  useEffect(() => {
    if (!open) {
      setStartIdx(null);
      setEndIdx(null);
      return;
    }
    if (initialStart != null) setStartIdx(initialStart);
    if (initialEnd != null) setEndIdx(initialEnd);
    const onKey = (e: KeyboardEvent) => {
      // Trap editor hotkeys while this panel is open
      if (
        e.code === "Space" ||
        e.key === "ArrowRight" ||
        e.key === "ArrowLeft" ||
        e.key === "j" ||
        e.key === "k"
      ) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onCancel();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, onCancel, initialStart, initialEnd]);

  if (!open) return null;

  const startTok = startIdx != null ? timed[startIdx] : null;
  const endTok = endIdx != null ? timed[endIdx] : null;
  const rangeValid =
    startIdx != null && endIdx != null && endIdx >= startIdx;

  function formatMs(ms: number) {
    const s = ms / 1000;
    return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}.${String(Math.floor((ms % 1000) / 100))}`;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-foreground/30 p-4 backdrop-blur-[2px] sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="highlight-timing-title"
      data-hotkeys-ignore="true"
      onClick={onCancel}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <div
        className="animate-rise w-full max-w-xl rounded-2xl border-2 border-foreground bg-background p-5 offset-shadow-sm sm:p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="eyebrow">Sync highlight to narration</div>
        <h2
          id="highlight-timing-title"
          className="mt-1 font-display text-xl font-bold tracking-tight"
        >
          Choose when this spotlight appears
        </h2>
        <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
          Highlight starts when the narrator reaches the start word, and ends
          when the narrator finishes the end word. Timing is{" "}
          <span className="font-semibold text-foreground">
            {timingSource === "audio" ? "audio-synced" : "estimated"}
          </span>
          {timingSource === "estimated" ? " from script length" : ""}.
        </p>

        {phraseRange && (
          <div className="mt-3 rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm">
            <div className="eyebrow mb-0.5">Phrase</div>
            <div className="font-medium">
              &ldquo;{script.slice(phraseRange.start, phraseRange.end)}&rdquo;
            </div>
          </div>
        )}
        {targetLabel && (
          <div className="mt-3 rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm">
            <div className="eyebrow mb-0.5">Shape</div>
            <div className="font-medium">{targetLabel}</div>
          </div>
        )}

        <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
          <span className="rounded-full border border-foreground bg-foreground px-2.5 py-1 font-semibold text-background">
            Start: {startTok ? `“${startTok.text}”` : "—"}
          </span>
          <span className="rounded-full border border-accent bg-accent/30 px-2.5 py-1 font-semibold">
            End: {endTok ? `“${endTok.text}”` : "—"}
          </span>
          {rangeValid && startTok && endTok && (
            <span className="rounded-full border border-border px-2.5 py-1 font-mono text-muted-foreground">
              {formatMs(startTok.startMs)} → {formatMs(endTok.endMs)}
            </span>
          )}
        </div>

        <div className="mt-3 max-h-56 overflow-y-auto rounded-lg border border-border bg-background p-3 text-base leading-relaxed">
          {tokens.length === 0 ? (
            <div className="text-sm text-muted-foreground">
              No script yet — write narration first, then set timing.
            </div>
          ) : (
            <p className="flex flex-wrap gap-x-1.5 gap-y-1">
              {tokens.map((t) => {
                const isStart = startIdx === t.index;
                const isEnd = endIdx === t.index;
                const inRange =
                  startIdx != null &&
                  endIdx != null &&
                  t.index > startIdx &&
                  t.index < endIdx;
                return (
                  <button
                    key={t.index}
                    type="button"
                    onClick={() => {
                      if (startIdx == null || (endIdx != null && t.index < startIdx)) {
                        setStartIdx(t.index);
                        setEndIdx(null);
                        return;
                      }
                      if (endIdx == null) {
                        const end = Math.max(startIdx, t.index);
                        setEndIdx(end);
                        return;
                      }
                      // Third click restarts start selection
                      setStartIdx(t.index);
                      setEndIdx(null);
                    }}
                    className={`rounded px-1 transition-colors ${
                      isStart
                        ? "bg-foreground text-background"
                        : isEnd
                          ? "bg-accent text-foreground"
                          : inRange
                            ? "bg-accent/35"
                            : "hover:bg-muted"
                    }`}
                  >
                    {t.text}
                  </button>
                );
              })}
            </p>
          )}
        </div>

        <p className="mt-2 text-[11px] text-muted-foreground">
          Click a word for <strong>start</strong>, then a later (or same) word
          for <strong>end</strong>.
        </p>

        <div className="mt-4 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-full border border-border px-4 py-2 text-xs font-semibold hover:bg-muted"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!rangeValid}
            onClick={() => {
              if (!rangeValid || startIdx == null || endIdx == null) return;
              onPick(startIdx, endIdx);
            }}
            className="rounded-full bg-foreground px-4 py-2 text-xs font-semibold text-background disabled:opacity-40"
          >
            Save highlight
          </button>
        </div>
      </div>
    </div>
  );
}

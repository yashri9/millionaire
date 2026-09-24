"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Waveform } from "@/components/ui-kit";
import { SlidePlaybackStage } from "@/components/highlights/SlidePlaybackStage";
import type { DeckPlayback } from "@/hooks/use-deck-playback";
import { fmt } from "@/lib/deck-runtime";

function isTypingTarget(t: EventTarget | null) {
  const el = t as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
}

const iconBtn =
  "inline-flex h-11 min-w-11 items-center justify-center gap-1.5 rounded-full border border-border px-3 text-xs font-semibold text-foreground transition-colors hover:bg-muted disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground";

/**
 * Shared narrated player: stage, transport, clickable per-slide progress,
 * keyboard shortcuts, full screen with optional captions, end-of-deck card.
 */
export function DeckPlayer({
  playback: p,
  title,
  endCard,
  keyboard = true,
}: {
  playback: DeckPlayback;
  title?: string;
  /** Shown over the stage when the last slide finishes. */
  endCard?: ReactNode;
  keyboard?: boolean;
}) {
  const frameRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const captionRef = useRef<HTMLDivElement>(null);
  const [enlarged, setEnlarged] = useState(false);
  const [fsCaptions, setFsCaptions] = useState(true);

  const exitEnlarge = useCallback(() => {
    setEnlarged(false);
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
  }, []);

  const enterEnlarge = useCallback(() => {
    setEnlarged(true);
    const el = frameRef.current;
    // iPhone Safari has no element fullscreen; the fixed overlay covers it.
    if (el?.requestFullscreen) void el.requestFullscreen().catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!enlarged) return;
    const onFs = () => {
      if (!document.fullscreenElement) setEnlarged(false);
    };
    document.addEventListener("fullscreenchange", onFs);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("fullscreenchange", onFs);
      document.body.style.overflow = prevOverflow;
    };
  }, [enlarged]);

  useEffect(() => {
    if (!keyboard) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || isTypingTarget(e.target)) return;
      if (e.key === " " || e.key === "k") {
        e.preventDefault();
        p.toggle();
      } else if (e.key === "ArrowRight" || e.key === "l") {
        e.preventDefault();
        p.next();
      } else if (e.key === "ArrowLeft" || e.key === "j") {
        e.preventDefault();
        p.prev();
      } else if (e.key === "f") {
        e.preventDefault();
        if (enlarged) exitEnlarge();
        else enterEnlarge();
      } else if (e.key === "Escape" && enlarged) {
        e.preventDefault();
        exitEnlarge();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [keyboard, p, enlarged, enterEnlarge, exitEnlarge]);

  const active = p.active;
  if (!active) return null;
  const n = p.slides.length;
  const isLast = p.idx >= n - 1;

  const status = p.silent
    ? "No narration on this slide - moving on in a few seconds"
    : p.loading
      ? "Preparing voice…"
      : p.message;

  return (
    <div
      ref={frameRef}
      className={
        enlarged
          ? "fixed inset-0 z-[100] flex flex-col bg-background"
          : "overflow-hidden rounded-2xl border-2 border-foreground bg-background offset-shadow-sm"
      }
    >
      {enlarged && (
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-4 py-2">
          <div className="min-w-0 truncate text-xs text-muted-foreground">
            {title ? <span className="font-semibold text-foreground">{title} · </span> : null}
            Slide {p.idx + 1} of {n}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setFsCaptions((v) => !v)}
              aria-pressed={fsCaptions}
              className="h-9 rounded-full border border-border px-3 text-xs font-semibold hover:bg-muted"
            >
              {fsCaptions ? "Hide captions" : "Show captions"}
            </button>
            <button
              type="button"
              onClick={exitEnlarge}
              className="h-9 rounded-full border border-border px-3 text-xs font-semibold hover:bg-muted"
            >
              ✕ Exit
            </button>
          </div>
        </div>
      )}

      <div
        className={
          enlarged
            ? "flex min-h-0 flex-1 items-center justify-center overflow-auto bg-foreground/5 p-3 sm:p-6"
            : "relative"
        }
      >
        <div
          key={active.n}
          className={
            enlarged
              ? "relative w-full max-w-[min(100%,calc((100dvh-9rem)*16/9))] overflow-hidden rounded-xl border-2 border-foreground bg-background shadow-lg"
              : "relative"
          }
        >
          <SlidePlaybackStage
            slide={active}
            slideIndex={p.idx}
            activeHighlights={p.activeHighlights}
            stageRef={stageRef}
            captionRef={captionRef}
            script={active.script}
            tokens={p.narration.tokens}
            speakingIdx={p.narration.speakingIdx}
            durationSec={p.slideDur || 8}
            timingSource={p.narration.timingSource}
            showCaption={!enlarged || fsCaptions}
          />
          {p.finished && endCard && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/90 p-4 backdrop-blur-sm">
              {endCard}
            </div>
          )}
        </div>
      </div>

      {/* Transport */}
      <div className="border-t border-border px-3 py-3 sm:px-5">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={p.prev}
            disabled={p.idx === 0}
            aria-label="Previous slide"
            className={iconBtn}
          >
            <span aria-hidden className="text-base leading-none">‹</span><span className="hidden sm:inline">Prev</span>
          </button>
          <button
            type="button"
            onClick={p.toggle}
            aria-label={p.playing ? "Pause" : p.finished ? "Watch again" : "Play"}
            className="inline-flex h-11 min-w-[7.5rem] flex-1 items-center whitespace-nowrap justify-center gap-2 rounded-full bg-foreground px-5 text-sm font-semibold text-background transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground focus-visible:ring-offset-2 sm:flex-none"
          >
            {p.loading ? (
              <>
                <span className="h-3 w-3 animate-spin rounded-full border-2 border-background/40 border-t-background" />
                Loading
              </>
            ) : p.playing ? (
              "❚❚ Pause"
            ) : p.finished ? (
              "⟲ Watch again"
            ) : p.idx === 0 && p.currentAbs === 0 ? (
              <span>
                ▶ Play<span className="hidden sm:inline"> from start</span>
              </span>
            ) : (
              "▶ Play"
            )}
          </button>
          <button
            type="button"
            onClick={p.next}
            disabled={isLast}
            aria-label="Next slide"
            className={iconBtn}
          >
            <span className="hidden sm:inline">Next</span><span aria-hidden className="text-base leading-none">›</span>
          </button>
          <div className="hidden flex-1 sm:block" />
          <button
            type="button"
            onClick={p.restart}
            aria-label="Restart from slide 1"
            title="Restart from slide 1"
            className={iconBtn}
          >
            ⟲<span className="hidden md:inline">Restart</span>
          </button>
          <button
            type="button"
            onClick={() => (enlarged ? exitEnlarge() : enterEnlarge())}
            aria-label={enlarged ? "Exit full screen" : "Full screen"}
            title={enlarged ? "Exit full screen (F)" : "Full screen (F)"}
            className={iconBtn}
          >
            {enlarged ? "↘" : "⛶"}
            <span className="hidden md:inline">{enlarged ? "Exit" : "Full screen"}</span>
          </button>
        </div>

        <div className="mt-2 flex min-h-5 items-center justify-between gap-3 font-mono text-[11px] text-muted-foreground">
          <span className="flex min-w-0 items-center gap-2">
            <Waveform className={p.playing ? "text-accent" : "text-muted-foreground"} />
            <span className="truncate" role="status" aria-live="polite">
              {status ?? `Slide ${p.idx + 1} of ${n}`}
            </span>
          </span>
          <span className="shrink-0">
            {fmt(p.currentAbs)} / {fmt(p.totalDur)}
          </span>
        </div>
      </div>

      {/* Per-slide progress: each segment is a slide, tap to jump */}
      <div className="flex h-2.5 items-stretch gap-0.5 bg-background" role="group" aria-label="Jump to slide">
        {p.slides.map((s, i) => {
          const w = p.totalDur > 0 ? (p.durations[i]! / p.totalDur) * 100 : 100 / n;
          const fill =
            i < p.idx || p.finished
              ? 100
              : i === p.idx && p.slideDur > 0
                ? Math.min(100, (p.narration.currentTime / p.slideDur) * 100)
                : 0;
          return (
            <button
              key={s.n}
              type="button"
              onClick={() => p.jump(i)}
              title={`${s.n} · ${s.title}`}
              aria-label={`Go to slide ${i + 1}: ${s.title}`}
              style={{ width: `${w}%` }}
              className="group relative min-w-1 overflow-hidden bg-foreground/15"
            >
              <span
                className="absolute inset-y-0 left-0 bg-accent transition-[width] duration-100"
                style={{ width: `${fill}%` }}
              />
              <span className="absolute inset-0 bg-foreground/0 transition-colors group-hover:bg-foreground/10" />
            </button>
          );
        })}
      </div>
    </div>
  );
}

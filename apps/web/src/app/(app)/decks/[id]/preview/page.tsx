"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppShell } from "@/components/shell";
import { Waveform } from "@/components/ui-kit";
import { getDeck, loadSlidesFor } from "@/lib/deck-store";
import { getAllHighlights, useHighlights } from "@/lib/highlight-store";
import { useHighlightScheduler } from "@/hooks/use-highlight-scheduler";
import { SlidePlaybackStage } from "@/components/highlights/SlidePlaybackStage";
import { getPlaybackState } from "@/lib/playback-state";
import {
  useSpeechNarration,
  usePrefetchNarration,
  unlockNarrationAudio,
} from "@/hooks/use-speech-narration";

function fmt(s: number) {
  const n = Math.max(0, Math.floor(s));
  return `${Math.floor(n / 60)}:${String(n % 60).padStart(2, "0")}`;
}

export default function PreviewPage() {
  const params = useParams();
  const id = String(params.id ?? "");
  const [DECK_SLIDES, setDeckSlides] = useState<
    ReturnType<typeof loadSlidesFor>["slides"]
  >([]);
  const [revision, setRevision] = useState(0);
  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [enlarged, setEnlarged] = useState(false);
  const deckFrameRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const loaded = loadSlidesFor(id);
    setDeckSlides(loaded.slides);
    setRevision(loaded.revision);
    // Ensure working highlight copy is seeded from deck document
    const deck = getDeck(id);
    if (deck?.highlights) {
      const working = getAllHighlights(id);
      if (Object.keys(working).length === 0 && Object.keys(deck.highlights).length > 0) {
        try {
          localStorage.setItem(
            `voxdeck:highlights:${id}`,
            JSON.stringify(deck.highlights),
          );
        } catch {
          /* ignore */
        }
      }
    }
  }, [id]);

  const active = DECK_SLIDES[idx] ?? DECK_SLIDES[0];
  const totalDur = DECK_SLIDES.reduce((a, s) => a + s.durationSec, 0);
  const priorDur = DECK_SLIDES.slice(0, idx).reduce((a, s) => a + s.durationSec, 0);

  const { items: highlights } = useHighlights(id, active?.n ?? "01");

  const advanceOrStop = useCallback(() => {
    setIdx((i) => {
      if (i < DECK_SLIDES.length - 1) {
        return i + 1;
      }
      setPlaying(false);
      return i;
    });
  }, [DECK_SLIDES.length]);

  const narration = useSpeechNarration(
    active?.script ?? "",
    playing && Boolean(active?.script?.trim()),
    advanceOrStop,
  );
  const elapsed = narration.currentTime;
  const slideDur =
    narration.duration > 0 ? narration.duration : (active?.durationSec ?? 0);
  const currentAbs = priorDur + Math.min(elapsed, slideDur || elapsed);
  const progressPct = totalDur > 0 ? (currentAbs / totalDur) * 100 : 0;

  const activeHighlights = useHighlightScheduler(
    active?.script ?? "",
    slideDur || 8,
    highlights,
    elapsed,
  );

  // Shared engine — same calc as Published deck
  const playback = useMemo(
    () =>
      getPlaybackState({
        slideId: active?.n ?? "",
        script: active?.script ?? "",
        durationSec: slideDur || 8,
        currentTimeMs: elapsed * 1000,
        isPlaying: playing,
        highlights,
        tokens: narration.tokens,
      }),
    [active?.n, active?.script, slideDur, elapsed, playing, highlights, narration.tokens],
  );
  void playback;

  const slideScripts = useMemo(
    () => DECK_SLIDES.map((s) => s.script),
    [DECK_SLIDES],
  );
  const { ready: ttsReady, total: ttsTotal, prefetching: ttsPrefetching } =
    usePrefetchNarration(slideScripts);

  const captionRef = useRef<HTMLDivElement>(null);
  const slideStageRef = useRef<HTMLDivElement>(null);

  const exitEnlarge = useCallback(() => {
    setEnlarged(false);
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => undefined);
    }
  }, []);

  const enterEnlarge = useCallback(() => {
    setEnlarged(true);
    const el = deckFrameRef.current;
    if (el && el.requestFullscreen) {
      void el.requestFullscreen().catch(() => undefined);
    }
  }, []);

  useEffect(() => {
    if (!enlarged) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        exitEnlarge();
      }
    };
    const onFs = () => {
      if (!document.fullscreenElement) setEnlarged(false);
    };
    window.addEventListener("keydown", onKey);
    document.addEventListener("fullscreenchange", onFs);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("fullscreenchange", onFs);
    };
  }, [enlarged, exitEnlarge]);

  if (!active) {
    return (
      <AppShell variant="app">
        <div className="p-8 text-sm text-muted-foreground">No slides in this deck.</div>
      </AppShell>
    );
  }

  return (
    <AppShell variant="app">
      <div className="mx-auto grid max-w-7xl gap-6 px-4 py-4 sm:px-6 sm:py-6 lg:grid-cols-[280px_1fr] lg:gap-8">
        <aside className="space-y-6 lg:sticky lg:top-24 lg:self-start">
          <div>
            <div className="eyebrow">Rehearse</div>
            <h1 className="mt-1 font-display text-2xl font-bold leading-tight tracking-tight">
              Watch it end-to-end
              <br />
              before you send.
            </h1>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              Latest saved revision {revision}. Highlights use the same timing engine as
              publish.
            </p>
          </div>

          <div className="flex min-h-0 flex-col">
            <div className="eyebrow mb-3 shrink-0">Slides · {DECK_SLIDES.length}</div>
            <ul className="max-h-[7.5rem] space-y-1 overflow-y-auto overscroll-contain pr-1 font-mono text-xs">
              {DECK_SLIDES.map((s, i) => {
                const isActive = i === idx;
                const done = i < idx;
                return (
                  <li key={s.n}>
                    <button
                      type="button"
                      onClick={() => {
                        setPlaying(false);
                        setIdx(i);
                      }}
                      className={`flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left transition-colors ${
                        isActive ? "bg-foreground text-background" : "hover:bg-muted"
                      }`}
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <span
                          className={`shrink-0 ${isActive ? "text-background/60" : "text-muted-foreground"}`}
                        >
                          {s.n}
                        </span>
                        <span className="truncate font-sans font-medium">{s.title}</span>
                      </span>
                      <span
                        className={`shrink-0 ${
                          isActive
                            ? "text-background/70"
                            : done
                              ? "text-foreground"
                              : "text-muted-foreground"
                        }`}
                      >
                        {fmt(s.durationSec)}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="rounded-2xl border-2 border-foreground bg-accent p-4 offset-shadow-sm">
            <div className="eyebrow">Happy with the walkthrough?</div>
            <p className="mt-1.5 text-sm font-medium leading-snug">
              Publish a full-screen link anyone can watch.
            </p>
            <Link
              href={`/decks/${id}/publish`}
              className="mt-3 flex w-full items-center justify-center rounded-full bg-foreground px-4 py-2 text-xs font-semibold text-background transition-transform hover:-translate-y-0.5"
            >
              Publish → shareable link
            </Link>
            <Link
              href={`/decks/${id}/edit`}
              className="mt-2 flex w-full items-center justify-center rounded-full border border-border bg-background px-4 py-2 text-xs font-semibold text-foreground transition-colors hover:bg-muted"
            >
              ← Back to editor
            </Link>
          </div>
        </aside>

        <section>
          <div className="mb-4 flex items-center justify-between gap-4">
            <div className="text-xs text-muted-foreground">
              Rehearse · <span className="text-foreground">how a recipient experiences it</span>
              {highlights.length > 0 && (
                <span className="ml-2 pill">
                  {highlights.length} highlight{highlights.length === 1 ? "" : "s"} on this
                  slide
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              {DECK_SLIDES.map((s, i) => (
                <div
                  key={s.n}
                  className={`h-1.5 w-6 rounded-full transition-colors ${
                    i < idx ? "bg-foreground" : i === idx ? "bg-accent" : "bg-muted"
                  }`}
                />
              ))}
            </div>
          </div>

          <div
            ref={deckFrameRef}
            className={
              enlarged
                ? "fixed inset-0 z-[100] flex flex-col bg-background"
                : "animate-rise overflow-hidden rounded-2xl border-2 border-foreground bg-background offset-shadow-sm"
            }
          >
            {enlarged && (
              <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-4 py-2">
                <div className="text-xs text-muted-foreground">
                  Full screen · slide {idx + 1} / {DECK_SLIDES.length}
                </div>
                <button
                  type="button"
                  onClick={exitEnlarge}
                  className="rounded-full border border-border px-3 py-1.5 text-xs font-semibold hover:bg-muted"
                >
                  ✕ Exit
                </button>
              </div>
            )}

            <div
              className={
                enlarged
                  ? "flex min-h-0 flex-1 items-center justify-center bg-foreground/5 p-3 sm:p-6"
                  : undefined
              }
            >
              <div
                key={active.n}
                className={
                  enlarged
                    ? "w-full max-w-[min(100%,calc((100vh-7rem)*16/9))] overflow-hidden rounded-xl border-2 border-foreground bg-background shadow-lg"
                    : undefined
                }
              >
                <SlidePlaybackStage
                  slide={active}
                  slideIndex={idx}
                  activeHighlights={activeHighlights}
                  stageRef={slideStageRef}
                  captionRef={captionRef}
                  script={active.script}
                  tokens={narration.tokens}
                  speakingIdx={narration.speakingIdx}
                  durationSec={slideDur || 8}
                  timingSource={narration.timingSource}
                  showCaption={!enlarged}
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 border-t border-border px-3 py-3 sm:gap-4 sm:px-5">
              <button
                type="button"
                onClick={() => {
                  setPlaying(false);
                  setIdx((i) => Math.max(0, i - 1));
                }}
                disabled={idx === 0}
                className="rounded-full border border-border px-3 py-1.5 text-xs font-semibold text-foreground transition-colors hover:bg-muted disabled:opacity-30"
              >
                ◀ Prev
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!playing) unlockNarrationAudio();
                  setPlaying((p) => !p);
                }}
                className="flex items-center gap-2 rounded-full bg-foreground px-4 py-1.5 text-xs font-semibold text-background transition-transform hover:-translate-y-0.5"
              >
                {playing ? "❚❚ Pause" : "▶ Play"}
              </button>
              <button
                type="button"
                onClick={() => {
                  unlockNarrationAudio();
                  setPlaying(false);
                  setIdx(0);
                  window.setTimeout(() => setPlaying(true), 50);
                }}
                className="rounded-full border border-border px-3 py-1.5 text-xs font-semibold text-foreground transition-colors hover:bg-muted"
              >
                ⟲ Restart
              </button>
              <button
                type="button"
                onClick={() => {
                  setPlaying(false);
                  setIdx((i) => Math.min(DECK_SLIDES.length - 1, i + 1));
                }}
                disabled={idx === DECK_SLIDES.length - 1}
                className="rounded-full border border-border px-3 py-1.5 text-xs font-semibold text-foreground transition-colors hover:bg-muted disabled:opacity-30"
              >
                Next ▶
              </button>
              <button
                type="button"
                onClick={() => (enlarged ? exitEnlarge() : enterEnlarge())}
                className="rounded-full border border-border px-3 py-1.5 text-xs font-semibold text-foreground transition-colors hover:bg-muted"
                title={enlarged ? "Exit full screen" : "Show deck full screen"}
              >
                {enlarged ? "↘ Shrink" : "⛶ Enlarge"}
              </button>
              <div className="flex-1" />
              <Waveform className={playing ? "text-accent" : "text-muted-foreground"} />
              <div className="font-mono text-xs text-muted-foreground">
                Slide {idx + 1} of {DECK_SLIDES.length} · {fmt(currentAbs)} / {fmt(totalDur)}
                {ttsPrefetching ? ` · voice ${ttsReady}/${ttsTotal}` : ""}
              </div>
            </div>

            <div className="h-1 bg-muted">
              <div
                className="h-full bg-accent transition-all duration-100"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>

          <div className="mt-6 grid grid-cols-3 gap-3">
            <Tile k="Runtime" v={fmt(totalDur)} hint="if watched end-to-end" />
            <Tile k="Slides" v={`${DECK_SLIDES.length}`} hint="all narrated" />
            <Tile
              k="Highlights"
              v={String(highlights.length)}
              hint={
                highlights.length === 0
                  ? "add markers in the editor"
                  : "fire between start & end words"
              }
            />
          </div>
        </section>
      </div>
    </AppShell>
  );
}

function Tile({ k, v, hint }: { k: string; v: string; hint?: string }) {
  return (
    <div className="rounded-2xl border border-border bg-background p-4">
      <div className="eyebrow">{k}</div>
      <div className="mt-1 font-display text-2xl font-bold tracking-tight">{v}</div>
      {hint && <div className="mt-0.5 text-[11px] text-muted-foreground">{hint}</div>}
    </div>
  );
}

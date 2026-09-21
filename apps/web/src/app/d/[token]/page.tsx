"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Wordmark } from "@/components/shell";
import { StatusPill, Waveform } from "@/components/ui-kit";
import { getShare, type PublishedShare } from "@/lib/share-store";
import { useHighlightScheduler } from "@/hooks/use-highlight-scheduler";
import { SlidePlaybackStage } from "@/components/highlights/SlidePlaybackStage";
import { getPlaybackState } from "@/lib/playback-state";
import {
  useSpeechNarration,
  usePrefetchNarration,
  unlockNarrationAudio,
} from "@/hooks/use-speech-narration";
import type { Highlight } from "@/lib/highlight-store";

function fmt(s: number) {
  const n = Math.max(0, Math.floor(s));
  return `${Math.floor(n / 60)}:${String(n % 60).padStart(2, "0")}`;
}

/**
 * Published recipient viewer — loads the share snapshot (same schema as Review).
 * Uses the shared playback stage + audio-driven highlight scheduler.
 */
export default function ViewerPage() {
  const params = useParams();
  const token = String(params.token ?? "");
  const [share, setShare] = useState<PublishedShare | null>(null);
  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const stageRef = useRef<HTMLDivElement>(null);
  const captionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setShare(getShare(token));
  }, [token]);

  const slides = share?.slides ?? [];
  const active = slides[idx] ?? slides[0];
  const highlights: Highlight[] = useMemo(() => {
    if (!share || !active) return [];
    return share.highlights[active.n] ?? [];
  }, [share, active]);

  const totalDur = slides.reduce((a, s) => a + (s.durationSec ?? 0), 0);
  const priorDur = slides.slice(0, idx).reduce((a, s) => a + (s.durationSec ?? 0), 0);

  const advanceOrStop = useCallback(() => {
    setIdx((i) => {
      if (i < slides.length - 1) return i + 1;
      setPlaying(false);
      return i;
    });
  }, [slides.length]);

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

  const slideScripts = useMemo(() => slides.map((s) => s.script), [slides]);
  usePrefetchNarration(slideScripts);

  if (!share || !active) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background px-4 text-foreground">
        <Wordmark />
        <p className="text-sm text-muted-foreground">
          This share link was not found. Publish the deck again from the studio.
        </p>
        <Link href="/dashboard" className="text-xs font-semibold underline">
          Back to dashboard
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <Wordmark />
            <div className="hidden text-xs text-muted-foreground md:block">
              · {share.title}
              <span className="ml-2 font-mono">rev {share.revision}</span>
            </div>
          </div>
          <StatusPill
            status="live"
            label={`Live · slide ${idx + 1} of ${slides.length}`}
          />
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
        <div className="mb-4 flex items-center gap-1">
          {slides.map((s, i) => (
            <div
              key={s.n}
              className={`h-1.5 flex-1 rounded-full transition-colors ${
                i < idx ? "bg-foreground" : i === idx ? "bg-accent" : "bg-muted"
              }`}
            />
          ))}
        </div>

        <div
          key={active.n}
          className="overflow-hidden rounded-3xl border-2 border-foreground bg-background offset-shadow"
        >
          <SlidePlaybackStage
            slide={active}
            slideIndex={idx}
            activeHighlights={activeHighlights}
            stageRef={stageRef}
            captionRef={captionRef}
            script={active.script}
            tokens={narration.tokens}
            speakingIdx={narration.speakingIdx}
            durationSec={slideDur || 8}
            timingSource={narration.timingSource}
          />

          <div className="flex flex-wrap items-center gap-3 border-t border-border p-3 sm:gap-4 sm:p-4">
            <button
              type="button"
              onClick={() => {
                if (!playing) unlockNarrationAudio();
                setPlaying((p) => !p);
              }}
              className="flex h-12 w-12 items-center justify-center rounded-full bg-accent text-foreground transition-transform hover:scale-105"
            >
              <span className="ml-0.5 text-lg">{playing ? "❚❚" : "▶"}</span>
            </button>
            <div className="order-last w-full min-w-0 sm:order-none sm:w-auto sm:flex-1">
              <div className="mb-1.5 flex items-center justify-between text-[10px] uppercase tracking-widest text-muted-foreground">
                <span>
                  {highlights.length > 0
                    ? `${highlights.length} highlight${highlights.length === 1 ? "" : "s"}`
                    : "Narration"}
                </span>
                <span className="font-mono">
                  {fmt(currentAbs)} / {fmt(totalDur)}
                </span>
              </div>
              <div className="relative h-1 rounded-full bg-muted">
                <div
                  className="absolute inset-y-0 left-0 rounded-full bg-accent transition-all duration-100"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
            </div>
            <Waveform className={playing ? "text-accent" : "text-muted-foreground"} />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setPlaying(false);
                  setIdx((i) => Math.max(0, i - 1));
                }}
                disabled={idx === 0}
                className="rounded-full border border-border px-3 py-1.5 text-xs font-semibold hover:bg-muted disabled:opacity-30"
              >
                ◀ Prev
              </button>
              <button
                type="button"
                onClick={() => {
                  setPlaying(false);
                  setIdx((i) => Math.min(slides.length - 1, i + 1));
                }}
                disabled={idx >= slides.length - 1}
                className="rounded-full bg-accent px-4 py-1.5 text-xs font-semibold text-foreground"
              >
                Next ▶
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

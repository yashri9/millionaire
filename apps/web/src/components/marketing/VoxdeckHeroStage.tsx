"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { VOXDECK_HERO_SLIDES } from "@/lib/marketing-demos";
import { unlockNarrationAudio } from "@/hooks/use-speech-narration";

/**
 * Homepage hero — Voxdeck pitch with fixed slide frame + Uber-style script bar.
 * Advances only after speechSynthesis finishes the current script.
 */
export function VoxdeckHeroStage() {
  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const slide = VOXDECK_HERO_SLIDES[idx]!;
  const total = VOXDECK_HERO_SLIDES.length;
  const genRef = useRef(0);

  const advance = useCallback(() => {
    setIdx((i) => {
      if (i < total - 1) return i + 1;
      setPlaying(false);
      return i;
    });
    setProgress(0);
  }, [total]);

  // Progress bar — visual only; never advances the slide
  useEffect(() => {
    if (!playing) return;
    setProgress(0);
    const start = performance.now();
    const dur = estimateSpeechMs(slide.script, slide.durationSec);
    let raf = 0;
    const tick = (now: number) => {
      setProgress(Math.min(0.98, (now - start) / dur));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, idx, slide.script, slide.durationSec]);

  // Narration — advance only on real utterance end
  useEffect(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    if (!playing) {
      window.speechSynthesis.cancel();
      return;
    }

    const gen = ++genRef.current;
    let disposed = false;
    let startedAt = 0;

    const utter = new SpeechSynthesisUtterance(slide.script);
    utter.rate = 1;

    const safeAdvance = () => {
      if (disposed || gen !== genRef.current) return;
      // Ignore spurious early onend (Chrome cancel/speak race)
      if (performance.now() - startedAt < 400) return;
      setProgress(1);
      advance();
    };

    utter.onend = safeAdvance;
    utter.onerror = (ev) => {
      const err = (ev as SpeechSynthesisErrorEvent).error;
      if (err === "interrupted" || err === "canceled") return;
      safeAdvance();
    };

    // Chrome: cancel then speak on next tick so onend isn't confused
    const startTimer = window.setTimeout(() => {
      if (disposed || gen !== genRef.current) return;
      window.speechSynthesis.cancel();
      startedAt = performance.now();
      window.speechSynthesis.speak(utter);
    }, 60);

    // Chrome bug: synthesis pauses after ~15s — keep it alive
    const keepAlive = window.setInterval(() => {
      if (disposed || !window.speechSynthesis.speaking) return;
      window.speechSynthesis.pause();
      window.speechSynthesis.resume();
    }, 9000);

    return () => {
      disposed = true;
      window.clearTimeout(startTimer);
      window.clearInterval(keepAlive);
      window.speechSynthesis.cancel();
    };
  }, [playing, idx, slide.script, advance]);

  function togglePlay() {
    if (playing) {
      setPlaying(false);
      window.speechSynthesis?.cancel();
      return;
    }
    void unlockNarrationAudio();
    setPlaying(true);
  }

  function go(delta: number) {
    genRef.current += 1;
    window.speechSynthesis?.cancel();
    setPlaying(false);
    setProgress(0);
    setIdx((i) => Math.min(total - 1, Math.max(0, i + delta)));
  }

  const clockSec = progress * estimateSpeechMs(slide.script, slide.durationSec) / 1000;

  return (
    <div className="relative mx-auto w-full max-w-[800px]">
      <div
        className="pointer-events-none absolute -inset-3 rounded-[1.35rem] bg-accent/25 blur-2xl"
        aria-hidden
      />

      <div className="relative overflow-hidden rounded-2xl border-2 border-foreground bg-background offset-shadow">
        <div className="relative aspect-[16/10] w-full shrink-0 overflow-hidden bg-[#0a0a0a]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            key={slide.image}
            src={slide.image}
            alt={`Voxdeck pitch ${slide.n}: ${slide.title}`}
            className="absolute inset-0 h-full w-full object-contain object-center"
            draggable={false}
          />

          <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-3 bg-gradient-to-t from-black/70 to-transparent px-4 pb-3 pt-8 sm:px-5">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => go(-1)}
                disabled={idx === 0}
                className="flex h-7 w-7 items-center justify-center rounded-full border border-white/25 bg-white/10 text-[10px] text-white hover:bg-white/20 disabled:opacity-30"
                aria-label="Previous slide"
              >
                ◀
              </button>
              <button
                type="button"
                onClick={togglePlay}
                className="flex h-8 min-w-[2rem] items-center justify-center rounded-full bg-accent px-3 text-xs font-semibold text-foreground"
                aria-label={playing ? "Pause narration" : "Play narration"}
              >
                {playing ? "❚❚" : "▶"}
              </button>
              <button
                type="button"
                onClick={() => go(1)}
                disabled={idx >= total - 1}
                className="flex h-7 w-7 items-center justify-center rounded-full border border-white/25 bg-white/10 text-[10px] text-white hover:bg-white/20 disabled:opacity-30"
                aria-label="Next slide"
              >
                ▶
              </button>
            </div>

            <div className="flex items-center gap-3">
              <div className="font-mono text-[10px] uppercase tracking-widest text-white/55">
                Voxdeck · {slide.n} / {String(total).padStart(2, "0")}
              </div>
              <div className="h-1 w-24 overflow-hidden rounded-full bg-white/15">
                <div
                  className="h-full rounded-full bg-accent transition-[width] duration-100"
                  style={{ width: `${(playing ? progress : 0) * 100}%` }}
                />
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 border-t-2 border-foreground bg-background px-4 py-3 sm:px-5">
          <button
            type="button"
            onClick={togglePlay}
            className={`waveform shrink-0 ${playing ? "text-foreground" : "text-muted-foreground"}`}
            aria-label={playing ? "Pause narration" : "Play narration"}
          >
            <span />
            <span />
            <span />
            <span />
            <span />
            <span />
            <span />
          </button>
          <p
            key={slide.script}
            className="animate-rise min-w-0 flex-1 truncate text-sm font-medium"
          >
            {slide.script}
          </p>
          <span className="shrink-0 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            {formatClock(clockSec)}
          </span>
        </div>
      </div>
    </div>
  );
}

function estimateSpeechMs(script: string, fallbackSec: number) {
  const words = script.trim().split(/\s+/).filter(Boolean).length;
  // ~145 wpm speaking pace, never shorter than configured duration
  return Math.max(fallbackSec, words / 2.4) * 1000;
}

function formatClock(sec: number) {
  const s = Math.max(0, Math.floor(sec));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

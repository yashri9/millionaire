"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  DEFAULT_MARKETING_DEMO_ID,
  MARKETING_DEMO_DECKS,
  demoSlideImage,
  getMarketingDemo,
  type DemoSlide,
  type MarketingDemoDeck,
} from "@/lib/marketing-demos";

/**
 * Studio section: copy + CTA + sample-deck picker on the left,
 * rehearse player on the right. Add decks in MARKETING_DEMO_DECKS.
 */
export function StudioRehearseSection() {
  const [deckId, setDeckId] = useState(DEFAULT_MARKETING_DEMO_ID);
  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);

  const deck = getMarketingDemo(deckId);
  const slides = deck.slides;
  const slide = slides[idx] ?? slides[0]!;

  function selectDeck(id: string) {
    if (id === deckId) return;
    window.speechSynthesis?.cancel();
    setPlaying(false);
    setProgress(0);
    setIdx(0);
    setDeckId(id);
  }

  useEffect(() => {
    if (!playing) return;
    setProgress(0);
    const start = performance.now();
    const words = slide.script.trim().split(/\s+/).filter(Boolean).length;
    const dur = Math.max(slide.durationSec, words / 2.4) * 1000;
    let raf = 0;

    const tick = (now: number) => {
      // Visual only — never advance slides from the timer
      setProgress(Math.min(0.98, (now - start) / dur));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, idx, slide.durationSec, slide.script]);

  useEffect(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    if (!playing) {
      window.speechSynthesis.cancel();
      return;
    }

    let disposed = false;
    let startedAt = 0;
    const utter = new SpeechSynthesisUtterance(slide.script);
    utter.rate = 1;

    const finish = () => {
      if (disposed) return;
      if (performance.now() - startedAt < 400) return;
      setProgress(1);
      if (idx < slides.length - 1) {
        setIdx((i) => i + 1);
      } else {
        setPlaying(false);
        setProgress(0);
      }
    };

    utter.onend = finish;
    utter.onerror = (ev) => {
      const err = (ev as SpeechSynthesisErrorEvent).error;
      if (err === "interrupted" || err === "canceled") return;
      finish();
    };

    const startTimer = window.setTimeout(() => {
      if (disposed) return;
      window.speechSynthesis.cancel();
      startedAt = performance.now();
      window.speechSynthesis.speak(utter);
    }, 60);

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
  }, [playing, idx, slide.script, deckId, slides.length]);

  function togglePlay() {
    if (playing) {
      setPlaying(false);
      window.speechSynthesis?.cancel();
      return;
    }
    setPlaying(true);
  }

  function go(delta: number) {
    window.speechSynthesis?.cancel();
    setPlaying(false);
    setProgress(0);
    setIdx((i) => Math.min(slides.length - 1, Math.max(0, i + delta)));
  }

  return (
    <div className="mx-auto grid max-w-[1280px] items-start gap-12 px-5 py-16 md:grid-cols-2 md:px-10 md:py-24">
      {/* Left: story + CTA + sample deck picker */}
      <div className="md:sticky md:top-28">
        <div className="eyebrow">Studio</div>
        <h2 className="mt-3 font-display text-3xl font-bold tracking-tighter sm:text-4xl">
          Rehearse like the recipient will hear it.
        </h2>
        <p className="mt-4 max-w-md text-muted-foreground leading-relaxed">
          Switch between sample decks — Uber, Meesho, and more — then play the
          walkthrough with real scripts. Upload your own when you&apos;re ready.
        </p>
        <Link
          href="/decks/new"
          className="mt-8 inline-flex h-11 items-center gap-2 rounded-full border-2 border-foreground bg-background px-5 text-sm font-semibold transition-transform hover:-translate-y-0.5"
        >
          Open the studio →
        </Link>

        {/* Sample decks — sits under the studio CTA */}
        <div className="mt-10 max-w-md rounded-2xl border border-border bg-background p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <span className="eyebrow">Sample decks</span>
            <span className="font-mono text-[10px] text-muted-foreground">
              {MARKETING_DEMO_DECKS.length} demos
            </span>
          </div>
          <div
            role="tablist"
            aria-label="Choose a sample deck"
            className="flex flex-col gap-2 sm:flex-row sm:flex-wrap"
          >
            {MARKETING_DEMO_DECKS.map((d) => {
              const active = d.id === deckId;
              return (
                <button
                  key={d.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => selectDeck(d.id)}
                  className={`min-w-[9.5rem] flex-1 rounded-xl border px-3 py-2.5 text-left transition-colors ${
                    active
                      ? "border-foreground bg-foreground text-background"
                      : "border-border bg-background hover:border-foreground/40"
                  }`}
                >
                  <div className="text-xs font-semibold tracking-tight">{d.name}</div>
                  <div
                    className={`mt-0.5 text-[10px] leading-snug ${
                      active ? "text-background/65" : "text-muted-foreground"
                    }`}
                  >
                    {d.blurb}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Right: rehearse player */}
      <div className="overflow-hidden rounded-2xl border-2 border-foreground bg-background offset-shadow-sm">
        <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
          <div className="flex items-center gap-2">
            <span className="eyebrow">Rehearse</span>
            <span className="rounded-full bg-accent/80 px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wide text-foreground">
              {deck.name}
            </span>
          </div>
          <span className="font-mono text-[10px] text-muted-foreground">
            {slide.n} / {String(slides.length).padStart(2, "0")}
          </span>
        </div>

        <div className="relative aspect-[16/9] bg-chalk">
          <DemoSlideVisual deck={deck} slide={slide} />

          <div className="pointer-events-none absolute bottom-3 left-3 inline-flex items-center gap-2 rounded-full border border-foreground bg-background/95 px-3 py-1.5 text-xs font-semibold shadow-sm backdrop-blur">
            <span
              className={`waveform text-foreground ${playing ? "" : "opacity-40"}`}
              aria-hidden
            >
              <span />
              <span />
              <span />
              <span />
              <span />
            </span>
            {playing ? "Speaking…" : "Paused"}
          </div>
        </div>

        <div className="space-y-3 border-t border-border bg-background px-4 py-3">
          <p
            key={`${deckId}-${slide.script}`}
            className="animate-rise text-sm leading-relaxed text-foreground"
          >
            <span className="mr-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              Script
            </span>
            {slide.script}
          </p>

          <div className="h-1 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-accent"
              style={{ width: `${(playing ? progress : 0) * 100}%` }}
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => go(-1)}
              disabled={idx === 0}
              className="rounded-full border border-border px-3 py-1.5 text-xs font-semibold hover:bg-muted disabled:opacity-30"
            >
              ◀ Prev
            </button>
            <button
              type="button"
              onClick={togglePlay}
              className="rounded-full bg-foreground px-4 py-1.5 text-xs font-semibold text-background"
            >
              {playing ? "❚❚ Pause" : "▶ Play walkthrough"}
            </button>
            <button
              type="button"
              onClick={() => go(1)}
              disabled={idx >= slides.length - 1}
              className="rounded-full border border-border px-3 py-1.5 text-xs font-semibold hover:bg-muted disabled:opacity-30"
            >
              Next ▶
            </button>
            <div className="flex-1" />
            <span className="font-mono text-[10px] text-muted-foreground">
              {slide.title}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function DemoSlideVisual({
  deck,
  slide,
}: {
  deck: MarketingDemoDeck;
  slide: DemoSlide;
}) {
  if (deck.visual === "image") {
    const src = demoSlideImage(deck, slide);
    if (src) {
      return (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={src}
          src={src}
          alt={`${deck.name} slide: ${slide.title}`}
          className="animate-rise h-full w-full object-contain"
        />
      );
    }
  }

  return <StyledDemoSlide slide={slide} />;
}

function StyledDemoSlide({ slide }: { slide: DemoSlide }) {
  const isDark = slide.theme === "uber-dark";

  return (
    <div
      key={slide.n}
      className={`animate-rise absolute inset-0 overflow-hidden transition-colors duration-500 ${
        isDark ? "bg-[#0a0a0a] text-white" : "bg-chalk text-foreground"
      }`}
    >
      {isDark && (
        <div className="absolute inset-0" aria-hidden>
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_30%_20%,rgba(255,255,255,0.12),transparent_50%),linear-gradient(180deg,#111_0%,#050505_100%)]" />
          <div className="uber-trails absolute inset-0 opacity-80" />
          <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/70 to-transparent" />
        </div>
      )}
      {!isDark && (
        <div className="grid-paper absolute inset-0 opacity-40" aria-hidden />
      )}

      <div className="absolute inset-0 flex flex-col justify-between p-6 sm:p-8">
        <div>
          <div className={`eyebrow mb-2 ${isDark ? "!text-white/55" : ""}`}>
            {slide.label}
          </div>
          <div className="font-display text-3xl font-bold tracking-tighter sm:text-4xl">
            {slide.title}
          </div>
          {slide.subtitle && (
            <p
              className={`mt-2 max-w-xs text-sm ${
                isDark ? "text-white/70" : "text-muted-foreground"
              }`}
            >
              {slide.subtitle}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

/** @deprecated */
export function RehearseDemoStage() {
  return <StudioRehearseSection />;
}

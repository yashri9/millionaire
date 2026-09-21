"use client";

import { useEffect, useState } from "react";
import { UBER_DEMO_SLIDES } from "@/lib/marketing-demos";

/**
 * Hero product stage — animated Uber pitch walkthrough.
 * Cycles slides with caption + waveform so the first viewport reads as a talking deck.
 */
export function UberHeroStage() {
  const [idx, setIdx] = useState(0);
  const [progress, setProgress] = useState(0);
  const slide = UBER_DEMO_SLIDES[idx]!;
  const isDark = slide.theme !== "uber-light";

  useEffect(() => {
    setProgress(0);
    const start = performance.now();
    const dur = slide.durationSec * 1000;
    let raf = 0;

    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / dur);
      setProgress(t);
      if (t < 1) {
        raf = requestAnimationFrame(tick);
      } else {
        setIdx((i) => (i + 1) % UBER_DEMO_SLIDES.length);
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [idx, slide.durationSec]);

  return (
    <div className="relative mx-auto w-full max-w-lg md:max-w-none">
      <div
        className="pointer-events-none absolute -inset-3 rounded-[1.35rem] bg-accent/25 blur-2xl"
        aria-hidden
      />

      <div className="relative overflow-hidden rounded-2xl border-2 border-foreground bg-background offset-shadow">
        <div
          className={`relative aspect-[16/10] overflow-hidden transition-colors duration-700 ${
            isDark ? "bg-[#0a0a0a] text-white" : "bg-chalk text-foreground"
          }`}
        >
          {isDark && (
            <div className="absolute inset-0" aria-hidden>
              <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_30%_20%,rgba(255,255,255,0.12),transparent_50%),linear-gradient(180deg,#111_0%,#050505_100%)]" />
              <div className="uber-trails absolute inset-0 opacity-80" />
              <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/80 to-transparent" />
            </div>
          )}
          {!isDark && (
            <div className="grid-paper absolute inset-0 opacity-40" aria-hidden />
          )}

          <div className="absolute inset-0 flex flex-col justify-between p-6 sm:p-8">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className={`eyebrow mb-2 ${isDark ? "!text-white/55" : ""}`}>
                  {slide.label}
                </div>
                <div
                  key={slide.n}
                  className="animate-rise font-display text-3xl font-bold tracking-tighter sm:text-4xl"
                >
                  {slide.title}
                </div>
                {slide.n === "01" && (
                  <p className="mt-2 max-w-[14rem] text-sm text-white/70">
                    Next-generation car service
                  </p>
                )}
                {slide.n === "04" && (
                  <div className="mt-5 flex items-end gap-1.5 sm:gap-2" aria-hidden>
                    {[38, 55, 72, 48, 88, 64, 95, 58, 76, 42, 68, 82].map((h, i) => (
                      <div
                        key={i}
                        className={`uber-bar flex-1 rounded-t ${
                          i === 6 ? "bg-accent" : isDark ? "bg-white/75" : "bg-foreground/80"
                        }`}
                        style={{
                          height: `${h * 0.5}px`,
                          animationDelay: `${i * 0.08}s`,
                        }}
                      />
                    ))}
                  </div>
                )}
              </div>
              <span
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider ${
                  isDark
                    ? "border-white/25 bg-white/10 text-white"
                    : "border-foreground bg-background"
                }`}
              >
                <span className="live-dot" />
                Live
              </span>
            </div>

            <div className="flex items-center justify-between gap-3">
              <div
                className={`font-mono text-[10px] uppercase tracking-widest ${
                  isDark ? "text-white/45" : "text-muted-foreground"
                }`}
              >
                Uber pitch · {slide.n} /{" "}
                {String(UBER_DEMO_SLIDES.length).padStart(2, "0")}
              </div>
              <div
                className={`h-1 w-24 overflow-hidden rounded-full ${
                  isDark ? "bg-white/15" : "bg-foreground/10"
                }`}
              >
                <div
                  className="h-full rounded-full bg-accent"
                  style={{ width: `${progress * 100}%` }}
                />
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 border-t-2 border-foreground bg-background px-4 py-3 sm:px-5">
          <span className="waveform text-foreground" aria-hidden>
            <span />
            <span />
            <span />
            <span />
            <span />
            <span />
            <span />
          </span>
          <p
            key={slide.script}
            className="animate-rise min-w-0 flex-1 truncate text-sm font-medium"
          >
            {slide.script}
          </p>
          <span className="shrink-0 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            {formatClock(progress * slide.durationSec)}
          </span>
        </div>
      </div>
    </div>
  );
}

function formatClock(sec: number) {
  const s = Math.max(0, Math.floor(sec));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

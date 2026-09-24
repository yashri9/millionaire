"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { VOXDECK_HERO_SLIDES } from "@/lib/marketing-demos";

/**
 * Oasis iPad stage — real Voxdeck pitch deck (slide images + walkthrough).
 */
export function OasisIpadDemo() {
  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const slide = VOXDECK_HERO_SLIDES[idx]!;
  const total = VOXDECK_HERO_SLIDES.length;
  const genRef = useRef(0);

  const advance = useCallback(() => {
    setIdx((i) => {
      if (i < total - 1) return i + 1;
      setPlaying(false);
      return i;
    });
  }, [total]);

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
      if (performance.now() - startedAt < 400) return;
      advance();
    };

    utter.onend = safeAdvance;
    utter.onerror = (ev) => {
      const err = (ev as SpeechSynthesisErrorEvent).error;
      if (err === "interrupted" || err === "canceled") return;
      safeAdvance();
    };

    const startTimer = window.setTimeout(() => {
      if (disposed || gen !== genRef.current) return;
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
  }, [playing, idx, slide.script, advance]);

  function togglePlay() {
    if (playing) {
      setPlaying(false);
      window.speechSynthesis?.cancel();
      return;
    }
    setPlaying(true);
  }

  function go(delta: number) {
    genRef.current += 1;
    window.speechSynthesis?.cancel();
    setPlaying(false);
    setIdx((i) => Math.min(total - 1, Math.max(0, i + delta)));
  }

  return (
    <section className="demo-stage" id="demo">
      <div className="stage-label">{playing ? "PLAYING" : "READY"}</div>
      <span className="stage-featured">
        Featured / {slide.n}
      </span>
      <div
        className="showcase-ipad"
        aria-label="Voxdeck presentation playing on a landscape iPad"
      >
        <span className="showcase-camera" aria-hidden="true" />
        <div className="showcase-screen">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            key={slide.image}
            src={slide.image}
            alt={`Voxdeck pitch ${slide.n}: ${slide.title}`}
            draggable={false}
          />
          <div className="showcase-player">
            <button
              type="button"
              className="showcase-play"
              onClick={togglePlay}
              aria-label={playing ? "Pause walkthrough" : "Play walkthrough"}
            >
              {playing ? "❚❚" : "▶"}
            </button>
            <span className="showcase-meta">
              {idx + 1}/{total}
            </span>
            <div className="showcase-nav">
              <button
                type="button"
                onClick={() => go(-1)}
                disabled={idx === 0}
                aria-label="Previous slide"
              >
                ◀
              </button>
              <button
                type="button"
                onClick={() => go(1)}
                disabled={idx >= total - 1}
                aria-label="Next slide"
              >
                ▶
              </button>
            </div>
          </div>
        </div>
        <span className="showcase-side-button" aria-hidden="true" />
      </div>
      <p className="direct-frame">―　REAL DECK · {total} SLIDES</p>
      <p className="stage-caption">
        <b>Voxdeck</b> — Narrated walkthrough.
      </p>
    </section>
  );
}

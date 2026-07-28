import { useEffect, useRef, useState } from "react";
import { Waveform } from "@/components/ui-kit";

/**
 * Landing-page comparison slider.
 * Drag the vertical glider left → reveal the AI-narrated deck (animated
 * highlights, spotlight, avatar speaking, auto-advance).
 * Drag right → reveal the plain static deck.
 */

const SLIDES = [
  {
    n: 1,
    chapter: "Market",
    title: "92% of pilots convert to paid.",
    script: "Ninety-two percent of our pilot customers convert to paid within sixty days.",
    highlightWord: "Ninety-two percent",
    spotlight: { x: 8, y: 58, w: 46, h: 30 },
  },
  {
    n: 2,
    chapter: "Traction",
    title: "$4.2M ARR in nine months.",
    script: "We hit four point two million in annual recurring revenue in just nine months.",
    highlightWord: "four point two million",
    spotlight: { x: 50, y: 20, w: 42, h: 34 },
  },
  {
    n: 3,
    chapter: "Team",
    title: "Ex-Stripe. Ex-Figma. Shipping.",
    script: "Our founding team ships fast — ex-Stripe, ex-Figma, ex-Linear.",
    highlightWord: "ships fast",
    spotlight: { x: 6, y: 22, w: 88, h: 20 },
  },
];

export function DeckCompareSlider() {
  const [pos, setPos] = useState(50); // 0..100, left side = AI deck visible
  const [slideIdx, setSlideIdx] = useState(0);
  const [wordIdx, setWordIdx] = useState(-1);
  const trackRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);

  const active = SLIDES[slideIdx];
  const words = active.script.split(" ");

  // Auto narration: advance word every 260ms, then next slide.
  useEffect(() => {
    setWordIdx(-1);
    let i = 0;
    const iv = window.setInterval(() => {
      setWordIdx(i);
      i++;
      if (i > words.length) {
        window.clearInterval(iv);
        window.setTimeout(() => setSlideIdx((s) => (s + 1) % SLIDES.length), 900);
      }
    }, 280);
    return () => window.clearInterval(iv);
  }, [slideIdx]);

  // Drag handlers
  useEffect(() => {
    const move = (clientX: number) => {
      const el = trackRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const p = ((clientX - r.left) / r.width) * 100;
      setPos(Math.max(4, Math.min(96, p)));
    };
    const onMove = (e: MouseEvent) => draggingRef.current && move(e.clientX);
    const onTouch = (e: TouchEvent) => draggingRef.current && e.touches[0] && move(e.touches[0].clientX);
    const stop = () => (draggingRef.current = false);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", stop);
    window.addEventListener("touchmove", onTouch);
    window.addEventListener("touchend", stop);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", stop);
      window.removeEventListener("touchmove", onTouch);
      window.removeEventListener("touchend", stop);
    };
  }, []);

  return (
    <section id="product" className="border-b border-border bg-chalk/30 py-16 md:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-6 md:mb-12">
          <div>
            <div className="eyebrow mb-3">Before · After</div>
            <h2 className="font-display text-4xl font-bold tracking-tighter sm:text-5xl">
              Drag to see the difference.
            </h2>
          </div>
          <p className="max-w-sm text-muted-foreground">
            Slide left for the Voxdeck AI presenter — animated highlights, spotlight,
            and a narrating avatar. Slide right for the deck you send today.
          </p>
        </div>

        <div
          ref={trackRef}
          className="relative aspect-[16/9] w-full select-none overflow-hidden rounded-3xl border-2 border-foreground bg-background offset-shadow"
        >
          {/* RIGHT layer: static old deck (full width, behind) */}
          <StaticDeck slide={active} />

          {/* LEFT layer: AI deck, clipped by slider position */}
          <div
            className="absolute inset-0 overflow-hidden"
            style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}
          >
            <AIDeck slide={active} words={words} wordIdx={wordIdx} />
          </div>

          {/* Labels */}
          <div
            className="pointer-events-none absolute left-4 top-4 rounded-full border-2 border-foreground bg-accent px-3 py-1 text-[11px] font-bold uppercase tracking-widest text-foreground transition-opacity"
            style={{ opacity: pos > 15 ? 1 : 0 }}
          >
            Voxdeck · AI presenter
          </div>
          <div
            className="pointer-events-none absolute right-4 top-4 rounded-full border-2 border-foreground bg-background px-3 py-1 text-[11px] font-bold uppercase tracking-widest text-foreground transition-opacity"
            style={{ opacity: pos < 85 ? 1 : 0 }}
          >
            Your deck today
          </div>

          {/* Glider */}
          <div
            className="absolute inset-y-0 z-20 w-0.5 bg-foreground"
            style={{ left: `${pos}%` }}
          >
            <button
              type="button"
              aria-label="Drag to compare"
              onMouseDown={() => (draggingRef.current = true)}
              onTouchStart={() => (draggingRef.current = true)}
              className="absolute top-1/2 flex h-12 w-12 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize items-center justify-center rounded-full border-2 border-foreground bg-accent offset-shadow-sm active:scale-95"
            >
              <span className="font-mono text-lg font-bold text-foreground">‹›</span>
            </button>
          </div>
        </div>

      </div>
    </section>
  );
}

function StaticDeck({ slide }: { slide: (typeof SLIDES)[number] }) {
  return (
    <div className="absolute inset-0 bg-background">
      <div className="grid-paper absolute inset-0 opacity-40" aria-hidden />
      <div className="relative flex h-full flex-col justify-between p-6 sm:p-10">
        <div className="flex items-start justify-between">
          <div>
            <div className="eyebrow mb-2">Chapter {slide.n}</div>
            <div className="font-display text-3xl font-bold leading-[0.95] tracking-tighter sm:text-5xl md:text-6xl">
              {slide.title}
            </div>
          </div>
          <div className="eyebrow text-right text-muted-foreground">Scapia · 2026</div>
        </div>
        <div className="flex items-end gap-1.5">
          {[40, 60, 80, 55, 90, 70, 100, 65, 80, 45, 60, 85].map((h, i) => (
            <div key={i} style={{ height: `${h * 0.5}px` }} className="flex-1 rounded-t bg-foreground/80" />
          ))}
        </div>
      </div>
    </div>
  );
}

function AIDeck({
  slide,
  words,
  wordIdx,
}: {
  slide: (typeof SLIDES)[number];
  words: string[];
  wordIdx: number;
}) {
  const highlightTokens = slide.highlightWord.toLowerCase().split(" ");
  return (
    <div className="absolute inset-0 bg-background">
      <div className="grid-paper absolute inset-0 opacity-40" aria-hidden />

      {/* Spotlight box */}
      <div
        className="absolute rounded-lg border-2 border-accent bg-accent/15 transition-opacity duration-500"
        style={{
          left: `${slide.spotlight.x}%`,
          top: `${slide.spotlight.y}%`,
          width: `${slide.spotlight.w}%`,
          height: `${slide.spotlight.h}%`,
          opacity: wordIdx >= 0 ? 1 : 0,
          boxShadow: "0 0 0 9999px hsl(var(--foreground) / 0.35)",
        }}
      />

      <div className="relative flex h-full flex-col justify-between p-6 sm:p-10">
        <div className="flex items-start justify-between">
          <div>
            <div className="eyebrow mb-2">Chapter {slide.n}</div>
            <div className="font-display text-3xl font-bold leading-[0.95] tracking-tighter sm:text-5xl md:text-6xl">
              {slide.title.split(" ").map((w, i) => {
                const clean = w.replace(/[^a-z0-9]/gi, "").toLowerCase();
                const hit = highlightTokens.some((t) => t.replace(/[^a-z0-9]/gi, "") === clean);
                return (
                  <span
                    key={i}
                    className={hit && wordIdx >= 0 ? "bg-accent/70 px-1 rounded" : ""}
                  >
                    {w}{" "}
                  </span>
                );
              })}
            </div>
          </div>
          <div className="eyebrow text-right text-muted-foreground">Scapia · 2026</div>
        </div>

        <div className="flex items-end gap-1.5">
          {[40, 60, 80, 55, 90, 70, 100, 65, 80, 45, 60, 85].map((h, i) => (
            <div
              key={i}
              style={{ height: `${h * 0.5}px` }}
              className={`flex-1 rounded-t transition-colors ${
                i === Math.min(wordIdx, 11) ? "bg-accent" : "bg-foreground/80"
              }`}
            />
          ))}
        </div>
      </div>

      {/* Avatar bubble */}
      <div className="absolute bottom-3 right-3 flex items-center gap-2 rounded-full border-2 border-foreground bg-background/95 px-2 py-1 pr-3 offset-shadow-sm">
        <span className="relative flex h-9 w-9 items-center justify-center rounded-full bg-accent text-base">
          🧑‍💼
          <span className="absolute -inset-0.5 animate-ping rounded-full border-2 border-accent opacity-60" />
        </span>
        <div className="leading-tight">
          <div className="text-[11px] font-semibold text-foreground">Marcus</div>
          <div className="flex items-center gap-1 font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
            <Waveform className="text-accent" /> speaking
          </div>
        </div>
      </div>

      {/* Caption strip */}
      <div className="absolute bottom-3 left-3 max-w-[60%] rounded-xl border-2 border-foreground bg-background/95 px-3 py-2 offset-shadow-sm">
        <div className="eyebrow mb-1 text-[9px]">Narration</div>
        <p className="text-xs leading-snug">
          {words.map((w, i) => (
            <span
              key={i}
              className={
                i === wordIdx
                  ? "font-semibold text-foreground underline underline-offset-4 decoration-accent decoration-2"
                  : i < wordIdx
                  ? "text-foreground/70"
                  : "text-muted-foreground"
              }
            >
              {w}{" "}
            </span>
          ))}
        </p>
      </div>
    </div>
  );
}

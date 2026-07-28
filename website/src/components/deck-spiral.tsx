import { useEffect, useRef, useState } from "react";

/**
 * Scroll-driven 3D spiral of mock deck slide cards.
 * Inspired by the Framer "Spiral" ring component — cards helix around a
 * vertical axis and slowly descend as the user scrolls this section.
 *
 * Implementation: a tall wrapper (`h-[260vh]`) with an inner `sticky` stage.
 * Progress 0→1 is derived from how far the wrapper has scrolled through the
 * viewport. Each card is placed via CSS 3D transforms:
 *   angle = base + progress * turns  →  rotateY around the axis
 *   y     = row * step  - progress * travel  →  descent
 * The stage keeps `preserve-3d` so the helix reads as depth, not a flat ring.
 */

const CARDS: Array<{
  chapter: string;
  title: string;
  tint: string; // tailwind bg-* class for the card face
  accent?: boolean;
}> = [
  { chapter: "Cover", title: "Series A · Aurora", tint: "bg-background" },
  { chapter: "Market", title: "$18B TAM", tint: "bg-accent/70", accent: true },
  { chapter: "Product", title: "One PDF. One link.", tint: "bg-background" },
  { chapter: "Traction", title: "$4.2M ARR", tint: "bg-foreground text-background" },
  { chapter: "Pricing", title: "Land · Expand", tint: "bg-background" },
  { chapter: "Team", title: "Ex-Stripe · Ex-Figma", tint: "bg-accent/70", accent: true },
  { chapter: "Roadmap", title: "Ship weekly.", tint: "bg-background" },
  { chapter: "Ask", title: "$8M seed", tint: "bg-foreground text-background" },
  { chapter: "Case", title: "Northwind · 3.2×", tint: "bg-background" },
  { chapter: "Deck", title: "Board update Q3", tint: "bg-accent/70", accent: true },
  { chapter: "Sales", title: "Warm intro deck", tint: "bg-background" },
  { chapter: "Demo", title: "Live walkthrough", tint: "bg-foreground text-background" },
];

export function DeckSpiral() {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    let raf = 0;
    const compute = () => {
      const r = el.getBoundingClientRect();
      const vh = window.innerHeight;
      // 0 when the section's top hits the viewport top,
      // 1 when its bottom leaves the viewport bottom.
      const total = r.height - vh;
      const p = Math.max(0, Math.min(1, -r.top / total));
      setProgress(p);
    };
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(compute);
    };
    compute();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  const RADIUS = 260;         // px, ring radius
  const STEP_Y = 130;          // px, vertical distance between cards along the helix
  const TURNS = 2.2;           // how many full rotations across the scroll span
  const TRAVEL = STEP_Y * (CARDS.length - 4); // how far the helix travels upward

  return (
    <section
      ref={wrapperRef}
      className="relative border-b border-border bg-background"
      style={{ height: "260vh" }}
      aria-label="Deck spiral gallery"
    >
      <div className="sticky top-0 flex h-screen w-full flex-col overflow-hidden">
        <div className="grid-paper absolute inset-0 opacity-30" aria-hidden />

        {/* Copy */}
        <div className="relative z-10 mx-auto w-full max-w-7xl px-4 pt-14 sm:px-6 md:pt-20">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div>
              <div className="eyebrow mb-3">Every deck. Every industry.</div>
              <h2 className="font-display text-4xl font-bold leading-[0.95] tracking-tighter sm:text-5xl md:text-6xl">
                Scroll. We cover<br />the whole <span className="italic">stack</span>.
              </h2>
            </div>
            <p className="max-w-sm text-muted-foreground">
              Fundraise, board updates, sales, product, onboarding — Voxdeck narrates
              every kind of deck you'd otherwise send as a silent PDF.
            </p>
          </div>
        </div>

        {/* 3D Stage */}
        <div
          className="relative flex-1"
          style={{ perspective: "1400px", perspectiveOrigin: "50% 45%" }}
        >
          {/* Central axis dot + soft floor */}
          <div className="pointer-events-none absolute left-1/2 top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-foreground/40" />
          <div
            className="pointer-events-none absolute left-1/2 top-1/2 h-64 w-[720px] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-40 blur-3xl"
            style={{ background: "hsl(var(--accent) / 0.35)" }}
          />

          <div
            className="absolute left-1/2 top-1/2 h-0 w-0"
            style={{ transformStyle: "preserve-3d" }}
          >
            {CARDS.map((c, i) => {
              const t = progress;
              // Start below viewport, descend past center as we scroll.
              const yBase = i * STEP_Y - t * TRAVEL - STEP_Y * 1.4;
              const angle = (i / CARDS.length) * 360 + t * 360 * TURNS;
              // Fade cards that are far from the center row
              const dist = Math.abs(yBase) / (STEP_Y * 3);
              const opacity = Math.max(0.08, 1 - dist * 0.9);
              const scale = 0.85 + Math.max(0, 1 - dist) * 0.15;

              return (
                <div
                  key={i}
                  className="absolute left-0 top-0"
                  style={{
                    transform: `translate(-50%, -50%) rotateY(${angle}deg) translateZ(${RADIUS}px) translateY(${yBase}px) rotateY(${-angle * 0}deg) scale(${scale})`,
                    opacity,
                    transformStyle: "preserve-3d",
                    willChange: "transform, opacity",
                  }}
                >
                  <SpiralCard chapter={c.chapter} title={c.title} tint={c.tint} accent={c.accent} />
                </div>
              );
            })}
          </div>

          {/* Top / bottom fade masks so cards enter and exit softly */}
          <div className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-background to-transparent" />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-background to-transparent" />
        </div>

        {/* Scroll hint */}
        <div className="pointer-events-none absolute bottom-6 left-1/2 z-10 -translate-x-1/2 font-mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
          scroll · spiral
        </div>
      </div>
    </section>
  );
}

function SpiralCard({
  chapter,
  title,
  tint,
  accent,
}: {
  chapter: string;
  title: string;
  tint: string;
  accent?: boolean;
}) {
  return (
    <div
      className={`flex h-40 w-64 flex-col justify-between rounded-xl border-2 border-foreground p-4 offset-shadow-sm ${tint}`}
      style={{ backfaceVisibility: "hidden" }}
    >
      <div className="flex items-center justify-between">
        <span className="font-mono text-[10px] font-bold uppercase tracking-widest opacity-70">
          {chapter}
        </span>
        {accent ? (
          <span className="h-2 w-2 rounded-full bg-foreground" />
        ) : (
          <span className="h-2 w-2 rounded-full bg-foreground/30" />
        )}
      </div>
      <div className="font-display text-lg font-bold leading-[1.05] tracking-tight">
        {title}
      </div>
      <div className="flex items-end gap-1">
        {[30, 55, 40, 75, 60, 90, 45, 70].map((h, i) => (
          <div
            key={i}
            className="flex-1 rounded-t bg-current opacity-40"
            style={{ height: `${h * 0.18}px` }}
          />
        ))}
      </div>
    </div>
  );
}

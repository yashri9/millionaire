import { useEffect, useRef, useState } from "react";
import { Waveform } from "@/components/ui-kit";

/**
 * Three soft "value" cards that sit directly under the compare slider.
 * Styling is intentionally softer than the rest of the marketing page —
 * rounded, light tinted surfaces, no hard offset shadows — so the section
 * feels like a calm summary strip after the loud comparison above.
 * The middle card is a dark accent card with a floating mini-preview.
 */

const CARDS = [
  {
    kicker: "Written for you",
    title: "A script that sounds like you wrote it at 2am — but sharper.",
    body: "Voxdeck reads every slide, understands the arc, and writes narration that lands the punchline. Edit one line, keep the rest.",
    accent: false,
  },
  {
    kicker: "Voiced in seconds",
    title: "An AI voice prospects don't skip.",
    body: "Twelve studio-grade personas. Pick a tone, pick a pace, ship the deck. Regenerate a single sentence without rebuilding the whole thing.",
    accent: true,
  },
  {
    kicker: "Watched to the end",
    title: "See exactly which slide made them lean in.",
    body: "Per-slide dwell time, replays, and drop-off — delivered to your inbox the moment a prospect closes the tab.",
    accent: false,
  },
];

export function DeckValueCards() {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [openIdx, setOpenIdx] = useState(0); // exactly one card is always open

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          io.disconnect();
        }
      },
      { threshold: 0.2 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <section className="border-b border-border bg-chalk/30 pb-16 pt-4 md:pb-24 md:pt-6">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        {/* Exactly one card is open at a time; hover swaps which one. */}
        <div ref={ref} className="flex flex-col gap-5 md:flex-row md:items-stretch md:justify-center md:gap-2">
          {CARDS.map((c, i) => {
            const Icon = ICONS[i];
            const open = openIdx === i;
            return (
              <article
                key={c.title}
                onMouseEnter={() => setOpenIdx(i)}
                onFocus={() => setOpenIdx(i)}
                style={{ transitionDelay: visible ? `${i * 140}ms` : "0ms" }}
                className={`group relative flex h-[260px] overflow-hidden rounded-3xl transition-[width,opacity,transform] duration-500 ease-out ${
                  open ? "w-[540px]" : "w-[340px]"
                } ${
                  c.accent
                    ? "bg-foreground text-background"
                    : "bg-muted/60 text-foreground"
                } ${visible ? "translate-y-0 opacity-100" : "translate-y-8 opacity-0"}`}
              >
                {/* LEFT HALF — text (fixed width so it never squeezes) */}
                <div className="flex w-[340px] shrink-0 flex-col justify-between p-6">
                  <div
                    className={`flex h-11 w-11 items-center justify-center rounded-full ${
                      c.accent
                        ? "bg-accent text-foreground"
                        : "bg-background text-foreground shadow-sm"
                    }`}
                    aria-hidden
                  >
                    <Icon />
                  </div>
                  <div>
                    <div className="mb-2 flex items-center justify-between">
                      <span
                        className={`font-mono text-[10px] font-semibold uppercase tracking-widest ${
                          c.accent ? "text-accent" : "text-muted-foreground"
                        }`}
                      >
                        {c.kicker}
                      </span>
                      <span
                        className={`font-mono text-[10px] ${
                          c.accent ? "text-background/50" : "text-muted-foreground"
                        }`}
                      >
                        0{i + 1}
                      </span>
                    </div>
                    <h3 className="font-display text-lg font-bold leading-tight tracking-tight">
                      {c.title}
                    </h3>
                    <p
                      className={`mt-2 text-xs leading-relaxed ${
                        c.accent ? "text-background/70" : "text-muted-foreground"
                      }`}
                    >
                      {c.body}
                    </p>
                  </div>
                </div>

                {/* RIGHT HALF — revealed as the card widens on hover */}
                <div className="flex w-[200px] shrink-0 items-center justify-center p-4">
                  {i === 0 && <ScriptTypewriter visible={visible} />}
                  {i === 1 && <MiniDeckPreview />}
                  {i === 2 && <AnalyticsPulse />}
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/* ---------- rest-state icons (one per card, tied to title) ---------- */

const ICONS = [
  // 01 — Written for you: pencil on document
  () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 3v4a1 1 0 0 0 1 1h4" />
      <path d="M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2z" />
      <path d="m9 14 3 3 5-5" />
    </svg>
  ),
  // 02 — Voiced in seconds: mic
  () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="2" width="6" height="12" rx="3" />
      <path d="M5 10a7 7 0 0 0 14 0" />
      <path d="M12 17v4" />
    </svg>
  ),
  // 03 — Watched to the end: eye / analytics
  () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  ),
];


/* ---------- micro-animations ---------- */

function ScriptTypewriter({ visible }: { visible: boolean }) {
  const full = "Hey — I'll get right to it.";
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!visible) return;
    setN(0);
    const id = window.setInterval(() => {
      setN((v) => (v >= full.length ? 0 : v + 1));
    }, 90);
    return () => window.clearInterval(id);
  }, [visible]);
  return (
    <div className="w-full max-w-[260px] rounded-xl border border-border bg-background px-4 py-3 font-mono text-xs text-foreground shadow-sm">
      <span>{full.slice(0, n)}</span>
      <span className="ml-0.5 inline-block h-3 w-[2px] animate-pulse bg-foreground align-middle" />
    </div>
  );
}

/** Floating mini deck preview inside the dark middle card, echoes reference. */
function MiniDeckPreview() {
  return (
    <div className="relative w-full max-w-[260px] rounded-xl bg-background text-foreground shadow-2xl">
      <div className="grid-paper absolute inset-0 rounded-xl opacity-40" aria-hidden />
      <div className="relative p-3">
        <div className="eyebrow mb-1 text-[9px]">Chapter 02</div>
        <div className="font-display text-sm font-bold leading-tight tracking-tight">
          $4.2M ARR in nine months.
        </div>
        <div className="mt-3 flex items-end gap-1">
          {[40, 60, 80, 55, 90, 70, 100, 65].map((h, i) => (
            <div
              key={i}
              style={{ height: `${h * 0.24}px` }}
              className="flex-1 rounded-t bg-foreground/70"
            />
          ))}
        </div>
        <div className="mt-2 flex items-center gap-2 rounded-md border border-border bg-background px-2 py-1">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-accent text-[10px]">
            ▶
          </span>
          <Waveform className="text-accent" />
          <span className="ml-auto font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
            00:14
          </span>
        </div>
      </div>
    </div>
  );
}

function AnalyticsPulse() {
  const bars = [30, 55, 80, 95, 72, 48];
  return (
    <div className="w-full max-w-[260px] rounded-xl border border-border bg-background p-3 shadow-sm">
      <div className="flex h-16 items-end gap-1.5">
        {bars.map((h, i) => (
          <div
            key={i}
            style={{
              height: `${h}%`,
              animationDelay: `${i * 120}ms`,
            }}
            className="w-full animate-[pulse_2s_ease-in-out_infinite] rounded-t bg-foreground/70"
          />
        ))}
      </div>
      <div className="mt-2 flex items-center justify-between font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
        <span>Dwell / slide</span>
        <span className="flex items-center gap-1.5">
          <span className="live-dot" /> live
        </span>
      </div>
    </div>
  );
}

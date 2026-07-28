import { useRef, useState } from "react";

/**
 * Vertical stack of landscape deck cards, sitting to the right of the hero copy.
 * Cards fan top-to-bottom with slight horizontal offsets. On hover, the card
 * pulls left (away from the stack) and then rises to the vertical center —
 * as if someone slid it out and lifted it up.
 */

type Deck = {
  id: string;
  chapter: string;
  title: string;
  tint: string;
  ink: string;
  accent: string;
  vibe: "wave" | "bars" | "cursor" | "type" | "pulse";
};

const DECKS: Deck[] = [
  { id: "seed",    chapter: "Seed round",   title: "Aurora Labs",    tint: "bg-[#0F172A]", ink: "text-white",       accent: "bg-[#60A5FA]",  vibe: "wave" },
  { id: "sales",   chapter: "Sales deck",   title: "Northwind Q3",   tint: "bg-[#FEF3C7]", ink: "text-[#111827]",   accent: "bg-[#F59E0B]",  vibe: "bars" },
  { id: "product", chapter: "Product tour", title: "Voxdeck v0.1",   tint: "bg-accent",     ink: "text-foreground",  accent: "bg-foreground", vibe: "cursor" },
  { id: "board",   chapter: "Board update", title: "Longtide · Feb", tint: "bg-[#111827]", ink: "text-white",       accent: "bg-[#F472B6]",  vibe: "type" },
  { id: "brief",   chapter: "Design brief", title: "Kestrel Studio", tint: "bg-[#ECFDF5]", ink: "text-[#064E3B]",   accent: "bg-[#10B981]",  vibe: "pulse" },
];

// vertical stack offsets
const TOP  = [0, 70, 140, 210, 280];         // px from top per card
const XOFF = [24, -12, 18, -18, 12];         // small horizontal jitter
const ROT  = [-4, 3, -2, 4, -3];             // gentle rotation

const CENTER_TOP = 140; // middle of the stack

export function DeckDriftCards() {
  const [hover, setHover] = useState<string | null>(null);
  const [phase, setPhase] = useState<"out" | "up" | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const enter = (id: string) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setHover(id);
    setPhase("out");
    timerRef.current = setTimeout(() => setPhase("up"), 180);
  };
  const leave = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setHover(null);
    setPhase(null);
  };

  return (
    <div
      className="relative mx-auto h-[460px] w-full max-w-[440px]"
      onMouseLeave={leave}
      style={{ perspective: "1400px" }}
    >
      {DECKS.map((d, i) => {
        const isHover = hover === d.id;

        let top = TOP[i];
        let x = XOFF[i];
        let rot = ROT[i];
        let z = 5 - Math.abs(i - 2) * 2;
        let dur = 500;

        if (isHover && phase === "out") {
          x = -80;
          rot = ROT[i] * 0.4;
          z = 40;
          dur = 220;
        } else if (isHover && phase === "up") {
          top = CENTER_TOP;
          x = 0;
          rot = 0;
          z = 90;
          dur = 360;
        }

        const zIndex = isHover ? 50 : 10 + i;

        return (
          <button
            key={d.id}
            type="button"
            onMouseEnter={() => enter(d.id)}
            onFocus={() => enter(d.id)}
            onBlur={leave}
            style={{
              top: `${top}px`,
              transform: `translate3d(${x}px, 0, ${z}px) rotate(${rot}deg)`,
              zIndex,
              transformStyle: "preserve-3d",
              aspectRatio: "16 / 9",
              transitionDuration: `${dur}ms`,
              transitionProperty: "top, transform",
            }}
            className={`absolute left-0 right-0 mx-auto h-[170px] w-[300px] origin-center rounded-2xl border-2 border-foreground shadow-[6px_6px_0_0_hsl(var(--foreground))] ease-[cubic-bezier(0.22,1,0.36,1)] sm:h-[190px] sm:w-[340px] ${d.tint} ${d.ink} focus:outline-none focus-visible:ring-2 focus-visible:ring-accent`}
            aria-label={`${d.chapter} — ${d.title}`}
          >
            <MiniSlide deck={d} active={isHover && phase === "up"} />
          </button>
        );
      })}
    </div>
  );
}

function MiniSlide({ deck, active }: { deck: Deck; active: boolean }) {
  return (
    <div className="relative flex h-full flex-col justify-between p-4 text-left">
      <div className="flex items-center justify-between">
        <span className="font-mono text-[9px] uppercase tracking-widest opacity-70">{deck.chapter}</span>
        <span className={`h-2 w-2 rounded-full ${deck.accent} ${active ? "animate-ping" : ""}`} />
      </div>
      <div>
        <div className="font-display text-lg font-bold leading-tight tracking-tight">{deck.title}</div>
        <div className="mt-1 text-[10px] opacity-60">Slide 01 · Cover</div>
      </div>
      <div className="h-10">
        <VibeVisual vibe={deck.vibe} accent={deck.accent} active={active} />
      </div>
    </div>
  );
}

function VibeVisual({ vibe, accent, active }: { vibe: Deck["vibe"]; accent: string; active: boolean }) {
  if (vibe === "wave") {
    const bars = [40, 70, 30, 90, 55, 80, 45, 65, 35, 75];
    return (
      <div className="flex h-full items-center gap-[3px]">
        {bars.map((h, i) => (
          <div key={i} style={{ height: active ? `${h}%` : "20%", transitionDelay: `${i * 40}ms` }} className={`w-full rounded-full ${accent} transition-all duration-500`} />
        ))}
      </div>
    );
  }
  if (vibe === "bars") {
    const bars = [30, 55, 80, 95, 72, 60];
    return (
      <div className="flex h-full items-end gap-1">
        {bars.map((h, i) => (
          <div key={i} style={{ height: active ? `${h}%` : "12%", transitionDelay: `${i * 70}ms` }} className={`w-full rounded-t ${accent} transition-all duration-500`} />
        ))}
      </div>
    );
  }
  if (vibe === "cursor") {
    return (
      <div className="relative h-full overflow-hidden rounded border border-foreground/20">
        <div className={`absolute inset-y-0 w-1/3 ${accent} opacity-40 transition-all duration-700 ${active ? "left-[66%]" : "left-0"}`} />
        <div className="absolute inset-0 flex items-center justify-center font-mono text-[10px] tracking-widest opacity-70">NARRATING…</div>
      </div>
    );
  }
  if (vibe === "type") {
    return (
      <div className="flex h-full items-center rounded border border-white/20 px-2 font-mono text-[10px]">
        <span className="opacity-70">{active ? "Q4 up 42% YoY" : "Q4 up"}</span>
        <span className="ml-0.5 inline-block h-3 w-[2px] animate-pulse bg-white align-middle" />
      </div>
    );
  }
  return (
    <div className="flex h-full items-center justify-center gap-2">
      {[0, 1, 2].map((i) => (
        <span key={i} style={{ animationDelay: `${i * 200}ms` }} className={`h-2 w-2 rounded-full ${accent} ${active ? "animate-bounce" : "opacity-40"}`} />
      ))}
    </div>
  );
}

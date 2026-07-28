import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { AppShell } from "@/components/shell";
import { Waveform } from "@/components/ui-kit";
import { loadSlidesFor } from "@/lib/deck-store";
import { useHighlights } from "@/lib/highlight-store";
import { useHighlightScheduler } from "@/hooks/use-highlight-scheduler";
import { timeTokens } from "@/lib/word-timing";
import { TextMarker } from "@/components/highlights/TextMarker";
import { RegionSpotlight } from "@/components/highlights/RegionSpotlight";
import { useAutoWordHighlights } from "@/hooks/use-auto-word-highlights";
import { AutoWordHighlightLayer } from "@/components/highlights/AutoWordHighlightLayer";
import { useSpeechNarration } from "@/hooks/use-speech-narration";

export const Route = createFileRoute("/deck/$id/preview")({
  head: () => ({
    meta: [
      { title: "Rehearsal · Voxdeck" },
      { name: "description", content: "See exactly what your prospect will see." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: PreviewPage,
});

function fmt(s: number) {
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function PreviewPage() {
  const { id } = useParams({ from: "/deck/$id/preview" });
  const { slides: DECK_SLIDES } = useMemo(() => loadSlidesFor(id), [id]);
  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [elapsed, setElapsed] = useState(0); // seconds, fractional

  const active = DECK_SLIDES[idx] ?? DECK_SLIDES[0];
  const totalDur = DECK_SLIDES.reduce((a, s) => a + s.durationSec, 0);
  const priorDur = DECK_SLIDES.slice(0, idx).reduce((a, s) => a + s.durationSec, 0);
  const currentAbs = priorDur + Math.min(elapsed, active.durationSec);
  const progressPct = (currentAbs / totalDur) * 100;

  const { items: highlights } = useHighlights(id, active.n);
  const activeHighlights = useHighlightScheduler(active.script, active.durationSec, highlights, elapsed);

  // Smooth 100ms tick for animated marker/spotlight progress
  useEffect(() => {
    if (!playing) return;
    const t = window.setInterval(() => {
      setElapsed((e) => {
        const next = e + 0.1;
        if (next >= active.durationSec) {
          if (idx < DECK_SLIDES.length - 1) { setIdx(idx + 1); return 0; }
          setPlaying(false); return active.durationSec;
        }
        return next;
      });
    }, 100);
    return () => window.clearInterval(t);
  }, [playing, idx, active.durationSec]);

  useEffect(() => setElapsed(0), [idx]);

  // Caption strip: which token is currently being spoken?
  // Prefer the actual SpeechSynthesis word-boundary event; fall back to
  // time-estimated position if speech is unavailable or hasn't fired yet.
  const tokens = useMemo(() => timeTokens(active.script, active.durationSec), [active.script, active.durationSec]);
  const nowMs = elapsed * 1000;
  const spokenIdx = useSpeechNarration(active.script, playing);
  const estimatedIdx = tokens.findIndex((t) => nowMs >= t.startMs && nowMs < t.endMs);
  const speakingIdx = spokenIdx >= 0 ? spokenIdx : estimatedIdx;

  const captionRef = useRef<HTMLDivElement>(null);
  const slideStageRef = useRef<HTMLDivElement>(null);
  const slideImgRef = useRef<HTMLImageElement>(null);

  // Auto-highlight PDF words fuzzily aligned to the currently-spoken script token.
  const autoBoxes = useAutoWordHighlights(active.script, speakingIdx, active.words);

  return (
    <AppShell variant="app">
      <div className="mx-auto grid max-w-7xl gap-6 px-4 py-4 sm:px-6 sm:py-6 lg:grid-cols-[280px_1fr] lg:gap-8">
        {/* Left rail */}
        <aside className="space-y-6 lg:sticky lg:top-24 lg:self-start">
          <div>
            <div className="eyebrow">The rep's view</div>
            <h1 className="mt-1 font-display text-2xl font-bold leading-tight tracking-tight">
              Watch it end-to-end<br />before you send.
            </h1>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              No analytics are recorded. Nothing here reaches anyone else.
            </p>
          </div>

          <div>
            <div className="eyebrow mb-3">Slides · {DECK_SLIDES.length}</div>
            <ul className="space-y-1 font-mono text-xs">
              {DECK_SLIDES.map((s, i) => {
                const isActive = i === idx;
                const done = i < idx;
                return (
                  <li key={s.n}>
                    <button
                      onClick={() => setIdx(i)}
                      className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left transition-colors ${
                        isActive ? "bg-foreground text-background" : "hover:bg-muted"
                      }`}
                    >
                      <span className="flex items-center gap-2">
                        <span className={isActive ? "text-background/60" : "text-muted-foreground"}>{s.n}</span>
                        <span className="font-sans font-medium">{s.title}</span>
                      </span>
                      <span className={isActive ? "text-background/70" : done ? "text-foreground" : "text-muted-foreground"}>
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
              to="/deck/$id/publish"
              params={{ id }}
              className="mt-3 flex w-full items-center justify-center rounded-full bg-foreground px-4 py-2 text-xs font-semibold text-background transition-transform hover:-translate-y-0.5"
            >
              Publish → shareable link
            </Link>
            <Link
              to="/deck/$id"
              params={{ id }}
              className="mt-2 flex w-full items-center justify-center rounded-full border border-border bg-background px-4 py-2 text-xs font-semibold text-foreground transition-colors hover:bg-muted"
            >
              ← Back to editor
            </Link>
          </div>
        </aside>

        {/* Main stage */}
        <section>
          <div className="mb-4 flex items-center justify-between gap-4">
            <div className="text-xs text-muted-foreground">
              Preview · <span className="text-foreground">how a recipient experiences it</span>
              {highlights.length > 0 && (
                <span className="ml-2 pill">{highlights.length} highlight{highlights.length === 1 ? "" : "s"} on this slide</span>
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

          {/* Slide stage */}
          <div key={active.n} className="animate-rise overflow-hidden rounded-2xl border-2 border-foreground bg-background offset-shadow-sm">
            <div ref={slideStageRef} className="relative aspect-[16/9] bg-background">
              {active.thumbnail ? (
                <img
                  ref={slideImgRef}
                  src={active.thumbnail}
                  alt={active.title}
                  data-slide-element="page"
                  className="absolute inset-0 h-full w-full object-contain"
                />
              ) : (
                <>
                  <div className="grid-paper absolute inset-0 opacity-40" aria-hidden />
                  <div className="relative flex h-full flex-col justify-between p-10">
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="eyebrow mb-3" data-slide-element="chapter">Chapter {active.n}</div>
                        <div data-slide-element="title" className="font-display text-6xl font-bold leading-[0.9] tracking-tighter">
                          {active.title}
                        </div>
                      </div>
                      <div className="eyebrow text-right text-muted-foreground" data-slide-element="brand">Scapia · 2026</div>
                    </div>
                    <div data-slide-element="chart" className="flex items-end gap-1.5">
                      {[40, 60, 80, 55, 90, 70, 100, 65, 80, 45, 60, 85].map((h, i) => (
                        <div
                          key={i}
                          style={{ height: `${h * 0.7}px` }}
                          className={`flex-1 rounded-t transition-colors ${i === idx + 4 ? "bg-accent" : "bg-foreground/80"}`}
                        />
                      ))}
                    </div>
                  </div>
                </>
              )}

              {/* Region spotlights */}
              {activeHighlights
                .filter((a) => a.highlight.kind === "region")
                .map((a) => (
                  <RegionSpotlight
                    key={a.highlight.id}
                    region={a.highlight as Extract<typeof a.highlight, { kind: "region" }>}
                    progress={a.progress}
                  />
                ))}

              {/* Text markers overlaid on any matching slide text */}
              {activeHighlights
                .filter((a) => a.highlight.kind === "text")
                .map((a) => (
                  <TextMarker
                    key={a.highlight.id + "-slide"}
                    containerRef={slideStageRef}
                    phrase={(a.highlight as Extract<typeof a.highlight, { kind: "text" }>).text}
                    progress={a.progress}
                    active
                  />
                ))}

              {/* Auto word-level highlights: matches spoken script token to PDF words. */}
              {active.thumbnail && active.words && active.words.length > 0 && (
                <AutoWordHighlightLayer
                  imgRef={slideImgRef}
                  containerRef={slideStageRef}
                  boxes={autoBoxes}
                />
              )}

              {/* Avatar placeholder — will show a lip-synced presenter next to the slide */}
              <div className="pointer-events-none absolute bottom-3 right-3 flex items-center gap-2 rounded-full border-2 border-foreground bg-background/95 px-2 py-1 pr-3 offset-shadow-sm backdrop-blur">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-muted text-base">🧑‍💼</span>
                <div className="leading-tight">
                  <div className="text-[11px] font-semibold text-foreground">Avatar</div>
                  <div className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">Coming soon</div>
                </div>
              </div>
            </div>


            {/* Caption strip — the script, with the currently-spoken word underlined */}
            <div ref={captionRef} className="relative border-t border-border bg-chalk/40 px-6 py-4">
              <div className="eyebrow mb-2">Narration</div>
              <p className="relative flex flex-wrap gap-x-1.5 gap-y-1 text-base leading-relaxed">
                {tokens.map((t) => (
                  <span
                    key={t.index}
                    className={`transition-colors ${
                      t.index === speakingIdx ? "text-foreground" : t.endMs < nowMs ? "text-foreground/70" : "text-muted-foreground"
                    }`}
                  >
                    {t.text}
                  </span>
                ))}
              </p>
              {/* Text markers on the caption itself */}
              {activeHighlights
                .filter((a) => a.highlight.kind === "text")
                .map((a) => (
                  <TextMarker
                    key={a.highlight.id + "-caption"}
                    containerRef={captionRef}
                    phrase={(a.highlight as Extract<typeof a.highlight, { kind: "text" }>).text}
                    progress={a.progress}
                    active
                  />
                ))}
            </div>

            {/* Transport bar */}
            <div className="flex flex-wrap items-center gap-2 border-t border-border px-3 py-3 sm:gap-4 sm:px-5">
              <button
                onClick={() => setIdx((i) => Math.max(0, i - 1))}
                disabled={idx === 0}
                className="rounded-full border border-border px-3 py-1.5 text-xs font-semibold text-foreground transition-colors hover:bg-muted disabled:opacity-30"
              >
                ◀ Prev
              </button>
              <button
                onClick={() => setPlaying((p) => !p)}
                className="flex items-center gap-2 rounded-full bg-foreground px-4 py-1.5 text-xs font-semibold text-background transition-transform hover:-translate-y-0.5"
              >
                {playing ? "❚❚ Pause" : "▶ Play"}
              </button>
              <button
                onClick={() => { setIdx(0); setElapsed(0); setPlaying(true); }}
                className="rounded-full border border-border px-3 py-1.5 text-xs font-semibold text-foreground transition-colors hover:bg-muted"
              >
                ⟲ Restart
              </button>
              <button
                onClick={() => setIdx((i) => Math.min(DECK_SLIDES.length - 1, i + 1))}
                disabled={idx === DECK_SLIDES.length - 1}
                className="rounded-full border border-border px-3 py-1.5 text-xs font-semibold text-foreground transition-colors hover:bg-muted disabled:opacity-30"
              >
                Next ▶
              </button>
              <div className="flex-1" />
              <Waveform className={playing ? "text-accent" : "text-muted-foreground"} />
              <div className="font-mono text-xs text-muted-foreground">
                Slide {idx + 1} of {DECK_SLIDES.length} · {fmt(currentAbs)} / {fmt(totalDur)}
              </div>
            </div>

            <div className="h-1 bg-muted">
              <div className="h-full bg-accent transition-all duration-100" style={{ width: `${progressPct}%` }} />
            </div>
          </div>

          <div className="mt-6 grid grid-cols-3 gap-3">
            <Tile k="Runtime" v={fmt(totalDur)} hint="if watched end-to-end" />
            <Tile k="Slides" v={`${DECK_SLIDES.length}`} hint="all narrated" />
            <Tile
              k="Highlights"
              v={String(highlights.length)}
              hint={highlights.length === 0 ? "add markers in the editor" : "fire on trigger words"}
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

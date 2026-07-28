import { createFileRoute, Link, Outlet, useParams, useMatches } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { AppShell } from "@/components/shell";
import { Button, StatusPill, StripedProgress, Waveform } from "@/components/ui-kit";
import { Panel, ComingSoonBadge } from "@/components/ui-panel";
import { useHighlights, type Highlight } from "@/lib/highlight-store";
import { tokenize } from "@/lib/word-timing";
import { TriggerPicker } from "@/components/highlights/TriggerPicker";
import { RegionDrawLayer, type DrawnRegion } from "@/components/highlights/RegionDrawLayer";
import { RegionOutline } from "@/components/highlights/RegionSpotlight";
import { loadSlidesFor, saveDeck, getDeck } from "@/lib/deck-store";

export const Route = createFileRoute("/deck/$id")({
  head: () => ({
    meta: [
      { title: "Editor · Voxdeck" },
      { name: "description", content: "Direct your deck's voice — script per slide, voice, pace, and publish." },
    ],
  }),
  component: EditorPage,
});

type SlideStatus = "ready" | "edited" | "review" | "muted" | "generating" | "failed";

type Slide = {
  n: string;
  title: string;
  script: string;
  duration: string;
  status: SlideStatus;
};

function fmtDur(sec: number) {
  return `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, "0")}`;
}

function slidesForDeck(id: string): { title: string; slides: Slide[]; thumbs: Record<string, string> } {
  const { title, slides } = loadSlidesFor(id);
  const thumbs: Record<string, string> = {};
  const out: Slide[] = slides.map((s, i) => {
    if (s.thumbnail) thumbs[s.n] = s.thumbnail;
    const status: SlideStatus = i === 2 ? "edited" : i === 4 ? "review" : i === 5 ? "generating" : "ready";
    return { n: s.n, title: s.title, script: s.script, duration: fmtDur(s.durationSec), status };
  });
  return { title, slides: out, thumbs };
}

const statusDot: Record<SlideStatus, string> = {
  ready:      "bg-live",
  edited:     "bg-foreground",
  review:     "bg-warn",
  muted:      "bg-muted-foreground",
  generating: "bg-foreground",
  failed:     "bg-danger",
};

const statusLabel: Record<SlideStatus, string> = {
  ready: "Ready", edited: "Edited", review: "Review", muted: "Muted", generating: "Generating", failed: "Failed",
};

function EditorPage() {
  const matches = useMatches();
  const hasChild = matches.some((m) => m.routeId !== "/deck/$id" && m.routeId.startsWith("/deck/$id"));
  if (hasChild) return <Outlet />;
  return <EditorInner />;
}

function EditorInner() {
  const { id } = useParams({ from: "/deck/$id" });
  const initial = useMemo(() => slidesForDeck(id), [id]);
  const [deckTitle, setDeckTitle] = useState(initial.title);
  const [thumbs] = useState<Record<string, string>>(initial.thumbs);
  const [slides, setSlides] = useState<Slide[]>(initial.slides);
  const [selected, setSelected] = useState<string>(initial.slides[0]?.n ?? "01");
  const [playing, setPlaying] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  useEffect(() => { setSavedAt(new Date()); }, []);
  const [savedFlash, setSavedFlash] = useState(false);

  const active = slides.find((s) => s.n === selected) ?? slides[0];
  const activeIndex = slides.findIndex((s) => s.n === selected);

  // ---- Highlights ----
  const { items: highlights, add: addHighlight, remove: removeHighlight } = useHighlights(id, active.n);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const slideStageRef = useRef<HTMLDivElement>(null);
  const [selectionRange, setSelectionRange] = useState<{ start: number; end: number } | null>(null);
  const [drawingRegion, setDrawingRegion] = useState(false);
  const [pending, setPending] = useState<
    | { kind: "text"; phrase: { start: number; end: number }; text: string }
    | { kind: "region"; region: DrawnRegion }
    | null
  >(null);

  function onTextareaSelect() {
    const el = textareaRef.current;
    if (!el) return;
    const start = el.selectionStart, end = el.selectionEnd;
    if (end > start) setSelectionRange({ start, end });
    else setSelectionRange(null);
  }

  function openTextHighlightPicker() {
    if (!selectionRange) return;
    const text = active.script.slice(selectionRange.start, selectionRange.end);
    if (!text.trim()) return;
    setPending({ kind: "text", phrase: selectionRange, text });
  }

  function onRegionCommit(region: DrawnRegion) {
    setDrawingRegion(false);
    setPending({ kind: "region", region });
  }

  function commitTrigger(triggerWordIndex: number) {
    if (!pending) return;
    if (pending.kind === "text") {
      addHighlight({
        kind: "text",
        phrase: pending.phrase,
        text: pending.text,
        triggerWordIndex,
        holdMs: 1400,
      } as Omit<Highlight, "id">);
    } else {
      addHighlight({
        kind: "region",
        shape: pending.region.shape,
        bbox: pending.region.bbox,
        snappedTo: pending.region.snappedTo,
        triggerWordIndex,
        holdMs: 2500,
      } as Omit<Highlight, "id">);
    }
    setPending(null);
    setSelectionRange(null);
  }

  const scriptTokens = useMemo(() => tokenize(active.script), [active.script]);


  const wordCount = useMemo(() => active.script.trim().split(/\s+/).filter(Boolean).length, [active.script]);
  const spokenSec = Math.max(3, Math.round((wordCount / 155) * 60));
  const spokenReadout = `${Math.floor(spokenSec / 60)}:${String(spokenSec % 60).padStart(2, "0")}`;

  const savedStr = useMemo(
    () => savedAt ? savedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "—",
    [savedAt],
  );

  function updateScript(next: string) {
    setSlides((prev) => prev.map((s) => (s.n === selected ? { ...s, script: next, status: "edited" } : s)));
    setSavedAt(new Date());
    setSavedFlash(true);
    // Persist to deck store so Preview reads the edit
    const stored = getDeck(id);
    if (stored) {
      const updated = {
        ...stored,
        slides: stored.slides.map((s) => (s.n === selected ? { ...s, script: next } : s)),
      };
      saveDeck(updated);
    }
    window.clearTimeout((updateScript as any)._t);
    (updateScript as any)._t = window.setTimeout(() => setSavedFlash(false), 1200);
  }

  function step(delta: number) {
    const next = slides[(activeIndex + delta + slides.length) % slides.length];
    setSelected(next.n);
  }

  function regenerate() {
    setRegenerating(true);
    window.setTimeout(() => {
      setSlides((prev) => prev.map((s) => (s.n === selected ? { ...s, status: "ready" } : s)));
      setRegenerating(false);
      setSavedAt(new Date());
      setSavedFlash(true);
      window.setTimeout(() => setSavedFlash(false), 1200);
    }, 1400);
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName;
      const inField = tag === "INPUT" || tag === "TEXTAREA";
      if (e.code === "Space" && !inField) { e.preventDefault(); setPlaying((p) => !p); }
      else if (e.key === "j" && !inField) step(1);
      else if (e.key === "k" && !inField) step(-1);
      else if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); regenerate(); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIndex, selected]);

  return (
    <AppShell variant="app">
      <div className="flex min-h-[calc(100vh-4rem)] flex-col lg:h-[calc(100vh-4rem)]">
        {/* Editor header */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3 sm:px-6 sm:py-4">
          <div className="flex min-w-0 items-center gap-3 sm:gap-4">
            <Link to="/dashboard" className="text-sm text-muted-foreground hover:text-foreground">← Decks</Link>
            <div className="hidden h-6 w-px bg-border sm:block" />
            <div className="min-w-0">
              <div className="truncate font-display text-base font-bold tracking-tight sm:text-lg">{deckTitle}</div>
              <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground sm:gap-3">
                <StatusPill status="draft" />
                <span className="hidden sm:inline">· 6 slides · <span className={`font-mono transition-opacity ${savedFlash ? "text-foreground" : ""}`}>saved {savedStr}</span></span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="mr-2 hidden items-center gap-1.5 font-mono text-[10px] uppercase tracking-widest text-muted-foreground xl:flex">
              <kbd className="rounded border border-border bg-muted px-1.5 py-0.5">Space</kbd> play
              <kbd className="ml-2 rounded border border-border bg-muted px-1.5 py-0.5">J</kbd>
              <kbd className="rounded border border-border bg-muted px-1.5 py-0.5">K</kbd> step
              <kbd className="ml-2 rounded border border-border bg-muted px-1.5 py-0.5">⌘↵</kbd> regen
            </div>
            <Link
              to="/deck/$id/preview"
              params={{ id }}
              className="inline-flex h-8 items-center justify-center rounded-full border-2 border-foreground bg-background px-3 text-xs font-semibold text-foreground transition-colors hover:bg-foreground hover:text-background"
            >
              Preview
            </Link>
            <Link
              to="/deck/$id/publish"
              params={{ id }}
              className="inline-flex h-8 items-center justify-center gap-1 rounded-full bg-foreground px-3 text-xs font-semibold text-background transition-transform hover:-translate-y-0.5"
            >
              Publish →
            </Link>
          </div>
        </div>

        {/* Panes */}
        <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[220px_1fr_320px] xl:grid-cols-[240px_1fr_320px]">
          {/* Filmstrip — horizontal scroll on mobile, vertical rail on desktop */}
          <aside className="min-h-0 border-b border-border bg-chalk/40 p-3 lg:overflow-y-auto lg:border-b-0 lg:border-r">
            <div className="eyebrow mb-3 px-2">Filmstrip · {slides.length}</div>
            <div className="flex gap-2 overflow-x-auto pb-1 lg:block lg:space-y-2 lg:overflow-x-visible lg:pb-0">
              {slides.map((s) => {
                const isActive = s.n === selected;
                return (
                  <button
                    key={s.n}
                    onClick={() => setSelected(s.n)}
                    className={`group relative block w-40 shrink-0 rounded-xl border p-2 text-left transition-all lg:w-full ${
                      isActive
                        ? "-translate-y-0.5 border-foreground bg-background offset-shadow-sm"
                        : "border-border bg-background hover:-translate-y-0.5 hover:offset-shadow-sm"
                    }`}
                  >
                    <div className="relative aspect-video overflow-hidden rounded-md bg-muted">
                      {thumbs[s.n] ? (
                        <img src={thumbs[s.n]} alt="" className="absolute inset-0 h-full w-full object-cover" />
                      ) : (
                        <>
                          <div className="grid-paper absolute inset-0 opacity-40" aria-hidden />
                          <div className="absolute inset-x-2 bottom-2 truncate font-display text-xs font-bold tracking-tight">
                            {s.title}
                          </div>
                        </>
                      )}
                      <div className="absolute left-2 top-1.5 rounded bg-background/80 px-1 font-mono text-[9px] font-semibold text-foreground">
                        {s.n}
                      </div>
                      {isActive && playing && (
                        <div className="absolute right-1.5 top-1.5">
                          <span className="live-dot" />
                        </div>
                      )}
                    </div>
                    <div className="mt-1.5 flex items-center justify-between px-0.5">
                      <div className="flex items-center gap-1.5">
                        <span className={`inline-block h-1.5 w-1.5 rounded-full ${statusDot[s.status]}`} />
                        <span className="text-[10px] font-medium text-muted-foreground">{statusLabel[s.status]}</span>
                      </div>
                      <span className="font-mono text-[10px] text-muted-foreground">{s.duration}</span>
                    </div>
                  </button>
                );
              })}
              <button className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border py-3 text-xs font-medium text-muted-foreground transition-colors hover:border-foreground hover:text-foreground">
                + Add interstitial
              </button>
            </div>
          </aside>

          {/* Canvas + script */}
          <section className="min-h-0 overflow-y-auto p-4 sm:p-6">
            {/* Slide preview */}
            <div key={active.n} className="animate-rise relative overflow-hidden rounded-2xl border-2 border-foreground bg-background offset-shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-muted/50 px-3 py-2 sm:px-4">
                <div className="flex min-w-0 items-center gap-2 text-xs">
                  <span className="pill">Slide {active.n} / {slides.length}</span>
                  <span className="truncate font-mono text-muted-foreground">· {active.title}</span>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setDrawingRegion((v) => !v)}
                    className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-widest transition-colors ${
                      drawingRegion
                        ? "border-foreground bg-foreground text-background"
                        : "border-border text-foreground hover:bg-muted"
                    }`}
                    title="Draw a shape around an element to highlight it during playback"
                  >
                    <span className="text-[13px] leading-none">◯</span> <span className="hidden sm:inline">Highlight area</span><span className="sm:hidden">Area</span>
                  </button>
                  <span className="hidden items-center gap-1.5 text-[10px] uppercase tracking-widest text-muted-foreground sm:flex">
                    <span className={`inline-block h-1.5 w-1.5 rounded-full ${statusDot[active.status]}`} />
                    {statusLabel[active.status]}
                  </span>
                </div>
              </div>
              <div ref={slideStageRef} className="relative aspect-video overflow-hidden bg-background">
                {thumbs[active.n] ? (
                  <img
                    src={thumbs[active.n]}
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
                          <div data-slide-element="title" className="font-display text-6xl font-bold leading-none tracking-tighter">
                            {active.title}
                          </div>
                        </div>
                        <div className="eyebrow text-right" data-slide-element="brand">Scapia · 2026</div>
                      </div>
                      <div data-slide-element="chart" className="flex items-end gap-1">
                        {[40, 60, 80, 55, 90, 70, 100, 65, 80, 45, 60, 85].map((h, i) => (
                          <div
                            key={i}
                            style={{ height: `${h * 0.7}px` }}
                            className={`flex-1 rounded-t ${i === activeIndex + 4 ? "bg-accent" : "bg-foreground/80"}`}
                          />
                        ))}
                      </div>
                    </div>
                  </>
                )}

                {/* Existing region highlights (edit mode) */}
                {highlights.filter((h): h is Extract<Highlight, { kind: "region" }> => h.kind === "region").map((r) => (
                  <RegionOutline key={r.id} region={r} onDelete={() => removeHighlight(r.id)} />
                ))}

                {/* Draw layer */}
                <RegionDrawLayer
                  active={drawingRegion}
                  onCommit={onRegionCommit}
                  onCancel={() => setDrawingRegion(false)}
                />
              </div>
            </div>


            {/* Script editor — two column */}
            <div className="mt-5 rounded-2xl border border-border bg-background">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3 sm:px-5">
                <div className="eyebrow">Narration script · slide {active.n}</div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant={selectionRange ? "accent" : "ghost"}
                    onClick={openTextHighlightPicker}
                    disabled={!selectionRange}
                    title="Select a phrase in the script, then bind it to a trigger word"
                  >
                    ✎ Highlight
                  </Button>
                  <div className="mx-1 hidden h-6 w-px self-center bg-border sm:block" />
                  <Button size="sm" variant="ghost" onClick={regenerate}>Shorten</Button>
                  <Button size="sm" variant="ghost" onClick={regenerate}>Punch it up</Button>
                  <Button size="sm" variant="secondary" onClick={regenerate}>Regenerate</Button>
                </div>
              </div>
              <div className="grid gap-0 md:grid-cols-[1fr_180px]">
                <div className="relative p-5">
                  {regenerating && (
                    <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/85 backdrop-blur-sm">
                      <div className="w-64">
                        <StripedProgress value={62} label="Regenerating" />
                      </div>
                    </div>
                  )}
                  <textarea
                    key={active.n}
                    ref={textareaRef}
                    value={active.script}
                    onChange={(e) => updateScript(e.target.value)}
                    onSelect={onTextareaSelect}
                    onKeyUp={onTextareaSelect}
                    onMouseUp={onTextareaSelect}
                    rows={5}
                    className="w-full resize-none border-0 bg-transparent p-0 text-base leading-relaxed text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-0"
                    placeholder="Write the line this slide is delivering…"
                  />
                  {selectionRange && (
                    <div className="mt-3 rounded-lg border border-dashed border-accent bg-accent/10 px-3 py-2 text-xs">
                      <span className="eyebrow mr-2 text-foreground">Selected</span>
                      <span className="font-medium">"{active.script.slice(selectionRange.start, selectionRange.end)}"</span>
                      <span className="ml-2 text-muted-foreground">→ click <b>Highlight</b> to bind a trigger word.</span>
                    </div>
                  )}

                  {/* Highlights list */}
                  {highlights.length > 0 && (
                    <div className="mt-4 space-y-2">
                      <div className="eyebrow">Highlights on this slide</div>
                      {highlights.map((h) => {
                        const trig = scriptTokens[h.triggerWordIndex]?.text ?? "?";
                        return (
                          <div key={h.id} className="flex items-center gap-3 rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs">
                            <span className={`flex h-6 w-6 items-center justify-center rounded-full font-mono text-[10px] font-bold ${h.kind === "text" ? "bg-accent text-accent-foreground" : "bg-foreground text-background"}`}>
                              {h.kind === "text" ? "T" : "◯"}
                            </span>
                            <div className="min-w-0 flex-1">
                              <div className="truncate font-medium">
                                {h.kind === "text"
                                  ? <>Marker: "{h.text}"</>
                                  : <>Spotlight: {h.snappedTo ?? "freehand region"}</>}
                              </div>
                              <div className="mt-0.5 text-[10px] text-muted-foreground">
                                Fires after word <span className="font-mono text-foreground">"{trig}"</span>
                              </div>
                            </div>
                            <button
                              onClick={() => removeHighlight(h.id)}
                              className="rounded-full border border-border px-2 py-1 font-mono text-[10px] font-semibold text-muted-foreground hover:border-danger hover:text-danger"
                            >
                              Remove
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  <div className="mt-4 flex flex-wrap gap-2">
                    <button className="pill">[Warm]</button>
                    <button className="pill">[Pause 0.5s]</button>
                    <button className="pill">[Emphasize]</button>
                    <button className="pill">[Softer]</button>
                  </div>
                </div>
                <div className="border-t border-border p-5 md:border-l md:border-t-0">
                  <div className="space-y-4">
                    <div>
                      <div className="eyebrow">Spoken</div>
                      <div className="mt-1 font-mono text-2xl font-semibold">{spokenReadout}</div>
                    </div>
                    <div>
                      <div className="eyebrow">Words</div>
                      <div className="mt-1 font-mono text-2xl font-semibold">{wordCount}</div>
                    </div>
                    <div>
                      <div className="eyebrow mb-1">Tone</div>
                      <span className="pill">Confident</span>
                    </div>
                    <div>
                      <div className="eyebrow mb-1">Highlights</div>
                      <div className="font-mono text-2xl font-semibold">{highlights.length}</div>
                      <div className="text-[10px] text-muted-foreground">markers + spotlights</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Inspector — grouped, collapsible (Canva-style) */}
          <aside className="min-h-0 space-y-3 border-t border-border bg-chalk/40 p-4 lg:overflow-y-auto lg:border-l lg:border-t-0">
            <Panel
              icon="🎙"
              title="Voice"
              subtitle="Marcus · Confident · US"
              defaultOpen
            >
              <div className="space-y-2">
                {[
                  { name: "Marcus", tag: "Confident · US", active: true },
                  { name: "Elena", tag: "Direct · UK" },
                  { name: "Kai", tag: "Warm · AUS" },
                  { name: "Priya", tag: "Precise · IN" },
                ].map((v) => (
                  <button
                    key={v.name}
                    className={`flex w-full items-center justify-between rounded-xl border p-2.5 text-left transition-colors ${
                      v.active ? "border-foreground bg-foreground text-background" : "border-border bg-background hover:bg-muted"
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <span className={`flex h-7 w-7 items-center justify-center rounded-full text-xs ${v.active ? "bg-background/10 text-background" : "bg-muted text-foreground"}`}>
                        ▶
                      </span>
                      <div>
                        <div className="text-sm font-semibold">{v.name}</div>
                        <div className={`text-[10px] ${v.active ? "text-background/60" : "text-muted-foreground"}`}>{v.tag}</div>
                      </div>
                    </div>
                    <Waveform className={v.active ? "text-accent" : "text-foreground"} />
                  </button>
                ))}
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <Button size="sm" variant="ghost">This slide</Button>
                <Button size="sm" variant="secondary">Apply to all</Button>
              </div>
            </Panel>

            <Panel
              icon="🧑‍💼"
              title="Avatar"
              subtitle="Show a talking presenter on every slide"
              badge={<ComingSoonBadge />}
            >
              <p className="text-xs text-muted-foreground">
                Pick a lifelike avatar that appears next to the slide in preview and published decks. Lip-sync follows the voice you chose above.
              </p>
              <div className="mt-3 grid grid-cols-4 gap-2 opacity-60">
                {["A", "B", "C", "D"].map((k) => (
                  <div
                    key={k}
                    className="flex aspect-square items-center justify-center rounded-xl border border-dashed border-border bg-muted text-sm font-semibold text-muted-foreground"
                  >
                    {k}
                  </div>
                ))}
              </div>
            </Panel>

            <Panel icon="🎚" title="Delivery" subtitle="Pace · Warmth · Pauses">
              <div className="space-y-4">
                {[
                  { label: "Pace", value: "1.0×", def: 50 },
                  { label: "Warmth", value: "62%", def: 62 },
                  { label: "Pause length", value: "natural", def: 40 },
                ].map((r) => (
                  <div key={r.label}>
                    <div className="mb-2 flex justify-between text-xs">
                      <span className="text-muted-foreground">{r.label}</span>
                      <span className="font-mono font-semibold">{r.value}</span>
                    </div>
                    <input type="range" defaultValue={r.def} className="w-full accent-foreground" />
                  </div>
                ))}
              </div>
            </Panel>

            <Panel icon="✨" title="Effects" subtitle="Music, ambience, transitions" badge={<ComingSoonBadge />} />
            <Panel icon="🌐" title="Brand & theme" subtitle="Colors, logo, captions" badge={<ComingSoonBadge />} />

            <div className="rounded-2xl border-2 border-foreground bg-accent p-4 offset-shadow-sm">
              <div className="eyebrow mb-2">Ready to ship?</div>
              <div className="font-display text-base font-bold leading-tight">
                Publish a shareable link — no login required.
              </div>
              <Link
                to="/deck/$id/publish"
                params={{ id }}
                className="mt-3 inline-flex h-10 w-full items-center justify-center rounded-full bg-foreground px-5 text-sm font-semibold text-background transition-transform hover:-translate-y-0.5"
              >
                Publish deck →
              </Link>
            </div>
          </aside>
        </div>

        {/* Sticky bottom transport bar */}
        <div className="border-t border-border bg-background px-3 py-3 sm:px-6">
          <div className="flex flex-wrap items-center gap-3 sm:gap-4">
            <button
              onClick={() => step(-1)}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-border text-foreground transition-colors hover:bg-muted"
              aria-label="Previous slide"
            >
              ⏮
            </button>
            <button
              onClick={() => setPlaying((p) => !p)}
              className="flex h-11 w-11 items-center justify-center rounded-full bg-foreground text-background transition-transform hover:scale-105"
              aria-label={playing ? "Pause" : "Play"}
            >
              <span className={playing ? "" : "ml-0.5"}>{playing ? "❚❚" : "▶"}</span>
            </button>
            <button
              onClick={() => step(1)}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-border text-foreground transition-colors hover:bg-muted"
              aria-label="Next slide"
            >
              ⏭
            </button>

            <div className="order-last ml-0 w-full sm:order-none sm:ml-2 sm:w-auto sm:flex-1">
              <div className="mb-1.5 flex items-center justify-between text-[10px] uppercase tracking-widest text-muted-foreground">
                <span className="flex items-center gap-2">
                  Marcus · confident · 1.0×
                  {playing && <span className="live-dot" />}
                </span>
                <span className="font-mono">
                  {playing ? "00:07" : "00:00"} / {active.duration} · slide {active.n}
                </span>
              </div>
              {regenerating ? (
                <div className="relative h-1.5 overflow-hidden rounded-full bg-muted">
                  <div className="progress-stripe h-full w-full rounded-full" />
                </div>
              ) : (
                <div className="relative h-1.5 rounded-full bg-muted">
                  <div className={`absolute inset-y-0 left-0 rounded-full bg-foreground transition-all ${playing ? "w-[32%]" : "w-[8%]"}`} />
                  <div className={`absolute -top-1 h-3.5 w-3.5 -translate-x-1/2 rounded-full border-2 border-background bg-foreground transition-all ${playing ? "left-[32%]" : "left-[8%]"}`} />
                </div>
              )}
            </div>

            <Waveform className={`hidden sm:inline-flex ${playing ? "text-accent" : "text-muted-foreground"}`} />

            <Button size="sm" variant="secondary" className="hidden sm:inline-flex">Preview from here</Button>
          </div>
        </div>
      </div>

      {/* Trigger-word picker modal (shared by text + region highlights) */}
      <TriggerPicker
        open={!!pending}
        script={active.script}
        phraseRange={pending?.kind === "text" ? pending.phrase : undefined}
        targetLabel={
          pending?.kind === "region"
            ? pending.region.snappedTo
              ? `Snapped to ${pending.region.snappedTo} · ${pending.region.shape}`
              : `Freehand ${pending.region.shape}`
            : undefined
        }
        onPick={commitTrigger}
        onCancel={() => setPending(null)}
      />
    </AppShell>
  );
}


"use client";

/**
 * Deck editor — structural layout inspired by pro video/presentation editors:
 * single header · slim left rail · optional docked asset panel ·
 * large canvas + floating toolbar · bottom timeline.
 * Voxdeck visual identity retained (not a brand clone).
 */
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useCallback, type RefObject } from "react";
import { AppShell } from "@/components/shell";
import { FlowSteps } from "@/components/deck-flow/FlowSteps";
import { Button, StripedProgress, Waveform } from "@/components/ui-kit";
import { ComingSoonBadge } from "@/components/ui-panel";
import { SaveStatusIndicator } from "@/components/SaveStatusIndicator";
import { useHighlights, scriptFingerprint, type Highlight } from "@/lib/highlight-store";
import { tokenize, timeTokens } from "@/lib/word-timing";
import { TriggerPicker } from "@/components/highlights/TriggerPicker";
import { SyncedTranscript } from "@/components/highlights/SyncedTranscript";
import { RegionDrawLayer, type DrawnRegion } from "@/components/highlights/RegionDrawLayer";
import { RegionOutline, RegionSpotlight } from "@/components/highlights/RegionSpotlight";
import { getCachedDeck, type DeckSlide as StoredSlide } from "@/lib/deck-store";
import { useHighlightScheduler } from "@/hooks/use-highlight-scheduler";
import { useDeckAutosave } from "@/hooks/use-deck-autosave";
import { useHydrateDeck } from "@/hooks/use-hydrate-deck";
import {
  useSpeechNarration,
  usePrefetchNarration,
  invalidateNarrationAudio,
  regenerateAllVoices,
  unlockNarrationAudio,
  unlockNarrationAudioSync,
  playObjectUrl,
  getCachedNarration,
} from "@/hooks/use-speech-narration";
import { ensureNarrationAudio } from "@/lib/tts-cache";
import { getVoiceSettings, setVoicePreset, setVoiceSettings, useVoiceSettings } from "@/lib/voice-store";
import {
  VOICE_PRESETS,
  VOICE_SAMPLE,
  DEFAULT_VOICE_SETTINGS,
  formatPct01,
  formatSpeed,
  getPreset,
  voiceSettingsKey,
  isBrowserVoice,
  type VoicePresetId,
} from "@/lib/voice-settings";

const TTS_MODELS = [
  { id: "eleven_multilingual_v2", label: "Eleven Multilingual v2" },
  { id: "eleven_turbo_v2_5", label: "Eleven Turbo v2.5" },
  { id: "eleven_flash_v2_5", label: "Eleven Flash v2.5" },
] as const;
import { type GenerationMethod, type RefineMode } from "@voxdeck/narration";

type SlideStatus = "ready" | "edited" | "review" | "muted" | "generating" | "failed";
type Slide = {
  n: string;
  title: string;
  script: string;
  duration: string;
  status: SlideStatus;
  essentialPoints: string[];
  pageText: string;
  generationMethod: GenerationMethod;
  lowConfidenceFlags: string[];
};
type RailTool = "slides" | "voice";

const RAIL: { id: RailTool; label: string; icon: string }[] = [
  { id: "slides", label: "Slides", icon: "▦" },
  { id: "voice", label: "Voice", icon: "♪" },
];

function fmtDur(sec: number) {
  return `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, "0")}`;
}

function slidesForStored(slides: StoredSlide[]): {
  slides: Slide[];
  thumbs: Record<string, string>;
  images: Record<string, string>;
} {
  const thumbs: Record<string, string> = {};
  const images: Record<string, string> = {};
  const out: Slide[] = slides.map((s) => {
    if (s.thumbnail) thumbs[s.n] = s.thumbnail;
    // Full-res for the stage; the thumb (400px) is only for the slide rail.
    if (s.image || s.thumbnail) images[s.n] = (s.image || s.thumbnail)!;
    const pageText = s.pageText ?? "";
    const essentialPoints =
      s.essentialPoints?.length
        ? s.essentialPoints
        : (s.slideContent?.bodyText ?? []).slice(0, 4);
    return {
      n: s.n,
      title: s.title,
      script: s.script,
      duration: fmtDur(s.durationSec),
      status: "ready" as SlideStatus,
      essentialPoints,
      pageText,
      generationMethod: s.generationMethod ?? "extractive-fallback",
      lowConfidenceFlags: s.lowConfidenceFlags ?? [],
    };
  });
  return { slides: out, thumbs, images };
}

const statusDot: Record<SlideStatus, string> = {
  ready: "bg-live",
  edited: "bg-foreground",
  review: "bg-warn",
  muted: "bg-muted-foreground",
  generating: "bg-foreground",
  failed: "bg-danger",
};

const statusLabel: Record<SlideStatus, string> = {
  ready: "Ready",
  edited: "Edited",
  review: "Review",
  muted: "Muted",
  generating: "Generating",
  failed: "Failed",
};

export default function EditorPage() {
  const params = useParams();
  const router = useRouter();
  const id = String(params.id ?? "");
  // Don't read localStorage during SSR — that causes hydration mismatches
  // ("Deck not found" on server vs real title on client).
  const [deckTitle, setDeckTitle] = useState("Untitled deck");
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [stageImages, setStageImages] = useState<Record<string, string>>({});
  const [slides, setSlides] = useState<Slide[]>([]);
  const [selected, setSelected] = useState<string>("01");
  const [regenerating, setRegenerating] = useState(false);
  /** Result of the last Shorten / Punch it up / Regenerate: undo or error. */
  const [refineNote, setRefineNote] = useState<
    | { kind: "undo"; slide: string; previous: string; label: string }
    | { kind: "error"; slide: string; message: string }
    | null
  >(null);
  const narrationRef = useRef<{
    pause: () => void;
    start: (scriptOverride?: string) => void;
    restart: () => void;
    playing: boolean;
  } | null>(null);
  const [navBusy, setNavBusy] = useState(false);
  const [narrationOpen, setNarrationOpen] = useState(true);
  const [railTool, setRailTool] = useState<RailTool | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const slidesRef = useRef(slides);
  slidesRef.current = slides;

  const { state: hydrateState, reload: reloadDeck } = useHydrateDeck(id);

  useEffect(() => {
    if (hydrateState.status === "loading") {
      setHydrated(false);
      setLoadError(null);
      return;
    }
    if (hydrateState.status === "error") {
      setHydrated(true);
      setLoadError(hydrateState.error);
      setSlides([]);
      setThumbs({});
      return;
    }
    const mapped = slidesForStored(hydrateState.deck.slides);
    setDeckTitle(hydrateState.deck.title);
    setThumbs(mapped.thumbs);
    setStageImages(mapped.images);
    setSlides(mapped.slides);
    // Deep link from Rehearse / Publish: /decks/:id/edit?slide=05
    const wanted =
      typeof window !== "undefined"
        ? new URLSearchParams(window.location.search).get("slide")
        : null;
    setSelected(
      wanted && mapped.slides.some((s) => s.n === wanted)
        ? wanted
        : (mapped.slides[0]?.n ?? "01"),
    );
    setLoadError(null);
    setHydrated(true);
  }, [hydrateState]);

  const autosave = useDeckAutosave({
    deckId: id,
    getSlides: () =>
      slidesRef.current.map((s) => {
        const stored = getCachedDeck(id)?.slides.find((x) => x.n === s.n);
        return {
          ...(stored ?? {
            n: s.n,
            title: s.title,
            script: s.script,
            durationSec: 8,
            status: s.status,
          }),
          script: s.script,
          essentialPoints: s.essentialPoints,
          status: s.status,
          title: s.title,
        };
      }),
    getTitle: () => deckTitle,
    onConflict: () => {
      void reloadDeck();
    },
  });

  const active =
    slides.find((s) => s.n === selected) ??
    slides[0] ?? {
      n: "01",
      title: "Empty",
      script: "",
      duration: "0:00",
      status: "ready" as SlideStatus,
      essentialPoints: [] as string[],
      pageText: "",
      generationMethod: "extractive-fallback" as GenerationMethod,
      lowConfidenceFlags: [] as string[],
    };
  const activeIndex = Math.max(0, slides.findIndex((s) => s.n === selected));

  const {
    items: highlights,
    add: addHighlight,
    update: updateHighlight,
    remove: removeHighlight,
    markStaleForScript,
  } = useHighlights(id, active.n);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const slideStageRef = useRef<HTMLDivElement>(null);
  const highlightEditingRef = useRef(false);
  const [selectionRange, setSelectionRange] = useState<{ start: number; end: number } | null>(null);
  const [drawingRegion, setDrawingRegion] = useState(false);
  const [regionShape, setRegionShape] = useState<"rect" | "square" | "oval">("rect");
  const [shapeMenuOpen, setShapeMenuOpen] = useState(false);
  const [selectedRegionId, setSelectedRegionId] = useState<string | null>(null);
  const [pending, setPending] = useState<
    | { kind: "text"; phrase: { start: number; end: number }; text: string }
    | { kind: "region"; region: DrawnRegion }
    | { kind: "resync"; highlightId: string }
    | null
  >(null);

  const highlightEditing = Boolean(pending) || drawingRegion;
  highlightEditingRef.current = highlightEditing;

  /** Pause narration and freeze the slide — required before any highlight edit flow. */
  function pauseForHighlightEdit() {
    narrationRef.current?.pause();
  }

  function onTextareaSelect() {
    const el = textareaRef.current;
    if (!el) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    if (end > start) setSelectionRange({ start, end });
    else setSelectionRange(null);
  }

  function openTextHighlightPicker() {
    if (!selectionRange) return;
    const text = active.script.slice(selectionRange.start, selectionRange.end);
    if (!text.trim()) return;
    pauseForHighlightEdit();
    setPending({ kind: "text", phrase: selectionRange, text });
  }

  function onRegionCommit(region: DrawnRegion) {
    setDrawingRegion(false);
    pauseForHighlightEdit();
    setPending({ kind: "region", region });
  }

  function commitTrigger(startWordIndex: number, endWordIndex: number) {
    if (!pending) return;
    const end = Math.max(startWordIndex, endWordIndex);
    const clock =
      narration.duration > 0
        ? narration.duration
        : Math.max(3, (active.script.trim().split(/\s+/).filter(Boolean).length / 155) * 60);
    // Prefer live/cached alignment tokens so highlight times match the transcript
    const cached = getCachedNarration(active.script);
    const tokens =
      (narration.tokens.length > 0 ? narration.tokens : null) ??
      cached?.tokens ??
      timeTokens(active.script, clock);
    const startTok = tokens[startWordIndex];
    const endTok = tokens[end];
    const startMs = startTok?.startMs ?? 0;
    const endMs = Math.max(startMs + 50, endTok?.endMs ?? startMs + 700);
    const holdMs = Math.max(200, endMs - startMs);
    const fp = scriptFingerprint(active.script);
    const tokenSource = startTok?.source ?? cached?.timingSource ?? "estimated";
    const timingSource = tokenSource === "provider" || tokenSource === "forced_alignment"
      ? ("audio" as const)
      : ("estimated" as const);
    const timing = {
      triggerWordIndex: startWordIndex,
      endWordIndex: end,
      startMs,
      endMs,
      timingSource,
      scriptFingerprint: fp,
      needsReview: false,
      holdMs,
    };
    if (pending.kind === "resync") {
      updateHighlight(pending.highlightId, timing);
    } else if (pending.kind === "text") {
      addHighlight({
        kind: "text",
        phrase: pending.phrase,
        text: pending.text,
        ...timing,
      } as Omit<Highlight, "id">);
    } else {
      addHighlight({
        kind: "region",
        shape:
          pending.region.shape === "square"
            ? "square"
            : pending.region.shape === "oval"
              ? "oval"
              : "rect",
        bbox: pending.region.bbox,
        snappedTo: pending.region.snappedTo,
        ...timing,
      } as Omit<Highlight, "id">);
    }
    setPending(null);
    setSelectionRange(null);
    void autosave.flush();
  }

  function openResync(highlightId: string) {
    pauseForHighlightEdit();
    setPending({ kind: "resync", highlightId });
  }

  const scriptTokens = useMemo(() => tokenize(active.script), [active.script]);
  const wordCount = useMemo(
    () => active.script.trim().split(/\s+/).filter(Boolean).length,
    [active.script],
  );
  const spokenSec = Math.max(3, Math.round((wordCount / 155) * 60));

  const advanceAfterSpeech = useCallback(() => {
    if (highlightEditingRef.current) {
      narrationRef.current?.pause();
      return;
    }
    const i = slides.findIndex((s) => s.n === selected);
    if (i >= 0 && i < slides.length - 1) {
      const next = slides[i + 1];
      setSelected(next.n);
      narrationRef.current?.start(next.script ?? "");
      return;
    }
    narrationRef.current?.pause();
  }, [slides, selected]);

  const narration = useSpeechNarration(
    highlightEditing ? "" : active.script,
    advanceAfterSpeech,
  );
  narrationRef.current = narration;
  const playing = narration.playing;
  const elapsed = narration.currentTime;
  const spokenClock = narration.duration > 0 ? narration.duration : spokenSec;

  const activeHighlights = useHighlightScheduler(
    active.script,
    spokenClock,
    highlights,
    elapsed,
  );

  const slideScripts = useMemo(() => slides.map((s) => s.script), [slides]);
  const { ready: ttsReady, total: ttsTotal, prefetching: ttsPrefetching } =
    usePrefetchNarration(slideScripts);

  const playReadout = `${Math.floor(elapsed / 60)}:${String(Math.floor(elapsed % 60)).padStart(2, "0")}`;
  const spokenReadout = `${Math.floor(spokenClock / 60)}:${String(Math.floor(spokenClock % 60)).padStart(2, "0")}`;

  async function navigateAfterFlush(href: string) {
    setNavBusy(true);
    try {
      const result = await autosave.flush();
      if (result.status === "error" || result.status === "offline") {
        return;
      }
      router.push(href);
    } finally {
      setNavBusy(false);
    }
  }

  function updateScript(next: string) {
    invalidateNarrationAudio(active.script);
    setSlides((prev) =>
      prev.map((s) => (s.n === selected ? { ...s, script: next, status: "edited" } : s)),
    );
    markStaleForScript(next);
    autosave.markDirty("narration_text");
  }

  function updateEssentialPoints(next: string[]) {
    const cleaned = next.map((p) => p.trim()).filter(Boolean).slice(0, 6);
    setSlides((prev) =>
      prev.map((s) => (s.n === selected ? { ...s, essentialPoints: cleaned, status: "edited" } : s)),
    );
    autosave.markDirty("essential_points");
  }

  function step(delta: number) {
    if (highlightEditingRef.current) return;
    if (!slides.length) return;
    void autosave.flush();
    const next = slides[(activeIndex + delta + slides.length) % slides.length];
    setSelectedRegionId(null);
    setSelected(next.n);
  }

  async function refineNarration(mode: RefineMode) {
    if (regenerating) return;
    setRegenerating(true);
    const before = slides[activeIndex - 1]?.script ?? "";
    const after = slides[activeIndex + 1]?.script ?? "";
    const labels: Record<RefineMode, string> = {
      shorten: "Shortening",
      punch: "Punching up",
      regenerate: "Regenerating",
    };
    const previous = active.script;
    const slideAtStart = selected;
    setRefineNote(null);
    try {
      const res = await fetch("/api/script/rewrite", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          mode,
          currentLine: active.script,
          pageText: active.pageText,
          title: active.title,
          essentialPoints: active.essentialPoints,
          pageNum: activeIndex + 1,
          totalPages: slides.length,
          seed: Date.now(),
          neighbors: { before, after },
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { line?: string };
      if (res.ok && typeof data.line === "string" && data.line.trim()) {
        updateScript(data.line.trim());
        setSlides((prev) =>
          prev.map((s) => (s.n === selected ? { ...s, status: "ready" } : s)),
        );
        // Rewrites replace the owner's words — always offer a one-tap undo.
        setRefineNote({ kind: "undo", slide: slideAtStart, previous, label: labels[mode] });
      } else {
        setRefineNote({
          kind: "error",
          slide: slideAtStart,
          message:
            res.status === 429
              ? "Rewrite limit reached for now. Your line is unchanged - try again in a minute."
              : "Couldn't rewrite this line. Your text is unchanged - try again.",
        });
      }
    } catch {
      setRefineNote({
        kind: "error",
        slide: slideAtStart,
        message: "You look offline. Your text is unchanged - try again when you're connected.",
      });
    } finally {
      setRegenerating(false);
      autosave.markDirty("narration_text");
      void autosave.flush();
    }
  }

  function toggleRail(tool: RailTool) {
    setRailTool((cur) => (cur === tool ? null : tool));
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName;
      const el = e.target as HTMLElement | null;
      const inField =
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        el?.isContentEditable ||
        Boolean(el?.closest?.("[data-hotkeys-ignore],[role=dialog]"));

      // Highlight edit mode: block play / slide advance hotkeys entirely
      if (highlightEditingRef.current) {
        if (e.key === "Escape") {
          if (pending) setPending(null);
          else if (drawingRegion) {
            setDrawingRegion(false);
            setShapeMenuOpen(false);
          }
        }
        if (
          e.code === "Space" ||
          e.key === "ArrowRight" ||
          e.key === "ArrowLeft" ||
          e.key === "j" ||
          e.key === "k"
        ) {
          e.preventDefault();
        }
        return;
      }

      if (e.key === "Escape") {
        // Escape closes the side panel only. It used to collapse the script
        // editor too, which hid the thing the owner was working on.
        if (railTool) {
          setRailTool(null);
          return;
        }
      }
      if (inField) return;
        if (e.code === "Space") {
        e.preventDefault();
        if (narration.playing) narration.pause();
        else {
          unlockNarrationAudioSync();
          narration.start();
        }
      } else if (e.key === "j" || e.key === "ArrowRight") step(1);
      else if (e.key === "k" || e.key === "ArrowLeft") step(-1);
      else if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        void refineNarration("regenerate");
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIndex, selected, railTool, narrationOpen, pending, drawingRegion]);

  if (!hydrated || hydrateState.status === "loading") {
    return (
      <AppShell variant="app" fillViewport showTopBar={false}>
        <div className="flex h-full items-center justify-center p-8 text-sm text-muted-foreground">
          Loading deck…
        </div>
      </AppShell>
    );
  }

  if (loadError) {
    return (
      <AppShell variant="app" fillViewport showTopBar={false}>
        <div className="mx-auto flex h-full max-w-lg flex-col items-center justify-center gap-4 p-8 text-center">
          <p className="font-display text-2xl font-bold tracking-tight">Couldn&apos;t open deck</p>
          <p className="text-sm text-muted-foreground">{loadError}</p>
          <div className="flex flex-wrap justify-center gap-3">
            <Button type="button" onClick={() => void reloadDeck()}>
              Retry
            </Button>
            <Link href="/dashboard">
              <Button type="button" variant="secondary">
                Back to decks
              </Button>
            </Link>
          </div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell variant="app" fillViewport showTopBar={false}>
      <div className="flex h-full min-h-0 flex-col overflow-hidden bg-[#f7f7f8] text-foreground">
        {/* ═══ Single editor header (reference structure) ═══ */}
        <header className="relative flex h-14 shrink-0 items-center justify-between gap-3 border-b border-border bg-background px-3 sm:px-4">
          <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
            {/* Was the marketing Wordmark linking to "/" (the landing page) with no save flush. */}
            <button
              type="button"
              onClick={() => void navigateAfterFlush("/dashboard")}
              aria-label="Back to your decks"
              className="inline-flex h-9 shrink-0 items-center gap-1 rounded-full px-2 text-sm font-semibold text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <span aria-hidden>←</span>
              <span className="hidden md:inline">Decks</span>
            </button>
            <div className="hidden h-5 w-px bg-border sm:block" />
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold">{deckTitle || "Untitled deck"}</div>
              <div className="hidden text-[10px] text-muted-foreground sm:block">
                {slides.length} slides
              </div>
            </div>
          </div>

          {/* Same Edit → Rehearse → Publish stepper as the other two screens. */}
          <div className="absolute left-1/2 hidden -translate-x-1/2 lg:block">
            <FlowSteps deckId={id} current="edit" onNavigate={(href) => void navigateAfterFlush(href)} />
          </div>

          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            <SaveStatusIndicator
              status={autosave.status}
              lastError={autosave.lastError}
              onRetry={() => void autosave.retry()}
            />
            <button
              type="button"
              disabled={navBusy || autosave.status === "saving"}
              onClick={() => void navigateAfterFlush(`/decks/${id}/preview`)}
              className="inline-flex h-9 items-center gap-1 rounded-full bg-foreground px-4 text-xs font-semibold text-background hover:-translate-y-0.5 disabled:opacity-60"
            >
              {navBusy || autosave.status === "saving" ? "Saving…" : "Rehearse →"}
            </button>
          </div>
        </header>
        {/* Phone / iPad: the stepper had no home here (the old mode switch was hidden below 640px). */}
        <div className="flex shrink-0 items-center justify-center border-b border-border bg-background px-3 py-1.5 lg:hidden">
          <FlowSteps deckId={id} current="edit" onNavigate={(href) => void navigateAfterFlush(href)} />
        </div>

        {/* ═══ Body: rail | optional panel | canvas column ═══ */}
        <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden md:flex-row">
          {/* Slim tool rail. On phones it is a row above the slide so the slide gets the full width. */}
          <nav
            data-editor-rail
            className="flex h-11 w-full shrink-0 flex-row items-center gap-1 border-b border-border bg-background px-2 md:h-auto md:w-[64px] md:flex-col md:gap-0.5 md:border-b-0 md:border-r md:px-0 md:py-2"
            aria-label="Editor tools"
          >
            {RAIL.map((t) => {
              const on = railTool === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  title={t.label}
                  aria-label={t.label}
                  aria-pressed={on}
                  onClick={() => toggleRail(t.id)}
                  className={`flex h-9 flex-row items-center gap-1.5 rounded-full px-3 text-xs font-medium transition-colors md:h-auto md:w-[56px] md:flex-col md:gap-0.5 md:rounded-xl md:px-1 md:py-2 md:text-[10px] ${
                    on
                      ? "bg-muted text-foreground ring-1 ring-border"
                      : "text-muted-foreground hover:bg-muted/70 hover:text-foreground"
                  }`}
                >
                  <span className="text-base leading-none md:text-lg">{t.icon}</span>
                  <span className="leading-tight">{t.label}</span>
                </button>
              );
            })}
            <div className="ml-auto md:ml-0 md:mt-auto md:pb-2">
              <Link
                href="/account"
                onClick={(e) => {
                  e.preventDefault();
                  void navigateAfterFlush("/account");
                }}
                className="flex h-9 flex-row items-center gap-1.5 rounded-full px-3 text-xs font-medium text-muted-foreground hover:bg-muted/70 hover:text-foreground md:h-auto md:w-[56px] md:flex-col md:gap-0.5 md:rounded-xl md:px-1 md:py-2 md:text-[10px]"
                title="Settings"
              >
                <span className="text-base leading-none md:text-lg">⚙</span>
                <span>Settings</span>
              </Link>
            </div>
          </nav>

          {/* Docked asset panel (opens beside rail — Canva/Veed pattern) */}
          {railTool && (
            <aside className="absolute inset-y-0 left-0 top-11 z-30 flex w-[min(320px,100vw)] md:top-0 md:left-[64px] md:w-[min(300px,calc(100vw-64px))] shrink-0 flex-col border-r border-border bg-background shadow-xl md:static md:w-[300px] md:shadow-none">
              <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-3">
                <div className="font-display text-sm font-bold capitalize tracking-tight">
                  {railTool}
                </div>
                <button
                  type="button"
                  onClick={() => setRailTool(null)}
                  className="rounded-lg px-2 py-1 text-xs text-muted-foreground hover:bg-muted"
                  aria-label="Close panel"
                >
                  ✕
                </button>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto p-3">
                {railTool === "slides" && (
                  <SlidesPanel
                    slides={slides}
                    thumbs={thumbs}
                    selected={selected}
                    playing={playing}
                    onSelect={(n) => {
                      void autosave.flush();
                      setSelectedRegionId(null);
                      setSelected(n);
                      // On phone/iPad the panel covers the slide; close it once a slide is picked.
                      if (typeof window !== "undefined" && window.innerWidth < 768) setRailTool(null);
                    }}
                  />
                )}
                {railTool === "voice" && (
                  <VoicePanel
                    scripts={slideScripts}
                    currentScript={active.script}
                  />
                )}
              </div>
            </aside>
          )}

          {/* Canvas + timeline column */}
          <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
            {/* Canvas stage */}
            <div className="relative flex min-h-0 flex-1 flex-col items-center justify-center gap-2 overflow-hidden px-3 py-2 sm:gap-3 sm:px-8 sm:py-4">
              <div className="relative min-h-0 w-full flex-1 [container-type:size]">
                <div
                  key={active.n}
                  className="absolute left-1/2 top-1/2 overflow-hidden rounded-md bg-foreground shadow-lg"
                  style={{
                    aspectRatio: "16 / 9",
                    width: "min(100cqw, calc(100cqh * 16 / 9))",
                    height: "min(100cqh, calc(100cqw * 9 / 16))",
                    transform: "translate(-50%, -50%)",
                  }}
                >
                  <SlideStage
                    active={active}
                    thumbs={stageImages}
                    activeIndex={activeIndex}
                    highlights={highlights}
                    activeHighlights={activeHighlights}
                    playing={playing}
                    drawingRegion={drawingRegion}
                    regionShape={regionShape}
                    selectedRegionId={selectedRegionId}
                    onSelectRegion={setSelectedRegionId}
                    onChangeRegionBBox={(hid, bbox) => updateHighlight(hid, { bbox })}
                    onRegionCommit={onRegionCommit}
                    onCancelDraw={() => setDrawingRegion(false)}
                    onRemoveHighlight={(hid) => {
                      removeHighlight(hid);
                      if (selectedRegionId === hid) setSelectedRegionId(null);
                    }}
                    onSyncHighlight={openResync}
                    stageRef={slideStageRef}
                  />
                </div>
              </div>

              {/* Floating canvas toolbar (under preview) */}
              <div className="flex shrink-0 items-center gap-1 rounded-full border border-border bg-background px-1.5 py-1 shadow-sm">
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => {
                      if (drawingRegion) {
                        setDrawingRegion(false);
                        setShapeMenuOpen(false);
                        return;
                      }
                      setShapeMenuOpen((o) => !o);
                    }}
                    className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                      drawingRegion || shapeMenuOpen
                        ? "bg-foreground text-background"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    }`}
                  >
                    Highlight area
                  </button>
                  {shapeMenuOpen && !drawingRegion && (
                    <div className="absolute bottom-full left-1/2 z-50 mb-2 w-44 -translate-x-1/2 rounded-xl border-2 border-foreground bg-background p-1.5 offset-shadow-sm">
                      <div className="eyebrow px-2 py-1">Choose shape</div>
                      {(
                        [
                          { id: "rect", label: "Rectangle", icon: "▭" },
                          { id: "square", label: "Square", icon: "▢" },
                          { id: "oval", label: "Oval", icon: "⬭" },
                        ] as const
                      ).map((opt) => (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => {
                            pauseForHighlightEdit();
                            setRegionShape(opt.id);
                            setShapeMenuOpen(false);
                            setDrawingRegion(true);
                          }}
                          className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs font-semibold hover:bg-muted"
                        >
                          <span className="w-4 text-center text-sm">{opt.icon}</span>
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {drawingRegion && (
                  <button
                    type="button"
                    onClick={() => {
                      setDrawingRegion(false);
                      setShapeMenuOpen(false);
                    }}
                    className="rounded-full px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    Cancel
                  </button>
                )}
                <span className="h-4 w-px bg-border" />
                <span className="whitespace-nowrap px-2 text-xs text-muted-foreground">
                  Slide {Math.max(0, slides.findIndex((s) => s.n === active.n)) + 1} of {slides.length || 1}
                </span>
              </div>
            </div>

            {/* Compact narration bar — same footprint as old timeline */}
            {/* Was a fixed 148px strip: on phone/iPad the script (the thing you edit) sat below the fold at 12px. */}
            <div className="flex h-[44%] min-h-[220px] shrink-0 flex-col border-t border-border bg-background md:h-[220px] md:min-h-0">
              <div className="flex h-9 shrink-0 items-center gap-2 border-b border-border px-3">
                <button
                  type="button"
                  onClick={() => setNarrationOpen((o) => !o)}
                  className="inline-flex h-8 items-center gap-1 rounded-full px-2.5 text-xs font-semibold hover:bg-muted"
                  aria-expanded={narrationOpen}
                >
                  Script {narrationOpen ? "▾" : "▸"}
                </button>

                <div className="flex flex-1 items-center justify-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => step(-1)}
                    className="flex h-11 w-11 items-center justify-center rounded-full text-[11px] hover:bg-muted"
                    aria-label="Previous slide"
                  >
                    ⏮
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (playing) narration.pause();
                      else {
                        unlockNarrationAudioSync();
                        narration.start();
                      }
                    }}
                    className="flex h-11 w-11 items-center justify-center rounded-full bg-foreground text-[10px] text-background"
                    aria-label={playing ? "Pause narration" : "Play narration"}
                  >
                    {playing ? "❚❚" : "▶"}
                  </button>
                  <button
                    type="button"
                    onClick={() => step(1)}
                    className="flex h-11 w-11 items-center justify-center rounded-full text-[11px] hover:bg-muted"
                    aria-label="Next slide"
                  >
                    ⏭
                  </button>
                  <button
                    type="button"
                    onClick={() => narration.restart()}
                    className="flex h-11 w-11 items-center justify-center rounded-full text-sm hover:bg-muted"
                    aria-label="Play this slide from the start"
                    title="Play this slide from the start"
                  >
                    ↺
                  </button>
                  <span className="ml-1.5 whitespace-nowrap font-mono text-[11px] tabular-nums text-muted-foreground">
                    {playing ? playReadout : "0:00"} / {spokenReadout}
                  </span>
                  {narration.loading && (
                    <span className="ml-2 font-mono text-[9px] uppercase tracking-wide text-muted-foreground">
                      Loading voice…
                    </span>
                  )}
                  {narration.error && !narration.loading && (
                    <span className="ml-2 max-w-[180px] truncate font-mono text-[9px] text-warn" title={narration.error}>
                      Using basic voice
                    </span>
                  )}
                  {ttsPrefetching && (
                    <span className="ml-2 font-mono text-[9px] uppercase tracking-wide text-muted-foreground">
                      Voice {ttsReady}/{ttsTotal}
                    </span>
                  )}
                </div>
              </div>

              {narrationOpen ? (
                <div className="relative min-h-0 flex-1 overflow-y-auto px-3 py-1.5">
                    <div className="mb-1 flex flex-wrap items-center gap-0">
                      <button
                        type="button"
                        onClick={openTextHighlightPicker}
                        disabled={!selectionRange}
                        title={selectionRange ? "Highlight the selected words" : "Select words in the script first"}
                        className={`h-8 rounded-full px-2 text-xs sm:px-2.5 font-semibold disabled:opacity-40 ${
                          selectionRange ? "bg-accent text-accent-foreground" : "hover:bg-muted"
                        }`}
                      >
                        Highlight<span className="hidden sm:inline"> words</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => void refineNarration("shorten")}
                        disabled={regenerating || !active.script.trim()}
                        className="h-8 rounded-full px-2 text-xs sm:px-2.5 font-medium hover:bg-muted disabled:opacity-40"
                      >
                        Shorten
                      </button>
                      <button
                        type="button"
                        onClick={() => void refineNarration("punch")}
                        disabled={regenerating || !active.script.trim()}
                        className="h-8 rounded-full px-2 text-xs sm:px-2.5 font-medium hover:bg-muted disabled:opacity-40"
                      >
                        Punch it up
                      </button>
                      <button
                        type="button"
                        onClick={() => void refineNarration("regenerate")}
                        disabled={regenerating}
                        title="Write a fresh line for this slide (you can undo)"
                        className="h-8 rounded-full border border-border px-2 text-xs font-semibold hover:bg-muted disabled:opacity-40 sm:px-2.5"
                      >
                        Regenerate
                      </button>
                    </div>

                    {regenerating && (
                      <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/85">
                        <div className="w-40">
                          <StripedProgress value={62} label="Updating line" />
                        </div>
                      </div>
                    )}

                    {refineNote && refineNote.slide === active.n && (
                      <div
                        role={refineNote.kind === "error" ? "alert" : "status"}
                        className={`mb-1.5 flex items-center justify-between gap-2 rounded-md border px-2 py-1 text-xs ${
                          refineNote.kind === "error"
                            ? "border-danger/40 bg-danger/10"
                            : "border-border bg-muted"
                        }`}
                      >
                        <span>
                          {refineNote.kind === "error"
                            ? refineNote.message
                            : `${refineNote.label} done - line replaced.`}
                        </span>
                        <span className="flex shrink-0 gap-2">
                          {refineNote.kind === "undo" && (
                            <button
                              type="button"
                              className="font-semibold underline underline-offset-2"
                              onClick={() => {
                                updateScript(refineNote.previous);
                                setRefineNote(null);
                              }}
                            >
                              Undo
                            </button>
                          )}
                          <button
                            type="button"
                            aria-label="Dismiss"
                            className="text-muted-foreground hover:text-foreground"
                            onClick={() => setRefineNote(null)}
                          >
                            ✕
                          </button>
                        </span>
                      </div>
                    )}

                    {active.generationMethod === "extractive-fallback" && (
                      <div className="mb-1.5 rounded-md border border-warn/40 bg-warn/10 px-2 py-1 text-[10px] leading-snug text-foreground">
                        {active.lowConfidenceFlags.some((f) =>
                          f.includes("chart-bridge"),
                        )
                          ? "Chart slide: the numbers aren't read out. Add the one that matters."
                          : active.lowConfidenceFlags.some((f) =>
                                f.startsWith("number-mismatch") ||
                                f.startsWith("citation-mismatch") ||
                                f.startsWith("pairing-mismatch"),
                              )
                            ? "This line may not match the slide. Check the facts."
                            : "Written from the slide text. Worth a quick edit."}
                      </div>
                    )}

                    {playing ? (
                      <SyncedTranscript
                        script={active.script}
                        tokens={narration.tokens}
                        speakingIdx={narration.speakingIdx}
                        durationSec={spokenClock}
                        timingSource={narration.timingSource}
                        compact
                      />
                    ) : (
                      <textarea
                        key={active.n}
                        ref={textareaRef}
                        value={active.script}
                        onChange={(e) => updateScript(e.target.value)}
                        onSelect={onTextareaSelect}
                        onKeyUp={onTextareaSelect}
                        onMouseUp={onTextareaSelect}
                        rows={4}
                        aria-label={`Narration for slide ${active.n}`}
                        className="min-h-[6rem] w-full resize-none border-0 bg-transparent p-0 text-base leading-relaxed text-foreground placeholder:text-muted-foreground focus:outline-none md:text-sm"
                        placeholder="Write the line you’d pitch while they look at this slide…"
                      />
                    )}

                    {selectionRange && (
                      <div className="mt-1 truncate rounded border border-dashed border-accent bg-accent/10 px-2 py-0.5 text-[10px]">
                        Selected &quot;
                        {active.script.slice(selectionRange.start, selectionRange.end)}
                        &quot;
                      </div>
                    )}

                    {highlights.length > 0 && (
                      <div className="mt-1 space-y-0.5">
                        {highlights.some((h) => h.needsReview) && (
                          <div className="rounded border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[10px] text-amber-900">
                            Narration changed. Review highlight timing.
                          </div>
                        )}
                        {highlights.map((h, i) => {
                          const startW = scriptTokens[h.triggerWordIndex]?.text ?? "?";
                          const endW =
                            typeof h.endWordIndex === "number"
                              ? scriptTokens[h.endWordIndex]?.text ?? "?"
                              : startW;
                          return (
                            <div
                              key={h.id}
                              className="flex items-center justify-between gap-2 rounded border border-border px-1.5 py-0.5 text-[10px]"
                            >
                              <span className="min-w-0 truncate">
                                #{i + 1} {h.kind === "text" ? `"${h.text}"` : h.shape}
                                {" · "}
                                <span className="font-semibold">{startW}</span>
                                {" → "}
                                <span className="font-semibold">{endW}</span>
                                {h.needsReview ? " · needs review" : ""}
                                {h.timingSource === "estimated" ? " · est." : ""}
                              </span>
                              <span className="flex shrink-0 items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => openResync(h.id)}
                                  className="text-muted-foreground hover:text-foreground"
                                >
                                  Sync
                                </button>
                                <button
                                  type="button"
                                  onClick={() => removeHighlight(h.id)}
                                  className="text-muted-foreground hover:text-danger"
                                >
                                  Remove
                                </button>
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    )}                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setNarrationOpen(true)}
                  className="flex min-h-0 flex-1 items-center justify-between gap-2 px-3 text-left text-[11px] hover:bg-muted/40"
                >
                  <span className="truncate text-muted-foreground">
                    {active.script.trim() || "No script yet — write narration for this slide."}
                  </span>
                  <span className="shrink-0 text-[10px] font-semibold">Expand ↑</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      <TriggerPicker
        open={!!pending}
        script={active.script}
        durationSec={spokenClock}
        timingSource={
          getCachedNarration(active.script)?.timingSource === "provider" ||
          narration.timingSource === "provider"
            ? "audio"
            : "estimated"
        }
        phraseRange={pending?.kind === "text" ? pending.phrase : undefined}
        targetLabel={
          pending?.kind === "region"
            ? pending.region.snappedTo
              ? `Snapped to ${pending.region.snappedTo} · ${pending.region.shape}`
              : `Freehand ${pending.region.shape}`
            : pending?.kind === "resync"
              ? "Re-sync highlight timing"
              : undefined
        }
        initialStart={
          pending?.kind === "resync"
            ? highlights.find((h) => h.id === pending.highlightId)?.triggerWordIndex ?? null
            : null
        }
        initialEnd={
          pending?.kind === "resync"
            ? highlights.find((h) => h.id === pending.highlightId)?.endWordIndex ?? null
            : null
        }
        onPick={commitTrigger}
        onCancel={() => setPending(null)}
      />    </AppShell>
  );
}

/* ── Slide stage ── */

function SlideStage({
  active,
  thumbs,
  activeIndex,
  highlights,
  activeHighlights,
  playing,
  drawingRegion,
  regionShape,
  selectedRegionId,
  onSelectRegion,
  onChangeRegionBBox,
  onRegionCommit,
  onCancelDraw,
  onRemoveHighlight,
  onSyncHighlight,
  stageRef,
}: {
  active: Slide;
  thumbs: Record<string, string>;
  activeIndex: number;
  highlights: Highlight[];
  activeHighlights: { highlight: Highlight; progress: number }[];
  playing: boolean;
  drawingRegion: boolean;
  regionShape: "rect" | "square" | "oval";
  selectedRegionId: string | null;
  onSelectRegion: (id: string | null) => void;
  onChangeRegionBBox: (id: string, bbox: { x: number; y: number; w: number; h: number }) => void;
  onRegionCommit: (r: DrawnRegion) => void;
  onCancelDraw: () => void;
  onRemoveHighlight: (id: string) => void;
  onSyncHighlight: (id: string) => void;
  stageRef: RefObject<HTMLDivElement | null>;
}) {
  return (
    <div
      ref={stageRef}
      className="relative h-full w-full overflow-hidden bg-background"
      onPointerDown={() => {
        if (!drawingRegion) onSelectRegion(null);
      }}
    >
      {thumbs[active.n] ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={thumbs[active.n]}
          decoding="async"
          alt={active.title}
          data-slide-element="page"
          className="absolute inset-0 h-full w-full object-contain"
        />
      ) : (
        <>
          <div className="grid-paper absolute inset-0 opacity-40" aria-hidden />
          <div className="relative flex h-full flex-col justify-between p-6 sm:p-10">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="eyebrow mb-2 sm:mb-3" data-slide-element="chapter">
                  Chapter {active.n}
                </div>
                <div
                  data-slide-element="title"
                  className="font-display text-3xl font-bold leading-none tracking-tighter sm:text-5xl lg:text-6xl"
                >
                  {active.title}
                </div>
              </div>
              <div className="eyebrow shrink-0 text-right" data-slide-element="brand">
                Scapia · 2026
              </div>
            </div>
            <div data-slide-element="chart" className="flex items-end gap-1">
              {[40, 60, 80, 55, 90, 70, 100, 65, 80, 45, 60, 85].map((h, i) => (
                <div
                  key={i}
                  style={{ height: `${h * 0.55}px` }}
                  className={`flex-1 rounded-t ${i === activeIndex + 4 ? "bg-accent" : "bg-foreground/80"}`}
                />
              ))}
            </div>
          </div>
        </>
      )}
      {/* Edit outlines when not presenting; live spotlight while playing */}
      {!playing &&
        highlights
          .filter((h): h is Extract<Highlight, { kind: "region" }> => h.kind === "region")
          .map((r) => (
            <RegionOutline
              key={r.id}
              region={r}
              selected={selectedRegionId === r.id}
              onSelect={() => onSelectRegion(r.id)}
              onChangeBBox={(bbox) => onChangeRegionBBox(r.id, bbox)}
              onDelete={() => onRemoveHighlight(r.id)}
              onSync={() => onSyncHighlight(r.id)}
            />
          ))}
      {playing &&
        activeHighlights
          .filter((a) => a.highlight.kind === "region")
          .map((a) => (
            <RegionSpotlight
              key={a.highlight.id}
              region={a.highlight as Extract<Highlight, { kind: "region" }>}
              progress={a.progress}
            />
          ))}
      <RegionDrawLayer
        active={drawingRegion}
        shape={regionShape}
        onCommit={onRegionCommit}
        onCancel={onCancelDraw}
      />
    </div>
  );
}

/* ── Panels ── */

function SlidesPanel({
  slides,
  thumbs,
  selected,
  playing,
  onSelect,
}: {
  slides: Slide[];
  thumbs: Record<string, string>;
  selected: string;
  playing: boolean;
  onSelect: (n: string) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="eyebrow mb-2 px-1">{slides.length} slides</div>
      {slides.map((s) => {
        const isActive = s.n === selected;
        return (
          <button
            key={s.n}
            type="button"
            onClick={() => onSelect(s.n)}
            className={`block w-full rounded-xl border p-2 text-left transition-all ${
              isActive
                ? "border-foreground bg-background offset-shadow-sm"
                : "border-border bg-background hover:border-foreground/40"
            }`}
          >
            <div className="relative aspect-video overflow-hidden rounded-md bg-muted">
              {thumbs[s.n] ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={thumbs[s.n]} alt="" className="absolute inset-0 h-full w-full object-cover" />
              ) : (
                <div className="absolute inset-x-2 bottom-2 truncate font-display text-xs font-bold">
                  {s.title}
                </div>
              )}
              <div className="absolute left-1.5 top-1.5 rounded bg-background/80 px-1 font-mono text-[9px] font-semibold">
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
                <span className="text-[10px] text-muted-foreground">{statusLabel[s.status]}</span>
              </div>
              <span className="font-mono text-[10px] text-muted-foreground">{s.duration}</span>
            </div>
          </button>
        );
      })}
    </div>
  );
}

function VoicePanel({
  scripts,
  currentScript,
}: {
  scripts: string[];
  currentScript: string;
}) {
  const voice = useVoiceSettings();
  const [busy, setBusy] = useState<"preview" | "slide" | "all" | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [sampleReady, setSampleReady] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const settingsKey = voiceSettingsKey(voice);
  const activePreset = getPreset(voice.voiceId);
  const usingBrowser = isBrowserVoice(voice.voiceId);
  const lastSampleKey = useRef<string | null>(null);

  // Mark sample stale when settings change — regenerate only on Play (saves credits).
  useEffect(() => {
    if (lastSampleKey.current && lastSampleKey.current !== settingsKey) {
      setSampleReady(false);
      setStatus(
        usingBrowser
          ? "Settings changed — press Play sample"
          : "Settings changed — press Play sample to hear them",
      );
    }
  }, [settingsKey, usingBrowser]);

  async function playSample() {
    void unlockNarrationAudio();
    const settings = getVoiceSettings();
    const key = voiceSettingsKey(settings);
    setBusy("preview");

    if (isBrowserVoice(settings.voiceId)) {
      setStatus("Playing browser voice…");
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
        const utter = new SpeechSynthesisUtterance(VOICE_SAMPLE);
        utter.rate = settings.speed;
        window.speechSynthesis.speak(utter);
        lastSampleKey.current = key;
        setSampleReady(true);
        setStatus("Standard voice · free");
      } else {
        setStatus("Browser speech not available in this browser");
      }
      setBusy(null);
      return;
    }

    setStatus("Generating ElevenLabs sample…");
    try {
      const url = await ensureNarrationAudio(VOICE_SAMPLE, settings);
      lastSampleKey.current = key;
      setSampleReady(true);

      const el = audioRef.current;
      if (!el) {
        const audio = new Audio();
        await playObjectUrl(audio, url);
      } else {
        await playObjectUrl(el, url);
      }

      setStatus(
        `${activePreset.name} · speed ${formatSpeed(settings.speed)} · stab ${formatPct01(settings.stability)}`,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Sample failed";
      const isQuota = /quota/i.test(msg);

      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
        const utter = new SpeechSynthesisUtterance(VOICE_SAMPLE);
        utter.rate = settings.speed;
        window.speechSynthesis.speak(utter);
        setStatus(
          isQuota
            ? "ElevenLabs quota exceeded — playing browser voice"
            : "Playing browser voice (TTS unavailable)",
        );
      } else {
        setStatus(isQuota ? "ElevenLabs quota exceeded — top up credits" : msg);
      }
    } finally {
      setBusy(null);
    }
  }

  async function applyThisSlide() {
    if (usingBrowser) {
      setStatus("Standard voice · nothing to rebuild");
      return;
    }
    setBusy("slide");
    setStatus("Rebuilding this slide…");
    try {
      invalidateNarrationAudio(currentScript);
      if (currentScript.trim()) {
        await ensureNarrationAudio(currentScript, getVoiceSettings());
      }
      setStatus("This slide ready");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed";
      setStatus(
        /quota/i.test(msg)
          ? "ElevenLabs quota exceeded — top up credits"
          : "Failed to rebuild slide voice",
      );
    } finally {
      setBusy(null);
    }
  }

  async function applyAll() {
    if (usingBrowser) {
      setStatus("Standard voice · nothing to rebuild");
      return;
    }
    setBusy("all");
    setStatus("Rebuilding all voices…");
    try {
      await regenerateAllVoices(scripts);
      setStatus("All slides ready");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed";
      setStatus(
        /quota/i.test(msg)
          ? "ElevenLabs quota exceeded — top up credits"
          : "Failed to rebuild deck voices",
      );
    } finally {
      setBusy(null);
    }
  }

  function resetValues() {
    setVoiceSettings({ ...DEFAULT_VOICE_SETTINGS, voiceId: voice.voiceId });
    setStatus(usingBrowser ? "Reset speed to default" : "Reset to ElevenLabs defaults");
  }

  return (
    <div className="space-y-4">
      {!usingBrowser && (
        <audio ref={audioRef} preload="auto" controls className="h-8 w-full" />
      )}

      <div>
        <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Voice</label>
        <select
          value={voice.voiceId}
          onChange={(e) => setVoicePreset(e.target.value as VoicePresetId)}
          className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm font-medium outline-none focus:border-foreground"
        >
          {VOICE_PRESETS.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name} — {v.tag}
            </option>
          ))}
        </select>
        {usingBrowser && (
          <p className="mt-1.5 text-[11px] leading-snug text-muted-foreground">
            Default · uses your device speech (no ElevenLabs credits). Switch to Daniel /
            Charlotte / George / Sarah to use ElevenLabs.
          </p>
        )}
      </div>

      {!usingBrowser && (
        <>
      <div>
        <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Model</label>
        <select
          value={voice.modelId}
          onChange={(e) => setVoiceSettings({ modelId: e.target.value })}
          className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm font-medium outline-none focus:border-foreground"
        >
          {TTS_MODELS.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-4 border-t border-border pt-3">
        <ElSlider
          label="Speed"
          left="Slower"
          right="Faster"
          valueLabel={formatSpeed(voice.speed)}
          min={70}
          max={120}
          value={Math.round(voice.speed * 100)}
          onChange={(n) => setVoiceSettings({ speed: n / 100 })}
        />
        <ElSlider
          label="Stability"
          left="More variable"
          right="More stable"
          valueLabel={formatPct01(voice.stability)}
          min={0}
          max={100}
          value={Math.round(voice.stability * 100)}
          onChange={(n) => setVoiceSettings({ stability: n / 100 })}
        />
        <ElSlider
          label="Similarity"
          left="Low"
          right="High"
          valueLabel={formatPct01(voice.similarityBoost)}
          min={0}
          max={100}
          value={Math.round(voice.similarityBoost * 100)}
          onChange={(n) => setVoiceSettings({ similarityBoost: n / 100 })}
        />
        <ElSlider
          label="Style exaggeration"
          left="None"
          right="Exaggerated"
          valueLabel={formatPct01(voice.style)}
          min={0}
          max={100}
          value={Math.round(voice.style * 100)}
          onChange={(n) => setVoiceSettings({ style: n / 100 })}
        />
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
        <label className="flex items-center gap-2 text-xs font-medium">
          <input
            type="checkbox"
            checked={voice.useSpeakerBoost}
            onChange={(e) => setVoiceSettings({ useSpeakerBoost: e.target.checked })}
            className="accent-foreground"
          />
          Speaker boost
        </label>
        <button
          type="button"
          onClick={resetValues}
          className="text-xs font-semibold text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
        >
          Reset values
        </button>
      </div>
        </>
      )}

      {usingBrowser && (
        <div className="space-y-3 border-t border-border pt-3">
          <ElSlider
            label="Speed"
            left="Slower"
            right="Faster"
            valueLabel={formatSpeed(voice.speed)}
            min={70}
            max={120}
            value={Math.round(voice.speed * 100)}
            onChange={(n) => setVoiceSettings({ speed: n / 100 })}
          />
        </div>
      )}

      <button
        type="button"
        disabled={busy !== null}
        onPointerDown={() => {
          void unlockNarrationAudio();
        }}
        onClick={() => void playSample()}
        className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-full bg-foreground text-sm font-semibold text-background disabled:opacity-40"
      >
        {busy === "preview" ? "… Generating" : sampleReady ? "▶ Replay sample" : "▶ Play sample"}
      </button>

      <div className="grid grid-cols-2 gap-2">
        <Button
          size="sm"
          variant="ghost"
          disabled={busy !== null}
          onClick={() => void applyThisSlide()}
        >
          {busy === "slide" ? "…" : "This slide"}
        </Button>
        <Button
          size="sm"
          variant="secondary"
          disabled={busy !== null}
          onClick={() => void applyAll()}
        >
          {busy === "all" ? "…" : "Apply to all"}
        </Button>
      </div>
      {status && (
        <p className="font-mono text-[10px] text-muted-foreground">{status}</p>
      )}
    </div>
  );
}

function ElSlider({
  label,
  left,
  right,
  valueLabel,
  min,
  max,
  value,
  onChange,
}: {
  label: string;
  left: string;
  right: string;
  valueLabel: string;
  min: number;
  max: number;
  value: number;
  onChange: (n: number) => void;
}) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="font-medium text-foreground">{label}</span>
        <span className="font-mono text-muted-foreground">{valueLabel}</span>
      </div>
      <div className="mb-1 flex justify-between text-[10px] text-muted-foreground">
        <span>{left}</span>
        <span>{right}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-foreground"
      />
    </div>
  );
}

function AvatarPanel() {
  return (
    <div className="space-y-3">
      <ComingSoonBadge />
      <p className="text-xs leading-relaxed text-muted-foreground">
        Pick a lifelike avatar that appears next to the slide. Lip-sync follows the voice you chose.
      </p>
      <div className="grid grid-cols-4 gap-2 opacity-60">
        {["A", "B", "C", "D"].map((k) => (
          <div
            key={k}
            className="flex aspect-square items-center justify-center rounded-xl border border-dashed border-border bg-muted text-sm font-semibold text-muted-foreground"
          >
            {k}
          </div>
        ))}
      </div>
    </div>
  );
}

function DesignPanel() {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold">Brand & theme</span>
        <ComingSoonBadge />
      </div>
      <p className="text-xs text-muted-foreground">Colors, logo placement, and caption styles.</p>
    </div>
  );
}

function MorePanel() {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold">Effects</span>
        <ComingSoonBadge />
      </div>
      <p className="text-xs text-muted-foreground">Music, ambience, and transitions.</p>
      <div className="rounded-xl border border-border p-3 text-xs text-muted-foreground">
        <kbd className="rounded border px-1">J</kbd>/<kbd className="rounded border px-1">K</kbd> step ·{" "}
        <kbd className="rounded border px-1">Space</kbd> play ·{" "}
        <kbd className="rounded border px-1">Esc</kbd> close
      </div>
    </div>
  );
}

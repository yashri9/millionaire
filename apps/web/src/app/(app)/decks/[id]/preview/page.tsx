"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/shell";
import { Button } from "@/components/ui-kit";
import { getCachedDeck, type DeckSlide } from "@/lib/deck-store";
import { getAllHighlights } from "@/lib/highlight-store";
import { useHydrateDeck } from "@/hooks/use-hydrate-deck";
import { useDeckPlayback } from "@/hooks/use-deck-playback";
import { DeckPlayer } from "@/components/deck-flow/DeckPlayer";
import { FlowSteps } from "@/components/deck-flow/FlowSteps";
import {
  fmt,
  getRehearsedRevision,
  markRehearsed,
  slidesMissingNarration,
} from "@/lib/deck-runtime";
import { getShare, getShareTokenForDeck } from "@/lib/share-store";

export default function RehearsePage() {
  const params = useParams();
  const id = String(params.id ?? "");
  const [title, setTitle] = useState("Untitled deck");
  const [slides, setSlides] = useState<DeckSlide[]>([]);
  const [revision, setRevision] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [rehearsedRev, setRehearsedRev] = useState<number | null>(null);
  const [publishedRev, setPublishedRev] = useState<number | null>(null);
  const [hlBySlide, setHlBySlide] = useState<Record<string, number>>({});

  const { state: hydrateState, reload } = useHydrateDeck(id);

  useEffect(() => {
    if (hydrateState.status === "loading") {
      setHydrated(false);
      return;
    }
    if (hydrateState.status === "error") {
      setLoadError(hydrateState.error);
      setSlides([]);
      setHydrated(true);
      return;
    }
    setTitle(hydrateState.deck.title || "Untitled deck");
    setSlides(hydrateState.deck.slides);
    setRevision(hydrateState.deck.revision ?? 0);
    setLoadError(null);
    setHydrated(true);
    const deck = getCachedDeck(id) ?? hydrateState.deck;
    if (deck?.highlights) {
      const working = getAllHighlights(id);
      if (Object.keys(working).length === 0 && Object.keys(deck.highlights).length > 0) {
        try {
          localStorage.setItem(`voxdeck:highlights:${id}`, JSON.stringify(deck.highlights));
        } catch {
          /* ignore */
        }
      }
    }
    const all = getAllHighlights(id);
    setHlBySlide(Object.fromEntries(Object.entries(all).map(([k, v]) => [k, v.length])));
    setRehearsedRev(getRehearsedRevision(id));
    const token = getShareTokenForDeck(id);
    setPublishedRev(token ? (getShare(token)?.revision ?? null) : null);
  }, [hydrateState, id]);

  const p = useDeckPlayback({
    deckId: id,
    slides,
    onFinished: () => {
      markRehearsed(id, revision);
      setRehearsedRev(revision);
    },
  });

  const missing = useMemo(() => slidesMissingNarration(slides), [slides]);
  const rehearsedLatest = rehearsedRev != null && rehearsedRev >= revision;
  const isPublished = publishedRev != null;
  const publishLabel = isPublished
    ? publishedRev! < revision
      ? "Update live link"
      : "Open your live link"
    : "Get the share link";

  if (!hydrated || hydrateState.status === "loading") {
    return (
      <AppShell variant="app">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
          <div className="h-8 w-64 animate-pulse rounded-full bg-muted" />
          <div className="mt-6 aspect-[16/9] w-full max-w-4xl animate-pulse rounded-2xl bg-muted" />
        </div>
      </AppShell>
    );
  }

  if (loadError) {
    return (
      <AppShell variant="app">
        <div className="mx-auto flex max-w-lg flex-col items-center gap-4 p-8 text-center">
          <p className="font-display text-2xl font-bold tracking-tight">Couldn&apos;t open rehearsal</p>
          <p className="text-sm text-muted-foreground">{loadError}</p>
          <div className="flex gap-3">
            <Button type="button" onClick={() => void reload()}>
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

  if (!p.active) {
    return (
      <AppShell variant="app">
        <div className="mx-auto flex max-w-lg flex-col items-center gap-4 p-8 text-center">
          <p className="font-display text-2xl font-bold tracking-tight">No slides yet</p>
          <p className="text-sm text-muted-foreground">Add slides in the editor, then come back to rehearse.</p>
          <Link href={`/decks/${id}/edit`}>
            <Button type="button">Open editor</Button>
          </Link>
        </div>
      </AppShell>
    );
  }

  const endCard = (
    <div className="w-full max-w-sm text-center">
      <div className="eyebrow">That&apos;s the whole deck</div>
      <p className="mt-1 font-display text-2xl font-bold tracking-tight">
        {fmt(p.totalDur)} · {slides.length} slides
      </p>
      <div className="mt-4 flex flex-col gap-2">
        <Link
          href={`/decks/${id}/publish`}
          className="flex h-11 items-center justify-center rounded-full bg-foreground px-4 text-sm font-semibold text-background"
        >
          {publishLabel} →
        </Link>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={p.restart}
            className="flex h-11 flex-1 items-center justify-center rounded-full border border-border bg-background text-xs font-semibold hover:bg-muted"
          >
            ⟲ Watch again
          </button>
          <Link
            href={`/decks/${id}/edit?slide=${p.active.n}`}
            className="flex h-11 flex-1 items-center justify-center rounded-full border border-border bg-background text-xs font-semibold hover:bg-muted"
          >
            Edit
          </Link>
        </div>
      </div>
    </div>
  );

  return (
    <AppShell variant="app">
      <div className="mx-auto max-w-7xl px-4 pb-28 pt-4 sm:px-6 sm:pt-6 lg:pb-10">
        {/* Header */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <FlowSteps
            deckId={id}
            current="rehearse"
            done={[...(rehearsedLatest ? (["rehearse"] as const) : []), ...(isPublished ? (["publish"] as const) : [])]}
          />
        </div>
        <div className="mt-4">
          <h1 className="font-display text-2xl font-bold leading-tight tracking-tight sm:text-3xl">
            {title}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {slides.length} slides · {fmt(p.totalDur)} · this is what viewers will hear.
          </p>
        </div>

        {missing.length > 0 && (
          <div className="mt-4 flex flex-col gap-2 rounded-xl border border-warn/60 bg-warn/10 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
            <span>
              <strong>
                {missing.length === 1
                  ? `Slide ${missing[0]!.n} has no narration.`
                  : `${missing.length} slides have no narration (${missing.map((s) => s.n).join(", ")}).`}
              </strong>{" "}
              Add a line before you publish.
            </span>
            <Link
              href={`/decks/${id}/edit?slide=${missing[0]!.n}`}
              className="shrink-0 font-semibold underline underline-offset-2"
            >
              Fix in editor →
            </Link>
          </div>
        )}

        <div className="mt-5 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_300px] lg:gap-x-8 lg:gap-y-5">
          {/* Player */}
          <section className="min-w-0">
            <DeckPlayer playback={p} title={title} endCard={endCard} />
            <p className="mt-2 hidden text-[11px] text-muted-foreground lg:block">
              Shortcuts: <kbd className="font-mono">Space</kbd> play/pause ·{" "}
              <kbd className="font-mono">←</kbd> <kbd className="font-mono">→</kbd> slides ·{" "}
              <kbd className="font-mono">F</kbd> full screen
            </p>

          </section>

          {/* Rail */}
          <aside className="min-w-0 space-y-5 lg:sticky lg:top-24 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:self-start">
            <div>
              <div className="eyebrow mb-2">Slides · {slides.length}</div>
              <ul className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 lg:mx-0 lg:max-h-[calc(100dvh-22rem)] lg:flex-col lg:gap-1 lg:overflow-y-auto lg:overflow-x-visible lg:px-0 lg:pr-1">
                {slides.map((s, i) => {
                  const isActive = i === p.idx;
                  const noScript = !s.script?.trim();
                  const hl = hlBySlide[s.n] ?? 0;
                  return (
                    <li key={s.n} className="w-40 shrink-0 lg:w-auto">
                      <button
                        type="button"
                        onClick={() => p.jump(i)}
                        aria-current={isActive ? "true" : undefined}
                        className={`flex w-full items-center gap-2 rounded-lg border p-1.5 text-left transition-colors ${
                          isActive
                            ? "border-foreground bg-foreground text-background"
                            : "border-transparent hover:bg-muted"
                        }`}
                      >
                        <span className="relative aspect-[16/9] w-14 shrink-0 overflow-hidden rounded bg-muted">
                          {s.thumbnail ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={s.thumbnail} alt="" className="h-full w-full object-cover" />
                          ) : (
                            <span className="flex h-full items-center justify-center font-mono text-[10px] text-muted-foreground">
                              {s.n}
                            </span>
                          )}
                          {isActive && p.playing && (
                            <span className="absolute inset-0 flex items-center justify-center bg-foreground/40 text-[10px] text-background">
                              ▶
                            </span>
                          )}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-xs font-semibold">
                            <span className={isActive ? "text-background/60" : "text-muted-foreground"}>
                              {s.n}
                            </span>{" "}
                            {s.title}
                          </span>
                          <span
                            className={`mt-0.5 flex items-center gap-1.5 font-mono text-[10px] ${
                              isActive ? "text-background/70" : "text-muted-foreground"
                            }`}
                          >
                            {fmt(p.durations[i] ?? 0)}
                            {hl > 0 && <span>· {hl} hl</span>}
                            {noScript && (
                              <span className="rounded bg-warn px-1 font-sans font-semibold text-foreground">
                                no narration
                              </span>
                            )}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>

            <div className="hidden rounded-2xl border border-border bg-background p-4 lg:block">
              <p className="mt-1.5 text-sm font-medium leading-snug">
                {isPublished
                  ? publishedRev! < revision
                    ? "You've edited since publishing. Push the changes to your live link."
                    : "Your link is live and up to date."
                  : "Happy with it? Get a link anyone can watch."}
              </p>
              <Link
                href={`/decks/${id}/publish`}
                className="mt-3 flex min-h-11 w-full items-center justify-center rounded-full bg-foreground px-4 py-2 text-xs font-semibold text-background transition-transform hover:-translate-y-0.5"
              >
                {publishLabel} →
              </Link>
              <Link
                href={`/decks/${id}/edit?slide=${p.active.n}`}
                className="mt-2 flex min-h-11 w-full items-center justify-center rounded-full border border-border bg-background px-4 py-2 text-xs font-semibold text-foreground transition-colors hover:bg-muted"
              >
                Edit this slide
              </Link>
            </div>
          </aside>


        </div>
      </div>

      {/* Mobile / tablet: next step always in reach */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 px-4 py-3 backdrop-blur lg:hidden" style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}>
        <div className="mx-auto flex max-w-3xl gap-2">
          <Link
            href={`/decks/${id}/edit?slide=${p.active.n}`}
            className="flex h-11 items-center justify-center rounded-full border border-border px-4 text-xs font-semibold"
          >
            Edit
          </Link>
          <Link
            href={`/decks/${id}/publish`}
            className="flex h-11 flex-1 items-center justify-center rounded-full bg-foreground px-4 text-sm font-semibold text-background"
          >
            {publishLabel} →
          </Link>
        </div>
      </div>
    </AppShell>
  );
}


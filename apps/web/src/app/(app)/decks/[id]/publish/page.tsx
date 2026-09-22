"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppShell } from "@/components/shell";
import { Button, Input, StatusPill, StripedProgress, Waveform } from "@/components/ui-kit";
import { ComingSoonBadge } from "@/components/ui-panel";
import { cacheDeck, getCachedDeck, isCloudDeckId, type DeckSlide } from "@/lib/deck-store";
import { getAllHighlights, useHighlights } from "@/lib/highlight-store";
import { publishDeckSnapshot, getShareTokenForDeck } from "@/lib/share-store";
import { SlidePlaybackStage } from "@/components/highlights/SlidePlaybackStage";
import { useHighlightScheduler } from "@/hooks/use-highlight-scheduler";
import { useSpeechNarration, usePrefetchNarration } from "@/hooks/use-speech-narration";
import { unlockNarrationAudioSync } from "@/hooks/use-speech-narration";
import { getCachedNarration } from "@/lib/tts-cache";
import { useVoiceSettings } from "@/lib/voice-store";
import { getPreset, type DeckVoiceSettings } from "@/lib/voice-settings";
import { publicEnv } from "@/lib/env";
import { useHydrateDeck } from "@/hooks/use-hydrate-deck";

type Access = "anyone" | "email" | "password";

type Check = {
  id: string;
  label: string;
  state: "ok" | "warn";
  hint?: string;
  action?: "cover";
};

function slideAudioSec(
  script: string,
  fallback: number,
  voice?: DeckVoiceSettings,
) {
  const cached = getCachedNarration(script, voice);
  const last = cached?.tokens[cached.tokens.length - 1];
  const sec = last ? last.endMs / 1000 : 0;
  return Number.isFinite(sec) && sec > 0.2 ? sec : fallback;
}

function fmt(s: number) {
  const n = Math.max(0, Math.floor(s));
  return `${Math.floor(n / 60)}:${String(n % 60).padStart(2, "0")}`;
}

export default function PublishPage() {
  const params = useParams();
  const id = String(params.id ?? "");
  const [deckTitle, setDeckTitle] = useState("Untitled deck");
  const [slides, setSlides] = useState<DeckSlide[]>([]);
  const [idx, setIdx] = useState(0);
  const [access, setAccess] = useState<Access>("anyone");
  const narrationRef = useRef<{
    pause: () => void;
    start: (scriptOverride?: string) => void;
    restart: () => void;
  } | null>(null);
  const [gatedEmail, setGatedEmail] = useState("");
  const [password, setPassword] = useState("");
  const [captureEmail, setCaptureEmail] = useState(true);
  const [trackDwell, setTrackDwell] = useState(true);
  const [expires, setExpires] = useState<"never" | "7d" | "30d">("30d");
  const [customSlug, setCustomSlug] = useState("scapia-series-b");
  const [publishing, setPublishing] = useState(false);
  const [published, setPublished] = useState(false);
  const [progress, setProgress] = useState(0);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [shareToken, setShareToken] = useState<string>("");
  const [copied, setCopied] = useState(false);
  const [leftTab, setLeftTab] = useState<"checklist" | "access" | "tracking">("checklist");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const stageRef = useRef<HTMLDivElement>(null);
  const captionRef = useRef<HTMLDivElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);
  const voice = useVoiceSettings();

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
    setDeckTitle(hydrateState.deck.title);
    setSlides(hydrateState.deck.slides);
    setLoadError(null);
    setHydrated(true);
    const existing = getShareTokenForDeck(id);
    if (existing) {
      setShareToken(existing);
      setCustomSlug(existing);
    }
  }, [hydrateState, id]);

  const active = slides[idx] ?? slides[0];
  const { items: highlights } = useHighlights(id, active?.n ?? "01");
  const voiceName = getPreset(voice.voiceId).name;
  const totalDur = slides.reduce(
    (a, s) => a + slideAudioSec(s.script ?? "", s.durationSec ?? 0, voice),
    0,
  );
  const priorDur = slides
    .slice(0, idx)
    .reduce((a, s) => a + slideAudioSec(s.script ?? "", s.durationSec ?? 0, voice), 0);
  const shareHost = publicEnv.appUrl.replace(/^https?:\/\//, "");
  const hasCover = Boolean(slides[0]?.thumbnail);
  const checks: Check[] = [
    {
      id: "narr",
      label:
        slides.length > 0 && slides.every((s) => s.script?.trim())
          ? "All slides narrated"
          : "Some slides still need narration",
      state:
        slides.length > 0 && slides.every((s) => s.script?.trim()) ? "ok" : "warn",
    },
    {
      id: "voice",
      label: `Voice consistent — ${voiceName}`,
      state: "ok",
    },
    {
      id: "dur",
      label: `Runtime ${fmt(totalDur)}${totalDur > 0 && totalDur < 300 ? " (under 5 min)" : ""}`,
      state: "ok",
    },
    {
      id: "cover",
      label: hasCover ? "Change cover image" : "Add cover image",
      state: hasCover ? "ok" : "warn",
      action: "cover",
    },
  ];
  const openIssues = checks.filter((c) => c.state === "warn" && c.action !== "cover").length;
  const readyToShip = openIssues === 0;

  const advanceOrStop = useCallback(() => {
    setIdx((i) => {
      if (i < slides.length - 1) {
        const next = slides[i + 1];
        narrationRef.current?.start(next?.script ?? "");
        return i + 1;
      }
      return i;
    });
  }, [slides]);

  const narration = useSpeechNarration(active?.script ?? "", advanceOrStop);
  narrationRef.current = narration;
  const playing = narration.playing;
  const elapsed = narration.currentTime;
  const slideDur =
    narration.duration > 0 ? narration.duration : (active?.durationSec ?? 0);
  const currentAbs = priorDur + Math.min(elapsed, slideDur || elapsed);
  const progressPct = totalDur > 0 ? (currentAbs / totalDur) * 100 : 0;

  const activeHighlights = useHighlightScheduler(
    active?.script ?? "",
    slideDur || 8,
    highlights,
    elapsed,
  );

  const slideScripts = useMemo(() => slides.map((s) => s.script), [slides]);
  const { ready: ttsReady, total: ttsTotal, prefetching: ttsPrefetching } =
    usePrefetchNarration(slideScripts);

  function onCoverFile(file: File | undefined) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || "");
      if (!dataUrl) return;
      const deck = getCachedDeck(id);
      if (!deck || deck.slides.length === 0) return;
      const nextSlides = deck.slides.map((s, i) =>
        i === 0 ? { ...s, thumbnail: dataUrl } : s,
      );
      cacheDeck({
        ...deck,
        slides: nextSlides,
        revision: (deck.revision ?? 0) + 1,
      });
      setSlides(nextSlides);
    };
    reader.readAsDataURL(file);
  }

  function publish() {
    setPublishError(null);
    const deck = getCachedDeck(id);
    if (!deck) {
      setPublishError("Deck not found. Return to the editor and save first.");
      return;
    }
    if (!isCloudDeckId(id)) {
      setPublishError(
        "This is a device draft. Upload it to Voxdeck from the dashboard before publishing.",
      );
      return;
    }
    if ((deck.revision ?? 0) < 0) {
      setPublishError("Invalid revision.");
      return;
    }
    // Validate highlights geometry
    const highlightsMap = getAllHighlights(id);
    for (const [slideKey, list] of Object.entries(highlightsMap)) {
      if (!deck.slides.some((s) => s.n === slideKey)) {
        setPublishError(`Highlight references missing slide ${slideKey}.`);
        return;
      }
      for (const h of list) {
        if (h.kind === "region") {
          const { x, y, w, h: hh } = h.bbox;
          if (w <= 0 || hh <= 0 || x < 0 || y < 0 || x + w > 100.5 || y + hh > 100.5) {
            setPublishError("A highlight has invalid shape geometry.");
            return;
          }
        }
        if (typeof h.triggerWordIndex !== "number") {
          setPublishError("A highlight is missing timing.");
          return;
        }
      }
    }

    setPublishing(true);
    setProgress(0);
    void (async () => {
      try {
        setProgress(30);
        // Sync local script into server draft when this deck exists remotely.
        const remote = await fetch(`/api/decks/${id}`);
        if (remote.ok) {
          const payload = (await remote.json()) as {
            slides?: { id: string; order_index: number }[];
          };
          const narrationRows = (payload.slides ?? []).map((s) => {
            const local = slides.find((x) => Number(x.n) === s.order_index);
            return { slide_id: s.id, text: local?.script ?? "" };
          });
          if (narrationRows.length > 0) {
            await fetch(`/api/decks/${id}/script`, {
              method: "PATCH",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ narration: narrationRows }),
            });
          }
          setProgress(65);
          const pub = await fetch(`/api/decks/${id}/publish`, { method: "POST" });
          const data = (await pub.json().catch(() => ({}))) as {
            token?: string;
            url?: string;
            error?: string;
          };
          if (!pub.ok || !data.token) {
            throw new Error(data.error || "Publishing failed on the server.");
          }
          const share = publishDeckSnapshot({
            deck: { ...deck, highlights: highlightsMap },
            highlights: highlightsMap,
            token: data.token,
          });
          setShareToken(share.token);
          setCustomSlug(share.token);
          setProgress(100);
          setPublishing(false);
          setPublished(true);
          return;
        }

        // Fallback: local-only publish when server deck is unavailable.
        setProgress(100);
        const share = publishDeckSnapshot({
          deck: { ...deck, highlights: highlightsMap },
          highlights: highlightsMap,
          token: customSlug.trim() || undefined,
        });
        setShareToken(share.token);
        setCustomSlug(share.token);
        setPublishing(false);
        setPublished(true);
      } catch (e) {
        setPublishing(false);
        setPublishError(e instanceof Error ? e.message : "Publishing failed.");
      }
    })();
  }

  function copyLink() {
    const url = `${publicEnv.appUrl}/d/${shareToken || customSlug}`;
    void (async () => {
      try {
        await navigator.clipboard?.writeText(url);
      } catch {
        const ta = document.createElement("textarea");
        ta.value = url;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        ta.remove();
      }
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    })();
  }

  return (
    <AppShell variant="app">
      {!hydrated || hydrateState.status === "loading" ? (
        <div className="p-8 text-sm text-muted-foreground">Loading deck…</div>
      ) : loadError ? (
        <div className="mx-auto flex max-w-lg flex-col items-center gap-4 p-8 text-center">
          <p className="font-display text-2xl font-bold tracking-tight">Couldn&apos;t open publish</p>
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
      ) : (
      <div className="mx-auto grid max-w-7xl gap-6 px-4 py-4 sm:px-6 sm:py-6 lg:grid-cols-[260px_minmax(0,1fr)] lg:items-start lg:gap-8">
        {/* Left rail — same structure as preview */}
        <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          <div>
            <Link
              href={`/decks/${id}/edit`}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              ← Back to editor
            </Link>
            <div className="eyebrow mt-3">Ready to send</div>
            <h1 className="mt-1 font-display text-2xl font-bold leading-tight tracking-tight">
              {published ? (
                <>
                  Your deck
                  <br />
                  is live.
                </>
              ) : (
                <>
                  Ship it.
                  <br />
                  Then share.
                </>
              )}
            </h1>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              {published
                ? "The link is live. Share it anywhere — we’ll ping you when someone opens it."
                : "Checklist, access, link. Same walkthrough layout as preview."}
            </p>
          </div>

          <div className="flex gap-1 rounded-full border border-border bg-background p-1">
            {(
              [
                ["checklist", "Pre-flight"],
                ["access", "Access"],
                ["tracking", "Tracking"],
              ] as const
            ).map(([idTab, label]) => (
              <button
                key={idTab}
                type="button"
                onClick={() => setLeftTab(idTab)}
                className={`flex-1 rounded-full px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wide transition-colors ${
                  leftTab === idTab
                    ? "bg-foreground text-background"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="min-h-[18rem]">
            {leftTab === "checklist" && (
              <div>
                <div className="mb-3 flex items-center justify-between">
                  <div className="eyebrow">Pre-flight</div>
                  <StatusPill
                    status={readyToShip ? "live" : "draft"}
                    label={readyToShip ? "Ready" : "Review"}
                  />
                </div>
                <ul className="space-y-1">
                  {checks.map((c) => (
                    <li
                      key={c.id}
                      className="rounded-md border border-border bg-background px-2.5 py-2"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-start gap-2">
                          <span
                            className={`mt-0.5 flex h-4 w-4 flex-none items-center justify-center rounded-full text-[9px] font-bold ${
                              c.state === "ok"
                                ? "bg-live text-foreground"
                                : "bg-warn text-foreground"
                            }`}
                          >
                            {c.state === "ok" ? "✓" : "!"}
                          </span>
                          <div>
                            <div className="text-xs font-medium leading-snug">{c.label}</div>
                            {c.hint && (
                              <div className="mt-0.5 text-[10px] text-muted-foreground">
                                {c.hint}
                              </div>
                            )}
                          </div>
                        </div>
                        {c.action === "cover" && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => coverInputRef.current?.click()}
                          >
                            {hasCover ? "Change" : "Add"}
                          </Button>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
                <input
                  ref={coverInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    onCoverFile(e.target.files?.[0]);
                    e.target.value = "";
                  }}
                />
              </div>
            )}

            {leftTab === "access" && (
              <div className="flex h-full flex-col space-y-3">
                <div className="eyebrow">Who can open</div>
                <div className="space-y-1.5">
                  {(
                    [
                      { id: "anyone", title: "Anyone with the link", sub: "Zero friction" },
                      { id: "email", title: "Email-gated", sub: "Enter email to play" },
                      { id: "password", title: "Password", sub: "Share code separately" },
                    ] as const
                  ).map((o) => {
                    const on = access === o.id;
                    return (
                      <button
                        key={o.id}
                        type="button"
                        onClick={() => setAccess(o.id)}
                        className={`flex w-full flex-col rounded-md px-2.5 py-2 text-left transition-colors ${
                          on ? "bg-foreground text-background" : "hover:bg-muted"
                        }`}
                      >
                        <span className="text-xs font-semibold">{o.title}</span>
                        <span
                          className={`text-[10px] ${on ? "text-background/70" : "text-muted-foreground"}`}
                        >
                          {o.sub}
                        </span>
                      </button>
                    );
                  })}
                </div>
                <div className="h-11">
                  {access === "email" && (
                    <Input
                      value={gatedEmail}
                      onChange={(e) => setGatedEmail(e.target.value)}
                      placeholder="name@company.com"
                    />
                  )}
                  {access === "password" && (
                    <Input
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="e.g. quiet-jazz-42"
                    />
                  )}
                </div>
                <div>
                  <div className="eyebrow mb-2">Expires</div>
                  <div className="flex gap-1">
                    {(["never", "7d", "30d"] as const).map((v) => (
                      <button
                        key={v}
                        type="button"
                        onClick={() => setExpires(v)}
                        className={`flex-1 rounded-full border px-2 py-1.5 text-[10px] font-semibold ${
                          expires === v
                            ? "border-foreground bg-foreground text-background"
                            : "border-border hover:border-foreground/40"
                        }`}
                      >
                        {v === "never" ? "Never" : v === "7d" ? "7d" : "30d"}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {leftTab === "tracking" && (
              <div className="space-y-2">
                <div className="eyebrow mb-2">Analytics</div>
                <label className="flex items-center justify-between rounded-md border border-border px-2.5 py-2 text-xs">
                  <span className="font-semibold">Capture viewer email</span>
                  <input
                    type="checkbox"
                    checked={captureEmail}
                    onChange={(e) => setCaptureEmail(e.target.checked)}
                    className="h-4 w-4 accent-foreground"
                  />
                </label>
                <label className="flex items-center justify-between rounded-md border border-border px-2.5 py-2 text-xs">
                  <span className="font-semibold">Per-slide dwell</span>
                  <input
                    type="checkbox"
                    checked={trackDwell}
                    onChange={(e) => setTrackDwell(e.target.checked)}
                    className="h-4 w-4 accent-foreground"
                  />
                </label>
                <div className="mt-3 rounded-md border border-dashed border-border px-2.5 py-3">
                  <div className="flex items-center gap-2">
                    <span className="text-sm">🧑‍💼</span>
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-semibold">Presenter avatar</div>
                      <div className="text-[10px] text-muted-foreground">
                        Lip-synced avatar in the shared deck
                      </div>
                    </div>
                    <ComingSoonBadge />
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="rounded-2xl border-2 border-foreground bg-accent p-4 offset-shadow-sm">
            <div className="eyebrow">Want a dry run?</div>
            <p className="mt-1.5 text-sm font-medium leading-snug">
              Rehearse the walkthrough before you publish.
            </p>
            <Link
              href={`/decks/${id}/preview`}
              className="mt-3 flex w-full items-center justify-center rounded-full bg-foreground px-4 py-2 text-xs font-semibold text-background transition-transform hover:-translate-y-0.5"
            >
              Rehearse first
            </Link>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="eyebrow">Shareable link</div>
              {published ? (
                <StatusPill status="live" label="Live" />
              ) : (
                <StatusPill status="draft" label="Not shipped" />
              )}
            </div>
            <div className="flex items-stretch overflow-hidden rounded-xl border-2 border-foreground">
              <span className="flex shrink-0 items-center bg-muted px-2 font-mono text-[10px] text-muted-foreground">
                {shareHost}/d/
              </span>
              <input
                value={customSlug}
                onChange={(e) =>
                  setCustomSlug(e.target.value.replace(/[^a-z0-9-]/gi, "-").toLowerCase())
                }
                className="min-w-0 flex-1 border-0 bg-background px-2 font-mono text-xs text-foreground focus:outline-none"
                placeholder="your-deck"
              />
              <button
                type="button"
                onClick={copyLink}
                disabled={!published}
                className="flex shrink-0 items-center bg-foreground px-2.5 text-[10px] font-semibold text-background transition-opacity hover:opacity-90 disabled:opacity-30"
              >
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
            {publishing && (
              <div>
                <StripedProgress value={progress} label="Publishing" />
                <p className="mt-2 text-xs text-muted-foreground">
                  Saving highlight timing and minting your shareable link…
                </p>
              </div>
            )}
            {publishError && (
              <div className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-800">
                {publishError}
                <span className="mt-1 block text-muted-foreground">
                  Your edits are still saved in the editor.
                </span>
              </div>
            )}
            {published && (
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={copyLink}
                  className="rounded-full border border-border px-4 py-2 text-xs font-semibold hover:bg-muted"
                >
                  {copied ? "Copied" : "Copy link"}
                </button>
                <Link
                  href={`/d/${shareToken || customSlug}`}
                  className="rounded-full border border-border px-4 py-2 text-xs font-semibold hover:bg-muted"
                >
                  Open as recipient
                </Link>
              </div>
            )}
            {!published && !publishing && (
              <button
                type="button"
                onClick={publish}
                className="inline-flex h-11 w-full items-center justify-center rounded-full bg-foreground text-sm font-semibold text-background transition-transform hover:-translate-y-0.5"
              >
                Publish deck
              </button>
            )}
          </div>
        </aside>

        {/* Main stage — walkthrough preview */}
        <section className="min-w-0">
          <div className="mb-4 flex items-center justify-between gap-4">
            <div className="text-xs text-muted-foreground">
              Ship · <span className="text-foreground">{deckTitle || "Untitled deck"}</span>
            </div>
            <div className="flex max-w-[50%] flex-wrap items-center justify-end gap-1">
              {slides.slice(0, 12).map((s, i) => (
                <div
                  key={s.n}
                  className={`h-1.5 w-4 rounded-full transition-colors sm:w-5 ${
                    i < idx ? "bg-foreground" : i === idx ? "bg-accent" : "bg-muted"
                  }`}
                />
              ))}
              {slides.length > 12 && (
                <span className="font-mono text-[10px] text-muted-foreground">
                  +{slides.length - 12}
                </span>
              )}
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl border-2 border-foreground bg-background offset-shadow-sm">
            {active && (
              <SlidePlaybackStage
                slide={active}
                slideIndex={idx}
                activeHighlights={activeHighlights}
                stageRef={stageRef}
                captionRef={captionRef}
                script={active.script}
                tokens={narration.tokens}
                speakingIdx={narration.speakingIdx}
                durationSec={slideDur || 8}
                timingSource={narration.timingSource}
              />
            )}

            {/* Transport */}
            <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-3 sm:gap-3 sm:px-5">
              <button
                type="button"
                onClick={() => {
                  narration.pause();
                  setIdx((i) => Math.max(0, i - 1));
                }}
                disabled={idx === 0}
                className="min-h-11 rounded-full border border-border px-4 py-2 text-xs font-semibold transition-colors hover:bg-muted disabled:opacity-30"
              >
                ◀ Prev
              </button>
              <button
                type="button"
                onClick={() => {
                  if (playing) narration.pause();
                  else narration.start();
                }}
                className="flex min-h-11 items-center gap-2 rounded-full bg-foreground px-5 py-2 text-xs font-semibold text-background transition-transform hover:-translate-y-0.5"
              >
                {playing ? "❚❚ Pause" : "▶ Play"}
              </button>
              <button
                type="button"
                onClick={() => {
                  narration.pause();
                  setIdx(0);
                  unlockNarrationAudioSync();
                  narration.restart();
                }}
                className="min-h-11 rounded-full border border-border px-4 py-2 text-xs font-semibold transition-colors hover:bg-muted"
              >
                ⟲ Restart
              </button>
              <button
                type="button"
                onClick={() => {
                  narration.pause();
                  setIdx((i) => Math.min(slides.length - 1, i + 1));
                }}
                disabled={idx >= slides.length - 1}
                className="min-h-11 rounded-full border border-border px-4 py-2 text-xs font-semibold transition-colors hover:bg-muted disabled:opacity-30"
              >
                Next ▶
              </button>
              <div className="flex-1" />
              <Waveform className={playing ? "text-accent" : "text-muted-foreground"} />
              <div className="font-mono text-[11px] text-muted-foreground">
                {idx + 1}/{slides.length || 1} · {fmt(currentAbs)} / {fmt(totalDur)}
                {ttsPrefetching ? ` · voice ${ttsReady}/${ttsTotal}` : ""}
                {highlights.length > 0 ? ` · ${highlights.length} hl` : ""}
              </div>
            </div>
            <div className="h-1 bg-muted">
              <div
                className="h-full bg-accent transition-all duration-100"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>
        </section>
      </div>
      )}
    </AppShell>
  );
}

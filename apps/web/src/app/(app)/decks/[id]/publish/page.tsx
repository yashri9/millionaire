"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AppShell } from "@/components/shell";
import { Button, StatusPill, StripedProgress } from "@/components/ui-kit";
import { ComingSoonBadge } from "@/components/ui-panel";
import { cacheDeck, getCachedDeck, isCloudDeckId, type DeckSlide } from "@/lib/deck-store";
import { getAllHighlights } from "@/lib/highlight-store";
import {
  forgetShare,
  getShare,
  getShareTokenForDeck,
  publishDeckSnapshot,
} from "@/lib/share-store";
import { useVoiceSettings } from "@/lib/voice-store";
import { getPreset } from "@/lib/voice-settings";
import { publicEnv } from "@/lib/env";
import { useHydrateDeck } from "@/hooks/use-hydrate-deck";
import { useDeckPlayback } from "@/hooks/use-deck-playback";
import { DeckPlayer } from "@/components/deck-flow/DeckPlayer";
import { FlowSteps } from "@/components/deck-flow/FlowSteps";
import { fmt, getRehearsedRevision, slidesMissingNarration } from "@/lib/deck-runtime";

type CheckState = "ok" | "block" | "suggest";
type Check = { id: string; state: CheckState; label: string; hint?: string; action?: ReactNode };

type LiveShare = { token: string; revision: number; publishedAt: number };

const PUBLISH_STEPS = ["Saving your latest narration", "Locking in this version", "Creating your link"];

function timeAgo(ts: number) {
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  return `${Math.round(h / 24)} d ago`;
}

export default function PublishPage() {
  const params = useParams();
  const id = String(params.id ?? "");
  const [deckTitle, setDeckTitle] = useState("Untitled deck");
  const [slides, setSlides] = useState<DeckSlide[]>([]);
  const [revision, setRevision] = useState(0);
  const [live, setLive] = useState<LiveShare | null>(null);
  const [justPublished, setJustPublished] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [step, setStep] = useState(0);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [confirmUnpublish, setConfirmUnpublish] = useState(false);
  const [unpublishing, setUnpublishing] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [rehearsedRev, setRehearsedRev] = useState<number | null>(null);
  const [canNativeShare, setCanNativeShare] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const coverInputRef = useRef<HTMLInputElement>(null);
  const voice = useVoiceSettings();

  const { state: hydrateState, reload } = useHydrateDeck(id);

  useEffect(() => {
    setCanNativeShare(typeof navigator !== "undefined" && typeof navigator.share === "function");
  }, []);

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
    setDeckTitle(hydrateState.deck.title || "Untitled deck");
    setSlides(hydrateState.deck.slides);
    setRevision(hydrateState.deck.revision ?? 0);
    setLoadError(null);
    setHydrated(true);
    setRehearsedRev(getRehearsedRevision(id));
    // Returning to this page after publishing: show the live link, not "Not shipped".
    const token = getShareTokenForDeck(id);
    const share = token ? getShare(token) : null;
    setLive(
      token
        ? { token, revision: share?.revision ?? 0, publishedAt: share?.publishedAt ?? Date.now() }
        : null,
    );
  }, [hydrateState, id]);

  const p = useDeckPlayback({ deckId: id, slides });

  const isDraft = !isCloudDeckId(id);
  const missing = useMemo(() => slidesMissingNarration(slides), [slides]);
  const voiceName = getPreset(voice.voiceId).name;
  const hasCover = Boolean(slides[0]?.thumbnail);
  const rehearsedLatest = rehearsedRev != null && rehearsedRev >= revision;
  const outdated = live != null && live.revision < revision;
  const shareUrl = live ? `${publicEnv.appUrl}/d/${live.token}` : "";
  const shareHost = publicEnv.appUrl.replace(/^https?:\/\//, "");

  const checks: Check[] = [
    isDraft
      ? {
          id: "cloud",
          state: "block",
          label: "Not uploaded yet",
          hint: "Upload it from your decks to get a link.",
          action: <ActionLink href="/dashboard">Upload</ActionLink>,
        }
      : { id: "cloud", state: "ok", label: "Saved to your account" },
    missing.length === 0
      ? { id: "narr", state: "ok", label: `All ${slides.length} slides narrated` }
      : {
          id: "narr",
          state: "block",
          label:
            missing.length === 1
              ? `Slide ${missing[0]!.n} has no narration`
              : `${missing.length} slides have no narration`,
          hint: missing.length > 1 ? `Slides ${missing.map((s) => s.n).join(", ")}` : undefined,
          action: <ActionLink href={`/decks/${id}/edit?slide=${missing[0]!.n}`}>Fix</ActionLink>,
        },
    rehearsedLatest
      ? { id: "rehearse", state: "ok", label: "Watched end to end" }
      : {
          id: "rehearse",
          state: "suggest",
          label: rehearsedRev == null ? "Watch it once (optional)" : "Watch it again (optional)",
          hint: rehearsedRev == null ? "Catches awkward lines before viewers do." : "You edited since your last run-through.",
          action: <ActionLink href={`/decks/${id}/preview`}>Rehearse</ActionLink>,
        },
  ];
  const blockers = checks.filter((c) => c.state === "block");

  function onCoverFile(file: File | undefined) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || "");
      if (!dataUrl) return;
      const deck = getCachedDeck(id);
      if (!deck || deck.slides.length === 0) return;
      const nextSlides = deck.slides.map((s, i) => (i === 0 ? { ...s, thumbnail: dataUrl } : s));
      const nextRevision = (deck.revision ?? 0) + 1;
      cacheDeck({ ...deck, slides: nextSlides, revision: nextRevision });
      setSlides(nextSlides);
      setRevision(nextRevision);
    };
    reader.readAsDataURL(file);
  }

  function validateHighlights(deckSlides: DeckSlide[]): string | null {
    const highlightsMap = getAllHighlights(id);
    for (const [slideKey, list] of Object.entries(highlightsMap)) {
      if (!deckSlides.some((s) => s.n === slideKey)) {
        return `A highlight points at slide ${slideKey}, which no longer exists. Remove it in the editor.`;
      }
      for (const h of list) {
        if (h.kind === "region") {
          const { x, y, w, h: hh } = h.bbox;
          if (w <= 0 || hh <= 0 || x < 0 || y < 0 || x + w > 100.5 || y + hh > 100.5) {
            return `A highlight on slide ${slideKey} is outside the slide. Redraw it in the editor.`;
          }
        }
        if (typeof h.triggerWordIndex !== "number") {
          return `A highlight on slide ${slideKey} has no start word. Pick one in the editor.`;
        }
      }
    }
    return null;
  }

  function publish() {
    setPublishError(null);
    const deck = getCachedDeck(id);
    if (!deck) {
      setPublishError("Couldn't find this deck on this device. Open it in the editor once, then try again.");
      return;
    }
    if (blockers.length > 0) return;
    const geometryError = validateHighlights(deck.slides);
    if (geometryError) {
      setPublishError(geometryError);
      return;
    }
    const highlightsMap = getAllHighlights(id);

    setPublishing(true);
    setStep(0);
    p.pause();
    void (async () => {
      try {
        const remote = await fetch(`/api/decks/${id}`);
        if (!remote.ok) {
          // Never fall back to a device-only "link": recipients would get a 404.
          throw new Error(
            remote.status === 401
              ? "Your session expired. Sign in again, then publish."
              : "Couldn't reach Voxdeck. Nothing was published. Check your connection and try again.",
          );
        }
        const payload = (await remote.json()) as {
          slides?: { id: string; order_index: number }[];
        };
        const narrationRows = (payload.slides ?? []).map((s) => {
          const local = slides.find((x) => Number(x.n) === s.order_index);
          return { slide_id: s.id, text: local?.script ?? "" };
        });
        if (narrationRows.length > 0) {
          const patch = await fetch(`/api/decks/${id}/script`, {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ narration: narrationRows }),
          });
          if (!patch.ok) {
            throw new Error("Couldn't save your latest script, so nothing was published. Try again.");
          }
        }
        setStep(1);
        const pub = await fetch(`/api/decks/${id}/publish`, { method: "POST" });
        const data = (await pub.json().catch(() => ({}))) as { token?: string; error?: string };
        if (!pub.ok || !data.token) {
          throw new Error(data.error || "Something went wrong. Nothing was published. Try again.");
        }
        setStep(2);
        const share = publishDeckSnapshot({
          deck: { ...deck, highlights: highlightsMap },
          highlights: highlightsMap,
          token: data.token,
        });
        setLive({ token: share.token, revision: share.revision, publishedAt: share.publishedAt });
        setJustPublished(true);
      } catch (e) {
        setPublishError(e instanceof Error ? e.message : "Something went wrong. Try again.");
      } finally {
        setPublishing(false);
      }
    })();
  }

  async function unpublish() {
    if (!live) return;
    setUnpublishing(true);
    setPublishError(null);
    try {
      const res = await fetch(`/api/shares/${live.token}/revoke`, { method: "POST" });
      if (!res.ok && res.status !== 404) {
        throw new Error("Couldn't turn off the link. It's still live. Try again.");
      }
      forgetShare(id);
      setLive(null);
      setJustPublished(false);
      setConfirmUnpublish(false);
    } catch (e) {
      setPublishError(e instanceof Error ? e.message : "Couldn't turn off the link.");
    } finally {
      setUnpublishing(false);
    }
  }

  function copyLink() {
    if (!shareUrl) return;
    void (async () => {
      try {
        await navigator.clipboard?.writeText(shareUrl);
      } catch {
        const ta = document.createElement("textarea");
        ta.value = shareUrl;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        ta.remove();
      }
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    })();
  }

  const shareText = `${deckTitle} - a ${fmt(p.totalDur)} narrated walkthrough`;
  const enc = encodeURIComponent;

  if (!hydrated || hydrateState.status === "loading") {
    return (
      <AppShell variant="app">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
          <div className="h-8 w-64 animate-pulse rounded-full bg-muted" />
          <div className="mt-6 h-72 w-full max-w-md animate-pulse rounded-2xl bg-muted" />
        </div>
      </AppShell>
    );
  }

  if (loadError) {
    return (
      <AppShell variant="app">
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
      </AppShell>
    );
  }

  const primaryLabel = live ? (outdated ? "Update live link" : "Republish") : "Publish link";

  return (
    <AppShell variant="app">
      <div className="mx-auto max-w-7xl px-4 pb-28 pt-4 sm:px-6 sm:pt-6 lg:pb-10">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <FlowSteps
            deckId={id}
            current="publish"
            done={[...(rehearsedLatest ? (["rehearse"] as const) : []), ...(live ? (["publish"] as const) : [])]}
          />
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {live ? (
              <StatusPill status="live" label={outdated ? "Live · has unpublished edits" : "Live"} />
            ) : (
              <StatusPill status="draft" label="Not published" />
            )}
          </div>
        </div>
        <div className="mt-4">
          <h1 className="font-display text-2xl font-bold leading-tight tracking-tight sm:text-3xl">
            {live && justPublished ? "Your deck is live." : deckTitle}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {live
              ? "Share the link anywhere. See who watched under Views."
              : "Get a link anyone can open. No sign-up needed."}
          </p>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-8">
          {/* Panel (first on phones: this is the job of the page) */}
          <aside className="min-w-0 space-y-4 lg:order-2 lg:sticky lg:top-24 lg:self-start">
            {live && (
              <section className="rounded-2xl border-2 border-foreground bg-background p-4 offset-shadow-sm">
                <div className="flex items-center justify-between gap-2">
                  <div className="eyebrow">Your link</div>
                  <span className="text-[11px] text-muted-foreground">
                    v{live.revision} · {timeAgo(live.publishedAt)}
                  </span>
                </div>
                <div className="mt-2 flex items-stretch overflow-hidden rounded-xl border border-border">
                  <input
                    readOnly
                    value={shareUrl}
                    onFocus={(e) => e.currentTarget.select()}
                    aria-label="Shareable link"
                    className="min-w-0 flex-1 bg-muted/40 px-3 py-2 font-mono text-xs text-foreground focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={copyLink}
                    className="shrink-0 bg-foreground px-4 text-xs font-semibold text-background hover:opacity-90"
                  >
                    {copied ? "Copied ✓" : "Copy"}
                  </button>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-2">
                  {canNativeShare ? (
                    <ShareBtn
                      onClick={() => void navigator.share({ title: deckTitle, text: shareText, url: shareUrl }).catch(() => undefined)}
                    >
                      Share…
                    </ShareBtn>
                  ) : null}
                  <ShareBtn href={`https://wa.me/?text=${enc(`${shareText}: ${shareUrl}`)}`}>WhatsApp</ShareBtn>
                  <ShareBtn href={`mailto:?subject=${enc(deckTitle)}&body=${enc(`${shareText}:\n${shareUrl}`)}`}>Email</ShareBtn>
                  <ShareBtn href={`https://www.linkedin.com/sharing/share-offsite/?url=${enc(shareUrl)}`}>LinkedIn</ShareBtn>
                  <ShareBtn href={`/d/${live.token}`}>Open as viewer ↗</ShareBtn>
                </div>
                {outdated && (
                  <div className="mt-3 rounded-lg border border-warn/60 bg-warn/10 px-3 py-2 text-xs">
                    You&apos;ve edited since publishing. Viewers still see v{live.revision}. Update to push v{revision} to the same link.
                    <button
                      type="button"
                      onClick={publish}
                      disabled={publishing || blockers.length > 0}
                      className="mt-2 block font-semibold underline underline-offset-2 disabled:opacity-40"
                    >
                      {publishing ? "Updating…" : "Update now"}
                    </button>
                  </div>
                )}
                <div className="mt-3 flex items-center justify-between text-xs">
                  <Link href={`/decks/${id}/analytics`} className="font-semibold underline underline-offset-2">
                    See who watched →
                  </Link>
                  {confirmUnpublish ? (
                    <span className="flex items-center gap-2">
                      <span className="text-muted-foreground">Turn off link?</span>
                      <button
                        type="button"
                        onClick={() => void unpublish()}
                        disabled={unpublishing}
                        className="font-semibold text-red-700 disabled:opacity-40"
                      >
                        {unpublishing ? "Turning off…" : "Yes, unpublish"}
                      </button>
                      <button type="button" onClick={() => setConfirmUnpublish(false)} className="text-muted-foreground">
                        Cancel
                      </button>
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmUnpublish(true)}
                      className="text-muted-foreground hover:text-red-700"
                    >
                      Unpublish
                    </button>
                  )}
                </div>
              </section>
            )}

            <section className="rounded-2xl border border-border bg-background p-4">
              <div className="flex items-center justify-between">
                <div className="eyebrow">Before you send</div>
                {blockers.length === 0 ? <StatusPill status="live" label="Ready" /> : null}
              </div>
              <ul className="mt-3 space-y-2">
                {checks.map((c) => (
                  <li key={c.id} className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-start gap-2">
                      <CheckDot state={c.state} />
                      <div className="min-w-0">
                        <div className="text-sm font-medium leading-snug">{c.label}</div>
                        {c.hint && <div className="mt-0.5 text-[11px] text-muted-foreground">{c.hint}</div>}
                      </div>
                    </div>
                    {c.action}
                  </li>
                ))}
              </ul>
              <dl className="mt-4 grid grid-cols-3 gap-2 border-t border-border pt-3 text-xs">
                <Fact k="Runtime" v={fmt(p.totalDur)} />
                <Fact k="Slides" v={String(slides.length)} />
                <Fact
                  k="Voice"
                  v={voiceName}
                  action={<Link href={`/decks/${id}/edit`} className="underline underline-offset-2">Change</Link>}
                />
              </dl>
            </section>

            <section className="rounded-2xl border border-border bg-background">
              <button
                type="button"
                onClick={() => setShowSettings((v) => !v)}
                aria-expanded={showSettings}
                className="flex w-full items-center justify-between px-4 py-3 text-left"
              >
                <span>
                  <span className="eyebrow block">Link settings</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    Anyone with the link · no expiry · cover image
                  </span>
                </span>
                <span aria-hidden className="text-xs">{showSettings ? "▲" : "▼"}</span>
              </button>
              {showSettings && (
                <div className="space-y-4 border-t border-border px-4 pb-4 pt-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="aspect-[16/9] w-12 shrink-0 overflow-hidden rounded border border-border bg-muted">
                    {hasCover && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={slides[0]!.thumbnail} alt="" className="h-full w-full object-cover" />
                    )}
                  </span>
                  <div className="min-w-0">
                    <div className="text-sm font-medium">Cover image</div>
                    <div className="text-[11px] text-muted-foreground">Shown before the deck plays</div>
                  </div>
                </div>
                <Button size="sm" variant="ghost" onClick={() => coverInputRef.current?.click()}>
                  {hasCover ? "Change" : "Add"}
                </Button>
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
                  <div>
                    <div className="eyebrow mb-2">Who can open</div>
                    <SettingRow title="Anyone with the link" sub="No sign-up needed" on />
                    <SettingRow title="Email-gated" sub="Viewer enters email to play" soon />
                    <SettingRow title="Password" sub="Share the code separately" soon />
                  </div>
                  <div>
                    <div className="eyebrow mb-2">Expires</div>
                    <SettingRow title="Never" sub="Turn it off any time with Unpublish" on />
                    <SettingRow title="After 7 or 30 days" sub="Auto-expiring links" soon />
                  </div>
                  <div>
                    <div className="eyebrow mb-2">Link & tracking</div>
                    <SettingRow title={`Custom link name (${shareHost}/d/your-name)`} sub="Pick a link people can read" soon />
                    <SettingRow title="Capture viewer email" sub="Ask viewers who they are" soon />
                    <SettingRow title="Per-slide watch time" sub="See where viewers drop off" soon />
                    <SettingRow title="Presenter avatar" sub="Lip-synced avatar in the shared deck" soon />
                  </div>
                </div>
              )}
            </section>

            {/* Primary action. On phones it sits in the sticky bar below. */}
            <div className="hidden space-y-2 lg:block">
              <PublishBlock
                publishing={publishing}
                step={step}
                error={publishError}
                blockers={blockers.length}
                show={!live || outdated}
                label={primaryLabel}
                onPublish={publish}
              />
            </div>
            <div className="lg:hidden">
              {(publishing || publishError) && (
                <PublishBlock
                  publishing={publishing}
                  step={step}
                  error={publishError}
                  blockers={blockers.length}
                  show={false}
                  label={primaryLabel}
                  onPublish={publish}
                />
              )}
            </div>
          </aside>

          {/* Viewer preview */}
          <section className="min-w-0 lg:order-1">
            <div className="mb-2 flex items-center justify-between gap-2 text-xs text-muted-foreground">
              <span>
                What viewers see
              </span>
            </div>
            <DeckPlayer playback={p} title={deckTitle} />
          </section>
        </div>
      </div>

      {/* Phones / iPad portrait: primary action always reachable */}
      <div
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 px-4 py-3 backdrop-blur lg:hidden"
        style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
      >
        <div className="mx-auto flex max-w-3xl items-center gap-2">
          {live && !outdated ? (
            <>
              <button
                type="button"
                onClick={copyLink}
                className="flex h-11 flex-1 items-center justify-center rounded-full bg-foreground text-sm font-semibold text-background"
              >
                {copied ? "Copied ✓" : "Copy link"}
              </button>
              {canNativeShare && (
                <button
                  type="button"
                  onClick={() => void navigator.share({ title: deckTitle, text: shareText, url: shareUrl }).catch(() => undefined)}
                  className="flex h-11 items-center justify-center rounded-full border border-border px-5 text-sm font-semibold"
                >
                  Share
                </button>
              )}
            </>
          ) : (
            <button
              type="button"
              onClick={publish}
              disabled={publishing || blockers.length > 0}
              className="flex h-11 flex-1 items-center justify-center rounded-full bg-foreground text-sm font-semibold text-background disabled:opacity-40"
            >
              {publishing
                ? `${PUBLISH_STEPS[step]}…`
                : blockers.length
                  ? `Fix ${blockers.length} item${blockers.length > 1 ? "s" : ""} to publish`
                  : primaryLabel}
            </button>
          )}
        </div>
      </div>
    </AppShell>
  );
}

function PublishBlock({
  publishing,
  step,
  error,
  blockers,
  show,
  label,
  onPublish,
}: {
  publishing: boolean;
  step: number;
  error: string | null;
  blockers: number;
  show: boolean;
  label: string;
  onPublish: () => void;
}) {
  return (
    <>
      {publishing && (
        <div className="rounded-xl border border-border bg-background p-3">
          <StripedProgress value={((step + 1) / PUBLISH_STEPS.length) * 100} label="Publishing" />
          <p className="mt-2 text-xs text-muted-foreground">{PUBLISH_STEPS[step]}…</p>
        </div>
      )}
      {error && !publishing && (
        <div className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-800">
          {error}
          <span className="mt-1 block text-muted-foreground">Your edits are safe in the editor.</span>
          {!show && (
            <button type="button" onClick={onPublish} className="mt-2 font-semibold underline underline-offset-2">
              Retry
            </button>
          )}
        </div>
      )}
      {show && !publishing && (
        <>
          <button
            type="button"
            onClick={onPublish}
            disabled={blockers > 0}
            className="inline-flex h-12 w-full items-center justify-center rounded-full bg-foreground text-sm font-semibold text-background transition-transform hover:-translate-y-0.5 disabled:translate-y-0 disabled:opacity-40"
          >
            {label}
          </button>
          {blockers > 0 && (
            <p className="text-center text-[11px] text-muted-foreground">
              Fix {blockers} item{blockers > 1 ? "s" : ""} above to publish.
            </p>
          )}
        </>
      )}
    </>
  );
}

function CheckDot({ state }: { state: CheckState }) {
  const cls =
    state === "ok" ? "bg-live text-foreground" : state === "block" ? "bg-red-500 text-white" : "bg-warn text-foreground";
  return (
    <span
      aria-label={state === "ok" ? "Done" : state === "block" ? "Must fix" : "Suggested"}
      className={`mt-0.5 flex h-4 w-4 flex-none items-center justify-center rounded-full text-[9px] font-bold ${cls}`}
    >
      {state === "ok" ? "✓" : "!"}
    </span>
  );
}

function ActionLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="shrink-0 rounded-full border border-border px-3 py-1 text-xs font-semibold hover:bg-muted"
    >
      {children}
    </Link>
  );
}

function Fact({ k, v, action }: { k: string; v: string; action?: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="eyebrow">{k}</dt>
      <dd className="mt-0.5 truncate font-semibold" title={v}>
        {v}
      </dd>
      {action && <dd className="text-[11px] text-muted-foreground">{action}</dd>}
    </div>
  );
}

function ShareBtn({ href, onClick, children }: { href?: string; onClick?: () => void; children: ReactNode }) {
  const cls =
    "flex h-10 items-center justify-center rounded-full border border-border px-3 text-xs font-semibold hover:bg-muted";
  if (href) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={cls}>
        {children}
      </a>
    );
  }
  return (
    <button type="button" onClick={onClick} className={cls}>
      {children}
    </button>
  );
}

function SettingRow({ title, sub, on, soon }: { title: string; sub: string; on?: boolean; soon?: boolean }) {
  return (
    <div className={`flex items-center justify-between gap-2 rounded-md px-2 py-1.5 ${on ? "bg-muted" : ""}`}>
      <div className={`min-w-0 ${soon ? "opacity-60" : ""}`}>
        <div className="text-xs font-semibold">{title}</div>
        <div className="text-[11px] text-muted-foreground">{sub}</div>
      </div>
      {on ? <span className="text-xs font-semibold">✓</span> : soon ? <ComingSoonBadge /> : null}
    </div>
  );
}

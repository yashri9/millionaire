"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Button, OffsetButton, StatusPill } from "@/components/ui-kit";
import {
  deleteCloudDeck,
  listLocalDrafts,
  promoteLocalDraft,
  removeCachedDeck,
  type DeckIndexEntry,
} from "@/lib/deck-store";

type CloudDeck = {
  id: string;
  title: string;
  createdAt: number;
  count: number;
  status?: string;
  /** 0-based index of the slide the owner last had open in the editor. */
  lastSlide?: number;
};

function formatRelative(ts: number): string {
  const mins = Math.round((Date.now() - ts) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/**
 * Map the DB status to what the owner can actually do with the deck.
 * Before, every row showed Open / Preview / Delete even when the deck was
 * still uploading or had failed to parse (both led to an empty editor).
 */
function deckState(d: CloudDeck): "processing" | "failed" | "draft" | "live" {
  if (d.status === "uploading") return "processing";
  if (d.status === "parse_failed") return "failed";
  if (d.status === "published") return "live";
  return "draft";
}

const slideParam = (i: number) => String(i + 1).padStart(2, "0");

export function DashboardClient({
  initialDecks,
  initialError,
}: {
  initialDecks: CloudDeck[];
  initialError: string | null;
}) {
  const router = useRouter();
  const [decks, setDecks] = useState(initialDecks);
  const [drafts, setDrafts] = useState<DeckIndexEntry[]>([]);
  const [listError, setListError] = useState(initialError);
  const [promotingId, setPromotingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  /** Inline two-step delete (replaces window.confirm, which sat one tap from "Preview"). */
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [rowError, setRowError] = useState<{ id: string; message: string } | null>(null);

  useEffect(() => setDecks(initialDecks), [initialDecks]);
  useEffect(() => setListError(initialError), [initialError]);

  useEffect(() => {
    setDrafts(listLocalDrafts());
    const onChange = () => setDrafts(listLocalDrafts());
    window.addEventListener("voxdeck:decks", onChange);
    return () => window.removeEventListener("voxdeck:decks", onChange);
  }, []);

  const refresh = useCallback(() => {
    router.refresh();
    setDrafts(listLocalDrafts());
  }, [router]);

  async function onDeleteCloud(d: CloudDeck) {
    setConfirmId(null);
    setDeletingId(d.id);
    setRowError(null);
    const result = await deleteCloudDeck(d.id);
    setDeletingId(null);
    if (!result.ok) {
      setRowError({ id: d.id, message: result.error || "Couldn't delete deck. Try again." });
      return;
    }
    setDecks((prev) => prev.filter((x) => x.id !== d.id));
    router.refresh();
  }

  async function onPromoteDraft(d: DeckIndexEntry) {
    setPromotingId(d.id);
    setRowError(null);
    const result = await promoteLocalDraft(d.id);
    setPromotingId(null);
    if (!result.ok) {
      setRowError({ id: d.id, message: result.error || "Couldn't upload this device draft. Try again." });
      return;
    }
    setDrafts(listLocalDrafts());
    router.refresh();
    router.push(`/decks/${result.deck.id}/edit`);
  }

  function onDiscardDraft(d: DeckIndexEntry) {
    setConfirmId(null);
    removeCachedDeck(d.id);
    setDrafts(listLocalDrafts());
  }


  function ConfirmDelete({ onYes, what }: { onYes: () => void; what: string }) {
    return (
      <div role="alert" className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-semibold">{what}</span>
        <Button size="sm" variant="secondary" onClick={onYes} className="border-danger text-danger">
          Yes, delete
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setConfirmId(null)}>
          Cancel
        </Button>
      </div>
    );
  }

  return (
    <>
      {listError ? (
        <div role="alert" className="mb-8 rounded-2xl border border-danger/40 bg-danger/10 p-5">
          <p className="font-semibold">{listError}</p>
          <button type="button" className="mt-3 text-sm font-semibold underline" onClick={() => refresh()}>
            Retry
          </button>
        </div>
      ) : null}

      {/* Device drafts exist only in this browser — clearing site data loses them.
          They used to sit below every cloud deck, often below the fold. */}
      {drafts.length > 0 ? (
        <section aria-labelledby="drafts-h" className="mb-8 rounded-2xl border border-warn/50 bg-warn/5 p-4 sm:p-6">
          <h2 id="drafts-h" className="font-display text-xl font-bold tracking-tight">
            Only on this browser
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Upload to keep {drafts.length === 1 ? "it" : "them"} safe and get a share link.
          </p>
          <ul className="mt-4 divide-y divide-border overflow-hidden rounded-xl border border-border bg-background">
            {drafts.map((d) => (
              <li key={d.id} className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="truncate font-semibold">{d.title}</div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    {d.count} slides · {formatRelative(d.createdAt)}
                  </div>
                  {rowError?.id === d.id ? (
                    <p role="alert" className="mt-1 text-xs text-danger">{rowError.message}</p>
                  ) : null}
                </div>
                {confirmId === d.id ? (
                  <ConfirmDelete what="Discard this draft? It can't be undone." onYes={() => onDiscardDraft(d)} />
                ) : (
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={promotingId === d.id}
                      onClick={() => void onPromoteDraft(d)}
                    >
                      {promotingId === d.id ? "Uploading…" : "Upload"}
                    </Button>
                    <Link href={`/decks/${d.id}/edit`}>
                      <Button size="sm" variant="ghost">Edit</Button>
                    </Link>
                    <Button size="sm" variant="ghost" onClick={() => setConfirmId(d.id)}>
                      Discard
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>
      ) : null}


      {decks.length === 0 && !listError ? (
        <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-dashed border-border px-6 py-16 text-center sm:py-20">
          <p className="font-display text-2xl font-bold tracking-tight">No decks yet.</p>
          <p className="max-w-md text-sm text-muted-foreground">
            Upload a PDF. We write a voice-over for every slide, and you share it as one link.
          </p>
          <Link href="/decks/new">
            <OffsetButton>Upload your first deck</OffsetButton>
          </Link>
        </div>
      ) : decks.length > 0 ? (
        <>
          <ul className="overflow-hidden rounded-2xl border border-border">
            {decks.map((d) => {
              const st = deckState(d);
              const resume = (d.lastSlide ?? 0) > 0 && (d.lastSlide ?? 0) < d.count;
              const editHref = `/decks/${d.id}/edit${resume ? `?slide=${slideParam(d.lastSlide!)}` : ""}`;
              return (
                <li
                  key={d.id}
                  className="group flex flex-col gap-3 border-b border-border px-4 py-4 last:border-b-0 hover:bg-muted/50 sm:px-6 md:grid md:grid-cols-[1fr_auto] md:items-center md:gap-4 md:py-5"
                >
                  <div className="min-w-0">
                    <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 md:flex-nowrap">
                      {st === "draft" || st === "live" ? (
                        <Link
                          href={editHref}
                          className="line-clamp-2 font-display text-base font-semibold tracking-tight hover:underline sm:text-lg md:truncate"
                        >
                          {d.title}
                        </Link>
                      ) : (
                        <span className="line-clamp-2 font-display text-base font-semibold tracking-tight sm:text-lg md:truncate">
                          {d.title}
                        </span>
                      )}
                      <span className="shrink-0">
                        {st === "live" ? (
                          <StatusPill status="live" />
                        ) : st === "processing" ? (
                          <StatusPill status="processing" />
                        ) : st === "failed" ? (
                          <StatusPill status="failed" label="Couldn't read PDF" />
                        ) : (
                          <StatusPill status="draft" />
                        )}
                      </span>
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {st === "processing"
                        ? `Uploaded ${formatRelative(d.createdAt)} · writing scripts…`
                        : st === "failed"
                          ? `Uploaded ${formatRelative(d.createdAt)} · try exporting the PDF again`
                          : `${d.count} slides · updated ${formatRelative(d.createdAt)}${
                              resume ? ` · last on slide ${d.lastSlide! + 1}` : ""
                            }`}
                    </div>
                    {rowError?.id === d.id ? (
                      <p role="alert" className="mt-1 text-xs text-danger">{rowError.message}</p>
                    ) : null}
                  </div>

                  {confirmId === d.id ? (
                    <ConfirmDelete
                      what={st === "live" ? "Delete? The live link will stop working." : "Delete this deck?"}
                      onYes={() => void onDeleteCloud(d)}
                    />
                  ) : (
                    <div className="flex flex-wrap items-center gap-1 sm:gap-2 md:justify-end">
                      {st === "draft" || st === "live" ? (
                        <>
                          <Link href={editHref}>
                            <Button size="sm" variant="secondary">
                              {resume ? "Resume" : "Edit"}
                            </Button>
                          </Link>
                          <Link href={`/decks/${d.id}/preview`}>
                            <Button size="sm" variant="ghost">Rehearse</Button>
                          </Link>
                          <Link href={`/decks/${d.id}/publish`}>
                            <Button size="sm" variant="ghost">
                              {st === "live" ? "Share link" : "Publish"}
                            </Button>
                          </Link>
                          {st === "live" ? (
                            <Link href={`/decks/${d.id}/analytics`}>
                              <Button size="sm" variant="ghost">Views</Button>
                            </Link>
                          ) : null}
                        </>
                      ) : st === "processing" ? (
                        <Button size="sm" variant="secondary" onClick={refresh}>
                          Check again
                        </Button>
                      ) : (
                        <Link href="/decks/new">
                          <Button size="sm" variant="secondary">Upload again</Button>
                        </Link>
                      )}
                      {/* Separated from the everyday actions so it isn't hit by accident. */}
                      <span aria-hidden className="mx-1 hidden h-5 w-px bg-border sm:inline-block" />
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={deletingId === d.id}
                        onClick={() => setConfirmId(d.id)}
                        aria-label={`Delete ${d.title}`}
                        className="ml-auto text-muted-foreground hover:text-danger md:ml-0"
                      >
                        {deletingId === d.id ? "Deleting…" : "Delete"}
                      </Button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      ) : null}
    </>
  );
}

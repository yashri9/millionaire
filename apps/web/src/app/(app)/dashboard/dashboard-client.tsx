"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Button, OffsetButton } from "@/components/ui-kit";
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
    if (!confirm(`Delete "${d.title}"?`)) return;
    setDeletingId(d.id);
    const result = await deleteCloudDeck(d.id);
    setDeletingId(null);
    if (!result.ok) {
      alert(result.error || "Couldn't delete deck.");
      return;
    }
    setDecks((prev) => prev.filter((x) => x.id !== d.id));
    router.refresh();
  }

  async function onPromoteDraft(d: DeckIndexEntry) {
    setPromotingId(d.id);
    const result = await promoteLocalDraft(d.id);
    setPromotingId(null);
    if (!result.ok) {
      alert(result.error || "Couldn't upload this device draft.");
      return;
    }
    setDrafts(listLocalDrafts());
    router.refresh();
    router.push(`/decks/${result.deck.id}/edit`);
  }

  function onDiscardDraft(d: DeckIndexEntry) {
    if (!confirm(`Discard device draft "${d.title}"? This cannot be undone.`)) return;
    removeCachedDeck(d.id);
    setDrafts(listLocalDrafts());
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

      {decks.length > 0 ? (
        <div className="mb-8 grid grid-cols-3 gap-px overflow-hidden rounded-2xl border border-border bg-border text-sm md:mb-12">
          {[
            { l: "Total decks", v: String(decks.length) },
            { l: "Slides", v: String(decks.reduce((n, d) => n + d.count, 0)) },
            { l: "Storage", v: "Workspace" },
          ].map((s) => (
            <div key={s.l} className="bg-background p-4 sm:p-6">
              <div className="eyebrow mb-3">{s.l}</div>
              <div className="font-display text-3xl font-bold tracking-tighter sm:text-4xl">{s.v}</div>
            </div>
          ))}
        </div>
      ) : null}

      {decks.length === 0 && !listError ? (
        <div className="flex flex-col items-center justify-center gap-5 rounded-2xl border border-dashed border-border px-6 py-20 text-center">
          <p className="font-display text-2xl font-bold tracking-tight">No decks yet.</p>
          <Link href="/decks/new">
            <OffsetButton>Upload your first deck</OffsetButton>
          </Link>
        </div>
      ) : decks.length > 0 ? (
        <div className="overflow-hidden rounded-2xl border border-border">
          {decks.map((d, i) => (
            <div
              key={d.id}
              className="group flex flex-col gap-3 border-b border-border px-4 py-4 last:border-b-0 hover:bg-muted/50 sm:px-6 md:grid md:grid-cols-[40px_1fr_140px_180px] md:items-center md:gap-4 md:py-5"
            >
              <span className="hidden font-mono text-xs text-muted-foreground md:inline">
                {String(i + 1).padStart(2, "0")}
              </span>
              <div className="min-w-0">
                <div className="truncate font-display text-base font-semibold tracking-tight sm:text-lg">
                  {d.title}
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {d.count} slides · updated {formatRelative(d.createdAt)}
                </div>
              </div>
              <div className="font-mono text-xs text-muted-foreground">{d.count}</div>
              <div className="ml-auto flex items-center justify-end gap-2 md:ml-0">
                <Link href={`/decks/${d.id}/edit`}>
                  <Button size="sm" variant="secondary">Open</Button>
                </Link>
                <Link href={`/decks/${d.id}/preview`}>
                  <Button size="sm" variant="ghost">Preview</Button>
                </Link>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={deletingId === d.id}
                  onClick={() => void onDeleteCloud(d)}
                >
                  {deletingId === d.id ? "…" : "Delete"}
                </Button>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {drafts.length > 0 ? (
        <div className="mt-12">
          <div className="mb-4">
            <h2 className="font-display text-2xl font-bold tracking-tight">Device drafts</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              These decks haven&apos;t been uploaded yet. They only exist on this browser.
            </p>
          </div>
          <div className="overflow-hidden rounded-2xl border border-dashed border-border">
            {drafts.map((d) => (
              <div
                key={d.id}
                className="flex flex-col gap-3 border-b border-border px-4 py-4 last:border-b-0 sm:flex-row sm:items-center sm:justify-between sm:px-6"
              >
                <div className="min-w-0">
                  <div className="truncate font-semibold">{d.title}</div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    Not synced · {d.count} slides · {formatRelative(d.createdAt)}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={promotingId === d.id}
                    onClick={() => void onPromoteDraft(d)}
                  >
                    {promotingId === d.id ? "Uploading…" : "Upload to Voxdeck"}
                  </Button>
                  <Link href={`/decks/${d.id}/edit`}>
                    <Button size="sm" variant="ghost">Open draft</Button>
                  </Link>
                  <Button size="sm" variant="ghost" onClick={() => onDiscardDraft(d)}>
                    Discard
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </>
  );
}

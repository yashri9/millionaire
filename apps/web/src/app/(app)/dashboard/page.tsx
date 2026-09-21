"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AppShell } from "@/components/shell";
import { Button, OffsetButton } from "@/components/ui-kit";
import {
  deleteDeck,
  listDecks,
  type DeckIndexEntry,
} from "@/lib/deck-store";

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

export default function DashboardPage() {
  const [decks, setDecks] = useState<DeckIndexEntry[]>([]);
  const [loaded, setLoaded] = useState(false);

  const refresh = useCallback(() => {
    setDecks(listDecks());
    setLoaded(true);
  }, []);

  useEffect(() => {
    refresh();
    const onChange = () => refresh();
    window.addEventListener("voxdeck:decks", onChange);
    window.addEventListener("storage", onChange);
    return () => {
      window.removeEventListener("voxdeck:decks", onChange);
      window.removeEventListener("storage", onChange);
    };
  }, [refresh]);

  return (
    <AppShell variant="app">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 md:py-12">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-6 md:mb-12">
          <div>
            <h1 className="font-display text-4xl font-bold tracking-tighter sm:text-5xl">Your decks.</h1>
            {loaded && decks.length > 0 ? (
              <p className="mt-2 text-muted-foreground">
                {decks.length} deck{decks.length === 1 ? "" : "s"} ·{" "}
                {decks.reduce((n, d) => n + d.count, 0)} slides
              </p>
            ) : null}
          </div>
          <Link href="/decks/new">
            <OffsetButton>+ New deck</OffsetButton>
          </Link>
        </div>

        {loaded && decks.length > 0 ? (
          <div className="mb-8 grid grid-cols-3 gap-px overflow-hidden rounded-2xl border border-border bg-border text-sm md:mb-12">
            {[
              { l: "Total decks", v: String(decks.length) },
              { l: "Slides", v: String(decks.reduce((n, d) => n + d.count, 0)) },
              { l: "Storage", v: "Browser" },
            ].map((s) => (
              <div key={s.l} className="bg-background p-4 sm:p-6">
                <div className="eyebrow mb-3">{s.l}</div>
                <div className="font-display text-3xl font-bold tracking-tighter sm:text-4xl">{s.v}</div>
              </div>
            ))}
          </div>
        ) : null}

        {!loaded ? null : decks.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-5 rounded-2xl border border-dashed border-border px-6 py-20 text-center">
            <p className="font-display text-2xl font-bold tracking-tight">No decks yet.</p>
            <Link href="/decks/new">
              <OffsetButton>Upload your first deck</OffsetButton>
            </Link>
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-border">
            <div className="hidden grid-cols-[40px_1fr_140px_180px] gap-4 border-b border-border bg-muted px-6 py-3 text-[10px] font-mono font-medium uppercase tracking-widest text-muted-foreground md:grid">
              <span>#</span>
              <span>Deck</span>
              <span>Slides</span>
              <span className="text-right">Actions</span>
            </div>
            {decks.map((d, i) => (
              <div
                key={d.id}
                className="group flex flex-col gap-3 border-b border-border px-4 py-4 transition-colors last:border-b-0 hover:bg-muted/50 sm:px-6 md:grid md:grid-cols-[40px_1fr_140px_180px] md:items-center md:gap-4 md:py-5"
              >
                <span className="hidden font-mono text-xs text-muted-foreground md:inline">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <div className="min-w-0">
                  <div className="truncate font-display text-base font-semibold tracking-tight text-foreground sm:text-lg">
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
                    onClick={() => {
                      if (confirm(`Delete "${d.title}"?`)) deleteDeck(d.id);
                    }}
                  >
                    Delete
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}

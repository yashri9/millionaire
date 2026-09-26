"use client";

import Link from "next/link";
import { use, useCallback, useEffect, useState } from "react";
import { AppShell } from "@/components/shell";
import { Button } from "@/components/ui-kit";
import { StatCard } from "@/components/analytics/StatCard";
import { SlideEngagement } from "@/components/analytics/SlideEngagement";
import { QuestionLog } from "@/components/analytics/QuestionLog";
import type { DeckAnalytics } from "@/components/analytics/analytics-types";

const POLL_MS = 15_000;

/**
 * Deck analytics (specs/decks/analytics.md, PRD §4.10): opens, completion,
 * per-slide drop-off and the question log. Polls every 15s while the tab is visible.
 */
export default function DeckAnalyticsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [data, setData] = useState<DeckAnalytics | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/decks/${id}/analytics`, { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      setData(await res.json());
      setError(null);
    } catch {
      setError("Couldn't load analytics.");
    }
  }, [id]);

  useEffect(() => {
    void load();
    const t = setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") void load();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [load]);

  const hasOpens = (data?.totalOpens ?? 0) > 0;
  const questionsCount = data?.questions.length ?? 0;

  return (
    <AppShell>
      <div className="min-h-[calc(100dvh-4.5rem)] bg-[#f7f9fc]">
        <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
          <nav aria-label="Breadcrumb" className="flex min-w-0 flex-wrap items-center gap-x-1.5 text-sm text-muted-foreground">
            <Link href="/dashboard" className="hover:text-foreground">Decks</Link>
            <span aria-hidden>/</span>
            <Link href={`/decks/${id}/edit`} className="max-w-[14rem] truncate hover:text-foreground">
              {data?.deckTitle ?? "Deck"}
            </Link>
            <span aria-hidden>/</span>
            <span aria-current="page" className="text-foreground/70">Analytics</span>
          </nav>

          <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#176bff]">Deck performance</p>
              <h1 className="mt-2 font-display text-4xl font-bold tracking-tighter sm:text-5xl">Analytics</h1>
              <p className="mt-3 max-w-md text-base text-muted-foreground">
                See where viewers stay, leave, and ask questions.
              </p>
            </div>
            <Link
              href={`/decks/${id}/publish`}
              className="inline-flex h-11 items-center gap-2 rounded-full bg-accent px-5 text-sm font-semibold text-accent-foreground transition-transform hover:-translate-y-0.5"
            >
              <span aria-hidden>↗</span> Share deck
            </Link>
          </div>

          <p className="mt-8 text-sm text-muted-foreground">All shared links · Refreshes every 15 seconds</p>

          {error && !data ? (
            <div role="alert" className="mt-3 flex flex-col items-start gap-3 rounded-2xl border border-border bg-background p-6">
              <p className="font-semibold">{error}</p>
              <p className="text-sm text-muted-foreground">Check your connection and try again.</p>
              <Button size="sm" variant="secondary" onClick={() => void load()}>Retry</Button>
            </div>
          ) : !data ? (
            <LoadingState />
          ) : (
            <>
              {error ? (
                <p role="status" className="mt-2 text-xs text-[#b4581f]">
                  Couldn&apos;t refresh just now. Showing the last numbers we loaded.
                </p>
              ) : null}

              <div className="mt-3 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
                <StatCard label="Opens" value={String(data.totalOpens)} hint="Presentation sessions" />
                <StatCard label="Completed" value={String(data.completedCount)} hint="Reached the end" />
                <StatCard
                  label="Completion rate"
                  value={hasOpens ? `${data.completionRate}%` : "—"}
                  hint={hasOpens ? `${data.completedCount} of ${data.totalOpens} opens` : "No opens yet"}
                />
                <StatCard label="Questions asked" value={String(questionsCount)} hint="Across all sessions" />
              </div>

              <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)]">
                <SlideEngagement slides={data.perSlide} hasOpens={hasOpens} />
                <QuestionLog questions={data.questions} />
              </div>
            </>
          )}
        </div>
      </div>
    </AppShell>
  );
}

function LoadingState() {
  return (
    <div aria-busy="true" aria-label="Loading analytics">
      <div className="mt-3 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-[8.5rem] animate-pulse rounded-2xl border border-border bg-background" />
        ))}
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)]">
        <div className="h-80 animate-pulse rounded-2xl border border-border bg-background" />
        <div className="h-80 animate-pulse rounded-2xl border border-border bg-background" />
      </div>
    </div>
  );
}

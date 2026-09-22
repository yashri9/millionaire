import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/shell";
import { OffsetButton } from "@/components/ui-kit";
import { getCachedUser, getCachedDeckList } from "@/lib/auth-cache";
import { DashboardClient } from "./dashboard-client";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await getCachedUser();
  if (!user) redirect("/login");

  let decks: {
    id: string;
    title: string;
    createdAt: number;
    count: number;
    status?: string;
  }[] = [];
  let listError: string | null = null;

  try {
    const rows = await getCachedDeckList(user.id);
    decks = rows.map((d) => ({
      id: d.id as string,
      title: d.title as string,
      createdAt:
        Date.parse(String(d.updated_at || d.created_at)) || Date.now(),
      count: Number(d.slide_count ?? 0),
      status: d.status as string | undefined,
    }));
  } catch {
    listError = "Couldn't load your decks. Check your connection and retry.";
  }

  return (
    <AppShell variant="app">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 md:py-12">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-6 md:mb-12">
          <div>
            <h1 className="font-display text-4xl font-bold tracking-tighter sm:text-5xl">
              Your decks.
            </h1>
            {decks.length > 0 ? (
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

        <DashboardClient initialDecks={decks} initialError={listError} />
      </div>
    </AppShell>
  );
}

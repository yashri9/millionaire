import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/shell";
import { Button, OffsetButton, StatusPill, Waveform } from "@/components/ui-kit";

export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [
      { title: "Your decks · Voxdeck" },
      { name: "description", content: "Every deck you've narrated, in one studio." },
    ],
  }),
  component: DashboardPage,
});

type Deck = {
  id: string;
  title: string;
  status: "draft" | "published" | "processing" | "failed";
  slides: number;
  duration: string;
  updated: string;
  opens?: number;
  completion?: number;
};

const decks: Deck[] = [
  { id: "01", title: "Scapia · Series B Fundraise", status: "published", slides: 14, duration: "5:20", updated: "2 hours ago", opens: 42, completion: 82 },
  { id: "02", title: "MyTrips · Product Walkthrough", status: "published", slides: 11, duration: "4:12", updated: "yesterday", opens: 18, completion: 71 },
  { id: "03", title: "Scapia · EMEA Sales Deck", status: "draft", slides: 8, duration: "—", updated: "3 days ago" },
  { id: "04", title: "Project Aura · Board Update", status: "processing", slides: 22, duration: "—", updated: "just now" },
  { id: "05", title: "Old_Investor_Deck_v0.pdf", status: "failed", slides: 0, duration: "—", updated: "1 week ago" },
];

function DashboardPage() {
  return (
    <AppShell variant="app">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 md:py-12">
        {/* Header */}
        <div className="mb-8 flex flex-wrap items-end justify-between gap-6 md:mb-12">
          <div>
            <div className="eyebrow mb-3">Studio · master log</div>
            <h1 className="font-display text-4xl font-bold tracking-tighter sm:text-5xl">Your decks.</h1>
            <p className="mt-2 text-muted-foreground">Five decks · one live signal · zero excuses.</p>
          </div>
          <Link to="/new">
            <OffsetButton>+ New deck</OffsetButton>
          </Link>
        </div>

        {/* Stat strip */}
        <div className="mb-8 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-border bg-border text-sm sm:grid-cols-4 md:mb-12">
          {[
            { l: "Total decks", v: "5" },
            { l: "Published", v: "2" },
            { l: "Opens · 7d", v: "60" },
            { l: "Avg. completion", v: "76%" },
          ].map((s) => (
            <div key={s.l} className="bg-background p-4 sm:p-6">
              <div className="eyebrow mb-3">{s.l}</div>
              <div className="font-display text-3xl font-bold tracking-tighter sm:text-4xl">{s.v}</div>
            </div>
          ))}
        </div>

        {/* Deck list */}
        <div className="overflow-hidden rounded-2xl border border-border">
          <div className="hidden grid-cols-[40px_1fr_140px_140px_180px] gap-4 border-b border-border bg-muted px-6 py-3 text-[10px] font-mono font-medium uppercase tracking-widest text-muted-foreground md:grid">
            <span>#</span>
            <span>Deck</span>
            <span>Status</span>
            <span>Engagement</span>
            <span className="text-right">Actions</span>
          </div>
          {decks.map((d, i) => (
            <div
              key={d.id}
              className="group flex flex-col gap-3 border-b border-border px-4 py-4 transition-colors last:border-b-0 hover:bg-muted/50 sm:px-6 md:grid md:grid-cols-[40px_1fr_140px_140px_180px] md:items-center md:gap-4 md:py-5"
            >
              <span className="hidden font-mono text-xs text-muted-foreground md:inline">{String(i + 1).padStart(2, "0")}</span>
              <div className="min-w-0">
                <div className="flex items-center gap-3">
                  <span className="font-mono text-[10px] text-muted-foreground md:hidden">{String(i + 1).padStart(2, "0")}</span>
                  <div className="min-w-0 font-display text-base font-semibold tracking-tight text-foreground truncate sm:text-lg">{d.title}</div>
                  {d.status === "processing" && <Waveform className="text-accent" />}
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {d.slides > 0 ? `${d.slides} slides · ${d.duration}` : "—"} · updated {d.updated}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-3 md:contents">
                <StatusPill status={d.status} />
                <div className="text-xs text-muted-foreground">
                  {d.opens != null ? (
                    <span className="font-mono">
                      <span className="text-foreground font-semibold">{d.opens}</span> opens · <span className="text-foreground font-semibold">{d.completion}%</span>
                    </span>
                  ) : (
                    <span className="opacity-40">—</span>
                  )}
                </div>
                <div className="ml-auto flex items-center justify-end gap-2 md:ml-0">
                  {d.status === "failed" ? (
                    <>
                      <Button size="sm" variant="secondary">Retry</Button>
                      <Button size="sm" variant="ghost">Delete</Button>
                    </>
                  ) : d.status === "processing" ? (
                    <Button size="sm" variant="ghost" disabled>Parsing…</Button>
                  ) : (
                    <>
                      <Link to="/deck/$id" params={{ id: d.id }}>
                        <Button size="sm" variant="secondary">Open</Button>
                      </Link>
                      {d.status === "published" && (
                        <Button size="sm">Analytics</Button>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </AppShell>
  );
}

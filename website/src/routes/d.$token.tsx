import { createFileRoute } from "@tanstack/react-router";
import { Wordmark } from "@/components/shell";
import { Button, Input, StatusPill, Waveform } from "@/components/ui-kit";

export const Route = createFileRoute("/d/$token")({
  head: () => ({
    meta: [
      { title: "A talking deck · Voxdeck" },
      { name: "description", content: "Watch a narrated deck — no login required." },
    ],
  }),
  component: ViewerPage,
});

function ViewerPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Slim recipient bar */}
      <div className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <Wordmark />
            <div className="hidden text-xs text-muted-foreground md:block">
              · shared by <span className="font-semibold text-foreground">Yash · Scapia</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <StatusPill status="live" label="Live · slide 6 of 11" />
            <Button size="sm" variant="secondary">Share</Button>
          </div>
        </div>
      </div>

      <div className="mx-auto grid max-w-6xl gap-6 px-4 py-6 sm:px-6 sm:py-8 lg:grid-cols-[1fr_320px]">
        {/* Stage */}
        <section>
          {/* Chapter markers */}
          <div className="mb-4 flex items-center gap-1">
            {Array.from({ length: 11 }).map((_, i) => {
              const done = i < 5;
              const active = i === 5;
              return (
                <div
                  key={i}
                  className={`h-1.5 flex-1 rounded-full transition-colors ${
                    done ? "bg-foreground" : active ? "bg-accent" : "bg-muted"
                  }`}
                />
              );
            })}
          </div>

          <div className="relative overflow-hidden rounded-3xl border-2 border-foreground bg-foreground text-background offset-shadow">
            <div className="relative aspect-video bg-background text-foreground">
              <div className="grid-paper absolute inset-0 opacity-40" aria-hidden />
              <div className="relative flex h-full flex-col justify-between p-5 sm:p-8 md:p-12">
                <div className="flex items-start justify-between gap-3">
                  <div className="eyebrow">Chapter 06 · Product</div>
                  <div className="eyebrow">Scapia · MyTrips</div>
                </div>
                <div>
                  <div className="font-display text-2xl font-bold leading-[0.95] tracking-tighter sm:text-4xl md:text-6xl md:leading-[0.9]">
                    A booking canvas<br />that lives inside the card.
                  </div>
                  <div className="mt-6 flex items-end gap-2">
                    {[40, 80, 60, 100, 75, 90, 55, 85].map((h, i) => (
                      <div key={i} style={{ height: `${h * 0.7}px` }} className={`w-8 rounded-t ${i === 3 ? "bg-accent" : "bg-foreground/70"}`} />
                    ))}
                  </div>
                </div>
              </div>
              {/* Live caption */}
              <div className="absolute inset-x-3 bottom-3 sm:inset-x-8 sm:bottom-8">
                <div className="mx-auto max-w-2xl rounded-xl border border-foreground/10 bg-foreground/95 p-3 text-center text-background backdrop-blur sm:p-4">
                  <p className="text-xs leading-relaxed italic sm:text-sm">
                    "…and that's why we're targeting a 300% growth in the APAC region by end of fiscal year 2026."
                  </p>
                </div>
              </div>
            </div>

            {/* Transport bar */}
            <div className="flex flex-wrap items-center gap-3 p-3 sm:gap-4 sm:p-4">
              <button className="flex h-12 w-12 items-center justify-center rounded-full bg-accent text-foreground transition-transform hover:scale-105">
                <span className="ml-0.5 text-lg">▶</span>
              </button>
              <div className="order-last w-full min-w-0 sm:order-none sm:w-auto sm:flex-1">
                <div className="mb-1.5 flex items-center justify-between text-[10px] uppercase tracking-widest text-background/50">
                  <span>Marcus · confident · 1.0×</span>
                  <span className="font-mono">02:44 / 05:12</span>
                </div>
                <div className="relative h-1 rounded-full bg-background/10">
                  <div className="absolute inset-y-0 left-0 w-[52%] rounded-full bg-accent" />
                  <div className="absolute -top-1 left-[52%] h-3 w-3 -translate-x-1/2 rounded-full border-2 border-foreground bg-accent" />
                </div>
              </div>
              <Waveform className="hidden text-accent sm:inline-flex" />
              <div className="flex gap-2">
                <button className="rounded-full border border-background/20 px-3 py-1.5 text-xs font-semibold text-background hover:bg-background hover:text-foreground">
                  ◀ Prev
                </button>
                <button className="rounded-full bg-accent px-4 py-1.5 text-xs font-semibold text-foreground">
                  Next ▶
                </button>
              </div>
            </div>
          </div>

          {/* Ask the deck */}
          <div className="mt-6 rounded-3xl border-2 border-foreground bg-background p-4 sm:p-6">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <div className="eyebrow">Ask the deck</div>
                <div className="font-display text-xl font-bold tracking-tight">Something on your mind?</div>
              </div>
              <span className="pill">Answers in ~4s</span>
            </div>
            <div className="mb-4 flex flex-wrap gap-2">
              {["How is pricing structured?", "Implementation timeline?", "How is this different from doing it manually?"].map((q) => (
                <button key={q} className="rounded-full border border-border bg-muted px-4 py-1.5 text-xs font-medium hover:border-foreground hover:bg-background">
                  {q}
                </button>
              ))}
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:gap-3">
              <Input placeholder="e.g. what's your CAC payback?" className="flex-1" />
              <Button>Ask →</Button>
            </div>
          </div>
        </section>

        {/* Presenter engagement panel — only visible to owner in real product; here for showcase */}
        <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
          <div className="rounded-2xl border border-border bg-background p-5">
            <div className="mb-4 flex items-center justify-between">
              <div className="eyebrow">Engagement · the rep</div>
              <span className="live-dot" />
            </div>
            <div className="space-y-3">
              {[
                { l: "Opened", v: "just now" },
                { l: "Slides watched", v: "6 / 11" },
                { l: "Completion", v: "55%" },
                { l: "Questions asked", v: "0" },
              ].map((r) => (
                <div key={r.l} className="flex items-baseline justify-between border-b border-dashed border-border pb-2 text-sm last:border-0">
                  <span className="text-muted-foreground">{r.l}</span>
                  <span className="font-display font-semibold">{r.v}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-background p-5">
            <div className="eyebrow mb-4">Slide dwell time</div>
            <div className="space-y-1.5 font-mono text-xs">
              {Array.from({ length: 11 }).map((_, i) => {
                const times = [1.2, 3.4, 5.1, 2.8, 4.2, 3.8, 0, 0, 0, 0, 0];
                const t = times[i];
                const w = t ? Math.min(100, t * 15) : 0;
                return (
                  <div key={i} className="flex items-center gap-3">
                    <span className="w-10 text-muted-foreground">{String(i + 1).padStart(2, "0")}</span>
                    <div className="relative h-2 flex-1 rounded-full bg-muted">
                      <div style={{ width: `${w}%` }} className={`h-full rounded-full ${i === 5 ? "bg-accent" : "bg-foreground/60"}`} />
                    </div>
                    <span className="w-10 text-right font-semibold text-foreground">{t.toFixed(1)}s</span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="rounded-2xl border-2 border-foreground bg-accent p-5 offset-shadow-sm">
            <div className="eyebrow mb-2">Live signal</div>
            <div className="font-display text-lg font-bold leading-tight">
              Prospect is on chapter 06 · Product.
            </div>
            <p className="mt-2 text-sm text-foreground/70">
              Ping them a note or wait — we'll notify you if they ask anything.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}

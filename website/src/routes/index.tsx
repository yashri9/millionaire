import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/shell";
import { OffsetButton, StatusPill, Waveform } from "@/components/ui-kit";
import { DeckCompareSlider } from "@/components/deck-compare-slider";
import { DeckSpiral } from "@/components/deck-spiral";
import { DeckValueCards } from "@/components/deck-value-cards";
import { DeckDriftCards } from "@/components/deck-drift-cards";
import { HeroShredder } from "@/components/hero-shredder";

import iitKgpAsset from "@/assets/iit-kgp.png.asset.json";
import cashfreeAsset from "@/assets/cashfree.png.asset.json";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Voxdeck — Your deck doesn't go quiet when you do" },
      { name: "description", content: "Upload a PDF. Voxdeck narrates every slide, answers prospect questions on its own, and tells you the moment someone opens it." },
      { property: "og:title", content: "Voxdeck — Your deck doesn't go quiet when you do" },
      { property: "og:description", content: "Upload a deck. Publish a link. Watch prospects engage." },
    ],
  }),
  component: LandingPage,
});

const operatorBadges = [
  { name: "Cashfree Payments", logo: cashfreeAsset.url },
  { name: "IIT Kharagpur", logo: iitKgpAsset.url },
];

const trustedLogos = ["NORTHWIND", "AURORA", "LONGTIDE", "KESTREL", "VOXEL", "HELIOS"];

function LandingPage() {
  const [logoIdx, setLogoIdx] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setLogoIdx((i) => (i + 1) % operatorBadges.length), 2200);
    return () => clearInterval(id);
  }, []);
  const activeBadge = operatorBadges[logoIdx];

  return (
    <AppShell variant="marketing" showTopBar={false}>
      {/* HERO — fed into a paper shredder as the user scrolls */}
      <HeroShredder>
        <section className="relative overflow-hidden border-b border-border bg-background">
          <div className="grid-paper absolute inset-0 opacity-40" aria-hidden />
          <div className="relative mx-auto grid max-w-7xl grid-cols-1 items-center gap-12 px-4 pb-16 pt-10 sm:px-6 sm:pb-20 sm:pt-14 lg:grid-cols-[1.05fr_1fr] lg:gap-16 lg:pb-24 lg:pt-20">
            {/* LEFT — copy */}
            <div className="animate-rise text-left">
              <h1 className="font-display text-5xl font-bold leading-[0.95] tracking-tighter text-foreground sm:text-6xl md:text-7xl lg:text-[84px] lg:leading-[0.92]">
                Your deck<br />
                goes quiet. <span className="italic text-foreground">This one doesn't.</span>
              </h1>
              <p className="mt-8 max-w-lg text-lg leading-relaxed text-muted-foreground">
                The second you stop talking, most decks stop selling. Upload a
                PDF and yours keeps going — narrates every slide in a voice
                that sounds like you, answers questions on its own, and tells
                you the moment someone opens it.
              </p>
              <div className="mt-10 flex flex-wrap items-center gap-6">
                <Link to="/signup">
                  <OffsetButton>Upload your deck →</OffsetButton>
                </Link>
                <a href="#product" className="text-sm font-semibold text-foreground underline underline-offset-4 decoration-muted-foreground/40 transition hover:decoration-foreground">
                  See a 30-second example
                </a>
              </div>

              {/* TRUSTED BY — dummy wordmarks */}
              <div className="mt-14 flex max-w-2xl items-center gap-6 text-xs text-muted-foreground">
                <span className="eyebrow shrink-0">Trusted by teams at</span>
                <div className="h-px flex-1 bg-border" />
              </div>
              <div className="mt-5 flex flex-wrap items-center gap-x-7 gap-y-3">
                {trustedLogos.map((name) => (
                  <span
                    key={name}
                    className="font-display text-sm font-bold tracking-[0.2em] text-muted-foreground/70 transition hover:text-foreground"
                  >
                    {name}
                  </span>
                ))}
              </div>

              {/* BUILT BY — single rotating logo */}
              <div className="mt-8 flex max-w-2xl items-center gap-6 text-xs text-muted-foreground">
                <span className="eyebrow shrink-0">Built by operators from</span>
                <div className="h-px flex-1 bg-border" />
              </div>
              <div data-hero-shred-target className="mt-4 flex h-8 items-center overflow-hidden">
                <img
                  key={activeBadge.name}
                  src={activeBadge.logo}
                  alt={activeBadge.name}
                  className="h-7 w-auto animate-fade-in object-contain opacity-80 grayscale"
                />
              </div>
            </div>

            {/* RIGHT — vertical drift cards */}
            <div className="animate-rise">
              <DeckDriftCards />
            </div>
          </div>
        </section>
      </HeroShredder>

      {/* PROBLEM / LOSS — what's actually happening after you hit send */}
      <section className="border-b border-border bg-chalk/40 py-16 md:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="mx-auto max-w-2xl text-center">
            <div className="eyebrow mb-3 justify-center">What's actually happening after you hit send</div>
            <h2 className="font-display text-4xl font-bold tracking-tighter sm:text-5xl">
              You don't get ghosted.<br />You get skimmed, then forgotten.
            </h2>
            <p className="mt-6 text-lg leading-relaxed text-muted-foreground">
              Your prospect opens the deck once, for 40 seconds, on their phone,
              in a Slack scroll. They miss the one slide that would've closed them.
              You won't know it happened — there's no signal, no follow-up trigger,
              nothing. The deal doesn't die with a "no." It just goes quiet.
            </p>
          </div>

          <div className="mx-auto mt-12 grid max-w-4xl gap-4 sm:grid-cols-3">
            {[
              "No idea if they even opened it",
              "No one there to answer “wait, what about X” — so they assume the worst and move on",
              "You re-explain the same deck live, every time, because the PDF can't",
            ].map((loss, i) => (
              <div
                key={i}
                className="rounded-2xl border-2 border-foreground/15 bg-background p-5"
              >
                <div className="mb-3 font-mono text-xs font-medium text-muted-foreground">0{i + 1}</div>
                <p className="text-sm leading-relaxed text-foreground">{loss}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* COMPARE SLIDER — AI presenter vs static deck */}
      <DeckCompareSlider />

      {/* THREE VALUE CARDS — part of the before & after story */}
      <DeckValueCards />

      {/* SCROLL SPIRAL — 3D helix of deck cards */}
      <DeckSpiral />



      {/* HOW IT WORKS — the visible labor, not a black box */}
      <section id="how" className="border-b border-border py-16 md:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="mb-10 flex flex-wrap items-end justify-between gap-6 md:mb-14">
            <div>
              <div className="eyebrow mb-3">What happens in the 90 seconds after you upload</div>
              <h2 className="font-display text-4xl font-bold tracking-tighter sm:text-5xl">
                Watch it<br />actually work.
              </h2>
            </div>
            <p className="max-w-sm text-muted-foreground">
              It only knows what's in your deck. It can't invent numbers or make
              promises you didn't put on a slide — and if it can't answer, it
              hands off to you instead of guessing.
            </p>
          </div>

          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { n: "01", title: "Reading every page", body: "Extracting the real text and numbers off your slides — not guessing." },
              { n: "02", title: "Writing the narration", body: "Grounded only in what's on the page, slide by slide, in your pacing." },
              { n: "03", title: "Recording the voice", body: "An elite AI voice, matched to the tone you pick." },
              { n: "04", title: "Wiring up the Q&A", body: "Answers from your deck's own content. Hands off to you when it isn't sure." },
            ].map((step, i) => (
              <div
                key={step.n}
                className="group relative flex flex-col justify-between rounded-2xl border-2 border-foreground bg-background p-6 transition-transform hover:-translate-y-1"
              >
                <div>
                  <div className="mb-8 flex items-baseline justify-between">
                    <span className="font-mono text-xs font-medium text-muted-foreground">STEP {step.n}</span>
                    {i === 1 && <Waveform className="text-accent" />}
                  </div>
                  <h3 className="font-display text-xl font-bold tracking-tight">{step.title}</h3>
                  <p className="mt-3 text-sm text-muted-foreground">{step.body}</p>
                </div>
                <div className="mt-10 h-1 w-8 bg-foreground transition-all duration-300 group-hover:w-24 group-hover:bg-accent" />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* STUDIO PREVIEW */}
      <section id="studio" className="bg-foreground py-16 text-background md:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="mb-10 flex flex-wrap items-end justify-between gap-8 md:mb-14">
            <h2 className="font-display text-4xl font-bold tracking-tighter sm:text-5xl">
              A studio built<br />for the deck-obsessed.
            </h2>
            <p className="max-w-sm text-background/60">
              Line-level control. Regenerate one sentence. Swap a voice mid-deck.
              Preview at 1.5× and ship in under a minute.
            </p>
          </div>

          <div className="grid gap-1 rounded-2xl border border-background/10 bg-background/5 p-1 md:grid-cols-[80px_1fr] lg:grid-cols-[80px_1fr_360px]">
            {/* Rail */}
            <div className="flex flex-row items-center gap-3 overflow-x-auto rounded-xl bg-background/5 p-4 md:flex-col">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent text-foreground">
                <span className="font-mono text-xs font-bold">01</span>
              </div>
              {["02", "03", "04", "05"].map((n) => (
                <div key={n} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-background/10 text-xs font-medium text-background/40">
                  {n}
                </div>
              ))}
            </div>

            {/* Canvas */}
            <div className="rounded-xl bg-background/5 p-6">
              <div className="relative aspect-video overflow-hidden rounded-lg bg-background text-foreground">
                <div className="grid-paper absolute inset-0 opacity-50" aria-hidden />
                <div className="relative flex h-full flex-col justify-center p-8">
                  <div className="eyebrow mb-2">Cover</div>
                  <div className="font-display text-4xl font-bold leading-none tracking-tighter">
                    The pitch<br />that pitches itself.
                  </div>
                </div>
                <div className="absolute inset-x-4 bottom-4 flex items-end gap-1">
                  {[20, 40, 60, 80, 100, 60, 40, 80, 100, 60, 40, 20].map((h, i) => (
                    <div key={i} style={{ height: `${h * 0.35}px` }} className="flex-1 rounded-t bg-accent/40" />
                  ))}
                </div>
              </div>
              <div className="mt-6 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <button className="flex h-10 w-10 items-center justify-center rounded-full bg-background text-foreground">▶</button>
                  <div>
                    <div className="text-sm font-semibold">Previewing slide 01</div>
                    <div className="font-mono text-[10px] uppercase tracking-widest text-background/50">00:00 / 00:14</div>
                  </div>
                </div>
                <div className="flex gap-2">
                  <span className="pill border-background/10 bg-background/10 text-background">1080p</span>
                  <span className="pill border-background/10 bg-background/10 text-background">Voice · Marcus</span>
                </div>
              </div>
            </div>

            {/* Script */}
            <div className="rounded-xl bg-background/5 p-6">
              <div className="eyebrow mb-4 text-background/50">Ai script · slide 01</div>
              <div className="space-y-4">
                <div className="rounded-xl border border-background/10 bg-background/10 p-4">
                  <p className="text-sm leading-relaxed text-background/90">
                    <span className="text-accent">[Warm]</span> Hey — I know you're busy,
                    so I'll get right to it. In the next four minutes, I'll show
                    you exactly why our pilot converts at 92%.
                  </p>
                </div>
                <div className="rounded-xl border border-dashed border-background/20 p-4 opacity-50">
                  <p className="text-sm leading-relaxed text-background/70">
                    …and that starts with how we handle the very first customer touchpoint.
                  </p>
                </div>
                <button className="w-full rounded-full bg-accent py-3 text-sm font-semibold text-foreground transition-transform hover:-translate-y-0.5">
                  Regenerate this line
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* VOICES */}
      <section id="voices" className="border-b border-border py-16 md:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="mb-10 flex flex-wrap items-end justify-between gap-6 md:mb-12">
            <h2 className="font-display text-4xl font-bold tracking-tighter sm:text-5xl">
              Voices with taste.
            </h2>
            <span className="eyebrow">Twelve personas · one accent per project</span>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { name: "Marcus", tag: "Confident · US", chip: "Sales" },
              { name: "Elena", tag: "Direct · UK", chip: "Fundraise" },
              { name: "Kai", tag: "Warm · Aus", chip: "Product" },
              { name: "Priya", tag: "Precise · IN", chip: "Board" },
            ].map((v, i) => (
              <div key={v.name} className={`group relative overflow-hidden rounded-2xl border border-border p-6 transition-all hover:border-foreground ${i === 0 ? "bg-foreground text-background" : "bg-background"}`}>
                <div className="mb-6 flex items-start justify-between">
                  <div>
                    <div className="font-display text-2xl font-bold tracking-tight">{v.name}</div>
                    <div className={`mt-1 text-xs ${i === 0 ? "text-background/60" : "text-muted-foreground"}`}>{v.tag}</div>
                  </div>
                  <span className={`pill ${i === 0 ? "border-background/20 bg-background/10 text-background" : ""}`}>{v.chip}</span>
                </div>
                <div className={i === 0 ? "text-accent" : "text-foreground"}>
                  <Waveform />
                </div>
                <button className={`mt-6 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-widest transition-transform group-hover:translate-x-1 ${i === 0 ? "text-accent" : "text-foreground"}`}>
                  Preview → 12s
                </button>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="border-b border-border bg-accent">
        <div className="mx-auto flex max-w-7xl flex-col items-center gap-8 px-4 py-16 text-center sm:px-6 md:py-24">
          <StatusPill status="live" label="Studio is live" />
          <h2 className="font-display text-5xl font-bold leading-[0.9] tracking-tighter sm:text-6xl md:text-7xl">
            Stop sending<br />
            <span className="italic">dead links.</span>
          </h2>
          <p className="max-w-md text-lg text-foreground/70">
            Ship your first talking deck in under three minutes. Free while we're in beta.
          </p>
          <Link to="/signup">
            <button className="h-14 rounded-full border-2 border-foreground bg-foreground px-10 text-base font-semibold text-background transition-transform hover:-translate-y-1">
              Get started — it's free
            </button>
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-6 px-6 md:flex-row">
          <div className="flex items-center gap-3">
            <span className="font-display text-sm font-bold tracking-tighter">VOXDECK · 2026</span>
            <span className="eyebrow">Built with rebellion</span>
          </div>
          <nav className="flex gap-6 text-xs font-medium uppercase tracking-widest text-muted-foreground">
            <a href="#">Manifesto</a>
            <a href="#">Privacy</a>
            <a href="#">Terms</a>
            <a href="#">Status</a>
          </nav>
        </div>
      </footer>
    </AppShell>
  );
}

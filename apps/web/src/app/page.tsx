import Link from "next/link";
import { AppShell } from "@/components/shell";
import { VoxdeckHeroStage } from "@/components/marketing/VoxdeckHeroStage";
import { StudioRehearseSection } from "@/components/marketing/RehearseDemoStage";

/**
 * Public marketing homepage — uses the live design system (AppShell,
 * offset shadows, waveform motif). The previous scaffold used removed
 * classes (.wrap / .btn / .todo), which is why the designed look vanished.
 */
export default function Home() {
  return (
    <AppShell variant="marketing">
      {/* ── Hero: Voxdeck product pitch stage ── */}
      <section className="relative overflow-hidden border-b border-border">
        <div
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_20%_0%,oklch(0.94_0.22_118_/_0.35),transparent_55%),radial-gradient(ellipse_at_90%_80%,oklch(0.14_0_0_/_0.04),transparent_50%)]"
          aria-hidden
        />
        <div className="grid-paper pointer-events-none absolute inset-0 opacity-40" aria-hidden />

        <div className="relative mx-auto grid min-h-[calc(100dvh-72px)] max-w-[1280px] items-center gap-10 px-5 py-12 md:grid-cols-[1.05fr_0.95fr] md:gap-14 md:px-10 md:py-16">
          <div className="animate-rise max-w-xl">
            <div className="font-display text-4xl font-bold tracking-tighter sm:text-5xl">
              VOXDECK<span className="text-accent">.</span>
            </div>
            <h1 className="mt-5 font-display text-5xl font-bold leading-[0.92] tracking-tighter sm:text-6xl md:text-7xl">
              Make the deck talk.
            </h1>
            <p className="mt-5 max-w-md text-base leading-relaxed text-muted-foreground sm:text-lg">
              Upload a deck, generate a spoken walkthrough, publish a link a
              prospect can open — no login.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link
                href="/signup"
                className="group inline-flex h-12 items-center gap-2 rounded-full bg-foreground px-7 text-sm font-semibold text-background transition-transform hover:-translate-y-0.5"
              >
                Get started
                <span className="transition-transform group-hover:translate-x-0.5">→</span>
              </Link>
              <Link
                href="/login"
                className="inline-flex h-12 items-center rounded-full border-2 border-foreground bg-background px-6 text-sm font-semibold transition-colors hover:bg-muted"
              >
                Log in
              </Link>
            </div>
          </div>

          <div className="animate-rise-slow relative mx-auto w-full max-w-[800px] md:justify-self-end">
            <VoxdeckHeroStage />
          </div>
        </div>
      </section>

      {/* ── How it works ── */}
      <section id="how" className="border-b border-border bg-background">
        <div className="mx-auto max-w-[1280px] px-5 py-16 md:px-10 md:py-24">
          <div className="max-w-xl">
            <div className="eyebrow">How it works</div>
            <h2 className="mt-3 font-display text-3xl font-bold tracking-tighter sm:text-4xl">
              Upload. Narrate. Ship a link.
            </h2>
            <p className="mt-3 text-muted-foreground">
              Three steps from PDF to a walkthrough your prospect can finish alone.
            </p>
          </div>

          <ol className="mt-12 grid gap-10 sm:grid-cols-3 sm:gap-8">
            {[
              {
                n: "01",
                title: "Upload the deck",
                body: "Drop a PDF. We extract slides, text, and chart cues so narration stays grounded.",
              },
              {
                n: "02",
                title: "Generate the pitch",
                body: "AI writes a spoken line per slide — essentials, not a dry read-aloud. Edit anything.",
              },
              {
                n: "03",
                title: "Publish the link",
                body: "Send one URL. They watch. No login. When it can’t answer, it hands off to you.",
              },
            ].map((step) => (
              <li key={step.n} className="relative">
                <div className="font-mono text-xs font-medium tracking-widest text-muted-foreground">
                  {step.n}
                </div>
                <h3 className="mt-3 font-display text-xl font-bold tracking-tight">{step.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{step.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ── Studio: sample walkthroughs ── */}
      <section id="studio" className="border-b border-border bg-chalk/60">
        <StudioRehearseSection />
      </section>

      {/* ── Voices ── */}
      <section id="voices" className="border-b border-border bg-background">
        <div className="mx-auto max-w-[1280px] px-5 py-16 md:px-10 md:py-24">
          <div className="max-w-xl">
            <div className="eyebrow">Voices</div>
            <h2 className="mt-3 font-display text-3xl font-bold tracking-tighter sm:text-4xl">
              A voice that pitches — and knows when to stop.
            </h2>
            <p className="mt-4 text-muted-foreground leading-relaxed">
              Prospects hear a confident walkthrough. If a question falls outside
              the deck, Voxdeck hands the conversation back to you instead of guessing.
            </p>
          </div>

          <div className="mt-12 overflow-hidden border-y border-border">
            <div className="flex animate-marquee gap-10 whitespace-nowrap py-5 font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
              {[
                "Marcus · US",
                "Kai · AUS",
                "Sofia · UK",
                "Warm · Clear",
                "Handoff ready",
                "Marcus · US",
                "Kai · AUS",
                "Sofia · UK",
                "Warm · Clear",
                "Handoff ready",
              ].map((label, i) => (
                <span key={`${label}-${i}`} className="inline-flex items-center gap-3">
                  <span className="waveform text-foreground" aria-hidden>
                    <span /><span /><span /><span /><span />
                  </span>
                  {label}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Close CTA ── */}
      <section className="bg-foreground text-background">
        <div className="mx-auto flex max-w-[1280px] flex-col items-start justify-between gap-8 px-5 py-16 md:flex-row md:items-center md:px-10 md:py-20">
          <div>
            <h2 className="font-display text-3xl font-bold tracking-tighter sm:text-4xl">
              Ready when your deck is.
            </h2>
            <p className="mt-2 max-w-md text-sm text-background/65">
              Create an account, upload once, and send a link that talks.
            </p>
          </div>
          <Link
            href="/signup"
            className="inline-flex h-12 items-center gap-2 rounded-full bg-accent px-7 text-sm font-semibold text-foreground transition-transform hover:-translate-y-0.5"
          >
            Start creating →
          </Link>
        </div>
      </section>
    </AppShell>
  );
}

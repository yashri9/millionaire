import Link from "next/link";
import { AppShell } from "@/components/shell";
import { VoxdeckHeroStage } from "@/components/marketing/VoxdeckHeroStage";
import { StudioRehearseSection } from "@/components/marketing/RehearseDemoStage";
import { VoicePreviewGrid } from "@/components/marketing/VoicePreviewGrid";

const QUESTIONS = [
  "Did they open it?",
  "Did they understand the story?",
  "Should I follow up?",
  "Do I need another meeting to explain it?",
];

const STEPS = [
  { n: "01", title: "Upload your deck.", body: "Drop in a PDF. That's the whole setup." },
  {
    n: "02",
    title: "Give it a voice.",
    body: "Generate narration, choose a voice, and edit the script until it sounds right.",
  },
  {
    n: "03",
    title: "Send one link.",
    body: "Share anywhere. No login for viewers, no scheduling, no chase.",
  },
];

const FLOW = [
  { n: "01", title: "Open", body: "Tap the link. It just works." },
  { n: "02", title: "Watch", body: "Your pitch, narrated at their pace." },
  { n: "03", title: "Explore", body: "Jump to the slide that matters." },
  { n: "04", title: "Engage", body: "Take the next step when ready." },
  { n: "05", title: "Handoff", body: "Bring the conversation back to you." },
];

const USES = [
  {
    n: "01",
    title: "Sales",
    body: "Send a follow-up that actually gets watched — and give prospects the context before the call.",
  },
  {
    n: "02",
    title: "Founders",
    body: "Get your story straight once — then let it scale to every intro.",
  },
  {
    n: "03",
    title: "Fundraising",
    body: "Reach every partner at the firm, not just the one in the room.",
  },
  {
    n: "04",
    title: "Onboarding",
    body: "Walk new hires and customers through it — the same way, every time.",
  },
];

const COMPARE = [
  ["Gets opened?", "Maybe", "Built for watching"],
  ["Explains itself?", "No", "Yes"],
  ["Works async?", "Partly", "Yes"],
  ["Viewer needs an account?", "Depends", "No login"],
  ["Narration included?", "No", "Yes"],
  ["Time to create?", "—", "Minutes"],
];

const FAQS = [
  {
    q: "Does my viewer need a Voxdeck account?",
    a: "No. The published walkthrough is designed to be opened through a shareable link without requiring the viewer to create an account.",
  },
  {
    q: "Can I edit the narration?",
    a: "Yes. The studio experience is designed around reviewing and editing the generated narration before you publish.",
  },
  {
    q: "Can I choose the voice?",
    a: "Yes. Voxdeck's studio supports selecting a voice and previewing the walkthrough before you send it.",
  },
  {
    q: "Can I use my existing PDF?",
    a: "Yes. The workflow starts with the deck you already have rather than asking you to rebuild it from scratch.",
  },
  {
    q: "What does my prospect see?",
    a: "They open a shareable walkthrough where the presentation and narration are experienced together, without a viewer login.",
  },
];

const PROOF = [
  { label: "Product proof", value: "Live sample walkthrough" },
  { label: "Viewer friction", value: "No account required" },
  { label: "Workflow", value: "Upload → Voice → One link" },
];

export default function Home() {
  return (
    <AppShell variant="marketing">
      {/* Header 47 — copy left, product right */}
      <section className="relative overflow-hidden px-[5%] py-16 md:py-24 lg:py-28">
        <div
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_58%_48%,oklch(0.94_0.22_118_/_0.45),transparent_52%)]"
          aria-hidden
        />
        <div className="grid-paper pointer-events-none absolute inset-0 opacity-40" aria-hidden />

        <div className="relative mx-auto grid w-full max-w-7xl grid-cols-1 items-center gap-x-12 gap-y-12 md:gap-y-16 lg:grid-cols-2 lg:gap-x-20">
          <div className="animate-rise">
            <p className="mb-3 font-semibold md:mb-4">Voxdeck · Async pitching</p>
            <h1 className="mb-5 font-display text-5xl font-bold leading-[0.95] tracking-tighter md:mb-6 md:text-6xl lg:text-7xl">
              Your deck, explained in your voice
              <span className="block">— while you sleep.</span>
            </h1>
            <p className="md:text-lg max-w-lg text-lg leading-relaxed text-muted-foreground">
              Voxdeck turns your PDF into an AI-narrated walkthrough prospects and
              investors can watch on their own time — one link, no login, no
              meeting to schedule.
            </p>
            <div className="mt-6 flex flex-wrap gap-4 md:mt-8">
              <Link
                href="/signup"
                className="group inline-flex h-12 items-center justify-center gap-2 rounded-full bg-accent px-7 text-sm font-semibold text-foreground transition-transform hover:-translate-y-0.5"
              >
                Make my deck talk — free
                <span className="transition-transform group-hover:translate-x-0.5">→</span>
              </Link>
              <Link
                href="#studio"
                className="inline-flex h-12 items-center justify-center rounded-full border-2 border-foreground bg-background px-6 text-sm font-semibold transition-colors hover:bg-muted"
              >
                Watch a 60-sec sample
              </Link>
            </div>
            <ul className="mt-6 space-y-2 text-sm text-muted-foreground md:mt-8">
              <li className="flex items-center gap-3">
                <span className="h-1.5 w-1.5 rounded-full bg-foreground" />
                <span>
                  <span className="font-semibold text-foreground">No login for viewers</span>
                </span>
              </li>
              <li className="flex items-center gap-3">
                <span className="h-1.5 w-1.5 rounded-full bg-foreground" />
                Works with your existing deck
              </li>
            </ul>
          </div>

          <div className="animate-rise-slow w-full">
            <VoxdeckHeroStage />
          </div>
        </div>
      </section>

      {/* Logo 2 — proof strip */}
      <section className="overflow-hidden border-y border-border px-[5%] py-12 md:py-16">
        <div className="mx-auto w-full max-w-7xl">
          <p className="mb-8 text-center font-semibold">
            Built for decks that have to travel without you
          </p>
          <div className="grid grid-cols-1 items-center justify-items-center gap-8 sm:grid-cols-3">
            {PROOF.map((item) => (
              <div key={item.label} className="text-center">
                <p className="text-sm text-muted-foreground">{item.label}</p>
                <p className="mt-1 font-display text-lg font-bold tracking-tight">
                  {item.value}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Layout 3 — heading left, content right */}
      <section className="px-[5%] py-16 md:py-24 lg:py-28">
        <div className="mx-auto grid w-full max-w-7xl grid-cols-1 items-center gap-y-12 md:grid-cols-2 md:gap-x-12 lg:gap-x-20">
          <div>
            <p className="mb-3 font-semibold md:mb-4">The deck graveyard</p>
            <h2 className="mb-5 font-display text-4xl font-bold tracking-tighter md:mb-6 md:text-5xl lg:text-6xl">
              You sent the deck. Then… silence.
            </h2>
            <p className="md:text-lg text-lg leading-relaxed text-muted-foreground">
              A static PDF leaves your story sitting in an inbox. Your recipient
              has to decide what matters, what to read, and whether to come back
              with questions.
            </p>
          </div>
          <div>
            <ul>
              {QUESTIONS.map((q, i) => (
                <li
                  key={q}
                  className="flex gap-4 border-t border-border py-4 text-lg tracking-tight last:border-b"
                >
                  <span className="font-semibold text-muted-foreground">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  {q}
                </li>
              ))}
            </ul>
            <p className="mt-8 font-display text-2xl font-semibold leading-snug tracking-tight md:text-3xl">
              Your best pitch shouldn&apos;t depend on{" "}
              <mark className="bg-accent px-1.5 text-foreground">you being in the room.</mark>
            </p>
          </div>
        </div>
      </section>

      {/* Layout 237 — 3 feature cards */}
      <section id="how" className="bg-chalk/60 px-[5%] py-16 md:py-24 lg:py-28">
        <div className="mx-auto w-full max-w-7xl">
          <div className="mb-12 max-w-lg md:mb-18">
            <p className="mb-3 font-semibold md:mb-4">How it works</p>
            <h2 className="mb-5 font-display text-4xl font-bold tracking-tighter md:mb-6 md:text-5xl lg:text-6xl">
              From deck to self-serve pitch in minutes.
            </h2>
            <p className="md:text-lg text-muted-foreground">
              Three steps from your existing deck to a walkthrough your prospect
              can watch on their own time.
            </p>
          </div>
          <div className="grid grid-cols-1 items-start gap-y-12 md:grid-cols-3 md:gap-x-8 md:gap-y-16 lg:gap-x-12">
            {STEPS.map((step) => (
              <div key={step.n}>
                <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-md border border-border bg-background font-display text-lg font-bold md:mb-6">
                  {step.n}
                </div>
                <h3 className="mb-3 text-xl font-bold md:mb-4 md:text-2xl">{step.title}</h3>
                <p className="text-muted-foreground">{step.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Layout 12 — product / studio */}
      <section id="studio" className="px-[5%] py-16 md:py-24 lg:py-28">
        <StudioRehearseSection />
      </section>

      {/* Timeline 7 — recipient path */}
      <section className="bg-chalk/60 px-[5%] py-16 md:py-24 lg:py-28">
        <div className="mx-auto w-full max-w-7xl">
          <div className="mb-12 max-w-lg md:mb-18">
            <p className="mb-3 font-semibold md:mb-4">What your prospect sees</p>
            <h2 className="mb-5 font-display text-4xl font-bold tracking-tighter md:mb-6 md:text-5xl lg:text-6xl">
              One click. No login. No friction.
            </h2>
            <p className="md:text-lg text-muted-foreground">
              Your recipient gets the story without another meeting. They watch
              when it suits them and keep the context intact.
            </p>
          </div>
          <div className="relative flex flex-col md:flex-row">
            {FLOW.map((item, i) => (
              <div key={item.n} className="relative flex flex-1 gap-6 md:flex-col md:gap-0">
                <div className="flex flex-col items-center md:flex-row md:items-center">
                  <div className="z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-foreground bg-background text-sm font-bold">
                    {item.n}
                  </div>
                  {i < FLOW.length - 1 && (
                    <div
                      className="h-full w-px grow bg-border md:h-px md:w-full"
                      aria-hidden
                    />
                  )}
                </div>
                <div className="pb-10 md:mt-6 md:pr-6 md:pb-0">
                  <h3 className="mb-2 text-xl font-bold">{item.title}</h3>
                  <p className="text-sm text-muted-foreground">{item.body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Layout 241 — voice cards */}
      <section id="voices" className="px-[5%] py-16 md:py-24 lg:py-28">
        <div className="mx-auto w-full max-w-7xl">
          <div className="mb-12 max-w-lg md:mb-18">
            <p className="mb-3 font-semibold md:mb-4">Pick a voice</p>
            <h2 className="mb-5 font-display text-4xl font-bold tracking-tighter md:mb-6 md:text-5xl lg:text-6xl">
              Sound like you — or better.
            </h2>
            <p className="md:text-lg text-muted-foreground">
              Choose the voice that fits the way you want your company to sound.
              Click to preview.
            </p>
          </div>
          <VoicePreviewGrid />
        </div>
      </section>

      {/* Layout 192 — use-case cards */}
      <section id="use" className="bg-chalk/60 px-[5%] py-16 md:py-24 lg:py-28">
        <div className="mx-auto w-full max-w-7xl">
          <div className="mb-12 max-w-lg md:mb-18">
            <p className="mb-3 font-semibold md:mb-4">Use cases</p>
            <h2 className="mb-5 font-display text-4xl font-bold tracking-tighter md:mb-6 md:text-5xl lg:text-6xl">
              Built for decks that need to travel without you.
            </h2>
          </div>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {USES.map((item) => (
              <article key={item.n} className="flex flex-col border border-border bg-background p-6 md:p-8">
                <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-md border border-border font-display text-lg font-bold">
                  {item.n}
                </div>
                <h3 className="mb-3 text-xl font-bold md:mb-4">{item.title}</h3>
                <p className="text-muted-foreground">{item.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* Comparison 14 */}
      <section className="px-[5%] py-16 md:py-24 lg:py-28">
        <div className="mx-auto w-full max-w-7xl">
          <div className="mb-12 max-w-lg md:mb-18">
            <p className="mb-3 font-semibold md:mb-4">Why Voxdeck</p>
            <h2 className="mb-5 font-display text-4xl font-bold tracking-tighter md:mb-6 md:text-5xl lg:text-6xl">
              A PDF waits to be opened. Voxdeck tells the story.
            </h2>
          </div>
          <div className="overflow-x-auto border border-border">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-5 py-4 font-semibold">Buyer question</th>
                  <th className="px-5 py-4 font-semibold text-muted-foreground">Static deck</th>
                  <th className="bg-accent px-5 py-4 font-semibold">Voxdeck</th>
                </tr>
              </thead>
              <tbody>
                {COMPARE.map(([q, staticDeck, vox]) => (
                  <tr key={q} className="border-b border-border last:border-0">
                    <td className="px-5 py-4">{q}</td>
                    <td className="px-5 py-4 text-muted-foreground">{staticDeck}</td>
                    <td className="bg-accent/80 px-5 py-4 font-semibold">{vox}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Pricing 5 — single plan */}
      <section id="pricing" className="bg-chalk/60 px-[5%] py-16 md:py-24 lg:py-28">
        <div className="mx-auto w-full max-w-7xl">
          <div className="mx-auto mb-12 max-w-lg text-center md:mb-18">
            <p className="mb-3 font-semibold md:mb-4">Start simple</p>
            <h2 className="mb-5 font-display text-4xl font-bold tracking-tighter md:mb-6 md:text-5xl lg:text-6xl">
              Make your first walkthrough.
            </h2>
            <p className="md:text-lg text-muted-foreground">
              Start with the deck you already have. No need to redesign your
              presentation before you try Voxdeck.
            </p>
          </div>
          <div className="mx-auto flex h-full max-w-md flex-col justify-between border border-border bg-background px-6 py-8 text-center md:p-8">
            <div>
              <h3 className="mb-2 text-lg font-bold leading-[1.4] md:text-xl">
                Free to start
              </h3>
              <p className="my-8 font-display text-6xl font-bold tracking-tighter md:text-8xl">
                $0
              </p>
              <p className="text-muted-foreground">
                Create a walkthrough and see the recipient experience before you
                commit.
              </p>
            </div>
            <div>
              <ul className="my-8 space-y-4 text-left text-sm">
                {[
                  "Upload an existing PDF",
                  "Generate and edit narration",
                  "Preview the recipient experience",
                  "Share one link — no viewer login",
                ].map((f) => (
                  <li key={f} className="flex items-start gap-3">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-foreground" />
                    {f}
                  </li>
                ))}
              </ul>
              <Link
                href="/signup"
                className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-accent px-7 text-sm font-semibold text-foreground transition-transform hover:-translate-y-0.5"
              >
                Make my deck talk →
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ 1 — heading left, accordion right */}
      <section id="faq" className="px-[5%] py-16 md:py-24 lg:py-28">
        <div className="mx-auto grid w-full max-w-7xl grid-cols-1 gap-y-12 md:gap-x-12 lg:grid-cols-[.75fr_1fr] lg:gap-x-20">
          <div>
            <p className="mb-3 font-semibold md:mb-4">FAQ</p>
            <h2 className="mb-5 font-display text-4xl font-bold tracking-tighter md:mb-6 md:text-5xl lg:text-6xl">
              Questions before you send?
            </h2>
            <p className="md:text-lg text-muted-foreground">
              A few answers to the things you probably want to know first.
            </p>
          </div>
          <div className="border-t border-border">
            {FAQS.map((item) => (
              <details key={item.q} className="group border-b border-border">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-5 text-base font-bold md:py-6 md:text-lg [&::-webkit-details-marker]:hidden">
                  {item.q}
                  <span className="ml-4 shrink-0 text-xl font-normal leading-none text-muted-foreground group-open:hidden">
                    +
                  </span>
                  <span className="ml-4 hidden shrink-0 text-xl font-normal leading-none text-muted-foreground group-open:inline">
                    −
                  </span>
                </summary>
                <p className="md:text-lg pb-6 pr-8 text-muted-foreground md:pb-8">
                  {item.a}
                </p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* CTA 1 — centered closer */}
      <section id="cta" className="bg-foreground px-[5%] py-16 text-background md:py-24 lg:py-28">
        <div className="mx-auto w-full max-w-7xl text-center">
          <h2 className="mb-5 font-display text-4xl font-bold tracking-tighter md:mb-6 md:text-5xl lg:text-6xl">
            Make your next deck impossible to ignore.
          </h2>
          <p className="md:text-lg mx-auto max-w-lg text-background/70">
            Upload a PDF, pick a voice, send one link.
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-4 md:mt-8">
            <Link
              href="/signup"
              className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-accent px-7 text-sm font-semibold text-foreground transition-transform hover:-translate-y-0.5"
            >
              Make my deck talk — free →
            </Link>
            <Link
              href="#studio"
              className="inline-flex h-12 items-center justify-center rounded-full border border-background/30 px-6 text-sm font-semibold text-background transition-colors hover:bg-background/10"
            >
              Watch a sample
            </Link>
          </div>
        </div>
      </section>
    </AppShell>
  );
}

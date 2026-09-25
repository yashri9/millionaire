import Link from "next/link";
import { AppShell } from "@/components/shell";
import { OasisIpadDemo } from "@/components/marketing/OasisIpadDemo";
import { StudioRehearseSection } from "@/components/marketing/RehearseDemoStage";
import { VoicePreviewGrid } from "@/components/marketing/VoicePreviewGrid";
import "./oasis-borrow.css";

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

const OASIS_USES = [
  ["Sales follow-ups", "Send the context after the call without booking another one."],
  ["Investor pitches", "Make the story clear even when you are not in the room."],
  ["Product demos", "Guide viewers through the product without losing momentum."],
  ["Team onboarding", "Explain the same process clearly, every single time."],
  ["Feature announcements", "Turn every important release into a story worth watching."],
  ["Customer education", "Give customers answers in a format they can revisit."],
  ["Founder updates", "Share progress with voice, pace, and context intact."],
  ["Agency handoffs", "Deliver polished walkthroughs without adding more meetings."],
];

const AUDIENCE = [
  ["Founders", "Make every pitch feel like you are in the room."],
  ["Sales teams", "Follow up with context that actually gets watched."],
  ["Product teams", "Explain the feature without explaining it twice."],
  ["Agencies", "Add polished narration without adding production."],
];

const PROOF = [
  { label: "Product proof", value: "Live sample walkthrough" },
  { label: "Viewer friction", value: "No account required" },
  { label: "Workflow", value: "Upload → Voice → One link" },
];

/**
 * Homepage — one blue design language end to end
 * (hero / oasis sections + restyled middle Relume sections).
 */
export default function Home() {
  return (
    <AppShell variant="marketing">
      {/* —— Oasis: intro hero —— */}
      <div className="oasis-borrow">
        <section className="intro-hero">
          <div className="hero-grid" />
          <div className="hero-orbit orbit-one" />
          <div className="hero-orbit orbit-two" />
          <div className="coordinates">00° / 00°</div>
          <div className="final-cut">FINAL / CUT</div>
          <div className="hero-copy">
            <h1>
              Turn your deck into
              <br />
              <em>a story that speaks.</em>
            </h1>
            <p>
              Create narrated, interactive deck walkthroughs with AI, from PDF to polished pitch
              in minutes.
            </p>
            <div className="hero-buttons">
              <Link className="light-button big" href="/decks/new">
                Get started
              </Link>
              <a className="ghost-button big" href="#studio">
                See how it works
              </a>
            </div>
            <div className="input-chips">
              <span>▧ Your PDF</span>
              <span>⌁ Your voice</span>
              <span>▱ One link</span>
            </div>
          </div>
          <a className="scroll-arrow" href="#studio">
            ↓
          </a>
        </section>

        {/* —— Oasis: iPad demo — real Voxdeck pitch deck —— */}
        <OasisIpadDemo />
      </div>

      {/* Proof strip */}
      <section className="mkt-section overflow-hidden border-y border-[#07111f28] px-[5%] py-12 md:py-16">
        <div className="mx-auto w-full max-w-7xl">
          <p className="mb-8 text-center font-semibold text-[#07111f]">
            Built for decks that have to travel without you
          </p>
          <div className="grid grid-cols-1 items-center justify-items-center gap-8 sm:grid-cols-3">
            {PROOF.map((item) => (
              <div key={item.label} className="text-center">
                <p className="text-sm text-[#526176]">{item.label}</p>
                <p className="mt-1 text-lg font-semibold tracking-tight text-[#07111f]">{item.value}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 01 — The deck graveyard */}
      <section className="mkt-section px-[5%] py-16 md:py-24 lg:py-28">
        <div className="mx-auto grid w-full max-w-7xl grid-cols-1 items-center gap-y-12 md:grid-cols-2 md:gap-x-12 lg:gap-x-20">
          <div>
            <p className="mkt-kicker">01　THE PROBLEM.</p>
            <h2 className="mkt-h2 mb-5 text-4xl md:mb-6 md:text-5xl lg:text-6xl">
              You sent the deck. <em>Then… silence.</em>
            </h2>
            <p className="mkt-body text-lg leading-relaxed md:text-lg">
              A static PDF leaves your story sitting in an inbox. Your recipient has to decide what
              matters, what to read, and whether to come back with questions.
            </p>
          </div>
          <div>
            <ul>
              {QUESTIONS.map((q, i) => (
                <li
                  key={q}
                  className="flex gap-4 border-t border-[#07111f28] py-4 text-lg tracking-tight text-[#07111f] last:border-b"
                >
                  <span className="font-mono text-[#68768a]">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  {q}
                </li>
              ))}
            </ul>
            <p className="mkt-h2 mt-8 text-2xl leading-snug md:text-3xl">
              Your best pitch shouldn&apos;t depend on{" "}
              <em>you being in the room.</em>
            </p>
          </div>
        </div>
      </section>

      {/* 02 — How it works */}
      <section id="how" className="mkt-section border-t border-[#07111f28] px-[5%] py-16 md:py-24 lg:py-28">
        <div className="mx-auto w-full max-w-7xl">
          <div className="mb-12 max-w-lg md:mb-18">
            <p className="mkt-kicker">02　HOW IT WORKS.</p>
            <h2 className="mkt-h2 mb-5 text-4xl md:mb-6 md:text-5xl lg:text-6xl">
              From deck to <em>self-serve pitch</em> in minutes.
            </h2>
            <p className="mkt-body md:text-lg">
              Three steps from your existing deck to a walkthrough your prospect can watch on their
              own time.
            </p>
          </div>
          <div className="grid grid-cols-1 items-start gap-y-12 md:grid-cols-3 md:gap-x-8 md:gap-y-16 lg:gap-x-12">
            {STEPS.map((step) => (
              <div key={step.n}>
                <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-full border border-[#07111f28] font-mono text-sm text-[#07111f] md:mb-6">
                  {step.n}
                </div>
                <h3 className="mb-3 text-xl font-normal text-[#07111f] md:mb-4 md:text-2xl">{step.title}</h3>
                <p className="mkt-body">{step.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 03 — Studio */}
      <section id="studio" className="mkt-section border-t border-[#07111f28] px-[5%] py-16 md:py-24 lg:py-28">
        <StudioRehearseSection />
      </section>

      {/* 04 — What prospect sees */}
      <section className="mkt-section border-t border-[#07111f28] px-[5%] py-16 md:py-24 lg:py-28">
        <div className="mx-auto w-full max-w-7xl">
          <div className="mb-12 max-w-lg md:mb-18">
            <p className="mkt-kicker">04　WHAT YOUR PROSPECT SEES.</p>
            <h2 className="mkt-h2 mb-5 text-4xl md:mb-6 md:text-5xl lg:text-6xl">
              One click. <em>No login.</em> No friction.
            </h2>
            <p className="mkt-body md:text-lg">
              Your recipient gets the story without another meeting. They watch when it suits them
              and keep the context intact.
            </p>
          </div>
          <div className="relative flex flex-col md:flex-row">
            {FLOW.map((item, i) => (
              <div key={item.n} className="relative flex flex-1 gap-6 md:flex-col md:gap-0">
                <div className="flex flex-col items-center md:flex-row md:items-center">
                  <div className="z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[#07111f28] bg-[#eaf3ff] font-mono text-sm text-[#07111f]">
                    {item.n}
                  </div>
                  {i < FLOW.length - 1 && (
                    <div className="h-full w-px grow bg-[#07111f28] md:h-px md:w-full" aria-hidden />
                  )}
                </div>
                <div className="pb-10 md:mt-6 md:pr-6 md:pb-0">
                  <h3 className="mb-2 text-xl font-normal text-[#07111f]">{item.title}</h3>
                  <p className="mkt-body text-sm">{item.body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 05 — Voices */}
      <section id="voices" className="mkt-section border-t border-[#07111f28] px-[5%] py-16 md:py-24 lg:py-28">
        <div className="mx-auto w-full max-w-7xl">
          <div className="mb-12 max-w-lg md:mb-18">
            <p className="mkt-kicker">05　PICK A VOICE.</p>
            <h2 className="mkt-h2 mb-5 text-4xl md:mb-6 md:text-5xl lg:text-6xl">
              Sound like you — <em>or better.</em>
            </h2>
            <p className="mkt-body md:text-lg">
              Choose the voice that fits the way you want your company to sound. Click to preview.
            </p>
          </div>
          <VoicePreviewGrid />
        </div>
      </section>

      {/* —— Oasis: use cases, audience, quote —— */}
      <div className="border-t border-[#07111f28] bg-[#eaf3ff] px-[5%]">
        <div className="oasis-borrow mx-auto w-full max-w-7xl">
          <section className="uses-section" id="use">
            <div className="uses-lead">
              <span>06　USE CASES.</span>
              <h2>
                One deck.
                <br />
                <em>
                  Every story
                  <br />
                  it needs.
                </em>
              </h2>
              <p>
                From the first pitch to the follow-up, Voxdeck turns presentations into guided
                experiences.
              </p>
            </div>
            <div className="uses-grid">
              {OASIS_USES.map((u, i) => (
                <article key={u[0]}>
                  <span>
                    {String(i + 1).padStart(2, "0")} <i>↗</i>
                  </span>
                  <h3>{u[0]}</h3>
                  <p>{u[1]}</p>
                </article>
              ))}
            </div>
            <b className="giant-word">usecases</b>
          </section>

          <section className="audience">
            <div>
              <span>07</span>
              <b>WHO IT&apos;S FOR.</b>
            </div>
            {AUDIENCE.map((x, i) => (
              <article key={x[0]} className={i === 0 ? "active" : ""}>
                <header>
                  <small>✦</small>
                  <small>0{i + 1}</small>
                </header>
                <h3>{x[0]}</h3>
                <p>{x[1]}</p>
              </article>
            ))}
            <b className="giant-word">Founders</b>
          </section>

          <section className="quote" id="quote">
            <div className="quote-top">
              <span>08　WHAT USERS SAY.</span>
              <b>01 / 03</b>
            </div>
            <div className="quote-mark">“</div>
            <blockquote>
              “I sent one link. They understood the whole deck before our next call.”
            </blockquote>
            <p>
              <b>Priya</b>, Founder — early Voxdeck user
            </p>
            <b className="giant-word">Voxdeck</b>
          </section>
        </div>
      </div>

      {/* —— Oasis: closing CTA —— */}
      <div className="oasis-borrow">
        <section className="closing" id="cta">
          <div className="close-orbit o1" />
          <div className="close-orbit o2" />
          <div className="close-orbit o3" />
          <span>09　START WITH LESS.</span>
          <h2>
            Give it the deck
            <br />
            <em>you already have.</em>
          </h2>
          <p>
            Upload a PDF, choose a voice, and share your story.
            <br />
            No redesign. No recording setup.
          </p>
          <div className="closing-cta">
            <Link className="light-button big" href="/decks/new">
              Get started
            </Link>
            <a className="ghost-button big" href="#studio">
              See a walkthrough
            </a>
          </div>
        </section>
      </div>
    </AppShell>
  );
}

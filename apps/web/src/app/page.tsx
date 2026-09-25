import Link from "next/link";
import { Suspense } from "react";
import { AppShell } from "@/components/shell";
import { OasisIpadDemo } from "@/components/marketing/OasisIpadDemo";
import { StudioRehearseSection } from "@/components/marketing/RehearseDemoStage";
import { RefTracker } from "@/components/marketing/RefTracker";
import "./oasis-borrow.css";

const QUESTIONS = [
  "Did they open it?",
  "Did they understand the story?",
  "Should I follow up?",
  "Do I need another meeting to explain it?",
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

const card =
  "rounded-2xl border border-[#07111f28] bg-[#eaf3ff] p-6 md:p-8";

/**
 * Homepage — one blue design language end to end.
 * Light sections share px-[5%] + max-w-7xl + rounded-2xl cards.
 */
export default function Home() {
  return (
    <AppShell variant="marketing">
      <Suspense fallback={null}>
        <RefTracker />
      </Suspense>
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

      {/* 02 — Studio */}
      <section id="studio" className="mkt-section border-t border-[#07111f28] px-[5%] py-16 md:py-24 lg:py-28">
        <StudioRehearseSection />
      </section>

      {/* 03 — What prospect sees */}
      <section className="mkt-section border-t border-[#07111f28] px-[5%] py-16 md:py-24 lg:py-28">
        <div className="mx-auto w-full max-w-7xl">
          <div className="mb-12 max-w-3xl md:mb-14">
            <p className="mkt-kicker">03　WHAT YOUR PROSPECT SEES.</p>
            <h2 className="mkt-h2 mb-5 text-4xl md:mb-6 md:text-5xl lg:text-6xl">
              One click. <em>No login.</em> No friction.
            </h2>
            <p className="mkt-body md:text-lg">
              Your recipient gets the story without another meeting. They watch when it suits them
              and keep the context intact.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5 lg:gap-5">
            {FLOW.map((item) => (
              <div key={item.n} className={card}>
                <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#68768a]">
                  {item.n}
                </span>
                <h3 className="mt-4 text-xl font-normal text-[#07111f]">{item.title}</h3>
                <p className="mkt-body mt-2 text-sm leading-relaxed">{item.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 04 — Use cases */}
      <section id="use" className="mkt-section border-t border-[#07111f28] px-[5%] py-16 md:py-24 lg:py-28">
        <div className="mx-auto w-full max-w-7xl">
          <div className="mb-12 grid grid-cols-1 items-end gap-8 md:mb-14 md:grid-cols-2 md:gap-x-12 lg:gap-x-20">
            <div>
              <p className="mkt-kicker">04　USE CASES.</p>
              <h2 className="mkt-h2 text-4xl md:text-5xl lg:text-6xl">
                One deck.
                <br />
                <em>Every story it needs.</em>
              </h2>
            </div>
            <p className="mkt-body max-w-md md:pb-2 md:text-lg">
              From the first pitch to the follow-up, Voxdeck turns presentations into guided
              experiences.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 lg:gap-5">
            {OASIS_USES.map((u, i) => (
              <article key={u[0]} className={`${card} flex min-h-[160px] flex-col justify-between`}>
                <span className="flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.2em] text-[#68768a]">
                  {String(i + 1).padStart(2, "0")}
                  <span aria-hidden>↗</span>
                </span>
                <div className="mt-6">
                  <h3 className="mb-2 text-xl font-normal text-[#07111f]">{u[0]}</h3>
                  <p className="mkt-body text-sm leading-relaxed">{u[1]}</p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* 05 — Who it's for */}
      <section className="mkt-section border-t border-[#07111f28] px-[5%] py-16 md:py-24 lg:py-28">
        <div className="mx-auto w-full max-w-7xl">
          <div className="mb-12 md:mb-14">
            <p className="mkt-kicker">05　WHO IT&apos;S FOR.</p>
            <h2 className="mkt-h2 max-w-3xl text-4xl md:text-5xl lg:text-6xl">
              Built for teams that <em>ship the story.</em>
            </h2>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 lg:gap-5">
            {AUDIENCE.map((x, i) => (
              <article
                key={x[0]}
                className={`${card} ${i === 0 ? "border-[#176bff] bg-[#176bff]/10" : ""}`}
              >
                <header className="flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.2em] text-[#68768a]">
                  <span>✦</span>
                  <span>0{i + 1}</span>
                </header>
                <h3 className="mt-6 text-2xl font-normal text-[#07111f]">{x[0]}</h3>
                <p className="mkt-body mt-3 text-sm leading-relaxed">{x[1]}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* 06 — Quote */}
      <section id="quote" className="mkt-section border-t border-[#07111f28] px-[5%] py-16 md:py-24 lg:py-28">
        <div className="oasis-borrow mx-auto w-full max-w-7xl">
          <div className="mb-10 flex items-baseline justify-between gap-4">
            <p className="mkt-kicker mb-0">06　WHAT USERS SAY.</p>
            <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#68768a]">
              01 / 03
            </span>
          </div>
          <div className="quote-mark">“</div>
          <blockquote className="mkt-h2 mt-6 max-w-4xl text-4xl leading-tight md:text-5xl lg:text-6xl">
            I sent one link. They understood the whole deck before our next call.
          </blockquote>
          <p className="mkt-body mt-10 text-sm md:text-base">
            <span className="font-semibold text-[#07111f]">Priya</span>, Founder — early Voxdeck
            user
          </p>
        </div>
      </section>

      {/* —— Oasis: closing CTA —— */}
      <div className="oasis-borrow">
        <section className="closing" id="cta">
          <div className="close-orbit o1" />
          <div className="close-orbit o2" />
          <div className="close-orbit o3" />
          <span>07　START WITH LESS.</span>
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

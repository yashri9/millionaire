"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useScroll, useTransform } from "motion/react";
import type { MotionValue } from "motion/react";

/**
 * Marketing entry page (public). PRD §3 step 1.
 * Scroll-driven hero: a fanned deck of slide cards closes into the upload
 * prompt as the visitor scrolls, handing off into a showcase panel.
 */

const PROMPTS = [
  "Walk a prospect through our Series A deck…",
  "Answer the pricing objection automatically…",
  "Publish a link that plays itself, no login…",
  "Hand off to me only when it can't answer…",
];

type SlideCard = {
  title: string;
  lines: [string, string];
  grad: string;
};

const FAN_CARDS: SlideCard[] = [
  { title: "Cover", lines: ["Series A", "Deck"], grad: "linear-gradient(160deg,#2954a6,#5b8def)" },
  { title: "Market", lines: ["$40B", "TAM"], grad: "linear-gradient(160deg,#136a3a,#3fbf6b)" },
  { title: "Product", lines: ["Live", "Demo"], grad: "linear-gradient(160deg,#b4620a,#f2a33c)" },
  { title: "Traction", lines: ["12x", "Growth"], grad: "linear-gradient(160deg,#7a2fb0,#c65ff0)" },
  { title: "Deck Agent", lines: ["Make it", "talk"], grad: "linear-gradient(160deg,#14181c,#3a4552)" },
  { title: "Pricing", lines: ["Plans &", "Terms"], grad: "linear-gradient(160deg,#0a7f8c,#3fd6e8)" },
  { title: "Team", lines: ["Who's", "building"], grad: "linear-gradient(160deg,#a6294f,#f0679a)" },
  { title: "Roadmap", lines: ["Next", "12mo"], grad: "linear-gradient(160deg,#8a5a00,#f2c94c)" },
  { title: "Ask", lines: ["Let's", "talk"], grad: "linear-gradient(160deg,#2954a6,#b4620a)" },
];

const CENTER = (FAN_CARDS.length - 1) / 2;

function FanCard({ index, card, spread }: { index: number; card: SlideCard; spread: MotionValue<number> }) {
  const offset = index - CENTER;
  const baseX = offset * 74;
  const baseRotate = offset * 8;
  const dist = Math.abs(offset);

  const x = useTransform(spread, (s) => baseX * s);
  const rotate = useTransform(spread, (s) => baseRotate * s);
  const opacity = useTransform(
    spread,
    [1, 0.4, 0.12],
    dist >= 3 ? [1, 0.5, 0] : [1, 1, 1]
  );

  return (
    <motion.div
      className="fan-card"
      style={{
        x,
        rotate,
        opacity,
        zIndex: 10 - dist,
        background: card.grad,
      }}
    >
      <span className="fan-card-idx">{card.title}</span>
      <span className="fan-card-line1">{card.lines[0]}</span>
      <span className="fan-card-line2">{card.lines[1]}</span>
    </motion.div>
  );
}

function PromptPill() {
  const [i, setI] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setI((n) => (n + 1) % PROMPTS.length), 2600);
    return () => clearInterval(id);
  }, []);
  return (
    <div className="prompt-pill">
      <span className="prompt-pill-icon" aria-hidden>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
          <path
            d="M14 4l6 6-8.5 8.5a4 4 0 01-5.66-5.66L14.5 4.5"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
      <span className="prompt-pill-text">
        <AnimatePresence mode="wait">
          <motion.span
            key={i}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.28, ease: "easeOut" }}
          >
            {PROMPTS[i]}
          </motion.span>
        </AnimatePresence>
      </span>
      <Link href="/signup" className="prompt-pill-btn" aria-label="Get started">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
          <path
            d="M5 12h14M13 6l6 6-6 6"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </Link>
    </div>
  );
}

export default function Home() {
  const [menuOpen, setMenuOpen] = useState(false);
  const heroRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: heroRef,
    offset: ["start start", "end start"],
  });

  // Chained through an identity transform: binding style opacity directly to
  // the raw useScroll() value doesn't propagate DOM updates in this Motion
  // version, but a value derived from it (even a pass-through) does.
  const progress = useTransform(scrollYProgress, (v) => v);
  const spread = useTransform(progress, [0.05, 0.35], [1, 0.14]);
  const copyOpacity = useTransform(progress, [0.2, 0.38], [1, 0]);
  const copyY = useTransform(progress, [0, 0.4], [0, -70]);
  const glowOpacity = useTransform(progress, [0.28, 0.48], [0, 1]);

  return (
    <div className="home">
      <div className="promo-bar">
        <span>Voice narration is live on Deck Agent</span>
        <Link href="/signup" className="promo-bar-link">
          Try it now →
        </Link>
      </div>

      <header className="site-header">
        <div className="site-header-inner">
          <Link href="/" className="logo">
            <span className="logo-mark" aria-hidden>
              ◆
            </span>
            Deck Agent
          </Link>
          <button
            className="hamburger"
            aria-label="Menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((v) => !v)}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>
          <Link className="btn-accent" href="/signup">
            Start for Free
          </Link>
        </div>
        <AnimatePresence>
          {menuOpen && (
            <motion.div
              className="hamburger-menu"
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.18 }}
            >
              <Link href="/login" onClick={() => setMenuOpen(false)}>
                Log in
              </Link>
              <Link href="/signup" onClick={() => setMenuOpen(false)}>
                Sign up
              </Link>
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      <section ref={heroRef} className="hero-scroll">
        <div className="hero-sticky">
          <motion.div className="hero-copy" style={{ opacity: copyOpacity, y: copyY }}>
            <h1>
              One deck.
              <br />
              Every question,
              <br />
              answered.
            </h1>
            <p>
              Be the pitch&apos;s second voice. Upload a deck, generate a narrated
              walkthrough, and publish a link a prospect can open — no login. When
              it can&apos;t answer confidently, it hands off to you.
            </p>
          </motion.div>

          <div className="fan-stage">
            {FAN_CARDS.map((card, i) => (
              <FanCard key={card.title} index={i} card={card} spread={spread} />
            ))}
          </div>

          <PromptPill />

          <motion.div className="hero-glow" style={{ opacity: glowOpacity }} aria-hidden />
        </div>
      </section>

      <section className="showcase-section">
        <motion.div
          className="showcase-panel"
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.35 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
        >
          <div className="showcase-head">
            <span>Prospect Call</span>
            <span>Voice Narration</span>
          </div>
          <svg className="showcase-line" viewBox="0 0 320 90" fill="none" preserveAspectRatio="none">
            <path
              d="M0 78C60 70 90 20 160 18S280 6 320 6"
              stroke="#f2a33c"
              strokeWidth="2"
              strokeLinecap="round"
            />
            <circle cx="320" cy="6" r="4" fill="#f2a33c" />
          </svg>
          <div className="showcase-cards">
            <div className="showcase-card small">
              <span className="pill warn" style={{ marginBottom: 10 }}>
                Objection
              </span>
              <strong>
                &ldquo;What&apos;s the
                <br />
                pricing?&rdquo;
              </strong>
            </div>
            <div className="showcase-card large">
              <span className="pill" style={{ marginBottom: 10 }}>
                Handled live
              </span>
              <p className="muted" style={{ margin: 0, color: "#c9d3dc" }}>
                &ldquo;Plans start at $29/mo, billed annually — here&apos;s the page
                that breaks it down.&rdquo;
              </p>
            </div>
          </div>
        </motion.div>
      </section>

      <section className="cta-section">
        <h2>Make your next deck talk.</h2>
        <p className="muted">No credit card. Publish your first link in minutes.</p>
        <div className="cta-actions">
          <Link className="btn-accent" href="/signup">
            Get started
          </Link>
          <Link className="btn ghost" href="/login">
            Log in
          </Link>
        </div>
      </section>
    </div>
  );
}

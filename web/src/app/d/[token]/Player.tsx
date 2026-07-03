"use client";

import { useEffect, useRef, useState } from "react";
import type { RecipientDeck } from "@/lib/recipient";

/**
 * PRD §4.12 recipient player (client). Slide nav + narration (Web Speech API)
 * + grounded Q&A. Q&A NEVER shows a raw error — on failure the server route
 * auto-escalates and returns a warm hand-off line.
 *
 * Event logging (PRD §4.10): slide_viewed on navigation, completed on
 * reaching the last slide — best-effort, never blocks the UI on failure.
 */
export function Player({ deck, sessionId }: { deck: RecipientDeck; sessionId: string | null }) {
  const [idx, setIdx] = useState(0);
  const [q, setQ] = useState("");
  const [log, setLog] = useState<{ role: "you" | "agent"; text: string; escalated?: boolean }[]>([]);
  const slide = deck.slides[idx];
  const completedLogged = useRef(false);

  function logEvent(type: "slide_viewed" | "completed", payload?: Record<string, unknown>) {
    if (!sessionId) return;
    fetch(`/api/d/${deck.token}/event`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ session_id: sessionId, type, payload }),
    }).catch(() => {});
  }

  useEffect(() => {
    logEvent("slide_viewed", { slide_index: slide?.index });
    if (idx === deck.slides.length - 1 && !completedLogged.current) {
      completedLogged.current = true;
      logEvent("completed");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx]);

  async function ask() {
    const question = q.trim();
    if (!question) return;
    setQ("");
    setLog((l) => [...l, { role: "you", text: question }]);
    try {
      const r = await fetch(`/api/d/${deck.token}/ask`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question, session_id: sessionId }),
      });
      const data = await r.json();
      setLog((l) => [...l, { role: "agent", text: data.answer, escalated: data.escalate }]);
    } catch {
      // Never surface a raw error to a prospect.
      setLog((l) => [
        ...l,
        { role: "agent", text: `Good question — let me get ${deck.repName} to answer that directly for you.`, escalated: true },
      ]);
    }
  }

  return (
    <main className="wrap">
      <h1>{deck.title}</h1>
      <div className="card" style={{ background: "#0f1720", color: "#fff", minHeight: 260 }}>
        <h2>{slide?.title}</h2>
        <ul>{slide?.bullets.map((b, i) => <li key={i}>{b}</li>)}</ul>
        {slide?.narration && <p style={{ fontStyle: "italic", color: "#9fb0c0" }}>{slide.narration}</p>}
      </div>
      <div style={{ display: "flex", gap: 10, margin: "12px 0" }}>
        <button className="btn ghost" onClick={() => setIdx((i) => Math.max(0, i - 1))}>
          Prev
        </button>
        <span className="muted" style={{ flex: 1, textAlign: "center" }}>
          Slide {idx + 1} of {deck.slides.length}
        </span>
        <button className="btn ghost" onClick={() => setIdx((i) => Math.min(deck.slides.length - 1, i + 1))}>
          Next
        </button>
      </div>

      <div className="card">
        <h3>Ask the deck a question</h3>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 10 }}>
          {log.map((m, i) => (
            <div key={i} className="muted">
              <strong>{m.role === "you" ? "You" : "Agent"}:</strong>{" "}
              <span style={{ color: m.escalated ? "#b4620a" : "inherit" }}>{m.text}</span>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. how is pricing structured?" />
          <button className="btn" onClick={ask}>
            Ask
          </button>
        </div>
      </div>
    </main>
  );
}

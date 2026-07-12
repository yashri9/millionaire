"use client";

import { useEffect, useRef, useState } from "react";
import { ChatBubble } from "@/components/ChatBubble";
import type { RecipientDeck } from "@/lib/recipient";

type LogMsg = { role: "you" | "agent"; text: string; escalated?: boolean; slideRef?: number | null };

/**
 * PRD §4.12 recipient player (client). Slide nav + narration (Web Speech API)
 * + grounded Q&A. Q&A NEVER shows a raw error — on failure the server route
 * auto-escalates and returns a warm hand-off line.
 */
export function Player({ deck, sessionId }: { deck: RecipientDeck; sessionId: string | null }) {
  const [idx, setIdx] = useState(0);
  const [q, setQ] = useState("");
  const [asking, setAsking] = useState(false);
  const [log, setLog] = useState<LogMsg[]>([]);
  const completedLogged = useRef(false);
  const slide = deck.slides[idx];

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
    if (!question || asking) return;
    setQ("");
    setLog((l) => [...l, { role: "you", text: question }]);
    setAsking(true);
    try {
      const r = await fetch(`/api/d/${deck.token}/ask`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question, session_id: sessionId }),
      });
      const data = await r.json();
      setLog((l) => [
        ...l,
        { role: "agent", text: data.answer, escalated: data.escalate, slideRef: data.slide_ref },
      ]);
    } catch {
      setLog((l) => [
        ...l,
        {
          role: "agent",
          text: `Good question — let me get ${deck.repName} to answer that directly for you.`,
          escalated: true,
        },
      ]);
    } finally {
      setAsking(false);
    }
  }

  return (
    <main className="wrap page-enter">
      <h1>{deck.title}</h1>

      <div className="player-card">
        <div className="player-head">
          <span className="who">Shared by {deck.repName}</span>
          <div className="progress-dots">
            {deck.slides.map((_, i) => (
              <span key={i} className={i === idx ? "active" : i < idx ? "done" : ""} />
            ))}
          </div>
        </div>
        <div className="stage-view">
          <div className="stage-inner">
            <div className="textslide">
              <h2>{slide?.title || `Slide ${idx + 1}`}</h2>
              <p>{slide?.bullets?.length ? slide.bullets.join("\n") : slide?.text}</p>
            </div>
          </div>
          {slide?.narration && <div className="caption">{slide.narration}</div>}
        </div>
        <div className="controls">
          <button className="btn ghost" onClick={() => setIdx((i) => Math.max(0, i - 1))} disabled={idx === 0}>
            ◀ Prev
          </button>
          <span className="muted" style={{ flex: 1, textAlign: "center", fontSize: 12 }}>
            Slide {idx + 1} of {deck.slides.length}
          </span>
          <button
            className="btn ghost"
            onClick={() => setIdx((i) => Math.min(deck.slides.length - 1, i + 1))}
            disabled={idx >= deck.slides.length - 1}
          >
            Next ▶
          </button>
        </div>
      </div>

      <div className="qa-card" style={{ marginTop: 16 }}>
        <h3>Ask the deck a question</h3>
        <div className="transcript">
          {log.map((m, i) => (
            <ChatBubble
              key={i}
              className={`msg ${m.role === "you" ? "prospect" : "agent"} ${m.escalated ? "escalated" : ""}`}
            >
              {m.text}
              {m.slideRef && <span className="cite">from slide {m.slideRef}</span>}
            </ChatBubble>
          ))}
          {asking && (
            <div className="loading-block" style={{ flexDirection: "row", padding: 8 }}>
              <div className="spinner sm" />
              <span className="muted" style={{ fontSize: 13 }}>Thinking…</span>
            </div>
          )}
        </div>
        <div className="qa-input-row">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && ask()}
            placeholder="e.g. how is pricing structured?"
            disabled={asking}
          />
          <button className="btn" onClick={ask} disabled={asking || !q.trim()}>
            Ask
          </button>
        </div>
      </div>
    </main>
  );
}

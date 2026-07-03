"use client";

import { useEffect, useRef, useState } from "react";
import { TalkingAvatar, useTalkingMouth } from "@/components/TalkingAvatar";
import type { RecipientDeck } from "@/lib/recipient";

/**
 * PRD §4.12 recipient player (client). Slide nav + narration (Web Speech API)
 * + grounded Q&A. Q&A NEVER shows a raw error — on failure the server route
 * auto-escalates and returns a warm hand-off line.
 *
 * Event logging (PRD §4.10): slide_viewed on navigation, completed on
 * reaching the last slide — best-effort, never blocks the UI on failure.
 *
 * This is the simplified sibling of the sender's rehearsal playback in
 * decks/[id]/edit/LivePreview.tsx (same useTalkingMouth-driven avatar/speech
 * pattern, no engagement console since there's no one to show it to here).
 * If you change how narration is spoken, check whether that file needs the
 * same change.
 */
export function Player({ deck, sessionId }: { deck: RecipientDeck; sessionId: string | null }) {
  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const { speaking, mouthOpen, attach, stop: stopMouth } = useTalkingMouth();
  const [q, setQ] = useState("");
  const [log, setLog] = useState<{ role: "you" | "agent"; text: string; escalated?: boolean }[]>([]);
  const slide = deck.slides[idx];
  const completedLogged = useRef(false);
  const playingRef = useRef(playing);
  playingRef.current = playing;
  const idxRef = useRef(idx);
  idxRef.current = idx;

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

  useEffect(() => {
    return () => window.speechSynthesis.cancel();
  }, []);

  function speak(i: number) {
    window.speechSynthesis.cancel();
    const text = deck.slides[i]?.narration;
    if (!text || !("speechSynthesis" in window)) return;
    const u = new SpeechSynthesisUtterance(text);
    attach(u, () => {
      if (playingRef.current && idxRef.current < deck.slides.length - 1) {
        setIdx((n) => n + 1);
        speak(idxRef.current + 1);
      } else {
        setPlaying(false);
      }
    });
    window.speechSynthesis.speak(u);
  }

  function togglePlay() {
    if (playing) {
      setPlaying(false);
      window.speechSynthesis.cancel();
      stopMouth();
    } else {
      setPlaying(true);
      speak(idx);
    }
  }

  function goTo(next: number) {
    setPlaying(false);
    window.speechSynthesis.cancel();
    stopMouth();
    setIdx(Math.max(0, Math.min(deck.slides.length - 1, next)));
  }

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
      <div className="card" style={{ background: "#0f1720", color: "#fff", minHeight: 260, position: "relative" }}>
        <h2>{slide?.title}</h2>
        <ul>{slide?.bullets.map((b, i) => <li key={i}>{b}</li>)}</ul>
        {slide?.narration && <p style={{ fontStyle: "italic", color: "#9fb0c0" }}>{slide.narration}</p>}
        {slide?.narration && (
          <div style={{ position: "absolute", bottom: 16, right: 16, borderRadius: 14, overflow: "hidden", boxShadow: "0 6px 20px rgba(0,0,0,.4)" }}>
            <TalkingAvatar speaking={speaking} mouthOpen={mouthOpen} size={56} />
          </div>
        )}
      </div>
      <div style={{ display: "flex", gap: 10, margin: "12px 0" }}>
        <button className="btn ghost" onClick={() => goTo(idx - 1)}>
          Prev
        </button>
        <button className="btn" onClick={togglePlay} disabled={!slide?.narration}>
          {playing ? "⏸ Pause" : "▶ Play narration"}
        </button>
        <span className="muted" style={{ flex: 1, textAlign: "center" }}>
          Slide {idx + 1} of {deck.slides.length}
        </span>
        <button className="btn ghost" onClick={() => goTo(idx + 1)}>
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

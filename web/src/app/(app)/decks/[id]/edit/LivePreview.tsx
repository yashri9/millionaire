"use client";

import { useEffect, useRef, useState } from "react";
import { TalkingAvatar, useTalkingMouth } from "@/components/TalkingAvatar";
import type { Deck, InboxItem, Share, Slide, TranscriptMsg } from "./types";

const SUGGESTIONS = [
  "How is pricing structured?",
  "What's the implementation timeline?",
  "How is this different from doing it manually?",
];

export function LivePreview({
  deck,
  slides,
  narration,
  repName,
  voiceName,
  voiceRate,
  share,
  onBack,
  onPublish,
  onRevoke,
  publishing,
}: {
  deck: Deck;
  slides: Slide[];
  narration: Record<string, string>;
  repName: string;
  voiceName: string;
  voiceRate: number;
  share: Share;
  onBack: () => void;
  onPublish: () => Promise<void>;
  onRevoke: () => Promise<void>;
  publishing: boolean;
}) {
  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const { speaking, mouthOpen, attach, stop: stopMouth } = useTalkingMouth();
  const [caption, setCaption] = useState("");
  const [dwell, setDwell] = useState<number[]>(() => slides.map(() => 0));
  const [questionsCount, setQuestionsCount] = useState(0);
  const [transcript, setTranscript] = useState<TranscriptMsg[]>([]);
  const [inbox, setInbox] = useState<InboxItem[]>([]);
  const [qaInput, setQaInput] = useState("");
  const [beamFire, setBeamFire] = useState(false);
  const inputRowRef = useRef<HTMLDivElement>(null);
  const inboxRef = useRef<HTMLDivElement>(null);
  const beamRef = useRef<HTMLDivElement>(null);

  const dwellTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const dwellStart = useRef<number>(Date.now());
  const playingRef = useRef(playing);
  playingRef.current = playing;

  const slide = slides[idx];
  const rep = repName.trim() || "the rep";

  function pickVoice(u: SpeechSynthesisUtterance) {
    const voices = window.speechSynthesis.getVoices();
    const v = voices.find((x) => x.name === voiceName);
    if (v) u.voice = v;
    u.rate = voiceRate;
  }

  function goLive(i: number, speak: boolean) {
    if (i < 0 || i >= slides.length) return;
    window.speechSynthesis.cancel();
    if (dwellTimer.current) clearInterval(dwellTimer.current);
    setIdx(i);
    setCaption("");
    dwellStart.current = Date.now();
    dwellTimer.current = setInterval(() => {
      const secs = (Date.now() - dwellStart.current) / 1000;
      setDwell((d) => d.map((v, di) => (di === i ? secs : v)));
    }, 200);

    if (speak) {
      const text = narration[slides[i].id] ?? "";
      setCaption(text);
      if (!text || !("speechSynthesis" in window)) {
        stopMouth();
        return;
      }
      const u = new SpeechSynthesisUtterance(text);
      pickVoice(u);
      attach(u, () => {
        if (playingRef.current) {
          if (i < slides.length - 1) goLive(i + 1, true);
          else setPlaying(false);
        }
      });
      window.speechSynthesis.speak(u);
    }
  }

  useEffect(() => {
    goLive(0, false);
    return () => {
      window.speechSynthesis.cancel();
      if (dwellTimer.current) clearInterval(dwellTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function togglePlay() {
    if (playing) {
      setPlaying(false);
      window.speechSynthesis.cancel();
      stopMouth();
    } else {
      setPlaying(true);
      const start = idx >= slides.length - 1 ? 0 : idx;
      goLive(start, true);
    }
  }

  function prev() {
    setPlaying(false);
    goLive(idx - 1, false);
  }
  function next() {
    setPlaying(false);
    goLive(idx + 1, false);
  }

  function fireBeam() {
    const from = inputRowRef.current?.getBoundingClientRect();
    const to = inboxRef.current?.getBoundingClientRect();
    if (from && to && beamRef.current) {
      beamRef.current.style.setProperty("--sx", `${from.left}px`);
      beamRef.current.style.setProperty("--sy", `${from.top}px`);
      beamRef.current.style.setProperty("--tx", `${to.left}px`);
      beamRef.current.style.setProperty("--ty", `${to.top}px`);
    }
    setBeamFire(false);
    requestAnimationFrame(() => setBeamFire(true));
  }

  async function askLive() {
    const q = qaInput.trim();
    if (!q) return;
    setQaInput("");
    setQuestionsCount((c) => c + 1);
    setTranscript((t) => [...t, { role: "prospect", text: q }]);
    setTranscript((t) => [...t, { role: "agent-thinking", text: "…" }]);

    try {
      const res = await fetch(`/api/decks/${deck.id}/rehearse-ask`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question: q, rep_name: rep }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "rehearse-ask failed");
      setTranscript((t) => [
        ...t.slice(0, -1),
        { role: "agent", text: data.answer, escalated: !!data.escalate, slideRef: data.slide_ref },
      ]);
      if (data.escalate) fireBeam();
      setInbox((prevInbox) => [
        { question: q, answer: data.answer, escalated: !!data.escalate, slideRef: data.slide_ref ?? null, ts: new Date() },
        ...prevInbox,
      ]);
    } catch {
      const fallback = `Good question — let me get ${rep} to answer that directly for you.`;
      setTranscript((t) => [...t.slice(0, -1), { role: "agent", text: fallback, escalated: true, slideRef: null }]);
      fireBeam();
      setInbox((prevInbox) => [
        { question: q, answer: fallback, escalated: true, slideRef: null, ts: new Date() },
        ...prevInbox,
      ]);
    }
  }

  const watched = idx + 1;
  const completion = Math.round((watched / slides.length) * 100);

  return (
    <div className="live">
      <div className="console">
        <div className="card">
          <h3>Engagement · {rep}</h3>
          <div className="metric-row"><span>Opened</span><span className="val">just now</span></div>
          <div className="metric-row"><span>Slides watched</span><span className="val">{watched} / {slides.length}</span></div>
          <div className="metric-row"><span>Completion</span><span className="val">{completion}%</span></div>
          <div className="metric-row"><span>Questions asked</span><span className="val">{questionsCount}</span></div>
        </div>
        <div className="card">
          <h3>Slide dwell time</h3>
          {slides.map((s, i) => (
            <div className="metric-row" key={s.id}>
              <span>{String(s.order_index).padStart(2, "0")} · {(s.title || `Page ${s.order_index}`).slice(0, 22)}</span>
              <span className="val">{dwell[i]?.toFixed(1) ?? "0.0"}s</span>
            </div>
          ))}
        </div>
        <div className="card">
          <h3>Rep inbox — live signal</h3>
          <div ref={inboxRef}>
            {inbox.length === 0 && <div className="inbox-empty">No questions yet. Ask something on the right →</div>}
            {inbox.map((item, i) => (
              <div key={i} className={`inbox-item ${item.escalated ? "escalated" : "answered"}`}>
                <span className="badge">{item.escalated ? `Escalated to ${rep}` : "Answered from deck"}</span>
                <div className="q">{item.question}</div>
                <div>{item.answer}</div>
                <div className="meta">{item.ts.toLocaleTimeString()}{item.slideRef ? ` · slide ${item.slideRef}` : ""}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="card">
          <h3>Publish</h3>
          <p className="muted" style={{ marginBottom: 12 }}>
            Happy with the walkthrough? Publish a full-screen link anyone can watch.
          </p>
          <button className="btn" style={{ width: "100%" }} onClick={onPublish} disabled={publishing}>
            {publishing ? "Publishing…" : deck.status === "published" ? "Republish → shareable link" : "Publish → shareable link"}
          </button>
          {share && (
            <div className="share-card" style={{ marginTop: 16 }}>
              <div className="share-link-row">
                <input readOnly value={share.url} />
                <button className="btn ghost" onClick={() => navigator.clipboard.writeText(share.url)}>Copy</button>
                <button className="btn" onClick={() => window.open(share.url, "_blank")}>Open ↗</button>
              </div>
              <button className="btn ghost" style={{ marginTop: 10 }} onClick={onRevoke}>Revoke</button>
            </div>
          )}
        </div>
        <button className="btn ghost" style={{ fontSize: 12 }} onClick={onBack}>← Back to review</button>
      </div>

      <div className="prospect">
        <div className="player-card">
          <div className="player-head">
            <span className="who">Preview · how a recipient experiences it</span>
            <div className="progress-dots">
              {slides.map((_, i) => (
                <span key={i} className={i === idx ? "active" : i < idx ? "done" : ""} />
              ))}
            </div>
          </div>
          <div className="stage-view">
            <div className="speaking-dot">
              <span className={`pulse ${speaking ? "live" : ""}`} />
              <span>{speaking ? "speaking…" : "idle"}</span>
            </div>
            <div className="avatar-pip">
              <TalkingAvatar speaking={speaking} mouthOpen={mouthOpen} />
            </div>
            <div className="stage-inner">
              {slide?.image_url ? (
                <img src={slide.image_url} alt={`Slide ${slide.order_index}`} />
              ) : (
                <div className="textslide">
                  <h2>{slide?.title || `Slide ${slide?.order_index}`}</h2>
                  <p>{slide?.bullets.join("\n")}</p>
                </div>
              )}
            </div>
            <div className="caption">{caption}</div>
          </div>
          <div className="controls">
            <button className="btn ghost" onClick={prev}>◀ Prev</button>
            <button className="btn" onClick={togglePlay}>
              {playing ? "⏸ Pause" : idx >= slides.length - 1 && !playing && dwell[idx] > 0 ? "▶ Replay from start" : "▶ Play narration"}
            </button>
            <button className="btn ghost" onClick={next}>Next ▶</button>
            <span style={{ flex: 1 }} />
            <span className="muted" style={{ fontSize: 11.5, fontFamily: "monospace" }}>
              Slide {idx + 1} of {slides.length}
            </span>
          </div>
        </div>

        <div className="qa-card">
          <h3>Ask the deck a question</h3>
          <div className="transcript">
            {transcript.map((m, i) => (
              <div
                key={i}
                className={`msg ${m.role === "prospect" ? "prospect" : "agent"} ${m.escalated ? "escalated" : ""}`}
              >
                {m.text}
                {m.slideRef && <span className="cite">from slide {m.slideRef}</span>}
              </div>
            ))}
          </div>
          <div className="suggest">
            {SUGGESTIONS.map((s) => (
              <button key={s} onClick={() => { setQaInput(s); }}>{s}</button>
            ))}
          </div>
          <div className="qa-input-row" ref={inputRowRef}>
            <input
              value={qaInput}
              onChange={(e) => setQaInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && askLive()}
              placeholder="e.g. how is pricing structured?"
            />
            <button className="btn" onClick={askLive}>Ask</button>
          </div>
        </div>
      </div>

      <div ref={beamRef} className={`signal-beam ${beamFire ? "fire" : ""}`} />
    </div>
  );
}

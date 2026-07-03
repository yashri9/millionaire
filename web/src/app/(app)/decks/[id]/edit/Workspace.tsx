"use client";

/**
 * Workspace.tsx — the "review pages / edit narration" screen, the first
 * thing shown after page.tsx (the parent) loads a deck. All state here is
 * owned by the parent (page.tsx) and passed down as props/callbacks — this
 * component is pure UI, no fetch calls of its own except the browser-local
 * `speechSynthesis.getVoices()` list for the voice picker.
 *
 * Layout: a header bar (title, page count, rep name, duration picker,
 * generate button) → the page grid (thumbnails + narration textareas,
 * clicking a thumbnail opens Lightbox.tsx via onOpenLightbox) → a sticky
 * action bar (voice controls + "Walk through your build" which switches the
 * parent to LivePreview.tsx).
 */
import { useEffect, useState } from "react";
import type { Deck, Slide } from "./types";

export function Workspace({
  deck,
  slides,
  narration,
  onNarrationChange,
  saveState,
  repName,
  onRepNameChange,
  voiceName,
  onVoiceNameChange,
  voiceRate,
  onVoiceRateChange,
  generating,
  onGenerate,
  renderWarning,
  onOpenLightbox,
  onEnterLive,
}: {
  deck: Deck;
  slides: Slide[];
  narration: Record<string, string>;
  onNarrationChange: (slideId: string, text: string) => void;
  saveState: "idle" | "saving" | "saved" | "failed";
  repName: string;
  onRepNameChange: (v: string) => void;
  voiceName: string;
  onVoiceNameChange: (v: string) => void;
  voiceRate: number;
  onVoiceRateChange: (v: number) => void;
  generating: boolean;
  onGenerate: (durationMinutes: 1 | 2 | 5) => void;
  renderWarning: string | null;
  onOpenLightbox: (index: number) => void;
  onEnterLive: () => void;
}) {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [durationMinutes, setDurationMinutes] = useState<1 | 2 | 5>(1);
  const narrationReady = slides.length > 0 && slides.every((s) => narration[s.id]?.trim());
  const anyNarration = Object.values(narration).some((t) => t.trim());

  useEffect(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    function load() {
      const list = window.speechSynthesis.getVoices();
      if (list.length) setVoices(list);
    }
    load();
    window.speechSynthesis.onvoiceschanged = load;
  }, []);

  function previewVoice() {
    if (!("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const sample =
      (slides[0] && narration[slides[0].id]) || "This is how your published deck will sound to a prospect.";
    const u = new SpeechSynthesisUtterance(sample);
    const v = voices.find((x) => x.name === voiceName);
    if (v) u.voice = v;
    u.rate = voiceRate;
    window.speechSynthesis.speak(u);
  }

  return (
    <>
      <div className="studio-head">
        <h2 style={{ flex: 1 }}>{deck.title}</h2>
        <span className="pill">{slides.length} {slides.length === 1 ? "page" : "pages"}</span>
        {renderWarning && <span className="pill warn">text-only</span>}
        <label style={{ display: "flex", flexDirection: "row", alignItems: "center", gap: 8, margin: 0 }}>
          <span className="muted" style={{ fontSize: 12 }}>Rep name</span>
          <input
            style={{ width: 140 }}
            value={repName}
            onChange={(e) => onRepNameChange(e.target.value)}
            placeholder="e.g. Priya"
          />
        </label>
        <label style={{ display: "flex", flexDirection: "row", alignItems: "center", gap: 8, margin: 0 }}>
          <span className="muted" style={{ fontSize: 12 }}>Target length</span>
          <select
            style={{ width: "auto" }}
            value={durationMinutes}
            onChange={(e) => setDurationMinutes(Number(e.target.value) as 1 | 2 | 5)}
          >
            <option value={1}>~1 min</option>
            <option value={2}>~2 min</option>
            <option value={5}>~5 min</option>
          </select>
        </label>
        <button className="btn ghost" onClick={() => onGenerate(durationMinutes)} disabled={generating || slides.length === 0}>
          {generating ? "Generating…" : anyNarration ? "Regenerate narration" : "Generate narration →"}
        </button>
      </div>

      {renderWarning && <div className="warn" style={{ color: "var(--escalate)", background: "var(--escalate-soft)", border: "1px solid #ebc694", borderRadius: 8, padding: "9px 12px", fontSize: "12.5px", marginBottom: 16 }}>{renderWarning}</div>}

      {narrationReady && (
        <p className="muted" style={{ marginTop: 0, marginBottom: 16 }}>
          Click any page to enlarge. Edit narration below each slide — nothing is published until you press Publish.
        </p>
      )}

      {slides.length === 0 ? (
        <p className="muted">
          {deck.status === "parse_failed" ? "Parsing this upload failed. Go back to the dashboard to retry." : "No slides yet."}
        </p>
      ) : (
        <div className="page-grid">
          {slides.map((s, i) => (
            <div key={s.id} className="page-card">
              <div className="page-thumb" onClick={() => s.thumb_url && onOpenLightbox(i)}>
                <span className="idx">{String(s.order_index).padStart(2, "0")}</span>
                {s.thumb_url ? (
                  <img src={s.thumb_url} alt={`Slide ${s.order_index}`} loading="lazy" />
                ) : (
                  <div className="noimg">no page image<br />(text only)</div>
                )}
              </div>
              <div className="page-body">
                <div className="lab">Narration</div>
                <textarea
                  rows={3}
                  value={narration[s.id] ?? ""}
                  onChange={(e) => onNarrationChange(s.id, e.target.value)}
                  placeholder="Not generated yet — press &ldquo;Generate narration&rdquo;."
                />
              </div>
            </div>
          ))}
        </div>
      )}

      {slides.length > 0 && (
        <div className="actionbar">
          <div className="voice-ctl">
            <label>
              Voice
              <select value={voiceName} onChange={(e) => onVoiceNameChange(e.target.value)}>
                {voices.map((v) => (
                  <option key={v.name} value={v.name}>{v.name} ({v.lang})</option>
                ))}
              </select>
            </label>
            <label>
              Speed
              <input
                type="range"
                min={0.7}
                max={1.3}
                step={0.05}
                value={voiceRate}
                onChange={(e) => onVoiceRateChange(parseFloat(e.target.value))}
              />
            </label>
            <button className="btn ghost" onClick={previewVoice} type="button">▶ Preview voice</button>
          </div>
          <span style={{ flex: 1 }} />
          <span className="muted" style={{ fontSize: 12 }}>
            {saveState === "saving" && "Saving…"}
            {saveState === "saved" && "Saved"}
            {saveState === "failed" && "Save failed"}
          </span>
          <button className="btn" onClick={onEnterLive} disabled={!narrationReady}>
            Walk through your build →
          </button>
        </div>
      )}
    </>
  );
}

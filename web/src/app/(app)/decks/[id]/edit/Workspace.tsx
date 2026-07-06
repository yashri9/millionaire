"use client";

/**
 * Workspace.tsx — the "review pages / edit narration" screen, the first
 * thing shown after page.tsx (the parent) loads a deck. All state here is
 * owned by the parent (page.tsx) and passed down as props/callbacks — this
 * component is pure UI, no fetch calls of its own except the browser-local
 * `speechSynthesis.getVoices()` list for the voice picker.
 *
 * Layout: a header bar (title, page count, rep name, duration picker,
 * generate button) → a time meter (total + per-slide estimated spoken
 * duration, click a slide or its segment to highlight the other) → one row
 * per slide (page image left, narration right — this screen is about the
 * script and its timing, not a visual page browser, hence one column of
 * full-width rows instead of a thumbnail grid) → a collapsible Voice &
 * Avatar panel → a sticky action bar ("Walk through your build").
 */
import { useEffect, useMemo, useState } from "react";
import type { Deck, Slide } from "./types";

/** Mirrors lib/prompts.ts's WORDS_PER_MINUTE — keep both in sync if you tune pacing. */
const WORDS_PER_MINUTE = 150;

function estimateSeconds(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return (words / WORDS_PER_MINUTE) * 60;
}

function formatDuration(totalSeconds: number): string {
  const s = Math.round(totalSeconds);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

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
  onReparse,
  reparsing,
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
  onReparse: () => void;
  reparsing: boolean;
  onOpenLightbox: (index: number) => void;
  onEnterLive: () => void;
}) {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [durationMinutes, setDurationMinutes] = useState<1 | 2 | 5>(1);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const narrationReady = slides.length > 0 && slides.every((s) => narration[s.id]?.trim());
  const anyNarration = Object.values(narration).some((t) => t.trim());

  const durations = useMemo(() => slides.map((s) => estimateSeconds(narration[s.id] ?? "")), [slides, narration]);
  const totalSeconds = useMemo(() => durations.reduce((a, b) => a + b, 0), [durations]);
  const maxSeconds = Math.max(1, ...durations);

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

      {renderWarning && (
        <div
          className="warn"
          style={{
            color: "var(--escalate)",
            background: "var(--escalate-soft)",
            border: "1px solid #ebc694",
            borderRadius: 8,
            padding: "9px 12px",
            fontSize: "12.5px",
            marginBottom: 16,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <span>{renderWarning}</span>
          <button className="btn ghost" onClick={onReparse} disabled={reparsing} style={{ flexShrink: 0 }}>
            {reparsing ? "Re-parsing…" : "Re-parse"}
          </button>
        </div>
      )}

      {narrationReady && (
        <p className="muted" style={{ marginTop: 0, marginBottom: 16 }}>
          Click any page to enlarge. Edit narration alongside it — nothing is published until you press Publish.
        </p>
      )}

      {slides.length === 0 ? (
        <p className="muted">
          {deck.status === "parse_failed" ? "Parsing this upload failed. Go back to the dashboard to retry." : "No slides yet."}
        </p>
      ) : (
        <div className="script-editor">
          <div className="time-meter">
            <div className="time-meter-total">{formatDuration(totalSeconds)}</div>
            <div className="time-meter-track">
              {slides.map((s, i) => (
                <div
                  key={s.id}
                  className={`time-meter-seg ${activeIndex === i ? "active" : ""}`}
                  style={{ flexGrow: Math.max(0.15, durations[i] / maxSeconds) }}
                  onClick={() => setActiveIndex(activeIndex === i ? null : i)}
                  title={`Slide ${s.order_index} · ${formatDuration(durations[i])}`}
                >
                  <span className="time-meter-seg-label">{formatDuration(durations[i])}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="slide-rows">
            {slides.map((s, i) => (
              <div
                key={s.id}
                className={`slide-row ${activeIndex === i ? "active" : ""}`}
                onClick={() => setActiveIndex(i)}
              >
                <div className="slide-row-image" onClick={(e) => { e.stopPropagation(); s.image_url && onOpenLightbox(i); }}>
                  <span className="idx">{String(s.order_index).padStart(2, "0")}</span>
                  {s.image_url ? (
                    <img src={s.image_url} alt={`Slide ${s.order_index}`} loading="lazy" />
                  ) : (
                    <div className="noimg">no page image<br />(text only)</div>
                  )}
                </div>
                <div className="slide-row-script">
                  <div className="lab">Narration · {formatDuration(durations[i])}</div>
                  <textarea
                    rows={5}
                    value={narration[s.id] ?? ""}
                    onChange={(e) => onNarrationChange(s.id, e.target.value)}
                    onFocus={() => setActiveIndex(i)}
                    placeholder="Not generated yet — press &ldquo;Generate narration&rdquo;."
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {slides.length > 0 && (
        <>
          <div className="card" style={{ marginTop: 16 }}>
            <button
              type="button"
              onClick={() => setSettingsOpen((o) => !o)}
              style={{
                background: "none", border: "none", cursor: "pointer", padding: 0,
                display: "flex", alignItems: "center", width: "100%", font: "inherit", color: "inherit",
              }}
            >
              <h3 style={{ margin: 0, flex: 1, textAlign: "left" }}>Voice &amp; avatar</h3>
              <span className="muted">{settingsOpen ? "▲ Hide" : "▼ Choose"}</span>
            </button>

            {settingsOpen && (
              <div style={{ marginTop: 16, display: "grid", gap: 20 }}>
                <div>
                  <div className="lab" style={{ marginBottom: 8 }}>Voice</div>
                  <div className="voice-ctl">
                    <label>
                      Browser voice
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
                  <div className="pill warn" style={{ marginTop: 10 }}>Premium voices (ElevenLabs) — coming soon</div>
                </div>

                <div>
                  <div className="lab" style={{ marginBottom: 8 }}>Avatar</div>
                  <div className="avatar-picker">
                    <div className="avatar-option selected">
                      <div className="avatar-option-preview">🔷</div>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 13 }}>2D talking avatar</div>
                        <div className="muted" style={{ fontSize: 12 }}>Free · included now</div>
                      </div>
                    </div>
                    <div className="avatar-option locked">
                      <div className="avatar-option-preview">🧑</div>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 13 }}>Realistic AI avatar</div>
                        <div className="muted" style={{ fontSize: 12 }}>Coming soon on a paid plan</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="actionbar">
            <span className="muted" style={{ fontSize: 12 }}>
              {saveState === "saving" && "Saving…"}
              {saveState === "saved" && "Saved"}
              {saveState === "failed" && "Save failed"}
            </span>
            <span style={{ flex: 1 }} />
            <button className="btn" onClick={onEnterLive} disabled={!narrationReady}>
              Walk through your build →
            </button>
          </div>
        </>
      )}
    </>
  );
}

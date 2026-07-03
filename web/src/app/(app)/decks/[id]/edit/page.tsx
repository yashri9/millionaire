"use client";

import { use, useCallback, useEffect, useMemo, useRef, useState } from "react";

type Slide = { id: string; order_index: number; title: string; bullets: string[] };
type Script = { id: string; is_published: boolean; narration: { slide_id: string; text: string }[] };
type Deck = { id: string; title: string; status: "uploading" | "parse_failed" | "draft" | "published" };
type Share = { token: string; url: string } | null;

type SaveState = "idle" | "saving" | "saved" | "failed";

/**
 * PRD §4.6-4.9 Script generation + editor + publish. Debounced autosave
 * (1.5s) with a Saved/Saving/Save-failed indicator; publish is gated on
 * every slide having narration (enforced again server-side either way).
 */
export default function EditDeckPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);

  const [deck, setDeck] = useState<Deck | null>(null);
  const [slides, setSlides] = useState<Slide[]>([]);
  const [narration, setNarration] = useState<Record<string, string>>({});
  const [share, setShare] = useState<Share>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [error, setError] = useState<string | null>(null);

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/decks/${id}`);
    if (!res.ok) {
      setError("Couldn't load this deck.");
      setLoading(false);
      return;
    }
    const data: { deck: Deck; slides: Slide[]; script: Script | null; share: Share } = await res.json();
    setDeck(data.deck);
    setSlides(data.slides);
    setShare(data.share);
    const byId: Record<string, string> = {};
    for (const n of data.script?.narration ?? []) byId[n.slide_id] = n.text;
    setNarration(byId);
    setLoading(false);
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const allNarrated = useMemo(
    () => slides.length > 0 && slides.every((s) => narration[s.id]?.trim()),
    [slides, narration],
  );

  async function generateScript() {
    setGenerating(true);
    setError(null);
    const res = await fetch(`/api/decks/${id}/generate-script`, { method: "POST" });
    const data = await res.json().catch(() => null);
    setGenerating(false);
    if (!res.ok) {
      setError(data?.error ?? "Couldn't generate a script. Try again.");
      return;
    }
    const byId: Record<string, string> = {};
    for (const n of data.script.narration as { slide_id: string; text: string }[]) byId[n.slide_id] = n.text;
    setNarration(byId);
  }

  function scheduleSave(next: Record<string, string>) {
    setSaveState("saving");
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      const payload = Object.entries(next).map(([slide_id, text]) => ({ slide_id, text }));
      const res = await fetch(`/api/decks/${id}/script`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ narration: payload }),
      });
      setSaveState(res.ok ? "saved" : "failed");
    }, 1500);
  }

  function onNarrationChange(slideId: string, text: string) {
    const next = { ...narration, [slideId]: text };
    setNarration(next);
    scheduleSave(next);
  }

  async function publish() {
    setPublishing(true);
    setError(null);
    const res = await fetch(`/api/decks/${id}/publish`, { method: "POST" });
    const data = await res.json().catch(() => null);
    setPublishing(false);
    if (!res.ok) {
      setError(data?.error ?? "Couldn't publish. Try again.");
      return;
    }
    setShare(data);
    setDeck((d) => (d ? { ...d, status: "published" } : d));
  }

  async function revoke() {
    if (!share) return;
    if (!confirm("Revoke this link? Anyone who has it will immediately lose access.")) return;
    await fetch(`/api/shares/${share.token}/revoke`, { method: "POST" });
    setShare(null);
  }

  async function copyLink() {
    if (!share) return;
    await navigator.clipboard.writeText(share.url);
  }

  if (loading) return <p className="muted">Loading…</p>;
  if (!deck) return <p className="muted">{error ?? "Deck not found."}</p>;

  const active = slides[activeIndex];

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <h1 style={{ flex: 1 }}>{deck.title}</h1>
        <button className="btn ghost" onClick={generateScript} disabled={generating || slides.length === 0}>
          {generating ? "Generating…" : narration && Object.keys(narration).length > 0 ? "Regenerate all" : "Generate script"}
        </button>
        <button className="btn" onClick={publish} disabled={publishing || !allNarrated}>
          {publishing ? "Publishing…" : deck.status === "published" ? "Republish" : "Publish"}
        </button>
      </div>

      {error && <p style={{ color: "#b3261e" }}>{error}</p>}

      {share && (
        <div className="card" style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 12 }}>
          <span className="muted" style={{ flex: 1, wordBreak: "break-all" }}>{share.url}</span>
          <button className="btn ghost" onClick={copyLink}>Copy link</button>
          <button className="btn ghost" onClick={revoke}>Revoke</button>
        </div>
      )}

      {slides.length === 0 ? (
        <p className="muted" style={{ marginTop: 20 }}>
          {deck.status === "parse_failed"
            ? "Parsing this upload failed. Go back to the dashboard to retry."
            : "No slides yet."}
        </p>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "220px 1fr", gap: 20, marginTop: 20 }}>
          <div style={{ display: "grid", gap: 8 }}>
            {slides.map((s, i) => (
              <button
                key={s.id}
                onClick={() => setActiveIndex(i)}
                className="card"
                style={{
                  textAlign: "left",
                  cursor: "pointer",
                  padding: 12,
                  border: i === activeIndex ? "2px solid var(--primary)" : "1px solid var(--line)",
                }}
              >
                <div className="muted" style={{ fontSize: 12 }}>Slide {s.order_index}</div>
                <div style={{ fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {s.title || "(untitled)"}
                </div>
                {!narration[s.id]?.trim() && <span className="todo" style={{ marginTop: 6 }}>No narration</span>}
              </button>
            ))}
          </div>

          {active && (
            <div className="card">
              <h3 style={{ marginTop: 0 }}>{active.title || `Slide ${active.order_index}`}</h3>
              {active.bullets.length > 0 && (
                <ul className="muted">
                  {active.bullets.map((b, i) => (
                    <li key={i}>{b}</li>
                  ))}
                </ul>
              )}
              <label>Narration</label>
              <textarea
                rows={4}
                value={narration[active.id] ?? ""}
                onChange={(e) => onNarrationChange(active.id, e.target.value)}
                placeholder="What should be said aloud on this slide?"
              />
              <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
                {saveState === "saving" && "Saving…"}
                {saveState === "saved" && "Saved"}
                {saveState === "failed" && "Save failed — check your connection"}
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}

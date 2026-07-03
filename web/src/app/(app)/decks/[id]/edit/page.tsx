"use client";

import { use, useCallback, useEffect, useRef, useState } from "react";
import { Workspace } from "./Workspace";
import { LivePreview } from "./LivePreview";
import { Lightbox } from "./Lightbox";
import type { Deck, Share, Slide } from "./types";

type SaveState = "idle" | "saving" | "saved" | "failed";
type Script = { id: string; is_published: boolean; narration: { slide_id: string; text: string }[] };

/**
 * PRD §4.6-4.9 Studio — review pages, generate + edit narration, rehearse the
 * exact recipient experience (voice + Q&A + live console), then publish.
 * Mirrors deck_agent_v0/frontend/studio.js's flow, adapted to this app's
 * Supabase-backed API instead of the FastAPI prototype's single JSON blob.
 */
export default function EditDeckPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);

  const [deck, setDeck] = useState<Deck | null>(null);
  const [slides, setSlides] = useState<Slide[]>([]);
  const [narration, setNarration] = useState<Record<string, string>>({});
  const [share, setShare] = useState<Share>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [mode, setMode] = useState<"workspace" | "live">("workspace");
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const [repName, setRepName] = useState("");
  const [voiceName, setVoiceName] = useState("");
  const [voiceRate, setVoiceRate] = useState(1);

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

  if (loading) return <p className="muted">Loading…</p>;
  if (!deck) return <p className="muted">{error ?? "Deck not found."}</p>;

  const renderWarning =
    slides.length > 0 && slides.every((s) => !s.image_url)
      ? "No page images available — showing extracted text only. If this was a PPTX/PPT upload, installing LibreOffice on the server enables rendered slide images."
      : null;

  if (mode === "live") {
    return (
      <LivePreview
        deck={deck}
        slides={slides}
        narration={narration}
        repName={repName}
        voiceName={voiceName}
        voiceRate={voiceRate}
        share={share}
        publishing={publishing}
        onBack={() => setMode("workspace")}
        onPublish={publish}
        onRevoke={revoke}
      />
    );
  }

  return (
    <>
      {error && <p style={{ color: "#b3261e" }}>{error}</p>}
      <Workspace
        deck={deck}
        slides={slides}
        narration={narration}
        onNarrationChange={onNarrationChange}
        saveState={saveState}
        repName={repName}
        onRepNameChange={setRepName}
        voiceName={voiceName}
        onVoiceNameChange={setVoiceName}
        voiceRate={voiceRate}
        onVoiceRateChange={setVoiceRate}
        generating={generating}
        onGenerate={generateScript}
        renderWarning={renderWarning}
        onOpenLightbox={setLightboxIndex}
        onEnterLive={() => setMode("live")}
      />
      {lightboxIndex !== null && (
        <Lightbox
          slides={slides}
          index={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          onStep={(delta) =>
            setLightboxIndex((i) => {
              if (i === null) return null;
              let n = i + delta;
              while (n >= 0 && n < slides.length && !slides[n].image_url) n += delta;
              return n >= 0 && n < slides.length ? n : i;
            })
          }
        />
      )}
    </>
  );
}

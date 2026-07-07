"use client";

/**
 * PRD §4.4 Dashboard — the sender's deck list (landing page after login).
 * Fetches GET /api/decks itself (not passed in as props from a server
 * component) since it needs to re-fetch after delete/retry actions below.
 * Rendered as a card grid (thumbnail + title + status + actions) rather than
 * a row list, so it scans like a deck library instead of a table.
 */
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

type Deck = {
  id: string;
  title: string;
  status: "uploading" | "parse_failed" | "draft" | "published";
  last_viewed_slide_index: number;
  created_at: string;
  updated_at: string;
  thumb_url: string | null;
};

const STATUS_LABEL: Record<Deck["status"], string> = {
  uploading: "Uploading…",
  parse_failed: "Upload failed",
  draft: "Draft",
  published: "Published",
};

const STATUS_COLOR: Record<Deck["status"], string> = {
  uploading: "#5b6470",
  parse_failed: "#b3261e",
  draft: "#8a5a00",
  published: "#2d7a3a",
};

export default function DashboardPage() {
  const [decks, setDecks] = useState<Deck[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  async function load() {
    setError(null);
    const res = await fetch("/api/decks");
    if (!res.ok) {
      setError("Couldn't load your decks. Try refreshing.");
      return;
    }
    const data = await res.json();
    setDecks(data.decks);
  }

  useEffect(() => {
    load();
  }, []);

  async function retryParse(id: string) {
    setBusyId(id);
    await fetch(`/api/decks/${id}/parse`, { method: "POST" });
    await load();
    setBusyId(null);
  }

  async function deleteDeck(id: string) {
    if (!confirm("Delete this deck? This can't be undone from here.")) return;
    setBusyId(id);
    await fetch(`/api/decks/${id}`, { method: "DELETE" });
    await load();
    setBusyId(null);
  }

  const filtered = useMemo(() => {
    if (!decks) return decks;
    const q = query.trim().toLowerCase();
    if (!q) return decks;
    return decks.filter((d) => d.title.toLowerCase().includes(q));
  }, [decks, query]);

  return (
    <>
      <div className="deck-toolbar">
        <h1>Your decks</h1>
        {decks && decks.length > 0 && (
          <input
            className="deck-search"
            placeholder="Search decks…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        )}
        <Link className="btn" href="/decks/new">
          + New deck
        </Link>
      </div>

      {error && <p className="muted">{error}</p>}

      {decks === null && !error && <p className="muted">Loading…</p>}

      {decks && decks.length === 0 && (
        <div className="card" style={{ marginTop: 20, textAlign: "center", padding: 48 }}>
          <p className="muted">No decks yet. Upload a PPTX or PDF to get started.</p>
          <Link className="btn" href="/decks/new" style={{ marginTop: 12 }}>
            New Deck
          </Link>
        </div>
      )}

      {filtered && filtered.length === 0 && decks && decks.length > 0 && (
        <p className="muted" style={{ marginTop: 20 }}>No decks match &quot;{query}&quot;.</p>
      )}

      {filtered && filtered.length > 0 && (
        <div className="deck-grid">
          {filtered.map((d) => (
            <div key={d.id} className="deck-card">
              <Link href={`/decks/${d.id}/edit`} className="deck-card-thumb">
                {d.thumb_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={d.thumb_url} alt="" />
                ) : (
                  <span className="noimg">no preview</span>
                )}
              </Link>
              <div className="deck-card-body">
                <Link href={`/decks/${d.id}/edit`} className="deck-card-title">
                  {d.title}
                </Link>
                <div className="deck-card-meta">
                  <span style={{ color: STATUS_COLOR[d.status] }}>● {STATUS_LABEL[d.status]}</span>
                  {"  ·  "}
                  {new Date(d.updated_at).toLocaleDateString()}
                </div>
                <div className="deck-card-actions">
                  {d.status !== "uploading" && (
                    <Link className="btn" href={`/decks/${d.id}/edit`}>
                      {d.status === "parse_failed" ? "Open" : "Continue →"}
                    </Link>
                  )}
                  {d.status === "published" && (
                    <Link className="btn ghost" href={`/decks/${d.id}/analytics`}>
                      Analytics
                    </Link>
                  )}
                  {d.status === "parse_failed" && (
                    <button className="btn ghost" disabled={busyId === d.id} onClick={() => retryParse(d.id)}>
                      {busyId === d.id ? "Retrying…" : "Retry"}
                    </button>
                  )}
                  <button className="btn ghost" disabled={busyId === d.id} onClick={() => deleteDeck(d.id)}>
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

"use client";

/**
 * Feature Requests board — a shared list every signed-in user can post to
 * and upvote (feature_requests / feature_request_votes, no owner scoping,
 * unlike decks). This is the "where other people keep it" spot: its own
 * sidebar entry rather than buried inside Account settings.
 */
import { useEffect, useState } from "react";

type FeatureRequest = {
  id: string;
  title: string;
  details: string | null;
  created_at: string;
  vote_count: number;
  voted_by_me: boolean;
};

export default function FeedbackPage() {
  const [requests, setRequests] = useState<FeatureRequest[] | null>(null);
  const [sort, setSort] = useState<"trending" | "new">("trending");
  const [error, setError] = useState<string | null>(null);
  const [composing, setComposing] = useState(false);
  const [title, setTitle] = useState("");
  const [details, setDetails] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [votingId, setVotingId] = useState<string | null>(null);

  async function load(nextSort: "trending" | "new") {
    setError(null);
    const res = await fetch(`/api/feature-requests?sort=${nextSort}`);
    if (!res.ok) {
      setError("Couldn't load feature requests. Try refreshing.");
      return;
    }
    const data = await res.json();
    setRequests(data.requests);
  }

  useEffect(() => {
    load(sort);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sort]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setSubmitting(true);
    setError(null);
    const res = await fetch("/api/feature-requests", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title, details }),
    });
    const data = await res.json().catch(() => null);
    setSubmitting(false);
    if (!res.ok) {
      setError(data?.error ?? "Couldn't post that. Try again.");
      return;
    }
    setTitle("");
    setDetails("");
    setComposing(false);
    await load(sort);
  }

  async function vote(id: string) {
    setVotingId(id);
    const res = await fetch(`/api/feature-requests/${id}/vote`, { method: "POST" });
    if (res.ok) {
      const data = await res.json();
      setRequests((prev) =>
        prev
          ? prev.map((r) => (r.id === id ? { ...r, vote_count: data.vote_count, voted_by_me: data.voted } : r))
          : prev,
      );
    }
    setVotingId(null);
  }

  return (
    <>
      <div className="deck-toolbar">
        <h1>Feature requests</h1>
        {!composing && (
          <button className="btn" onClick={() => setComposing(true)}>
            + New request
          </button>
        )}
      </div>
      <p className="muted" style={{ marginTop: -8, marginBottom: 20 }}>
        Ask for something you wish Deck Agent could do, and upvote requests you'd want too — everyone signed in sees this board.
      </p>

      {composing && (
        <form className="card" onSubmit={submit} style={{ marginBottom: 20 }}>
          <label>Short, descriptive title</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={140} required autoFocus />
          <label>Details</label>
          <textarea
            value={details}
            onChange={(e) => setDetails(e.target.value)}
            maxLength={2000}
            rows={4}
            placeholder="Any additional details…"
          />
          <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
            <button className="btn" type="submit" disabled={submitting}>
              {submitting ? "Posting…" : "Create post"}
            </button>
            <button className="btn ghost" type="button" onClick={() => setComposing(false)} disabled={submitting}>
              Cancel
            </button>
          </div>
        </form>
      )}

      {error && <p className="muted" style={{ color: "#b3261e" }}>{error}</p>}

      <div className="fr-sort">
        <button className={sort === "trending" ? "active" : ""} onClick={() => setSort("trending")}>
          Trending
        </button>
        <button className={sort === "new" ? "active" : ""} onClick={() => setSort("new")}>
          Newest
        </button>
      </div>

      {requests === null && !error && <p className="muted">Loading…</p>}

      {requests && requests.length === 0 && (
        <div className="card" style={{ marginTop: 12, textAlign: "center", padding: 40 }}>
          <p className="muted">No requests yet — be the first to ask for something.</p>
        </div>
      )}

      {requests && requests.length > 0 && (
        <div className="fr-list">
          {requests.map((r) => (
            <div key={r.id} className="fr-row">
              <button
                className={`fr-vote${r.voted_by_me ? " voted" : ""}`}
                onClick={() => vote(r.id)}
                disabled={votingId === r.id}
                aria-pressed={r.voted_by_me}
                title={r.voted_by_me ? "Remove your upvote" : "Upvote this request"}
              >
                <span className="fr-vote-arrow">▲</span>
                {r.vote_count}
              </button>
              <div className="fr-row-body">
                <div className="fr-row-title">{r.title}</div>
                {r.details && <div className="fr-row-details">{r.details}</div>}
                <div className="fr-row-meta">{new Date(r.created_at).toLocaleDateString()}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

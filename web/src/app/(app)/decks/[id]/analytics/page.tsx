"use client";

/**
 * PRD §4.10 Analytics. Polls GET /api/decks/:id/analytics every 15s. The
 * numbers behind this page only exist because src/app/d/[token]/page.tsx
 * creates a session and Player.tsx logs events on every real recipient
 * visit — if that logging ever stops firing, this page will just show zeros
 * (see lib/recipient.ts's createSession + the POST /api/d/[token]/event
 * route for where the data actually comes from).
 */
import { use, useEffect, useState } from "react";

type Analytics = {
  totalOpens: number;
  completedCount: number;
  completionRate: number;
  perSlide: { order_index: number; title: string; views: number }[];
  questions: {
    text: string;
    answer_text: string | null;
    escalated: boolean;
    confidence: number | null;
    slide_ref: number | null;
    created_at: string;
  }[];
};

const POLL_MS = 15_000;

/**
 * PRD §4.10 Deck analytics. Opens, completion rate, per-slide drop-off,
 * question log (answered vs escalated). Polls every 15s while the tab is open.
 */
export default function DeckAnalyticsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [data, setData] = useState<Analytics | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const res = await fetch(`/api/decks/${id}/analytics`);
      if (cancelled) return;
      if (!res.ok) {
        setError("Couldn't load analytics.");
        return;
      }
      setData(await res.json());
    }
    load();
    const t = setInterval(load, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [id]);

  if (error) return <p className="muted">{error}</p>;
  if (!data) return <p className="muted">Loading…</p>;

  const maxViews = Math.max(1, ...data.perSlide.map((s) => s.views));

  return (
    <>
      <h1>Analytics</h1>

      {data.totalOpens === 0 ? (
        <div className="card" style={{ marginTop: 20, textAlign: "center", padding: 48 }}>
          <p className="muted">No activity yet. Once someone opens your shared link, engagement shows up here.</p>
        </div>
      ) : (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, marginTop: 20 }}>
            <div className="card">
              <div className="muted" style={{ fontSize: 12 }}>Opens</div>
              <div style={{ fontSize: 28, fontWeight: 700 }}>{data.totalOpens}</div>
            </div>
            <div className="card">
              <div className="muted" style={{ fontSize: 12 }}>Completed</div>
              <div style={{ fontSize: 28, fontWeight: 700 }}>{data.completedCount}</div>
            </div>
            <div className="card">
              <div className="muted" style={{ fontSize: 12 }}>Completion rate</div>
              <div style={{ fontSize: 28, fontWeight: 700 }}>{data.completionRate}%</div>
            </div>
            <div className="card">
              <div className="muted" style={{ fontSize: 12 }}>Questions asked</div>
              <div style={{ fontSize: 28, fontWeight: 700 }}>{data.questions.length}</div>
            </div>
          </div>

          <div className="card" style={{ marginTop: 16 }}>
            <h3 style={{ marginTop: 0 }}>Per-slide drop-off</h3>
            <div style={{ display: "grid", gap: 8 }}>
              {data.perSlide.map((s) => (
                <div key={s.order_index} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span className="muted" style={{ fontSize: 12, width: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {String(s.order_index).padStart(2, "0")} · {s.title || "(untitled)"}
                  </span>
                  <div style={{ flex: 1, background: "var(--line)", borderRadius: 6, height: 10 }}>
                    <div style={{ width: `${(s.views / maxViews) * 100}%`, background: "var(--primary)", height: "100%", borderRadius: 6 }} />
                  </div>
                  <span className="muted" style={{ fontSize: 12, width: 30, textAlign: "right" }}>{s.views}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="card" style={{ marginTop: 16 }}>
            <h3 style={{ marginTop: 0 }}>Question log</h3>
            {data.questions.length === 0 ? (
              <p className="muted">No questions asked yet.</p>
            ) : (
              <div style={{ display: "grid", gap: 10 }}>
                {data.questions.map((q, i) => (
                  <div key={i} style={{ borderBottom: "1px solid var(--line)", paddingBottom: 10 }}>
                    <div style={{ fontWeight: 600 }}>{q.text}</div>
                    <div className="muted" style={{ fontSize: 13, marginTop: 2 }}>
                      {q.answer_text}
                      {q.slide_ref && ` (slide ${q.slide_ref})`}
                    </div>
                    <div style={{ fontSize: 12, marginTop: 4 }}>
                      <span style={{ color: q.escalated ? "var(--escalate, #b4620a)" : "var(--confident, #136a3a)" }}>
                        {q.escalated ? "Escalated" : "Answered from deck"}
                      </span>
                      {"  ·  "}
                      <span className="muted">{new Date(q.created_at).toLocaleString()}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </>
  );
}

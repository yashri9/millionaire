import Link from "next/link";

/**
 * Marketing / entry page (public). PRD §3 step 1.
 * Real marketing content is out of scope for the scaffold; links route into
 * the auth + app surfaces so the structure is navigable.
 */
export default function Home() {
  return (
    <main className="wrap">
      <h1 style={{ fontSize: 34, marginBottom: 8 }}>Make the deck talk.</h1>
      <p className="muted" style={{ maxWidth: 560, lineHeight: 1.5 }}>
        Upload a deck, generate a spoken walkthrough, publish a link a prospect
        can open — no login. When it can&apos;t answer, it hands off to you.
      </p>
      <div style={{ display: "flex", gap: 12, marginTop: 24 }}>
        <Link className="btn" href="/signup">
          Get started
        </Link>
        <Link className="btn ghost" href="/login">
          Log in
        </Link>
      </div>

      <div className="card" style={{ marginTop: 40 }}>
        <span className="todo">SCAFFOLD · PRD §3 entry</span>
        <p className="muted">
          Route groups: <code>(auth)</code> for signup/login/reset,{" "}
          <code>(app)</code> for the authenticated dashboard/editor, and{" "}
          <code>/d/[token]</code> for the public recipient runtime.
        </p>
      </div>
    </main>
  );
}

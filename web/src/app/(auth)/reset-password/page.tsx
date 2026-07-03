"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/env";

/** PRD §4.3 Reset password — set new password from a valid recovery token. */
export default function ResetPasswordPage() {
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      setChecking(false);
      return;
    }
    const supabase = createClient();
    // Clicking the emailed recovery link redirects here with tokens in the
    // URL; the browser client exchanges them for a session automatically.
    // Give it a moment, then check whether we actually got a session.
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSessionReady(Boolean(session));
      setChecking(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" || session) setSessionReady(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isSupabaseConfigured()) {
      setMsg("Dev mode: add Supabase env to enable password reset.");
      return;
    }
    setSubmitting(true);
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password });
    setSubmitting(false);
    if (error) {
      setMsg("Couldn't update your password. The link may have expired.");
      return;
    }
    window.location.href = "/dashboard";
  }

  if (checking) return <p className="muted">Checking your reset link…</p>;

  if (!sessionReady) {
    return (
      <>
        <h1>Link expired or invalid</h1>
        <p className="muted">
          This password reset link is no longer valid. Request a new one below.
        </p>
        <p style={{ marginTop: 12 }}>
          <Link href="/forgot-password" className="btn" style={{ width: "100%", display: "block", textAlign: "center" }}>
            Send a new link
          </Link>
        </p>
      </>
    );
  }

  return (
    <>
      <h1>Choose a new password</h1>
      <form onSubmit={onSubmit}>
        <label>New password</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          minLength={8}
          required
        />
        <button className="btn" style={{ marginTop: 16, width: "100%" }} type="submit" disabled={submitting}>
          {submitting ? "Updating…" : "Update password"}
        </button>
      </form>
      {msg && <p className="muted" style={{ marginTop: 12 }}>{msg}</p>}
    </>
  );
}

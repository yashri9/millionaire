"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/env";

/**
 * PRD §4.1 Email verification landing. Confirmation itself happens server-side
 * at /api/auth/verify-email, which redirects to /dashboard on success or here
 * (with ?error=invalid_link) on failure — this page only handles the failure
 * case and lets the user request a new link.
 */
export default function VerifyEmailPage() {
  const [failed, setFailed] = useState(false);
  const [email, setEmail] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    setFailed(new URLSearchParams(window.location.search).get("error") === "invalid_link");
  }, []);

  async function onResend(e: React.FormEvent) {
    e.preventDefault();
    if (!isSupabaseConfigured()) {
      setMsg("Dev mode: add Supabase env to enable resend.");
      return;
    }
    setSending(true);
    const supabase = createClient();
    const { error } = await supabase.auth.resend({ type: "signup", email });
    setSending(false);
    setMsg(error ? "Couldn't resend right now. Try again in a minute." : "Verification email sent.");
  }

  if (!failed) {
    return <h1>Verifying your email…</h1>;
  }

  return (
    <>
      <h1>That link didn&apos;t work</h1>
      <p className="muted">
        It may have expired or already been used. Enter your email to get a new one.
      </p>
      <form onSubmit={onResend}>
        <label>Email</label>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <button className="btn" style={{ marginTop: 16, width: "100%" }} type="submit" disabled={sending}>
          {sending ? "Sending…" : "Resend verification email"}
        </button>
      </form>
      {msg && <p className="muted" style={{ marginTop: 12 }}>{msg}</p>}
    </>
  );
}

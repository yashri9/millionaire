"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/env";

type Status = "checking" | "failed";

/**
 * PRD §4.1 Email verification landing.
 *
 * Supabase's DEFAULT confirmation template (raw-source editing is gated
 * behind having custom SMTP configured, so we don't require that) redirects
 * here with the session tokens in the URL hash; the browser client's
 * `detectSessionInUrl` (on by default) exchanges them for a session
 * automatically on load — we just need to notice it landed. If a project IS
 * later configured with a custom template pointing at
 * /api/auth/verify-email?token_hash=...&type=..., that server route redirects
 * here with `?error=invalid_link` on failure, which this page also handles.
 */
export default function VerifyEmailPage() {
  const [status, setStatus] = useState<Status>("checking");
  const [email, setEmail] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      setStatus("failed");
      return;
    }
    if (new URLSearchParams(window.location.search).get("error") === "invalid_link") {
      setStatus("failed");
      return;
    }

    const supabase = createClient();
    let settled = false;

    const finish = (hasSession: boolean) => {
      if (settled) return;
      settled = true;
      if (hasSession) window.location.href = "/dashboard";
      else setStatus("failed");
    };

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) finish(true);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) finish(true);
    });

    // detectSessionInUrl resolves quickly, but give it a few seconds before
    // treating "no session yet" as a bad/expired link.
    const timeout = setTimeout(() => finish(false), 4000);

    return () => {
      sub.subscription.unsubscribe();
      clearTimeout(timeout);
    };
  }, []);

  async function onResend(e: React.FormEvent) {
    e.preventDefault();
    if (!isSupabaseConfigured()) {
      setMsg("Dev mode: add Supabase env to enable resend.");
      return;
    }
    setSending(true);
    const supabase = createClient();
    const { error } = await supabase.auth.resend({
      type: "signup",
      email,
      options: { emailRedirectTo: `${window.location.origin}/verify-email` },
    });
    setSending(false);
    setMsg(error ? "Couldn't resend right now. Try again in a minute." : "Verification email sent.");
  }

  if (status === "checking") {
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

"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/env";

const NEUTRAL_MSG = "If that email has an account, we've sent a password reset link.";

/** PRD §4.3 Forgot password — token-based reset, expires in 1 hour, single-use. */
export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isSupabaseConfigured()) {
      setMsg("Dev mode: add Supabase env to enable password reset.");
      return;
    }
    setSubmitting(true);
    const supabase = createClient();
    // Always show the neutral message, regardless of the result, so we never
    // leak whether an email exists in the system.
    await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setSubmitting(false);
    setMsg(NEUTRAL_MSG);
  }

  return (
    <>
      <h1>Reset your password</h1>
      <form onSubmit={onSubmit}>
        <label>Email</label>
        <input
          type="email"
          placeholder="you@company.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <button className="btn" style={{ marginTop: 16, width: "100%" }} type="submit" disabled={submitting}>
          {submitting ? "Sending…" : "Send reset link"}
        </button>
      </form>
      {msg && <p className="muted" style={{ marginTop: 12 }}>{msg}</p>}
      <p className="muted" style={{ marginTop: 12 }}>
        <Link href="/login">Back to log in</Link>
      </p>
    </>
  );
}

"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/env";

/** PRD §4.1 "check your email" screen shown right after signup. */
export default function CheckEmailPage() {
  const [email, setEmail] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    setEmail(new URLSearchParams(window.location.search).get("email") ?? "");
  }, []);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  async function onResend() {
    if (!email) {
      setMsg("Enter the email you signed up with on the previous page and try again.");
      return;
    }
    if (!isSupabaseConfigured()) {
      setMsg("Dev mode: add Supabase env to enable resend.");
      return;
    }
    setSending(true);
    const supabase = createClient();
    const { error } = await supabase.auth.resend({ type: "signup", email });
    setSending(false);
    if (error) {
      setMsg("Couldn't resend right now. Try again in a minute.");
      return;
    }
    setMsg("Verification email sent.");
    setCooldown(60);
  }

  return (
    <>
      <h1>Check your email</h1>
      <p className="muted">
        We sent you a verification link. You can start uploading and drafting
        right away — you&apos;ll need to verify before publishing.
      </p>
      <button
        className="btn ghost"
        style={{ marginTop: 12 }}
        onClick={onResend}
        disabled={sending || cooldown > 0}
      >
        {cooldown > 0 ? `Resend email (${cooldown}s)` : sending ? "Sending…" : "Resend email"}
      </button>
      {msg && <p className="muted" style={{ marginTop: 12 }}>{msg}</p>}
    </>
  );
}

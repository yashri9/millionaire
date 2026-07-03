"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/env";

/**
 * PRD §4.2 Log in. Generic error copy (no field-level enumeration).
 * TODO(phase1): soft rate-limit messaging, unverified-email banner, Google OAuth.
 */
export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isSupabaseConfigured()) {
      setMsg("Dev mode: add Supabase env to enable real login.");
      return;
    }
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setMsg("Email or password is incorrect.");
    else window.location.href = "/dashboard";
  }

  return (
    <>
      <h1>Log in</h1>
      <form onSubmit={onSubmit}>
        <label>Email</label>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <label>Password</label>
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        <button className="btn" style={{ marginTop: 16, width: "100%" }} type="submit">
          Log in
        </button>
      </form>
      <button className="btn ghost" style={{ marginTop: 10, width: "100%" }}>
        Continue with Google
      </button>
      {msg && <p className="muted">{msg}</p>}
      <p className="muted">
        <Link href="/forgot-password">Forgot password?</Link> ·{" "}
        <Link href="/signup">Create account</Link>
      </p>
    </>
  );
}

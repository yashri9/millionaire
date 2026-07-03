"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/env";

/**
 * PRD §4.1 Sign up. Email/password + Google OAuth.
 * TODO(phase1): inline weak-password validation, "email already exists" copy
 * (no enumeration leak), rate-limited resend. This scaffold wires the happy
 * path against Supabase Auth when env is present.
 */
export default function SignupPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isSupabaseConfigured()) {
      setMsg("Dev mode: add Supabase env to enable real signup.");
      return;
    }
    const supabase = createClient();
    const { error } = await supabase.auth.signUp({ email, password });
    setMsg(error ? "Try logging in, or use ‘forgot password’." : "Check your email to verify.");
  }

  return (
    <>
      <h1>Create your account</h1>
      <form onSubmit={onSubmit}>
        <label>Email</label>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <label>Password (min 8 chars, 1 number)</label>
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        <button className="btn" style={{ marginTop: 16, width: "100%" }} type="submit">
          Sign up
        </button>
      </form>
      <button className="btn ghost" style={{ marginTop: 10, width: "100%" }}>
        Continue with Google
      </button>
      {msg && <p className="muted">{msg}</p>}
      <p className="muted">
        Already have an account? <Link href="/login">Log in</Link>
      </p>
    </>
  );
}

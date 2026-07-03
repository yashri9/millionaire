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
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: `${window.location.origin}/verify-email` },
    });
    if (error) {
      setMsg("Try logging in, or use ‘forgot password’.");
      return;
    }
    window.location.href = `/check-email?email=${encodeURIComponent(email)}`;
  }

  async function onGoogle() {
    if (!isSupabaseConfigured()) {
      setMsg("Dev mode: add Supabase env to enable Google sign-in.");
      return;
    }
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/api/auth/google/callback` },
    });
    if (error) setMsg("Couldn't start Google sign-in. Try again.");
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
      <button className="btn ghost" style={{ marginTop: 10, width: "100%" }} type="button" onClick={onGoogle}>
        Continue with Google
      </button>
      {msg && <p className="muted">{msg}</p>}
      <p className="muted">
        Already have an account? <Link href="/login">Log in</Link>
      </p>
    </>
  );
}

"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { AuthCardShell } from "@/components/auth-card-shell";
import { Button, Input, Label } from "@/components/ui-kit";
import { mapAuthError, validateEmail } from "@/lib/auth-errors";
import { authRedirectUrl, isSupabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/client";

type Status = "checking" | "failed";

export default function VerifyEmailPage() {
  const [status, setStatus] = useState<Status>("checking");
  const [email, setEmail] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      setStatus("failed");
      return;
    }
    if (
      new URLSearchParams(window.location.search).get("error") === "invalid_link"
    ) {
      setStatus("failed");
      return;
    }

    const supabase = createClient();
    let settled = false;

    const finish = (hasSession: boolean) => {
      if (settled) return;
      settled = true;
      if (hasSession) {
        window.location.href = "/dashboard";
      } else {
        setStatus("failed");
      }
    };

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) finish(true);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) finish(true);
    });

    const timeout = setTimeout(() => finish(false), 4000);

    return () => {
      sub.subscription.unsubscribe();
      clearTimeout(timeout);
    };
  }, []);

  async function onResend(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    setError(null);
    const emailErr = validateEmail(email);
    if (emailErr) {
      setError(emailErr);
      return;
    }
    if (!isSupabaseConfigured()) {
      setError("Supabase is not configured.");
      return;
    }
    setSending(true);
    const supabase = createClient();
    const { error: resendError } = await supabase.auth.resend({
      type: "signup",
      email: email.trim(),
      options: { emailRedirectTo: authRedirectUrl("/verify-email") },
    });
    setSending(false);
    if (resendError) {
      setError(mapAuthError(resendError, "resend").message);
      return;
    }
    setMsg("Verification email sent.");
  }

  if (status === "checking") {
    return (
      <AuthCardShell title="Verifying your email…">
        <p className="text-sm text-muted-foreground">
          Confirming your link and opening Studio.
        </p>
      </AuthCardShell>
    );
  }

  return (
    <AuthCardShell
      title="That link didn’t work"
      subtitle="This verification link has expired or is no longer valid. Request a new verification email."
      footer={
        <Link
          href="/login"
          className="font-semibold text-foreground underline underline-offset-4"
        >
          Back to log in
        </Link>
      }
    >
      <form className="space-y-5" onSubmit={onResend} noValidate>
        <div>
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        {error && (
          <p
            className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger"
            role="alert"
          >
            {error}
          </p>
        )}
        {msg && (
          <p
            className="rounded-lg border border-border bg-muted px-3 py-2 text-sm text-muted-foreground"
            role="status"
          >
            {msg}
          </p>
        )}
        <Button type="submit" size="lg" className="w-full" disabled={sending}>
          {sending ? "Sending…" : "Resend verification email"}
        </Button>
      </form>
    </AuthCardShell>
  );
}

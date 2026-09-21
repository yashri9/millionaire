"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { AuthCardShell } from "@/components/auth-card-shell";
import { Button } from "@/components/ui-kit";
import { mapAuthError, validateEmail } from "@/lib/auth-errors";
import { isSupabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/client";

export default function CheckEmailPage() {
  const [email, setEmail] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
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
      options: { emailRedirectTo: `${window.location.origin}/verify-email` },
    });
    setSending(false);
    if (resendError) {
      setError(mapAuthError(resendError, "resend").message);
      return;
    }
    setMsg("Verification email sent. Check spam if you don’t see it.");
    setCooldown(60);
  }

  return (
    <AuthCardShell
      title="Check your email"
      subtitle={
        email
          ? `We've sent a verification link to ${email}. Click the link to activate your account.`
          : "We've sent a verification link to your email address. Click the link to activate your account."
      }
      footer={
        <>
          Already verified?{" "}
          <Link
            href="/login"
            className="font-semibold text-foreground underline underline-offset-4"
          >
            Log in
          </Link>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Didn&apos;t receive the email? Check spam, confirm the address, or
          resend below.
        </p>
        <Button
          type="button"
          variant="secondary"
          size="lg"
          className="w-full"
          onClick={onResend}
          disabled={sending || cooldown > 0}
        >
          {cooldown > 0
            ? `Resend email (${cooldown}s)`
            : sending
              ? "Sending…"
              : "Resend verification email"}
        </Button>
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
      </div>
    </AuthCardShell>
  );
}

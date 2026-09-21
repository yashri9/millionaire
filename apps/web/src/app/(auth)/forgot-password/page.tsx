"use client";

import Link from "next/link";
import { useState } from "react";

import { AuthCardShell } from "@/components/auth-card-shell";
import { Button, Input, Label } from "@/components/ui-kit";
import { mapAuthError, validateEmail } from "@/lib/auth-errors";
import { isSupabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/client";

const NEUTRAL_MSG =
  "If an account exists for this email, we've sent a reset link.";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFieldError(null);
    setFormError(null);
    setInfo(null);

    const emailErr = validateEmail(email);
    if (emailErr) {
      setFieldError(emailErr);
      return;
    }

    if (!isSupabaseConfigured()) {
      setFormError("Supabase is not configured.");
      return;
    }

    setSubmitting(true);
    const supabase = createClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setSubmitting(false);

    if (error) {
      const mapped = mapAuthError(error, "reset");
      if (
        mapped.message.includes("Too many") ||
        mapped.message.includes("connection")
      ) {
        setFormError(mapped.message);
        return;
      }
    }

    setInfo(NEUTRAL_MSG);
  }

  return (
    <AuthCardShell
      title="Forgot password?"
      subtitle="Enter your email and we'll send a reset link if an account exists."
      footer={
        <>
          <Link
            href="/login"
            className="font-semibold text-foreground underline underline-offset-4"
          >
            Back to log in
          </Link>
        </>
      }
    >
      <form className="space-y-5" onSubmit={onSubmit} noValidate>
        <div>
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            placeholder="you@studio.com"
            autoComplete="email"
            value={email}
            aria-invalid={Boolean(fieldError)}
            onChange={(e) => setEmail(e.target.value)}
          />
          {fieldError && (
            <p className="mt-1.5 text-sm text-danger" role="alert">
              {fieldError}
            </p>
          )}
        </div>
        {formError && (
          <p
            className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger"
            role="alert"
          >
            {formError}
          </p>
        )}
        {info && (
          <p
            className="rounded-lg border border-border bg-muted px-3 py-2 text-sm text-muted-foreground"
            role="status"
          >
            {info}
          </p>
        )}
        <Button type="submit" size="lg" className="w-full" disabled={submitting}>
          {submitting ? "Sending…" : "Send reset link →"}
        </Button>
      </form>
    </AuthCardShell>
  );
}

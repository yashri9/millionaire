"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { AuthCardShell } from "@/components/auth-card-shell";
import { Button, Input, Label } from "@/components/ui-kit";
import {
  mapAuthError,
  validatePassword,
  validatePasswordConfirm,
} from "@/lib/auth-errors";
import { isSupabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/client";

export default function ResetPasswordPage() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      setChecking(false);
      return;
    }
    const supabase = createClient();
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSessionReady(Boolean(session));
      setChecking(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" || session) setSessionReady(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFieldErrors({});
    setFormError(null);

    const next: Record<string, string> = {};
    const passwordErr = validatePassword(password, { minLength: 8 });
    if (passwordErr) next.password = passwordErr;
    const confirmErr = validatePasswordConfirm(password, confirm);
    if (confirmErr) next.confirm = confirmErr;
    if (Object.keys(next).length) {
      setFieldErrors(next);
      return;
    }

    if (!isSupabaseConfigured()) {
      setFormError("Supabase is not configured.");
      return;
    }

    setSubmitting(true);
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password });
    setSubmitting(false);
    if (error) {
      setFormError(mapAuthError(error, "update").message);
      return;
    }
    setSuccess(true);
  }

  if (checking) {
    return (
      <AuthCardShell title="Checking your reset link…">
        <p className="text-sm text-muted-foreground">One moment.</p>
      </AuthCardShell>
    );
  }

  if (!sessionReady) {
    return (
      <AuthCardShell
        title="Link expired or invalid"
        subtitle="This password reset link is no longer valid. Request a new one."
        footer={
          <Link
            href="/forgot-password"
            className="font-semibold text-foreground underline underline-offset-4"
          >
            Send a new link
          </Link>
        }
      >
        <Link
          href="/forgot-password"
          className="inline-flex h-12 w-full items-center justify-center rounded-full bg-foreground px-7 text-base font-semibold text-background"
        >
          Request a new link →
        </Link>
      </AuthCardShell>
    );
  }

  if (success) {
    return (
      <AuthCardShell
        title="Password updated"
        subtitle="Your password has been updated. You can now log in."
        footer={
          <Link
            href="/login"
            className="font-semibold text-foreground underline underline-offset-4"
          >
            Go to login
          </Link>
        }
      >
        <Link
          href="/login"
          className="inline-flex h-12 w-full items-center justify-center rounded-full bg-foreground px-7 text-base font-semibold text-background"
        >
          Log in →
        </Link>
      </AuthCardShell>
    );
  }

  return (
    <AuthCardShell
      title="Choose a new password"
      subtitle="Use at least 8 characters. You'll use this the next time you log in."
    >
      <form className="space-y-5" onSubmit={onSubmit} noValidate>
        <div>
          <Label htmlFor="password">New password</Label>
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            value={password}
            aria-invalid={Boolean(fieldErrors.password)}
            onChange={(e) => setPassword(e.target.value)}
          />
          {fieldErrors.password && (
            <p className="mt-1.5 text-sm text-danger" role="alert">
              {fieldErrors.password}
            </p>
          )}
        </div>
        <div>
          <Label htmlFor="confirm">Confirm password</Label>
          <Input
            id="confirm"
            type="password"
            autoComplete="new-password"
            value={confirm}
            aria-invalid={Boolean(fieldErrors.confirm)}
            onChange={(e) => setConfirm(e.target.value)}
          />
          {fieldErrors.confirm && (
            <p className="mt-1.5 text-sm text-danger" role="alert">
              {fieldErrors.confirm}
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
        <Button type="submit" size="lg" className="w-full" disabled={submitting}>
          {submitting ? "Updating…" : "Update password →"}
        </Button>
      </form>
    </AuthCardShell>
  );
}

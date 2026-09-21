"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";

import { Wordmark } from "@/components/shell";
import { Button, Input, Label } from "@/components/ui-kit";
import {
  mapAuthError,
  oauthQueryError,
  validateEmail,
  validatePassword,
  validatePasswordConfirm,
} from "@/lib/auth-errors";
import { isSupabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/client";

export function AuthLayout({ mode }: { mode: "login" | "signup" | "reset" }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const formErrorId = useId();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [offerResend, setOfferResend] = useState(false);
  const [busy, setBusy] = useState(false);
  const [checkingSession, setCheckingSession] = useState(mode !== "reset");

  const nextPath = searchParams.get("next") || "/dashboard";

  useEffect(() => {
    const fromQuery = oauthQueryError(searchParams.get("error"));
    if (fromQuery) setFormError(fromQuery);
  }, [searchParams]);

  useEffect(() => {
    if (mode === "reset" || !isSupabaseConfigured()) {
      setCheckingSession(false);
      return;
    }
    let cancelled = false;
    const supabase = createClient();
    supabase.auth
      .getSession()
      .then(({ data: { session } }) => {
        if (cancelled) return;
        if (session) {
          router.replace(nextPath.startsWith("/") ? nextPath : "/dashboard");
          return;
        }
        setCheckingSession(false);
      })
      .catch(() => {
        if (!cancelled) setCheckingSession(false);
      });
    return () => {
      cancelled = true;
    };
  }, [mode, nextPath, router]);

  const title =
    mode === "login"
      ? "Welcome back."
      : mode === "signup"
        ? "Start your studio."
        : "Reset your key.";
  const sub =
    mode === "login"
      ? "The stage is set. Log in to keep recording."
      : mode === "signup"
        ? "One account. Unlimited decks. Free while we're in beta."
        : "Enter your email — we'll send you a reset link.";

  function clearAlerts() {
    setFieldErrors({});
    setFormError(null);
    setInfo(null);
    setOfferResend(false);
  }

  function clientValidate(): boolean {
    const next: Record<string, string> = {};
    const emailErr = validateEmail(email);
    if (emailErr) next.email = emailErr;

    if (mode !== "reset") {
      const passwordErr = validatePassword(password, {
        minLength: mode === "signup" ? 8 : 1,
      });
      if (passwordErr) next.password = passwordErr;
    }

    if (mode === "signup") {
      const confirmErr = validatePasswordConfirm(password, confirm);
      if (confirmErr) next.confirm = confirmErr;
    }

    setFieldErrors(next);
    if (next.email) {
      emailRef.current?.focus();
      return false;
    }
    if (next.password) {
      passwordRef.current?.focus();
      return false;
    }
    return Object.keys(next).length === 0;
  }

  async function ensureProfileLoaded() {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    // Trigger creates the row; select confirms access. Missing row is non-fatal.
    await supabase.from("profiles").select("id").eq("id", user.id).maybeSingle();
  }

  async function onResendVerification() {
    const emailErr = validateEmail(email);
    if (emailErr) {
      setFieldErrors({ email: emailErr });
      emailRef.current?.focus();
      return;
    }
    if (!isSupabaseConfigured()) return;
    setBusy(true);
    clearAlerts();
    const supabase = createClient();
    const { error } = await supabase.auth.resend({
      type: "signup",
      email: email.trim(),
      options: { emailRedirectTo: `${window.location.origin}/verify-email` },
    });
    setBusy(false);
    if (error) {
      const mapped = mapAuthError(error, "resend");
      setFormError(mapped.message);
      return;
    }
    setInfo("Verification email sent. Check your inbox and spam folder.");
    setOfferResend(false);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    clearAlerts();

    if (!clientValidate()) return;

    if (!isSupabaseConfigured()) {
      setFormError(
        "Supabase is not configured. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.",
      );
      return;
    }

    setBusy(true);
    const supabase = createClient();
    const trimmedEmail = email.trim();

    try {
      if (mode === "reset") {
        const { error: resetError } = await supabase.auth.resetPasswordForEmail(
          trimmedEmail,
          { redirectTo: `${window.location.origin}/reset-password` },
        );
        if (resetError) {
          const mapped = mapAuthError(resetError, "reset");
          // Still show neutral success for enumeration safety when request was accepted-ish;
          // only surface hard failures (rate limit / network).
          if (
            mapped.message.includes("Too many") ||
            mapped.message.includes("connection")
          ) {
            setFormError(mapped.message);
            return;
          }
        }
        setInfo(
          "If an account exists for this email, we've sent a reset link.",
        );
        return;
      }

      if (mode === "signup") {
        const { data, error: signUpError } = await supabase.auth.signUp({
          email: trimmedEmail,
          password,
          options: {
            data: name.trim() ? { full_name: name.trim() } : undefined,
            emailRedirectTo: `${window.location.origin}/verify-email`,
          },
        });
        if (signUpError) throw signUpError;

        // Supabase may return a user with empty identities when email already exists.
        const identities = data.user?.identities;
        if (data.user && Array.isArray(identities) && identities.length === 0) {
          setFormError(
            "This email may already be registered. Try logging in or resetting your password.",
          );
          return;
        }

        if (data.session) {
          await ensureProfileLoaded();
          router.push(nextPath.startsWith("/") ? nextPath : "/dashboard");
          router.refresh();
          return;
        }
        router.push(`/check-email?email=${encodeURIComponent(trimmedEmail)}`);
        return;
      }

      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: trimmedEmail,
        password,
      });
      if (signInError) throw signInError;
      await ensureProfileLoaded();
      router.push(nextPath.startsWith("/") ? nextPath : "/dashboard");
      router.refresh();
    } catch (err) {
      const mapped = mapAuthError(
        err,
        mode === "signup" ? "signup" : mode === "reset" ? "reset" : "login",
      );
      if (mapped.field !== "form") {
        setFieldErrors({ [mapped.field]: mapped.message });
      } else {
        setFormError(mapped.message);
        setOfferResend(Boolean(mapped.offerResend));
      }
    } finally {
      setBusy(false);
    }
  }

  async function onGoogle() {
    clearAlerts();
    if (!isSupabaseConfigured()) {
      setFormError("Supabase is not configured.");
      return;
    }
    setBusy(true);
    const supabase = createClient();
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/api/auth/google/callback`,
        queryParams: { access_type: "offline", prompt: "consent" },
      },
    });
    if (oauthError) {
      setBusy(false);
      setFormError(mapAuthError(oauthError, "oauth").message);
    }
  }

  if (checkingSession) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-sm text-muted-foreground">
        Checking your session…
      </div>
    );
  }

  return (
    <div className="grid min-h-screen bg-background lg:grid-cols-[1fr_1fr]">
      <aside className="relative hidden overflow-hidden bg-foreground p-10 text-background lg:flex lg:flex-col lg:justify-between">
        <div className="grid-paper absolute inset-0 opacity-[0.06]" aria-hidden />
        <div className="relative">
          <Wordmark className="[&_span:nth-child(2)]:!text-background" />
        </div>
        <div className="relative">
          <div className="eyebrow mb-6 text-background/50">Manifesto · 001</div>
          <h1 className="font-display text-6xl font-bold leading-[0.95] tracking-tighter">
            Kill the boring
            <br />
            pitch.
            <br />
            <span className="italic text-accent">Long live the voice.</span>
          </h1>
          <p className="mt-8 max-w-md text-background/60">
            Voxdeck is for the ones tired of decks that sit unopened in inboxes.
            We give your slides a mouth, a mind, and a memory.
          </p>
        </div>
        <div className="relative flex items-center gap-4 text-xs text-background/40">
          <span className="font-mono">↳ v0.1.0</span>
          <div className="h-px flex-1 bg-background/10" />
          <span className="eyebrow">Studio online</span>
        </div>
      </aside>

      <section className="flex flex-col justify-center px-6 py-12 sm:px-12">
        <div className="mx-auto w-full max-w-sm">
          <div className="mb-10 lg:hidden">
            <Wordmark />
          </div>
          <div className="eyebrow mb-4">
            {mode === "signup" ? "New here" : "Studio access"}
          </div>
          <h2 className="font-display text-4xl font-bold tracking-tighter">
            {title}
          </h2>
          <p className="mt-3 text-sm text-muted-foreground">{sub}</p>

          <form
            className="mt-10 space-y-5"
            onSubmit={onSubmit}
            noValidate
            aria-describedby={formError ? formErrorId : undefined}
          >
            {mode === "signup" && (
              <div>
                <Label htmlFor="name">Your name</Label>
                <Input
                  id="name"
                  type="text"
                  placeholder="Yash Mate"
                  autoComplete="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
            )}
            <div>
              <Label htmlFor="email">Email</Label>
              <Input
                ref={emailRef}
                id="email"
                type="email"
                placeholder="you@studio.com"
                autoComplete="email"
                inputMode="email"
                value={email}
                aria-invalid={Boolean(fieldErrors.email)}
                onChange={(e) => setEmail(e.target.value)}
              />
              {fieldErrors.email && (
                <p className="mt-1.5 text-sm text-danger" role="alert">
                  {fieldErrors.email}
                </p>
              )}
            </div>
            {mode !== "reset" && (
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <Label htmlFor="password" className="mb-0">
                    Password
                  </Label>
                  {mode === "login" && (
                    <Link
                      href="/forgot-password"
                      className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground hover:text-foreground"
                    >
                      Forgot?
                    </Link>
                  )}
                </div>
                <Input
                  ref={passwordRef}
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  autoComplete={
                    mode === "signup" ? "new-password" : "current-password"
                  }
                  value={password}
                  aria-invalid={Boolean(fieldErrors.password)}
                  onChange={(e) => setPassword(e.target.value)}
                />
                {mode === "signup" && (
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    At least 8 characters.
                  </p>
                )}
                {fieldErrors.password && (
                  <p className="mt-1.5 text-sm text-danger" role="alert">
                    {fieldErrors.password}
                  </p>
                )}
              </div>
            )}
            {mode === "signup" && (
              <div>
                <Label htmlFor="confirm">Confirm password</Label>
                <Input
                  id="confirm"
                  type="password"
                  placeholder="••••••••"
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
            )}
            {formError && (
              <div
                id={formErrorId}
                className="space-y-2 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger"
                role="alert"
              >
                <p>{formError}</p>
                {offerResend && (
                  <button
                    type="button"
                    className="font-semibold underline underline-offset-4"
                    onClick={onResendVerification}
                    disabled={busy}
                  >
                    Resend verification email
                  </button>
                )}
              </div>
            )}
            {info && (
              <p
                className="rounded-lg border border-border bg-muted px-3 py-2 text-sm text-muted-foreground"
                role="status"
              >
                {info}
              </p>
            )}
            <Button type="submit" size="lg" className="w-full" disabled={busy}>
              {busy
                ? "Working…"
                : mode === "login"
                  ? "Log in →"
                  : mode === "signup"
                    ? "Create studio →"
                    : "Send reset link →"}
            </Button>
          </form>

          {mode !== "reset" && (
            <>
              <div className="my-6 flex items-center gap-4 text-[10px] uppercase tracking-widest text-muted-foreground">
                <div className="h-px flex-1 bg-border" />
                <span>or</span>
                <div className="h-px flex-1 bg-border" />
              </div>
              <Button
                variant="secondary"
                size="lg"
                className="w-full"
                onClick={onGoogle}
                disabled={busy}
                type="button"
              >
                Continue with Google
              </Button>
            </>
          )}

          <div className="mt-8 text-sm text-muted-foreground">
            {mode === "login" ? (
              <>
                Don&apos;t have an account?{" "}
                <Link
                  href="/signup"
                  className="font-semibold text-foreground underline underline-offset-4"
                >
                  Create one
                </Link>
                .
              </>
            ) : mode === "signup" ? (
              <>
                Already have a studio?{" "}
                <Link
                  href="/login"
                  className="font-semibold text-foreground underline underline-offset-4"
                >
                  Log in
                </Link>
                .
              </>
            ) : (
              <>
                Remembered it?{" "}
                <Link
                  href="/login"
                  className="font-semibold text-foreground underline underline-offset-4"
                >
                  Log in
                </Link>
                .
              </>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

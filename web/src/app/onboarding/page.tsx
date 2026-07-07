"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/env";
import { ONBOARDING_QUESTIONS } from "@/lib/onboardingQuestions";

/**
 * One-time cohort onboarding, shown right after a user's first login
 * ((app)/layout.tsx redirects here if profiles.onboarding_completed_at is
 * null). One question per screen with a progress bar, so it reads as a
 * couple of taps rather than a form. Answers are saved directly via
 * supabase-js (profiles is self-scoped RLS, same pattern as the Account
 * page) — no server route needed.
 */
export default function OnboardingPage() {
  const [ready, setReady] = useState(false);
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      window.location.href = "/dashboard";
      return;
    }
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) {
        window.location.href = "/login";
        return;
      }
      const { data: profile } = await supabase
        .from("profiles")
        .select("onboarding_completed_at")
        .eq("id", user.id)
        .single();
      if (profile?.onboarding_completed_at) {
        window.location.href = "/dashboard";
        return;
      }
      setReady(true);
    });
  }, []);

  async function finish(finalAnswers: Record<string, string>) {
    setSaving(true);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      await supabase
        .from("profiles")
        .update({ ...finalAnswers, onboarding_completed_at: new Date().toISOString() })
        .eq("id", user.id);
    }
    window.location.href = "/dashboard";
  }

  function choose(value: string) {
    const question = ONBOARDING_QUESTIONS[step];
    const next = { ...answers, [question.key]: value };
    setAnswers(next);
    if (step === ONBOARDING_QUESTIONS.length - 1) {
      finish(next);
    } else {
      setStep(step + 1);
    }
  }

  function skip() {
    finish(answers);
  }

  if (!ready) return null;

  const question = ONBOARDING_QUESTIONS[step];
  const remaining = ONBOARDING_QUESTIONS.length - step;
  const progressPct = (step / ONBOARDING_QUESTIONS.length) * 100;

  return (
    <main className="onboarding-shell">
      <div className="onboarding-card">
        <div className="onboarding-progress">
          <div className="onboarding-progress-track">
            <div className="onboarding-progress-fill" style={{ width: `${progressPct}%` }} />
          </div>
          <div className="onboarding-progress-label">
            {step > 0 && (
              <button className="onboarding-back" onClick={() => setStep(step - 1)} disabled={saving}>
                ← Back
              </button>
            )}
            <span style={{ flex: 1 }} />
            <span>{remaining} question{remaining === 1 ? "" : "s"} left</span>
          </div>
        </div>

        <h1 className="onboarding-question">{question.question}</h1>

        <div className="onboarding-options">
          {question.options.map((opt) => (
            <button
              key={opt.value}
              className="onboarding-option"
              onClick={() => choose(opt.value)}
              disabled={saving}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <button className="onboarding-skip" onClick={skip} disabled={saving}>
          Skip for now
        </button>
      </div>
    </main>
  );
}

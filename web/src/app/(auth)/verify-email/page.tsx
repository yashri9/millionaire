import { ScaffoldNote } from "@/components/ScaffoldNote";

/** PRD §4.1 Email verification landing (Supabase handles the token exchange). */
export default function VerifyEmailPage() {
  return (
    <>
      <h1>Verifying your email…</h1>
      <ScaffoldNote
        section="PRD §4.1"
        todo={[
          "Handle the Supabase email-confirmation callback and redirect to /dashboard",
          "On failure show a resend option (rate-limited 1/60s)",
        ]}
      />
    </>
  );
}

import { ScaffoldNote } from "@/components/ScaffoldNote";

/** PRD §4.3 Forgot password — token-based reset, expires in 1 hour, single-use. */
export default function ForgotPasswordPage() {
  return (
    <>
      <h1>Reset your password</h1>
      <label>Email</label>
      <input type="email" placeholder="you@company.com" />
      <button className="btn" style={{ marginTop: 16, width: "100%" }}>
        Send reset link
      </button>
      <ScaffoldNote
        section="PRD §4.3"
        todo={[
          "Call supabase.auth.resetPasswordForEmail with a redirect to /reset-password",
          "Always show a neutral ‘if that email exists, we sent a link’ message",
        ]}
      />
    </>
  );
}

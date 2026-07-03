import { ScaffoldNote } from "@/components/ScaffoldNote";

/** PRD §4.3 Reset password — set new password from a valid token. */
export default function ResetPasswordPage() {
  return (
    <>
      <h1>Choose a new password</h1>
      <label>New password</label>
      <input type="password" />
      <button className="btn" style={{ marginTop: 16, width: "100%" }}>
        Update password
      </button>
      <ScaffoldNote
        section="PRD §4.3"
        todo={[
          "Read the recovery token from the URL and call supabase.auth.updateUser",
          "Expired/used token → clear message + one-click ‘send a new link’",
        ]}
      />
    </>
  );
}

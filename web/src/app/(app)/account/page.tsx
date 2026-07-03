import { ScaffoldNote } from "@/components/ScaffoldNote";

/**
 * PRD §4.11 Account / settings. Change name/password, Google link status,
 * delete account (30-day soft-delete per adopted §14 default).
 */
export default function AccountPage() {
  return (
    <>
      <h1>Account</h1>
      <ScaffoldNote
        section="PRD §4.11"
        todo={[
          "Change name (profiles) + change password (supabase.auth.updateUser)",
          "Show connected Google account status",
          "Delete account → confirm + 30-day soft-delete window before hard delete",
        ]}
      />
    </>
  );
}

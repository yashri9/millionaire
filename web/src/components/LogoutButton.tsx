"use client";

/** Used in (app)/layout.tsx's nav — the only sign-out entry point in the app. */
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/env";

export function LogoutButton() {
  async function onLogout() {
    if (isSupabaseConfigured()) {
      await createClient().auth.signOut();
    }
    window.location.href = "/login";
  }

  return (
    <button className="muted" style={{ background: "none", border: "none", cursor: "pointer", padding: 0, font: "inherit" }} onClick={onLogout}>
      Log out
    </button>
  );
}

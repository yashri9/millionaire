"use client";

import { isSupabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/client";

export function LogoutButton({ className = "" }: { className?: string }) {
  async function onLogout() {
    try {
      if (isSupabaseConfigured()) {
        await createClient().auth.signOut();
      }
    } finally {
      window.location.href = "/login";
    }
  }

  return (
    <button
      type="button"
      className={
        className ||
        "text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
      }
      onClick={onLogout}
    >
      Log out
    </button>
  );
}

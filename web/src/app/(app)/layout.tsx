import Link from "next/link";
import { redirect } from "next/navigation";
import { LogoutButton } from "@/components/LogoutButton";
import { AppSidebarNav } from "@/components/AppSidebarNav";
import { createServerClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/env";

/**
 * Authenticated app shell — a persistent sidebar (Home / Account) instead of
 * a top header, so it reads as a workspace rather than a marketing site. The
 * middleware (lib/supabase/middleware.ts) already redirects unauthenticated
 * users to /login for this route group; this layout additionally redirects
 * to /onboarding once, right after first login, if the cohort questions
 * (src/app/onboarding/page.tsx) haven't been answered or skipped yet.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  let email = "";
  let initial = "?";

  if (isSupabaseConfigured()) {
    const supabase = await createServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user) {
      email = user.email ?? "";
      const { data: profile } = await supabase
        .from("profiles")
        .select("name, onboarding_completed_at")
        .eq("id", user.id)
        .single();
      if (!profile?.onboarding_completed_at) redirect("/onboarding");
      initial = (profile?.name || email || "?").trim().charAt(0).toUpperCase();
    }
  }

  return (
    <div className="app-shell">
      <aside className="app-sidebar">
        <Link href="/dashboard" className="app-sidebar-brand">
          Deck Agent
        </Link>
        <AppSidebarNav />
        {email && (
          <div className="app-sidebar-user">
            <div className="app-sidebar-avatar">{initial}</div>
            <div className="app-sidebar-user-meta">
              <div className="app-sidebar-email" title={email}>{email}</div>
              <LogoutButton />
            </div>
          </div>
        )}
      </aside>
      <main className="app-main">
        <div className="wrap">{children}</div>
      </main>
    </div>
  );
}

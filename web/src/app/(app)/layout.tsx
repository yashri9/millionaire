import Link from "next/link";
import { LogoutButton } from "@/components/LogoutButton";

/**
 * Authenticated app shell. The middleware (lib/supabase/middleware.ts) already
 * redirects unauthenticated users to /login for this route group.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <header
        style={{
          borderBottom: "1px solid var(--line)",
          background: "var(--panel)",
        }}
      >
        <div
          className="wrap"
          style={{
            paddingTop: 16,
            paddingBottom: 16,
            display: "flex",
            gap: 20,
            alignItems: "center",
          }}
        >
          <Link href="/dashboard" style={{ fontWeight: 700, textDecoration: "none", color: "var(--ink)" }}>
            Deck Agent
          </Link>
          <Link href="/dashboard" className="muted">Dashboard</Link>
          <Link href="/decks/new" className="muted">New deck</Link>
          <span style={{ flex: 1 }} />
          <Link href="/account" className="muted">Account</Link>
          <LogoutButton />
        </div>
      </header>
      <main className="wrap">{children}</main>
    </>
  );
}

"use client";

/** Sidebar nav links for (app)/layout.tsx — a client component only so the
 * current route can be highlighted via usePathname(). */
import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  {
    href: "/dashboard",
    label: "Dashboard",
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path d="M2 7L8 2l6 5v6a1 1 0 0 1-1 1h-3v-4H6v4H3a1 1 0 0 1-1-1V7Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    href: "/feedback",
    label: "Feedback",
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path d="M2 3.5h12v7H6.5L3 13.5v-3H2v-7Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    href: "/account",
    label: "Account",
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <circle cx="8" cy="5.2" r="2.4" stroke="currentColor" strokeWidth="1.4" />
        <path d="M2.8 13.4c.7-2.6 2.7-4 5.2-4s4.5 1.4 5.2 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
    ),
  },
];

export function AppSidebarNav() {
  const pathname = usePathname();
  return (
    <nav className="app-sidebar-nav">
      {LINKS.map((link) => {
        const active = pathname === link.href || pathname?.startsWith(link.href + "/");
        return (
          <Link key={link.href} href={link.href} className={`app-sidebar-link${active ? " active" : ""}`}>
            {link.icon}
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}

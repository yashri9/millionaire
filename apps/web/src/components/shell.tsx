"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { LogoutButton } from "@/components/LogoutButton";

export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <Link href="/" className={`inline-flex items-center gap-2 ${className}`}>
      <span className="relative inline-flex h-7 w-7 items-center justify-center rounded-md bg-foreground text-background">
        <span className="waveform text-background" aria-hidden>
          <span /><span /><span /><span /><span /><span /><span />
        </span>
      </span>
      <span className="font-display text-lg font-bold tracking-tighter text-foreground">
        VOXDECK<span className="text-accent">.</span>
      </span>
    </Link>
  );
}

export function TopBar({
  variant = "marketing",
  children,
  bleed = false,
}: {
  variant?: "marketing" | "app";
  children?: ReactNode;
  /** Full-width bar (editor workspace) instead of marketing max-width. */
  bleed?: boolean;
}) {
  const pathname = usePathname();
  const isActive = (p: string) =>
    p === "/" ? pathname === "/" : pathname.startsWith(p);

  return (
    <header className="sticky top-0 z-40 shrink-0 border-b border-border bg-background/85 backdrop-blur">
      <div
        className={`mx-auto flex h-[72px] w-full items-center justify-between gap-3 ${
          bleed ? "max-w-none px-4 md:px-6" : "max-w-[1280px] px-5 md:px-10"
        }`}
      >
        <div className="flex min-w-0 items-center gap-12">
          <Wordmark />
          {variant === "app" && (
            <nav className="hidden items-center gap-1 md:flex">
              {[
                { to: "/dashboard", label: "Decks" },
                { to: "/decks/new", label: "New deck" },
              ].map((l) => (
                <Link
                  key={l.to}
                  href={l.to}
                  className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                    isActive(l.to)
                      ? "bg-foreground text-background"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
                >
                  {l.label}
                </Link>
              ))}
            </nav>
          )}
          {variant === "marketing" && (
            <nav className="hidden items-center gap-8 md:flex">
              {[
                { href: "#how", label: "How it works" },
                { href: "#studio", label: "Studio" },
                { href: "#voices", label: "Voices" },
              ].map((l) => (
                <a
                  key={l.href}
                  href={l.href}
                  className="nav-underline text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
                >
                  {l.label}
                </a>
              ))}
            </nav>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-6">
          {children ?? (variant === "marketing" ? (
            <>
              <Link href="/login" className="hidden text-sm font-medium text-muted-foreground transition-colors hover:text-foreground sm:inline-flex">
                Log in
              </Link>
              <Link
                href="/signup"
                className="group relative inline-flex h-11 items-center gap-2 rounded-full bg-foreground px-6 text-sm font-semibold text-background shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
              >
                Start creating
                <span className="inline-block transition-transform group-hover:translate-x-0.5">→</span>
              </Link>
            </>
          ) : (
            <>
              <Link href="/account" className="hidden rounded-full px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground sm:inline-flex">
                Account
              </Link>
              <LogoutButton className="hidden text-sm font-medium text-muted-foreground transition-colors hover:text-foreground sm:inline-flex" />
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-foreground text-xs font-semibold text-background">
                YM
              </div>
            </>
          ))}
        </div>
      </div>
    </header>
  );
}

export function AppShell({
  children,
  variant = "app",
  showTopBar = true,
  fillViewport = false,
}: {
  children: ReactNode;
  variant?: "marketing" | "app";
  showTopBar?: boolean;
  /**
   * Lock the shell to the viewport (editor workspace).
   * Child regions scroll independently; the page itself does not.
   */
  fillViewport?: boolean;
}) {
  return (
    <div
      className={
        fillViewport
          ? "flex h-dvh flex-col overflow-hidden bg-background text-foreground"
          : "min-h-screen bg-background text-foreground"
      }
    >
      {showTopBar && <TopBar variant={variant} bleed={fillViewport} />}
      <main
        className={
          fillViewport
            ? "flex min-h-0 flex-1 flex-col overflow-hidden"
            : undefined
        }
      >
        {children}
      </main>
    </div>
  );
}

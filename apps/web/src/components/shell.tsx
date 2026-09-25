"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";

import { LogoutButton } from "@/components/LogoutButton";
import { MarketingFooter } from "@/components/marketing/MarketingFooter";

const MARKETING_LINKS = [
  { href: "#how", label: "How it works" },
  { href: "#studio", label: "Examples" },
  { href: "#voices", label: "Voices" },
];

export function Wordmark({
  className = "",
  marketing = false,
}: {
  className?: string;
  /** Blue homepage language (no lime / Space Grotesk). */
  marketing?: boolean;
}) {
  if (marketing) {
    return (
      <Link href="/" className={`inline-flex items-center gap-2 ${className}`}>
        <span className="relative inline-flex h-7 w-7 items-center justify-center rounded-md bg-[#07111f]">
          <span className="waveform text-[#77a8ff]" aria-hidden>
            <span /><span /><span /><span /><span /><span /><span />
          </span>
        </span>
        <span className="text-lg font-semibold tracking-tight text-[#07111f]" style={{ fontFamily: '"Cormorant Garamond", Georgia, serif' }}>
          VOXDECK<span className="text-[#176bff]">.</span>
        </span>
      </Link>
    );
  }
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
  const [menuOpen, setMenuOpen] = useState(false);
  const isActive = (p: string) =>
    p === "/" ? pathname === "/" : pathname.startsWith(p);

  return (
    <header
      id="navbar"
      className={`sticky top-0 z-40 shrink-0 border-b backdrop-blur ${
        variant === "marketing"
          ? "border-[#07111f28] bg-[#eaf3ff]/90"
          : "border-border bg-background/85"
      }`}
    >
      <div
        className={`mx-auto flex min-h-16 w-full items-center justify-between gap-4 lg:min-h-[4.5rem] ${
          bleed ? "max-w-none px-4 md:px-6" : "max-w-7xl px-[5%]"
        }`}
      >
        <div className="flex min-w-0 items-center gap-8 lg:gap-12">
          <Wordmark marketing={variant === "marketing"} />
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
            <nav className="hidden items-center gap-8 lg:flex">
              {MARKETING_LINKS.map((l) => (
                <a
                  key={l.href}
                  href={l.href}
                  className="text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground"
                >
                  {l.label}
                </a>
              ))}
            </nav>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-4 lg:gap-6">
          {children ?? (variant === "marketing" ? (
            <>
              <Link href="/login" className="hidden text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground lg:inline-flex">
                Log in
              </Link>
              <Link
                href="/decks/new"
                className="group relative hidden h-10 items-center gap-2 rounded-full bg-[#07111f] px-5 text-sm font-semibold text-[#f4f8ff] transition-colors hover:bg-[#176bff] lg:inline-flex"
              >
                Get started
              </Link>
              <button
                type="button"
                className="-mr-2 flex h-11 w-11 items-center justify-center lg:hidden"
                aria-expanded={menuOpen}
                aria-label={menuOpen ? "Close menu" : "Open menu"}
                onClick={() => setMenuOpen((open) => !open)}
              >
                <span className="flex w-5 flex-col gap-1.5" aria-hidden>
                  <span className={`h-px w-full bg-foreground transition ${menuOpen ? "translate-y-[4px] rotate-45" : ""}`} />
                  <span className={`h-px w-full bg-foreground transition ${menuOpen ? "-translate-y-[4px] -rotate-45" : ""}`} />
                </span>
              </button>
            </>
          ) : (
            <>
              <Link href="/account" className="hidden rounded-full px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground sm:inline-flex">
                Account
              </Link>
              <LogoutButton className="hidden text-sm font-medium text-muted-foreground transition-colors hover:text-foreground sm:inline-flex" />
              <button
                type="button"
                className="flex h-11 w-11 items-center justify-center rounded-full bg-foreground text-xs font-semibold text-background md:hidden"
                aria-expanded={menuOpen}
                aria-label={menuOpen ? "Close menu" : "Open menu"}
                onClick={() => setMenuOpen((open) => !open)}
              >
                YM
              </button>
              <div className="hidden h-8 w-8 items-center justify-center rounded-full bg-foreground text-xs font-semibold text-background md:flex">
                YM
              </div>
            </>
          ))}
        </div>
      </div>
      {variant === "marketing" && menuOpen && (
        <div className="border-t border-border px-[5%] py-6 lg:hidden">
          <div className="mx-auto flex max-w-7xl flex-col gap-4">
            {MARKETING_LINKS.map((l) => (
              <a
                key={l.href}
                href={l.href}
                className="min-h-11 py-2 text-lg font-semibold"
                onClick={() => setMenuOpen(false)}
              >
                {l.label}
              </a>
            ))}
            <div className="mt-2 flex flex-col gap-3">
              <Link
                href="/login"
                className="inline-flex h-11 items-center justify-center rounded-full border border-border text-sm font-semibold"
                onClick={() => setMenuOpen(false)}
              >
                Log in
              </Link>
              <Link
                href="/decks/new"
                className="inline-flex h-11 items-center justify-center rounded-full bg-[#07111f] text-sm font-semibold text-[#f4f8ff] transition-colors hover:bg-[#176bff]"
                onClick={() => setMenuOpen(false)}
              >
                Get started
              </Link>
            </div>
          </div>
        </div>
      )}
      {variant === "app" && menuOpen && (
        <div className="border-t border-border px-[5%] py-6 md:hidden">
          <div className="mx-auto flex max-w-7xl flex-col gap-3">
            <Link href="/dashboard" className="inline-flex min-h-11 items-center text-lg font-semibold" onClick={() => setMenuOpen(false)}>
              Decks
            </Link>
            <Link href="/decks/new" className="inline-flex min-h-11 items-center text-lg font-semibold" onClick={() => setMenuOpen(false)}>
              New deck
            </Link>
            <Link href="/account" className="inline-flex min-h-11 items-center text-lg font-semibold" onClick={() => setMenuOpen(false)}>
              Account
            </Link>
            <LogoutButton className="inline-flex min-h-11 items-center justify-start text-lg font-semibold" />
          </div>
        </div>
      )}
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
          : variant === "marketing"
            ? "min-h-screen bg-[#eaf3ff] text-[#07111f]"
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
      {variant === "marketing" && !fillViewport && <MarketingFooter />}
    </div>
  );
}

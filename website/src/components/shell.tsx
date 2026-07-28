import { Link, useRouterState } from "@tanstack/react-router";
import type { ReactNode } from "react";

export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <Link to="/" className={`inline-flex items-center gap-2 ${className}`}>
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
}: {
  variant?: "marketing" | "app";
  children?: ReactNode;
}) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isActive = (p: string) =>
    p === "/" ? pathname === "/" : pathname.startsWith(p);

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur">
      <div className="mx-auto flex h-[72px] w-full max-w-[1280px] items-center justify-between gap-3 px-5 md:px-10">
        <div className="flex min-w-0 items-center gap-12">
          <Wordmark />
          {variant === "app" && (
            <nav className="hidden items-center gap-1 md:flex">
              {[
                { to: "/dashboard", label: "Decks" },
                { to: "/new", label: "New deck" },
              ].map((l) => (
                <Link
                  key={l.to}
                  to={l.to}
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
              <Link to="/login" className="hidden text-sm font-medium text-muted-foreground transition-colors hover:text-foreground sm:inline-flex">
                Log in
              </Link>
              <Link
                to="/signup"
                className="group relative inline-flex h-11 items-center gap-2 rounded-full bg-foreground px-6 text-sm font-semibold text-background shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
              >
                Start creating
                <span className="inline-block transition-transform group-hover:translate-x-0.5">→</span>
              </Link>
            </>
          ) : (
            <>
              <Link to="/account" className="hidden rounded-full px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground sm:inline-flex">
                Account
              </Link>
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
}: {
  children: ReactNode;
  variant?: "marketing" | "app";
  showTopBar?: boolean;
}) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      {showTopBar && <TopBar variant={variant} />}
      <main>{children}</main>
    </div>
  );
}

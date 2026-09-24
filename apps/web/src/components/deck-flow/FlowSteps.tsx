"use client";

import Link from "next/link";

type Step = "edit" | "rehearse" | "publish";

const STEPS: { id: Step; label: string; path: string }[] = [
  { id: "edit", label: "Edit", path: "edit" },
  { id: "rehearse", label: "Rehearse", path: "preview" },
  { id: "publish", label: "Publish", path: "publish" },
];

/**
 * Edit → Rehearse → Publish. Tells the owner where they are and lets them hop
 * between steps without hunting for "back" links in different corners.
 */
export function FlowSteps({
  deckId,
  current,
  done = [],
  onNavigate,
  compact = false,
}: {
  deckId: string;
  current: Step;
  /** Steps to show a check on (e.g. rehearsed latest revision, published). */
  done?: Step[];
  /**
   * Intercept navigation (the editor uses this to flush autosave first so a
   * half-typed line is never lost when hopping to Rehearse / Publish).
   */
  onNavigate?: (href: string) => void;
  /** Narrow screens: show labels only for the current step. */
  compact?: boolean;
}) {
  return (
    <nav aria-label="Deck steps" className="flex items-center gap-1 text-xs">
      {STEPS.map((s, i) => {
        const isCurrent = s.id === current;
        const isDone = done.includes(s.id) && !isCurrent;
        return (
          <div key={s.id} className="flex items-center gap-1">
            {i > 0 && <span aria-hidden className="h-px w-3 bg-border sm:w-5" />}
            <Link
              href={`/decks/${deckId}/${s.path}`}
              aria-label={s.label}
              onClick={(e) => {
                if (!onNavigate || isCurrent) return;
                e.preventDefault();
                onNavigate(`/decks/${deckId}/${s.path}`);
              }}
              aria-current={isCurrent ? "step" : undefined}
              className={`inline-flex min-h-9 items-center gap-1.5 rounded-full px-3 font-semibold transition-colors ${
                isCurrent
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              <span
                aria-hidden
                className={`flex h-4 w-4 items-center justify-center rounded-full text-[9px] ${
                  isCurrent
                    ? "bg-background text-foreground"
                    : isDone
                      ? "bg-live text-foreground"
                      : "border border-border"
                }`}
              >
                {isDone ? "✓" : i + 1}
              </span>
              <span className={compact && !isCurrent ? "sr-only" : undefined}>{s.label}</span>
            </Link>
          </div>
        );
      })}
    </nav>
  );
}

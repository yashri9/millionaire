"use client";

import { useState, type ReactNode } from "react";

/**
 * Canva/Gamma-style collapsible panel. Only one primary detail per row,
 * so the inspector reads as a short stack instead of a long scroll.
 * `defaultOpen` sets the initial state; caller manages nothing else.
 */
export function Panel({
  icon,
  title,
  subtitle,
  badge,
  defaultOpen = false,
  disabled = false,
  children,
}: {
  icon?: ReactNode;
  title: string;
  subtitle?: string;
  badge?: ReactNode;
  defaultOpen?: boolean;
  disabled?: boolean;
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen && !disabled);
  return (
    <div className={`overflow-hidden rounded-2xl border border-border bg-background transition-colors ${open ? "border-foreground" : ""}`}>
      <button
        type="button"
        onClick={() => !disabled && setOpen((o) => !o)}
        className={`flex w-full items-center gap-3 px-4 py-3 text-left transition-colors ${
          disabled ? "cursor-not-allowed opacity-60" : "hover:bg-muted/40"
        }`}
        aria-expanded={open}
      >
        {icon && (
          <span className="flex h-8 w-8 flex-none items-center justify-center rounded-lg bg-muted text-sm">
            {icon}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-semibold">{title}</span>
            {badge}
          </div>
          {subtitle && <div className="mt-0.5 truncate text-[11px] text-muted-foreground">{subtitle}</div>}
        </div>
        {!disabled && (
          <span className={`flex-none text-xs text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}>▾</span>
        )}
      </button>
      {open && !disabled && (
        <div className="animate-rise border-t border-border p-4">{children}</div>
      )}
    </div>
  );
}

export function ComingSoonBadge({ children = "Coming soon" }: { children?: ReactNode }) {
  return (
    <span className="rounded-full border border-dashed border-border bg-muted px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
      {children}
    </span>
  );
}

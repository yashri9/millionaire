"use client";

import type { ButtonHTMLAttributes, InputHTMLAttributes, TextareaHTMLAttributes, ReactNode } from "react";
import { forwardRef } from "react";
import Link from "next/link";

/* ------------ Buttons ------------ */

type BtnVariant = "primary" | "secondary" | "ghost" | "accent";
type BtnSize = "sm" | "md" | "lg";

const btnBase =
  "inline-flex items-center justify-center gap-2 rounded-full font-semibold whitespace-nowrap transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground focus-visible:ring-offset-2 focus-visible:ring-offset-background";

const btnVariants: Record<BtnVariant, string> = {
  primary:
    "bg-foreground text-background hover:-translate-y-0.5 hover:shadow-[0_10px_30px_-10px_oklch(0.14_0_0_/_0.4)] active:translate-y-0",
  secondary:
    "bg-background text-foreground border-2 border-foreground hover:bg-foreground hover:text-background",
  ghost:
    "text-foreground hover:bg-muted",
  accent:
    "bg-accent text-accent-foreground hover:-translate-y-0.5 hover:shadow-[0_10px_30px_-10px_oklch(0.94_0.22_118_/_0.6)]",
};

const btnSizes: Record<BtnSize, string> = {
  sm: "h-8 px-3 text-xs",
  md: "h-10 px-5 text-sm",
  lg: "h-12 px-7 text-base",
};

export const Button = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant; size?: BtnSize }
>(({ className = "", variant = "primary", size = "md", ...props }, ref) => (
  <button
    ref={ref}
    className={`${btnBase} ${btnVariants[variant]} ${btnSizes[size]} ${className}`}
    {...props}
  />
));
Button.displayName = "Button";

/* ------------ Offset-shadow CTA (signature) ------------ */

export function OffsetButton({
  children,
  className = "",
  href,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { href?: string }) {
  const classes = `relative inline-flex h-12 min-h-12 items-center justify-center gap-2 rounded-full border-2 border-foreground bg-foreground px-7 text-sm font-semibold text-background transition-transform group-hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground focus-visible:ring-offset-2 ${className}`;
  return (
    <div className="group relative inline-block">
      <div className="pointer-events-none absolute inset-0 translate-x-1.5 translate-y-1.5 rounded-full bg-accent transition-transform duration-200 group-hover:translate-x-1 group-hover:translate-y-1" />
      {href ? (
        <Link href={href} className={classes}>
          {children}
        </Link>
      ) : (
        <button {...props} className={classes}>
          {children}
        </button>
      )}
    </div>
  );
}

/** Secondary outline CTA that can be a Link or button. */
export function GhostCta({
  children,
  className = "",
  href,
  tone = "light",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  href?: string;
  tone?: "light" | "dark";
}) {
  const toneClasses =
    tone === "dark"
      ? "border-background/35 text-background hover:border-background hover:bg-background/10"
      : "border-2 border-foreground bg-background text-foreground hover:bg-foreground hover:text-background";
  const classes = `inline-flex h-12 min-h-12 items-center justify-center gap-2 rounded-full px-6 text-sm font-semibold transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground focus-visible:ring-offset-2 ${toneClasses} ${className}`;
  if (href) {
    return (
      <Link href={href} className={classes}>
        {children}
      </Link>
    );
  }
  return (
    <button type="button" {...props} className={classes}>
      {children}
    </button>
  );
}

/* ------------ Inputs ------------ */

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className = "", ...props }, ref) => (
    <input
      ref={ref}
      className={`h-11 w-full rounded-lg border border-input bg-background px-4 text-sm text-foreground placeholder:text-muted-foreground focus:border-foreground focus:outline-none focus:ring-4 focus:ring-foreground/10 transition ${className}`}
      {...props}
    />
  ),
);
Input.displayName = "Input";

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className = "", ...props }, ref) => (
    <textarea
      ref={ref}
      className={`w-full rounded-lg border border-input bg-background px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-foreground focus:outline-none focus:ring-4 focus:ring-foreground/10 transition resize-none ${className}`}
      {...props}
    />
  ),
);
Textarea.displayName = "Textarea";

export function Label({ children, className = "", ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label className={`eyebrow mb-2 block ${className}`} {...props}>
      {children}
    </label>
  );
}

/* ------------ Status Pills ------------ */

type Status = "draft" | "published" | "processing" | "failed" | "live" | "idle";

const statusMap: Record<Status, { label: string; dot: string; bg: string; text: string }> = {
  draft:      { label: "Draft",     dot: "bg-warn",       bg: "bg-warn/10",    text: "text-warn" },
  published:  { label: "Published", dot: "bg-live",       bg: "bg-live/10",    text: "text-live" },
  processing: { label: "Processing",dot: "bg-foreground", bg: "bg-muted",      text: "text-foreground" },
  failed:     { label: "Failed",    dot: "bg-danger",     bg: "bg-danger/10",  text: "text-danger" },
  live:       { label: "Live",      dot: "bg-live",       bg: "bg-live/10",    text: "text-live" },
  idle:       { label: "Idle",      dot: "bg-muted-foreground", bg: "bg-muted",text: "text-muted-foreground" },
};

export function StatusPill({ status, label }: { status: Status; label?: string }) {
  const cfg = statusMap[status];
  return (
    <span className={`pill border-transparent ${cfg.bg} ${cfg.text}`}>
      <span className={`inline-block h-1.5 w-1.5 rounded-full ${cfg.dot} ${status === "published" || status === "live" ? "live-dot" : ""}`} />
      {label ?? cfg.label}
    </span>
  );
}

/* ------------ Card ------------ */

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-2xl border border-border bg-card p-6 transition-shadow hover:shadow-[0_20px_40px_-24px_oklch(0.14_0_0_/_0.2)] ${className}`}
    >
      {children}
    </div>
  );
}

/* ------------ Progress bar (striped, marching) ------------ */

export function StripedProgress({ value, label }: { value: number; label?: string }) {
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between">
        {label && <span className="eyebrow">{label}</span>}
        <span className="font-mono text-xs font-medium">{value}%</span>
      </div>
      <div className="relative h-3 w-full overflow-hidden rounded-full border border-border bg-muted">
        <div className="progress-stripe h-full rounded-full transition-all duration-500" style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

/* ------------ Waveform (decorative) ------------ */

export function Waveform({ bars = 7, className = "" }: { bars?: number; className?: string }) {
  return (
    <span className={`waveform ${className}`} aria-hidden>
      {Array.from({ length: bars }).map((_, i) => <span key={i} />)}
    </span>
  );
}

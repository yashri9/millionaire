"use client";

import Link from "next/link";
import type { ReactNode } from "react";

import { Wordmark } from "@/components/shell";

/** Shared centered card shell for secondary auth screens (forgot / verify / reset). */
export function AuthCardShell({
  eyebrow = "Studio access",
  title,
  subtitle,
  children,
  footer,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="grid min-h-screen bg-background lg:grid-cols-[1fr_1fr]">
      <aside className="relative hidden overflow-hidden bg-foreground p-10 text-background lg:flex lg:flex-col lg:justify-between">
        <div className="grid-paper absolute inset-0 opacity-[0.06]" aria-hidden />
        <div className="relative">
          <Wordmark className="[&_span:nth-child(2)]:!text-background" />
        </div>
        <div className="relative">
          <div className="eyebrow mb-6 text-background/50">Manifesto · 001</div>
          <h1 className="font-display text-6xl font-bold leading-[0.95] tracking-tighter">
            Kill the boring
            <br />
            pitch.
            <br />
            <span className="italic text-accent">Long live the voice.</span>
          </h1>
          <p className="mt-8 max-w-md text-background/60">
            Voxdeck is for the ones tired of decks that sit unopened in inboxes.
            We give your slides a mouth, a mind, and a memory.
          </p>
        </div>
        <div className="relative flex items-center gap-4 text-xs text-background/40">
          <span className="font-mono">↳ v0.1.0</span>
          <div className="h-px flex-1 bg-background/10" />
          <span className="eyebrow">Studio online</span>
        </div>
      </aside>

      <section className="flex flex-col justify-center px-6 py-12 sm:px-12">
        <div className="mx-auto w-full max-w-sm">
          <div className="mb-10 lg:hidden">
            <Wordmark />
          </div>
          <div className="eyebrow mb-4">{eyebrow}</div>
          <h2 className="font-display text-4xl font-bold tracking-tighter">{title}</h2>
          {subtitle && (
            <p className="mt-3 text-sm text-muted-foreground">{subtitle}</p>
          )}
          <div className="mt-10">{children}</div>
          {footer !== undefined ? (
            <div className="mt-8 text-sm text-muted-foreground">{footer}</div>
          ) : (
            <div className="mt-8 text-sm text-muted-foreground">
              <Link
                href="/login"
                className="font-semibold text-foreground underline underline-offset-4"
              >
                Back to log in
              </Link>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

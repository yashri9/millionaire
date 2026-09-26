import type { ReactNode } from "react";

/** White rounded panel with a title, subtitle and a small count badge. */
export function PanelCard({
  title,
  subtitle,
  badge,
  children,
  footer,
}: {
  title: string;
  subtitle: string;
  badge: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <section className="flex flex-col rounded-2xl border border-border bg-background p-5 sm:p-7">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-display text-lg font-bold tracking-tight">{title}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
        </div>
        <span className="shrink-0 rounded-full bg-[#176bff]/10 px-3 py-1 text-xs font-semibold text-[#176bff]">
          {badge}
        </span>
      </header>
      <div className="mt-6 flex-1">{children}</div>
      {footer ? <div className="mt-6 border-t border-border pt-5 text-xs text-muted-foreground">{footer}</div> : null}
    </section>
  );
}

export function PanelEmpty({ icon, title, body }: { icon: ReactNode; title: string; body: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-[#176bff]/25 bg-[#176bff]/[0.03] px-6 py-10 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#176bff]/10 text-[#176bff]" aria-hidden>
        {icon}
      </span>
      <p className="mt-4 font-semibold">{title}</p>
      <p className="mt-1 max-w-xs text-sm text-muted-foreground">{body}</p>
    </div>
  );
}

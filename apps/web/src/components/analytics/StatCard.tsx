export function StatCard({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-2xl border border-border bg-background p-5 sm:p-6">
      <div className="text-sm font-semibold text-muted-foreground">{label}</div>
      <div className="mt-4 font-display text-4xl font-bold tracking-tighter tabular-nums">{value}</div>
      <div className="mt-2 text-xs text-muted-foreground">{hint}</div>
    </div>
  );
}

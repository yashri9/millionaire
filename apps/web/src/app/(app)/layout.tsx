/**
 * Design-first VOXDECK showcase: this route group's pages render their own
 * <AppShell/> (top bar + container), so the layout is a pass-through.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

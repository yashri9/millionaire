/** Shared shell for every (auth) page (login/signup/reset/verify/etc) — just narrows the column width. */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="wrap" style={{ maxWidth: 420 }}>
      {children}
    </main>
  );
}

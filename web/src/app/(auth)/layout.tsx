export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="wrap" style={{ maxWidth: 420 }}>
      {children}
    </main>
  );
}

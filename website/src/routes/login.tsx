import { createFileRoute, Link } from "@tanstack/react-router";
import { Wordmark } from "@/components/shell";
import { Button, Input, Label } from "@/components/ui-kit";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Log in · Voxdeck" },
      { name: "description", content: "Log in to your Voxdeck studio." },
    ],
  }),
  component: LoginPage,
});

function LoginPage() {
  return <AuthLayout mode="login" />;
}

export function AuthLayout({ mode }: { mode: "login" | "signup" | "reset" }) {
  const title = mode === "login" ? "Welcome back." : mode === "signup" ? "Start your studio." : "Reset your key.";
  const sub =
    mode === "login"
      ? "The stage is set. Log in to keep recording."
      : mode === "signup"
      ? "One account. Unlimited decks. Free while we're in beta."
      : "Enter your email — we'll send you a reset link.";

  return (
    <div className="grid min-h-screen bg-background lg:grid-cols-[1fr_1fr]">
      {/* Editorial side panel */}
      <aside className="relative hidden overflow-hidden bg-foreground p-10 text-background lg:flex lg:flex-col lg:justify-between">
        <div className="grid-paper absolute inset-0 opacity-[0.06]" aria-hidden />
        <div className="relative">
          <Wordmark className="[&_span:nth-child(2)]:!text-background" />
        </div>
        <div className="relative">
          <div className="eyebrow mb-6 text-background/50">Manifesto · 001</div>
          <h1 className="font-display text-6xl font-bold leading-[0.95] tracking-tighter">
            Kill the boring<br />pitch.<br />
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

      {/* Form side */}
      <section className="flex flex-col justify-center px-6 py-12 sm:px-12">
        <div className="mx-auto w-full max-w-sm">
          <div className="mb-10 lg:hidden">
            <Wordmark />
          </div>
          <div className="eyebrow mb-4">{mode === "signup" ? "New here" : "Studio access"}</div>
          <h2 className="font-display text-4xl font-bold tracking-tighter">{title}</h2>
          <p className="mt-3 text-sm text-muted-foreground">{sub}</p>

          <form className="mt-10 space-y-5" onSubmit={(e) => e.preventDefault()}>
            {mode === "signup" && (
              <div>
                <Label htmlFor="name">Your name</Label>
                <Input id="name" type="text" placeholder="Yash Mate" autoComplete="name" />
              </div>
            )}
            <div>
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" placeholder="you@studio.com" autoComplete="email" />
            </div>
            {mode !== "reset" && (
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <Label htmlFor="password" className="mb-0">Password</Label>
                  {mode === "login" && (
                    <Link to="/reset" className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground hover:text-foreground">
                      Forgot?
                    </Link>
                  )}
                </div>
                <Input id="password" type="password" placeholder="••••••••" autoComplete={mode === "signup" ? "new-password" : "current-password"} />
              </div>
            )}
            <Button type="submit" size="lg" className="w-full">
              {mode === "login" ? "Log in →" : mode === "signup" ? "Create studio →" : "Send reset link →"}
            </Button>
          </form>

          {mode !== "reset" && (
            <>
              <div className="my-6 flex items-center gap-4 text-[10px] uppercase tracking-widest text-muted-foreground">
                <div className="h-px flex-1 bg-border" />
                <span>or</span>
                <div className="h-px flex-1 bg-border" />
              </div>
              <Button variant="secondary" size="lg" className="w-full">
                Continue with Google
              </Button>
            </>
          )}

          <div className="mt-8 text-sm text-muted-foreground">
            {mode === "login" ? (
              <>Don't have an account? <Link to="/signup" className="font-semibold text-foreground underline underline-offset-4">Create one</Link>.</>
            ) : (
              <>Already have a studio? <Link to="/login" className="font-semibold text-foreground underline underline-offset-4">Log in</Link>.</>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

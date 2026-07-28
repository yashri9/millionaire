import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/shell";
import { Button, Input, Label } from "@/components/ui-kit";

export const Route = createFileRoute("/account")({
  head: () => ({
    meta: [
      { title: "Account · Voxdeck" },
      { name: "description", content: "Manage your Voxdeck studio account." },
    ],
  }),
  component: AccountPage,
});

function AccountPage() {
  return (
    <AppShell variant="app">
      <div className="mx-auto max-w-3xl px-6 py-12">
        <div className="mb-10">
          <div className="eyebrow mb-3">Studio · settings</div>
          <h1 className="font-display text-5xl font-bold tracking-tighter">Account.</h1>
        </div>

        <div className="space-y-6">
          <section className="rounded-2xl border border-border bg-background p-6">
            <div className="mb-6 flex items-center justify-between">
              <div>
                <h2 className="font-display text-2xl font-bold tracking-tight">Profile</h2>
                <p className="mt-1 text-sm text-muted-foreground">How you show up in the studio.</p>
              </div>
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-foreground text-sm font-semibold text-background">
                YM
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="name">Name</Label>
                <Input id="name" defaultValue="Yash Mate" />
              </div>
              <div>
                <Label htmlFor="email">Email</Label>
                <Input id="email" defaultValue="yash@studio.com" readOnly className="bg-muted" />
              </div>
            </div>
            <div className="mt-6 flex items-center justify-between border-t border-border pt-6">
              <div className="text-xs">
                <div className="eyebrow mb-1">Google account</div>
                <div className="text-muted-foreground">Not connected</div>
              </div>
              <Button variant="secondary" size="sm">Connect Google</Button>
            </div>
          </section>

          <section className="rounded-2xl border border-border bg-background p-6">
            <h2 className="font-display text-2xl font-bold tracking-tight">Password</h2>
            <p className="mt-1 text-sm text-muted-foreground">Change your studio key.</p>
            <div className="mt-6 space-y-4">
              <div>
                <Label htmlFor="new-password">New password</Label>
                <Input id="new-password" type="password" placeholder="••••••••" />
              </div>
              <Button>Update password</Button>
            </div>
          </section>

          <section className="rounded-2xl border border-border bg-background p-6">
            <h2 className="font-display text-2xl font-bold tracking-tight">Plan</h2>
            <div className="mt-4 flex items-center justify-between rounded-xl border-2 border-foreground bg-accent p-5 offset-shadow-sm">
              <div>
                <div className="eyebrow mb-1">Current plan</div>
                <div className="font-display text-2xl font-bold">Beta · Free</div>
                <div className="mt-1 text-xs text-foreground/70">Unlimited decks · 25MB per file</div>
              </div>
              <Button variant="secondary">Upgrade</Button>
            </div>
          </section>

          <section className="rounded-2xl border border-danger/30 bg-danger/5 p-6">
            <h2 className="font-display text-2xl font-bold tracking-tight text-danger">Danger zone</h2>
            <p className="mt-1 text-sm text-muted-foreground">Permanently delete your account and every deck. This can't be undone.</p>
            <button className="mt-4 rounded-full border-2 border-danger px-5 py-2.5 text-sm font-semibold text-danger transition-colors hover:bg-danger hover:text-background">
              Delete my account
            </button>
          </section>
        </div>
      </div>
    </AppShell>
  );
}

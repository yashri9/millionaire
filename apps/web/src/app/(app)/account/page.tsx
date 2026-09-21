"use client";

import { useEffect, useState } from "react";

import { LogoutButton } from "@/components/LogoutButton";
import { AppShell } from "@/components/shell";
import { Button, Input, Label } from "@/components/ui-kit";
import {
  mapAuthError,
  validatePassword,
  validatePasswordConfirm,
} from "@/lib/auth-errors";
import { isSupabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/client";

export default function AccountPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [initials, setInitials] = useState("??");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [profileMsg, setProfileMsg] = useState<string | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordMsg, setPasswordMsg] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [updatingPassword, setUpdatingPassword] = useState(false);

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      setLoading(false);
      return;
    }
    const supabase = createClient();
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        window.location.href = "/login?next=/account";
        return;
      }
      setEmail(user.email ?? "");
      const { data: profile } = await supabase
        .from("profiles")
        .select("name")
        .eq("id", user.id)
        .maybeSingle();
      const display =
        profile?.name ||
        (user.user_metadata?.full_name as string | undefined) ||
        "";
      setName(display);
      const parts = display.trim().split(/\s+/).filter(Boolean);
      setInitials(
        parts.length >= 2
          ? `${parts[0]![0]}${parts[1]![0]}`.toUpperCase()
          : (display.slice(0, 2) || user.email?.slice(0, 2) || "??").toUpperCase(),
      );
      setLoading(false);
    })();
  }, []);

  async function onSaveProfile(e: React.FormEvent) {
    e.preventDefault();
    setProfileMsg(null);
    setProfileError(null);
    if (!isSupabaseConfigured()) return;
    setSaving(true);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setSaving(false);
      return;
    }
    const { error } = await supabase
      .from("profiles")
      .update({ name: name.trim() || null })
      .eq("id", user.id);
    setSaving(false);
    if (error) {
      setProfileError("Couldn't save your profile. Try again.");
      return;
    }
    setProfileMsg("Profile saved.");
  }

  async function onUpdatePassword(e: React.FormEvent) {
    e.preventDefault();
    setPasswordMsg(null);
    setPasswordError(null);
    const passwordErr = validatePassword(newPassword, { minLength: 8 });
    if (passwordErr) {
      setPasswordError(passwordErr);
      return;
    }
    const confirmErr = validatePasswordConfirm(newPassword, confirmPassword);
    if (confirmErr) {
      setPasswordError(confirmErr);
      return;
    }
    if (!isSupabaseConfigured()) return;
    setUpdatingPassword(true);
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setUpdatingPassword(false);
    if (error) {
      setPasswordError(mapAuthError(error, "update").message);
      return;
    }
    setNewPassword("");
    setConfirmPassword("");
    setPasswordMsg("Your password has been updated.");
  }

  return (
    <AppShell variant="app">
      <div className="mx-auto max-w-3xl px-6 py-12">
        <div className="mb-10 flex items-start justify-between gap-4">
          <div>
            <div className="eyebrow mb-3">Studio · settings</div>
            <h1 className="font-display text-5xl font-bold tracking-tighter">
              Account.
            </h1>
          </div>
          <LogoutButton className="rounded-full border border-border px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground" />
        </div>

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading your account…</p>
        ) : (
          <div className="space-y-6">
            <section className="rounded-2xl border border-border bg-background p-6">
              <div className="mb-6 flex items-center justify-between">
                <div>
                  <h2 className="font-display text-2xl font-bold tracking-tight">
                    Profile
                  </h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    How you show up in the studio.
                  </p>
                </div>
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-foreground text-sm font-semibold text-background">
                  {initials}
                </div>
              </div>
              <form className="space-y-4" onSubmit={onSaveProfile}>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="name">Name</Label>
                    <Input
                      id="name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      value={email}
                      readOnly
                      className="bg-muted"
                    />
                  </div>
                </div>
                {profileError && (
                  <p className="text-sm text-danger" role="alert">
                    {profileError}
                  </p>
                )}
                {profileMsg && (
                  <p className="text-sm text-muted-foreground" role="status">
                    {profileMsg}
                  </p>
                )}
                <Button type="submit" disabled={saving}>
                  {saving ? "Saving…" : "Save profile"}
                </Button>
              </form>
            </section>

            <section className="rounded-2xl border border-border bg-background p-6">
              <h2 className="font-display text-2xl font-bold tracking-tight">
                Password
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Change your studio key. Use at least 8 characters.
              </p>
              <form className="mt-6 space-y-4" onSubmit={onUpdatePassword}>
                <div>
                  <Label htmlFor="new-password">New password</Label>
                  <Input
                    id="new-password"
                    type="password"
                    autoComplete="new-password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="••••••••"
                  />
                </div>
                <div>
                  <Label htmlFor="confirm-password">Confirm password</Label>
                  <Input
                    id="confirm-password"
                    type="password"
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="••••••••"
                  />
                </div>
                {passwordError && (
                  <p className="text-sm text-danger" role="alert">
                    {passwordError}
                  </p>
                )}
                {passwordMsg && (
                  <p className="text-sm text-muted-foreground" role="status">
                    {passwordMsg}
                  </p>
                )}
                <Button type="submit" disabled={updatingPassword}>
                  {updatingPassword ? "Updating…" : "Update password"}
                </Button>
              </form>
            </section>

            <section className="rounded-2xl border border-border bg-background p-6">
              <h2 className="font-display text-2xl font-bold tracking-tight">
                Plan
              </h2>
              <div className="mt-4 flex items-center justify-between rounded-xl border-2 border-foreground bg-accent p-5 offset-shadow-sm">
                <div>
                  <div className="eyebrow mb-1">Current plan</div>
                  <div className="font-display text-2xl font-bold">
                    Beta · Free
                  </div>
                  <div className="mt-1 text-xs text-foreground/70">
                    Unlimited decks · 25MB per file
                  </div>
                </div>
              </div>
            </section>
          </div>
        )}
      </div>
    </AppShell>
  );
}

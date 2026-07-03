"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/env";

/**
 * PRD §4.11 Account / settings. Change name/password, Google link status,
 * delete account. Name/password go straight to supabase-js (profiles RLS is
 * self-scoped; password update is a normal authenticated-session action),
 * same pattern as the rest of the auth pages — no server route needed for
 * those. Delete needs the service role (auth.admin), so that's the one
 * server route (DELETE /api/account).
 */
export default function AccountPage() {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [googleLinked, setGoogleLinked] = useState(false);
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(true);
  const [nameMsg, setNameMsg] = useState<string | null>(null);
  const [passwordMsg, setPasswordMsg] = useState<string | null>(null);
  const [savingName, setSavingName] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      setLoading(false);
      return;
    }
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) {
        setLoading(false);
        return;
      }
      setEmail(user.email ?? "");
      setGoogleLinked((user.identities ?? []).some((i) => i.provider === "google"));
      const { data: profile } = await supabase.from("profiles").select("name").eq("id", user.id).single();
      setName(profile?.name ?? "");
      setLoading(false);
    });
  }, []);

  async function saveName(e: React.FormEvent) {
    e.preventDefault();
    setSavingName(true);
    setNameMsg(null);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    const { error } = await supabase.from("profiles").update({ name: name.trim() || null }).eq("id", user.id);
    setSavingName(false);
    setNameMsg(error ? "Couldn't save your name." : "Saved.");
  }

  async function savePassword(e: React.FormEvent) {
    e.preventDefault();
    setSavingPassword(true);
    setPasswordMsg(null);
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password });
    setSavingPassword(false);
    setPassword("");
    setPasswordMsg(error ? "Couldn't update your password." : "Password updated.");
  }

  async function deleteAccount() {
    if (!confirm("Delete your account? This permanently removes your decks and cannot be undone.")) return;
    setDeleting(true);
    const res = await fetch("/api/account", { method: "DELETE" });
    if (!res.ok) {
      setDeleting(false);
      alert("Couldn't delete your account. Try again.");
      return;
    }
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = "/";
  }

  if (loading) return <p className="muted">Loading…</p>;

  return (
    <>
      <h1>Account</h1>

      <div className="card" style={{ marginTop: 20 }}>
        <h3 style={{ marginTop: 0 }}>Profile</h3>
        <label>Email</label>
        <input value={email} disabled />
        <form onSubmit={saveName}>
          <label>Name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" />
          <button className="btn" style={{ marginTop: 12 }} type="submit" disabled={savingName}>
            {savingName ? "Saving…" : "Save name"}
          </button>
          {nameMsg && <p className="muted" style={{ marginTop: 8 }}>{nameMsg}</p>}
        </form>
        <div className="muted" style={{ marginTop: 16, fontSize: 13 }}>
          Google account: {googleLinked ? "Connected" : "Not connected"}
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <h3 style={{ marginTop: 0 }}>Change password</h3>
        <form onSubmit={savePassword}>
          <label>New password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={8}
            required
          />
          <button className="btn" style={{ marginTop: 12 }} type="submit" disabled={savingPassword}>
            {savingPassword ? "Updating…" : "Update password"}
          </button>
          {passwordMsg && <p className="muted" style={{ marginTop: 8 }}>{passwordMsg}</p>}
        </form>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <h3 style={{ marginTop: 0 }}>Delete account</h3>
        <p className="muted">Permanently deletes your account and every deck you own. This can&apos;t be undone.</p>
        <button className="btn ghost" onClick={deleteAccount} disabled={deleting}>
          {deleting ? "Deleting…" : "Delete my account"}
        </button>
      </div>
    </>
  );
}

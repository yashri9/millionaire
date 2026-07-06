"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/env";
import { DEFAULT_NARRATION_INSTRUCTIONS } from "@/lib/narrationPromptDefaults";

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

  const [narrationPrompt, setNarrationPrompt] = useState(DEFAULT_NARRATION_INSTRUCTIONS);
  const [promptMsg, setPromptMsg] = useState<string | null>(null);
  const [savingPrompt, setSavingPrompt] = useState(false);

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
      const { data: profile } = await supabase
        .from("profiles")
        .select("name, narration_prompt")
        .eq("id", user.id)
        .single();
      setName(profile?.name ?? "");
      setNarrationPrompt(profile?.narration_prompt?.trim() || DEFAULT_NARRATION_INSTRUCTIONS);
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

  async function saveNarrationPrompt(e: React.FormEvent) {
    e.preventDefault();
    setSavingPrompt(true);
    setPromptMsg(null);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    // An empty/default-matching value is stored as null so future prompt
    // tweaks to the built-in default apply automatically instead of being
    // frozen at whatever text happened to be in the box when this was saved.
    const trimmed = narrationPrompt.trim();
    const toStore = trimmed && trimmed !== DEFAULT_NARRATION_INSTRUCTIONS ? trimmed : null;
    const { error } = await supabase.from("profiles").update({ narration_prompt: toStore }).eq("id", user.id);
    setSavingPrompt(false);
    setPromptMsg(error ? "Couldn't save your prompt." : "Saved. New scripts will use this from now on.");
  }

  function resetNarrationPrompt() {
    setNarrationPrompt(DEFAULT_NARRATION_INSTRUCTIONS);
    setPromptMsg(null);
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
        <h3 style={{ marginTop: 0 }}>Narration prompt</h3>
        <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>
          This is the exact instruction sent to the model on every &quot;Generate narration&quot; click.
          It doesn&apos;t see the deck&apos;s images — only each slide&apos;s extracted title/bullets text,
          all slides sent together in one request so it can write a coherent script across the whole
          deck. Use <code>{"{budget}"}</code> for the target words-per-slide (set by the 1/2/5 min
          picker) and <code>{"{slideCount}"}</code> for the total slide count — both are filled in
          automatically. The JSON output format instruction is fixed and always added after this, so
          editing this text can&apos;t break script generation.
        </p>
        <form onSubmit={saveNarrationPrompt}>
          <textarea
            value={narrationPrompt}
            onChange={(e) => setNarrationPrompt(e.target.value)}
            rows={12}
            style={{ width: "100%", fontFamily: "monospace", fontSize: 12.5, resize: "vertical" }}
          />
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button className="btn" type="submit" disabled={savingPrompt}>
              {savingPrompt ? "Saving…" : "Save prompt"}
            </button>
            <button className="btn ghost" type="button" onClick={resetNarrationPrompt} disabled={savingPrompt}>
              Reset to default
            </button>
          </div>
          {promptMsg && <p className="muted" style={{ marginTop: 8 }}>{promptMsg}</p>}
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

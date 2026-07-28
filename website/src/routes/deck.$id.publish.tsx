import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AppShell } from "@/components/shell";
import { Button, Input, StatusPill, StripedProgress } from "@/components/ui-kit";
import { Panel, ComingSoonBadge } from "@/components/ui-panel";

export const Route = createFileRoute("/deck/$id/publish")({
  head: () => ({
    meta: [
      { title: "Publish · Voxdeck" },
      { name: "description", content: "Ship a shareable, tracked link for your narrated deck." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: PublishPage,
});

type Access = "anyone" | "email" | "password";

type Check = { id: string; label: string; state: "ok" | "warn"; hint?: string };

const initialChecks: Check[] = [
  { id: "narr",  label: "All slides narrated",          state: "ok" },
  { id: "voice", label: "Voice consistent — Marcus",    state: "ok" },
  { id: "dur",   label: "Runtime 3:41 (under 5 min)",   state: "ok" },
  { id: "s05",   label: "Slide 05 edited — re-approve", state: "warn", hint: "Traction copy changed since last preview." },
  { id: "cover", label: "Cover image looks crisp",      state: "ok" },
];

function PublishPage() {
  const { id } = useParams({ from: "/deck/$id/publish" });
  const [checks, setChecks] = useState(initialChecks);
  const [access, setAccess] = useState<Access>("anyone");
  const [gatedEmail, setGatedEmail] = useState("investors@sequoia.com");
  const [password, setPassword] = useState("");
  const [captureEmail, setCaptureEmail] = useState(true);
  const [trackDwell, setTrackDwell] = useState(true);
  const [expires, setExpires] = useState<"never" | "7d" | "30d">("30d");
  const [customSlug, setCustomSlug] = useState("scapia-series-b");
  const [publishing, setPublishing] = useState(false);
  const [published, setPublished] = useState(false);
  const [progress, setProgress] = useState(0);
  const [copied, setCopied] = useState(false);

  const shareUrl = `voxdeck.app/d/${customSlug || "your-deck"}`;
  const openIssues = checks.filter((c) => c.state === "warn").length;
  const readyToShip = openIssues === 0;

  function resolveCheck(id: string) {
    setChecks((prev) => prev.map((c) => (c.id === id ? { ...c, state: "ok" } : c)));
  }

  function publish() {
    setPublishing(true);
    setProgress(0);
    const steps = [
      { at: 300,  p: 22, m: "Stitching narration…" },
      { at: 900,  p: 55, m: "Rendering waveforms…" },
      { at: 1600, p: 82, m: "Provisioning shareable link…" },
      { at: 2300, p: 100, m: "Ready" },
    ];
    steps.forEach((s) => window.setTimeout(() => setProgress(s.p), s.at));
    window.setTimeout(() => { setPublishing(false); setPublished(true); }, 2500);
  }

  function copyLink() {
    navigator.clipboard?.writeText(`https://${shareUrl}`);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  }

  return (
    <AppShell variant="app">
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
        {/* Header */}
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <Link to="/deck/$id" params={{ id }} className="text-sm text-muted-foreground hover:text-foreground">
              ← Back to editor
            </Link>
            <div className="mt-2 flex items-center gap-3">
              <h1 className="font-display text-3xl font-bold tracking-tighter sm:text-4xl">
                {published ? "Your deck is live." : "Ship it."}
              </h1>
              {published && <StatusPill status="published" />}
            </div>
            <p className="mt-2 max-w-xl text-sm text-muted-foreground">
              {published
                ? "The link is minted and analytics are recording. Share it anywhere — we'll ping you when someone opens it."
                : "A checklist, an access rule, a link. Three moves, then the deck talks to prospects on its own."}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Link
              to="/deck/$id/preview"
              params={{ id }}
              className="rounded-full border-2 border-foreground bg-background px-5 py-2 text-sm font-semibold text-foreground transition-colors hover:bg-foreground hover:text-background"
            >
              Rehearse first
            </Link>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1fr_400px]">
          {/* Left column: collapsible panels — Share console is the hero, everything else tucks away */}
          <div className="space-y-3">
            <Panel
              icon={readyToShip ? "✓" : "!"}
              title="Pre-flight"
              subtitle={readyToShip ? "Everything's tight." : `${openIssues} item${openIssues === 1 ? "" : "s"} to review`}
              badge={
                <StatusPill
                  status={readyToShip ? "live" : "draft"}
                  label={readyToShip ? "Ready" : "Review"}
                />
              }
              defaultOpen={!readyToShip}
            >
              <ul className="divide-y divide-border">
                {checks.map((c) => (
                  <li key={c.id} className="flex items-start justify-between gap-4 py-2.5 first:pt-0 last:pb-0">
                    <div className="flex items-start gap-3">
                      <span
                        className={`mt-0.5 flex h-5 w-5 flex-none items-center justify-center rounded-full text-[10px] font-bold ${
                          c.state === "ok" ? "bg-live text-foreground" : "bg-warn text-foreground"
                        }`}
                      >
                        {c.state === "ok" ? "✓" : "!"}
                      </span>
                      <div>
                        <div className="text-sm font-medium">{c.label}</div>
                        {c.hint && <div className="mt-0.5 text-xs text-muted-foreground">{c.hint}</div>}
                      </div>
                    </div>
                    {c.state === "warn" && (
                      <Button size="sm" variant="ghost" onClick={() => resolveCheck(c.id)}>
                        Approve
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            </Panel>

            <Panel
              icon="🔒"
              title="Access"
              subtitle={access === "anyone" ? "Anyone with the link" : access === "email" ? "Email-gated" : "Password-protected"}
            >
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                {[
                  { id: "anyone",   title: "Anyone with the link", sub: "Zero friction." },
                  { id: "email",    title: "Email-gated",           sub: "Enter email to play." },
                  { id: "password", title: "Password",              sub: "Share code separately." },
                ].map((o) => {
                  const on = access === (o.id as Access);
                  return (
                    <button
                      key={o.id}
                      onClick={() => setAccess(o.id as Access)}
                      className={`rounded-xl border p-3 text-left transition-all ${
                        on ? "border-foreground bg-foreground text-background -translate-y-0.5"
                           : "border-border bg-background hover:border-foreground/40"
                      }`}
                    >
                      <div className="text-xs font-semibold">{o.title}</div>
                      <div className={`mt-1 text-[10px] ${on ? "text-background/60" : "text-muted-foreground"}`}>{o.sub}</div>
                    </button>
                  );
                })}
              </div>

              {access === "email" && (
                <div className="animate-rise mt-3 rounded-xl border border-border bg-muted/40 p-3">
                  <Input value={gatedEmail} onChange={(e) => setGatedEmail(e.target.value)} placeholder="name@company.com" />
                </div>
              )}
              {access === "password" && (
                <div className="animate-rise mt-3 rounded-xl border border-border bg-muted/40 p-3">
                  <Input value={password} onChange={(e) => setPassword(e.target.value)} placeholder="e.g. quiet-jazz-42" />
                </div>
              )}

              <div className="mt-4">
                <div className="eyebrow mb-2">Link expires</div>
                <div className="flex gap-2">
                  {(["never", "7d", "30d"] as const).map((v) => (
                    <button
                      key={v}
                      onClick={() => setExpires(v)}
                      className={`flex-1 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                        expires === v ? "border-foreground bg-foreground text-background"
                                      : "border-border bg-background hover:border-foreground/40"
                      }`}
                    >
                      {v === "never" ? "Never" : v === "7d" ? "7 days" : "30 days"}
                    </button>
                  ))}
                </div>
              </div>
            </Panel>

            <Panel
              icon="📊"
              title="Tracking"
              subtitle={`${captureEmail ? "Email required" : "Anonymous ok"} · ${trackDwell ? "dwell per slide" : "opens only"}`}
            >
              <div className="space-y-2">
                <label className="flex items-center justify-between rounded-xl border border-border px-3 py-2.5 text-sm">
                  <span>
                    <span className="font-semibold">Capture viewer email</span>
                    <span className="ml-2 text-xs text-muted-foreground">Before playback starts.</span>
                  </span>
                  <input type="checkbox" checked={captureEmail} onChange={(e) => setCaptureEmail(e.target.checked)} className="h-4 w-4 accent-foreground" />
                </label>
                <label className="flex items-center justify-between rounded-xl border border-border px-3 py-2.5 text-sm">
                  <span>
                    <span className="font-semibold">Per-slide dwell time</span>
                    <span className="ml-2 text-xs text-muted-foreground">See where they linger.</span>
                  </span>
                  <input type="checkbox" checked={trackDwell} onChange={(e) => setTrackDwell(e.target.checked)} className="h-4 w-4 accent-foreground" />
                </label>
              </div>
            </Panel>

            <Panel icon="🧑‍💼" title="Presenter avatar" subtitle="Show a lip-synced avatar in the shared deck" badge={<ComingSoonBadge />} />
          </div>


          {/* Right column: share console (sticky) */}
          <aside className="lg:sticky lg:top-24 lg:self-start">
            <div className="relative">
              <div className="pointer-events-none absolute inset-0 translate-x-1.5 translate-y-1.5 rounded-2xl bg-accent" />
              <div className="relative rounded-2xl border-2 border-foreground bg-background p-5">
                <div className="mb-3 flex items-center justify-between">
                  <div className="eyebrow">03 · Share</div>
                  {published ? <StatusPill status="live" label="Live" /> : <StatusPill status="draft" label="Not shipped" />}
                </div>

                {/* Slug editor */}
                <div className="mb-3">
                  <div className="eyebrow mb-2">Shareable link</div>
                  <div className="flex items-stretch overflow-hidden rounded-xl border-2 border-foreground">
                    <span className="flex items-center bg-muted px-3 font-mono text-xs text-muted-foreground">
                      voxdeck.app/d/
                    </span>
                    <input
                      value={customSlug}
                      onChange={(e) => setCustomSlug(e.target.value.replace(/[^a-z0-9-]/gi, "-").toLowerCase())}
                      className="flex-1 border-0 bg-background px-2 font-mono text-sm text-foreground focus:outline-none"
                      placeholder="your-deck"
                    />
                    <button
                      onClick={copyLink}
                      disabled={!published}
                      className="flex items-center bg-foreground px-3 text-xs font-semibold text-background transition-opacity hover:opacity-90 disabled:opacity-30"
                    >
                      {copied ? "Copied ✓" : "Copy"}
                    </button>
                  </div>
                  <p className="mt-1.5 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                    {published ? "This link is live" : "Preview — publish to activate"}
                  </p>
                </div>

                {/* Publish / progress / post-publish */}
                {!published && !publishing && (
                  <button
                    onClick={publish}
                    disabled={!readyToShip}
                    className="group relative inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-foreground text-sm font-semibold text-background transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {readyToShip ? "Publish deck →" : `Resolve ${openIssues} issue${openIssues === 1 ? "" : "s"} first`}
                  </button>
                )}
                {publishing && (
                  <div className="animate-rise">
                    <StripedProgress value={progress} label="Publishing" />
                    <p className="mt-3 text-xs text-muted-foreground">
                      Stitching narration, rendering waveforms, minting your link…
                    </p>
                  </div>
                )}
                {published && (
                  <div className="animate-rise space-y-3">
                    <div className="grid grid-cols-3 gap-2">
                      <ShareButton label="Copy" onClick={copyLink}>{copied ? "✓" : "⧉"}</ShareButton>
                      <ShareButton label="Email" href={`mailto:?subject=A%20deck%20for%20you&body=${encodeURIComponent(`https://${shareUrl}`)}`}>✉</ShareButton>
                      <ShareButton label="LinkedIn" href={`https://www.linkedin.com/sharing/share-offsite/?url=https://${shareUrl}`}>in</ShareButton>
                    </div>
                    <Link
                      to="/d/$token"
                      params={{ token: customSlug || "01" }}
                      className="flex w-full items-center justify-between rounded-xl border border-border bg-muted/40 px-4 py-3 text-xs font-semibold transition-colors hover:border-foreground"
                    >
                      <span>Open as recipient</span>
                      <span>→</span>
                    </Link>
                    <QrBlock text={shareUrl} />
                  </div>
                )}

                {/* Summary */}
                <div className="mt-5 border-t border-border pt-4">
                  <div className="eyebrow mb-2">Summary</div>
                  <SummaryRow k="Access"   v={access === "anyone" ? "Anyone with the link" : access === "email" ? "Email-gated" : "Password"} />
                  <SummaryRow k="Capture"  v={captureEmail ? "Email required" : "Anonymous ok"} />
                  <SummaryRow k="Tracking" v={trackDwell ? "Dwell per slide" : "Basic opens only"} />
                  <SummaryRow k="Expires"  v={expires === "never" ? "Never" : expires === "7d" ? "In 7 days" : "In 30 days"} />
                </div>
              </div>
            </div>

            {published && (
              <div className="mt-4 rounded-2xl border border-border bg-background p-4">
                <div className="eyebrow mb-2">What now?</div>
                <ul className="space-y-2 text-xs text-muted-foreground">
                  <li>· We'll notify you the moment someone opens it.</li>
                  <li>· Engagement lands in <Link to="/dashboard" className="underline underline-offset-2 hover:text-foreground">your dashboard</Link>.</li>
                  <li>· Edits to the deck update the same link — no re-sending.</li>
                </ul>
              </div>
            )}
          </aside>
        </div>
      </div>
    </AppShell>
  );
}

function SummaryRow({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-baseline justify-between border-b border-dashed border-border py-1.5 text-xs last:border-0">
      <span className="text-muted-foreground">{k}</span>
      <span className="font-mono font-semibold">{v}</span>
    </div>
  );
}

function ShareButton({
  children, label, onClick, href,
}: { children: React.ReactNode; label: string; onClick?: () => void; href?: string }) {
  const cls = "flex flex-col items-center gap-1 rounded-xl border border-border bg-background py-3 text-xs font-semibold text-foreground transition-colors hover:border-foreground hover:bg-muted";
  const content = (
    <>
      <span className="text-base leading-none">{children}</span>
      <span className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</span>
    </>
  );
  return href
    ? <a href={href} target="_blank" rel="noreferrer" className={cls}>{content}</a>
    : <button onClick={onClick} className={cls}>{content}</button>;
}

function QrBlock({ text }: { text: string }) {
  // Purely decorative pixel pattern — real QR would come from server.
  const pattern = useMemo(() => {
    const size = 17;
    let seed = 0;
    for (let i = 0; i < text.length; i++) seed = (seed * 31 + text.charCodeAt(i)) >>> 0;
    const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 0xffffffff; };
    return Array.from({ length: size * size }, () => rnd() > 0.55);
  }, [text]);
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-muted/40 p-3">
      <div className="grid h-20 w-20 flex-none grid-cols-[repeat(17,1fr)] gap-[1px] rounded-md bg-background p-1.5">
        {pattern.map((on, i) => (
          <span key={i} className={on ? "bg-foreground" : "bg-background"} />
        ))}
      </div>
      <div className="min-w-0">
        <div className="eyebrow">Scan to open</div>
        <div className="mt-1 truncate font-mono text-xs">{text}</div>
        <div className="mt-1 text-[10px] text-muted-foreground">Perfect for on-stage or on-slide.</div>
      </div>
    </div>
  );
}

import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AppShell } from "@/components/shell";
import {
  Button,
  OffsetButton,
  Input,
  Textarea,
  Label,
  StatusPill,
  Card,
  StripedProgress,
  Waveform,
} from "@/components/ui-kit";

export const Route = createFileRoute("/style")({
  head: () => ({
    meta: [
      { title: "Voxdeck — Style" },
      { name: "robots", content: "noindex, nofollow" },
      { name: "description", content: "Internal design system reference for Voxdeck." },
    ],
  }),
  component: StylePage,
});

const sections = [
  { id: "brand", label: "01 · Brand" },
  { id: "color", label: "02 · Color" },
  { id: "type", label: "03 · Type" },
  { id: "buttons", label: "04 · Buttons" },
  { id: "forms", label: "05 · Forms" },
  { id: "pills", label: "06 · Status" },
  { id: "motion", label: "07 · Progress & motion" },
  { id: "cards", label: "08 · Cards" },
  { id: "voice", label: "09 · Voice primitives" },
];

const colorTokens = [
  { name: "paper", css: "--paper", value: "oklch(1 0 0)", swatch: "bg-paper", ring: true },
  { name: "chalk", css: "--chalk", value: "oklch(0.972 0 0)", swatch: "bg-chalk", ring: true },
  { name: "ink", css: "--ink", value: "oklch(0.14 0 0)", swatch: "bg-ink" },
  { name: "lime (accent)", css: "--lime", value: "oklch(0.94 0.22 118)", swatch: "bg-lime" },
  { name: "live", css: "--live", value: "oklch(0.72 0.19 148)", swatch: "bg-live" },
  { name: "warn", css: "--warn", value: "oklch(0.78 0.16 78)", swatch: "bg-warn" },
  { name: "danger", css: "--danger", value: "oklch(0.62 0.22 27)", swatch: "bg-danger" },
  { name: "border", css: "--border", value: "ink @ 8%", swatch: "bg-border" },
];

const typeSpecs = [
  { label: "Display / XL", cls: "font-display text-7xl font-bold tracking-tighter", sample: "Make the deck talk.", meta: "Space Grotesk · 72 / 700 / -0.03em" },
  { label: "Display / L", cls: "font-display text-5xl font-bold tracking-tight", sample: "A voice for every slide.", meta: "Space Grotesk · 48 / 700" },
  { label: "Display / M", cls: "font-display text-3xl font-bold tracking-tight", sample: "Chapter 04 — Product", meta: "Space Grotesk · 30 / 700" },
  { label: "Body / L", cls: "text-lg leading-relaxed", sample: "Upload a deck. We write, narrate, and hand you a link prospects actually finish.", meta: "Instrument Sans · 18 / 400" },
  { label: "Body / M", cls: "text-base", sample: "Body copy for cards, forms, and dense reading.", meta: "Instrument Sans · 16 / 400" },
  { label: "Mono / data", cls: "font-mono text-sm", sample: "00:34 / 04:12  ·  92% ·  slide 04", meta: "JetBrains Mono · 14 / 500" },
  { label: "Eyebrow", cls: "eyebrow", sample: "Section · label · caption", meta: "JetBrains Mono · 11 / 500 · +0.18em" },
];

function Section({ id, title, kicker, children }: { id: string; title: string; kicker: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24 border-t border-border py-12 first:border-t-0 first:pt-0">
      <div className="mb-8">
        <div className="eyebrow mb-2">{kicker}</div>
        <h2 className="font-display text-3xl font-bold tracking-tight">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function Swatch({ tone, ring, name, css, value }: { tone: string; ring?: boolean; name: string; css: string; value: string }) {
  return (
    <div>
      <div className={`h-24 w-full rounded-xl ${tone} ${ring ? "border border-border" : ""}`} />
      <div className="mt-2 text-xs font-semibold">{name}</div>
      <div className="font-mono text-[10px] text-muted-foreground">{css}</div>
      <div className="font-mono text-[10px] text-muted-foreground">{value}</div>
    </div>
  );
}

function StylePage() {
  const [progress] = useState(60);
  return (
    <AppShell variant="app">
      <div className="mx-auto grid max-w-[1400px] gap-10 px-6 py-12 lg:grid-cols-[220px_1fr]">
        {/* TOC */}
        <aside className="lg:sticky lg:top-24 lg:h-fit">
          <div className="eyebrow mb-4">Voxdeck / Style</div>
          <div className="font-display text-2xl font-bold tracking-tight">Design system.</div>
          <p className="mt-2 text-xs text-muted-foreground">
            Internal reference. Not linked from public nav. Every rule below is the source of truth for the app.
          </p>
          <nav className="mt-6 space-y-1 border-l border-border pl-4">
            {sections.map((s) => (
              <a key={s.id} href={`#${s.id}`} className="block py-1 font-mono text-[11px] text-muted-foreground transition-colors hover:text-foreground">
                {s.label}
              </a>
            ))}
          </nav>
        </aside>

        {/* Content */}
        <div className="min-w-0">
          {/* Brand */}
          <Section id="brand" kicker={sections[0].label} title="Brand marks & voice.">
            <div className="grid gap-6 md:grid-cols-2">
              <div className="rounded-2xl border border-border bg-paper p-8">
                <div className="mb-6 flex h-20 items-center">
                  <div className="inline-flex items-center gap-2">
                    <span className="relative inline-flex h-9 w-9 items-center justify-center rounded-md bg-foreground text-background">
                      <Waveform className="text-background" />
                    </span>
                    <span className="font-display text-2xl font-bold tracking-tighter text-foreground">
                      VOXDECK<span className="text-accent">.</span>
                    </span>
                  </div>
                </div>
                <div className="eyebrow">On paper — default</div>
              </div>
              <div className="rounded-2xl border border-border bg-ink p-8">
                <div className="mb-6 flex h-20 items-center">
                  <div className="inline-flex items-center gap-2">
                    <span className="relative inline-flex h-9 w-9 items-center justify-center rounded-md bg-paper text-ink">
                      <Waveform className="text-ink" />
                    </span>
                    <span className="font-display text-2xl font-bold tracking-tighter text-paper">
                      VOXDECK<span className="text-accent">.</span>
                    </span>
                  </div>
                </div>
                <div className="eyebrow text-paper/60">On ink — inverted</div>
              </div>
            </div>
            <div className="mt-6 grid gap-3 md:grid-cols-3">
              {[
                { k: "Safe area", v: "Wordmark gets ≥ 24px clear space on all sides. Never crop the dot." },
                { k: "The dot", v: "The acid-lime full stop is non-negotiable. It's the punctuation of the brand." },
                { k: "Voice", v: "Editorial, precise, a little rebellious. Never corporate. Never cute." },
              ].map((r) => (
                <div key={r.k} className="rounded-xl border border-border p-4">
                  <div className="eyebrow mb-1">{r.k}</div>
                  <div className="text-sm">{r.v}</div>
                </div>
              ))}
            </div>
          </Section>

          {/* Color */}
          <Section id="color" kicker={sections[1].label} title="Monochrome + one accent.">
            <div className="grid grid-cols-2 gap-6 sm:grid-cols-4">
              {colorTokens.map((c) => (
                <Swatch key={c.name} tone={c.swatch} ring={c.ring} name={c.name} css={c.css} value={c.value} />
              ))}
            </div>
            <p className="mt-6 max-w-2xl text-sm text-muted-foreground">
              Ink and paper carry 95% of the surface. Lime appears only at decision points — the CTA, the punctuation dot, the live playhead. If you're reaching for a second accent, don't.
            </p>
          </Section>

          {/* Type */}
          <Section id="type" kicker={sections[2].label} title="Editorial display, precise mono.">
            <div className="space-y-6">
              {typeSpecs.map((t) => (
                <div key={t.label} className="grid gap-3 border-b border-border pb-6 last:border-0 md:grid-cols-[180px_1fr]">
                  <div>
                    <div className="eyebrow">{t.label}</div>
                    <div className="mt-1 font-mono text-[10px] text-muted-foreground">{t.meta}</div>
                  </div>
                  <div className={t.cls}>{t.sample}</div>
                </div>
              ))}
            </div>
          </Section>

          {/* Buttons */}
          <Section id="buttons" kicker={sections[3].label} title="Buttons.">
            <div className="rounded-2xl border border-border p-6">
              <div className="eyebrow mb-4">Variant × size matrix</div>
              <div className="grid gap-4">
                {(["primary", "secondary", "ghost", "accent"] as const).map((variant) => (
                  <div key={variant} className="grid items-center gap-4 md:grid-cols-[100px_1fr]">
                    <div className="font-mono text-xs text-muted-foreground">{variant}</div>
                    <div className="flex flex-wrap items-center gap-3">
                      <Button variant={variant} size="sm">Small</Button>
                      <Button variant={variant} size="md">Medium</Button>
                      <Button variant={variant} size="lg">Large</Button>
                      <Button variant={variant} size="md" disabled>Disabled</Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="mt-6 rounded-2xl border-2 border-foreground p-6 offset-shadow-sm">
              <div className="eyebrow mb-4">Signature — OffsetButton</div>
              <div className="flex flex-wrap items-center gap-8">
                <OffsetButton>Publish deck →</OffsetButton>
                <p className="max-w-sm text-xs text-muted-foreground">
                  Reserved for the single most important action on any screen. On hover the lime shadow snaps under the button — never animate it back and forth.
                </p>
              </div>
            </div>
          </Section>

          {/* Forms */}
          <Section id="forms" kicker={sections[4].label} title="Form controls.">
            <div className="grid gap-6 md:grid-cols-2">
              <div className="rounded-2xl border border-border p-6">
                <Label>Email address</Label>
                <Input placeholder="you@company.com" />
                <div className="mt-4">
                  <Label>Disabled input</Label>
                  <Input placeholder="Locked" disabled />
                </div>
              </div>
              <div className="rounded-2xl border border-border p-6">
                <Label>Narration script</Label>
                <Textarea rows={4} placeholder="Type or paste your script…" />
              </div>
            </div>
          </Section>

          {/* Pills */}
          <Section id="pills" kicker={sections[5].label} title="Status pills.">
            <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-border p-6">
              <StatusPill status="draft" />
              <StatusPill status="published" />
              <StatusPill status="processing" />
              <StatusPill status="failed" />
              <StatusPill status="live" />
              <StatusPill status="idle" />
            </div>
            <p className="mt-4 text-xs text-muted-foreground">
              Published and Live pulse the dot. Everything else is static. Never invent a new state — extend the enum in <code className="font-mono">ui-kit.tsx</code>.
            </p>
          </Section>

          {/* Motion */}
          <Section id="motion" kicker={sections[6].label} title="Progress & motion.">
            <div className="grid gap-6 md:grid-cols-2">
              <div className="rounded-2xl border border-border p-6">
                <div className="space-y-5">
                  <StripedProgress value={25} label="Parsing PDF" />
                  <StripedProgress value={progress} label="Generating narration" />
                  <StripedProgress value={95} label="Rendering audio" />
                </div>
                <p className="mt-4 text-xs text-muted-foreground">
                  Marching-ants stripes. 1s linear, always moving while the task is live. Freeze on completion — don't fade out the stripes.
                </p>
              </div>
              <div className="rounded-2xl border border-border p-6">
                <div className="eyebrow mb-3">Waveform</div>
                <div className="flex items-center gap-4">
                  <Waveform className="text-foreground" />
                  <Waveform className="text-accent" />
                  <Waveform className="text-muted-foreground" />
                </div>
                <p className="mt-4 text-xs text-muted-foreground">
                  7 bars, 1.2s ease-in-out, staggered delays. The signature "voice present" motif. Use anywhere audio is playing or about to play.
                </p>
              </div>
            </div>
          </Section>

          {/* Cards */}
          <Section id="cards" kicker={sections[7].label} title="Surfaces.">
            <div className="grid gap-6 md:grid-cols-3">
              <Card>
                <div className="eyebrow mb-2">Default card</div>
                <div className="font-display text-lg font-bold">Rounded 2xl, hairline border, hover shadow.</div>
              </Card>
              <div className="rounded-2xl border border-border p-6 offset-shadow-sm">
                <div className="eyebrow mb-2">+ offset-shadow-sm</div>
                <div className="font-display text-lg font-bold">Static 2px ink shadow. For editor panes.</div>
              </div>
              <div className="rounded-2xl border-2 border-foreground bg-accent p-6 offset-shadow-sm">
                <div className="eyebrow mb-2">Accent block</div>
                <div className="font-display text-lg font-bold">Only for the "final ask" on a screen.</div>
              </div>
            </div>
            <div className="mt-6 flex flex-wrap gap-3 rounded-2xl border border-border p-6">
              <div className="eyebrow w-full">Radius scale</div>
              {[
                { name: "rounded-md", cls: "rounded-md" },
                { name: "rounded-lg", cls: "rounded-lg" },
                { name: "rounded-xl", cls: "rounded-xl" },
                { name: "rounded-2xl", cls: "rounded-2xl" },
                { name: "rounded-full", cls: "rounded-full" },
              ].map((r) => (
                <div key={r.name} className="text-center">
                  <div className={`h-16 w-16 border-2 border-foreground bg-muted ${r.cls}`} />
                  <div className="mt-2 font-mono text-[10px] text-muted-foreground">{r.name}</div>
                </div>
              ))}
            </div>
          </Section>

          {/* Voice */}
          <Section id="voice" kicker={sections[8].label} title="Voice & narration primitives.">
            <div className="space-y-6">
              <div className="rounded-2xl border border-border p-6">
                <div className="eyebrow mb-4">Persona chip</div>
                <div className="flex flex-wrap gap-3">
                  {[
                    { name: "Marcus", tag: "Confident · US", active: true },
                    { name: "Elena", tag: "Direct · UK" },
                    { name: "Kai", tag: "Warm · AUS" },
                  ].map((v) => (
                    <button
                      key={v.name}
                      className={`flex items-center gap-3 rounded-xl border p-3 text-left transition-colors ${
                        v.active ? "border-foreground bg-foreground text-background" : "border-border bg-background hover:bg-muted"
                      }`}
                    >
                      <Waveform className={v.active ? "text-accent" : "text-foreground"} />
                      <div>
                        <div className="text-sm font-semibold">{v.name}</div>
                        <div className={`text-[10px] ${v.active ? "text-background/60" : "text-muted-foreground"}`}>{v.tag}</div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="rounded-2xl border border-border p-6 offset-shadow-sm">
                <div className="eyebrow mb-4">Transport bar</div>
                <div className="flex items-center gap-4">
                  <button className="flex h-11 w-11 items-center justify-center rounded-full bg-foreground text-background">
                    <span className="ml-0.5">▶</span>
                  </button>
                  <div className="flex-1">
                    <div className="mb-1.5 flex items-center justify-between text-[10px] uppercase tracking-widest text-muted-foreground">
                      <span>Marcus · confident · 1.0×</span>
                      <span className="font-mono">01:12 / 04:34</span>
                    </div>
                    <div className="relative h-1 rounded-full bg-muted">
                      <div className="absolute inset-y-0 left-0 w-[36%] rounded-full bg-foreground" />
                      <div className="absolute -top-1 left-[36%] h-3 w-3 -translate-x-1/2 rounded-full border-2 border-background bg-foreground" />
                    </div>
                  </div>
                  <Waveform className="text-foreground" />
                </div>
              </div>
            </div>
          </Section>

          <div className="mt-16 border-t border-border pt-8 text-center">
            <div className="eyebrow">End of file</div>
            <p className="mt-2 text-xs text-muted-foreground">
              Extend, don't replace. Add new tokens in <code className="font-mono">styles.css</code>, new primitives in <code className="font-mono">ui-kit.tsx</code>, and document them here.
            </p>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

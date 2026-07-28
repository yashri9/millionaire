import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { AppShell } from "@/components/shell";
import { StripedProgress } from "@/components/ui-kit";
import { parsePdfToSlides, type ParseProgress } from "@/lib/pdf-parse";
import { saveDeck, newDeckId } from "@/lib/deck-store";

export const Route = createFileRoute("/new")({
  head: () => ({
    meta: [
      { title: "New deck · Voxdeck" },
      { name: "description", content: "Upload a PDF and Voxdeck will script and narrate it." },
    ],
  }),
  component: NewDeckPage,
});

function NewDeckPage() {
  const [phase, setPhase] = useState<"idle" | "upload" | "parse" | "narrate" | "error">("idle");
  const [progress, setProgress] = useState<ParseProgress>({ phase: "upload", current: 0, total: 1 });
  const [filename, setFilename] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [dragging, setDragging] = useState(false);
  const navigate = useNavigate();

  async function handleFile(file: File) {
    setFilename(file.name);
    setError("");
    if (!/\.pdf$/i.test(file.name)) {
      setPhase("error");
      setError("Only PDF files are supported right now. Convert your PPTX to PDF first.");
      return;
    }
    if (file.size > 25 * 1024 * 1024) {
      setPhase("error");
      setError("File is over 25MB. Try a slimmer export.");
      return;
    }
    setPhase("upload");
    try {
      const { title, slides } = await parsePdfToSlides(file, (p) => {
        setProgress(p);
        setPhase(p.phase);
      });
      const id = newDeckId();
      saveDeck({ id, title, slides, createdAt: Date.now() });
      // Small pause so the completed state is visible
      setTimeout(() => navigate({ to: "/deck/$id", params: { id } }), 400);
    } catch (err) {
      console.error(err);
      setPhase("error");
      setError(err instanceof Error ? err.message : "Couldn't parse that PDF.");
    }
  }

  const pct = phase === "narrate"
    ? 100
    : phase === "upload"
      ? 8
      : Math.round((progress.current / Math.max(1, progress.total)) * 92) + 8;

  const stages = [
    { key: "upload",  label: "Uploading file",  detail: "Reading bytes into the studio" },
    { key: "parse",   label: "Reading slides",  detail: `Extracting text + rendering thumbnails${progress.total ? ` · ${progress.current}/${progress.total}` : ""}` },
    { key: "narrate", label: "Drafting scripts",detail: "Turning each page into a spoken line" },
  ] as const;

  return (
    <AppShell variant="app">
      <div className="mx-auto max-w-3xl px-6 py-16">
        <div className="mb-10">
          <div className="eyebrow mb-3">Studio · new session</div>
          <h1 className="font-display text-5xl font-bold tracking-tighter">Drop the deck.</h1>
          <p className="mt-2 text-muted-foreground">
            PDF up to 25MB · parsed in the browser · nothing leaves your device.
          </p>
        </div>

        {phase === "idle" || phase === "error" ? (
          <>
            <label
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault(); setDragging(false);
                const f = e.dataTransfer.files?.[0];
                if (f) handleFile(f);
              }}
              className={`group relative block cursor-pointer overflow-hidden rounded-3xl border-2 border-dashed p-16 text-center transition-all ${
                dragging ? "border-foreground bg-accent/20 scale-[1.01]" : "border-foreground/30 bg-muted hover:border-foreground hover:bg-accent/10"
              }`}
            >
              <div className="grid-paper absolute inset-0 opacity-40" aria-hidden />
              <input
                type="file"
                accept="application/pdf,.pdf"
                hidden
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
              />
              <div className="relative flex flex-col items-center gap-4">
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl border-2 border-foreground bg-background offset-shadow-sm">
                  <span className="font-display text-3xl font-bold">+</span>
                </div>
                <div className="font-display text-2xl font-bold tracking-tight">
                  Drag a PDF here, or <span className="underline decoration-accent decoration-4 underline-offset-4">click to browse</span>
                </div>
                <div className="eyebrow">PDF · 25MB max · parses locally</div>
              </div>
            </label>
            {phase === "error" && (
              <div className="mt-6 rounded-2xl border-2 border-danger bg-danger/10 p-4 text-sm text-danger">
                <div className="eyebrow mb-1 text-danger">Couldn't parse {filename || "that file"}</div>
                {error}
              </div>
            )}
          </>
        ) : (
          <div className="relative overflow-hidden rounded-3xl border-2 border-foreground bg-background p-8 offset-shadow">
            <div className="mb-6 flex items-center justify-between">
              <div>
                <div className="eyebrow mb-1">Now processing</div>
                <div className="font-display text-2xl font-bold tracking-tight">{filename || "your.pdf"}</div>
              </div>
              <button onClick={() => { setPhase("idle"); }} className="text-xs font-semibold uppercase tracking-widest text-muted-foreground hover:text-foreground">
                Cancel
              </button>
            </div>

            <StripedProgress value={pct} label={stages.find((s) => s.key === phase)?.label} />

            <div className="mt-8 space-y-3">
              {stages.map((s, i) => {
                const currentIdx = stages.findIndex((x) => x.key === phase);
                const active = currentIdx === i;
                const done = currentIdx > i;
                return (
                  <div key={s.key} className={`flex items-center gap-4 rounded-xl border p-4 transition-colors ${
                    active ? "border-foreground bg-accent/10" : done ? "border-border bg-muted" : "border-border opacity-40"
                  }`}>
                    <div className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold ${
                      done ? "bg-live text-background" : active ? "bg-foreground text-background" : "bg-muted text-muted-foreground"
                    }`}>
                      {done ? "✓" : String(i + 1).padStart(2, "0")}
                    </div>
                    <div className="flex-1">
                      <div className="font-semibold text-sm">{s.label}</div>
                      <div className="text-xs text-muted-foreground">{s.detail}</div>
                    </div>
                    {active && (
                      <span className="waveform text-foreground">
                        <span /><span /><span /><span /><span /><span /><span />
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="mt-8 text-center text-sm">
          <Link to="/dashboard" className="text-muted-foreground hover:text-foreground">
            ← Back to your decks
          </Link>
        </div>
      </div>
    </AppShell>
  );
}

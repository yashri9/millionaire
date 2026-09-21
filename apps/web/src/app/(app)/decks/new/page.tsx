"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { AppShell } from "@/components/shell";
import { OffsetButton, StripedProgress } from "@/components/ui-kit";
import {
  parsePdfToSlides,
  userMessageForParseError,
  validatePdfFile,
  type ParseProgress,
} from "@/lib/pdf-parse";
import {
  saveDeck,
  newDeckId,
  DeckStorageError,
  isQuotaExceededError,
  DECK_SAVE_QUOTA_MESSAGE,
} from "@/lib/deck-store";
import { uploadAndProcessPdf } from "@/lib/studio-api";

type UploadState =
  | "idle"
  | "validating"
  | "parsing"
  | "success"
  | "invalid_file"
  | "file_too_large"
  | "parse_error"
  | "unsupported_pdf"
  | "save_error";

export default function NewDeckPage() {
  const [state, setState] = useState<UploadState>("idle");
  const [progressPhase, setProgressPhase] = useState<
    "upload" | "parse" | "ocr" | "narrate"
  >("upload");
  const [progress, setProgress] = useState<ParseProgress>({
    phase: "upload",
    current: 0,
    total: 1,
  });
  const [filename, setFilename] = useState("");
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);
  const busyRef = useRef(false);
  const runIdRef = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  async function handleFile(file: File) {
    if (busyRef.current) return;
    const runId = ++runIdRef.current;
    busyRef.current = true;

    setFilename(file.name);
    setError("");
    setState("validating");

    const validation = validatePdfFile(file);
    if (validation) {
      if (runId !== runIdRef.current) return;
      setState(
        validation.code === "file_too_large"
          ? "file_too_large"
          : validation.code === "password"
            ? "unsupported_pdf"
            : "invalid_file",
      );
      setError(validation.message);
      busyRef.current = false;
      return;
    }

    setState("parsing");
    setProgressPhase("upload");
    const onProgress = (p: ParseProgress) => {
      if (runId !== runIdRef.current) return;
      setProgress(p);
      setProgressPhase(p.phase);
    };
    try {
      try {
        const remote = await uploadAndProcessPdf(file, onProgress);
        if (runId !== runIdRef.current) return;
        saveDeck(remote);
        setState("success");
        setTimeout(() => {
          if (runId === runIdRef.current) router.push(`/decks/${remote.id}/edit`);
        }, 350);
        return;
      } catch (remoteErr) {
        const msg = remoteErr instanceof Error ? remoteErr.message : "";
        const fallback =
          /not authenticated|sign in|401/i.test(msg) ||
          /could not start upload|could not create upload url|invalid compact jws|payload too large|request entity too large|413/i.test(
            msg,
          );
        if (!fallback) throw remoteErr;
        if (process.env.NODE_ENV !== "production") {
          console.warn("[new-deck] server upload unavailable, parsing locally", remoteErr);
        }
      }

      const { title, slides: parsedSlides } = await parsePdfToSlides(file, onProgress);
      if (runId !== runIdRef.current) return;
      if (!parsedSlides.length) {
        setState("parse_error");
        setError(
          "This PDF doesn't contain readable pages. Please upload another file.",
        );
        busyRef.current = false;
        return;
      }

      // Primary narration: LLM pipeline → results[] by slideNo → each slide.script
      setProgressPhase("narrate");
      setProgress({ phase: "narrate", current: 0, total: parsedSlides.length });
      let slides = parsedSlides;
      const payload = {
        companyName: title.replace(/\.[Pp][Dd][Ff]$/, "").trim() || title,
        deckPurpose: "pitch",
        slides: parsedSlides
          .map((s) => s.slideContent)
          .filter((c): c is NonNullable<typeof c> => Boolean(c)),
      };
      if (payload.slides.length !== parsedSlides.length) {
        throw new Error(
          "Slide structure incomplete — could not build narration inputs.",
        );
      }
      const res = await fetch("/api/script/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        results?: {
          slideNo: number;
          narration: string;
          coveragePoints?: string[];
          generationMethod?: "llm" | "extractive-fallback";
          lowConfidenceFlags?: string[];
        }[];
        meta?: { llmConfigured?: boolean; generationMethod?: string };
      };
      if (!res.ok) {
        throw new Error(
          data.error ??
            `Narration generation failed (${res.status}). Check GROQ_API_KEY and try again.`,
        );
      }
      // Same contract as eval JSON: for each slideNo, use that result's narration only.
      const byNo = new Map(
        (data.results ?? []).map((r) => [r.slideNo, r] as const),
      );
      if (byNo.size !== parsedSlides.length) {
        throw new Error(
          `Narration returned ${byNo.size} slides, expected ${parsedSlides.length}.`,
        );
      }
      slides = parsedSlides.map((s, i) => {
        const slideNo = i + 1;
        const r = byNo.get(slideNo);
        if (!r?.narration) {
          throw new Error(`Missing narration for slide ${slideNo}.`);
        }
        const words = r.narration.trim().split(/\s+/).filter(Boolean).length;
        return {
          ...s,
          script: r.narration,
          essentialPoints: r.coveragePoints?.length
            ? r.coveragePoints
            : s.essentialPoints,
          generationMethod: r.generationMethod ?? s.generationMethod,
          lowConfidenceFlags: r.lowConfidenceFlags,
          durationSec: Math.max(8, Math.round((words / 155) * 60)),
        };
      });
      if (runId !== runIdRef.current) return;

      setProgress({ phase: "narrate", current: slides.length, total: slides.length });
      const id = newDeckId();
      try {
        saveDeck({
          id,
          title,
          slides,
          createdAt: Date.now(),
          revision: 0,
          updatedAt: Date.now(),
          highlights: {},
        });
      } catch (err) {
        if (err instanceof DeckStorageError || isQuotaExceededError(err)) {
          setState("save_error");
          setError(DECK_SAVE_QUOTA_MESSAGE);
          busyRef.current = false;
          return;
        }
        throw err;
      }
      setState("success");
      setTimeout(() => {
        if (runId === runIdRef.current) router.push(`/decks/${id}/edit`);
      }, 350);
    } catch (err) {
      if (runId !== runIdRef.current) return;
      if (process.env.NODE_ENV !== "production") {
        console.error("[new-deck] parse failed", err);
      }
      if (err instanceof DeckStorageError || isQuotaExceededError(err)) {
        setState("save_error");
        setError(DECK_SAVE_QUOTA_MESSAGE);
        busyRef.current = false;
        return;
      }
      const message = userMessageForParseError(err);
      const lower = message.toLowerCase();
      setState(
        lower.includes("password")
          ? "unsupported_pdf"
          : "parse_error",
      );
      setError(message);
      busyRef.current = false;
    }
  }

  function resetToIdle() {
    runIdRef.current += 1;
    busyRef.current = false;
    setState("idle");
    setError("");
    setFilename("");
    if (inputRef.current) inputRef.current.value = "";
  }

  const showDropzone =
    state === "idle" ||
    state === "invalid_file" ||
    state === "file_too_large" ||
    state === "parse_error" ||
    state === "unsupported_pdf" ||
    state === "save_error";

  const pct =
    progressPhase === "narrate"
      ? 100
      : progressPhase === "upload"
        ? 8
        : progressPhase === "ocr"
          ? Math.round((progress.current / Math.max(1, progress.total)) * 40) + 50
          : Math.round((progress.current / Math.max(1, progress.total)) * 42) + 8;

  const stages = [
    { key: "upload", label: "Reading file" },
    { key: "parse", label: "Reading slides" },
    { key: "ocr", label: "Reading pages + charts" },
    { key: "narrate", label: "Writing pitch scripts" },
  ] as const;

  return (
    <AppShell variant="app">
      <div className="mx-auto max-w-3xl px-6 py-16">
        <div className="mb-10">
          <h1 className="font-display text-5xl font-bold tracking-tighter">
            Drop the deck.
          </h1>
        </div>

        {showDropzone ? (
          <>
            <label
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                const f = e.dataTransfer.files?.[0];
                if (f) void handleFile(f);
              }}
              className={`group relative block cursor-pointer overflow-hidden rounded-3xl border-2 border-dashed p-16 text-center transition-all ${
                dragging
                  ? "scale-[1.01] border-foreground bg-accent/20"
                  : "border-foreground/30 bg-muted hover:border-foreground hover:bg-accent/10"
              }`}
            >
              <div className="grid-paper absolute inset-0 opacity-40" aria-hidden />
              <input
                ref={inputRef}
                type="file"
                accept="application/pdf,.pdf"
                hidden
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void handleFile(f);
                }}
              />
              <div className="relative flex flex-col items-center gap-4">
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl border-2 border-foreground bg-background offset-shadow-sm">
                  <span className="font-display text-3xl font-bold">+</span>
                </div>
                <div className="font-display text-2xl font-bold tracking-tight">
                  Drag a PDF here, or{" "}
                  <span className="underline decoration-accent decoration-4 underline-offset-4">
                    click to browse
                  </span>
                </div>
                <div className="eyebrow">PDF · 25MB max · securely processed in your workspace</div>
              </div>
            </label>

            {error && (
              <div
                role="alert"
                className="mt-6 rounded-2xl border border-danger/40 bg-danger/10 p-5"
              >
                <div className="font-display text-lg font-bold tracking-tight text-foreground">
                  {state === "save_error"
                    ? "Deck couldn't be saved"
                    : "PDF couldn't be processed"}
                </div>
                <p className="mt-2 text-sm text-muted-foreground">{error}</p>
                {filename ? (
                  <p className="mt-1 text-xs text-muted-foreground">{filename}</p>
                ) : null}
                <div className="mt-4 flex flex-wrap gap-3">
                  <OffsetButton
                    type="button"
                    onClick={() => {
                      resetToIdle();
                      inputRef.current?.click();
                    }}
                  >
                    Choose another PDF
                  </OffsetButton>
                  <button
                    type="button"
                    onClick={resetToIdle}
                    className="text-sm font-semibold text-muted-foreground hover:text-foreground"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="relative overflow-hidden rounded-3xl border-2 border-foreground bg-background p-8 offset-shadow">
            <div className="mb-6 flex items-center justify-between">
              <div>
                <div className="eyebrow mb-1">
                  {state === "success" ? "Ready" : "Now processing"}
                </div>
                <div className="font-display text-2xl font-bold tracking-tight">
                  {filename || "your.pdf"}
                </div>
              </div>
              {state === "parsing" && (
                <button
                  type="button"
                  onClick={resetToIdle}
                  className="text-xs font-semibold uppercase tracking-widest text-muted-foreground hover:text-foreground"
                >
                  Cancel
                </button>
              )}
            </div>

            <StripedProgress
              value={pct}
              label={stages.find((s) => s.key === progressPhase)?.label}
            />

            <div className="mt-8 space-y-3">
              {stages.map((s, i) => {
                const currentIdx = stages.findIndex((x) => x.key === progressPhase);
                const active = state === "parsing" && currentIdx === i;
                const done =
                  state === "success" ||
                  (state === "parsing" && currentIdx > i);
                return (
                  <div
                    key={s.key}
                    className={`flex items-center gap-4 rounded-xl border p-4 transition-colors ${
                      active
                        ? "border-foreground bg-accent/10"
                        : done
                          ? "border-border bg-muted"
                          : "border-border opacity-40"
                    }`}
                  >
                    <div
                      className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold ${
                        done
                          ? "bg-live text-background"
                          : active
                            ? "bg-foreground text-background"
                            : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {done ? "✓" : String(i + 1).padStart(2, "0")}
                    </div>
                    <div className="flex-1">
                      <div className="text-sm font-semibold">{s.label}</div>
                    </div>
                    {active && (
                      <span className="waveform text-foreground">
                        <span />
                        <span />
                        <span />
                        <span />
                        <span />
                        <span />
                        <span />
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="mt-8 text-center text-sm">
          <Link href="/dashboard" className="text-muted-foreground hover:text-foreground">
            ← Back to your decks
          </Link>
        </div>
      </div>
    </AppShell>
  );
}

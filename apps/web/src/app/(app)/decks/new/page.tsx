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
} from "@/lib/pdf-parse";
import {
  cacheDeck,
  saveLocalDraft,
  fetchDeck,
  DeckStorageError,
  isQuotaExceededError,
  DECK_SAVE_QUOTA_MESSAGE,
} from "@/lib/deck-store";
import { uploadFileWithTus, type TusUploadConfig } from "@/lib/tus-upload";

type UploadState =
  | "idle"
  | "validating"
  | "parsing"
  | "success"
  | "invalid_file"
  | "file_too_large"
  | "parse_error"
  | "unsupported_pdf"
  | "upload_failed"
  | "save_error";

type ProgressPhase = "upload" | "parse" | "ocr" | "narrate";

export default function NewDeckPage() {
  const [state, setState] = useState<UploadState>("idle");
  const [progressPhase, setProgressPhase] = useState<ProgressPhase>("upload");
  const [progressPct, setProgressPct] = useState(0);
  const [filename, setFilename] = useState("");
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);
  const [lastFile, setLastFile] = useState<File | null>(null);
  const [draftOffer, setDraftOffer] = useState(false);
  const busyRef = useRef(false);
  const runIdRef = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  async function pollUntilReady(deckId: string, runId: number) {
    const started = Date.now();
    while (Date.now() - started < 10 * 60 * 1000) {
      if (runId !== runIdRef.current) return null;
      // Nudge worker
      void fetch("/api/jobs/run", { method: "POST" }).catch(() => null);
      const res = await fetch(`/api/decks/${deckId}`);
      if (res.ok) {
        const data = (await res.json()) as {
          deck?: { status?: string };
          slides?: unknown[];
          script?: unknown;
        };
        const status = data.deck?.status;
        if (status === "parse_failed") {
          throw new Error("We couldn't process this PDF. Please try again.");
        }
        if (status === "draft" || status === "published") {
          const hasSlides = Array.isArray(data.slides) && data.slides.length > 0;
          if (hasSlides) {
            // Prefer waiting briefly for script, but don't block forever.
            if (data.script || Date.now() - started > 90_000) {
              return data;
            }
            setProgressPhase("narrate");
            setProgressPct(85);
          } else {
            setProgressPhase("parse");
            setProgressPct(55);
          }
        } else {
          setProgressPhase("parse");
          setProgressPct(40);
        }
      }
      await new Promise((r) => setTimeout(r, 2000));
    }
    throw new Error("Processing is taking longer than expected. Open the deck from your library shortly.");
  }

  async function handleFile(file: File) {
    if (busyRef.current) return;
    const runId = ++runIdRef.current;
    busyRef.current = true;
    setLastFile(file);
    setDraftOffer(false);
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
    setProgressPct(5);

    try {
      const prep = await fetch("/api/decks/prepare", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          filename: file.name,
          size: file.size,
          contentType: file.type || "application/pdf",
        }),
      });
      const prepBody = (await prep.json().catch(() => ({}))) as {
        error?: string;
        deck?: { id: string };
        tus?: TusUploadConfig;
      };
      if (!prep.ok || !prepBody.deck?.id || !prepBody.tus) {
        throw new Error(
          prepBody.error ||
            "We couldn't upload your deck. Your deck has not been marked as saved.",
        );
      }

      await uploadFileWithTus(file, prepBody.tus, {
        onProgress: (p) => {
          if (runId !== runIdRef.current) return;
          setProgressPhase("upload");
          setProgressPct(Math.min(35, Math.round(p.pct * 0.35)));
        },
      });

      setProgressPhase("parse");
      setProgressPct(40);
      const parseRes = await fetch(`/api/decks/${prepBody.deck.id}/parse`, {
        method: "POST",
      });
      const parseBody = (await parseRes.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!parseRes.ok) {
        throw new Error(parseBody.error || "Could not start processing.");
      }

      await pollUntilReady(prepBody.deck.id, runId);
      if (runId !== runIdRef.current) return;

      const loaded = await fetchDeck(prepBody.deck.id);
      if (loaded.ok) {
        try {
          cacheDeck(loaded.deck);
        } catch {
          /* cache optional */
        }
      }

      setProgressPct(100);
      setState("success");
      setTimeout(() => {
        if (runId === runIdRef.current) {
          router.push(`/decks/${prepBody.deck!.id}/edit`);
        }
      }, 350);
    } catch (err) {
      if (runId !== runIdRef.current) return;
      if (err instanceof DeckStorageError || isQuotaExceededError(err)) {
        setState("save_error");
        setError(DECK_SAVE_QUOTA_MESSAGE);
        busyRef.current = false;
        return;
      }
      const message =
        err instanceof Error
          ? err.message
          : "We couldn't upload your deck. Your deck has not been marked as saved.";
      setState(
        /password/i.test(message) ? "unsupported_pdf" : "upload_failed",
      );
      setError(
        /sign in|session|401|not authenticated/i.test(message)
          ? "Session expired. Please sign in again."
          : message,
      );
      setDraftOffer(true);
      busyRef.current = false;
    }
  }

  async function saveAsDeviceDraft() {
    if (!lastFile || busyRef.current) return;
    const runId = ++runIdRef.current;
    busyRef.current = true;
    setDraftOffer(false);
    setState("parsing");
    setError("");
    setProgressPhase("parse");
    try {
      const { title, slides } = await parsePdfToSlides(lastFile, (p) => {
        if (runId !== runIdRef.current) return;
        setProgressPhase(p.phase === "narrate" ? "narrate" : p.phase === "ocr" ? "ocr" : "parse");
        setProgressPct(
          p.total > 0 ? Math.round((p.current / p.total) * 80) + 10 : 20,
        );
      });
      if (!slides.length) {
        setState("parse_error");
        setError("This PDF doesn't contain readable pages.");
        busyRef.current = false;
        return;
      }
      const draft = saveLocalDraft({
        title,
        slides,
        createdAt: Date.now(),
        revision: 0,
        updatedAt: Date.now(),
        highlights: {},
      });
      setState("success");
      setTimeout(() => {
        if (runId === runIdRef.current) router.push(`/decks/${draft.id}/edit`);
      }, 350);
    } catch (err) {
      if (runId !== runIdRef.current) return;
      setState("parse_error");
      setError(userMessageForParseError(err));
      busyRef.current = false;
    }
  }

  function resetToIdle() {
    runIdRef.current += 1;
    busyRef.current = false;
    setState("idle");
    setError("");
    setFilename("");
    setDraftOffer(false);
    if (inputRef.current) inputRef.current.value = "";
  }

  const showDropzone =
    state === "idle" ||
    state === "invalid_file" ||
    state === "file_too_large" ||
    state === "parse_error" ||
    state === "unsupported_pdf" ||
    state === "upload_failed" ||
    state === "save_error";

  const stages = [
    { key: "upload", label: "Uploading to workspace" },
    { key: "parse", label: "Reading slides" },
    { key: "ocr", label: "Rendering pages" },
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
                <div className="eyebrow">
                  PDF · 25MB max · resumable upload · processed in your workspace
                </div>
              </div>
            </label>

            {error && (
              <div
                role="alert"
                className="mt-6 rounded-2xl border border-danger/40 bg-danger/10 p-5"
              >
                <div className="font-display text-lg font-bold tracking-tight">
                  {state === "upload_failed" ? "Upload failed" : "Couldn&apos;t process PDF"}
                </div>
                <p className="mt-2 text-sm text-muted-foreground">{error}</p>
                {state === "upload_failed" ? (
                  <p className="mt-2 text-sm text-muted-foreground">
                    Your deck has <strong>not</strong> been marked as saved in your workspace.
                  </p>
                ) : null}
                <div className="mt-4 flex flex-wrap gap-3">
                  <OffsetButton
                    type="button"
                    onClick={() => {
                      if (lastFile) void handleFile(lastFile);
                      else {
                        resetToIdle();
                        inputRef.current?.click();
                      }
                    }}
                  >
                    Retry upload
                  </OffsetButton>
                  {draftOffer && lastFile ? (
                    <button
                      type="button"
                      onClick={() => void saveAsDeviceDraft()}
                      className="rounded-full border border-border bg-background px-4 py-2 text-sm font-semibold hover:bg-muted"
                    >
                      Keep as device draft
                    </button>
                  ) : null}
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
              value={progressPct}
              label={stages.find((s) => s.key === progressPhase)?.label}
            />
            <div className="mt-8 space-y-3">
              {stages.map((s, i) => {
                const currentIdx = stages.findIndex((x) => x.key === progressPhase);
                const active = state === "parsing" && currentIdx === i;
                const done = state === "success" || (state === "parsing" && currentIdx > i);
                return (
                  <div
                    key={s.key}
                    className={`flex items-center gap-4 rounded-xl border p-4 ${
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
                    <div className="text-sm font-semibold">{s.label}</div>
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

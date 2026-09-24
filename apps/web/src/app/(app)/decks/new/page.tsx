"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
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
  deleteCloudDeck,
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
  | "save_error"
  /** Server is still working after 10 min. The deck exists; don't offer a duplicate device draft. */
  | "slow";

type ProgressPhase = "upload" | "parse" | "ocr" | "narrate";

class SlowProcessingError extends Error {
  constructor() {
    super("This deck is taking longer than usual. It is still processing and will appear in your decks when it's ready.");
  }
}

/**
 * The server created a deck row for this run but the run failed or was
 * cancelled. Delete it so the dashboard doesn't fill up with empty
 * "0 slides" decks. Best effort — never blocks the UI.
 */
function discardOrphanDeck(id: string | null) {
  if (!id) return;
  void deleteCloudDeck(id).catch(() => null);
}

export default function NewDeckPage() {
  const [state, setState] = useState<UploadState>("idle");
  const [progressPhase, setProgressPhase] = useState<ProgressPhase>("upload");
  const [progressPct, setProgressPct] = useState(0);
  const [filename, setFilename] = useState("");
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);
  const [lastFile, setLastFile] = useState<File | null>(null);
  const [draftOffer, setDraftOffer] = useState(false);
  /** Cloud upload (server parses) vs device draft (parsed in this browser, has an OCR step). */
  const [mode, setMode] = useState<"cloud" | "device">("cloud");
  /** Server deck row created by /api/decks/prepare for the current run. */
  const deckIdRef = useRef<string | null>(null);
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
          throw new Error("We couldn't read this PDF. Try again, or export it again from your slides app.");
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
    throw new SlowProcessingError();
  }

  async function handleFile(file: File) {
    if (busyRef.current) return;
    const runId = ++runIdRef.current;
    busyRef.current = true;
    setLastFile(file);
    setDraftOffer(false);
    setMode("cloud");
    deckIdRef.current = null;
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
            "We couldn't upload your deck. Check your connection and try again.",
        );
      }
      deckIdRef.current = prepBody.deck.id;

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
      deckIdRef.current = null; // kept — it's a real deck now
      setState("success");
      setTimeout(() => {
        if (runId === runIdRef.current) {
          router.push(`/decks/${prepBody.deck!.id}/edit`);
        }
      }, 350);
    } catch (err) {
      if (runId !== runIdRef.current) return;
      if (err instanceof SlowProcessingError) {
        // The deck is real and still processing. Keep it; point to the library.
        deckIdRef.current = null;
        setState("slow");
        setError(err.message);
        busyRef.current = false;
        return;
      }
      discardOrphanDeck(deckIdRef.current);
      deckIdRef.current = null;
      if (err instanceof DeckStorageError || isQuotaExceededError(err)) {
        setState("save_error");
        setError(DECK_SAVE_QUOTA_MESSAGE);
        busyRef.current = false;
        return;
      }
      const message =
        err instanceof Error
          ? err.message
          : "We couldn't upload your deck. Check your connection and try again.";
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
    setMode("device");
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
    // Cancel mid-upload used to leave a half-made deck on the server.
    discardOrphanDeck(deckIdRef.current);
    deckIdRef.current = null;
    runIdRef.current += 1;
    busyRef.current = false;
    setState("idle");
    setError("");
    setFilename("");
    setDraftOffer(false);
    if (inputRef.current) inputRef.current.value = "";
  }

  // Leaving mid-upload silently kills the run; warn first.
  useEffect(() => {
    if (state !== "parsing") return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [state]);

  const pickAnotherFile =
    state === "invalid_file" || state === "file_too_large" || state === "unsupported_pdf";
  const sessionExpired = /session expired/i.test(error);

  const showDropzone =
    state === "idle" ||
    state === "invalid_file" ||
    state === "file_too_large" ||
    state === "parse_error" ||
    state === "unsupported_pdf" ||
    state === "upload_failed" ||
    state === "save_error" ||
    state === "slow";

  // The cloud path never runs the OCR step (the server does it inside
  // "Reading slides"), but it used to show a ✓ next to it anyway.
  const allStages = [
    { key: "upload", label: "Uploading your PDF" },
    { key: "parse", label: "Reading slides" },
    { key: "ocr", label: "Reading text inside images" },
    { key: "narrate", label: "Writing the voice-over" },
  ] as const;
  const stages = allStages.filter((s) =>
    mode === "cloud" ? s.key !== "ocr" : s.key !== "upload",
  );

  return (
    <AppShell variant="app">
      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-16">
        <div className="mb-8 sm:mb-10">
          <h1 className="font-display text-4xl font-bold tracking-tighter sm:text-5xl">
            Upload your deck
          </h1>
          <p className="mt-3 max-w-xl text-muted-foreground">
            We write a voice-over for every slide. You tweak it, then share one link.
          </p>
        </div>

        {showDropzone ? (
          <>
            <label
              tabIndex={0}
              role="button"
              aria-label="Choose a PDF to upload"
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  inputRef.current?.click();
                }
              }}
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
              className={`group relative block cursor-pointer overflow-hidden rounded-3xl border-2 border-dashed px-6 py-12 text-center transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-foreground sm:p-16 ${
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
                {/* Phones and iPads can't drag files; don't tell them to. */}
                <div className="font-display text-2xl font-bold tracking-tight [@media(pointer:coarse)]:hidden">
                  Drag a PDF here, or{" "}
                  <span className="underline decoration-accent decoration-4 underline-offset-4">
                    click to browse
                  </span>
                </div>
                <div className="hidden font-display text-2xl font-bold tracking-tight [@media(pointer:coarse)]:block">
                  <span className="underline decoration-accent decoration-4 underline-offset-4">
                    Tap to choose a PDF
                  </span>
                </div>
                <div className="text-sm text-muted-foreground">PDF up to 25 MB · ready in about a minute</div>
              </div>
            </label>

            {error && (
              <div
                role="alert"
                className="mt-6 rounded-2xl border border-danger/40 bg-danger/10 p-5"
              >
                <div className="font-display text-lg font-bold tracking-tight">
                  {/* Plain JS string: "&apos;" here rendered literally as "Couldn&apos;t". */}
                  {state === "upload_failed"
                    ? "Upload failed"
                    : state === "slow"
                      ? "Still processing"
                      : "Couldn't process this PDF"}
                </div>
                <p className="mt-2 text-sm text-muted-foreground">{error}</p>
                <div className="mt-4 flex flex-wrap gap-3">
                  {state === "slow" ? (
                    <Link href="/dashboard">
                      <OffsetButton type="button">Go to your decks</OffsetButton>
                    </Link>
                  ) : sessionExpired ? (
                    <Link href="/login">
                      <OffsetButton type="button">Sign in again</OffsetButton>
                    </Link>
                  ) : (
                    <OffsetButton
                      type="button"
                      onClick={() => {
                        // Retrying the same invalid / too-big / locked file just repeats the error.
                        if (lastFile && !pickAnotherFile) void handleFile(lastFile);
                        else {
                          resetToIdle();
                          inputRef.current?.click();
                        }
                      }}
                    >
                      {pickAnotherFile ? "Choose another PDF" : "Try again"}
                    </OffsetButton>
                  )}
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
          <div className="relative overflow-hidden rounded-3xl border-2 border-foreground bg-background p-5 offset-shadow sm:p-8">
            <div className="mb-6 flex items-center justify-between">
              <div>
                <div className="eyebrow mb-1">
                  {state === "success" ? "Ready" : "Now processing"}
                </div>
                <div className="break-all font-display text-xl font-bold tracking-tight sm:text-2xl">
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
            <p className="mb-4 text-sm text-muted-foreground">
              Usually under a minute. Keep this tab open until it finishes.
            </p>
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

"use client";

/**
 * Browser OCR fallback for image-only / scanned PDF pages.
 * Uses Tesseract.js (free, local) — no API key, nothing leaves the device.
 */

import type { Worker } from "tesseract.js";

/** Treat as "no usable text" below this character count. */
export const MIN_TEXT_CHARS = 40;

let workerPromise: Promise<Worker> | null = null;
let workerRef: Worker | null = null;

async function getWorker(): Promise<Worker> {
  if (!workerPromise) {
    workerPromise = (async () => {
      const { createWorker } = await import("tesseract.js");
      const worker = await createWorker("eng", 1, {
        // Keep logs quiet in production; useful while debugging OCR quality.
        logger:
          process.env.NODE_ENV === "development"
            ? (m) => {
                if (m.status === "recognizing text") {
                  // progress 0..1
                }
              }
            : undefined,
      });
      workerRef = worker;
      return worker;
    })();
  }
  return workerPromise;
}

/** True when native PDF text layer is empty or near-empty. */
export function needsOcr(pageText: string): boolean {
  const cleaned = pageText.replace(/\s+/g, " ").trim();
  if (cleaned.length < MIN_TEXT_CHARS) return true;
  // Mostly punctuation / page numbers only
  const words = cleaned.split(/\s+/).filter((w) => /[A-Za-z]{3,}/.test(w));
  return words.length < 4;
}

/**
 * OCR a rendered page canvas. Returns cleaned plain text (may be "").
 * Caller should already have rendered the PDF page at a readable scale (~1200px wide).
 */
export async function ocrPageCanvas(
  canvas: HTMLCanvasElement,
): Promise<string> {
  const worker = await getWorker();
  const result = await worker.recognize(canvas);
  return cleanupOcrText(result.data.text ?? "");
}

/** Drop the worker to free WASM memory (call after a full deck parse). */
export async function disposeOcrWorker(): Promise<void> {
  const w = workerRef;
  workerRef = null;
  workerPromise = null;
  if (w) {
    try {
      await w.terminate();
    } catch {
      /* ignore */
    }
  }
}

function cleanupOcrText(raw: string): string {
  return raw
    .replace(/\r/g, "")
    .split("\n")
    .map((l) => l.replace(/[ \t]+/g, " ").trim())
    .filter(Boolean)
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

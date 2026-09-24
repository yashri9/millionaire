"use client";

/**
 * Browser OCR via Tesseract.js — free, no API key.
 * Used when a PDF page has no usable text layer (image-only slides).
 */
import { createWorker, type Worker } from "tesseract.js";

/** Below this, we treat the text layer as empty / unusable. */
export const MIN_TEXT_CHARS = 40;

let workerPromise: Promise<Worker> | null = null;

async function getWorker(): Promise<Worker> {
  if (!workerPromise) {
    workerPromise = createWorker("eng", 1, {
      logger:
        process.env.NODE_ENV !== "production"
          ? () => {
              /* quiet — avoid flooding the console on every tick */
            }
          : undefined,
    });
  }
  return workerPromise;
}

/** Normalize OCR noise a bit before pitching. */
function cleanOcrText(raw: string): string {
  return raw
    .replace(/\r/g, "")
    .replace(/[|]/g, "I")
    .replace(/[^\S\n]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function needsOcr(pageText: string): boolean {
  const t = pageText.replace(/\s+/g, " ").trim();
  if (t.length < MIN_TEXT_CHARS) return true;
  const letters = (t.match(/[A-Za-z0-9]/g) ?? []).length;
  return letters < Math.min(20, Math.floor(t.length * 0.35));
}

/**
 * OCR a rendered page canvas (or data URL).
 * Reuses a single Tesseract worker across pages in one parse run.
 */
export async function ocrCanvas(
  source: HTMLCanvasElement | string,
): Promise<string> {
  const worker = await getWorker();
  const { data } = await worker.recognize(source);
  return cleanOcrText(data.text ?? "");
}

/**
 * Same as ocrCanvas, plus Tesseract's mean confidence (0-100). The confidence
 * feeds shouldEscalateToVision: long-but-wrong Tesseract output on a scan has
 * low confidence even when it "looks" like text.
 */
export async function ocrCanvasDetailed(
  source: HTMLCanvasElement | string,
): Promise<{ text: string; confidence: number | null }> {
  const worker = await getWorker();
  const { data } = await worker.recognize(source);
  return {
    text: cleanOcrText(data.text ?? ""),
    confidence: typeof data.confidence === "number" ? data.confidence : null,
  };
}

/** Alias kept for callers that prefer the longer name. */
export const ocrPageImage = ocrCanvas;

/** Tear down the worker after a parse run. */
export async function terminateOcr(): Promise<void> {
  if (!workerPromise) return;
  try {
    const worker = await workerPromise;
    await worker.terminate();
  } catch {
    /* ignore */
  } finally {
    workerPromise = null;
  }
}

export const disposeOcrWorker = terminateOcr;

"use client";

/**
 * Browser side of Cloud Vision OCR for device drafts. Renders the page sharper
 * than the 600px thumbnail (~1600px), POSTs to /api/ocr/vision, returns text or
 * null. Never throws — a failed call leaves the text layer as-is for pickSlideText.
 */

import type { PDFPageProxy } from "pdfjs-dist/types/src/display/api";

const VISION_RENDER_WIDTH = 1600;

/**
 * Once the server says Vision is off (no key, API disabled, billing off, cap hit),
 * stop asking for the rest of this browser session.
 */
let disabledReason: string | null = null;
const STOP_CODES = new Set([
  "vision_not_configured",
  "vision_api_disabled",
  "vision_billing_disabled",
  "vision_key_rejected",
  "quota_exceeded",
  "rate_limited",
]);

export function visionFallbackDisabledReason(): string | null {
  return disabledReason;
}

/** Test/debug hook. */
export function resetVisionFallback(): void {
  disabledReason = null;
}

export async function visionOcrPage(page: PDFPageProxy): Promise<string | null> {
  if (disabledReason) return null;
  try {
    const base = page.getViewport({ scale: 1 });
    const scale = Math.min(3, VISION_RENDER_WIDTH / base.width);
    const vp = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(vp.width);
    canvas.height = Math.ceil(vp.height);
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    await page.render({ canvasContext: ctx, viewport: vp, canvas }).promise;
    const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
    // Free the big bitmap right away (iPad Safari is strict on canvas memory).
    canvas.width = 0;
    canvas.height = 0;

    const res = await fetch("/api/ocr/vision", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageBase64: dataUrl.split(",")[1] ?? "" }),
    });
    const json = (await res.json().catch(() => ({}))) as {
      text?: string;
      code?: string;
      error?: string;
    };
    if (!res.ok) {
      if (json.code && STOP_CODES.has(json.code)) disabledReason = json.code;
      if (process.env.NODE_ENV !== "production") {
        console.warn("[vision-ocr] fallback skipped", res.status, json.code ?? json.error);
      }
      return null;
    }
    return typeof json.text === "string" ? json.text : null;
  } catch (err) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[vision-ocr] fallback failed", err);
    }
    return null;
  }
}

"use client";

/**
 * Helpers for deciding when a PDF page needs Cloud Vision OCR.
 * Device drafts and the server parse job both use Vision (no local OCR engine).
 */

/** Below this, we treat the text layer as empty / unusable. */
export const MIN_TEXT_CHARS = 40;

export function needsOcr(pageText: string): boolean {
  const t = pageText.replace(/\s+/g, " ").trim();
  if (t.length < MIN_TEXT_CHARS) return true;
  const letters = (t.match(/[A-Za-z0-9]/g) ?? []).length;
  return letters < Math.min(20, Math.floor(t.length * 0.35));
}

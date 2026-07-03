import "server-only";

/**
 * parse.ts — deck parsing interface (PPTX / PDF -> slides).
 *
 * PRD §4.5: parsing runs as an ASYNC job (see lib/jobs.ts), never inline in the
 * request handler, and must surface "no text extracted" instead of failing
 * silently. This module is the parser boundary; the heavy lifting is a TODO.
 *
 * Implementation plan:
 *   - PPTX: use `officeparser` (or unzip + parse slideN.xml) to pull per-slide
 *     title + bullet text.
 *   - PDF:  use `pdf-parse` for text; page-image rendering (like the FastAPI
 *     prototype's PyMuPDF path) can be added later or delegated to the existing
 *     Python service during the migration window.
 *   - Return ParsedSlide[]; if a slide yields no text, mark needsManualText so
 *     the UI can drop into manual entry for just those slides (PRD §4.5).
 */

export type ParsedSlide = {
  order_index: number;
  title: string;
  bullets: string[];
  needsManualText: boolean;
};

export type ParseResult = {
  slides: ParsedSlide[];
  warnings: string[];
};

export async function parseDeck(
  _fileBytes: ArrayBuffer,
  _filename: string,
): Promise<ParseResult> {
  // TODO(phase1): implement PPTX (officeparser) + PDF (pdf-parse) extraction.
  throw new Error("parseDeck not implemented yet — see parse.ts implementation plan");
}

export const UPLOAD_LIMITS = {
  maxBytes: 25 * 1024 * 1024, // 25MB (PRD §4.5)
  accept: [".pptx", ".pdf"] as const,
};

export function validateUpload(filename: string, sizeBytes: number): string | null {
  const lower = filename.toLowerCase();
  const okExt = UPLOAD_LIMITS.accept.some((e) => lower.endsWith(e));
  if (!okExt) return `Unsupported file type. Accepted: ${UPLOAD_LIMITS.accept.join(", ")}`;
  if (sizeBytes > UPLOAD_LIMITS.maxBytes) return `File too large (max 25MB).`;
  return null;
}

import "server-only";

/**
 * deckProcessor.ts — orchestrates lib/parse.ts (text) + lib/render.ts (page
 * images) into the single pipeline the upload/retry routes call.
 *
 * PDF: text + images both come from the same PDF bytes.
 * PPTX/PPT: converted to PDF via LibreOffice first, then treated exactly like
 * a PDF for both text and images (mirrors backend/server.py, which discards
 * the original pptx entirely once it has a converted PDF). If LibreOffice
 * isn't available, falls back to text-only extraction from the original pptx
 * (lib/parse.ts's OOXML path) with no images — same fallback as the prototype.
 */
import { parseDeck, type ParsedSlide } from "@/lib/parse";
import { convertToPdf, renderPdfPages, type RenderedPage } from "@/lib/render";

export type ProcessedDeck = {
  slides: ParsedSlide[];
  images: RenderedPage[]; // empty when rendered = false
  rendered: boolean;
  warning?: string;
};

export async function processDeckUpload(bytes: ArrayBuffer, filename: string): Promise<ProcessedDeck> {
  const isPdf = filename.toLowerCase().endsWith(".pdf");

  const pdfBytes = isPdf ? bytes : await convertToPdf(bytes, filename);

  if (pdfBytes) {
    const [{ slides }, images] = await Promise.all([
      parseDeck(pdfBytes, "converted.pdf"),
      renderPdfPages(pdfBytes),
    ]);
    return { slides, images, rendered: true };
  }

  // No LibreOffice available — text-only fallback, no page images.
  const { slides } = await parseDeck(bytes, filename);
  return {
    slides,
    images: [],
    rendered: false,
    warning:
      "LibreOffice not found — extracted text only. Install LibreOffice to get rendered slide images on your next upload.",
  };
}

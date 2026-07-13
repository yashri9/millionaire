import "server-only";

/**
 * deckProcessor.ts — orchestrates lib/parse.ts (text) + lib/render.ts (page
 * images) into the single pipeline the upload/retry routes call.
 *
 * PDF: text + images both come from the same PDF bytes.
 * PPTX: converted to PDF via LibreOffice first, then treated exactly like
 * a PDF for both text and images. If LibreOffice isn't available, falls
 * back to text-only extraction from the original pptx with no images.
 */
import { parseDeck, type ParsedSlide } from "@/lib/parse";
import { convertToPdf, renderPdfPages, type RenderedPage } from "@/lib/render";

export type ProcessedDeck = {
  slides: ParsedSlide[];
  images: RenderedPage[]; // empty when rendered = false
  rendered: boolean;
  warning?: string;
};

/** Merge processor + storage upload failures into one user-facing warning. */
export function buildRenderWarning(
  processor: Pick<ProcessedDeck, "warning" | "rendered">,
  failedSlides: number[],
): { rendered: boolean; render_warning: string | null } {
  let render_warning = processor.warning ?? null;
  if (failedSlides.length > 0) {
    const msg = `Some slide previews (slides ${failedSlides.join(", ")}) could not be saved. Try re-uploading or export as PDF.`;
    render_warning = render_warning ? `${render_warning} ${msg}` : msg;
  }
  return { rendered: processor.rendered, render_warning };
}

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

  console.error("LibreOffice not found — falling back to text-only slide extraction");
  const { slides } = await parseDeck(bytes, filename);
  return {
    slides,
    images: [],
    rendered: false,
    warning:
      "We couldn't generate slide previews for this file. Try exporting your deck as a PDF for the most reliable results — PDF uploads always render full page images.",
  };
}

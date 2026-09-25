import "server-only";

/**
 * deckProcessor.ts — the single pipeline the upload/retry routes call.
 *
 * PDF (and PPTX once LibreOffice converts it to PDF):
 *   render.ts renders each page ONCE and yields image + thumb + OCR JPEG +
 *   pdf.js text layer. Each page is handed to Cloud Vision the moment it is
 *   rendered, so OCR runs in parallel with rendering the rest of the deck.
 *   Text per slide = pickSlideText(textLayer, vision) — Vision-primary, text
 *   layer when Vision is missing, unreadable or clearly sparser.
 *
 * parse.ts (pdf-parse / PPTX XML) is now only the emergency fallback: when
 * LibreOffice is unavailable for a PPTX, or when rendering throws.
 */
import { pickSlideText } from "@voxdeck/narration";
import { linesToSlide, parseDeck, type ParsedSlide } from "@/lib/parse";
import { convertToPdf, renderPdfPages, type RenderedPage } from "@/lib/render";
import { createVisionOcrQueue, type PageOcr, type VisionOcrStats } from "@/lib/server-vision-ocr";

export type SlideTextSource = "vision" | "text-layer";

export type ProcessedDeck = {
  slides: ParsedSlide[];
  images: RenderedPage[]; // empty when rendered = false
  rendered: boolean;
  warning?: string;
  /** Per slide (by order_index): which source the text came from. */
  textSources?: Map<number, SlideTextSource>;
  ocr?: VisionOcrStats;
  timings?: { totalMs: number; convertMs: number; renderMs: number; ocrWaitMs: number };
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

async function renderAndOcr(pdfBytes: ArrayBuffer) {
  const queue = createVisionOcrQueue();
  const ocrByPage = new Map<number, Promise<PageOcr | null>>();

  const t0 = Date.now();
  const images = await renderPdfPages(pdfBytes, {
    onOcrImage: (orderIndex, jpeg) => ocrByPage.set(orderIndex, queue.ocr(jpeg)),
  });
  const renderMs = Date.now() - t0;

  const t1 = Date.now();
  const textSources = new Map<number, SlideTextSource>();
  const slides = await Promise.all(
    images.map(async (img) => {
      const ocr = await (ocrByPage.get(img.order_index) ?? Promise.resolve(null));
      const pick = pickSlideText(img.textLayer ?? "", ocr?.text);
      textSources.set(img.order_index, pick.source);
      return linesToSlide(img.order_index, pick.text.split("\n"));
    }),
  );
  await queue.drain();
  const ocrWaitMs = Date.now() - t1;

  return { slides, images, textSources, ocr: queue.stats, renderMs, ocrWaitMs };
}

export async function processDeckUpload(bytes: ArrayBuffer, filename: string): Promise<ProcessedDeck> {
  const started = Date.now();
  const isPdf = filename.toLowerCase().endsWith(".pdf");

  const tc = Date.now();
  const pdfBytes = isPdf ? bytes : await convertToPdf(bytes, filename);
  const convertMs = Date.now() - tc;

  if (pdfBytes) {
    try {
      const r = await renderAndOcr(pdfBytes);
      const totalMs = Date.now() - started;
      console.info("[deckProcessor]", {
        pages: r.images.length,
        convertMs,
        renderMs: r.renderMs,
        ocrWaitMs: r.ocrWaitMs,
        totalMs,
        ocr: r.ocr,
      });
      return {
        slides: r.slides,
        images: r.images,
        rendered: true,
        textSources: r.textSources,
        ocr: r.ocr,
        timings: { totalMs, convertMs, renderMs: r.renderMs, ocrWaitMs: r.ocrWaitMs },
      };
    } catch (err) {
      // Page-count limit is a user-facing message, not a render failure — surface it.
      if (err instanceof Error && /aren't supported yet/.test(err.message)) throw err;
      console.error("[deckProcessor] render failed — falling back to text-only", err);
      const { slides } = await parseDeck(pdfBytes, "converted.pdf");
      return {
        slides,
        images: [],
        rendered: false,
        warning: "We couldn't generate slide previews for this file. The slide text was still extracted.",
      };
    }
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

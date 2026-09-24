"use client";

/**
 * Client-side PDF → slides. Runs entirely in the browser.
 *
 * Uses the *legacy* pdfjs build so Map.prototype.getOrInsertComputed
 * (and related APIs) are polyfilled. The modern build (6.x) requires
 * those APIs natively and throws:
 *   this[#methodPromises].getOrInsertComputed is not a function
 * in browsers that don't ship them yet (e.g. Firefox ESR, older Chromium).
 */
import type { TextContent } from "pdfjs-dist/types/src/display/api";
import type { DeckSlide, SlideWord } from "@/lib/deck-store";
import { needsOcr, ocrCanvasDetailed } from "@/lib/ocr";
import { visionOcrPage } from "@/lib/vision-ocr-client";
import {
  extractiveFallback,
  detectChartFromOcr,
  pickBestOcr,
  reconcileTextAndOcr,
  shouldEscalateToVision,
  structureSlideContent,
  type TextRun,
} from "@voxdeck/narration";

export type ParseProgress = {
  phase: "upload" | "parse" | "ocr" | "narrate";
  current: number;
  total: number;
};

export type PdfParseErrorCode =
  | "invalid_file"
  | "file_too_large"
  | "password"
  | "empty"
  | "corrupt"
  | "parse_failed";

export class PdfParseError extends Error {
  code: PdfParseErrorCode;
  constructor(code: PdfParseErrorCode, message: string) {
    super(message);
    this.name = "PdfParseError";
    this.code = code;
  }
}

const MAX_BYTES = 25 * 1024 * 1024;

export function validatePdfFile(file: File): PdfParseError | null {
  const isPdfExt = /\.pdf$/i.test(file.name);
  const mime = (file.type || "").toLowerCase();
  const isPdfMime =
    !mime ||
    mime === "application/pdf" ||
    mime === "application/x-pdf" ||
    mime === "application/octet-stream";

  if (!isPdfExt) {
    return new PdfParseError("invalid_file", "Please upload a PDF file.");
  }
  // Reject clearly non-PDF MIME types (e.g. image/* with a .pdf name).
  if (mime && !isPdfMime && !mime.includes("pdf")) {
    return new PdfParseError("invalid_file", "Please upload a PDF file.");
  }
  if (file.size > MAX_BYTES) {
    return new PdfParseError(
      "file_too_large",
      "This PDF is too large. Please upload a file under 25MB.",
    );
  }
  if (file.size === 0) {
    return new PdfParseError(
      "empty",
      "This PDF doesn't contain readable pages. Please upload another file.",
    );
  }
  return null;
}

export function userMessageForParseError(err: unknown): string {
  if (err instanceof PdfParseError) return err.message;

  const msg =
    err && typeof err === "object" && "message" in err
      ? String((err as { message: string }).message)
      : err instanceof Error
        ? err.message
        : "";
  const name =
    err && typeof err === "object" && "name" in err
      ? String((err as { name: string }).name)
      : "";
  const lower = msg.toLowerCase();

  if (
    name === "PasswordException" ||
    lower.includes("password") ||
    lower.includes("encrypted")
  ) {
    return "This PDF is password-protected. Please upload an unlocked PDF.";
  }
  if (
    name === "InvalidPDFException" ||
    lower.includes("invalid pdf") ||
    lower.includes("missing pdf header")
  ) {
    return "We couldn't read this PDF. Please try another file.";
  }
  if (lower.includes("getorinsertcomputed")) {
    // Should be unreachable after legacy build switch; keep a friendly fallback.
    return "We couldn't process this PDF. Please try again.";
  }
  if (
    lower.includes("narration") ||
    lower.includes("groq") ||
    lower.includes("llm") ||
    lower.includes("missing narration") ||
    lower.includes("slide structure")
  ) {
    return msg || "Narration generation failed. Please try again.";
  }
  if (msg) return msg;
  return "We couldn't process this PDF. Please try again.";
}

function estimateDuration(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(8, Math.round((words / 155) * 60));
}

function draftTitle(pageText: string, pageNum: number): string {
  const line = pageText
    .split(/\n+/)
    .map((l) => l.trim())
    .find((l) => l.length >= 3 && l.length <= 90);
  return line ?? `Slide ${pageNum}`;
}

export async function parsePdfToSlides(
  file: File,
  onProgress?: (p: ParseProgress) => void,
): Promise<{ title: string; slides: DeckSlide[] }> {
  const validation = validatePdfFile(file);
  if (validation) throw validation;

  onProgress?.({ phase: "upload", current: 0, total: 1 });
  const buf = await file.arrayBuffer();
  onProgress?.({ phase: "upload", current: 1, total: 1 });

  // Legacy build polyfills getOrInsertComputed for older browsers.
  // Worker is vendored into /public so we don't depend on a CDN match.
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

  let pdf;
  try {
    pdf = await pdfjs.getDocument({ data: buf }).promise;
  } catch (err) {
    if (process.env.NODE_ENV !== "production") {
      console.error("[pdf-parse] getDocument failed", err);
    }
    throw new PdfParseError(
      "corrupt",
      userMessageForParseError(err),
    );
  }

  const total = pdf.numPages;
  if (!total || total < 1) {
    throw new PdfParseError(
      "empty",
      "This PDF doesn't contain readable pages. Please upload another file.",
    );
  }

  // Indexed writes only — never push() from async OCR branches.
  const pageTextSlots: (string | undefined)[] = new Array(total);
  const slides: DeckSlide[] = new Array(total);

  try {
    for (let p = 1; p <= total; p++) {
      const i = p - 1; // 0-indexed slot
      onProgress?.({ phase: "parse", current: p - 1, total });
      const page = await pdf.getPage(p);
      const viewport = page.getViewport({ scale: 1 });
      const pageW = viewport.width;
      const pageH = viewport.height;

      // Safari/WebKit does not expose ReadableStream as an async iterable,
      // which makes pdf.js 6.x getTextContent() throw inside its for-await loop.
      // Consume the same stream through the Web Streams reader API instead;
      // this works in Safari/iPadOS as well as Chromium/Android.
      const textReader = page.streamTextContent().getReader();
      const textContent: TextContent = {
        items: [],
        styles: Object.create(null),
        lang: null,
      };
      try {
        for (;;) {
          const { done, value } = await textReader.read();
          if (done) break;
          textContent.lang ??= value.lang;
          Object.assign(textContent.styles, value.styles);
          textContent.items.push(...value.items);
        }
      } finally {
        textReader.releaseLock();
      }
      const words: SlideWord[] = [];
      const runs: TextRun[] = [];
      // Y-delta line breaks — same as eval pipeline (gen-pop) so structureSlideContent
      // sees the same flatText shape the LLM was tuned against.
      let pageText = "";
      let lastY: number | null = null;

      for (const item of textContent.items) {
        if (!("str" in item)) continue;
        const str = item.str;
        if (!str.trim()) continue;

        const tr = item.transform as number[];
        const fontH = Math.abs(tr[3]) || Math.abs(tr[0]) || 10;
        const itemW = item.width ?? fontH * str.length * 0.5;
        const itemH = item.height ?? fontH;
        const originX = tr[4];
        const originYTop = pageH - tr[5] - itemH;
        const y = tr[5];

        if (lastY != null && Math.abs(lastY - y) > 8) pageText += "\n";
        else if (pageText && !pageText.endsWith(" ") && !pageText.endsWith("\n"))
          pageText += " ";
        pageText += str;
        lastY = y;

        runs.push({
          text: str.trim(),
          x: originX / pageW,
          y: originYTop / pageH,
          w: itemW / pageW,
          h: itemH / pageH,
          fontH: fontH / pageH,
        });

        const tokens = str.split(/(\s+)/);
        let cursor = 0;
        const totalChars = str.length || 1;
        for (const tok of tokens) {
          if (!tok || /^\s+$/.test(tok)) {
            cursor += tok.length;
            continue;
          }
          const startFrac = cursor / totalChars;
          const endFrac = (cursor + tok.length) / totalChars;
          const wx = originX + startFrac * itemW;
          const ww = (endFrac - startFrac) * itemW;
          words.push({
            text: tok,
            x: wx / pageW,
            y: originYTop / pageH,
            w: ww / pageW,
            h: itemH / pageH,
          });
          cursor += tok.length;
        }
      }
      pageText = pageText.trim();

      // Was 600px / 0.62 JPEG: soft on a laptop stage (~1100 CSS px, 2x DPR).
      // 1280px / 0.7 is sharp at laptop size and still ~120-200KB per slide.
      // Safari's ~5MB localStorage cap can now be hit on very long decks; that
      // path already shows DECK_SAVE_QUOTA_MESSAGE. IndexedDB + Blob previews
      // is the long-term fix. Cloud decks are unaffected (server renders 1600px).
      const targetWidth = 1280;
      const scale = targetWidth / pageW;
      const scaled = page.getViewport({ scale });
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(scaled.width);
      canvas.height = Math.ceil(scaled.height);
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        throw new PdfParseError(
          "parse_failed",
          "We couldn't process this PDF. Please try again.",
        );
      }
      await page.render({ canvasContext: ctx, viewport: scaled, canvas })
        .promise;
      const thumbnail = canvas.toDataURL("image/jpeg", 0.7);

      let resolvedText = pageText;
      let usedOcr = false;
      let extractionMethod: "text-layer" | "ocr" = "text-layer";
      let ocrDetectedChart = false;
      const t0 = performance.now();
      if (needsOcr(pageText)) {
        onProgress?.({ phase: "ocr", current: p, total });
        try {
          const tess = await ocrCanvasDetailed(canvas);
          let ocrText = tess.text;
          // Cloud Vision only when text layer + Tesseract both come up short.
          const decision = shouldEscalateToVision({
            textLayer: pageText,
            tesseractText: tess.text,
            tesseractConfidence: tess.confidence ?? undefined,
          });
          if (decision.escalate) {
            const visionText = await visionOcrPage(page);
            const best = pickBestOcr(tess.text, visionText);
            ocrText = best.text;
            if (process.env.NODE_ENV !== "production") {
              console.info("[pdf-parse] vision fallback", {
                pageIndex: i,
                reason: decision.reason,
                engine: best.engine,
                chars: best.text.length,
              });
            }
          }
          ocrDetectedChart = detectChartFromOcr(ocrText);
          const reconciled = reconcileTextAndOcr(pageText, ocrText);
          resolvedText = reconciled.text;
          extractionMethod = reconciled.extractionMethod;
          usedOcr = reconciled.extractionMethod === "ocr";
        } catch (err) {
          if (process.env.NODE_ENV !== "production") {
            console.warn("[pdf-parse] OCR failed for page", p, err);
          }
        }
      } else if (process.env.NODE_ENV !== "production") {
        console.info("[pdf-parse] skip OCR — readable text layer", {
          pageIndex: i,
          chars: pageText.length,
          ms: Math.round(performance.now() - t0),
        });
      }

      pageTextSlots[i] = resolvedText;

      // Diagnostic: 0-indexed — wrong preview here means extraction leak.
      if (process.env.NODE_ENV !== "production") {
        console.log(
          JSON.stringify({
            pageIndex: i,
            extractionMethod: usedOcr ? "ocr" : "text-layer",
            ocrDetectedChart,
            charCount: pageTextSlots[i]!.length,
            preview: pageTextSlots[i]!.slice(0, 60).replace(/\n/g, " "),
          }),
        );
      }

      const slideContent = structureSlideContent({
        slideNo: p,
        totalSlides: total,
        // Geometry only when we kept the text layer; OCR has no reliable runs.
        runs: extractionMethod === "ocr" ? [] : runs,
        flatText: resolvedText,
        extractionMethod,
        ocrDetectedChart,
      });

      // Local extractive draft only — LLM primary generation runs via /api/script/generate.
      const draft = extractiveFallback(slideContent);
      const title = slideContent.titleText ?? draftTitle(resolvedText, p);

      slides[i] = {
        n: String(p).padStart(2, "0"),
        title,
        script: draft.narration,
        essentialPoints: draft.coveragePoints,
        durationSec: estimateDuration(draft.narration),
        thumbnail,
        pageText: resolvedText,
        words,
        slideContent,
        generationMethod: draft.generationMethod,
      };
      onProgress?.({ phase: "parse", current: p, total });
    }

    const undefinedSlots = pageTextSlots
      .map((t, idx) => (t === undefined ? idx : -1))
      .filter((idx) => idx >= 0);
    if (pageTextSlots.length !== total || undefinedSlots.length > 0) {
      throw new PdfParseError(
        "parse_failed",
        `Page text slots incomplete (missing: ${undefinedSlots.join(",") || "length"}).`,
      );
    }
    if (slides.some((s) => !s)) {
      throw new PdfParseError(
        "parse_failed",
        "We couldn't process this PDF. Please try again.",
      );
    }

    onProgress?.({ phase: "narrate", current: total, total });
    const filename = file.name.replace(/\.pdf$/i, "");
    return { title: filename || "Untitled deck", slides };
  } finally {
    // Keep the OCR worker warm between imports; it is cheap to reuse.
  }
}

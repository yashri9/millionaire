/**
 * OCR fallback chain — pure logic, no network, no browser APIs.
 *
 * Chain order (cheapest first):
 *   1. pdf.js text layer  — free, instant, exact. Handles born-digital decks.
 *   2. Tesseract.js       — free, runs in the browser. Handles most image slides.
 *   3. Google Cloud Vision DOCUMENT_TEXT_DETECTION — paid after 1,000 pages/month,
 *      only called when 1 and 2 both come up short (scans, phone photos of slides).
 *
 * This file decides WHEN to escalate to step 3, builds the Vision request,
 * parses the Vision response, and picks the better of Tesseract vs Vision.
 */

/** Below this many characters the page is "short" (matches ocr.ts MIN_TEXT_CHARS). */
export const VISION_MIN_CHARS = 40;
/** Fewer real words than this = the slide still reads as empty. */
export const VISION_MIN_REAL_WORDS = 4;
/** Share of letters/digits below this = symbol soup, not text. */
export const VISION_MIN_READABLE = 0.6;
/** Tesseract confidence (0-100) below this = don't trust it even if it looks long. */
export const VISION_MIN_TESSERACT_CONFIDENCE = 55;

export type OcrQuality = {
  chars: number;
  realWords: number;
  readable: number;
};

export function realWordCount(text: string): number {
  return (text ?? "")
    .split(/\s+/)
    .filter((w) => /^[A-Za-z][A-Za-z0-9&@.'-]{2,}[.,:;!?)]*$/.test(w)).length;
}

function readable(text: string): number {
  const t = (text ?? "").replace(/\s+/g, "");
  if (!t.length) return 0;
  const good = (t.match(/[A-Za-z0-9%@.]/g) ?? []).length;
  return good / t.length;
}

export function ocrQuality(text: string): OcrQuality {
  const t = (text ?? "").replace(/\s+/g, " ").trim();
  return { chars: t.length, realWords: realWordCount(t), readable: readable(t) };
}

/** True when this text is good enough that a paid OCR call is not worth it. */
export function isGoodEnough(text: string): boolean {
  const q = ocrQuality(text);
  return (
    q.chars >= VISION_MIN_CHARS &&
    q.realWords >= VISION_MIN_REAL_WORDS &&
    q.readable >= VISION_MIN_READABLE
  );
}

export type EscalationInput = {
  /** Raw pdf.js text layer for the page. */
  textLayer: string;
  /** What Tesseract returned ("" if it failed or threw). */
  tesseractText: string;
  /** Tesseract mean confidence 0-100, when known. */
  tesseractConfidence?: number;
};

export type EscalationDecision = {
  escalate: boolean;
  reason:
    | "text-layer-ok"
    | "tesseract-ok"
    | "tesseract-empty"
    | "tesseract-weak"
    | "tesseract-low-confidence";
};

/**
 * Should we spend a Cloud Vision call on this page?
 * Only when BOTH the text layer and Tesseract come up short.
 */
export function shouldEscalateToVision(input: EscalationInput): EscalationDecision {
  if (isGoodEnough(input.textLayer)) return { escalate: false, reason: "text-layer-ok" };
  const tess = (input.tesseractText ?? "").trim();
  if (!tess) return { escalate: true, reason: "tesseract-empty" };
  if (
    typeof input.tesseractConfidence === "number" &&
    input.tesseractConfidence < VISION_MIN_TESSERACT_CONFIDENCE
  ) {
    return { escalate: true, reason: "tesseract-low-confidence" };
  }
  if (!isGoodEnough(tess)) return { escalate: true, reason: "tesseract-weak" };
  return { escalate: false, reason: "tesseract-ok" };
}

/** Body for POST https://vision.googleapis.com/v1/images:annotate */
export function buildVisionRequest(imageBase64: string, languageHints = ["en"]) {
  return {
    requests: [
      {
        image: { content: imageBase64 },
        features: [{ type: "DOCUMENT_TEXT_DETECTION" }],
        imageContext: { languageHints },
      },
    ],
  };
}

export type VisionOcrResult = {
  text: string;
  /** Mean page confidence 0-1 from Vision, or null if not reported. */
  confidence: number | null;
};

export class VisionResponseError extends Error {
  code: number | null;
  constructor(message: string, code: number | null) {
    super(message);
    this.name = "VisionResponseError";
    this.code = code;
  }
}

type VisionJson = {
  responses?: Array<{
    fullTextAnnotation?: { text?: string; pages?: Array<{ confidence?: number }> };
    textAnnotations?: Array<{ description?: string }>;
    error?: { code?: number; message?: string };
  }>;
};

/** Parse images:annotate JSON. Throws VisionResponseError on a per-image error. */
export function parseVisionResponse(json: unknown): VisionOcrResult {
  const r = (json as VisionJson)?.responses?.[0];
  if (!r) return { text: "", confidence: null };
  if (r.error && (r.error.code || r.error.message)) {
    throw new VisionResponseError(r.error.message ?? "Vision error", r.error.code ?? null);
  }
  const raw = r.fullTextAnnotation?.text ?? r.textAnnotations?.[0]?.description ?? "";
  const pages = r.fullTextAnnotation?.pages ?? [];
  const confs = pages
    .map((p) => p.confidence)
    .filter((c): c is number => typeof c === "number");
  const confidence = confs.length ? confs.reduce((a, b) => a + b, 0) / confs.length : null;
  return { text: cleanVisionText(raw), confidence };
}

export function cleanVisionText(raw: string): string {
  return (raw ?? "")
    .replace(/\r/g, "")
    .split("\n")
    .map((l) => l.replace(/[ \t]+/g, " ").trim())
    .filter(Boolean)
    .join("\n")
    .trim();
}

/**
 * Pick the OCR text to hand to reconcileTextAndOcr.
 * Vision wins when it is readable and has at least as many real words as Tesseract
 * (Tesseract hallucinates short fragments on scans; Vision rarely does).
 */
export function pickBestOcr(
  tesseractText: string,
  visionText: string | null | undefined,
): { text: string; engine: "tesseract" | "vision" } {
  const v = (visionText ?? "").trim();
  if (!v) return { text: tesseractText ?? "", engine: "tesseract" };
  const vq = ocrQuality(v);
  const tq = ocrQuality(tesseractText ?? "");
  if (vq.readable < 0.45) return { text: tesseractText ?? "", engine: "tesseract" };
  if (vq.realWords >= tq.realWords) return { text: v, engine: "vision" };
  // Vision shorter but much cleaner than Tesseract soup.
  if (tq.readable < VISION_MIN_READABLE && vq.readable >= VISION_MIN_READABLE) {
    return { text: v, engine: "vision" };
  }
  return { text: tesseractText ?? "", engine: "tesseract" };
}

/** Storage path for a cached Vision result, keyed by sha256 of the image bytes. */
export function visionCachePath(imageSha256Hex: string, feature = "document"): string {
  const h = imageSha256Hex.toLowerCase().replace(/[^0-9a-f]/g, "").slice(0, 64);
  return `ocr/vision-${feature}/${h.slice(0, 2)}/${h}.json`;
}

/**
 * Cloud Vision OCR helpers — pure logic, no network, no browser APIs.
 *
 * Text per slide = pickSlideText(textLayer, visionText). Vision is primary
 * because it reads what the viewer sees (text in images, charts, outlined
 * fonts) in visual order. The pdf.js text layer is kept only when Vision is
 * empty, unreadable, or clearly missed a rich born-digital page.
 *
 * Also: Vision request builder, response parser, quality helpers, cache path.
 */

/** Below this many characters the page is "short" (matches ocr.ts MIN_TEXT_CHARS). */
export const VISION_MIN_CHARS = 40;
/** Fewer real words than this = the slide still reads as empty. */
export const VISION_MIN_REAL_WORDS = 4;
/** Share of letters/digits below this = symbol soup, not text. */
export const VISION_MIN_READABLE = 0.6;

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

/** True when this text is good enough to narrate without more OCR. */
export function isGoodEnough(text: string): boolean {
  const q = ocrQuality(text);
  return (
    q.chars >= VISION_MIN_CHARS &&
    q.realWords >= VISION_MIN_REAL_WORDS &&
    q.readable >= VISION_MIN_READABLE
  );
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

/** Storage path for a cached Vision result, keyed by sha256 of the image bytes. */
export function visionCachePath(imageSha256Hex: string, feature = "document"): string {
  const h = imageSha256Hex.toLowerCase().replace(/[^0-9a-f]/g, "").slice(0, 64);
  return `ocr/vision-${feature}/${h.slice(0, 2)}/${h}.json`;
}

export type SlideTextPick = {
  text: string;
  source: "vision" | "text-layer";
  reason:
    | "no-vision"
    | "vision-unreadable"
    | "vision-sparse-vs-text-layer"
    | "vision-primary";
};

/**
 * Choose the text for one rendered page (Vision-primary).
 *
 * Vision wins by default. The text layer is kept only when Vision is empty,
 * unreadable, or clearly missed most of a rich born-digital page.
 */
export function pickSlideText(textLayer: string, visionText: string | null | undefined): SlideTextPick {
  const tl = (textLayer ?? "").trim();
  const v = (visionText ?? "").trim();
  if (!v) return { text: tl, source: "text-layer", reason: "no-vision" };
  const vq = ocrQuality(v);
  if (vq.readable < 0.45) return { text: tl || v, source: tl ? "text-layer" : "vision", reason: "vision-unreadable" };
  const tq = ocrQuality(tl);
  if (isGoodEnough(tl) && tq.readable >= 0.8 && vq.realWords < tq.realWords * 0.5) {
    return { text: tl, source: "text-layer", reason: "vision-sparse-vs-text-layer" };
  }
  return { text: v, source: "vision", reason: "vision-primary" };
}

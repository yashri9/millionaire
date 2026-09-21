/**
 * Cross-check PDF text-layer vs whole-page OCR.
 * On mismatch, prefer OCR only when OCR is at least as readable as the text layer.
 * Never replace a usable text layer with OCR garbage.
 */

export type TextOcrReconcileResult = {
  text: string;
  /** Which source won. */
  extractionMethod: "text-layer" | "ocr";
  /** True when both sources had content but disagreed. */
  mismatched: boolean;
  textLayerChars: number;
  ocrChars: number;
  overlapRatio: number;
};

function tokenize(text: string): Set<string> {
  const tokens = text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}%$]+/gu, " ")
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2);
  return new Set(tokens);
}

/** Fraction of characters that are letters/digits — low = OCR noise. */
export function readableRatio(text: string): number {
  const t = text.replace(/\s+/g, "");
  if (!t.length) return 0;
  const good = (t.match(/[A-Za-z0-9%@.]/g) ?? []).length;
  return good / t.length;
}

/** Count of tokens that look like real English/business words (len>=3, mostly letters). */
function realWordCount(text: string): number {
  return text
    .split(/\s+/)
    .filter((w) => /^[A-Za-z][A-Za-z0-9&@.-]{2,}$/.test(w)).length;
}

/** Jaccard overlap of token sets (0..1). */
export function textOverlapRatio(a: string, b: string): number {
  const A = tokenize(a);
  const B = tokenize(b);
  if (!A.size && !B.size) return 1;
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  const union = A.size + B.size - inter;
  return union === 0 ? 1 : inter / union;
}

function ocrIsUsable(ocr: string, text: string): boolean {
  const ocrRead = readableRatio(ocr);
  const textRead = readableRatio(text);
  const ocrWords = realWordCount(ocr);
  const textWords = realWordCount(text);
  // Reject obvious garbage (symbol soup).
  if (ocrRead < 0.45) return false;
  // Short but clean text layer beats OCR noise.
  if (textRead >= 0.8 && textWords >= 3 && ocrWords <= textWords) return false;
  // Don't replace a rich text layer with sparse OCR.
  if (textWords >= 8 && ocrWords < Math.max(4, textWords * 0.35)) return false;
  // OCR must be roughly as readable as text when text is already good.
  if (textRead >= 0.7 && ocrRead < textRead * 0.75) return false;
  return true;
}

/**
 * Prefer OCR when:
 * - text layer is empty/near-empty and OCR has usable content, or
 * - both have content, they disagree, AND OCR is usable (not garbage).
 *
 * Otherwise keep the text layer.
 */
export function reconcileTextAndOcr(
  textLayer: string,
  ocrText: string,
  opts?: { overlapThreshold?: number; minChars?: number },
): TextOcrReconcileResult {
  const threshold = opts?.overlapThreshold ?? 0.55;
  const minChars = opts?.minChars ?? 40;
  const text = (textLayer ?? "").replace(/\s+/g, " ").trim();
  const ocr = (ocrText ?? "").trim();
  const textLayerChars = text.length;
  const ocrChars = ocr.length;

  if (!ocrChars && !textLayerChars) {
    return {
      text: "",
      extractionMethod: "text-layer",
      mismatched: false,
      textLayerChars,
      ocrChars,
      overlapRatio: 1,
    };
  }

  if (!ocrChars) {
    return {
      text: textLayer ?? "",
      extractionMethod: "text-layer",
      mismatched: false,
      textLayerChars,
      ocrChars: 0,
      overlapRatio: 1,
    };
  }

  const overlapRatio = textOverlapRatio(text, ocr);

  if (textLayerChars < minChars) {
    if (ocrIsUsable(ocr, text) || textLayerChars === 0) {
      return {
        text: ocr,
        extractionMethod: "ocr",
        mismatched: textLayerChars > 0,
        textLayerChars,
        ocrChars,
        overlapRatio,
      };
    }
    return {
      text: textLayer ?? "",
      extractionMethod: "text-layer",
      mismatched: false,
      textLayerChars,
      ocrChars,
      overlapRatio,
    };
  }

  const mismatched = overlapRatio < threshold;

  if (mismatched && ocrIsUsable(ocr, text)) {
    return {
      text: ocr,
      extractionMethod: "ocr",
      mismatched: true,
      textLayerChars,
      ocrChars,
      overlapRatio,
    };
  }

  return {
    text: textLayer ?? "",
    extractionMethod: "text-layer",
    mismatched,
    textLayerChars,
    ocrChars,
    overlapRatio,
  };
}

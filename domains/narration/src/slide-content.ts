/**
 * Structure slide text for narration — organize what PDF/OCR found; do not
 * pre-select "essentials". Judgment of what to pitch belongs to the LLM.
 */

import { buildLabeledFacts } from "./labeled-facts.ts";

export type ExtractionMethod = "text-layer" | "ocr";

export type TextRun = {
  text: string;
  /** Normalized 0..1 page coords (top-left origin). */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Approx font height in page-normalized units (0..1). */
  fontH: number;
};

export type SlideContent = {
  slideNo: number;
  totalSlides: number;
  /** First ~30 chars of titleText — used to catch index mismatches. */
  fingerprint: string;
  titleText: string | null;
  /** All non-title body lines in reading order — unfiltered. */
  bodyText: string[];
  /** Spatial clusters of text that may be chart/axis/series labels. */
  possibleChartRegions: string[][];
  /**
   * Labeled metric facts as (series, label, value) — preferred grounding
   * input so the model does not have to infer year↔value pairings from prose.
   */
  labeledFacts: { series: string; label: string; value: string }[];
  /** Captions near image regions only — never OCR from inside screenshots. */
  imageCaptions: string[];
  footnotes: string[];
  extractionMethod: ExtractionMethod;
  /**
   * True only when whole-page OCR itself looked like a chart/graph
   * (axis ticks, series legends, week/month scales). Graph-guide narration
   * is allowed only when this is true — never from text-layer number soup alone.
   */
  ocrDetectedChart: boolean;
};

export type GenerationMethod = "llm" | "extractive-fallback";

export type NarrationResult = {
  slideNo: number;
  fingerprint: string;
  narration: string;
  omittedContent: string[];
  lowConfidenceFlags: string[];
  generationMethod: GenerationMethod;
  /** Flat list the editor can still show as "pitch" chips (body bullets + title). */
  coveragePoints: string[];
};

function fingerprintFrom(title: string | null, body: string[]): string {
  const base = (title ?? body[0] ?? "").replace(/\s+/g, " ").trim();
  return base.slice(0, 30);
}

function readingOrder(a: TextRun, b: TextRun): number {
  const row = a.y - b.y;
  if (Math.abs(row) > 0.012) return row;
  return a.x - b.x;
}

/** Merge nearby word/token runs into line-ish strings. */
export function mergeRunsToLines(runs: TextRun[] | undefined | null): TextRun[] {
  if (!runs?.length) return [];
  const sorted = [...runs].sort(readingOrder);
  const lines: TextRun[] = [];
  let cur: TextRun | null = null;

  for (const r of sorted) {
    const t = r.text.trim();
    if (!t) continue;
    if (!cur) {
      cur = { ...r, text: t };
      continue;
    }
    const sameRow = Math.abs(cur.y - r.y) < 0.015;
    const closeX = r.x <= cur.x + cur.w + 0.04;
    if (sameRow && closeX) {
      const gap: string = r.x > cur.x + cur.w + 0.008 ? " " : "";
      cur = {
        text: `${cur.text}${gap}${t}`,
        x: Math.min(cur.x, r.x),
        y: Math.min(cur.y, r.y),
        w: Math.max(cur.x + cur.w, r.x + r.w) - Math.min(cur.x, r.x),
        h: Math.max(cur.h, r.h),
        fontH: Math.max(cur.fontH, r.fontH),
      };
    } else {
      lines.push(cur);
      cur = { ...r, text: t };
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

function clusterNumericRegions(lines: TextRun[]): string[][] {
  const numeric = lines.filter(
    (l) => /\d/.test(l.text) || /[$%€£]/.test(l.text) || /\b(YoY|MoM|CAGR|GMV|ARR)\b/i.test(l.text),
  );
  if (!numeric.length) return [];

  const used = new Set<number>();
  const clusters: string[][] = [];

  for (let i = 0; i < numeric.length; i++) {
    if (used.has(i)) continue;
    const seed = numeric[i];
    const group = [seed.text];
    used.add(i);
    for (let j = 0; j < numeric.length; j++) {
      if (used.has(j)) continue;
      const o = numeric[j];
      const near =
        Math.abs(o.x - seed.x) < 0.25 && Math.abs(o.y - seed.y) < 0.2;
      if (near) {
        group.push(o.text);
        used.add(j);
      }
    }
    if (group.length >= 1) clusters.push(group);
  }
  return clusters.slice(0, 8);
}

/**
 * Organize page text runs into typed SlideContent.
 * Does NOT filter for "importance" — passes body through unfiltered.
 */
export function structureSlideContent(input: {
  slideNo: number;
  totalSlides: number;
  runs: TextRun[];
  extractionMethod: ExtractionMethod;
  /** Optional plain text when geometry is unavailable (OCR whole-page). */
  flatText?: string;
  /** Set from OCR pass — graph-guide only when OCR saw a chart. */
  ocrDetectedChart?: boolean;
}): SlideContent {
  const { slideNo, totalSlides, extractionMethod } = input;
  const ocrDetectedChart = Boolean(input.ocrDetectedChart);
  let lines = mergeRunsToLines(input.runs ?? []);

  if (!lines.length && input.flatText?.trim()) {
    const flatLines = input.flatText
      .split(/\n+/)
      .map((t) => t.trim())
      .filter(Boolean);
    lines = flatLines.map((text, i) => ({
      text,
      x: 0.1,
      y: 0.1 + i * 0.04,
      w: 0.8,
      h: 0.03,
      fontH: 0.02,
    }));
  }

  if (!lines.length) {
    return {
      slideNo,
      totalSlides,
      fingerprint: `slide-${slideNo}`,
      titleText: null,
      bodyText: [],
      possibleChartRegions: [],
      labeledFacts: [],
      imageCaptions: [],
      footnotes: [],
      extractionMethod,
      ocrDetectedChart,
    };
  }

  const maxFont = Math.max(...lines.map((l) => l.fontH));
  const titleCandidate =
    lines.find((l) => l.fontH >= maxFont * 0.85 && l.y < 0.35) ??
    lines.find((l) => l.y < 0.2) ??
    lines[0];

  // Closing slides often keep a section title (e.g. STRATEGIC INVESTORS) in a
  // large font while the real pitch is "THANK YOU" + contact. Prefer the close.
  const CLOSING_RE =
    /^(thank\s*you[!.,]?|thanks[!.,]?|questions\??|let'?s\s+talk|contact\s+us)$/i;
  const closingLine = lines.find((l) => CLOSING_RE.test(l.text.trim()));
  const preferClosing =
    Boolean(closingLine) &&
    (slideNo === totalSlides ||
      (closingLine!.fontH >= maxFont * 0.65 && closingLine!.y > 0.45));

  const titleText = preferClosing
    ? closingLine!.text.trim()
    : titleCandidate?.text?.trim() || null;
  const titleKey = titleText?.toLowerCase() ?? "";

  const footnotes = lines
    .filter((l) => l.y > 0.88 || (l.fontH < maxFont * 0.45 && l.y > 0.75))
    .map((l) => l.text)
    .filter((t) => t.length > 2 && t.toLowerCase() !== titleKey);

  const footnoteSet = new Set(footnotes.map((t) => t.toLowerCase()));

  let bodyText = lines
    .filter((l) => {
      const t = l.text.trim();
      if (!t) return false;
      if (titleText && t.toLowerCase() === titleKey) return false;
      if (footnoteSet.has(t.toLowerCase())) return false;
      return true;
    })
    .map((l) => l.text.trim());

  // Closing slide: keep only thank-you / contact lines in body so investor
  // chrome on the same page cannot bleed into the generation prompt.
  let closingFootnotes = footnotes;
  if (preferClosing) {
    const CLOSING_KEEP =
      /thank|thanks|vidit|@[\w.-]+\.\w+|contact|reach\s*out|email|phone|\+\d/i;
    const SECTION_CHROME =
      /strategic\s*investors|advised\s*by|investor\s+in|founder,|business\s+head|chief\s+strategy|senior\s+engineer/i;
    const kept = bodyText.filter(
      (t) => CLOSING_KEEP.test(t) && !SECTION_CHROME.test(t),
    );
    const contactFootnotes = footnotes.filter(
      (t) => CLOSING_KEEP.test(t) && !SECTION_CHROME.test(t),
    );
    bodyText = [...kept, ...contactFootnotes.filter((t) => !kept.includes(t))];
    closingFootnotes = contactFootnotes;
  }

  const possibleChartRegions = preferClosing
    ? []
    : clusterNumericRegions(lines);

  const labeledFacts = preferClosing
    ? []
    : buildLabeledFacts({
        titleText,
        bodyText,
        possibleChartRegions,
      });

  // imageCaptions intentionally empty unless caller supplies captions separately.
  // Never fill this from whole-page OCR of screenshot interiors.
  const imageCaptions: string[] = [];

  return {
    slideNo,
    totalSlides,
    fingerprint: fingerprintFrom(titleText, bodyText),
    titleText,
    bodyText,
    possibleChartRegions,
    labeledFacts,
    imageCaptions,
    footnotes: preferClosing ? closingFootnotes : footnotes,
    extractionMethod,
    ocrDetectedChart,
  };
}

/**
 * Honest degraded-mode narration: coverage over fluency.
 * Graph-guide lines ONLY when OCR itself detected a chart on the page.
 */
export function extractiveFallback(
  slide: SlideContent,
  neighbors?: { prevTitle?: string | null; nextTitle?: string | null },
): NarrationResult {
  // Guide-to-graph only if OCR told us there is a graph — otherwise ignore.
  if (slide.ocrDetectedChart) {
    return chartBridgeFallback(slide, neighbors);
  }

  const points = [
    slide.titleText,
    ...slide.bodyText,
  ].filter((p): p is string => Boolean(p?.trim()));

  const take = points.slice(0, 5);
  const omitted = points.slice(5);
  const flags: string[] = ["extractive-fallback"];
  if (slide.extractionMethod === "ocr") flags.push("ocr-source");
  if (!take.length) flags.push("empty-slide");

  const narration = take.length
    ? `[Draft] ${take.join(". ").replace(/\.\s*\./g, ".")}.`
    : `[Draft] Slide ${slide.slideNo} — no extractable text. Add narration manually.`;

  return {
    slideNo: slide.slideNo,
    fingerprint: slide.fingerprint,
    narration: narration.replace(/\s+/g, " ").trim(),
    omittedContent: omitted,
    lowConfidenceFlags: flags,
    generationMethod: "extractive-fallback",
    coveragePoints: take,
  };
}

/**
 * OCR text looks like a chart/graph (axes, series legends, week/month scales).
 * Used to decide whether graph-guide narration is allowed.
 */
export function detectChartFromOcr(ocrText: string): boolean {
  const t = (ocrText ?? "").replace(/\s+/g, " ").trim();
  if (t.length < 40) return false;

  const chartLexicon =
    /\b(gmv|retention|dau|orders|shares|mom|yoy|axis|week\s*\d|jan|feb|mar|apr|may|jun|monthly|daily|trend|cagr)\b/i;
  const axisLadder =
    /(?:0%|25%|50%|75%|100%)(?:\s+(?:0%|25%|50%|75%|100%)){2,}/i;
  const monthRun =
    /\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)(?:\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)){2,}/i;
  const manyPercents = (t.match(/\d+\s*%/g) ?? []).length >= 4;
  const manySeriesNums = (t.match(/\b\d{1,3}(?:,\d{2,3})+\b|\b\d{4,}\b/g) ?? [])
    .length >= 6;

  return (
    chartLexicon.test(t) ||
    axisLadder.test(t) ||
    monthRun.test(t) ||
    (manyPercents && manySeriesNums)
  );
}

/** @deprecated Prefer slide.ocrDetectedChart — kept for callers. */
export function isChartHeavySlide(slide: SlideContent): boolean {
  return Boolean(slide.ocrDetectedChart);
}

/** Screenshot / OCR-junk pages (not charts). */
export function isNoisyVisualSlide(slide: SlideContent): boolean {
  if (slide.extractionMethod !== "ocr") return false;
  if (slide.ocrDetectedChart) return false; // charts are handled separately
  const title = slide.titleText ?? "";
  if (/[|=]{2,}|womens|tsar|unstitched/i.test(title)) return true;
  const body = slide.bodyText.join(" ");
  const letters = (body.match(/[A-Za-z]/g) ?? []).length;
  const symbols = (body.match(/[^A-Za-z0-9\s]/g) ?? []).length;
  return body.length > 40 && symbols > letters * 0.35;
}

function cleanTopic(title: string | null | undefined): string {
  const t = (title ?? "").replace(/\s+/g, " ").trim();
  if (!t || /^slide\s*\d+$/i.test(t)) return "this";
  if (/[|=￥§]|womens|tsar/i.test(t)) return "this";
  return t.replace(/[!?.]+$/, "");
}

function qualitativeThemes(slide: SlideContent): string[] {
  return slide.bodyText
    .map((t) => t.replace(/\s+/g, " ").trim())
    .filter((t) => t.length >= 4 && t.length <= 48)
    .filter((t) => !/^[\d$%~.,\s%-]+$/i.test(t))
    .filter((t) => !/\d{2,}/.test(t))
    .filter(
      (t) =>
        !/^(week|nov|dec|jan|feb|mar|apr|may|jun|july|aug|sep|oct|yr|source)/i.test(
          t,
        ),
    )
    .slice(0, 3);
}

/**
 * Graph-guide degraded mode — ONLY when OCR detected a chart.
 * Points at the graphs / bridges prior→next. Never speaks specific figures.
 */
export function chartBridgeFallback(
  slide: SlideContent,
  neighbors?: { prevTitle?: string | null; nextTitle?: string | null },
): NarrationResult {
  const topic = cleanTopic(slide.titleText);
  const themes = qualitativeThemes(slide);
  const prev = cleanTopic(neighbors?.prevTitle);
  const next = cleanTopic(neighbors?.nextTitle);
  const hasPrev = Boolean(neighbors?.prevTitle && prev !== "this");
  const hasNext = Boolean(neighbors?.nextTitle && next !== "this");

  let narration: string;
  if (hasPrev && hasNext) {
    narration =
      `Take a look at the ${topic} charts here — they back what we just covered on ${prev}, ` +
      `and set up ${next}. I won't walk the numbers; the trend is what matters.`;
  } else if (hasNext) {
    narration =
      `Please check the ${topic} graphs on this slide — the trend carries us into ${next}. ` +
      `No need to read every figure aloud.`;
  } else if (themes.length) {
    narration =
      `On ${topic}, glance at the graphs — ${themes.join(", ").toLowerCase()}. ` +
      `The numbers are on the chart; the takeaway is the direction of the trend.`;
  } else {
    narration =
      `Please take a look at the graphs on this ${topic} slide — ` +
      `the trend is the story, not the individual figures.`;
  }

  return {
    slideNo: slide.slideNo,
    fingerprint: slide.fingerprint,
    narration: narration.replace(/\s+/g, " ").trim(),
    omittedContent: slide.bodyText.filter((t) => /[\d$%]/.test(t)).slice(0, 12),
    lowConfidenceFlags: ["chart-bridge-fallback", "ocr-detected-chart"],
    generationMethod: "extractive-fallback",
    coveragePoints: [slide.titleText, ...themes].filter(
      (p): p is string => Boolean(p?.trim()),
    ),
  };
}

export function assertFingerprintMatch(
  slide: SlideContent,
  result: { slideNo?: number; fingerprint?: string },
): void {
  if (typeof result.slideNo === "number" && result.slideNo !== slide.slideNo) {
    throw new Error(
      `Narration slide mismatch: expected ${slide.slideNo}, model returned ${result.slideNo}`,
    );
  }
  if (
    result.fingerprint &&
    slide.fingerprint &&
    result.fingerprint.slice(0, 12).toLowerCase() !==
      slide.fingerprint.slice(0, 12).toLowerCase()
  ) {
    throw new Error(
      `Narration fingerprint mismatch on slide ${slide.slideNo}: expected "${slide.fingerprint}", got "${result.fingerprint}"`,
    );
  }
}

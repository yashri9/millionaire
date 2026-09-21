import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  assertFingerprintMatch,
  extractiveFallback,
  structureSlideContent,
  type TextRun,
} from "./slide-content.ts";

function run(text: string, y: number, fontH = 0.03): TextRun {
  return { text, x: 0.1, y, w: 0.6, h: fontH, fontH };
}

describe("structureSlideContent", () => {
  it("keeps all body lines unfiltered", () => {
    const slide = structureSlideContent({
      slideNo: 2,
      totalSlides: 10,
      extractionMethod: "text-layer",
      runs: [
        run("WHY SOCIAL SELLING?", 0.08, 0.05),
        run("Lots of free time", 0.2),
        run("Need secondary income", 0.26),
        run("Highly social", 0.32),
        run("Source: Zinnov", 0.92, 0.015),
      ],
    });
    assert.equal(slide.titleText, "WHY SOCIAL SELLING?");
    assert.ok(slide.bodyText.includes("Lots of free time"));
    assert.ok(slide.bodyText.includes("Need secondary income"));
    assert.ok(slide.bodyText.includes("Highly social"));
    assert.ok(slide.fingerprint.startsWith("WHY SOCIAL"));
    assert.ok(slide.footnotes.some((f) => /Zinnov/i.test(f)));
  });
});

describe("extractiveFallback", () => {
  it("is honest coverage not template scaffolding", () => {
    const slide = structureSlideContent({
      slideNo: 1,
      totalSlides: 3,
      extractionMethod: "text-layer",
      runs: [run("Cover", 0.1, 0.05), run("Point A", 0.3), run("Point B", 0.36)],
    });
    const out = extractiveFallback(slide);
    assert.equal(out.generationMethod, "extractive-fallback");
    assert.ok(out.narration.startsWith("[Draft]"));
    assert.ok(out.narration.includes("Point A"));
    assert.ok(!/Two things:/i.test(out.narration));
  });
});

describe("assertFingerprintMatch", () => {
  it("throws on wrong slide number", () => {
    const slide = structureSlideContent({
      slideNo: 5,
      totalSlides: 10,
      extractionMethod: "ocr",
      flatText: "KOUDAI\nRaised $350mn",
    });
    assert.throws(() =>
      assertFingerprintMatch(slide, { slideNo: 17, fingerprint: slide.fingerprint }),
    );
  });
});

describe("closing-slide title preference", () => {
  it("prefers THANK YOU and drops investor bleed from body", () => {
    const slide = structureSlideContent({
      slideNo: 19,
      totalSlides: 19,
      extractionMethod: "text-layer",
      runs: [
        run("Neeraj Arora", 0.12, 0.025),
        run("Eric Kwan", 0.18, 0.025),
        run("Business Head, WhatsApp", 0.22, 0.02),
        run("STRATEGIC INVESTORS", 0.08, 0.055),
        run("THANK YOU!", 0.72, 0.04),
        run("Vidit Aatrey", 0.8, 0.025),
        run("vidit@meesho.com", 0.86, 0.02),
      ],
    });
    assert.match(slide.titleText ?? "", /thank\s*you/i);
    assert.ok(slide.fingerprint.toLowerCase().includes("thank"));
    assert.ok(slide.bodyText.some((t) => /vidit/i.test(t)));
    assert.ok(slide.bodyText.some((t) => /@meesho/i.test(t)));
    assert.ok(!slide.bodyText.some((t) => /strategic\s*investors|whatsapp|neeraj/i.test(t)));
    assert.equal(slide.ocrDetectedChart, false);
  });
});

describe("chart-bridge only when OCR detected chart", () => {
  it("uses graph-guide fallback only if ocrDetectedChart", () => {
    const withChart = structureSlideContent({
      slideNo: 12,
      totalSlides: 19,
      extractionMethod: "text-layer",
      ocrDetectedChart: true,
      flatText: "HIGH USER RETENTION\nGMV Retention\n100%\n58%",
    });
    const bridge = extractiveFallback(withChart, {
      prevTitle: "STRONG USER ENGAGEMENT",
      nextTitle: "RESELLERS GROWTH",
    });
    assert.match(bridge.narration, /graphs?|charts?/i);
    assert.ok(!/\[Draft\]/.test(bridge.narration));

    const noOcrChart = structureSlideContent({
      slideNo: 12,
      totalSlides: 19,
      extractionMethod: "text-layer",
      ocrDetectedChart: false,
      flatText: "HIGH USER RETENTION\nGMV Retention\n100%\n58%",
    });
    const plain = extractiveFallback(noOcrChart);
    assert.match(plain.narration, /\[Draft\]/);
    assert.ok(!/please check the .*graphs/i.test(plain.narration));
  });
});

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { reconcileTextAndOcr, textOverlapRatio } from "./reconcile-text-ocr.ts";

describe("reconcileTextAndOcr", () => {
  it("keeps text layer when overlap is high", () => {
    const text = "HIGH USER RETENTION GMV Retention 100% 55% 58%";
    const ocr = "HIGH USER RETENTION GMV Retention 100% 55% 58%";
    const r = reconcileTextAndOcr(text, ocr);
    assert.equal(r.extractionMethod, "text-layer");
    assert.equal(r.mismatched, false);
    assert.equal(r.text, text);
  });

  it("prefers OCR on mismatch when OCR is readable and text is weak", () => {
    // Sparse/wrong text layer vs clear OCR close — OCR should win.
    const text = "19";
    const ocr = "THANK YOU! Vidit Aatrey vidit@meesho.com Please reach out anytime";
    const r = reconcileTextAndOcr(text, ocr);
    assert.equal(r.extractionMethod, "ocr");
    assert.match(r.text, /THANK YOU/i);
  });

  it("keeps text layer when OCR is garbage despite mismatch", () => {
    const text =
      "THANK YOU! Vidit Aatrey vidit@meesho.com Neeraj Arora Strategic Investors";
    const ocr = "at bY. Q7F @a® a &ll 5) =} AY | W a9 a v. = YR a NEARY = EZ";
    const r = reconcileTextAndOcr(text, ocr);
    assert.equal(r.extractionMethod, "text-layer");
    assert.match(r.text, /THANK YOU/i);
  });

  it("prefers OCR when text layer is empty", () => {
    const r = reconcileTextAndOcr("", "ENABLING NEXT-GEN SOCIAL SELLING IN INDIA");
    assert.equal(r.extractionMethod, "ocr");
    assert.match(r.text, /ENABLING/i);
  });

  it("overlap ratio is low for unrelated strings", () => {
    assert.ok(
      textOverlapRatio("Venture Highway investors", "Thank you contact") < 0.3,
    );
  });
});

// ---------------------------------------------------------------------------
// Cloud Vision fallback (ocr-fallback.ts): when to escalate, parsing, picking.
// ---------------------------------------------------------------------------
import {
  buildVisionRequest,
  parseVisionResponse,
  pickBestOcr,
  shouldEscalateToVision,
  visionCachePath,
  VisionResponseError,
} from "./ocr-fallback.ts";

describe("shouldEscalateToVision", () => {
  it("never calls Vision when the pdf.js text layer is readable", () => {
    const d = shouldEscalateToVision({
      textLayer: "Our GMV grew 3x in FY25 across 400 cities with 55% retention",
      tesseractText: "",
    });
    assert.equal(d.escalate, false);
    assert.equal(d.reason, "text-layer-ok");
  });

  it("never calls Vision when Tesseract already read the slide well", () => {
    const d = shouldEscalateToVision({
      textLayer: "",
      tesseractText: "ENABLING NEXT-GEN SOCIAL SELLING IN INDIA with zero commission",
      tesseractConfidence: 88,
    });
    assert.equal(d.escalate, false);
    assert.equal(d.reason, "tesseract-ok");
  });

  it("escalates when Tesseract returns nothing", () => {
    const d = shouldEscalateToVision({ textLayer: "12", tesseractText: "  " });
    assert.equal(d.escalate, true);
    assert.equal(d.reason, "tesseract-empty");
  });

  it("escalates when Tesseract returns symbol soup (photo of a slide)", () => {
    const d = shouldEscalateToVision({
      textLayer: "",
      tesseractText: "at bY. Q7F @a® a &ll 5) =} AY | W a9 a v. = YR",
    });
    assert.equal(d.escalate, true);
    assert.equal(d.reason, "tesseract-weak");
  });

  it("escalates on low Tesseract confidence even if the text looks long", () => {
    const d = shouldEscalateToVision({
      textLayer: "",
      tesseractText: "Revenve grcwth acrass tbe mid market segrnent was strcng",
      tesseractConfidence: 41,
    });
    assert.equal(d.escalate, true);
    assert.equal(d.reason, "tesseract-low-confidence");
  });
});

describe("Vision request/response", () => {
  it("builds a DOCUMENT_TEXT_DETECTION request", () => {
    const body = buildVisionRequest("QUJD");
    assert.equal(body.requests[0]!.features[0]!.type, "DOCUMENT_TEXT_DETECTION");
    assert.equal(body.requests[0]!.image.content, "QUJD");
  });

  it("parses fullTextAnnotation text and mean confidence", () => {
    const r = parseVisionResponse({
      responses: [
        {
          fullTextAnnotation: {
            text: "THANK YOU!\r\n  Vidit   Aatrey \nvidit@meesho.com\n",
            pages: [{ confidence: 0.9 }, { confidence: 0.8 }],
          },
        },
      ],
    });
    assert.equal(r.text, "THANK YOU!\nVidit Aatrey\nvidit@meesho.com");
    assert.ok(Math.abs((r.confidence ?? 0) - 0.85) < 1e-9);
  });

  it("returns empty text for a blank slide", () => {
    const r = parseVisionResponse({ responses: [{}] });
    assert.equal(r.text, "");
    assert.equal(r.confidence, null);
  });

  it("throws VisionResponseError on a per-image error", () => {
    assert.throws(
      () => parseVisionResponse({ responses: [{ error: { code: 7, message: "billing" } }] }),
      (e: unknown) => e instanceof VisionResponseError && e.code === 7,
    );
  });

  it("cache path is stable and sharded by hash", () => {
    const h = "AB".repeat(32);
    assert.equal(visionCachePath(h), `ocr/vision-document/ab/${"ab".repeat(32)}.json`);
    assert.equal(visionCachePath(h), visionCachePath(h.toLowerCase()));
  });
});

describe("pickBestOcr", () => {
  it("keeps Tesseract when Vision returned nothing (fallback off or failed)", () => {
    assert.deepEqual(pickBestOcr("Market size $4B", null), {
      text: "Market size $4B",
      engine: "tesseract",
    });
  });

  it("prefers Vision when it reads more real words", () => {
    const r = pickBestOcr("Mrkt sz", "Market size in India is $4B and growing 30% a year");
    assert.equal(r.engine, "vision");
  });

  it("prefers clean Vision over longer Tesseract soup", () => {
    const r = pickBestOcr("a9 =} YR || @a® &ll 5) Q7F bY. ~~ ::", "Series B Ask: $20M");
    assert.equal(r.engine, "vision");
  });
});

// Fallback-path eval: run the whole chain over a small mixed deck with a fake
// Vision engine and check (1) Vision is only billed on pages that need it and
// (2) the final text on those pages is the good text.
describe("eval: OCR chain over a mixed deck", () => {
  const deck = [
    { kind: "born-digital", textLayer: "Problem: SMB sellers lose 30% of orders to cart abandonment", tess: "", conf: undefined, truth: "cart abandonment" },
    { kind: "born-digital", textLayer: "Solution: voice-led checkout in 9 Indian languages", tess: "", conf: undefined, truth: "voice-led checkout" },
    { kind: "clean-image", textLayer: "", tess: "Traction 1.2M orders processed in Q2 FY26 across 40 cities", conf: 91, truth: "Traction" },
    { kind: "scan", textLayer: "", tess: "Tearn: Ex-Cashfrce, lIT Kgp", conf: 38, truth: "Team: Ex-Cashfree, IIT Kharagpur founders" },
    { kind: "photo", textLayer: "", tess: "a9 =} YR || @a®", conf: 22, truth: "The Ask: Rs 5 Cr seed round for 18 months runway" },
    { kind: "blank", textLayer: "", tess: "", conf: undefined, truth: "" },
  ];
  const fakeVision = (truth: string) => truth; // Vision reads the true text

  const results = deck.map((p) => {
    let visionCalls = 0;
    let ocrText = "";
    if (p.textLayer.length < 40) {
      ocrText = p.tess;
      const d = shouldEscalateToVision({ textLayer: p.textLayer, tesseractText: p.tess, tesseractConfidence: p.conf });
      if (d.escalate) {
        visionCalls++;
        ocrText = pickBestOcr(p.tess, fakeVision(p.truth)).text;
      }
    }
    const final = reconcileTextAndOcr(p.textLayer, ocrText).text;
    return { ...p, visionCalls, final };
  });

  it("bills Vision only on the scan, the photo and the blank page", () => {
    const billed = results.filter((r) => r.visionCalls > 0).map((r) => r.kind);
    assert.deepEqual(billed, ["scan", "photo", "blank"]);
  });

  it("never bills Vision on born-digital or clean image slides", () => {
    for (const r of results.filter((x) => x.kind === "born-digital" || x.kind === "clean-image")) {
      assert.equal(r.visionCalls, 0, r.kind);
    }
  });

  it("final text on every page contains the real content", () => {
    for (const r of results) {
      if (!r.truth) continue;
      assert.ok(r.final.includes(r.truth.split(" ")[0]!), `${r.kind}: ${r.final}`);
    }
    const scan = results.find((r) => r.kind === "scan")!;
    assert.match(scan.final, /IIT Kharagpur/);
  });
});

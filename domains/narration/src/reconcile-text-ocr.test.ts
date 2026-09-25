import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { reconcileTextAndOcr, textOverlapRatio } from "./reconcile-text-ocr.ts";
import {
  buildVisionRequest,
  parseVisionResponse,
  pickSlideText,
  visionCachePath,
  VisionResponseError,
} from "./ocr-fallback.ts";

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

describe("eval: Vision-primary over a mixed deck", () => {
  const deck = [
    {
      kind: "born-digital",
      textLayer: "Problem: SMB sellers lose 30% of orders to cart abandonment",
      vision: "Problem: SMB sellers lose 30% of orders to cart abandonment",
      truth: "cart abandonment",
    },
    {
      kind: "image-slide",
      textLayer: "",
      vision: "Traction 1.2M orders processed in Q2 FY26 across 40 cities",
      truth: "Traction",
    },
    {
      kind: "scan",
      textLayer: "",
      vision: "Team: Ex-Cashfree, IIT Kharagpur founders",
      truth: "IIT Kharagpur",
    },
    {
      kind: "scrambled-layer",
      textLayer: "abandonment cart to orders of 30% lose sellers SMB :Problem",
      vision: "Problem: SMB sellers lose 30% of orders to cart abandonment",
      truth: "Problem",
    },
    { kind: "blank", textLayer: "", vision: "", truth: "" },
  ];

  const results = deck.map((p) => {
    const pick = pickSlideText(p.textLayer, p.vision || null);
    const final = reconcileTextAndOcr(p.textLayer, pick.source === "vision" ? pick.text : p.vision).text;
    const resolved = pick.text || final;
    return { ...p, pick, resolved };
  });

  it("uses Vision when it returns readable text", () => {
    for (const r of results.filter((x) => x.vision && x.kind !== "blank")) {
      assert.equal(r.pick.source, "vision", r.kind);
    }
  });

  it("falls back to text layer when Vision is empty", () => {
    const blank = results.find((r) => r.kind === "blank")!;
    assert.equal(blank.pick.reason, "no-vision");
  });

  it("resolved text on every page contains the real content", () => {
    for (const r of results) {
      if (!r.truth) continue;
      assert.ok(r.resolved.includes(r.truth.split(" ")[0]!), `${r.kind}: ${r.resolved}`);
    }
  });
});

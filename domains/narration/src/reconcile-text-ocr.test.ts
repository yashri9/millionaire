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

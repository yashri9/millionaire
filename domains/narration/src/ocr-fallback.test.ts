import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { pickSlideText } from "./ocr-fallback.ts";

const richTextLayer =
  "Market Opportunity\nIndia SMB lending is a 400 billion dollar gap\nOnly 14 percent of small businesses have formal credit\nDigital underwriting cuts approval time from weeks to minutes";

describe("pickSlideText", () => {
  it("uses the text layer when Vision returned nothing", () => {
    const r = pickSlideText(richTextLayer, null);
    assert.equal(r.source, "text-layer");
    assert.equal(r.reason, "no-vision");
  });

  it("prefers Vision on an image-only slide", () => {
    const r = pickSlideText("", "Revenue grew 3x\nFY24 ARR 12 Cr\nNet revenue retention 128 percent");
    assert.equal(r.source, "vision");
  });

  it("prefers Vision when both agree (visual reading order)", () => {
    const r = pickSlideText(richTextLayer, richTextLayer.split("\n").reverse().join("\n"));
    assert.equal(r.source, "vision");
    assert.equal(r.reason, "vision-primary");
  });

  it("keeps a rich text layer when Vision missed most of it", () => {
    const r = pickSlideText(richTextLayer, "Market Opportunity");
    assert.equal(r.source, "text-layer");
    assert.equal(r.reason, "vision-sparse-vs-text-layer");
  });

  it("rejects symbol soup from Vision", () => {
    const r = pickSlideText(richTextLayer, "|| == ~~ // ## ** || == ~~");
    assert.equal(r.source, "text-layer");
    assert.equal(r.reason, "vision-unreadable");
  });
});

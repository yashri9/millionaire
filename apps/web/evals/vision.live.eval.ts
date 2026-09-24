/**
 * Live Cloud Vision sanity eval — ONE real API call (1 of your 1,000 free units).
 * Draws a fake "scanned" slide (small, rotated, grey-on-grey text with noise),
 * sends it to Vision DOCUMENT_TEXT_DETECTION, and checks the words come back.
 *
 * Run from the repo root (skips when no key is set):
 *   GOOGLE_TTS_API_KEY=... node --experimental-strip-types --test apps/web/evals/vision.live.eval.ts
 */
import assert from "node:assert/strict";
import { it } from "node:test";
import { createCanvas } from "@napi-rs/canvas";
import {
  buildVisionRequest,
  parseVisionResponse,
} from "../../../domains/narration/src/ocr-fallback.ts";

const key = process.env.GOOGLE_VISION_API_KEY?.trim() || process.env.GOOGLE_TTS_API_KEY?.trim();

function fakeScannedSlide(): string {
  const c = createCanvas(1600, 900);
  const g = c.getContext("2d");
  g.fillStyle = "#d8d4cc";
  g.fillRect(0, 0, 1600, 900);
  for (let i = 0; i < 4000; i++) {
    g.fillStyle = `rgba(0,0,0,${Math.random() * 0.15})`;
    g.fillRect(Math.random() * 1600, Math.random() * 900, 2, 2);
  }
  g.translate(800, 450);
  g.rotate(-0.04);
  g.fillStyle = "#555048";
  g.font = "bold 72px sans-serif";
  g.fillText("Series A Ask", -600, -150);
  g.font = "44px sans-serif";
  g.fillText("Raising 5 Crore to expand into 40 cities", -600, 0);
  g.fillText("Runway: 18 months", -600, 90);
  return c.toBuffer("image/jpeg", 85).toString("base64");
}

it("Cloud Vision reads a noisy scanned slide", { skip: !key && "no GOOGLE_TTS_API_KEY" }, async () => {
  const res = await fetch("https://vision.googleapis.com/v1/images:annotate", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": key! },
    body: JSON.stringify(buildVisionRequest(fakeScannedSlide())),
  });
  const body = await res.text();
  assert.equal(
    res.status,
    200,
    res.status === 403
      ? `403: enable "Cloud Vision API" on the voxdeck-tts project and allow it on the key. ${body.slice(0, 200)}`
      : body.slice(0, 300),
  );
  const out = parseVisionResponse(JSON.parse(body));
  console.log("Vision text:", JSON.stringify(out.text), "confidence:", out.confidence);
  assert.match(out.text, /Series A Ask/i);
  assert.match(out.text, /40 cities/i);
  assert.match(out.text, /18 months/i);
});

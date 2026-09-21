/**
 * Render every page of a marketing PDF to JPEG slides.
 * Usage: node scripts/render-marketing-pdf.mjs <pdfPath> <outDir>
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { createCanvas } from "@napi-rs/canvas";

const require = createRequire(import.meta.url);
const pdfjs = require("pdfjs-dist/legacy/build/pdf.mjs");

const [, , pdfPathArg, outDirArg] = process.argv;
if (!pdfPathArg || !outDirArg) {
  console.error("Usage: node scripts/render-marketing-pdf.mjs <pdf> <outDir>");
  process.exit(1);
}

const pdfPath = path.resolve(pdfPathArg);
const outDir = path.resolve(outDirArg);
fs.mkdirSync(outDir, { recursive: true });

const data = new Uint8Array(fs.readFileSync(pdfPath));
const doc = await pdfjs.getDocument({ data, useSystemFonts: true }).promise;
console.log(`PDF pages: ${doc.numPages}`);

const texts = [];

for (let n = 1; n <= doc.numPages; n++) {
  const page = await doc.getPage(n);
  const base = page.getViewport({ scale: 1 });
  const scale = Math.min(2.2, 1600 / base.width);
  const viewport = page.getViewport({ scale });
  const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
  const ctx = canvas.getContext("2d");
  await page.render({ canvasContext: ctx, viewport }).promise;

  const out = path.join(outDir, `page-${String(n).padStart(2, "0")}.jpg`);
  fs.writeFileSync(out, canvas.toBuffer("image/jpeg", 85));

  const tc = await page.getTextContent();
  const text = tc.items.map((i) => ("str" in i ? i.str : "")).join(" ").replace(/\s+/g, " ").trim();
  texts.push({ n, text: text.slice(0, 500) });
  console.log(`wrote ${path.basename(out)} (${text.slice(0, 60)}…)`);
}

fs.writeFileSync(path.join(outDir, "_text.json"), JSON.stringify(texts, null, 2));
console.log("done");

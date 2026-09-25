import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";
import { createCanvas } from "@napi-rs/canvas";

const pdfBytes = readFileSync("tmp-stress.pdf");
const TARGET_WIDTH = Number(process.env.SLIDE_RENDER_WIDTH || 2560);
const THUMB_SCALE = 0.25;
const WEBP_QUALITY = 92;
const OCR_JPEG_QUALITY = 92;
const MAX_PAGES_IN_FLIGHT = 4;

function mem() {
  const m = process.memoryUsage();
  return `rss=${(m.rss / 1e6).toFixed(0)}MB heap=${(m.heapUsed / 1e6).toFixed(0)}MB`;
}

const t0 = Date.now();
console.log("start bytes", pdfBytes.length, "TARGET_WIDTH", TARGET_WIDTH, mem());

const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");
const candidates = [
  join(process.cwd(), "apps/web/node_modules/pdfjs-dist"),
  join(process.cwd(), "node_modules/pdfjs-dist"),
];
const dir = candidates.find((d) => existsSync(d));
if (!dir) throw new Error("pdfjs-dist not found");
console.log("pdfjsDir", dir);

const doc = await pdfjsLib.getDocument({
  data: new Uint8Array(pdfBytes),
  standardFontDataUrl: join(dir, "standard_fonts") + "/",
  cMapUrl: join(dir, "cmaps") + "/",
  cMapPacked: true,
}).promise;
console.log("pages", doc.numPages, "openMs", Date.now() - t0);

mkdirSync("tmp-stress-out", { recursive: true });
const pages = [];
const inFlight = [];

for (let i = 1; i <= doc.numPages; i++) {
  const page = await doc.getPage(i);
  const base = page.getViewport({ scale: 1 });
  const scale = TARGET_WIDTH / Math.max(1, base.width);
  const fullViewport = page.getViewport({ scale });
  const w = Math.ceil(fullViewport.width);
  const h = Math.ceil(fullViewport.height);
  console.log("page", i, "canvas", `${w}x${h}`, mem());

  const fullCanvas = createCanvas(w, h);
  const fullCtx = fullCanvas.getContext("2d");
  fullCtx.fillStyle = "#ffffff";
  fullCtx.fillRect(0, 0, w, h);

  const tRender = Date.now();
  const [, textContent] = await Promise.all([
    page.render({
      canvas: null,
      canvasContext: fullCtx,
      viewport: fullViewport,
    }).promise,
    page.getTextContent().catch(() => ({ items: [] })),
  ]);
  console.log(
    "  rendered",
    Date.now() - tRender,
    "ms items",
    textContent.items?.length ?? 0,
    mem(),
  );

  const thumbCanvas = createCanvas(
    Math.max(1, Math.round(w * THUMB_SCALE)),
    Math.max(1, Math.round(h * THUMB_SCALE)),
  );
  const thumbCtx = thumbCanvas.getContext("2d");
  thumbCtx.imageSmoothingEnabled = true;
  thumbCtx.drawImage(fullCanvas, 0, 0, thumbCanvas.width, thumbCanvas.height);
  page.cleanup();

  const pageP = Promise.all([
    fullCanvas.encode("webp", WEBP_QUALITY),
    thumbCanvas.encode("webp", WEBP_QUALITY),
    fullCanvas.encode("jpeg", OCR_JPEG_QUALITY),
  ]).then(([image, thumb, jpeg]) => {
    writeFileSync(join("tmp-stress-out", `p${i}.webp`), image);
    writeFileSync(join("tmp-stress-out", `p${i}-ocr.jpg`), jpeg);
    console.log("  encoded page", i, "webp", image.length, "jpeg", jpeg.length, mem());
    return {
      i,
      imageLen: image.length,
      jpegLen: jpeg.length,
      textItems: textContent.items?.length ?? 0,
    };
  });
  inFlight.push(pageP);
  if (inFlight.length >= MAX_PAGES_IN_FLIGHT) pages.push(await inFlight.shift());
}
for (const p of inFlight) pages.push(await p);
await doc.cleanup();
console.log("DONE pages", pages.length, "totalMs", Date.now() - t0, mem());
console.log(JSON.stringify(pages, null, 2));

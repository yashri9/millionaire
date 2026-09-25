import "server-only";

/**
 * render.ts — page image rendering (Studio parity with backend/server.py's
 * convert_to_pdf + render_pdf).
 *
 * PPTX -> PDF: shells out to LibreOffice headless, same approach the
 * FastAPI prototype uses (there's no reliable pure-JS PPTX renderer — OOXML
 * shape/layout fidelity is a real rendering engine's job). If LibreOffice
 * isn't found, callers fall back to text-only slides (no images), matching
 * the prototype's own fallback.
 *
 * PDF -> page images: pdfjs-dist + @napi-rs/canvas, entirely in Node (no
 * external binary needed for the PDF step itself, on any platform).
 */
import { execFile } from "child_process";
import { promisify } from "util";
import { access, mkdtemp, readFile, rm, writeFile } from "fs/promises";
import { createRequire } from "module";
import { tmpdir } from "os";
import { dirname, join } from "path";
import { pathToFileURL } from "url";
import { createCanvas, type Canvas } from "@napi-rs/canvas";
import { serverEnv } from "@/lib/env";

const execFileAsync = promisify(execFile);

/** Absolute pdfjs-dist root — walk from cwd so monorepo/Vercel hoisting works. */
function pdfjsPackageRoot(): string {
  const req = createRequire(join(process.cwd(), "package.json"));
  try {
    return dirname(req.resolve("pdfjs-dist/package.json"));
  } catch {
    const up = createRequire(join(process.cwd(), "..", "..", "package.json"));
    return dirname(up.resolve("pdfjs-dist/package.json"));
  }
}

/** pdf.js Node canvas factory (required on serverless — no DOM). */
function createNodeCanvasFactory() {
  return {
    create(width: number, height: number) {
      const canvas = createCanvas(Math.max(1, width), Math.max(1, height));
      return { canvas, context: canvas.getContext("2d") };
    },
    reset(
      canvasAndContext: { canvas: Canvas; context: ReturnType<Canvas["getContext"]> },
      width: number,
      height: number,
    ) {
      canvasAndContext.canvas.width = Math.max(1, width);
      canvasAndContext.canvas.height = Math.max(1, height);
    },
    destroy(canvasAndContext: { canvas: Canvas }) {
      canvasAndContext.canvas.width = 0;
      canvasAndContext.canvas.height = 0;
    },
  };
}

export type RenderedPage = {
  order_index: number;
  imagePng: Buffer;
  thumbPng: Buffer;
  /** High-quality JPEG of the full page for OCR (lossy WebP q82 blurs small text). */
  ocrJpeg?: Buffer;
  /** pdf.js text layer for this page, one visual line per "\n". */
  textLayer?: string;
};

export type RenderOptions = {
  /**
   * Called as soon as a page's OCR JPEG exists (~20ms after render), before the
   * slower WebP encodes finish — so Vision starts while later pages render.
   */
  onOcrImage?: (orderIndex: number, ocrJpeg: Buffer | undefined) => void;
};

/** Pages whose WebP encodes may still be running while the next page renders. */
const MAX_PAGES_IN_FLIGHT = 4;

function envInt(name: string, fallback: number, min: number, max: number): number {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n > 0 ? Math.min(max, Math.max(min, Math.round(n))) : fallback;
}

/**
 * Full slide image width. 2560px keeps text crisp on a 2x (Retina) laptop
 * stage (~1100-1400 CSS px) and on a 1440p full-screen present. 1600px was
 * visibly soft there. Raise to 3840 for 4K presenting (bigger files, slower).
 */
const TARGET_WIDTH = envInt("SLIDE_RENDER_WIDTH", 2560, 1024, 3840);
/**
 * WebP quality for the slide image. q82 left halos around small/coloured
 * text; q92 is near-indistinguishable from lossless PNG at ~half its size.
 */
const WEBP_QUALITY = envInt("SLIDE_WEBP_QUALITY", 92, 60, 100);
/** Thumb = 25% of full (640px at 2560): crisp in the slide rail on 2x screens. */
const THUMB_SCALE = 0.25;
/** JPEG quality for the OCR copy. q92 keeps 8-10px footnote text legible for Vision. */
const OCR_JPEG_QUALITY = 92;
export const MAX_PAGES = 60;

async function encodePreferWebp(canvas: Canvas): Promise<Buffer> {
  // Prefer async encode — node-canvas compat toBuffer("image/webp", number)
  // can throw ERR_INVALID_ARG_TYPE on some napi-rs builds in serverless.
  try {
    return await canvas.encode("webp", WEBP_QUALITY);
  } catch {
    return canvas.toBuffer("image/png");
  }
}

async function encodeJpeg(canvas: Canvas): Promise<Buffer | undefined> {
  try {
    return await canvas.encode("jpeg", OCR_JPEG_QUALITY);
  } catch {
    try {
      return canvas.toBuffer("image/jpeg", OCR_JPEG_QUALITY);
    } catch {
      return undefined;
    }
  }
}

export async function findSoffice(): Promise<string | null> {
  if (serverEnv.sofficePath) {
    try {
      await access(serverEnv.sofficePath);
      return serverEnv.sofficePath;
    } catch {
      /* fall through to PATH lookup */
    }
  }
  for (const name of ["soffice", "libreoffice"]) {
    try {
      const cmd = process.platform === "win32" ? "where" : "which";
      const { stdout } = await execFileAsync(cmd, [name]);
      const found = stdout.split(/\r?\n/)[0]?.trim();
      if (found) return found;
    } catch {
      /* not found, try next */
    }
  }
  const candidates = [
    "C:\\Program Files\\LibreOffice\\program\\soffice.exe",
    "C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe",
    "/Applications/LibreOffice.app/Contents/MacOS/soffice",
    "/usr/bin/soffice",
    "/usr/bin/libreoffice",
  ];
  for (const c of candidates) {
    try {
      await access(c);
      return c;
    } catch {
      /* not found, try next */
    }
  }
  return null;
}

/** Converts PPTX bytes to PDF via LibreOffice. Returns null if unavailable. */
export async function convertToPdf(bytes: ArrayBuffer, _filename: string): Promise<ArrayBuffer | null> {
  const soffice = await findSoffice();
  if (!soffice) return null;

  const dir = await mkdtemp(join(tmpdir(), "deck-agent-"));
  try {
    const srcPath = join(dir, "source.pptx");
    await writeFile(srcPath, Buffer.from(bytes));

    await execFileAsync(
      soffice,
      ["--headless", "--convert-to", "pdf", "--outdir", dir, srcPath],
      { timeout: 180_000 },
    );

    const pdfPath = join(dir, `source.pdf`);
    return (await readFile(pdfPath)).buffer as ArrayBuffer;
  } catch {
    return null;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

type TextItem = { str?: string; transform?: number[]; hasEOL?: boolean };

/** Join pdf.js text items into visual lines (new line on a baseline change or EOL). */
function textContentToLines(items: TextItem[]): string {
  let out = "";
  let lastY: number | undefined;
  for (const item of items) {
    if (typeof item.str !== "string") continue; // marked-content markers
    const y = item.transform?.[5];
    if (lastY !== undefined && y !== undefined && Math.abs(y - lastY) > 1) out += "\n";
    out += item.str;
    if (item.hasEOL) out += "\n";
    if (y !== undefined) lastY = y;
  }
  return out
    .split("\n")
    .map((l) => l.replace(/[ \t]+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}

/**
 * Renders every page of a PDF once, and from that single render produces the
 * full image, the thumbnail (downscaled copy, not a second render), the OCR
 * JPEG and the text layer. One pdf.js document serves both images and text,
 * so the PDF is no longer parsed twice.
 */
export async function renderPdfPages(
  pdfBytes: ArrayBuffer,
  opts: RenderOptions = {},
): Promise<RenderedPage[]> {
  const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const pdfjsDir = pdfjsPackageRoot();
  const canvasFactory = createNodeCanvasFactory();
  const standardFontDataUrl = pathToFileURL(join(pdfjsDir, "standard_fonts") + "/").href;
  const cMapUrl = pathToFileURL(join(pdfjsDir, "cmaps") + "/").href;

  const doc = await pdfjsLib.getDocument({
    data: new Uint8Array(pdfBytes),
    standardFontDataUrl,
    cMapUrl,
    cMapPacked: true,
    // @ts-expect-error pdfjs CanvasFactory typing is DOM-oriented; Node factory works at runtime.
    canvasFactory,
  }).promise;

  if (doc.numPages > MAX_PAGES) {
    await doc.cleanup();
    throw new Error(
      `This PDF has ${doc.numPages} pages — decks over ${MAX_PAGES} pages aren't supported yet. Try splitting it up.`,
    );
  }

  const pages: RenderedPage[] = [];
  const inFlight: Promise<RenderedPage>[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const base = page.getViewport({ scale: 1 });
    const scale = TARGET_WIDTH / Math.max(1, base.width);
    const fullViewport = page.getViewport({ scale });
    const fullCanvas = createCanvas(Math.ceil(fullViewport.width), Math.ceil(fullViewport.height));
    const fullCtx = fullCanvas.getContext("2d");
    // White backdrop: transparent PDFs otherwise encode as black in JPEG.
    fullCtx.fillStyle = "#ffffff";
    fullCtx.fillRect(0, 0, fullCanvas.width, fullCanvas.height);

    const [, textContent] = await Promise.all([
      page.render({
        canvasContext: fullCtx as unknown as CanvasRenderingContext2D,
        viewport: fullViewport,
        // @ts-expect-error Node canvas factory
        canvasFactory,
      }).promise,
      page.getTextContent().catch(() => ({ items: [] as TextItem[] })),
    ]);

    const thumbCanvas = createCanvas(
      Math.max(1, Math.round(fullCanvas.width * THUMB_SCALE)),
      Math.max(1, Math.round(fullCanvas.height * THUMB_SCALE)),
    );
    const thumbCtx = thumbCanvas.getContext("2d");
    thumbCtx.imageSmoothingEnabled = true;
    thumbCtx.drawImage(fullCanvas, 0, 0, thumbCanvas.width, thumbCanvas.height);

    // Encodes run on the libuv threadpool so the next page can render while this one encodes.
    const textLayer = textContentToLines(textContent.items as TextItem[]);
    page.cleanup();
    const ocrJpegP = encodeJpeg(fullCanvas).then((jpeg) => {
      opts.onOcrImage?.(i, jpeg);
      return jpeg;
    });
    const pageP = Promise.all([encodePreferWebp(fullCanvas), encodePreferWebp(thumbCanvas), ocrJpegP]).then(
      ([imagePng, thumbPng, ocrJpeg]): RenderedPage => ({ order_index: i, imagePng, thumbPng, ocrJpeg, textLayer }),
    );
    inFlight.push(pageP);
    if (inFlight.length >= MAX_PAGES_IN_FLIGHT) pages.push(await inFlight.shift()!);
  }
  for (const p of inFlight) pages.push(await p);
  await doc.cleanup();
  return pages;
}

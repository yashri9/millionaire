import "server-only";

/**
 * render.ts — page image rendering (Studio parity with backend/server.py's
 * convert_to_pdf + render_pdf).
 *
 * PPTX/PPT -> PDF: shells out to LibreOffice headless, same approach the
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
import { tmpdir } from "os";
import { join } from "path";
import { createCanvas } from "@napi-rs/canvas";
import { serverEnv } from "@/lib/env";

const execFileAsync = promisify(execFile);

export type RenderedPage = {
  order_index: number;
  imagePng: Buffer;
  thumbPng: Buffer;
};

const PAGE_SCALE = 1.6; // full-page render quality
const THUMB_SCALE = 0.45; // relative to PAGE_SCALE

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

/** Converts PPTX/PPT bytes to PDF bytes via LibreOffice. Returns null if unavailable. */
export async function convertToPdf(bytes: ArrayBuffer, filename: string): Promise<ArrayBuffer | null> {
  const soffice = await findSoffice();
  if (!soffice) return null;

  const dir = await mkdtemp(join(tmpdir(), "deck-agent-"));
  try {
    const ext = filename.toLowerCase().endsWith(".ppt") ? ".ppt" : ".pptx";
    const srcPath = join(dir, `source${ext}`);
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

/** Renders every page of a PDF to a full image + thumbnail PNG. */
export async function renderPdfPages(pdfBytes: ArrayBuffer): Promise<RenderedPage[]> {
  const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const pdfjsDir = join(process.cwd(), "node_modules", "pdfjs-dist");

  const doc = await pdfjsLib.getDocument({
    data: new Uint8Array(pdfBytes),
    standardFontDataUrl: join(pdfjsDir, "standard_fonts") + "/",
    cMapUrl: join(pdfjsDir, "cmaps") + "/",
    cMapPacked: true,
  }).promise;

  const pages: RenderedPage[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);

    const fullViewport = page.getViewport({ scale: PAGE_SCALE });
    const fullCanvas = createCanvas(fullViewport.width, fullViewport.height);
    await page.render({
      canvas: null,
      canvasContext: fullCanvas.getContext("2d") as unknown as CanvasRenderingContext2D,
      viewport: fullViewport,
    }).promise;

    const thumbViewport = page.getViewport({ scale: PAGE_SCALE * THUMB_SCALE });
    const thumbCanvas = createCanvas(thumbViewport.width, thumbViewport.height);
    await page.render({
      canvas: null,
      canvasContext: thumbCanvas.getContext("2d") as unknown as CanvasRenderingContext2D,
      viewport: thumbViewport,
    }).promise;

    pages.push({
      order_index: i,
      imagePng: fullCanvas.toBuffer("image/png"),
      thumbPng: thumbCanvas.toBuffer("image/png"),
    });
  }
  await doc.cleanup();
  return pages;
}

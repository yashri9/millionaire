import "server-only";

/**
 * parse.ts — deck parsing (PPTX / PDF -> slides).
 *
 * PPTX: unzip and read `ppt/slides/slideN.xml` directly (no python-pptx
 * equivalent in Node); slide order comes from `ppt/presentation.xml`'s
 * <p:sldIdLst> resolved through `ppt/_rels/presentation.xml.rels`, not the
 * slideN filename — PowerPoint doesn't rename files when slides are reordered.
 * Within a slide, each <a:p> paragraph's concatenated <a:t> runs is one line;
 * the first line is the title, the rest are bullets (mirrors the heuristic in
 * backend/server.py's extract_pptx_text, adapted to the title/bullets shape).
 *
 * PDF: pdf-parse's per-page text via a custom `pagerender` (the library only
 * exposes concatenated whole-doc text by default) using the same
 * first-line-is-title heuristic.
 */
import { fromBuffer, type Entry, type ZipFile } from "yauzl";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse = require("pdf-parse") as (
  data: Buffer,
  opts?: { pagerender?: (pageData: unknown) => Promise<string> },
) => Promise<{ numpages: number }>;

export type ParsedSlide = {
  order_index: number;
  title: string;
  bullets: string[];
  needsManualText: boolean;
};

export type ParseResult = {
  slides: ParsedSlide[];
  warnings: string[];
};

function linesToSlide(order_index: number, lines: string[]): ParsedSlide {
  const clean = lines.map((l) => l.trim()).filter(Boolean);
  return {
    order_index,
    title: clean[0] ?? "",
    bullets: clean.slice(1),
    needsManualText: clean.length === 0,
  };
}

// ---- PPTX -------------------------------------------------------------

function openZip(buffer: Buffer): Promise<ZipFile> {
  return new Promise((resolve, reject) => {
    fromBuffer(buffer, { lazyEntries: false }, (err, zip) => {
      if (err || !zip) reject(err ?? new Error("Failed to open .pptx as a zip"));
      else resolve(zip);
    });
  });
}

function readZipText(zip: ZipFile, entry: Entry): Promise<string> {
  return new Promise((resolve, reject) => {
    zip.openReadStream(entry, (err, stream) => {
      if (err || !stream) return reject(err ?? new Error(`Could not read ${entry.fileName}`));
      const chunks: Buffer[] = [];
      stream.on("data", (c: Buffer) => chunks.push(c));
      stream.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
      stream.on("error", reject);
    });
  });
}

/** Collect every entry in the zip, keyed by path, as UTF-8 text. */
async function readAllZipText(buffer: Buffer, matches: (path: string) => boolean) {
  const zip = await openZip(buffer);
  const entries: Entry[] = [];
  return new Promise<Map<string, string>>((resolve, reject) => {
    zip.on("entry", (entry: Entry) => {
      if (matches(entry.fileName)) entries.push(entry);
    });
    zip.on("end", async () => {
      try {
        const out = new Map<string, string>();
        for (const entry of entries) {
          out.set(entry.fileName, await readZipText(zip, entry));
        }
        zip.close();
        resolve(out);
      } catch (e) {
        zip.close();
        reject(e);
      }
    });
    zip.on("error", reject);
  });
}

/** Slide order per PowerPoint's actual ordering (presentation.xml + rels), not filename. */
function resolveSlideOrder(presentationXml: string, relsXml: string): string[] {
  const relTarget = new Map<string, string>();
  for (const m of relsXml.matchAll(/<Relationship[^>]*Id="([^"]+)"[^>]*Target="([^"]*slides\/slide\d+\.xml)"/g)) {
    relTarget.set(m[1], m[2].replace(/^.*slides\//, "slides/"));
  }
  const order: string[] = [];
  for (const m of presentationXml.matchAll(/<p:sldId[^>]*r:id="([^"]+)"/g)) {
    const target = relTarget.get(m[1]);
    if (target) order.push(`ppt/${target}`);
  }
  return order;
}

function extractParagraphLines(slideXml: string): string[] {
  const lines: string[] = [];
  for (const p of slideXml.matchAll(/<a:p>([\s\S]*?)<\/a:p>/g)) {
    const runs = [...p[1].matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)].map((r) =>
      r[1].replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'"),
    );
    const line = runs.join("").trim();
    if (line) lines.push(line);
  }
  return lines;
}

async function parsePptx(buffer: Buffer): Promise<ParseResult> {
  const files = await readAllZipText(
    buffer,
    (p) => p === "ppt/presentation.xml" || p === "ppt/_rels/presentation.xml.rels" || /^ppt\/slides\/slide\d+\.xml$/.test(p),
  );

  const presentationXml = files.get("ppt/presentation.xml");
  const relsXml = files.get("ppt/_rels/presentation.xml.rels");
  const warnings: string[] = [];

  let order = presentationXml && relsXml ? resolveSlideOrder(presentationXml, relsXml) : [];
  if (order.length === 0) {
    // Fallback: numeric filename order (matches what officeparser itself does).
    warnings.push("Could not resolve slide order from presentation.xml; using file order as a fallback.");
    order = [...files.keys()]
      .filter((p) => /^ppt\/slides\/slide\d+\.xml$/.test(p))
      .sort((a, b) => Number(a.match(/(\d+)/)![1]) - Number(b.match(/(\d+)/)![1]));
  }

  const slides = order.map((path, i) => linesToSlide(i + 1, extractParagraphLines(files.get(path) ?? "")));
  if (slides.length === 0) throw new Error("No slides found in this .pptx file.");
  return { slides, warnings };
}

// ---- PDF ----------------------------------------------------------------

async function parsePdf(buffer: Buffer): Promise<ParseResult> {
  const pages: string[] = [];
  await pdfParse(buffer, {
    pagerender: async (pageData: unknown) => {
      const tc = await (pageData as { getTextContent: (o: object) => Promise<{ items: { str: string; transform: number[] }[] }> }).getTextContent({
        normalizeWhitespace: false,
        disableCombineTextItems: false,
      });
      let lastY: number | undefined;
      let text = "";
      for (const item of tc.items) {
        if (lastY === item.transform[5] || lastY === undefined) text += item.str;
        else text += "\n" + item.str;
        lastY = item.transform[5];
      }
      pages.push(text);
      return text;
    },
  });

  if (pages.length === 0) throw new Error("No pages found in this .pdf file.");
  const slides = pages.map((text, i) => linesToSlide(i + 1, text.split("\n")));
  return { slides, warnings: [] };
}

export async function parseDeck(fileBytes: ArrayBuffer, filename: string): Promise<ParseResult> {
  const buffer = Buffer.from(fileBytes);
  const lower = filename.toLowerCase();
  if (lower.endsWith(".pptx")) return parsePptx(buffer);
  if (lower.endsWith(".pdf")) return parsePdf(buffer);
  throw new Error(`Unsupported file type: ${filename}`);
}

export const UPLOAD_LIMITS = {
  maxBytes: 25 * 1024 * 1024, // 25MB (PRD §4.5)
  accept: [".pptx", ".pdf"] as const,
};

export function validateUpload(filename: string, sizeBytes: number): string | null {
  const lower = filename.toLowerCase();
  const okExt = UPLOAD_LIMITS.accept.some((e) => lower.endsWith(e));
  if (!okExt) return `Unsupported file type. Accepted: ${UPLOAD_LIMITS.accept.join(", ")}`;
  if (sizeBytes > UPLOAD_LIMITS.maxBytes) return `File too large (max 25MB).`;
  return null;
}

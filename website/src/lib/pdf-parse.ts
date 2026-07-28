// Client-side PDF → slides. Runs entirely in the browser.
// pdfjs is dynamically imported to avoid SSR crashes (DOMMatrix undefined on server).
import type { DeckSlide, SlideWord } from "@/lib/deck-store";

export type ParseProgress = {
  phase: "upload" | "parse" | "narrate";
  current: number;   // 0..total
  total: number;
};

function estimateDuration(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(8, Math.round((words / 155) * 60));
}

function draftScript(pageText: string, pageNum: number): string {
  const clean = pageText.replace(/\s+/g, " ").trim();
  if (!clean) return `This is slide ${pageNum}. Walk through the visual with the audience.`;
  const sentences = clean.split(/(?<=[.!?])\s+/).slice(0, 2).join(" ");
  const trimmed = sentences.length > 260 ? sentences.slice(0, 240).replace(/\s\S*$/, "") + "…" : sentences;
  return trimmed;
}

function draftTitle(pageText: string, pageNum: number): string {
  const line = pageText
    .split(/\n+/)
    .map((l) => l.trim())
    .find((l) => l.length >= 3 && l.length <= 90);
  return line ?? `Slide ${pageNum}`;
}

export async function parsePdfToSlides(
  file: File,
  onProgress?: (p: ParseProgress) => void,
): Promise<{ title: string; slides: DeckSlide[] }> {
  onProgress?.({ phase: "upload", current: 0, total: 1 });
  const buf = await file.arrayBuffer();
  onProgress?.({ phase: "upload", current: 1, total: 1 });

  // Dynamic import so pdfjs never loads at module scope (SSR-safe).
  const pdfjs = await import("pdfjs-dist");
  const workerSrc = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;

  const pdf = await pdfjs.getDocument({ data: buf }).promise;
  const total = pdf.numPages;
  const slides: DeckSlide[] = [];

  for (let p = 1; p <= total; p++) {
    onProgress?.({ phase: "parse", current: p - 1, total });
    const page = await pdf.getPage(p);
    const viewport = page.getViewport({ scale: 1 });
    const pageW = viewport.width;
    const pageH = viewport.height;

    // Extract text items WITH positions. Each item has a transform matrix:
    // [a, b, c, d, e, f] where (e, f) is origin in PDF coords (y up from bottom).
    const textContent = await page.getTextContent();
    const words: SlideWord[] = [];
    const textParts: string[] = [];

    for (const item of textContent.items) {
      if (!("str" in item)) continue;
      const str = item.str;
      if (!str.trim()) continue;
      textParts.push(str);

      // item.transform = [scaleX, skewY, skewX, scaleY, x, y]
      const tr = item.transform as number[];
      const fontH = Math.abs(tr[3]) || Math.abs(tr[0]) || 10;
      const itemW = item.width ?? fontH * str.length * 0.5;
      const itemH = item.height ?? fontH;
      const originX = tr[4];
      const originYTop = pageH - tr[5] - itemH; // convert to top-left origin

      // Split the item into words, approximating each word's x by proportional width.
      const tokens = str.split(/(\s+)/); // keep spaces to preserve offsets
      let cursor = 0;
      const totalChars = str.length || 1;
      for (const tok of tokens) {
        if (!tok || /^\s+$/.test(tok)) { cursor += tok.length; continue; }
        const startFrac = cursor / totalChars;
        const endFrac = (cursor + tok.length) / totalChars;
        const wx = originX + startFrac * itemW;
        const ww = (endFrac - startFrac) * itemW;
        words.push({
          text: tok,
          x: wx / pageW,
          y: originYTop / pageH,
          w: ww / pageW,
          h: itemH / pageH,
        });
        cursor += tok.length;
      }
    }
    const pageText = textParts.join(" ");

    // Render a small thumbnail
    const targetWidth = 1200;
    const scale = targetWidth / pageW;
    const scaled = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(scaled.width);
    canvas.height = Math.ceil(scaled.height);
    const ctx = canvas.getContext("2d")!;
    await page.render({ canvas, canvasContext: ctx, viewport: scaled }).promise;
    const thumbnail = canvas.toDataURL("image/jpeg", 0.78);

    const title = draftTitle(pageText, p);
    const script = draftScript(pageText, p);
    slides.push({
      n: String(p).padStart(2, "0"),
      title,
      script,
      durationSec: estimateDuration(script),
      thumbnail,
      pageText,
      words,
    });
    onProgress?.({ phase: "parse", current: p, total });
  }

  onProgress?.({ phase: "narrate", current: total, total });
  const filename = file.name.replace(/\.pdf$/i, "");
  return { title: filename || "Untitled deck", slides };
}

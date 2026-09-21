import { handle, ApiError } from "@/lib/http";
import { refineNarrationLine } from "@/lib/prompts";
import { LLMError, providerStatus } from "@/lib/llm";
import {
  refineScript,
  type RefineMode,
} from "@voxdeck/narration";

/**
 * POST /api/script/rewrite — refine one spoken line.
 * Design-first safe: accepts slide text + current line (no deck DB required).
 * Tries LLM when a key is configured; always falls back to local refine.
 */
export async function POST(req: Request) {
  return handle(async () => {
    const body = (await req.json().catch(() => ({}))) as {
      mode?: RefineMode;
      currentLine?: string;
      pageText?: string;
      title?: string;
      essentialPoints?: string[];
      pageNum?: number;
      totalPages?: number;
      seed?: number;
      neighbors?: { before?: string; after?: string };
    };

    const mode = body.mode;
    if (mode !== "shorten" && mode !== "punch" && mode !== "regenerate") {
      throw new ApiError(400, "mode must be shorten | punch | regenerate");
    }

    const currentLine = typeof body.currentLine === "string" ? body.currentLine : "";
    const pageText = typeof body.pageText === "string" ? body.pageText : "";
    const title = typeof body.title === "string" ? body.title : "";
    const essentialPoints = Array.isArray(body.essentialPoints)
      ? body.essentialPoints.map(String).filter(Boolean).slice(0, 6)
      : [];

    const fallback = () =>
      refineScript({
        mode,
        currentLine,
        pageText,
        title,
        essentialPoints,
        pageNum: body.pageNum ?? 1,
        totalPages: body.totalPages,
        seed: body.seed ?? Date.now(),
      });

    const { keySet } = providerStatus();
    if (!keySet) {
      return Response.json({ line: fallback(), source: "local" as const });
    }

    try {
      const pageNum = body.pageNum ?? 1;
      const line = await refineNarrationLine({
        mode,
        slides: [
          { index: pageNum - 1, title: "", text: "", essentialPoints: [] },
          {
            index: pageNum,
            title,
            text: pageText,
            essentialPoints,
          },
          { index: pageNum + 1, title: "", text: "", essentialPoints: [] },
        ],
        existingLines: [
          body.neighbors?.before ?? "",
          currentLine,
          body.neighbors?.after ?? "",
        ],
        targetIndex: 1,
      });

      const cleaned = line.trim();
      if (
        !cleaned ||
        (mode === "regenerate" &&
          cleaned.toLowerCase() === currentLine.trim().toLowerCase())
      ) {
        return Response.json({ line: fallback(), source: "local" as const });
      }
      return Response.json({ line: cleaned, source: "llm" as const });
    } catch (err) {
      if (err instanceof LLMError) {
        return Response.json({ line: fallback(), source: "local" as const });
      }
      return Response.json({ line: fallback(), source: "local" as const });
    }
  });
}

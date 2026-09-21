import { requireUser } from "@/lib/auth";
import { handle, ApiError } from "@/lib/http";
import { generateNarrationForDeck } from "@/lib/prompts";
import { providerStatus } from "@/lib/llm";
import { buildLabeledFacts, type SlideContent } from "@voxdeck/narration";

/** Chart-heavy decks can take several minutes (sequential LLM + gates). */
export const maxDuration = 300;

/**
 * POST /api/script/generate — primary narration generation for a deck.
 * Accepts structured SlideContent[] (from client parse). Uses LLM when a key
 * is configured; otherwise returns extractive-fallback / chart-bridge results.
 */
export async function POST(req: Request) {
  return handle(async () => {
    const user = await requireUser();
    void user;
    const body = (await req.json().catch(() => ({}))) as {
      slides?: SlideContent[];
      companyName?: string;
      deckPurpose?: string;
    };

    if (!Array.isArray(body.slides) || body.slides.length === 0) {
      throw new ApiError(400, "slides[] is required");
    }
    if (body.slides.length > 60) {
      throw new ApiError(400, "Too many slides (max 60)");
    }

    const slides: SlideContent[] = body.slides.map((s, i) => {
      const titleText = s.titleText == null ? null : String(s.titleText).slice(0, 200);
      const bodyText = Array.isArray(s.bodyText)
        ? s.bodyText.map(String).slice(0, 60)
        : [];
      const possibleChartRegions = Array.isArray(s.possibleChartRegions)
        ? s.possibleChartRegions
            .map((g) => (Array.isArray(g) ? g.map(String).slice(0, 20) : []))
            .slice(0, 8)
        : [];
      const labeledFacts =
        Array.isArray(s.labeledFacts) && s.labeledFacts.length > 0
          ? s.labeledFacts
              .filter((f) => f && typeof f === "object")
              .map((f) => ({
                series: String((f as { series?: string }).series ?? "").slice(0, 80),
                label: String((f as { label?: string }).label ?? "").slice(0, 40),
                value: String((f as { value?: string }).value ?? "").slice(0, 40),
              }))
              .slice(0, 40)
          : buildLabeledFacts({
              titleText,
              bodyText,
              possibleChartRegions,
            });

      return {
        slideNo: typeof s.slideNo === "number" ? s.slideNo : i + 1,
        totalSlides:
          typeof s.totalSlides === "number" ? s.totalSlides : body.slides!.length,
        fingerprint: String(s.fingerprint ?? "").slice(0, 80),
        titleText,
        bodyText,
        possibleChartRegions,
        labeledFacts,
        imageCaptions: Array.isArray(s.imageCaptions)
          ? s.imageCaptions.map(String).slice(0, 10)
          : [],
        footnotes: Array.isArray(s.footnotes)
          ? s.footnotes.map(String).slice(0, 10)
          : [],
        extractionMethod: s.extractionMethod === "ocr" ? "ocr" : "text-layer",
        ocrDetectedChart: Boolean(s.ocrDetectedChart),
      };
    });

    const results = await generateNarrationForDeck(slides, {
      companyName: body.companyName,
      deckPurpose: body.deckPurpose,
    });

    const { keySet, provider, model } = providerStatus();
    const method =
      results.every((r) => r.generationMethod === "llm")
        ? "llm"
        : results.every((r) => r.generationMethod === "extractive-fallback")
          ? "extractive-fallback"
          : "mixed";

    return Response.json({
      results,
      meta: {
        generationMethod: method,
        llmConfigured: keySet,
        provider,
        model,
      },
    });
  });
}

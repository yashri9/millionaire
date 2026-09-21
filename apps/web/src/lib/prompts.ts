import "server-only";

/**
 * prompts.ts — grounded pitch narration + Q&A.
 * Primary path: LLM per-slide generation from structured SlideContent
 * (same pipeline as tmp-narration-eval/gen-pop.ts).
 * Extractive / chart-bridge are gated fallbacks only — never a silent primary.
 */
import { callLLM, providerStatus } from "@/lib/llm";
import type { RefineMode, SlideContent, NarrationResult } from "@voxdeck/narration";
import {
  assertFingerprintMatch,
  chartBridgeFallback,
  checkNarrationNumbers,
  checkYearValuePairings,
  extractiveFallback,
  slideSourceTextForNumberCheck,
  verifyCitedDataPoints,
  type ChartDataPoint,
} from "@voxdeck/narration";

const MAX_TEXT_PER_SLIDE = 1800;

export type SlideInput = {
  index: number;
  title?: string;
  text?: string;
  essentialPoints?: string[];
};

export const GROUNDING_SYSTEM_PROMPT =
  "You write spoken narration for one slide of a B2B/startup pitch deck. " +
  "A prospect can SEE the slide while hearing your line via TTS — never read the slide aloud.\n\n" +
  "GROUNDING RULES (non-negotiable):\n" +
  "1. Use ONLY facts present in the structured slide content. Never invent numbers, names, " +
  "partners, funding, or claims.\n" +
  "2. Cover the important body points — do not cherry-pick one fragment and ignore the rest.\n" +
  "3. Charts: use labeledFacts (series, label, value). Never pair a value with a different " +
  "label/year than the one it is attached to. Do not narrate axis ticks as metrics.\n" +
  "4. Images/screenshots: only use imageCaptions. Never treat incidental UI text inside a " +
  "mockup as a company claim.\n" +
  "5. Footnotes/sources are optional color, not the main pitch.\n" +
  "6. Do not pull facts from other slides. You are narrating ONLY this slideNo + fingerprint.\n" +
  "7. Tone: confident, plain, live-rep voice. Max ~40 words. No hype adjectives, no emoji, " +
  "no 'as you can see'.\n" +
  "8. First slide of a deck may hook; last slide should land an ask/next step if present.\n" +
  "9. If titleText is Thank You / closing CTA, narrate ONLY the close and contact — " +
  "never list investors, titles, or companies from the same page.\n" +
  "10. Every number you state must appear in labeledFacts or bodyText. Prefer labeledFacts " +
  "for year/value pairings.\n" +
  "11. Do not invent qualitative substitutes for metrics (e.g. do not say 'spend time browsing' " +
  "when the slide only shows shares-per-user). If you omit a metric, omit the claim.\n" +
  "12. narration is spoken TTS only — plain sentences. NEVER put citations, series names, " +
  "labels, brackets, 'source:', or citedDataPoints text inside narration.\n" +
  "13. If OCR detected a chart (ocrDetectedChart) and numbers are ambiguous, do NOT invent " +
  "figures — invite the prospect to look at the graphs, optionally bridging prior→next, " +
  "with zero spoken numbers. If there is no OCR-detected chart, do not use graph-guide language.\n\n" +
  "Return ONLY raw JSON (no markdown):\n" +
  '{"slideNo":number,"fingerprint":string,"narration":string,"citedDataPoints":' +
  '[{"series":string,"label":string,"value":string}],"omittedContent":string[],' +
  '"lowConfidenceFlags":string[]}\n' +
  "Echo slideNo and fingerprint exactly. Put grounding evidence ONLY in citedDataPoints " +
  "(copied from labeledFacts) — that field is for verification and is never shown or spoken. " +
  "narration must remain clean pitch copy. List skipped body points in omittedContent.";

function buildSlideUserPrompt(
  slide: SlideContent,
  deckContext: { companyName?: string; deckPurpose?: string },
  previousNarration: string | null,
): string {
  // Slim payload matches the eval pipeline (gen-pop) — keeps the model focused
  // on grounded facts instead of drowning in caption/footnote noise.
  return JSON.stringify({
    deck: {
      companyName: deckContext.companyName ?? "",
      deckPurpose: deckContext.deckPurpose ?? "pitch",
    },
    previousNarration: previousNarration ?? null,
    slide: {
      slideNo: slide.slideNo,
      totalSlides: slide.totalSlides,
      fingerprint: slide.fingerprint,
      titleText: slide.titleText,
      bodyText: slide.bodyText.slice(0, 18),
      labeledFacts: (slide.labeledFacts ?? []).slice(0, 20),
      possibleChartRegions: slide.possibleChartRegions
        .slice(0, 3)
        .map((g) => g.slice(0, 8)),
      footnotes: slide.footnotes.slice(0, 3),
      extractionMethod: slide.extractionMethod,
      ocrDetectedChart: Boolean(slide.ocrDetectedChart),
    },
    instruction:
      "Spoken narration only. Citations go in citedDataPoints, never in narration. " +
      "Prefer labeledFacts for number/year claims. Graph-guide only if ocrDetectedChart. " +
      "Echo slideNo + fingerprint.",
  });
}

/** Strip accidental citation chrome from spoken narration — never show to user/TTS. */
export function stripCitationArtifacts(narration: string): string {
  return narration
    .replace(/\s*\[(?:source|cite|cited|ref|series|label)[^\]]*\]/gi, "")
    .replace(/\s*\((?:source|cite|cited|per\s+labeledFacts)[^)]*\)/gi, "")
    .replace(/\s*\{[^}]*"series"\s*:[^}]*\}/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function coverageFromSlide(slide: SlideContent): string[] {
  return [slide.titleText, ...slide.bodyText]
    .filter((p): p is string => Boolean(p?.trim()))
    .slice(0, 6);
}

/**
 * Primary narration path — one LLM call per slide (or extractive fallback).
 */
export async function generateNarrationForSlide(
  slide: SlideContent,
  opts?: {
    deckContext?: { companyName?: string; deckPurpose?: string };
    previousNarration?: string | null;
    prevTitle?: string | null;
    nextTitle?: string | null;
  },
): Promise<NarrationResult> {
  const deckContext = opts?.deckContext ?? {};
  const previousNarration = opts?.previousNarration ?? null;
  const neighbors = {
    prevTitle: opts?.prevTitle ?? null,
    nextTitle: opts?.nextTitle ?? null,
  };

  const fallback = () =>
    slide.ocrDetectedChart
      ? chartBridgeFallback(slide, neighbors)
      : extractiveFallback(slide, neighbors);

  if (!providerStatus().keySet) {
    return fallback();
  }

  try {
    const raw = await callLLM(
      GROUNDING_SYSTEM_PROMPT,
      buildSlideUserPrompt(slide, deckContext, previousNarration),
      500,
      { jsonMode: true, temperature: 0.35 },
    );
    const parsed = JSON.parse(raw) as {
      slideNo?: number;
      fingerprint?: string;
      narration?: string;
      citedDataPoints?: ChartDataPoint[];
      omittedContent?: string[];
      lowConfidenceFlags?: string[];
    };

    assertFingerprintMatch(slide, parsed);

    let narration = stripCitationArtifacts(String(parsed.narration ?? "").trim());
    if (!narration) return fallback();

    const flags = Array.isArray(parsed.lowConfidenceFlags)
      ? parsed.lowConfidenceFlags.map(String)
      : [];
    const labeledFacts = slide.labeledFacts ?? [];

    const numberCheck = checkNarrationNumbers(
      narration,
      slideSourceTextForNumberCheck(slide),
    );
    if (!numberCheck.passed) {
      // One grounded retry before extractive — matches eval quality better than
      // immediately dumping [Draft] read-aloud lines.
      try {
        const retryRaw = await callLLM(
          GROUNDING_SYSTEM_PROMPT,
          buildSlideUserPrompt(slide, deckContext, previousNarration) +
            `\n\nRETRY: Your previous narration used numbers not grounded in the slide: ${numberCheck.unmatchedNumbers.join(", ")}. ` +
            "Rewrite with ONLY numbers present in labeledFacts/bodyText. Prefer omitting a figure over inventing one.",
          500,
          { jsonMode: true, temperature: 0.25 },
        );
        const retryParsed = JSON.parse(retryRaw) as {
          narration?: string;
          lowConfidenceFlags?: string[];
        };
        const retryNarration = stripCitationArtifacts(
          String(retryParsed.narration ?? "").trim(),
        );
        const retryCheck = checkNarrationNumbers(
          retryNarration,
          slideSourceTextForNumberCheck(slide),
        );
        if (retryNarration && retryCheck.passed) {
          narration = retryNarration;
          if (Array.isArray(retryParsed.lowConfidenceFlags)) {
            flags.push(...retryParsed.lowConfidenceFlags.map(String));
          }
          flags.push("number-retry-ok");
        } else {
          throw new Error("retry still unmatched");
        }
      } catch {
        if (process.env.NODE_ENV !== "production") {
          console.warn("[generateNarrationForSlide] number-check fail", {
            slideNo: slide.slideNo,
            unmatchedNumbers: numberCheck.unmatchedNumbers,
          });
        }
        const fb = fallback();
        fb.lowConfidenceFlags = [
          ...fb.lowConfidenceFlags,
          `number-mismatch:${numberCheck.unmatchedNumbers.join(",")}`,
        ];
        return fb;
      }
    }

    // citedDataPoints are verification-only — never spoken / never shown.
    // Bad citations must NOT kill a grounded narration (that was swapping LLM
    // copy for weak [Draft] extractive lines and diverging from eval quality).
    const cited = Array.isArray(parsed.citedDataPoints)
      ? parsed.citedDataPoints.filter(
          (p) => p && typeof p === "object" && "value" in p,
        )
      : [];
    if (labeledFacts.length > 0 && cited.length > 0) {
      const bad = verifyCitedDataPoints(cited as ChartDataPoint[], labeledFacts);
      if (bad.length) {
        if (process.env.NODE_ENV !== "production") {
          console.warn("[generateNarrationForSlide] citation-check soft-fail (keeping LLM)", {
            slideNo: slide.slideNo,
            bad,
          });
        }
        flags.push(
          `citation-mismatch:${bad.map((b) => `${b.label}:${b.value}`).join("|")}`,
        );
      }
    }

    if (labeledFacts.length > 0) {
      const pairCheck = checkYearValuePairings(narration, labeledFacts);
      if (!pairCheck.passed) {
        if (process.env.NODE_ENV !== "production") {
          console.warn("[generateNarrationForSlide] year-value pairing fail", {
            slideNo: slide.slideNo,
            badPairs: pairCheck.badPairs,
          });
        }
        const fb = fallback();
        fb.lowConfidenceFlags = [
          ...fb.lowConfidenceFlags,
          `pairing-mismatch:${pairCheck.badPairs.map((p) => `${p.year}≠${p.value}`).join("|")}`,
        ];
        return fb;
      }
    }

    return {
      slideNo: slide.slideNo,
      fingerprint: slide.fingerprint,
      narration,
      omittedContent: Array.isArray(parsed.omittedContent)
        ? parsed.omittedContent.map(String)
        : [],
      lowConfidenceFlags: flags,
      generationMethod: "llm",
      coveragePoints: coverageFromSlide(slide),
    };
  } catch (err) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[generateNarrationForSlide] falling back", slide.slideNo, err);
    }
    const fb = fallback();
    fb.lowConfidenceFlags = [
      ...fb.lowConfidenceFlags,
      "llm-error-fallback",
    ];
    return fb;
  }
}

/**
 * Generate all slides sequentially so chart-bridge fallbacks can use
 * previous/next titles. Order preserved.
 */
export async function generateNarrationForDeck(
  slides: SlideContent[],
  deckContext?: { companyName?: string; deckPurpose?: string },
): Promise<NarrationResult[]> {
  const byNo = [...slides].sort((a, b) => a.slideNo - b.slideNo);
  const results: NarrationResult[] = [];
  let previousNarration: string | null = null;

  for (let i = 0; i < byNo.length; i++) {
    const slide = byNo[i];
    const prevTitle = i > 0 ? byNo[i - 1].titleText : null;
    const nextTitle = i < byNo.length - 1 ? byNo[i + 1].titleText : null;
    const result = await generateNarrationForSlide(slide, {
      deckContext,
      previousNarration,
      prevTitle,
      nextTitle,
    });
    results.push(result);
    previousNarration = result.narration;
    // Pace calls like the eval pipeline to reduce Groq 429s on long decks.
    if (i < byNo.length - 1) {
      await new Promise((r) => setTimeout(r, 1200));
    }
  }

  return results;
}

export async function refineNarrationLine(opts: {
  mode: RefineMode;
  slides: SlideInput[];
  existingLines: string[];
  targetIndex: number;
}): Promise<string> {
  const { mode, slides, existingLines, targetIndex } = opts;
  const target = slides[targetIndex];
  const current = existingLines[targetIndex] ?? "";

  if (!providerStatus().keySet) {
    // Local refine only touches delivery; keep meaning when possible.
    const { refineScript } = await import("@voxdeck/narration");
    return refineScript({
      mode,
      currentLine: current,
      pageText: target?.text ?? "",
      title: target?.title,
      essentialPoints: target?.essentialPoints,
      pageNum: target?.index ?? targetIndex + 1,
      seed: Date.now(),
    });
  }

  const modeRules: Record<RefineMode, string> = {
    shorten:
      "SHORTEN the CURRENT narration only. Keep every fact/number. Cut filler. Max 28 words.",
    punch:
      "PUNCH UP the CURRENT narration only. Keep every fact/number. Sharper verbs, no new claims. Max 40 words.",
    regenerate:
      "REWRITE with clearly different wording while covering the same grounded facts from CURRENT. " +
      "Do not invent. Do not pull other-slide facts. Max 40 words.",
  };

  const system =
    GROUNDING_SYSTEM_PROMPT +
    "\n\nREFINE MODE:\n" +
    modeRules[mode] +
    "\nReturn ONLY the narration string as plain text (not JSON).";

  const context = [
    `Mode: ${mode}`,
    `Slide ${target?.index ?? targetIndex + 1}: ${target?.title ?? ""}`,
    `Slide text: ${(target?.text ?? "").slice(0, MAX_TEXT_PER_SLIDE)}`,
    `CURRENT: ${current}`,
    `Before: ${existingLines[targetIndex - 1] ?? "(none)"}`,
    `After: ${existingLines[targetIndex + 1] ?? "(none)"}`,
  ].join("\n");

  const raw = await callLLM(system, context, 220, { temperature: 0.35 });
  return raw.trim().replace(/^["']|["']$/g, "");
}

export type AskResult = {
  escalate: boolean;
  answer: string;
  slide_ref: number | null;
  confidence: number;
};

export async function answerQuestion(
  question: string,
  slides: SlideInput[],
  repName: string,
): Promise<AskResult> {
  const deckText = slides
    .map((s) => `Slide ${s.index}:\n${(s.text ?? "").trim()}`)
    .join("\n\n");

  const system =
    "You answer a prospect's question about a sales deck they just viewed. You may " +
    "ONLY use the deck content below — never use outside knowledge, never invent " +
    "numbers, pricing, dates, security/compliance claims, or commitments not present " +
    "in the text.\n\nDECK CONTENT:\n" +
    deckText +
    "\n\nRespond with ONLY raw JSON, no markdown, in exactly this shape:\n" +
    '{"escalate": boolean, "answer": "string", "slide_ref": number or null, "confidence": number between 0 and 1}\n\n' +
    "Rules:\n" +
    "- If the deck clearly answers the question: escalate=false, confidence>=0.7, " +
    "slide_ref=the 1-indexed slide, answer=a plain 1-2 sentence answer in a human, non-salesy voice.\n" +
    "- If the question needs anything not in the deck (exact contract terms, custom " +
    "pricing, security/compliance detail, unstated timelines, or anything you're not " +
    "confident about): escalate=true, confidence<0.5, slide_ref=null, and " +
    `answer="Good question — let me get ${repName} to answer that directly for you."`;

  const raw = await callLLM(system, question, 400);
  const parsed = JSON.parse(raw) as AskResult;
  return {
    escalate: Boolean(parsed.escalate),
    answer: parsed.answer ?? escalationLine(repName),
    slide_ref: parsed.slide_ref ?? null,
    confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0,
  };
}

export function escalationLine(repName: string): string {
  return `Good question — let me get ${repName} to answer that directly for you.`;
}

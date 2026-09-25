export {
  tokenize,
  timeTokens,
  tokenIndexAtOffset,
  tokensFromCharacterAlignment,
  getActiveTokenIndex,
  scaleTokensToAudioDuration,
  AUDIO_SYNC_LEAD_MS,
  type Token,
  type TokenTimingSource,
  type CharacterAlignment,
} from "./word-timing";

export { extractEssentialPoints } from "./essential-points";
export { draftPitchLine, type PitchDraftInput } from "./draft-pitch";
export {
  refineScript,
  shortenLine,
  punchLine,
  regenerateLine,
  type RefineMode,
  type RefineInput,
} from "./refine-script";

export {
  structureSlideContent,
  extractiveFallback,
  chartBridgeFallback,
  detectChartFromOcr,
  isChartHeavySlide,
  isNoisyVisualSlide,
  assertFingerprintMatch,
  mergeRunsToLines,
  type SlideContent,
  type TextRun,
  type ExtractionMethod,
  type GenerationMethod,
  type NarrationResult,
} from "./slide-content";

export {
  checkNarrationNumbers,
  extractNumbers,
  normalizeNumber,
  slideSourceText,
  slideSourceTextForNumberCheck,
  stripAxisNoise,
  type NumberCheckResult,
} from "./number-check";

export {
  reconcileTextAndOcr,
  textOverlapRatio,
  type TextOcrReconcileResult,
} from "./reconcile-text-ocr";

export {
  buildLabeledFacts,
  checkYearValuePairings,
  factsFromBodyLines,
  factsFromChartClusters,
  verifyCitedDataPoints,
  type ChartDataPoint,
} from "./labeled-facts";

export {
  buildVisionRequest,
  parseVisionResponse,
  pickSlideText,
  isGoodEnough,
  ocrQuality,
  visionCachePath,
  VisionResponseError,
  VISION_MIN_CHARS,
  type VisionOcrResult,
  type SlideTextPick,
} from "./ocr-fallback";

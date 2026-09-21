/**
 * Post-generation gate: every number stated in narration must appear in the
 * slide's source text. Catches pure fabrication; not year/series mispairing.
 * Digits and common spoken forms ("seventy-five percent") are both checked.
 */

export type NumberCheckResult = {
  passed: boolean;
  narrationNumbers: string[];
  unmatchedNumbers: string[];
  sourceNumbers: string[];
};

const NUMBER_RE =
  /\$?\d[\d,]*(?:\.\d+)?(?:\s*(?:billion|million|thousand)|(?:[BMK](?![a-zA-Z]))|%)?\+?/gi;

const ONES: Record<string, number> = {
  zero: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
};

const TENS: Record<string, number> = {
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90,
};

function expandMultiplier(raw: string): string {
  let s = raw.trim().replace(/[$,\s]/g, "").replace(/\.$/, "");
  if (/billion$/i.test(s)) return s.replace(/billion$/i, "000000000");
  if (/million$/i.test(s)) return s.replace(/million$/i, "000000");
  if (/thousand$/i.test(s)) return s.replace(/thousand$/i, "000");
  if (/b\+?$/i.test(s)) return s.replace(/b\+?$/i, "000000000");
  if (/m\+?$/i.test(s)) return s.replace(/m\+?$/i, "000000");
  if (/k\+?$/i.test(s)) return s.replace(/k\+?$/i, "000");
  return s;
}

/** Normalize formatting so "$8B", "8 billion", "8,000,000,000" share a key. */
export function normalizeNumber(raw: string): string {
  return expandMultiplier(raw).toLowerCase();
}

/** Parse spoken number phrases into digit keys (with optional %). */
function extractSpokenNumbers(text: string): string[] {
  const lower = text.toLowerCase();
  const out: string[] = [];

  // "seventy-five percent" / "one hundred percent" / "fifty percent"
  const pctRe =
    /\b(?:(one)\s+hundred|(?:(twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)(?:[-\s]+(one|two|three|four|five|six|seven|eight|nine))?)|(ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|zero|one|two|three|four|five|six|seven|eight|nine))\s+percent\b/g;
  let m: RegExpExecArray | null;
  while ((m = pctRe.exec(lower))) {
    let n = 0;
    if (m[1]) n = 100;
    else if (m[2]) {
      n = TENS[m[2]] ?? 0;
      if (m[3]) n += ONES[m[3]] ?? 0;
    } else if (m[4]) n = ONES[m[4]] ?? 0;
    out.push(`${n}%`);
  }

  // "week four" / "week six" / "first two weeks" → bare week indices
  const weekRe =
    /\b(?:week|weeks)\s+(one|two|three|four|five|six|seven|eight|nine|ten|\d+)\b|\b(first|second|third)\s+(one|two|three|four|five|six|seven|eight|nine|ten|\d+)\s+weeks?\b/g;
  while ((m = weekRe.exec(lower))) {
    const raw = m[1] ?? m[3];
    if (!raw) continue;
    const n = ONES[raw] ?? (/^\d+$/.test(raw) ? Number(raw) : NaN);
    if (!Number.isNaN(n)) out.push(String(n));
  }

  // "two million" / "twenty-three million" / "fifty billion"
  const scaleRe =
    /\b(?:(twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)(?:[-\s]+(one|two|three|four|five|six|seven|eight|nine))?|(ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|one|two|three|four|five|six|seven|eight|nine))\s+(million|billion|thousand)\b/g;
  while ((m = scaleRe.exec(lower))) {
    let n = 0;
    if (m[1]) {
      n = TENS[m[1]] ?? 0;
      if (m[2]) n += ONES[m[2]] ?? 0;
    } else if (m[3]) n = ONES[m[3]] ?? 0;
    const scale = m[4];
    const key = normalizeNumber(`${n}${scale === "billion" ? "B" : scale === "million" ? "M" : "K"}`);
    out.push(key);
  }

  return out;
}

export function extractNumbers(text: string): string[] {
  const digitMatches = text.match(NUMBER_RE) || [];
  const digits = digitMatches.map((m) => normalizeNumber(m)).filter(Boolean);
  const spoken = extractSpokenNumbers(text);
  return [...new Set([...digits, ...spoken])];
}

/**
 * Strip chart axis ladders (0/25/50/75/100%) and bare "Week N" labels so
 * tick marks cannot launder fabricated series values through the number check.
 */
export function stripAxisNoise(text: string): string {
  return text
    .replace(
      /(?:^|\s)(?:0%|25%|50%|75%|100%)(?:\s+(?:0%|25%|50%|75%|100%))+/gi,
      " ",
    )
    .replace(/\bWeek\s*\d+\b/gi, " ")
    .replace(/\bW\d+\b/gi, " ");
}

/**
 * Build the source string for checks: title + body + chart clusters + footnotes.
 * Prefer this over narration-only context.
 */
export function slideSourceText(slide: {
  titleText?: string | null;
  bodyText?: string[];
  possibleChartRegions?: string[][];
  imageCaptions?: string[];
  footnotes?: string[];
  flatText?: string;
}): string {
  if (slide.flatText?.trim()) return slide.flatText;
  const parts = [
    slide.titleText ?? "",
    ...(slide.bodyText ?? []),
    ...(slide.possibleChartRegions ?? []).flat(),
    ...(slide.imageCaptions ?? []),
    ...(slide.footnotes ?? []),
  ];
  return parts.filter(Boolean).join("\n");
}

/** Source text used for the number gate (axis ticks / week labels removed). */
export function slideSourceTextForNumberCheck(slide: {
  titleText?: string | null;
  bodyText?: string[];
  possibleChartRegions?: string[][];
  imageCaptions?: string[];
  footnotes?: string[];
  flatText?: string;
}): string {
  return stripAxisNoise(slideSourceText(slide));
}

export function checkNarrationNumbers(
  narration: string,
  slideSource: string,
): NumberCheckResult {
  const narrationNumbers = extractNumbers(narration);
  const sourceList = extractNumbers(stripAxisNoise(slideSource));
  const sourceNumbers = new Set(sourceList);

  const unmatchedNumbers = narrationNumbers.filter((n) => !sourceNumbers.has(n));

  return {
    passed: unmatchedNumbers.length === 0,
    narrationNumbers,
    unmatchedNumbers,
    sourceNumbers: sourceList,
  };
}

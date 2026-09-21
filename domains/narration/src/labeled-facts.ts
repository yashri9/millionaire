/**
 * Labeled metric facts for grounding — (series, label, value) triples.
 * Used in prompts and post-generation citation verification.
 */

export type ChartDataPoint = {
  series: string;
  label: string;
  value: string;
};

const YEAR_RE = /\(?\s*(20\d{2}(?:\s*proj\.?)?)\s*\)?/i;
const VALUE_RE = /^[~≈]?\$?\d[\d,.]*(?:\s?[BMK]%?)?%?$|^\$?\d[\d,.]*\s*(?:mn|bn)?$/i;
const PAGE_NUM_RE = /^\d{1,2}$/;

function norm(s: string): string {
  return s.replace(/\s+/g, " ").trim().toLowerCase();
}

function normValue(s: string): string {
  return s
    .replace(/\s+/g, "")
    .replace(/,/g, "")
    .replace(/≈/g, "~")
    .toLowerCase();
}

function normLabel(s: string): string {
  return s
    .replace(/[()]/g, "")
    .replace(/\s+/g, " ")
    .replace(/proj\.?/i, "proj")
    .trim()
    .toLowerCase();
}

/** Turn spatial chart clusters into labeled triples when year/value co-occur. */
export function factsFromChartClusters(
  clusters: string[][],
  defaultSeries: string,
): ChartDataPoint[] {
  const out: ChartDataPoint[] = [];
  for (const group of clusters) {
    if (!group?.length) continue;
    const yearTok = group.find((t) => YEAR_RE.test(t));
    const label = yearTok
      ? (yearTok.match(YEAR_RE)?.[1] ?? yearTok).trim()
      : "point";
    for (const tok of group) {
      if (yearTok && tok === yearTok) continue;
      if (PAGE_NUM_RE.test(tok.trim())) continue;
      if (!VALUE_RE.test(tok.trim()) && !/[%$]|\d/.test(tok)) continue;
      // Skip pure YoY labels without a leading magnitude already captured
      if (/^(YoY|MoM|CAGR)$/i.test(tok.trim())) continue;
      out.push({
        series: defaultSeries,
        label,
        value: tok.trim(),
      });
    }
  }
  return out;
}

/**
 * Pull labeled facts from body lines — ranges, "Database of 200K", "$2/user", etc.
 */
export function factsFromBodyLines(
  bodyText: string[],
  titleText: string | null,
): ChartDataPoint[] {
  const seriesBase = titleText?.trim() || "metric";
  const out: ChartDataPoint[] = [];

  for (const raw of bodyText) {
    const line = raw.replace(/\s+/g, " ").trim();
    if (!line || PAGE_NUM_RE.test(line)) continue;

    // "0 - 20,000 active resellers" / "20,000 - 2M active resellers"
    const range = line.match(
      /^([\d,.~]+)\s*[–-]\s*([\d,.~]+(?:\s*[BMK])?)\s+(.+)$/i,
    );
    if (range) {
      out.push({
        series: range[3].trim(),
        label: `${range[1].trim()}-${range[2].trim()}`,
        value: `${range[1].trim()}-${range[2].trim()}`,
      });
      continue;
    }

    // "Database of 200K Resellers" / "Database of200KResellers"
    const db = line.match(/database\s*of\s*([\d,.]+ ?[BMK]?)\s*(.*)?/i);
    if (db) {
      out.push({
        series: "Database of Resellers",
        label: "size",
        value: db[1].replace(/\s+/g, ""),
      });
      continue;
    }

    // "$2/ transacting user"
    const per = line.match(/(\$[\d,.]+)\s*\/\s*(.+)/i);
    if (per) {
      out.push({
        series: per[2].trim(),
        label: "unit cost",
        value: per[1].trim(),
      });
      continue;
    }

    // "2M (2017)" style already handled by clusters; also "65% YoY"
    const withYear = line.match(
      /^([~$]?[\d,.]+[BMK%]?)\s*\((20\d{2}[^)]*)\)\s*(.*)?$/i,
    );
    if (withYear) {
      out.push({
        series: (withYear[3] || seriesBase).trim() || seriesBase,
        label: withYear[2].trim(),
        value: withYear[1].trim(),
      });
    }
  }

  return out;
}

/** Merge cluster + body facts; de-dupe by series|label|value. */
export function buildLabeledFacts(input: {
  titleText: string | null;
  bodyText: string[];
  possibleChartRegions: string[][];
}): ChartDataPoint[] {
  const series = input.titleText?.trim() || "metric";
  const fromCharts = factsFromChartClusters(input.possibleChartRegions, series);
  const fromBody = factsFromBodyLines(input.bodyText, input.titleText);
  const seen = new Set<string>();
  const out: ChartDataPoint[] = [];
  for (const f of [...fromCharts, ...fromBody]) {
    const key = `${norm(f.series)}|${normLabel(f.label)}|${normValue(f.value)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(f);
  }
  return out.slice(0, 40);
}

function valuesLooselyEqual(a: string, b: string): boolean {
  const na = normValue(a);
  const nb = normValue(b);
  if (na === nb) return true;
  // 2M vs 2,000,000 / 200K vs 200000
  const expand = (s: string) =>
    s
      .replace(/b$/i, "000000000")
      .replace(/m$/i, "000000")
      .replace(/k$/i, "000");
  return expand(na) === expand(nb);
}

/** Returns cited points that do not match any source triple. */
export function verifyCitedDataPoints(
  cited: ChartDataPoint[],
  sourceData: ChartDataPoint[],
): ChartDataPoint[] {
  if (!cited?.length) return [];
  return cited.filter(
    (c) =>
      !sourceData.some(
        (s) =>
          (norm(s.series) === norm(c.series) ||
            norm(s.series).includes(norm(c.series)) ||
            norm(c.series).includes(norm(s.series)) ||
            norm(c.series) === "metric" ||
            norm(s.series) === "metric") &&
          (normLabel(s.label) === normLabel(c.label) ||
            normLabel(s.label).includes(normLabel(c.label)) ||
            normLabel(c.label).includes(normLabel(s.label))) &&
          valuesLooselyEqual(s.value, c.value),
      ),
  );
}

/**
 * Catch year↔value conflation via local associations in the narration
 * ("2M in 2017", "from zero in 2014 to 23M by 2022") — not a full cross-product.
 */
export function checkYearValuePairings(
  narration: string,
  sourceData: ChartDataPoint[],
): { passed: boolean; badPairs: { year: string; value: string }[] } {
  const claimed = extractClaimedYearValuePairs(narration);
  if (!claimed.length) return { passed: true, badPairs: [] };

  const badPairs: { year: string; value: string }[] = [];
  for (const { year, value } of claimed) {
    const yearFacts = sourceData.filter((s) =>
      normLabel(s.label).includes(year),
    );
    if (!yearFacts.length) continue;

    const okHere = yearFacts.some((s) => valuesLooselyEqual(s.value, value));
    if (okHere) continue;

    const knownElsewhere = sourceData.some(
      (s) =>
        valuesLooselyEqual(s.value, value) &&
        /\d{4}/.test(s.label) &&
        !normLabel(s.label).includes(year),
    );
    if (knownElsewhere) badPairs.push({ year, value });
  }

  const seen = new Set<string>();
  const uniq = badPairs.filter((p) => {
    const k = `${p.year}|${p.value}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  return { passed: uniq.length === 0, badPairs: uniq };
}

const SPOKEN_VALUES: { re: RegExp; digit: string }[] = [
  { re: /twenty[-\s]?three\s+million/i, digit: "23M" },
  { re: /two\s+million/i, digit: "2M" },
  { re: /fifty\s+billion/i, digit: "50B" },
  { re: /eight[-\s]?billion|\$?\s*eight\s+billion/i, digit: "8B" },
  { re: /\b(?:near[-\s]?)?zero\b/i, digit: "~0" },
];

function extractClaimedYearValuePairs(
  narration: string,
): { year: string; value: string }[] {
  const pairs: { year: string; value: string }[] = [];
  const text = narration;

  const push = (year: string, value: string) => {
    if (year && value) pairs.push({ year, value });
  };

  // "2M in 2017" / "$8B by 2022" / "23 million in 2022"
  const digitYear =
    /(\$?\d[\d,]*(?:\.\d+)?\s?(?:billion|million|thousand|[BMK])?)\s*(?:in|by|as of|during|from)?\s*(20\d{2})/gi;
  let m: RegExpExecArray | null;
  while ((m = digitYear.exec(text))) push(m[2], m[1].trim());

  // "in 2017 … 2M" within a short window — handled via spoken + "from X in YEAR"
  const fromIn =
    /from\s+([^,]{0,40}?)\s+in\s+(20\d{2})\s+to\s+([^,]{0,40}?)\s+(?:by|in)\s+(20\d{2})/gi;
  while ((m = fromIn.exec(text))) {
    const v1 = resolveSpokenOrDigit(m[1]);
    const v2 = resolveSpokenOrDigit(m[3]);
    if (v1) push(m[2], v1);
    if (v2) push(m[4], v2);
  }

  // "two million in 2017" / "twenty-three million by 2022"
  for (const { re, digit } of SPOKEN_VALUES) {
    const wrapped = new RegExp(
      `${re.source}\\s*(?:in|by|as of|during)?\\s*(20\\d{2})`,
      "gi",
    );
    while ((m = wrapped.exec(text))) push(m[1], digit);
  }

  // "in 2014 to twenty-three million" — weaker; skip
  return pairs;
}

function resolveSpokenOrDigit(fragment: string): string | null {
  const f = fragment.trim();
  for (const { re, digit } of SPOKEN_VALUES) {
    if (re.test(f)) return digit;
  }
  const d = f.match(/\$?\d[\d,]*(?:\.\d+)?\s?(?:billion|million|thousand|[BMK])?/i);
  return d ? d[0].trim() : null;
}

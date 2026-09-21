/**
 * Pull the pitch-worthy essentials from slide text so narration can sell
 * the point instead of reading the page aloud.
 */

const NOISE =
  /^(confidential|internal|draft|slide\s*\d+|page\s*\d+|agenda|table of contents|contents|©|www\.|http)/i;

const FILLER =
  /\b(as you can see|click here|lorem ipsum|placeholder|insert text)\b/i;

/** Prefer claims with numbers, $, %, outcomes, or short punchy bullets. */
function scoreFragment(s: string): number {
  let score = 0;
  if (/\d/.test(s)) score += 3;
  if (/[$%€£]/.test(s)) score += 3;
  if (/\b(roi|arr|mrr|nrr|cac|ltv|pipeline|close|win|save|cut|grow|faster|reduce)\b/i.test(s))
    score += 2;
  if (/\b(customer|buyer|prospect|team|revenue|cost|time|risk)\b/i.test(s)) score += 1;
  if (s.length >= 12 && s.length <= 110) score += 1;
  if (s.length > 140) score -= 2;
  if (NOISE.test(s) || FILLER.test(s)) score -= 5;
  return score;
}

function splitCandidates(pageText: string): string[] {
  const raw = pageText.replace(/\s+/g, " ").trim();
  if (!raw) return [];

  const byBreak = pageText
    .split(/\n+|•|\u2022|;|\|(?=\s)/)
    .map((s) => s.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  const bySentence = raw
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const merged = [...byBreak, ...bySentence];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of merged) {
    const cleaned = item
      .replace(/^[\d.\-–—*)\]]+\s*/, "")
      .replace(/^#{1,6}\s*/, "")
      .trim();
    if (cleaned.length < 8 || cleaned.length > 160) continue;
    const key = cleaned.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(cleaned);
  }
  return out;
}

/**
 * Rank and return up to `limit` essential pitch points from slide text.
 * Title (if useful) is preferred as the first point.
 */
export function extractEssentialPoints(
  pageText: string,
  opts?: { title?: string; limit?: number },
): string[] {
  const limit = opts?.limit ?? 4;
  const title = (opts?.title ?? "").trim();
  const candidates = splitCandidates(pageText);
  const scored = candidates
    .map((text) => ({ text, score: scoreFragment(text) }))
    .filter((c) => c.score > 0)
    .sort((a, b) => b.score - a.score);

  const points: string[] = [];
  const seen = new Set<string>();

  if (title && title.length >= 3 && title.length <= 90 && !NOISE.test(title)) {
    const key = title.toLowerCase();
    seen.add(key);
    points.push(title);
  }

  for (const c of scored) {
    if (points.length >= limit) break;
    const key = c.text.toLowerCase();
    if (seen.has(key)) continue;
    // Skip near-duplicates of the title
    if (title && key.includes(title.toLowerCase()) && c.text.length < title.length + 8) continue;
    seen.add(key);
    points.push(c.text);
  }

  if (points.length === 0 && pageText.trim()) {
    const fallback = pageText.replace(/\s+/g, " ").trim().slice(0, 120);
    if (fallback) points.push(fallback);
  }

  return points.slice(0, limit);
}

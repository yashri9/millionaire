"use client";

import { useMemo } from "react";
import type { SlideWord } from "@/lib/deck-store";
import { tokenize } from "@/lib/word-timing";

const STOP = new Set([
  "the","a","an","and","or","but","of","to","in","on","for","with","at","by",
  "is","are","was","were","be","been","it","this","that","these","those",
  "i","you","we","they","he","she","him","her","us","them","my","your","our",
  "so","as","if","then","than","from","into","about","just","will","can","do","did",
  "have","has","had","not","no","yes","up","down","out","over","under","also","only",
  "am","me","its","their","which","what","when","where","why","how","there","here",
]);

function norm(w: string) {
  return w.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
}

/** Small Levenshtein for short words — cheap enough at slide sizes. */
function lev(a: string, b: string): number {
  if (a === b) return 0;
  const al = a.length, bl = b.length;
  if (al === 0) return bl;
  if (bl === 0) return al;
  const prev = new Array(bl + 1).fill(0).map((_, i) => i);
  const cur = new Array(bl + 1).fill(0);
  for (let i = 1; i <= al; i++) {
    cur[0] = i;
    for (let j = 1; j <= bl; j++) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      cur[j] = Math.min(cur[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j <= bl; j++) prev[j] = cur[j];
  }
  return prev[bl];
}

/**
 * Fuzzy similarity between a spoken script token and a PDF word (both normalized).
 * Returns a score in [0,1]; anything below 0.6 is treated as no match.
 * Handles: exact match, substring (handles "MyTrips" vs "trips"),
 * and small edit distance for typos/plurals.
 */
function score(spoken: string, pdf: string): number {
  if (!spoken || !pdf) return 0;
  if (spoken === pdf) return 1;
  // substring — one contains the other, useful for compound words / stems
  if (spoken.length >= 3 && pdf.includes(spoken)) return 0.9;
  if (pdf.length >= 3 && spoken.includes(pdf)) return 0.85;
  // shared prefix (plural/tense/possessive)
  const minLen = Math.min(spoken.length, pdf.length);
  if (minLen >= 4) {
    let p = 0;
    while (p < minLen && spoken[p] === pdf[p]) p++;
    if (p >= Math.max(4, minLen - 2)) return 0.75;
  }
  // small edit distance for typos, only for longer words
  const maxLen = Math.max(spoken.length, pdf.length);
  if (maxLen >= 5) {
    const d = lev(spoken, pdf);
    if (d <= 1) return 0.8;
    if (d <= 2 && maxLen >= 7) return 0.65;
  }
  return 0;
}

export type AutoWordHighlight = {
  key: string;
  x: number; y: number; w: number; h: number;
};

/**
 * Precomputes an alignment plan: for each script token index, the list of PDF
 * word indices that best match it. Each PDF word is assigned to at most one
 * script token (its best match), so each PDF word lights up exactly once.
 */
function buildPlan(script: string, slideWords: SlideWord[]): Map<number, number[]> {
  const plan = new Map<number, number[]>();
  const toks = tokenize(script);
  if (toks.length === 0 || slideWords.length === 0) return plan;

  const spokenNorm = toks.map((t) => norm(t.text));

  slideWords.forEach((sw, wi) => {
    const nw = norm(sw.text);
    if (!nw || nw.length < 2) return;
    let bestIdx = -1;
    let bestScore = 0.6; // threshold
    for (let ti = 0; ti < spokenNorm.length; ti++) {
      const sp = spokenNorm[ti];
      if (!sp || sp.length < 2 || STOP.has(sp)) continue;
      const s = score(sp, nw);
      if (s > bestScore) { bestScore = s; bestIdx = ti; }
    }
    if (bestIdx >= 0) {
      const arr = plan.get(bestIdx) ?? [];
      arr.push(wi);
      plan.set(bestIdx, arr);
    }
  });

  return plan;
}

/**
 * Given the currently-spoken script token index, return bboxes for every PDF
 * word aligned to that token — or to a recent nearby token (short hold window
 * so highlights don't strobe as the narration steps forward one word at a time).
 */
export function useAutoWordHighlights(
  script: string,
  speakingIdx: number,
  slideWords: SlideWord[] | undefined,
  holdTokens = 2,
): AutoWordHighlight[] {
  const plan = useMemo(
    () => buildPlan(script, slideWords ?? []),
    [script, slideWords],
  );

  return useMemo(() => {
    if (!slideWords || speakingIdx < 0) return [];
    const out: AutoWordHighlight[] = [];
    const seen = new Set<number>();
    for (let ti = Math.max(0, speakingIdx - holdTokens); ti <= speakingIdx; ti++) {
      const wis = plan.get(ti);
      if (!wis) continue;
      for (const wi of wis) {
        if (seen.has(wi)) continue;
        seen.add(wi);
        const sw = slideWords[wi];
        if (!sw) continue;
        out.push({ key: `${wi}`, x: sw.x, y: sw.y, w: sw.w, h: sw.h });
      }
    }
    return out;
  }, [plan, speakingIdx, slideWords, holdTokens]);
}

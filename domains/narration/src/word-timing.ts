// Pure functions for turning a script into timed word tokens.
// Prefer real TTS character/word alignment when available; fall back to
// syllable-weighted estimates stretched to the actual audio duration.

export type TokenTimingSource = "provider" | "forced_alignment" | "estimated";

export type Token = {
  /** Stable id for this occurrence (not just the word text). */
  id: string;
  index: number;
  text: string;
  /** Lowercased alphanumeric form for matching. */
  normalizedText: string;
  start: number; // char offset in original script (start of word)
  end: number; // char offset exclusive
  startMs: number;
  endMs: number;
  source: TokenTimingSource;
};

export type CharacterAlignment = {
  characters: string[];
  characterStartTimesSeconds: number[];
  characterEndTimesSeconds: number[];
};

/**
 * Highlight look-ahead (ms). Visual “current word” feels late if we use raw
 * audio.currentTime — MP3 buffering + perception. A small lead keeps the
 * karaoke highlight on the word being heard.
 */
export const AUDIO_SYNC_LEAD_MS = 120;

const VOWEL_GROUP = /[aeiouy]+/gi;

function syllables(word: string): number {
  const w = word.toLowerCase().replace(/[^a-z]/g, "");
  if (!w) return 1;
  const m = w.match(VOWEL_GROUP);
  return Math.max(1, m ? m.length : 1);
}

function normalizeWord(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function makeId(index: number, text: string): string {
  return `w${index}:${normalizeWord(text) || "tok"}`;
}

/** Split a script into word tokens with char offsets. Whitespace is skipped. */
export function tokenize(script: string): Omit<Token, "startMs" | "endMs" | "source" | "id" | "normalizedText">[] {
  const tokens: Omit<Token, "startMs" | "endMs" | "source" | "id" | "normalizedText">[] = [];
  const re = /\S+/g;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(script)) !== null) {
    tokens.push({ index: i++, text: m[0], start: m.index, end: m.index + m[0].length });
  }
  return tokens;
}

function wordRunsFromAlignment(alignment: CharacterAlignment): {
  startSec: number;
  endSec: number;
}[] {
  const { characters, characterStartTimesSeconds, characterEndTimesSeconds } = alignment;
  const runs: { startSec: number; endSec: number }[] = [];
  let cur: { startSec: number; endSec: number } | null = null;

  for (let i = 0; i < characters.length; i++) {
    const ch = characters[i]!;
    if (/\s/.test(ch)) {
      if (cur) {
        runs.push(cur);
        cur = null;
      }
      continue;
    }
    const s = characterStartTimesSeconds[i] ?? 0;
    const e = characterEndTimesSeconds[i] ?? s;
    if (!cur) cur = { startSec: s, endSec: e };
    else cur.endSec = Math.max(cur.endSec, e);
  }
  if (cur) runs.push(cur);
  return runs;
}

function tokensFromRuns(
  script: string,
  runs: { startSec: number; endSec: number }[],
): Token[] | null {
  const base = tokenize(script);
  if (base.length === 0) return [];
  if (runs.length !== base.length) return null;

  return base.map((t, i) => {
    const hit = runs[i]!;
    return {
      ...t,
      id: makeId(t.index, t.text),
      normalizedText: normalizeWord(t.text),
      startMs: Math.max(0, hit.startSec) * 1000,
      endMs: Math.max(hit.startSec, hit.endSec) * 1000,
      source: "provider" as const,
    };
  });
}

/**
 * Build word tokens from ElevenLabs (or similar) character-level alignment.
 * Tries 1:1 script mapping, then whitespace-collapsed, then ordered word-runs.
 */
export function tokensFromCharacterAlignment(
  script: string,
  alignment: CharacterAlignment,
): Token[] | null {
  const { characters, characterStartTimesSeconds, characterEndTimesSeconds } = alignment;
  if (
    !characters?.length ||
    characters.length !== characterStartTimesSeconds.length ||
    characters.length !== characterEndTimesSeconds.length
  ) {
    return null;
  }

  const base = tokenize(script);
  if (base.length === 0) return [];

  const alignedText = characters.join("");

  // 1:1 with script
  if (alignedText === script) {
    return base.map((t) => {
      const startSec = characterStartTimesSeconds[t.start] ?? 0;
      const endIdx = Math.max(t.start, Math.min(t.end - 1, characters.length - 1));
      const endSec = characterEndTimesSeconds[endIdx] ?? startSec;
      return {
        ...t,
        id: makeId(t.index, t.text),
        normalizedText: normalizeWord(t.text),
        startMs: Math.max(0, startSec) * 1000,
        endMs: Math.max(startSec, endSec) * 1000,
        source: "provider" as const,
      };
    });
  }

  // Ordered non-whitespace runs (works when punctuation/spacing differs slightly)
  const fromRuns = tokensFromRuns(script, wordRunsFromAlignment(alignment));
  if (fromRuns) return fromRuns;

  return null;
}

/** Stretch/compress token times so the last end matches real audio duration. */
export function scaleTokensToAudioDuration(
  tokens: Token[],
  audioDurationSec: number,
): Token[] {
  if (!tokens.length || !(audioDurationSec > 0)) return tokens;
  const lastEndSec = tokens[tokens.length - 1]!.endMs / 1000;
  if (!(lastEndSec > 0.05)) return tokens;
  const ratio = audioDurationSec / lastEndSec;
  // Ignore tiny drift; fix meaningful mismatch (common with MP3 vs alignment clock)
  if (Math.abs(ratio - 1) < 0.015) return tokens;
  return tokens.map((t) => ({
    ...t,
    startMs: t.startMs * ratio,
    endMs: t.endMs * ratio,
  }));
}

/**
 * Estimated alignment: syllable + punctuation-aware weights stretched to
 * the real audio duration. Marked source:"estimated".
 */
export function timeTokens(script: string, durationSec: number): Token[] {
  const base = tokenize(script);
  if (base.length === 0) return [];

  const weights = base.map((t) => {
    let w = syllables(t.text) + Math.min(4, t.text.length) * 0.15;
    if (/[,;:]$/.test(t.text)) w += 0.55;
    if (/[.!?]"?$/.test(t.text)) w += 1.1;
    if (/\d/.test(t.text)) w += 0.4;
    return Math.max(0.35, w);
  });
  const totalW = weights.reduce((a, b) => a + b, 0) || 1;
  const totalMs = Math.max(500, durationSec * 1000);
  let cursor = 0;
  return base.map((t, i) => {
    const dur = (weights[i]! / totalW) * totalMs;
    const startMs = cursor;
    const endMs = cursor + dur;
    cursor = endMs;
    return {
      ...t,
      id: makeId(t.index, t.text),
      normalizedText: normalizeWord(t.text),
      startMs,
      endMs,
      source: "estimated" as const,
    };
  });
}

/**
 * Active token from audio time (seconds).
 * Applies AUDIO_SYNC_LEAD_MS so the highlight tracks what the listener hears.
 * In inter-word gaps, switches at the midpoint (no lingering on the past word).
 */
export function getActiveTokenIndex(
  tokens: Token[],
  currentTimeSec: number,
  leadMs: number = AUDIO_SYNC_LEAD_MS,
): number {
  if (!tokens.length) return -1;
  const tMs = currentTimeSec * 1000 + leadMs;

  if (tMs < tokens[0]!.startMs) {
    // Snap to first word just before it starts (same lead window)
    if (tMs >= tokens[0]!.startMs - leadMs) return 0;
    return -1;
  }

  let lo = 0;
  let hi = tokens.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const tok = tokens[mid]!;
    if (tMs < tok.startMs) hi = mid - 1;
    else if (tMs >= tok.endMs) lo = mid + 1;
    else return mid;
  }

  // Gap between hi (finished) and lo (upcoming)
  if (hi >= 0 && lo < tokens.length) {
    const prev = tokens[hi]!;
    const next = tokens[lo]!;
    const midGap = (prev.endMs + next.startMs) / 2;
    return tMs >= midGap ? lo : hi;
  }

  if (lo >= tokens.length) return tokens.length - 1;
  return hi >= 0 ? hi : -1;
}

/** Find the smallest token index whose word range contains the char offset. */
export function tokenIndexAtOffset(script: string, offset: number): number {
  const toks = tokenize(script);
  for (const t of toks) {
    if (offset >= t.start && offset <= t.end) return t.index;
  }
  let last = -1;
  for (const t of toks) if (t.end <= offset) last = t.index;
  return last;
}

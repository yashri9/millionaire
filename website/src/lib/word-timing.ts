// Pure functions for turning a script into timed word tokens.
// Deterministic so scrubbing is stable. Weight each token by rough syllable
// count so long words don't fly past. Swap-in point for real TTS timestamps.

export type Token = {
  index: number;       // token index in the whole script
  text: string;        // display text (word only, no leading space)
  start: number;       // char offset in original script (start of word)
  end: number;         // char offset in original script (end of word, exclusive)
  startMs: number;     // ms into the slide when this word begins
  endMs: number;       // ms into the slide when this word ends
};

const VOWEL_GROUP = /[aeiouy]+/gi;

function syllables(word: string): number {
  const w = word.toLowerCase().replace(/[^a-z]/g, "");
  if (!w) return 1;
  const m = w.match(VOWEL_GROUP);
  return Math.max(1, m ? m.length : 1);
}

/** Split a script into word tokens with char offsets. Whitespace is skipped. */
export function tokenize(script: string): Omit<Token, "startMs" | "endMs">[] {
  const tokens: Omit<Token, "startMs" | "endMs">[] = [];
  const re = /\S+/g;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(script)) !== null) {
    tokens.push({ index: i++, text: m[0], start: m.index, end: m.index + m[0].length });
  }
  return tokens;
}

/** Distribute a slide's duration across its tokens, weighted by syllables. */
export function timeTokens(script: string, durationSec: number): Token[] {
  const base = tokenize(script);
  if (base.length === 0) return [];
  const weights = base.map((t) => syllables(t.text));
  const totalW = weights.reduce((a, b) => a + b, 0) || 1;
  const totalMs = Math.max(500, durationSec * 1000);
  let cursor = 0;
  return base.map((t, i) => {
    const w = weights[i] / totalW;
    const dur = w * totalMs;
    const startMs = cursor;
    const endMs = cursor + dur;
    cursor = endMs;
    return { ...t, startMs, endMs };
  });
}

/** Find the smallest token index whose word range [start, end] wholly
 * contains the given char offset. Returns -1 if none. */
export function tokenIndexAtOffset(script: string, offset: number): number {
  const toks = tokenize(script);
  for (const t of toks) {
    if (offset >= t.start && offset <= t.end) return t.index;
  }
  // Fallback: nearest previous token
  let last = -1;
  for (const t of toks) if (t.end <= offset) last = t.index;
  return last;
}

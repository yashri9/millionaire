import test from "node:test";
import assert from "node:assert/strict";
import {
  tokenize,
  timeTokens,
  tokenIndexAtOffset,
  tokensFromCharacterAlignment,
  getActiveTokenIndex,
} from "./word-timing.ts";

test("tokenize splits words and keeps offsets", () => {
  const toks = tokenize("Hello world");
  assert.equal(toks.length, 2);
  assert.equal(toks[0]!.text, "Hello");
  assert.equal(toks[0]!.start, 0);
  assert.equal(toks[1]!.text, "world");
});

test("timeTokens covers the full duration", () => {
  const toks = timeTokens("one two three", 3);
  assert.equal(toks.length, 3);
  assert.ok(toks[0]!.startMs >= 0);
  assert.ok(toks[toks.length - 1]!.endMs >= 3000 - 1);
  assert.equal(toks[0]!.source, "estimated");
});

test("tokenIndexAtOffset finds containing word", () => {
  const script = "alpha beta";
  assert.equal(tokenIndexAtOffset(script, 0), 0);
  assert.equal(tokenIndexAtOffset(script, 6), 1);
});

test("tokensFromCharacterAlignment maps 1:1 script", () => {
  const script = "We secured LLC";
  const chars = [...script];
  const alignment = {
    characters: chars,
    characterStartTimesSeconds: chars.map((_, i) => i * 0.1),
    characterEndTimesSeconds: chars.map((_, i) => i * 0.1 + 0.09),
  };
  const toks = tokensFromCharacterAlignment(script, alignment);
  assert.ok(toks);
  assert.equal(toks!.length, 3);
  assert.equal(toks![0]!.text, "We");
  assert.equal(toks![0]!.source, "provider");
  assert.ok(toks![2]!.startMs > toks![0]!.startMs);
});

test("getActiveTokenIndex respects pauses", () => {
  const toks = [
    {
      id: "w0",
      index: 0,
      text: "A",
      normalizedText: "a",
      start: 0,
      end: 1,
      startMs: 0,
      endMs: 500,
      source: "provider" as const,
    },
    {
      id: "w1",
      index: 1,
      text: "B",
      normalizedText: "b",
      start: 2,
      end: 3,
      startMs: 1000,
      endMs: 1500,
      source: "provider" as const,
    },
  ];
  // lead=0 for deterministic unit tests
  assert.equal(getActiveTokenIndex(toks, 0.2, 0), 0);
  assert.equal(getActiveTokenIndex(toks, 0.6, 0), 0); // before gap midpoint
  assert.equal(getActiveTokenIndex(toks, 0.8, 0), 1); // past midpoint → next
  assert.equal(getActiveTokenIndex(toks, 1.2, 0), 1);
});

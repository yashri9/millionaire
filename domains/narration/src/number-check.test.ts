import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  checkNarrationNumbers,
  extractNumbers,
  normalizeNumber,
  stripAxisNoise,
} from "./number-check.ts";

describe("normalizeNumber", () => {
  it("aligns $8B / 8 billion / 8,000,000,000", () => {
    assert.equal(normalizeNumber("$8B"), normalizeNumber("8 billion"));
    assert.equal(normalizeNumber("8B"), normalizeNumber("8,000,000,000"));
  });

  it("keeps percents distinct", () => {
    assert.equal(normalizeNumber("75%"), "75%");
    assert.notEqual(normalizeNumber("75%"), normalizeNumber("75"));
  });
});

describe("checkNarrationNumbers", () => {
  it("passes when every narration number is in source", () => {
    const r = checkNarrationNumbers(
      "Monthly GMV reached $105,449 with 10,797 orders.",
      "CONSISTENT GROWTH Monthly GMV ($) 1,05,449 Monthly orders 10,797",
    );
    assert.equal(r.passed, true);
    assert.deepEqual(r.unmatchedNumbers, []);
  });

  it("flags fabricated percent that only appeared as an axis tick", () => {
    const raw =
      "HIGH USER RETENTION Reseller Retention 0% 25% 50% 75% 100% Week 0 Week 2 Week 4 Week 6 Week 8 Week 10 " +
      "GMV Retention 100% 55% 58% 51% Reseller Retention 58% 51% 46%";
    const r = checkNarrationNumbers(
      "GMV retention stays 100% through week 8, falling to 75% by week 10.",
      raw,
    );
    assert.equal(r.passed, false);
    assert.ok(r.unmatchedNumbers.includes("75%"));
  });

  it("rejects week-index claims after axis/week noise strip", () => {
    const raw =
      "HIGH USER RETENTION 0% 25% 50% 75% 100% Week 0 Week 2 Week 4 Week 6 Week 8 Week 10 " +
      "GMV Retention 100% 55% 58% 51%";
    const r = checkNarrationNumbers(
      "GMV retention holds at 100% through Week 6.",
      raw,
    );
    assert.equal(r.passed, false);
    assert.ok(r.unmatchedNumbers.includes("6"));
  });

  it("extracts M/B suffixes", () => {
    const nums = extractNumbers("23M resellers and $8B market");
    assert.ok(nums.includes(normalizeNumber("23M")));
    assert.ok(nums.includes(normalizeNumber("$8B")));
  });

  it("stripAxisNoise removes ladders and week labels", () => {
    const cleaned = stripAxisNoise("0% 25% 50% 75% 100% Week 6 58%");
    assert.ok(!/75%/.test(cleaned));
    assert.ok(!/Week\s*6/i.test(cleaned));
    assert.ok(/58%/.test(cleaned));
  });

  it("flags spoken fabricated percents the same as digits", () => {
    const raw =
      "HIGH USER RETENTION 0% 25% 50% 75% 100% Week 0 Week 2 Week 4 Week 6 " +
      "GMV Retention 100% 55% 58% 51% Reseller Retention 58% 51%";
    const r = checkNarrationNumbers(
      "Our reseller retention hits one hundred percent in the first two weeks, while GMV retention remains strong at seventy-five percent by week four.",
      raw,
    );
    assert.equal(r.passed, false);
    assert.ok(
      r.unmatchedNumbers.includes("75%") ||
        r.unmatchedNumbers.includes("4") ||
        r.unmatchedNumbers.includes("2"),
      `expected unmatched fabrication, got ${JSON.stringify(r.unmatchedNumbers)}`,
    );
  });
});

/**
 * Pure highlight state machine tests — no path aliases.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

type HighlightPlaybackState = "before" | "active" | "completed";

function getHighlightState(
  currentTimeMs: number,
  startTimeMs: number,
  endTimeMs: number,
): HighlightPlaybackState {
  if (currentTimeMs < startTimeMs) return "before";
  if (currentTimeMs <= endTimeMs) return "active";
  return "completed";
}

test("highlight activates and completes from audio time", () => {
  assert.equal(getHighlightState(500, 1000, 2000), "before");
  assert.equal(getHighlightState(1000, 1000, 2000), "active");
  assert.equal(getHighlightState(1500, 1000, 2000), "active");
  assert.equal(getHighlightState(2000, 1000, 2000), "active");
  assert.equal(getHighlightState(2001, 1000, 2000), "completed");
});

test("active highlight filter matches audio clock", () => {
  const highlights = [
    { id: "a", startMs: 0, endMs: 500 },
    { id: "b", startMs: 800, endMs: 1200 },
  ];
  const currentTimeMs = 900;
  const activeIds = highlights
    .filter((h) => getHighlightState(currentTimeMs, h.startMs, h.endMs) === "active")
    .map((h) => h.id);
  assert.deepEqual(activeIds, ["b"]);
});

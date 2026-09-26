import { strict as assert } from "node:assert";
import { test } from "node:test";
import { findLargestDropoff } from "./slide-dropoff.ts";

test("marks the slide with the largest drop from the previous slide", () => {
  assert.equal(findLargestDropoff([128, 109, 93, 55, 51]), 3);
});

test("returns null when views never fall", () => {
  assert.equal(findLargestDropoff([10, 10, 12]), null);
});

test("returns null for zero or one slide", () => {
  assert.equal(findLargestDropoff([]), null);
  assert.equal(findLargestDropoff([5]), null);
});

test("keeps the first slide on a tie", () => {
  assert.equal(findLargestDropoff([10, 5, 0]), 1);
});

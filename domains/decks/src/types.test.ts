import { strict as assert } from "node:assert";
import { test } from "node:test";
import type { StoredDeck } from "./types";

test("StoredDeck shape is assignable", () => {
  const deck: StoredDeck = {
    id: "01",
    title: "Demo",
    createdAt: 1,
    slides: [{ n: "01", title: "Cover", script: "Hi", durationSec: 10 }],
  };
  assert.equal(deck.slides.length, 1);
});

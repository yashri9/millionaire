import assert from "node:assert/strict";
import { describe, it } from "node:test";

// Pure helpers mirrored from deck-store (avoid localStorage in node tests).
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isCloudDeckId(id: string): boolean {
  return UUID_RE.test(id);
}
function isLocalDraftId(id: string): boolean {
  return id.startsWith("local:") || !isCloudDeckId(id);
}

describe("deck id ownership rules", () => {
  it("treats UUIDs as cloud deck ids", () => {
    assert.equal(isCloudDeckId("a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11"), true);
    assert.equal(isLocalDraftId("a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11"), false);
  });

  it("treats local: prefix and legacy short ids as drafts", () => {
    assert.equal(isLocalDraftId("local:abc123"), true);
    assert.equal(isLocalDraftId("x7k2pq"), true);
    assert.equal(isCloudDeckId("x7k2pq"), false);
  });
});

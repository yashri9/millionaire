/**
 * Unit tests for revision-safe autosave transitions and the controller.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  applyPersistResult,
  createInitialAutosaveSnapshot,
  DeckAutosaveController,
  type DeckAutosaveSnapshot,
  type PersistResult,
} from "./deck-autosave.ts";

test("markDirty then successful persist → saved for that revision", async () => {
  let persistedRev = 0;
  const c = new DeckAutosaveController(
    async (localRevision) => {
      persistedRev = localRevision;
      return { ok: true, revision: localRevision, updatedAt: Date.now() };
    },
    { debounceMs: 20 },
  );
  c.markDirty("narration_text");
  assert.equal(c.getSnapshot().status, "dirty");
  const snap = await c.flush();
  assert.equal(snap.status, "saved");
  assert.equal(snap.savedRevision, persistedRev);
  assert.equal(snap.localRevision, snap.savedRevision);
  c.dispose();
});

test("stale persist success does not mark newer dirty revision as saved", () => {
  const base: DeckAutosaveSnapshot = {
    ...createInitialAutosaveSnapshot(1, 1),
    localRevision: 3,
    savedRevision: 1,
    status: "dirty",
  };
  // Old request for rev 2 completes while local is already 3
  const next = applyPersistResult(base, 2, {
    ok: true,
    revision: 2,
    updatedAt: 99,
  });
  assert.notEqual(next.status, "saved");
  assert.equal(next.localRevision, 3);
  assert.ok(next.savedRevision >= 2);
});

test("failed persist keeps local edits and shows error", async () => {
  const c = new DeckAutosaveController(
    async () => ({ ok: false, error: "disk full" }),
    { debounceMs: 5 },
  );
  c.markDirty("highlight_created");
  const snap = await c.flush();
  assert.equal(snap.status, "error");
  assert.equal(snap.lastError, "disk full");
  assert.ok(snap.localRevision > snap.savedRevision);
  c.dispose();
});

test("edit during in-flight save is not lost", async () => {
  let resolveFirst!: (r: PersistResult) => void;
  let calls = 0;
  const c = new DeckAutosaveController(
    async (localRevision) => {
      calls += 1;
      if (calls === 1) {
        return new Promise((resolve) => {
          resolveFirst = resolve;
        });
      }
      return { ok: true, revision: localRevision, updatedAt: Date.now() };
    },
    { debounceMs: 5 },
  );
  c.markDirty("narration_text");
  const p1 = c.flush();
  // Second edit while first save in flight
  await new Promise((r) => setTimeout(r, 10));
  c.markDirty("narration_text");
  resolveFirst({ ok: true, revision: 1, updatedAt: Date.now() });
  await p1;
  const final = await c.flush();
  assert.equal(final.status, "saved");
  assert.equal(final.localRevision, final.savedRevision);
  assert.ok(final.localRevision >= 2);
  c.dispose();
});

test("offline persist surfaces offline status", async () => {
  const c = new DeckAutosaveController(
    async () => ({ ok: false, error: "Offline — Changes not synced", offline: true }),
    { debounceMs: 5, getOnline: () => true },
  );
  c.markDirty("slide_content");
  const snap = await c.flush();
  assert.equal(snap.status, "offline");
  c.dispose();
});

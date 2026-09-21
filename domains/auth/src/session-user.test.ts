import { strict as assert } from "node:assert";
import { test } from "node:test";
import { initialsFromName } from "./session-user.ts";

test("initialsFromName handles full names", () => {
  assert.equal(initialsFromName("Yash Mate"), "YM");
});

test("initialsFromName handles single token", () => {
  assert.equal(initialsFromName("Vox"), "VO");
});

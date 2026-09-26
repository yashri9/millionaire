/** Tests for calibration maths, CSV parsing and the dataset tool: npm run eval:test -w @voxdeck/web */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { cohensKappa, parseCsv } from "./calibrate.ts";
import { similarity, validateRows } from "./dataset.ts";
import { latestDataset } from "./paths.ts";

describe("calibration", () => {
  it("parses CSV with quotes, commas and newlines inside cells", () => {
    const rows = parseCsv('"a","b ""x""","line1\nline2"\n1,2,3\n');
    assert.deepEqual(rows, [["a", 'b "x"', "line1\nline2"], ["1", "2", "3"]]);
  });

  it("computes Cohen's kappa", () => {
    assert.equal(cohensKappa([[true, true], [false, false], [true, true], [false, false]]), 1);
    assert.equal(cohensKappa([]), null);
    // Agreement only by chance -> kappa ~0
    const k = cohensKappa([[true, true], [true, false], [false, true], [false, false]]);
    assert.equal(k, 0);
  });
});

describe("dataset", () => {
  it("scores near-identical edits as similar", () => {
    assert.ok(similarity("We are raising $3M.", "We're raising $3M") > 0.5);
    assert.ok(similarity("We are raising $3M now", "We are raising $3M now.") > 0.9);
    assert.ok(similarity("Growth is strong", "Retention sits near thirty percent by week ten") < 0.3);
  });

  it("the current dataset has no validation errors and goldens pass their own rules", () => {
    const ds = JSON.parse(readFileSync(latestDataset(), "utf8"));
    const { errors } = validateRows(ds);
    assert.deepEqual(errors, []);
  });

  it("catches a broken row", () => {
    const ds = JSON.parse(readFileSync(latestDataset(), "utf8"));
    ds.rows[0] = { ...ds.rows[0], goldenScript: "As you can see this slide shows it.", mustMentionCritical: [] };
    const { errors } = validateRows(ds);
    assert.ok(errors.some((e) => e.includes("no critical")));
    assert.ok(errors.some((e) => e.includes("fails its own rules")));
  });
});

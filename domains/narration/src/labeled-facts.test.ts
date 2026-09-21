import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildLabeledFacts,
  checkYearValuePairings,
  verifyCitedDataPoints,
} from "./labeled-facts.ts";

describe("buildLabeledFacts", () => {
  it("pairs reseller counts with years from chart clusters", () => {
    const facts = buildLabeledFacts({
      titleText: "FAST GROWING MARKET!",
      bodyText: ["#Housewives Resellers", "$330", "Avg. Sales/ Reseller/ Month"],
      possibleChartRegions: [
        ["~0", "(2014)"],
        ["2M", "65% YoY", "(2017)"],
        ["23M", "(2022 proj.)"],
        ["$8B", "50% YoY", "(2017)"],
        ["$50B", "(2022 proj.)"],
      ],
    });
    assert.ok(facts.some((f) => /2014/.test(f.label) && /~?0/.test(f.value)));
    assert.ok(facts.some((f) => /2017/.test(f.label) && /2M/i.test(f.value)));
    assert.ok(facts.some((f) => /2022/.test(f.label) && /23M/i.test(f.value)));
  });

  it("captures acquisition ranges and CAC", () => {
    const facts = buildLabeledFacts({
      titleText: "ACQUISITION CRACKED!",
      bodyText: [
        "0 - 20,000 active resellers",
        "20,000 - 2M active resellers",
        "Database of200KResellers",
      ],
      possibleChartRegions: [["$2/ transacting user"]],
    });
    assert.ok(facts.some((f) => /active resellers/i.test(f.series)));
    assert.ok(facts.some((f) => /200K/i.test(f.value)));
  });
});

describe("checkYearValuePairings", () => {
  it("flags 23M claimed in 2014 when 23M belongs to 2022", () => {
    const source = buildLabeledFacts({
      titleText: "FAST GROWING MARKET!",
      bodyText: [],
      possibleChartRegions: [
        ["~0", "(2014)"],
        ["2M", "(2017)"],
        ["23M", "(2022 proj.)"],
      ],
    });
    const r = checkYearValuePairings(
      "The reseller base hit twenty-three million in 2014.",
      source,
    );
    assert.equal(r.passed, false);
    assert.ok(r.badPairs.some((p) => p.year === "2014" && /23M/i.test(p.value)));
  });

  it("passes correct 2017→2022 reseller arc", () => {
    const source = buildLabeledFacts({
      titleText: "FAST GROWING MARKET!",
      bodyText: [],
      possibleChartRegions: [
        ["~0", "(2014)"],
        ["2M", "(2017)"],
        ["23M", "(2022 proj.)"],
      ],
    });
    const r = checkYearValuePairings(
      "Housewives resellers grew from two million in 2017 to twenty-three million by 2022.",
      source,
    );
    assert.equal(r.passed, true);
  });
});

describe("verifyCitedDataPoints", () => {
  it("rejects a cited triple that is not in source", () => {
    const source = [
      { series: "Resellers", label: "2017", value: "2M" },
      { series: "Resellers", label: "2022 proj", value: "23M" },
    ];
    const bad = verifyCitedDataPoints(
      [{ series: "Resellers", label: "2014", value: "23M" }],
      source,
    );
    assert.equal(bad.length, 1);
  });
});

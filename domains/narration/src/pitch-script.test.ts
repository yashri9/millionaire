import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { extractEssentialPoints } from "./essential-points.ts";
import { draftPitchLine } from "./draft-pitch.ts";
import { punchLine, refineScript, shortenLine } from "./refine-script.ts";

describe("extractEssentialPoints", () => {
  it("prefers numbers and claims over fluff", () => {
    const points = extractEssentialPoints(
      "Confidential\nOur platform\nCut CAC 40% in 90 days\nClick here\nTrusted by 200 teams",
      { title: "Traction", limit: 3 },
    );
    assert.ok(points.some((p) => /40%|200/.test(p)));
    assert.ok(!points.some((p) => /click here/i.test(p)));
  });
});

describe("draftPitchLine", () => {
  it("does not return the raw first sentence dump", () => {
    const page =
      "Problem. Buyers waste 12 hours a week rebuilding decks for every prospect.";
    const line = draftPitchLine({
      pageText: page,
      pageNum: 2,
      title: "Problem",
      totalPages: 8,
    });
    assert.ok(line.length > 0);
    assert.notEqual(line, page);
    assert.ok(words(line).length <= 34);
  });

  it("closes an Ask slide on the raise, not the title", () => {
    for (const pageNum of [7, 8, 9]) {
      const line = draftPitchLine({
        pageText: "The Ask\nRaising $500K pre-seed\n18 months runway",
        pageNum,
        title: "The Ask",
        totalPages: pageNum,
      });
      assert.ok(line.includes("$500K"), line);
      assert.ok(!/let's the/i.test(line), line);
    }
  });
});

describe("refineScript", () => {
  it("shorten keeps meaning and reduces fluff", () => {
    const src =
      "Basically I just want to say that we really cut CAC by 40% in order to help teams.";
    const out = shortenLine(src);
    assert.ok(out.toLowerCase().includes("40%"));
    assert.ok(words(out).length < words(src).length);
  });

  it("punch preserves the core claim", () => {
    const src = "We sort of help teams cut CAC by 40% in 90 days.";
    const out = punchLine(src);
    assert.ok(/40%/.test(out));
    assert.ok(!/sort of/i.test(out));
  });

  it("regenerate yields different wording for same essentials", () => {
    const current = "Here is the beat that matters: Cut CAC 40%.";
    const a = refineScript({
      mode: "regenerate",
      currentLine: current,
      essentialPoints: ["Cut CAC 40%", "Trusted by 200 teams"],
      seed: 1,
    });
    const b = refineScript({
      mode: "regenerate",
      currentLine: current,
      essentialPoints: ["Cut CAC 40%", "Trusted by 200 teams"],
      seed: 2,
    });
    assert.notEqual(a.toLowerCase(), current.toLowerCase());
    assert.ok(/40%/.test(a));
    assert.notEqual(a, b);
  });
});

function words(s: string) {
  return s.trim().split(/\s+/).filter(Boolean);
}

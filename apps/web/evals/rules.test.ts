/**
 * Tests for the rule graders: npm run eval:test -w @voxdeck/web
 * Bad outputs come from the example-scored tab plus the failure modes found in the golden review.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { gradeDeckRepetition, gradeRules, numberMentions, passesRules, type RuleInput } from "./rules.ts";

const MEESHO_4 =
  "FAST GROWING MARKET!\n#Housewives Resellers\n~0 2M 65% YoY 23M\n(2014) (2017) (2022 proj.)\nX\n$330\nAvg. Sales/ Reseller/ Month\n(2017)\n=\n50% YoY\n$8B $50B\nTotal Addressable Market (TAM)\n(2017) (2022 proj.)\nSOURCE: ZINNOV CONSULTING";

const base = (over: Partial<RuleInput>): RuleInput => ({
  narration: "",
  isModelOutput: true,
  error: null,
  wordCount: 0,
  slideText: MEESHO_4,
  otherSlides: [{ rowId: "meesho-18", slideText: "PLAN & ASK\nSeries A Now $3M\n$625K $200K in Bank" }],
  deckTitle: "meesho-first-pitch",
  bannedTerms: ["hundred billion"],
  ...over,
});
const words = (s: string) => s.trim().split(/\s+/).length;
const grade = (narration: string, over: Partial<RuleInput> = {}) =>
  gradeRules(base({ narration, wordCount: words(narration), ...over }));
const status = (results: ReturnType<typeof gradeRules>, rule: string) => results.find((r) => r.rule === rule)?.status;

describe("numberMentions", () => {
  it("reads digits, suffixes, Indian commas and ranges", () => {
    const v = numberMentions("$1,05,449 and 1.3M, 20-30M+ profit, 65% YoY, 100X").map((m) => m.value);
    assert.deepEqual(v, [105449, 1.3e6, 20, 30e6, 65, 100]);
  });
  it("reads spoken numbers but ignores small counting words", () => {
    const v = numberMentions("six hundred twenty-five thousand, a hundred percent, three-million-dollar, two modes");
    assert.deepEqual(
      v.map((m) => [m.value, m.pct]),
      [[625000, false], [100, true], [3e6, false]],
    );
  });
});

describe("rules", () => {
  it("passes a grounded, spoken narration (example A)", () => {
    const r = grade(
      "The market is exploding. We project resellers will grow from two million in 2017 to twenty-three million by 2022, taking the market from eight billion to fifty billion dollars.",
    );
    assert.ok(passesRules(r), JSON.stringify(r));
  });

  it("fails invented numbers as [N] (example C)", () => {
    const r = grade(
      "The market will hit one hundred billion dollars by 2025, and Meesho already has ten million resellers, growing faster than Amazon.",
    );
    const n = r.find((x) => x.rule === "numbers")!;
    assert.equal(n.status, "fail");
    assert.match(n.detail, /\[N\]/);
    assert.equal(status(r, "banned_terms"), "fail");
  });

  it("flags a number from another slide as [L]", () => {
    const r = grade("The market grows from eight billion to fifty billion dollars, and we're raising three million dollars to capture it now.");
    const n = r.find((x) => x.rule === "numbers")!;
    assert.equal(n.status, "fail");
    assert.match(n.detail, /\[L\].*meesho-18/);
  });

  it("warns (not fails) on rounding", () => {
    const r = grade(
      "Housewife resellers reach about twenty-two million by 2022, and the market grows from eight billion to fifty billion dollars in that time.",
    );
    assert.equal(status(r, "numbers"), "warn");
  });

  it("fails meta narration and short lines (example B is too short)", () => {
    const b = grade("Social selling in India is growing quickly and the opportunity is very large for everyone involved.");
    assert.equal(status(b, "length"), "pass"); // 16 words is inside 15-40
    const meta = grade("As you can see, this slide shows the market growing from eight billion to fifty billion dollars by 2022.");
    assert.equal(status(meta, "banned_phrases"), "fail");
    assert.equal(status(grade("Market grows fast."), "length"), "fail");
  });

  it("fails template placeholders read aloud", () => {
    const r = grade("There are X target customers in the market, and at our Y pricing this company could become huge, according to your Uncle.");
    assert.equal(status(r, "placeholders"), "fail");
  });

  it("fails fallbacks and formatting", () => {
    assert.equal(status(grade("A perfectly fine line that is long enough to pass the length rule easily here.", { isModelOutput: false }), "pipeline"), "fail");
    assert.equal(status(grade("* Market grows from eight billion to fifty billion dollars by 2022 across India [1]."), "formatting"), "fail");
  });

  it("warns on repeated sentences across a deck", () => {
    const rep = gradeDeckRepetition([
      { key: "a", narration: "We are the fastest growing reseller network in India. More here." },
      { key: "b", narration: "We are the fastest growing reseller network in India." },
      { key: "c", narration: "Something entirely different is said on this one slide." },
    ]);
    assert.equal(rep.get("a")!.status, "warn");
    assert.equal(rep.get("c")!.status, "pass");
  });
});

/** Tests for judge reply parsing and the pass rule: npm run eval:test -w @voxdeck/web */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CoverageSchema,
  FaithfulnessSchema,
  coveragePct,
  judgeConfigFromEnv,
  judgePasses,
  parseJudgeReply,
} from "./judge.ts";

describe("judge", () => {
  it("parses JSON wrapped in fences or text and fills defaults", () => {
    const f = parseJudgeReply(
      'Here you go:\n```json\n{"claims":[{"claim":"x","supported":"yes"}],"score":5}\n```',
      FaithfulnessSchema,
    );
    assert.equal(f.score, 5);
    assert.deepEqual(f.mustNotSayHits, []);
    assert.equal(f.claims[0].evidence, "");
  });

  it("rejects replies that break the schema", () => {
    assert.throws(() => parseJudgeReply('{"claims":[],"score":7}', FaithfulnessSchema));
    assert.throws(() => parseJudgeReply("no json here", FaithfulnessSchema));
  });

  it("computes coverage and ignores duplicate or extra items", () => {
    const cov = CoverageSchema.parse({
      critical: [
        { item: 1, hit: true },
        { item: 1, hit: true },
        { item: 2, hit: false },
        { item: 9, hit: true },
      ],
    });
    assert.equal(coveragePct(cov, 2, "critical"), 100); // items 1 and 9 hit; capped at expected
    assert.equal(coveragePct(cov, 0, "optional"), null);
  });

  it("applies the pass rule", () => {
    const ok = FaithfulnessSchema.parse({ claims: [], score: 4 });
    assert.equal(judgePasses(ok, 100), true);
    assert.equal(judgePasses(ok, 50), false);
    assert.equal(judgePasses({ ...ok, score: 3 }, 100), false);
    assert.equal(judgePasses({ ...ok, mustNotSayHits: ["x"] }, 100), false);
  });

  it("defaults the judge to Anthropic when its key is set, else needs a model", () => {
    assert.equal(judgeConfigFromEnv({ ANTHROPIC_API_KEY: "k" })?.provider, "anthropic");
    assert.equal(judgeConfigFromEnv({ GROQ_API_KEY: "k" }), null); // groq judge needs a model
    assert.equal(judgeConfigFromEnv({ GROQ_API_KEY: "k", JUDGE_MODEL: "m" })?.label, "groq");
    assert.equal(judgeConfigFromEnv({ JUDGE_PROVIDER: "openai", JUDGE_API_KEY: "k" }), null); // no model
    assert.equal(judgeConfigFromEnv({ JUDGE_PROVIDER: "openai", JUDGE_API_KEY: "k", JUDGE_MODEL: "m" })?.baseUrl, "https://api.openai.com/v1");
  });
});

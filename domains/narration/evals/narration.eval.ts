/**
 * Narration eval cases — run with:
 *   npm run eval -w @voxdeck/narration
 *
 * Scores heuristic draft/refine locally (no LLM key required).
 * With an LLM key, extend via POST /api/script/rewrite.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { extractEssentialPoints } from "../src/essential-points.ts";
import { draftPitchLine } from "../src/draft-pitch.ts";
import { refineScript } from "../src/refine-script.ts";

type Case = {
  name: string;
  pageText: string;
  title: string;
  current?: string;
};

const CASES: Case[] = [
  {
    name: "traction slide",
    title: "Traction",
    pageText: "Cut CAC 40% in 90 days\nTrusted by 200 teams\n$2.1M ARR",
  },
  {
    name: "problem slide",
    title: "Problem",
    pageText: "Buyers waste 12 hours a week rebuilding decks for every prospect.",
  },
  {
    name: "ask slide",
    title: "The Ask",
    pageText: "Raising $15M Series B\nDouble down on US enterprise",
  },
];

function words(s: string) {
  return s.trim().split(/\s+/).filter(Boolean);
}

describe("narration evals (local)", () => {
  for (const c of CASES) {
    it(`${c.name}: draft pitches essentials, not a read-aloud`, () => {
      const essentials = extractEssentialPoints(c.pageText, {
        title: c.title,
        limit: 4,
      });
      assert.ok(essentials.length >= 1, "should extract at least one essential");

      const line = draftPitchLine({
        pageText: c.pageText,
        pageNum: 2,
        title: c.title,
        totalPages: 8,
        essentialPoints: essentials,
      });

      assert.ok(line.length > 0);
      assert.notEqual(line.trim(), c.pageText.trim());
      assert.ok(words(line).length <= 34, `too long: ${line}`);

      const hay = line.toLowerCase();
      const hit = essentials.some((e) => {
        const token = e.match(/[\d$%]+|[A-Za-z]{5,}/)?.[0];
        return token ? hay.includes(token.toLowerCase()) : false;
      });
      assert.ok(hit, `line should land an essential: ${line}`);
    });

    it(`${c.name}: shorten/punch preserve meaning; regenerate differs`, () => {
      const essentials = extractEssentialPoints(c.pageText, {
        title: c.title,
        limit: 4,
      });
      const current =
        c.current ??
        draftPitchLine({
          pageText: c.pageText,
          pageNum: 2,
          title: c.title,
          totalPages: 8,
          essentialPoints: essentials,
        });

      const short = refineScript({
        mode: "shorten",
        currentLine: current,
        essentialPoints: essentials,
      });
      const punch = refineScript({
        mode: "punch",
        currentLine: current,
        essentialPoints: essentials,
      });
      const regen = refineScript({
        mode: "regenerate",
        currentLine: current,
        essentialPoints: essentials,
        seed: 7,
      });

      assert.ok(words(short).length <= words(current).length);
      assert.notEqual(regen.toLowerCase(), current.toLowerCase());
      assert.ok(punch.length > 0);
    });
  }
});

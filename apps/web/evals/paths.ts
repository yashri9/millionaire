/** Shared paths for the eval tools. */
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";

export const EVALS_DIR = import.meta.dirname;
export const GOLDEN_DIR = path.join(EVALS_DIR, "golden");

/** Highest-numbered golden/narration-vN.json, or EVAL_DATASET if set. Every tool defaults to this. */
export function latestDataset(): string {
  if (process.env.EVAL_DATASET) return path.resolve(process.env.EVAL_DATASET);
  const versions = existsSync(GOLDEN_DIR)
    ? readdirSync(GOLDEN_DIR)
        .map((f) => ({ f, n: Number(f.match(/^narration-v(\d+)\.json$/)?.[1]) }))
        .filter((x) => Number.isFinite(x.n) && x.n > 0)
        .sort((a, b) => b.n - a.n)
    : [];
  if (!versions.length) throw new Error(`No narration-vN.json in ${GOLDEN_DIR}`);
  return path.join(GOLDEN_DIR, versions[0].f);
}

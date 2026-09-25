import "server-only";

/**
 * server-vision-ocr.ts — Cloud Vision OCR for every rendered page inside the
 * parse job (Vision-primary cloud path).
 *
 * Built for speed:
 *   - Pages are OCR'd while later pages are still rendering (enqueue per page).
 *   - Up to VISION_SERVER_CONCURRENCY requests are in flight at once.
 *   - Cache hits (sha256 of the exact JPEG bytes) cost no API call, so job
 *     retries and re-parses of the same deck are near-instant.
 *
 * Built to never break parsing:
 *   - Any per-page failure resolves to null; the caller keeps the text layer.
 *   - Deck-wide failures (no key, quota, billing, API disabled, key rejected)
 *     trip a breaker so the remaining pages skip Vision instead of each
 *     waiting through retries.
 */
import { createHash } from "crypto";
import type { VisionOcrResult } from "@voxdeck/narration";
import { ApiError } from "@/lib/http";
import { googleVisionApiKey, googleVisionOcr } from "@/lib/google-vision";
import { getVisionCache, putVisionCache } from "@/lib/vision-ocr-cache";
import { checkRateLimit } from "@/lib/rate-limit";

export type PageOcr = VisionOcrResult & { source: "storage-cache" | "provider" };

export type VisionOcrStats = {
  requested: number;
  cacheHits: number;
  providerCalls: number;
  failed: number;
  skipped: number;
  /** Set when the breaker tripped; explains why later pages used the text layer. */
  disabledReason: string | null;
};

/** Errors that will fail every remaining page the same way. */
const DECK_WIDE_CODES = new Set([
  "vision_not_configured",
  "quota_exceeded",
  "vision_billing_disabled",
  "vision_api_disabled",
  "vision_key_rejected",
]);

/** Vision's JSON request limit is 10 MB; base64 inflates by 4/3. */
const MAX_IMAGE_BYTES = 7 * 1024 * 1024;

export function serverVisionEnabled(): boolean {
  const flag = (process.env.VISION_SERVER_OCR ?? "on").toLowerCase();
  return flag !== "off" && flag !== "false" && flag !== "0" && Boolean(googleVisionApiKey());
}

function concurrency(): number {
  const n = Number(process.env.VISION_SERVER_CONCURRENCY ?? "6");
  return Number.isFinite(n) && n >= 1 ? Math.min(16, Math.floor(n)) : 6;
}

/**
 * A small bounded-concurrency OCR queue for one deck. Call `ocr()` as each page
 * is rendered; await the returned promises (or `drain()`) once rendering ends.
 */
export function createVisionOcrQueue() {
  const limit = concurrency();
  const stats: VisionOcrStats = {
    requested: 0,
    cacheHits: 0,
    providerCalls: 0,
    failed: 0,
    skipped: 0,
    disabledReason: serverVisionEnabled() ? null : "vision_not_configured",
  };
  const pending: Promise<unknown>[] = [];
  let active = 0;
  const waiters: (() => void)[] = [];

  async function slot<T>(fn: () => Promise<T>): Promise<T> {
    if (active >= limit) await new Promise<void>((r) => waiters.push(r));
    active++;
    try {
      return await fn();
    } finally {
      active--;
      waiters.shift()?.();
    }
  }

  async function ocrOne(image: Buffer): Promise<PageOcr | null> {
    if (stats.disabledReason) {
      stats.skipped++;
      return null;
    }
    if (image.byteLength > MAX_IMAGE_BYTES) {
      stats.skipped++;
      return null;
    }

    const sha = createHash("sha256").update(image).digest("hex");
    const cached = await getVisionCache(sha).catch(() => null);
    if (cached) {
      stats.cacheHits++;
      return { ...cached, source: "storage-cache" };
    }

    // Re-check after the cache round trip: another page may have tripped the breaker.
    if (stats.disabledReason) {
      stats.skipped++;
      return null;
    }

    // Same project-wide 30-day cap the browser route uses, so the two paths share one budget.
    const monthly = await checkRateLimit(
      "vision:project:30d",
      Number(process.env.VISION_MONTHLY_PAGE_CAP ?? "900"),
      30 * 24 * 3600,
    ).catch(() => ({ allowed: true }));
    if (!monthly.allowed) {
      stats.disabledReason = "quota_exceeded";
      stats.skipped++;
      return null;
    }

    try {
      stats.providerCalls++;
      const result = await googleVisionOcr(image.toString("base64"));
      void putVisionCache(sha, result).catch(() => undefined);
      return { ...result, source: "provider" };
    } catch (err) {
      stats.failed++;
      const code = err instanceof ApiError ? err.code : undefined;
      if (code && DECK_WIDE_CODES.has(code)) stats.disabledReason = code;
      console.warn("[server-vision-ocr] page failed", code ?? (err as Error)?.message);
      return null;
    }
  }

  return {
    stats,
    /** Queue one page image. Resolves to null when Vision was skipped or failed. */
    ocr(image: Buffer | undefined): Promise<PageOcr | null> {
      stats.requested++;
      if (!image) {
        stats.skipped++;
        return Promise.resolve(null);
      }
      const p = slot(() => ocrOne(image));
      pending.push(p);
      return p;
    },
    async drain(): Promise<void> {
      await Promise.allSettled(pending);
    },
  };
}

import { createHash } from "crypto";
import { requireUser } from "@/lib/auth";
import { handle, ApiError } from "@/lib/http";
import { captureMessage } from "@/lib/observe";

export const maxDuration = 30;

/** ~4 MB of JPEG as base64. A 1600px slide at q=0.85 is usually 200-600 KB. */
const MAX_BASE64_CHARS = 5_600_000;

/**
 * POST /api/ocr/vision — Cloud Vision DOCUMENT_TEXT_DETECTION for ONE page image.
 *
 * Called by the device-draft parser (`vision-ocr-client`) when the pdf.js text
 * layer needs OCR. Cloud uploads use server-side Vision in the parse job instead.
 *
 * Body:     { imageBase64: string }  // JPEG/PNG bytes, no "data:" prefix
 * Response: { text, confidence, source: "storage-cache" | "provider" }
 *
 * Guardrails, in order: auth, size cap, cache (free), per-user hourly limit,
 * project-wide monthly cap (default 900, under the 1,000 free units), then the API.
 */
export async function POST(req: Request) {
  return handle(async () => {
    const user = await requireUser();
    const body = (await req.json().catch(() => ({}))) as { imageBase64?: unknown };
    const imageBase64 = String(body.imageBase64 ?? "")
      .replace(/^data:image\/[a-z]+;base64,/i, "")
      .trim();
    if (!imageBase64) throw new ApiError(400, "imageBase64 is required");
    if (imageBase64.length > MAX_BASE64_CHARS) throw new ApiError(413, "image too large");

    const { googleVisionApiKey, googleVisionOcr } = await import("@/lib/google-vision");
    if (!googleVisionApiKey()) {
      throw new ApiError(503, "Cloud Vision is not configured", "vision_not_configured");
    }

    const sha = createHash("sha256").update(Buffer.from(imageBase64, "base64")).digest("hex");
    const { getVisionCache, putVisionCache } = await import("@/lib/vision-ocr-cache");
    const cached = await getVisionCache(sha);
    if (cached) {
      captureMessage("pipeline:vision_cache_hit", { event: "vision_cache_hit" });
      return Response.json({ ...cached, source: "storage-cache" });
    }

    const { checkRateLimit } = await import("@/lib/rate-limit");
    const perUser = await checkRateLimit(
      `vision:user:${user.id}`,
      Number(process.env.VISION_PAGES_PER_USER_PER_HOUR ?? "60"),
      3600,
    );
    if (!perUser.allowed) {
      throw new ApiError(429, "Too many OCR pages this hour", "rate_limited");
    }
    // 30-day window across the whole project: a hard stop before the free tier runs out.
    const monthly = await checkRateLimit(
      "vision:project:30d",
      Number(process.env.VISION_MONTHLY_PAGE_CAP ?? "900"),
      30 * 24 * 3600,
    );
    if (!monthly.allowed) {
      throw new ApiError(402, "Monthly Cloud Vision cap reached", "quota_exceeded");
    }

    captureMessage("pipeline:vision_cache_miss", { event: "vision_cache_miss" });
    const result = await googleVisionOcr(imageBase64);
    await putVisionCache(sha, result);
    return Response.json({ ...result, source: "provider" });
  });
}

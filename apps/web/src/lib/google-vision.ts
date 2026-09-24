import "server-only";

import {
  buildVisionRequest,
  parseVisionResponse,
  VisionResponseError,
  type VisionOcrResult,
} from "@voxdeck/narration";
import { ApiError } from "@/lib/http";
import { withRetry } from "@/lib/provider-resilience";

const VISION_URL = "https://vision.googleapis.com/v1/images:annotate";

/**
 * Same GCP project (voxdeck-tts) and same API key as Google TTS.
 * GOOGLE_VISION_API_KEY lets you split keys later without a code change.
 */
export function googleVisionApiKey(): string {
  return (
    process.env.GOOGLE_VISION_API_KEY?.trim() ||
    process.env.GOOGLE_TTS_API_KEY?.trim() ||
    ""
  );
}

class VisionHttpError extends Error {
  constructor(
    public status: number,
    public body: string,
  ) {
    // Status in the message so withRetry's default matcher retries 429/5xx.
    super(`google-vision ${status}: ${body.slice(0, 300)}`);
  }
}

/** Map Google errors to the codes the client already understands. */
export function mapVisionError(status: number, body: string): ApiError {
  if (status === 429 || /RESOURCE_EXHAUSTED|quota/i.test(body)) {
    return new ApiError(402, "Cloud Vision quota reached. Tesseract text is kept.", "quota_exceeded");
  }
  if (status === 403 && /billing/i.test(body)) {
    return new ApiError(503, "Billing is not enabled on the Google Cloud project.", "vision_billing_disabled");
  }
  if (status === 403 && /SERVICE_DISABLED|has not been used|is disabled/i.test(body)) {
    return new ApiError(503, "Cloud Vision API is not enabled on the Google Cloud project.", "vision_api_disabled");
  }
  if (status === 403 || status === 401 || /API_KEY_INVALID|API key not valid/i.test(body)) {
    return new ApiError(503, "Google API key is invalid or not allowed to call Cloud Vision.", "vision_key_rejected");
  }
  if (status === 400) {
    return new ApiError(400, "Cloud Vision rejected the image.", "vision_bad_image");
  }
  return new ApiError(502, "Cloud Vision is unavailable right now.", "vision_unavailable");
}

/** DOCUMENT_TEXT_DETECTION on one base64 image (no data: prefix). */
export async function googleVisionOcr(imageBase64: string): Promise<VisionOcrResult> {
  const apiKey = googleVisionApiKey();
  if (!apiKey) {
    throw new ApiError(503, "GOOGLE_TTS_API_KEY is not configured", "vision_not_configured");
  }
  try {
    const json = await withRetry(
      "google-vision",
      async () => {
        const res = await fetch(VISION_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": apiKey,
          },
          body: JSON.stringify(buildVisionRequest(imageBase64)),
        });
        const text = await res.text();
        if (!res.ok) throw new VisionHttpError(res.status, text);
        return JSON.parse(text) as unknown;
      },
      { retries: 2 },
    );
    return parseVisionResponse(json);
  } catch (err) {
    if (err instanceof VisionHttpError) throw mapVisionError(err.status, err.body);
    if (err instanceof VisionResponseError) {
      throw mapVisionError(err.code === 8 ? 429 : err.code === 7 ? 403 : 400, err.message);
    }
    throw err;
  }
}

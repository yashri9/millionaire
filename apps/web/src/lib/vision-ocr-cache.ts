import "server-only";

import { visionCachePath, type VisionOcrResult } from "@voxdeck/narration";
import { createServiceClient } from "@/lib/supabase/server";
import { serverEnv } from "@/lib/env";

/**
 * Durable Cloud Vision cache in Supabase Storage (same bucket and pattern as
 * tts-storage-cache.ts). Keyed by sha256 of the exact image bytes, so the same
 * page rendered again never bills a second time.
 */
export async function getVisionCache(sha256Hex: string): Promise<VisionOcrResult | null> {
  const storage = createServiceClient();
  const { data, error } = await storage.storage
    .from(serverEnv.decksBucket)
    .download(visionCachePath(sha256Hex));
  if (error || !data) return null;
  try {
    const parsed = JSON.parse(await data.text()) as VisionOcrResult;
    return typeof parsed?.text === "string" ? parsed : null;
  } catch {
    return null;
  }
}

export async function putVisionCache(sha256Hex: string, result: VisionOcrResult): Promise<void> {
  const storage = createServiceClient();
  const { error } = await storage.storage
    .from(serverEnv.decksBucket)
    .upload(visionCachePath(sha256Hex), JSON.stringify(result), {
      contentType: "application/json",
      upsert: true,
      cacheControl: "31536000",
    });
  if (error) console.warn("[vision-cache] upload failed", error.message);
}

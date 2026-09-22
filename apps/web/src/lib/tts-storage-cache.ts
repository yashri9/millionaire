import "server-only";

import { createHash } from "crypto";
import { createServiceClient } from "@/lib/supabase/server";
import { serverEnv } from "@/lib/env";

function ttsHash(voiceId: string, text: string, modelId: string, format: string) {
  return createHash("sha256")
    .update([voiceId, modelId, format, text.trim()].join("\0"))
    .digest("hex")
    .slice(0, 40);
}

export function ttsObjectPath(
  voiceId: string,
  text: string,
  modelId: string,
  format = "mp3",
) {
  const hash = ttsHash(voiceId, text, modelId, format);
  return `tts/${voiceId}/${hash}.${format}`;
}

/** Persist synthesized audio in Storage; return path or null. */
export async function putTtsCache(opts: {
  voiceId: string;
  text: string;
  modelId: string;
  bytes: ArrayBuffer | Buffer;
  format?: string;
  contentType?: string;
}): Promise<string | null> {
  const format = opts.format ?? "mp3";
  const path = ttsObjectPath(opts.voiceId, opts.text, opts.modelId, format);
  const storage = createServiceClient();
  const { error } = await storage.storage.from(serverEnv.decksBucket).upload(
    path,
    opts.bytes,
    {
      contentType: opts.contentType ?? "audio/mpeg",
      upsert: true,
      cacheControl: "31536000",
    },
  );
  if (error) {
    console.warn("[tts-cache] upload failed", error.message);
    return null;
  }
  return path;
}

export async function getTtsCachedSignedUrl(opts: {
  voiceId: string;
  text: string;
  modelId: string;
  format?: string;
  ttlSec?: number;
}): Promise<string | null> {
  const format = opts.format ?? "mp3";
  const path = ttsObjectPath(opts.voiceId, opts.text, opts.modelId, format);
  const storage = createServiceClient();
  const { data, error } = await storage.storage
    .from(serverEnv.decksBucket)
    .createSignedUrl(path, opts.ttlSec ?? 3600);
  if (error || !data?.signedUrl) return null;
  // Probe existence — signed URL may still be created for missing objects on some setups.
  const { data: blob } = await storage.storage.from(serverEnv.decksBucket).download(path);
  if (!blob) return null;
  return data.signedUrl;
}

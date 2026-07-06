import "server-only";

/**
 * storage.ts — helpers shared by the upload + re-parse routes for writing
 * rendered page images to the private decks bucket.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { serverEnv } from "@/lib/env";
import type { RenderedPage } from "@/lib/render";

const UPLOAD_RETRIES = 3;
const UPLOAD_RETRY_DELAY_MS = 500;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Uploads one file, retrying on transient failures (e.g. network blips) before giving up. */
async function uploadWithRetry(
  storage: SupabaseClient,
  path: string,
  bytes: Buffer,
): Promise<{ error: { message: string } | null }> {
  let lastError: { message: string } | null = null;
  for (let attempt = 1; attempt <= UPLOAD_RETRIES; attempt++) {
    const { error } = await storage.storage
      .from(serverEnv.decksBucket)
      .upload(path, bytes, { contentType: "image/png", upsert: true });
    if (!error) return { error: null };
    lastError = error;
    if (attempt < UPLOAD_RETRIES) await sleep(UPLOAD_RETRY_DELAY_MS * attempt);
  }
  return { error: lastError };
}

export type UploadRenderedImagesResult = {
  paths: Map<number, { image_path: string; thumb_path: string }>;
  failedOrderIndexes: number[];
};

export async function uploadRenderedImages(
  storage: SupabaseClient,
  basePath: string,
  images: RenderedPage[],
): Promise<UploadRenderedImagesResult> {
  const paths = new Map<number, { image_path: string; thumb_path: string }>();
  const failedOrderIndexes: number[] = [];
  await Promise.all(
    images.map(async (img) => {
      const imagePath = `${basePath}/pages/${img.order_index}.png`;
      const thumbPath = `${basePath}/thumbs/${img.order_index}.png`;
      const [imageRes, thumbRes] = await Promise.all([
        uploadWithRetry(storage, imagePath, img.imagePng),
        uploadWithRetry(storage, thumbPath, img.thumbPng),
      ]);
      if (!imageRes.error && !thumbRes.error) {
        paths.set(img.order_index, { image_path: imagePath, thumb_path: thumbPath });
      } else {
        failedOrderIndexes.push(img.order_index);
      }
    }),
  );
  return { paths, failedOrderIndexes };
}

const SIGNED_URL_TTL_SECONDS = 60 * 60; // 1 hour

/**
 * Signs image_path/thumb_path for a batch of slides (private bucket — the
 * browser never gets a direct/anon path, only a short-lived signed URL).
 */
export async function signSlideImagePaths<T extends { image_path: string | null; thumb_path: string | null }>(
  storage: SupabaseClient,
  slides: T[],
): Promise<(T & { image_url: string | null; thumb_url: string | null })[]> {
  const paths = slides.flatMap((s) => [s.image_path, s.thumb_path].filter((p): p is string => Boolean(p)));
  if (paths.length === 0) return slides.map((s) => ({ ...s, image_url: null, thumb_url: null }));

  const { data } = await storage.storage
    .from(serverEnv.decksBucket)
    .createSignedUrls(paths, SIGNED_URL_TTL_SECONDS);
  const urlByPath = new Map((data ?? []).map((d) => [d.path, d.signedUrl]));

  return slides.map((s) => ({
    ...s,
    image_url: (s.image_path && urlByPath.get(s.image_path)) || null,
    thumb_url: (s.thumb_path && urlByPath.get(s.thumb_path)) || null,
  }));
}

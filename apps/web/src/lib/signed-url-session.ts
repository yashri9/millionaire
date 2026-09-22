"use client";

/**
 * Session-scoped signed URL reuse — Smart CDN free substitute.
 * One signed URL per storage path per tab session.
 */
const sessionSignedUrls = new Map<string, { url: string; expiresAt: number }>();

export function getSessionSignedUrl(path: string): string | null {
  const hit = sessionSignedUrls.get(path);
  if (!hit) return null;
  if (Date.now() > hit.expiresAt - 60_000) {
    sessionSignedUrls.delete(path);
    return null;
  }
  return hit.url;
}

export function setSessionSignedUrl(path: string, url: string, ttlSec = 3600) {
  sessionSignedUrls.set(path, {
    url,
    expiresAt: Date.now() + ttlSec * 1000,
  });
}

export function clearSessionSignedUrls() {
  sessionSignedUrls.clear();
}

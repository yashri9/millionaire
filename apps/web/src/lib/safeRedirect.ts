/** Reject open-redirect targets; only same-origin relative paths are allowed. */
export function safeRedirectPath(raw: string | null, fallback = "/dashboard"): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return fallback;
  return raw;
}

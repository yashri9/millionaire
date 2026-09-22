/**
 * Lightweight observability shim — wires to Sentry when NEXT_PUBLIC_SENTRY_DSN is set.
 * Safe no-op otherwise so free/dev builds never break.
 */

type Extra = Record<string, unknown>;

function sentryEnabled() {
  return Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN || process.env.SENTRY_DSN);
}

export function captureException(err: unknown, extra?: Extra) {
  if (process.env.NODE_ENV !== "production") {
    console.error("[observe]", err, extra ?? "");
  }
  if (!sentryEnabled()) return;
  try {
    // Dynamic require avoids hard dependency when @sentry/nextjs isn't installed.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Sentry = require("@sentry/nextjs") as {
      captureException: (e: unknown, ctx?: { extra?: Extra }) => void;
    };
    Sentry.captureException(err, { extra });
  } catch {
    /* package optional */
  }
}

export function captureMessage(message: string, extra?: Extra) {
  if (process.env.NODE_ENV !== "production") {
    console.info("[observe]", message, extra ?? "");
  }
  if (!sentryEnabled()) return;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Sentry = require("@sentry/nextjs") as {
      captureMessage: (m: string, ctx?: { extra?: Extra }) => void;
    };
    Sentry.captureMessage(message, { extra });
  } catch {
    /* optional */
  }
}

export function trackPipelineEvent(
  name:
    | "upload_started"
    | "parse_failed"
    | "render_warning"
    | "llm_fallback_used"
    | "tts_cache_miss"
    | "tts_cache_hit"
    | "escalation_delivered",
  extra?: Extra,
) {
  captureMessage(`pipeline:${name}`, { event: name, ...extra });
}

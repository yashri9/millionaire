import "server-only";

/**
 * Hand-rolled retry + circuit breaker for LLM/TTS providers (free — no gateway).
 */

type BreakerState = {
  failures: number;
  successes: number;
  openedAt: number | null;
};

const breakers = new Map<string, BreakerState>();

const FAILURE_THRESHOLD = 5;
const WINDOW_MS = 30_000;
const OPEN_MS = 60_000;

function state(name: string): BreakerState {
  let s = breakers.get(name);
  if (!s) {
    s = { failures: 0, successes: 0, openedAt: null };
    breakers.set(name, s);
  }
  return s;
}

export function isCircuitOpen(provider: string): boolean {
  const s = state(provider);
  if (s.openedAt == null) return false;
  if (Date.now() - s.openedAt > OPEN_MS) {
    s.openedAt = null;
    s.failures = 0;
    return false;
  }
  return true;
}

export function recordSuccess(provider: string) {
  const s = state(provider);
  s.successes += 1;
  s.failures = Math.max(0, s.failures - 1);
  s.openedAt = null;
}

export function recordFailure(provider: string) {
  const s = state(provider);
  s.failures += 1;
  if (s.failures >= FAILURE_THRESHOLD) {
    s.openedAt = Date.now();
  }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function jitter(base: number) {
  return base + Math.floor(Math.random() * base * 0.5);
}

export async function withRetry<T>(
  provider: string,
  fn: () => Promise<T>,
  opts?: { retries?: number; isRetryable?: (err: unknown) => boolean },
): Promise<T> {
  if (isCircuitOpen(provider)) {
    throw new Error(`Circuit open for provider ${provider}`);
  }
  const retries = opts?.retries ?? 3;
  const isRetryable =
    opts?.isRetryable ??
    ((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      return /429|500|502|503|504|timeout|ECONNRESET|fetch failed/i.test(msg);
    });

  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const result = await fn();
      recordSuccess(provider);
      return result;
    } catch (err) {
      lastErr = err;
      recordFailure(provider);
      if (attempt >= retries || !isRetryable(err)) break;
      const retryAfter =
        err instanceof Error && /retry-after[:\s]+(\d+)/i.test(err.message)
          ? Number(RegExp.$1) * 1000
          : jitter(400 * Math.pow(2, attempt));
      await sleep(retryAfter);
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

import { NextResponse } from "next/server";
import { safeRedirectPath } from "@/lib/safeRedirect";

export { safeRedirectPath } from "@/lib/safeRedirect";

/**
 * Small HTTP helpers so route handlers stay consistent and NEVER leak stack
 * traces to users (PRD §8). Throw `ApiError` for expected failures; unexpected
 * errors are logged server-side with a request id and returned as a generic 500.
 */
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
  ) {
    super(message);
  }
}

export function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}
/** Wrap a route handler body so errors become clean JSON responses. */
export async function handle(
  fn: () => Promise<Response>,
): Promise<Response> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof ApiError) {
      return NextResponse.json(
        { error: err.message, code: err.code },
        { status: err.status },
      );
    }
    const requestId = crypto.randomUUID();
    console.error(`[500] request_id=${requestId}`, err);
    const raw = err instanceof Error ? err.message : String(err);
    // Surface known config failures without leaking stacks/keys.
    let message = "Something went wrong. Please try again.";
    if (/Invalid API key/i.test(raw)) {
      message =
        "Server storage is misconfigured (invalid Supabase service role key). Fix SUPABASE_SERVICE_ROLE_KEY in Vercel and redeploy.";
    } else if (/SUPABASE_SERVICE_ROLE_KEY is not configured/i.test(raw)) {
      message =
        "Server storage is not configured. Set SUPABASE_SERVICE_ROLE_KEY in Vercel and redeploy.";
    } else if (/permission denied for table/i.test(raw)) {
      message =
        "Server database permissions are incomplete. Apply the latest Supabase migrations (service_role grants) and try again.";
    }
    return NextResponse.json(
      { error: message, request_id: requestId },
      { status: 500 },
    );
  }
}

/** Placeholder for endpoints that are scaffolded but not implemented yet. */
export function notImplemented(what: string) {
  return NextResponse.json(
    { error: "Not implemented yet", todo: what },
    { status: 501 },
  );
}

import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { publicEnv } from "@/lib/env";

/**
 * GET /api/auth/google/callback
 * Exchanges the OAuth `code` for a session, then opens Studio.
 */
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const next = request.nextUrl.searchParams.get("next");
  const safeNext =
    next && next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";

  const redirectTo = (path: string) =>
    NextResponse.redirect(new URL(path, publicEnv.appUrl || request.nextUrl.origin));

  if (!code) return redirectTo("/login?error=oauth_failed");

  const supabase = await createServerClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return redirectTo("/login?error=oauth_failed");

  // Confirm profile exists (created by DB trigger). Non-fatal if missing.
  if (data.user) {
    await supabase
      .from("profiles")
      .select("id")
      .eq("id", data.user.id)
      .maybeSingle();
  }

  return redirectTo(safeNext);
}

import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { publicEnv } from "@/lib/env";

/**
 * GET /api/auth/google/callback (PRD §4.1 / §6). Google OAuth is configured in
 * the Supabase dashboard; the client kicks off `signInWithOAuth({ provider:
 * "google", options: { redirectTo: <this route> } })` and Google/Supabase
 * redirect back here with a `code` to exchange for a session.
 */
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const redirectTo = (path: string) => NextResponse.redirect(new URL(path, publicEnv.appUrl));

  if (!code) return redirectTo("/login?error=oauth_failed");

  const supabase = await createServerClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return redirectTo("/login?error=oauth_failed");

  return redirectTo("/dashboard");
}

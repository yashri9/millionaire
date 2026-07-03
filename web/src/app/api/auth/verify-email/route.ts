import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createServerClient } from "@/lib/supabase/server";
import { publicEnv } from "@/lib/env";

/**
 * GET /api/auth/verify-email (PRD §4.1). The signup confirmation email links
 * here with `token_hash` + `type` (Supabase's recommended SSR-safe flow, vs.
 * the implicit-grant hash fragment which a server route can't read). Confirms
 * the email, establishes the session, then redirects.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = searchParams.get("next") ?? "/dashboard";
  const redirectTo = (path: string) => NextResponse.redirect(new URL(path, publicEnv.appUrl));

  if (!token_hash || !type) return redirectTo("/verify-email?error=invalid_link");

  const supabase = await createServerClient();
  const { error } = await supabase.auth.verifyOtp({ token_hash, type });
  if (error) return redirectTo("/verify-email?error=invalid_link");

  return redirectTo(next);
}

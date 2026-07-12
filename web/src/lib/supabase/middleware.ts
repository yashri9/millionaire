import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { publicEnv, isSupabaseConfigured } from "@/lib/env";

/**
 * Refreshes the Supabase auth session on every request and gates the
 * authenticated (sender) area. The recipient path (/d/:token) and auth pages
 * are always public — recipients NEVER hit a login (PRD §2 auth-boundary rule).
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const path = request.nextUrl.pathname;

  // Stub/dev: no Supabase env → open access so pages/API stubs still render locally.
  // Production: missing env is a deploy misconfig → fail closed on sender routes.
  if (!isSupabaseConfigured()) {
    const publicWhenMisconfigured =
      path === "/" ||
      path.startsWith("/d/") ||
      path.startsWith("/api/d/") ||
      path.startsWith("/login") ||
      path.startsWith("/signup") ||
      path.startsWith("/forgot-password") ||
      path.startsWith("/reset-password") ||
      path.startsWith("/verify-email") ||
      path.startsWith("/check-email") ||
      path.startsWith("/api/auth/");

    if (process.env.NODE_ENV !== "production") return response;
    if (publicWhenMisconfigured) return response;

    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("error", "config");
    return NextResponse.redirect(url);
  }

  const supabase = createServerClient(
    publicEnv.supabaseUrl,
    publicEnv.supabaseAnonKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isPublic =
    path === "/" ||
    path.startsWith("/login") ||
    path.startsWith("/signup") ||
    path.startsWith("/forgot-password") ||
    path.startsWith("/reset-password") ||
    path.startsWith("/verify-email") ||
    path.startsWith("/check-email") ||
    path.startsWith("/d/") || // recipient runtime — always public
    path.startsWith("/api/d/") || // recipient API — token-authed, not login
    path.startsWith("/api/auth/"); // auth endpoints

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", path);
    return NextResponse.redirect(url);
  }

  return response;
}

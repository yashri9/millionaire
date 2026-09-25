import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

/**
 * Refreshes the Supabase auth session on every request and gates the
 * authenticated Studio area. Recipient path (/d/:token) and auth pages
 * stay public. When Supabase is configured, dashboard/decks/account require login.
 *
 * Read NEXT_PUBLIC_* from process.env directly so the Edge middleware
 * bundle picks up .env.local (avoid shared client-safe env module inlining).
 */
function supabaseEdgeConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
  return { url, anonKey, configured: Boolean(url && anonKey) };
}

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const path = request.nextUrl.pathname;

  if (/\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|mjs|map|woff|woff2|ttf|eot)$/i.test(path)) {
    return response;
  }

  const isAuthPage =
    path.startsWith("/login") ||
    path.startsWith("/signup") ||
    path.startsWith("/forgot-password") ||
    path.startsWith("/reset-password") ||
    path.startsWith("/verify-email") ||
    path.startsWith("/check-email") ||
    path.startsWith("/api/auth/");

  const isRecipient =
    path.startsWith("/d/") || path.startsWith("/api/d/");

  // Job worker authenticates itself (CRON_SECRET or signed-in user).
  // Don't gate it here — Edge often can't read encrypted secrets, which
  // left uploads stuck at 40% with pending jobs.
  const isJobsRun = path === "/api/jobs/run";

  const isStudioRoute =
    path.startsWith("/dashboard") ||
    path.startsWith("/decks") ||
    path.startsWith("/account");

  const { url: supabaseUrl, anonKey, configured } = supabaseEdgeConfig();

  // Stub/dev: no Supabase env → open access so local showcase still works.
  if (!configured) {
    const publicWhenMisconfigured =
      path === "/" ||
      isStudioRoute ||
      isRecipient ||
      isAuthPage;

    if (process.env.NODE_ENV !== "production") return response;
    if (publicWhenMisconfigured) return response;

    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("error", "config");
    return NextResponse.redirect(url);
  }

  const supabase = createServerClient(
    supabaseUrl,
    anonKey,
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

  if (path.startsWith("/api/") && !isRecipient && !isAuthPage && !isJobsRun) {
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    return response;
  }

  const isPublic =
    path === "/" ||
    isAuthPage ||
    isRecipient;

  if (!user && isStudioRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", path);
    return NextResponse.redirect(url);
  }

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", path);
    return NextResponse.redirect(url);
  }

  // Already signed in → skip login/signup (keep recovery / verify flows reachable)
  if (
    user &&
    (path.startsWith("/login") || path.startsWith("/signup"))
  ) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}

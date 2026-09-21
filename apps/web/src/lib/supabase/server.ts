import "server-only";

/**
 * Server-side Supabase clients.
 *
 * - `createServerClient()` — request-scoped, reads/writes the auth cookies so
 *   it acts AS THE LOGGED-IN USER. RLS applies. Use this for all sender
 *   (authenticated) routes.
 *
 * - `createServiceClient()` — uses the SERVICE ROLE key and BYPASSES RLS.
 *   Use ONLY for the recipient/token path (fetching a published deck by share
 *   token, writing events/questions) where there is no logged-in user. Never
 *   expose this client or its key to the browser.
 */
import { cookies } from "next/headers";
import { createServerClient as createSSRClient } from "@supabase/ssr";
import { createClient as createRawClient } from "@supabase/supabase-js";
import { publicEnv, serverEnv } from "@/lib/env";

export async function createServerClient() {
  const cookieStore = await cookies();
  return createSSRClient(publicEnv.supabaseUrl, publicEnv.supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          // Called from a Server Component render — safe to ignore; the
          // middleware refresh handles cookie writes.
        }
      },
    },
  });
}

/** SERVICE ROLE client — bypasses RLS. Recipient/service paths only. */
export function createServiceClient() {
  return createRawClient(publicEnv.supabaseUrl, serverEnv.supabaseServiceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

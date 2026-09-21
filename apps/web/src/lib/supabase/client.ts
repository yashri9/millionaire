"use client";

/**
 * Browser Supabase client (uses the anon key + user session cookies).
 * Safe for client components. Never has the service role key.
 */
import { createBrowserClient } from "@supabase/ssr";
import { publicEnv } from "@/lib/env";

export function createClient() {
  return createBrowserClient(publicEnv.supabaseUrl, publicEnv.supabaseAnonKey);
}

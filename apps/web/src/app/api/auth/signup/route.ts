import { handle, notImplemented } from "@/lib/http";

/**
 * POST /api/auth/signup (PRD §4.1). In the Supabase model most auth is done
 * client-side via supabase.auth.signUp (see (auth)/signup). This server route
 * exists for server-driven flows / custom validation if needed.
 * TODO(phase1): server-side create + send verification (or delegate to client).
 */
export async function POST() {
  return handle(async () => notImplemented("Server-side signup (or use client supabase.auth.signUp)"));
}

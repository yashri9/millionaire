import { handle, notImplemented } from "@/lib/http";

/**
 * POST /api/auth/login (PRD §4.2). Usually client-side via
 * supabase.auth.signInWithPassword. Generic error copy only (no enumeration).
 */
export async function POST() {
  return handle(async () => notImplemented("Server-side login (or use client supabase.auth.signInWithPassword)"));
}

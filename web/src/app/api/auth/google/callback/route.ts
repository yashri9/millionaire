import { handle, notImplemented } from "@/lib/http";

/**
 * GET /api/auth/google/callback (PRD §4.1 / §6). Google OAuth is configured in
 * the Supabase dashboard; Supabase typically handles the callback at
 * /auth/v1/callback. This route is a hook point for a custom PKCE exchange +
 * redirect if you route OAuth through the app.
 */
export async function GET() {
  return handle(async () => notImplemented("Exchange OAuth code (supabase.auth.exchangeCodeForSession) + redirect"));
}

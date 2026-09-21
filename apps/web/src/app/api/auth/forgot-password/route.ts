import { handle, notImplemented } from "@/lib/http";

/** POST /api/auth/forgot-password (PRD §4.3). Neutral response either way. */
export async function POST() {
  return handle(async () => notImplemented("resetPasswordForEmail; always respond neutrally"));
}

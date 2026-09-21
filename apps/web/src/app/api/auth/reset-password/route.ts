import { handle, notImplemented } from "@/lib/http";

/** POST /api/auth/reset-password (PRD §4.3). Token single-use, 1h expiry. */
export async function POST() {
  return handle(async () => notImplemented("Verify recovery token + updateUser password"));
}

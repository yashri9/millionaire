import { handle, notImplemented } from "@/lib/http";

/** GET /api/auth/verify-email (PRD §4.1). Confirms email, then redirect. */
export async function GET() {
  return handle(async () => notImplemented("Handle email confirmation callback + redirect to /dashboard"));
}

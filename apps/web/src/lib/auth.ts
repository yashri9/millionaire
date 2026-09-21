import "server-only";

/**
 * Auth helpers for sender (authenticated) routes.
 *
 * `requireUser()` returns the logged-in user or throws an ApiError(401).
 * Every user-scoped API route should call this first, then check ownership
 * with lib/ownership.ts. The recipient path never uses these — it is
 * token-based (see lib/tokens + the /api/d/[token] routes).
 */
import { createServerClient } from "@/lib/supabase/server";
import { ApiError } from "@/lib/http";
import type { User } from "@supabase/supabase-js";

export async function getUser(): Promise<User | null> {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

export async function requireUser(): Promise<User> {
  const user = await getUser();
  if (!user) throw new ApiError(401, "Not authenticated");
  return user;
}

/** PRD §4.8: publishing requires a verified email. Login itself is allowed. */
export function assertEmailVerified(user: User): void {
  const verified = Boolean(user.email_confirmed_at ?? user.confirmed_at);
  if (!verified) {
    throw new ApiError(403, "Verify your email before publishing decks.");
  }
}

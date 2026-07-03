import { requireUser, assertEmailVerified } from "@/lib/auth";
import { assertDeckOwner } from "@/lib/ownership";
import { handle, notImplemented } from "@/lib/http";

type Ctx = { params: Promise<{ id: string }> };

/**
 * POST /api/decks/:id/publish — validate + snapshot + create/rotate share
 * (PRD §4.8). Publish requires verified email + every slide has narration +
 * at least one slide.
 *
 * Adopted §14 default: republishing REQUIRES explicit confirm and creates a
 * NEW immutable script_versions snapshot; the existing share token is preserved
 * (links already sent keep working) — the pointer is only advanced on confirm.
 * Use lib/tokens.generateShareToken for new tokens (non-enumerable).
 */
export async function POST(_req: Request, { params }: Ctx) {
  return handle(async () => {
    const { id } = await params;
    const user = await requireUser();
    assertEmailVerified(user);
    await assertDeckOwner(id, user.id);
    return notImplemented(
      "Validate narration; snapshot script_versions(is_published=true); create/rotate share; return /d/{token}",
    );
  });
}

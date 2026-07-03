import { requireUser } from "@/lib/auth";
import { assertDeckOwner } from "@/lib/ownership";
import { handle, notImplemented } from "@/lib/http";

type Ctx = { params: Promise<{ id: string }> };

/**
 * POST /api/decks/:id/parse — (internal/async trigger) parse uploaded file into
 * slides (PRD §6). Runs the parse job; on no-text surface manual-entry; on
 * crash set status=parse_failed (never fail silently).
 */
export async function POST(_req: Request, { params }: Ctx) {
  return handle(async () => {
    const { id } = await params;
    const user = await requireUser();
    await assertDeckOwner(id, user.id);
    return notImplemented("Run parseDeck (lib/parse), write slides, set status=draft|parse_failed");
  });
}

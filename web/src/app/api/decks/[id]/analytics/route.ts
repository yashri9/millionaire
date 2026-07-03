import { requireUser } from "@/lib/auth";
import { assertDeckOwner } from "@/lib/ownership";
import { handle, notImplemented } from "@/lib/http";

type Ctx = { params: Promise<{ id: string }> };

/**
 * GET /api/decks/:id/analytics — sessions/events/questions summary (PRD §4.10).
 * Owner-only. Client polls every 15s.
 */
export async function GET(_req: Request, { params }: Ctx) {
  return handle(async () => {
    const { id } = await params;
    const user = await requireUser();
    await assertDeckOwner(id, user.id);
    return notImplemented("Aggregate opens / unique sessions / completion / per-slide drop-off / question log");
  });
}

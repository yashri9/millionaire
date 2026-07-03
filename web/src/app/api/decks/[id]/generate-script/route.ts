import { requireUser } from "@/lib/auth";
import { assertDeckOwner } from "@/lib/ownership";
import { handle, notImplemented } from "@/lib/http";

type Ctx = { params: Promise<{ id: string }> };

/**
 * POST /api/decks/:id/generate-script — call the LLM to draft narration and
 * create a draft script_versions row (PRD §4.6). Explicit user action only.
 *
 * TODO(phase1): load slides, call generateNarration(slides) from lib/prompts,
 * retry once on failure, expose per-slide regenerate; never discard the whole
 * deck on one bad slide.
 */
export async function POST(_req: Request, { params }: Ctx) {
  return handle(async () => {
    const { id } = await params;
    const user = await requireUser();
    await assertDeckOwner(id, user.id);
    return notImplemented("generateNarration(slides) → insert draft script_versions row");
  });
}

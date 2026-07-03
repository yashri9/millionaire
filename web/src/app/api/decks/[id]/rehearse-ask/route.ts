import { requireUser } from "@/lib/auth";
import { assertDeckOwner } from "@/lib/ownership";
import { handle, ApiError } from "@/lib/http";
import { createServerClient } from "@/lib/supabase/server";
import { answerQuestion, escalationLine } from "@/lib/prompts";

type Ctx = { params: Promise<{ id: string }> };

/**
 * POST /api/decks/:id/rehearse-ask — grounded Q&A during the pre-publish
 * "walk through your build" rehearsal (Studio parity with backend/server.py's
 * /ask). Owner-only, not rate-limited (the owner is testing their own deck),
 * and not persisted — this is a rehearsal against the current draft
 * narration, not real recipient data (see lib/recipient.ts / /api/d/[token]/ask
 * for the real, persisted, rate-limited recipient path).
 */
export async function POST(req: Request, { params }: Ctx) {
  return handle(async () => {
    const { id } = await params;
    const user = await requireUser();
    await assertDeckOwner(id, user.id);

    const body = (await req.json()) as { question?: string; rep_name?: string };
    const question = (body.question ?? "").trim();
    const repName = body.rep_name?.trim() || "the rep";
    if (!question) throw new ApiError(400, "Empty question");

    const supabase = await createServerClient();
    const { data: slides } = await supabase
      .from("slides")
      .select("order_index, title, bullets")
      .eq("deck_id", id)
      .order("order_index");
    if (!slides || slides.length === 0) throw new ApiError(409, "This deck has no slides yet");

    try {
      const result = await answerQuestion(
        question,
        slides.map((s) => ({
          index: s.order_index,
          title: s.title,
          text: [s.title, ...(s.bullets ?? [])].filter(Boolean).join("\n"),
        })),
        repName,
      );
      return Response.json(result);
    } catch {
      return Response.json({
        escalate: true,
        answer: escalationLine(repName),
        slide_ref: null,
        confidence: 0,
      });
    }
  });
}

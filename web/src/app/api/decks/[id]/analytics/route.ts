import { requireUser } from "@/lib/auth";
import { assertDeckOwner } from "@/lib/ownership";
import { handle } from "@/lib/http";
import { createServerClient } from "@/lib/supabase/server";

type Ctx = { params: Promise<{ id: string }> };

/**
 * GET /api/decks/:id/analytics — sessions/events/questions summary (PRD §4.10).
 * Owner-only. Client polls every 15s. Aggregates across every share the deck
 * has ever had (not just the currently-active token), so revoking/republishing
 * doesn't reset the numbers.
 */
export async function GET(_req: Request, { params }: Ctx) {
  return handle(async () => {
    const { id } = await params;
    const user = await requireUser();
    await assertDeckOwner(id, user.id);

    const supabase = await createServerClient();

    const [{ data: slides }, { data: shares }] = await Promise.all([
      supabase.from("slides").select("order_index, title").eq("deck_id", id).order("order_index"),
      supabase.from("shares").select("id").eq("deck_id", id),
    ]);

    const shareIds = (shares ?? []).map((s) => s.id);
    const empty = {
      totalOpens: 0,
      completedCount: 0,
      completionRate: 0,
      perSlide: (slides ?? []).map((s) => ({ order_index: s.order_index, title: s.title, views: 0 })),
      questions: [] as unknown[],
    };
    if (shareIds.length === 0) return Response.json(empty);

    const { data: sessions } = await supabase.from("sessions").select("id, completed").in("share_id", shareIds);
    const sessionIds = (sessions ?? []).map((s) => s.id);
    if (sessionIds.length === 0) return Response.json(empty);

    const [{ data: events }, { data: questions }] = await Promise.all([
      supabase.from("events").select("type, payload").in("session_id", sessionIds).eq("type", "slide_viewed"),
      supabase
        .from("questions")
        .select("text, answer_text, escalated, confidence, slide_ref, created_at")
        .in("session_id", sessionIds)
        .order("created_at", { ascending: false }),
    ]);

    const viewsBySlide = new Map<number, number>();
    for (const e of events ?? []) {
      const slideIndex = (e.payload as { slide_index?: number } | null)?.slide_index;
      if (typeof slideIndex === "number") viewsBySlide.set(slideIndex, (viewsBySlide.get(slideIndex) ?? 0) + 1);
    }

    const totalOpens = sessions!.length;
    const completedCount = sessions!.filter((s) => s.completed).length;

    return Response.json({
      totalOpens,
      completedCount,
      completionRate: totalOpens > 0 ? Math.round((completedCount / totalOpens) * 100) : 0,
      perSlide: (slides ?? []).map((s) => ({
        order_index: s.order_index,
        title: s.title,
        views: viewsBySlide.get(s.order_index) ?? 0,
      })),
      questions: questions ?? [],
    });
  });
}

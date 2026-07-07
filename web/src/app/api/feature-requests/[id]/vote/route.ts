import { requireUser } from "@/lib/auth";
import { handle } from "@/lib/http";
import { createServerClient } from "@/lib/supabase/server";

type Ctx = { params: Promise<{ id: string }> };

/** POST /api/feature-requests/:id/vote — toggle the signed-in user's vote. */
export async function POST(_req: Request, { params }: Ctx) {
  return handle(async () => {
    const { id } = await params;
    const user = await requireUser();
    const supabase = await createServerClient();

    const { data: existing } = await supabase
      .from("feature_request_votes")
      .select("request_id")
      .eq("request_id", id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (existing) {
      await supabase.from("feature_request_votes").delete().eq("request_id", id).eq("user_id", user.id);
    } else {
      await supabase.from("feature_request_votes").insert({ request_id: id, user_id: user.id });
    }

    const { count } = await supabase
      .from("feature_request_votes")
      .select("*", { count: "exact", head: true })
      .eq("request_id", id);

    return Response.json({ voted: !existing, vote_count: count ?? 0 });
  });
}

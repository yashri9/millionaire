import { requireUser } from "@/lib/auth";
import { handle, ApiError } from "@/lib/http";
import { createServerClient } from "@/lib/supabase/server";

const MAX_TITLE = 140;
const MAX_DETAILS = 2000;

/**
 * GET /api/feature-requests — the shared board, every signed-in user sees
 * the same list (feature_requests has no owner-scoped RLS, unlike decks).
 * ?sort=trending (default, by vote count) or ?sort=new (by created_at).
 */
export async function GET(req: Request) {
  return handle(async () => {
    const user = await requireUser();
    const sort = new URL(req.url).searchParams.get("sort") === "new" ? "new" : "trending";

    const supabase = await createServerClient();
    const [{ data: requests, error: reqError }, { data: votes, error: voteError }] = await Promise.all([
      supabase.from("feature_requests").select("id, title, details, created_at").order("created_at", { ascending: false }),
      supabase.from("feature_request_votes").select("request_id, user_id"),
    ]);
    if (reqError) throw reqError;
    if (voteError) throw voteError;

    const countByRequest = new Map<string, number>();
    const votedByMe = new Set<string>();
    for (const v of votes ?? []) {
      countByRequest.set(v.request_id, (countByRequest.get(v.request_id) ?? 0) + 1);
      if (v.user_id === user.id) votedByMe.add(v.request_id);
    }

    let list = (requests ?? []).map((r) => ({
      ...r,
      vote_count: countByRequest.get(r.id) ?? 0,
      voted_by_me: votedByMe.has(r.id),
    }));

    if (sort === "trending") {
      list = list.sort((a, b) => b.vote_count - a.vote_count || b.created_at.localeCompare(a.created_at));
    }

    return Response.json({ requests: list });
  });
}

/** POST /api/feature-requests — submit a new request. Body: { title, details? } */
export async function POST(req: Request) {
  return handle(async () => {
    const user = await requireUser();
    const body = (await req.json().catch(() => null)) as { title?: string; details?: string } | null;
    const title = body?.title?.trim();
    if (!title) throw new ApiError(400, "Give it a short, descriptive title");
    if (title.length > MAX_TITLE) throw new ApiError(400, `Title must be ${MAX_TITLE} characters or fewer`);
    const details = body?.details?.trim() || null;
    if (details && details.length > MAX_DETAILS) throw new ApiError(400, `Details must be ${MAX_DETAILS} characters or fewer`);

    const supabase = await createServerClient();
    const { data, error } = await supabase
      .from("feature_requests")
      .insert({ user_id: user.id, title, details })
      .select("id, title, details, created_at")
      .single();
    if (error) throw error;

    return Response.json({ request: { ...data, vote_count: 0, voted_by_me: false } }, { status: 201 });
  });
}

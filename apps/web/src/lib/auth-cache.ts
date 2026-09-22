import { cache } from "react";
import { createServerClient } from "@/lib/supabase/server";

/** Deduped within a single RSC render pass (P1 auth latency). */
export const getCachedUser = cache(async () => {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});

export const getCachedDeckList = cache(async (userId: string) => {
  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from("decks")
    .select(
      "id, title, status, last_viewed_slide_index, created_at, updated_at, slides(count)",
    )
    .eq("user_id", userId)
    .is("deleted_at", null)
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row) => {
    const slideCountRaw = (row as { slides?: { count: number }[] | null }).slides;
    const slide_count = Array.isArray(slideCountRaw)
      ? Number(slideCountRaw[0]?.count ?? 0)
      : 0;
    const { slides: _s, ...rest } = row as typeof row & { slides?: unknown };
    return { ...rest, slide_count };
  });
});

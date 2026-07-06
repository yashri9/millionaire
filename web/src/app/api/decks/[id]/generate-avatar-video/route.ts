import { requireUser } from "@/lib/auth";
import { assertDeckOwner } from "@/lib/ownership";
import { handle, ApiError } from "@/lib/http";
import { createServerClient, createServiceClient } from "@/lib/supabase/server";
import { generateAvatarVideo, AvatarVideoError } from "@/lib/avatarVideo";
import { serverEnv } from "@/lib/env";

type Ctx = { params: Promise<{ id: string }> };

/**
 * POST /api/decks/:id/generate-avatar-video — real AI talking-avatar video
 * for one slide's narration, via lib/avatarVideo.ts (D-ID). NOT linked from
 * any UI yet — see that file's header comment for what's still undecided
 * (avatar source photo, real plan/billing gate) before this should be
 * exposed to users. Callable directly today if you want to try it with a
 * DID_API_KEY + DID_AVATAR_IMAGE_URL configured.
 *
 * Body: { slide_id: string }
 */
export async function POST(req: Request, { params }: Ctx) {
  return handle(async () => {
    const { id } = await params;
    const user = await requireUser();
    await assertDeckOwner(id, user.id);

    const body = (await req.json().catch(() => null)) as { slide_id?: string } | null;
    const slideId = body?.slide_id;
    if (!slideId) throw new ApiError(400, "slide_id is required");

    const supabase = await createServerClient();
    const [{ data: slide }, { data: draft }] = await Promise.all([
      supabase.from("slides").select("id, deck_id").eq("id", slideId).eq("deck_id", id).single(),
      supabase
        .from("script_versions")
        .select("narration")
        .eq("deck_id", id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
    if (!slide) throw new ApiError(404, "Slide not found on this deck");

    const narration = (draft?.narration as { slide_id: string; text: string }[] | undefined)?.find(
      (n) => n.slide_id === slideId,
    )?.text;
    if (!narration?.trim()) throw new ApiError(409, "This slide has no narration yet");

    let resultUrl: string;
    try {
      resultUrl = await generateAvatarVideo(narration);
    } catch (err) {
      if (err instanceof AvatarVideoError) throw new ApiError(err.status, err.message);
      throw new ApiError(502, "Avatar video generation failed. Try again.");
    }

    // D-ID's result_url is only valid ~24h — download and re-host it in our
    // own private bucket immediately, same reasoning as the rendered page
    // images in lib/storage.ts.
    const videoRes = await fetch(resultUrl);
    if (!videoRes.ok) throw new ApiError(502, "Couldn't download the generated video from D-ID");
    const videoBytes = await videoRes.arrayBuffer();

    const storage = createServiceClient();
    const path = `${user.id}/${id}/avatars/${slideId}.mp4`;
    const { error: uploadError } = await storage.storage
      .from(serverEnv.decksBucket)
      .upload(path, videoBytes, { contentType: "video/mp4", upsert: true });
    if (uploadError) throw new ApiError(502, `Could not store the avatar video: ${uploadError.message}`);

    await supabase.from("slides").update({ avatar_video_path: path }).eq("id", slideId);

    const { data: signed } = await storage.storage.from(serverEnv.decksBucket).createSignedUrl(path, 60 * 60);
    return Response.json({ avatar_video_url: signed?.signedUrl ?? null });
  });
}

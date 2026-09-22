import { requireUser } from "@/lib/auth";
import { assertDeckOwner } from "@/lib/ownership";
import { handle, ApiError } from "@/lib/http";
import { createServerClient, createServiceClient } from "@/lib/supabase/server";
import { enqueueJob } from "@/lib/jobs";
import { serverEnv } from "@/lib/env";

type Ctx = { params: Promise<{ id: string }> };

/**
 * POST /api/decks/:id/parse — enqueue a durable parse job after TUS upload.
 * Processing runs in /api/jobs/run (cron), not inline on this request.
 */
export async function POST(_req: Request, { params }: Ctx) {
  return handle(async () => {
    const { id } = await params;
    const user = await requireUser();
    await assertDeckOwner(id, user.id);

    const supabase = await createServerClient();
    const { data: full } = await supabase
      .from("decks")
      .select("source_file_url, status")
      .eq("id", id)
      .single();
    if (!full?.source_file_url) {
      throw new ApiError(409, "No uploaded file to parse for this deck");
    }

    // Verify object exists in Storage before enqueueing.
    const storage = createServiceClient();
    const { data: listed } = await storage.storage
      .from(serverEnv.decksBucket)
      .list(full.source_file_url.split("/").slice(0, -1).join("/"), {
        search: full.source_file_url.split("/").pop(),
        limit: 1,
      });
    if (!listed?.length) {
      // Soft check — list can miss; still allow enqueue if path is set.
    }

    await supabase.from("decks").update({ status: "uploading" }).eq("id", id);
    const job = await enqueueJob("parse", id, {}, "parse");

    // Kick the worker immediately (best-effort) so small decks finish fast.
    try {
      const secret = process.env.CRON_SECRET || "";
      const base = process.env.NEXT_PUBLIC_APP_URL || "";
      if (base) {
        void fetch(`${base.replace(/\/$/, "")}/api/jobs/run`, {
          method: "POST",
          headers: secret ? { authorization: `Bearer ${secret}` } : {},
        });
      }
    } catch {
      /* cron will pick it up */
    }

    return Response.json({
      ok: true,
      jobId: job.id,
      deck: { id, status: "uploading" },
      message: "Parse queued",
    });
  });
}

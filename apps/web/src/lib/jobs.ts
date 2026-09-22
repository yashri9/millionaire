import "server-only";

/**
 * Durable job queue using the `jobs` table (FOR UPDATE SKIP LOCKED).
 * Optional pgmq mirror is best-effort; free-tier Postgres is the source of truth.
 */
import { createServiceClient } from "@/lib/supabase/server";
import { processDeckUpload, buildRenderWarning } from "@/lib/deckProcessor";
import { uploadRenderedImages } from "@/lib/storage";
import { serverEnv, publicEnv } from "@/lib/env";
import { sendEscalationEmail } from "@/lib/email";

export type JobType =
  | "parse"
  | "generate_script"
  | "tts_pregen"
  | "escalation_notify";
export type JobStatus = "pending" | "running" | "done" | "failed";

export type Job = {
  id: string;
  type: JobType;
  deck_id: string;
  status: JobStatus;
  error: string | null;
  attempts: number;
  payload?: Record<string, unknown>;
  step?: string | null;
};

const MAX_ATTEMPTS = 5;

function backoffSeconds(attempts: number): number {
  const base = Math.min(300, Math.pow(2, Math.max(0, attempts)) * 2);
  const jitter = Math.floor(Math.random() * base * 0.25);
  return base + jitter;
}

export async function enqueueJob(
  type: JobType,
  deckId: string,
  payload: Record<string, unknown> = {},
  step?: string,
): Promise<Job> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("jobs")
    .insert({
      type,
      deck_id: deckId,
      status: "pending",
      payload,
      step: step ?? type,
      run_after: new Date().toISOString(),
      attempts: 0,
    })
    .select("id, type, deck_id, status, error, attempts, payload, step")
    .single();
  if (error || !data) {
    throw error ?? new Error("Failed to enqueue job");
  }

  // Best-effort pgmq mirror (ignore if extension/queue missing).
  try {
    await supabase.rpc("pgmq_send", {
      queue_name: "deck_pipeline",
      msg: { job_id: data.id, type, deck_id: deckId },
    });
  } catch {
    /* optional */
  }

  return data as Job;
}

async function claimJobs(limit = 3): Promise<Job[]> {
  const supabase = createServiceClient();
  const now = new Date().toISOString();

  // Atomic claim via RPC if present; otherwise two-step claim.
  const { data: rpcData, error: rpcError } = await supabase.rpc("claim_pending_jobs", {
    p_limit: limit,
    p_now: now,
  });
  if (!rpcError && Array.isArray(rpcData) && rpcData.length > 0) {
    return rpcData as Job[];
  }

  const { data: pending } = await supabase
    .from("jobs")
    .select("id, type, deck_id, status, error, attempts, payload, step")
    .eq("status", "pending")
    .lte("run_after", now)
    .order("created_at", { ascending: true })
    .limit(limit);

  const claimed: Job[] = [];
  for (const row of pending ?? []) {
    const { data: updated } = await supabase
      .from("jobs")
      .update({
        status: "running",
        attempts: (row.attempts ?? 0) + 1,
      })
      .eq("id", row.id)
      .eq("status", "pending")
      .select("id, type, deck_id, status, error, attempts, payload, step")
      .maybeSingle();
    if (updated) claimed.push(updated as Job);
  }
  return claimed;
}

async function markDone(jobId: string) {
  const supabase = createServiceClient();
  await supabase.from("jobs").update({ status: "done", error: null }).eq("id", jobId);
}

async function markFailedOrRetry(job: Job, message: string) {
  const supabase = createServiceClient();
  if (job.attempts >= MAX_ATTEMPTS) {
    await supabase
      .from("jobs")
      .update({ status: "failed", error: message })
      .eq("id", job.id);
    if (job.type === "parse" || job.type === "generate_script") {
      await supabase
        .from("decks")
        .update({ status: "parse_failed", render_warning: message })
        .eq("id", job.deck_id);
    }
    return;
  }
  const delay = backoffSeconds(job.attempts);
  await supabase
    .from("jobs")
    .update({
      status: "pending",
      error: message,
      run_after: new Date(Date.now() + delay * 1000).toISOString(),
    })
    .eq("id", job.id);
}

async function runParseJob(job: Job) {
  const supabase = createServiceClient();
  const { data: deck } = await supabase
    .from("decks")
    .select("id, user_id, source_file_url, title")
    .eq("id", job.deck_id)
    .single();
  if (!deck?.source_file_url || !deck.user_id) {
    throw new Error("No uploaded file to parse for this deck");
  }

  const storage = createServiceClient();
  const { data: blob, error: downloadError } = await storage.storage
    .from(serverEnv.decksBucket)
    .download(deck.source_file_url);
  if (downloadError || !blob) {
    throw new Error(`Could not read stored file: ${downloadError?.message}`);
  }

  const filename = deck.source_file_url.split("/").pop() ?? "upload.pdf";
  const basePath = `${deck.user_id}/${deck.id}`;
  const bytes = await blob.arrayBuffer();

  const processed = await processDeckUpload(bytes, filename);
  const { paths: imagePaths, failedSlides } = await uploadRenderedImages(
    storage,
    basePath,
    processed.images,
  );
  const { rendered, render_warning } = buildRenderWarning(processed, failedSlides);

  await supabase.from("slides").delete().eq("deck_id", job.deck_id);
  const { error: slidesError } = await supabase.from("slides").insert(
    processed.slides.map((s) => ({
      deck_id: job.deck_id,
      order_index: s.order_index,
      title: s.title,
      bullets: s.bullets,
      image_path: imagePaths.get(s.order_index)?.image_path ?? null,
      thumb_path: imagePaths.get(s.order_index)?.thumb_path ?? null,
    })),
  );
  if (slidesError) throw slidesError;

  await supabase
    .from("decks")
    .update({ status: "draft", rendered, render_warning })
    .eq("id", job.deck_id);

  if (render_warning) {
    const { trackPipelineEvent } = await import("@/lib/observe");
    trackPipelineEvent("render_warning", { deckId: job.deck_id, render_warning });
  }

  await enqueueJob("generate_script", job.deck_id, {}, "generate_script");
}

async function runGenerateScriptJob(job: Job) {
  const supabase = createServiceClient();
  const [{ data: deck }, { data: slides }] = await Promise.all([
    supabase.from("decks").select("id, title").eq("id", job.deck_id).single(),
    supabase
      .from("slides")
      .select("id, order_index, title, bullets")
      .eq("deck_id", job.deck_id)
      .order("order_index"),
  ]);
  if (!deck || !slides?.length) throw new Error("Deck has no slides for scripting");

  const { generateNarrationForDeck } = await import("@/lib/prompts");
  const slidePayload = slides.map((s) => ({
    slideNo: s.order_index,
    totalSlides: slides.length,
    fingerprint: String(s.id).slice(0, 80),
    titleText: s.title,
    bodyText: Array.isArray(s.bullets) ? (s.bullets as string[]) : [],
    possibleChartRegions: [] as string[][],
    labeledFacts: [] as { series: string; label: string; value: string }[],
    imageCaptions: [] as string[],
    footnotes: [] as string[],
    extractionMethod: "text-layer" as const,
    ocrDetectedChart: false,
  }));

  const results = await generateNarrationForDeck(slidePayload, {
    companyName: deck.title,
    deckPurpose: "pitch",
  });
  const byNo = new Map(results.map((r) => [r.slideNo, r]));
  const narration = slides.map((s) => ({
    slide_id: s.id,
    text: byNo.get(s.order_index)?.narration || s.title || "",
  }));

  const { data: latest } = await supabase
    .from("script_versions")
    .select("id, is_published")
    .eq("deck_id", job.deck_id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (latest && !latest.is_published) {
    await supabase.from("script_versions").update({ narration }).eq("id", latest.id);
  } else {
    await supabase.from("script_versions").insert({
      deck_id: job.deck_id,
      is_published: false,
      narration,
    });
  }

  await enqueueJob("tts_pregen", job.deck_id, {}, "tts_pregen");
}

async function runTtsPregenJob(job: Job) {
  // Placeholder until Storage-backed TTS cache is wired — mark done so pipeline completes.
  // Real pre-gen runs from publish / tts cache module (P1).
  void job;
}

async function runEscalationNotifyJob(job: Job) {
  const payload = (job.payload ?? {}) as {
    to?: string;
    repName?: string;
    question?: string;
    analyticsUrl?: string;
  };
  if (!payload.to || !payload.question) {
    throw new Error("escalation_notify missing payload");
  }
  const result = await sendEscalationEmail({
    to: payload.to,
    repName: payload.repName || "there",
    question: payload.question,
    analyticsUrl: payload.analyticsUrl || publicEnv.appUrl,
  });
  if (result.status === "failed") {
    throw new Error(result.error || "Escalation email failed");
  }
  const { trackPipelineEvent } = await import("@/lib/observe");
  trackPipelineEvent("escalation_delivered", { deckId: job.deck_id });
}

async function executeJob(job: Job) {
  switch (job.type) {
    case "parse":
      await runParseJob(job);
      break;
    case "generate_script":
      await runGenerateScriptJob(job);
      break;
    case "tts_pregen":
      await runTtsPregenJob(job);
      break;
    case "escalation_notify":
      await runEscalationNotifyJob(job);
      break;
    default:
      throw new Error(`Unknown job type: ${job.type}`);
  }
}

export async function runPendingJobs(): Promise<{ processed: number; errors: string[] }> {
  const claimed = await claimJobs(3);
  const errors: string[] = [];
  let processed = 0;

  for (const job of claimed) {
    try {
      await executeJob(job);
      await markDone(job.id);
      processed += 1;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Job failed";
      errors.push(`${job.id}: ${message}`);
      await markFailedOrRetry(job, message);
    }
  }

  return { processed, errors };
}

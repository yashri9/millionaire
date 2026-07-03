import "server-only";

/**
 * jobs.ts — lightweight background job design (PRD §4.5, §10).
 *
 * Deliberately simple (no SQS/queue infra at this scale). A `jobs` table +
 * a poller is enough:
 *
 *   jobs(id, type, deck_id, status[pending|running|done|failed], error,
 *        attempts, created_at, updated_at)
 *
 * Flow for upload->parse:
 *   1. POST /api/decks stores the file to Supabase Storage, inserts a deck row
 *      (status=uploading) and a `jobs` row (type=parse, status=pending).
 *   2. A worker (Supabase Edge Function on a pg_cron schedule, or a Vercel Cron
 *      route hitting /api/internal/run-jobs) claims pending jobs, runs
 *      parseDeck(), writes slides, sets deck.status=draft or parse_failed.
 *   3. The upload UI polls GET /api/decks/:id until status leaves "uploading".
 *
 * This file defines the interface + enqueue stub; the worker is a TODO.
 */

export type JobType = "parse" | "generate_script";
export type JobStatus = "pending" | "running" | "done" | "failed";

export type Job = {
  id: string;
  type: JobType;
  deck_id: string;
  status: JobStatus;
  error: string | null;
  attempts: number;
};

export async function enqueueJob(_type: JobType, _deckId: string): Promise<void> {
  // TODO(phase1): insert into `jobs` table via the service client.
  throw new Error("enqueueJob not implemented yet — see jobs.ts design");
}

export async function runPendingJobs(): Promise<{ processed: number }> {
  // TODO(phase1): claim pending jobs (SELECT ... FOR UPDATE SKIP LOCKED),
  // run parse/generate, update deck + job status, retry with backoff.
  throw new Error("runPendingJobs not implemented yet — see jobs.ts design");
}

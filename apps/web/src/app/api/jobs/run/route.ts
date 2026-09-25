import { handle, ApiError } from "@/lib/http";
import { runPendingJobs } from "@/lib/jobs";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

/**
 * GET/POST /api/jobs/run — Vercel Cron (or manual) worker entrypoint.
 * Auth: CRON_SECRET (Bearer / ?secret=), or a signed-in user (upload poll kick).
 */
async function assertCronAuth(req: Request) {
  const secret = process.env.CRON_SECRET || "";
  const header = req.headers.get("authorization") || "";
  const bearer = header.startsWith("Bearer ") ? header.slice(7) : "";
  const url = new URL(req.url);
  const querySecret = url.searchParams.get("secret") || "";

  if (secret && (bearer === secret || querySecret === secret)) return;
  if (!secret && process.env.NODE_ENV !== "production") return;

  // Upload UI polls this while waiting — allow any signed-in user to kick.
  try {
    const { requireUser } = await import("@/lib/auth");
    await requireUser();
    return;
  } catch {
    /* fall through */
  }

  if (!secret) throw new ApiError(503, "CRON_SECRET is not configured");
  throw new ApiError(401, "Unauthorized");
}

async function run(req: Request) {
  return handle(async () => {
    await assertCronAuth(req);
    const result = await runPendingJobs();
    return Response.json({ ok: true, ...result });
  });
}

export async function GET(req: Request) {
  return run(req);
}

export async function POST(req: Request) {
  return run(req);
}

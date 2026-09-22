import { handle, ApiError } from "@/lib/http";
import { runPendingJobs } from "@/lib/jobs";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

/**
 * GET/POST /api/jobs/run — Vercel Cron (or manual) worker entrypoint.
 * Secured by CRON_SECRET (Authorization: Bearer … or ?secret=).
 */
function assertCronAuth(req: Request) {
  const secret = process.env.CRON_SECRET || "";
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      throw new ApiError(503, "CRON_SECRET is not configured");
    }
    return;
  }
  const header = req.headers.get("authorization") || "";
  const bearer = header.startsWith("Bearer ") ? header.slice(7) : "";
  const url = new URL(req.url);
  const querySecret = url.searchParams.get("secret") || "";
  if (bearer !== secret && querySecret !== secret) {
    throw new ApiError(401, "Unauthorized");
  }
}

async function run(req: Request) {
  return handle(async () => {
    assertCronAuth(req);
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

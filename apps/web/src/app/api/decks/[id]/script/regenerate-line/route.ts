import { handle, ApiError } from "@/lib/http";

type Ctx = { params: Promise<{ id: string }> };

/**
 * @deprecated Removed. Use POST /api/script/rewrite (Shorten / Punch / Regenerate
 * in the editor) which shares the grounded refine path.
 */
export async function POST(_req: Request, { params }: Ctx) {
  return handle(async () => {
    await params;
    throw new ApiError(
      410,
      "This endpoint is retired. Use /api/script/rewrite from the editor refine controls.",
    );
  });
}

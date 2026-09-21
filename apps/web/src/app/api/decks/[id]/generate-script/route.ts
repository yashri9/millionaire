import { handle, ApiError } from "@/lib/http";

type Ctx = { params: Promise<{ id: string }> };

/**
 * @deprecated Removed. Primary narration is POST /api/script/generate with
 * structured SlideContent from the client PDF parse (OCR + reconcile + gates).
 * Do not rebuild narration from title/bullets alone.
 */
export async function POST(_req: Request, { params }: Ctx) {
  return handle(async () => {
    await params;
    throw new ApiError(
      410,
      "This endpoint is retired. Upload a PDF in the studio — narration runs via /api/script/generate from structured slide content.",
    );
  });
}

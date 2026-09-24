# Cloud Vision OCR fallback

## The chain

Every PDF page goes through up to three steps, cheapest first, and stops at the first one that gives readable text:

1. pdf.js text layer. Free, instant and exact. Most decks are exported from PowerPoint, Keynote, Canva or Google Slides, so this is all they need.
2. Tesseract.js in the browser. Free and runs on the device. It handles image slides with clean text.
3. Google Cloud Vision DOCUMENT_TEXT_DETECTION. Only called when both steps above come up short: scans, phone photos of slides, low-contrast or rotated text.

"Short" is decided by `shouldEscalateToVision` in `domains/narration/src/ocr-fallback.ts`: fewer than 40 characters, fewer than 4 real words, less than 60% letters and digits, or Tesseract confidence under 55.

## Files

- `domains/narration/src/ocr-fallback.ts` - pure logic: when to escalate, request builder, response parser, picking Tesseract vs Vision, cache path.
- `apps/web/src/lib/google-vision.ts` - server-only call to `v1/images:annotate` with the `x-goog-api-key` header, retries, error mapping.
- `apps/web/src/lib/vision-ocr-cache.ts` - Supabase Storage cache at `ocr/vision-document/<aa>/<sha256>.json` in the decks bucket.
- `apps/web/src/app/api/ocr/vision/route.ts` - `POST /api/ocr/vision`: auth, size cap, cache, per-user and monthly caps, then Vision.
- `apps/web/src/lib/vision-ocr-client.ts` - renders the page at 1600px, calls the route, never throws.
- `apps/web/src/lib/pdf-parse.ts` - wires step 3 in after Tesseract.
- `apps/web/src/lib/ocr.ts` - `ocrCanvasDetailed` returns Tesseract confidence too.

## Env

- `GOOGLE_TTS_API_KEY` - the same key as TTS. The key must be allowed to call Cloud Vision API.
- `GOOGLE_VISION_API_KEY` - optional. Overrides the TTS key if you ever split them.
- `VISION_MONTHLY_PAGE_CAP` - optional, default 900. Project-wide hard stop per 30-day window.
- `VISION_PAGES_PER_USER_PER_HOUR` - optional, default 60.

## Tests

- `npm test -w @voxdeck/narration` - unit tests plus an offline eval over a mixed deck (no key, no cost).
- `GOOGLE_TTS_API_KEY=... node --experimental-strip-types --test apps/web/evals/vision.live.eval.ts` - one real Vision call on a fake scanned slide.

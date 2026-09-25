# Cloud Vision OCR

## How text is chosen

Every rendered page is sent to Google Cloud Vision `DOCUMENT_TEXT_DETECTION`. The spoken/script text for that slide is then:

```
pickSlideText(textLayer, visionText)
```

Vision wins by default — it reads what the viewer sees (text inside images, charts, outlined fonts) in visual reading order. The pdf.js text layer is kept only when Vision is empty, unreadable, or clearly missed most of a rich born-digital page.

That logic lives in `domains/narration/src/ocr-fallback.ts` (`pickSlideText`).

## Server parse job (cloud path, Vision-primary)

The `parse` job OCRs every rendered page with Cloud Vision.

- `apps/web/src/lib/render.ts` renders each page once at 2560px and yields the WebP image (q92), a 640px thumbnail downscaled from it, a q92 JPEG for OCR, and the pdf.js text layer. WebP encodes overlap with rendering the next page.
- `apps/web/src/lib/server-vision-ocr.ts` sends each page's JPEG to Vision as soon as it exists (bounded concurrency, sha256 cache, shared 30-day cap). Deck-wide errors (no key, quota, billing, API disabled, bad key) stop further calls for that deck.
- `pickSlideText` picks per slide: Vision by default, text layer when Vision is empty, unreadable, or much sparser than a rich text layer.
- `parse.ts` is only the fallback (PPTX without LibreOffice, or a render failure).
- Slides read by Vision are passed to `generate_script` as `visionSlides`, which turns on `extractionMethod: "ocr"` and chart detection for them.

## Device draft

`pdf-parse.ts` + `vision-ocr-client.ts` → `POST /api/ocr/vision` when the text layer needs OCR. Same `pickSlideText` selection.

## Files

- `domains/narration/src/ocr-fallback.ts` — `pickSlideText`, request builder, response parser, cache path, quality helpers.
- `apps/web/src/lib/google-vision.ts` — server call to `v1/images:annotate` with `x-goog-api-key`, retries, error mapping.
- `apps/web/src/lib/server-vision-ocr.ts` — server-side OCR for rendered page bytes (parse job).
- `apps/web/src/lib/vision-ocr-cache.ts` — Supabase Storage cache at `ocr/vision-document/<aa>/<sha256>.json`.
- `apps/web/src/app/api/ocr/vision/route.ts` — auth, size cap, cache, per-user and monthly caps, then Vision.
- `apps/web/src/lib/vision-ocr-client.ts` — browser: render ~1600px JPEG, call the route, never throws.
- `apps/web/src/lib/pdf-parse.ts` — device-draft wiring.
- `apps/web/src/lib/ocr.ts` — `needsOcr` / `MIN_TEXT_CHARS` only (no local OCR engine).

## Env

- `GOOGLE_TTS_API_KEY` — same key as TTS; must be allowed to call Cloud Vision API.
- `GOOGLE_VISION_API_KEY` — optional override if you split keys.
- `VISION_SERVER_OCR` — `on` (default) or `off`.
- `VISION_SERVER_CONCURRENCY` — parallel Vision requests per deck (default 6, max 16).
- `VISION_MONTHLY_PAGE_CAP` — shared with the browser route (default 900). With every page OCR'd, raise this deliberately: each uncached page is one billed unit after the free 1,000/month.
- `VISION_PAGES_PER_USER_PER_HOUR` — optional, default 60 (browser route).
- `SLIDE_RENDER_WIDTH` — slide image width in px (default 2560, range 1024–3840). 2560 is sharp on 2x laptop screens and 1440p full screen; use 3840 for 4K presenting.
- `SLIDE_WEBP_QUALITY` — WebP quality for slide images (default 92). Below ~88, small and coloured text gets halos.

## Tests

- `npm test -w @voxdeck/narration` — unit tests including `pickSlideText` and an offline Vision-primary eval (no key, no cost).
- `GOOGLE_TTS_API_KEY=... node --experimental-strip-types --test apps/web/evals/vision.live.eval.ts` — one real Vision call on a fake scanned slide.

## Goal

Extend the pin release from scrollY ≈ 332 to **scrollY = 450**, so section 2 slides into view after 450px of scrolling. The `pinRelease` overlay value will read 450.

## Approach

Preserve the current shred + morph timing (they already feel right — shred 0→312, morph 312→332). Just hold the pin **longer** after the morph completes by widening the release-gap tail.

## Changes

**`src/components/hero-shredder.tsx`** — one constant:

- `RELEASE_GAP_PX`: `0` → `118`

Effect (all recomputed automatically):
- `PIN_SCROLL_PX` = 312 + 20 + 118 = **450**
- Shred: 0 → 312 (unchanged)
- Morph: 312 → 332 (unchanged)
- Hold locked nav bar: 332 → 450 (new — pin stays sticky for 118 extra pixels)
- **Pin releases at scrollY = 450** → section 2 starts sliding into view

**`src/components/scroll-debug-overlay.tsx`** — update reference value:

- `pinRelease`: `332` → `450`

## What the overlay will show

- `morph starts`: 312
- `morph ends`: 332
- `pin releases`: **450** ✅ (matches what you feel while scrolling)
- `heroBottom` / `section2Top`: **~1444** (document coordinates — this is expected, not the same as the scroll number)
- `GAP`: 0

## Out of scope

- No changes to shredder animation timing, morph curve, easing, colors, or content.
- Debug overlay stays visible; can be removed in a follow-up.

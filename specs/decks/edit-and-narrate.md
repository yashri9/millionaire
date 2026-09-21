# Edit and narrate a deck

## Goal
The sender directs each slide's spoken line, voice, and highlights before publishing. Narration is a **pitch** — what a skilled rep would say while the prospect looks at the slide — not a read-aloud of the slide text.

## Screens / entry points
- Editor (`/decks/[id]/edit`)
- Rehearsal preview (`/decks/[id]/preview`)

## Flow
1. Sender uploads a PDF (`/decks/new`).
2. Studio extracts per-page text (pdf.js), OCRs whole pages only when the text layer is empty, then **structures** content (`structureSlideContent`) without pre-filtering "essentials".
3. **Primary generation:** `POST /api/script/generate` runs grounded LLM narration per slide (parallel). If no LLM key, an **extractive fallback** is used and tagged `generationMethod: extractive-fallback`.
4. Fingerprints (`slideNo` + title fingerprint) are echoed by the model to catch index mismatches.
5. Sender opens the editor; degraded drafts show a clear "basic draft" notice.
6. **Shorten** / **Punch it up** / **Regenerate** refine the current grounded line via `/api/script/rewrite` (same grounding rules; local refine if no key).
7. Highlights + preview as before.

## Acceptance
- Given a deck with slides, when the sender edits a script, then the change persists for preview.
- Given Space / J / K shortcuts outside inputs, when pressed, then play / next / previous respond.
- Given Preview, when opened, then the recipient-style stage plays without recording analytics.
- Given LLM key configured, when a deck is uploaded, then scripts are LLM-generated (not local templates) before the editor opens.
- Given no LLM key, when a deck is uploaded, then scripts are extractive `[Draft]` coverage and the editor shows a basic-quality notice.
- Given Shorten or Punch it up, then meaning/facts stay intact.
- Given Regenerate, then wording differs while staying grounded to the same slide content.

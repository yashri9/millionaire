# Deck Agent v1 — Build Plan

This is the build-ready plan for the v1 PRD. It maps **every** PRD section to
concrete files in the `web/` Next.js + Supabase app, and sequences Phase 1.

The existing FastAPI prototype (`backend/`) and vanilla-JS frontend
(`frontend/`) stay **intact as the reference implementation** — see
[§ Coexistence & migration](#coexistence--migration-with-the-fastapi-prototype).

---

## 1. Scope & personas

### In scope (v1)
Single-user accounts · email/password + Google OAuth · upload PPTX/PDF → parse
to slides · AI script generation + manual edit · draft autosave + resume ·
publish → tokenized shareable link · recipient Q&A + escalation · per-deck
analytics · escalation email.

### Out of scope (later)
Teams/roles/SSO · native deck editor · multi-language · real-time co-editing ·
custom domains/white-label · CRM integrations · cross-deck analytics ·
Slack/SMS.

### Personas & the non-negotiable auth boundary
- **Sender** (authenticated): AE/founder. Uploads, edits, publishes, monitors.
- **Recipient** (unauthenticated): opens a shared link, never logs in.

> **Rule (never violate):** the recipient identity is **always a signed token
> in the URL** (`/d/{token}`), never a login form. Enforced in
> `src/lib/supabase/middleware.ts` (the `/d/` and `/api/d/` paths are always
> public) and by serving all recipient data through the **service-role** client
> in `src/lib/recipient.ts` — recipients never touch RLS-protected tables and
> never get an auth challenge.

---

## 2. Architecture

```
web/
├─ src/app/                         # Next.js App Router
│  ├─ (auth)/                       # public: signup, login, forgot/reset, verify, check-email
│  ├─ (app)/                        # authenticated shell: dashboard, decks/new, decks/[id]/edit,
│  │                                #   decks/[id]/analytics, account
│  ├─ d/[token]/                    # PUBLIC recipient runtime (page + Player client)
│  └─ api/                          # route handlers (PRD §6)
├─ src/lib/                         # server/client helpers (see table below)
├─ src/components/                  # shared UI
└─ supabase/migrations/             # SQL schema + RLS (PRD §5, §11)
```

| lib module | Responsibility |
|---|---|
| `env.ts` | `publicEnv` (browser) vs `serverEnv` (secrets); `isSupabaseConfigured()` for stub mode |
| `supabase/client.ts` | Browser client (anon key) |
| `supabase/server.ts` | `createServerClient` (acts as user, RLS) + `createServiceClient` (service role, RLS-bypass, recipient path only) |
| `supabase/middleware.ts` | Session refresh + gate authenticated routes; keeps `/d/` public |
| `auth.ts` | `requireUser`, `getUser`, `assertEmailVerified` |
| `ownership.ts` | `assertDeckOwner` — server-side ownership check (PRD §11) |
| `http.ts` | `ApiError`, `handle()` (no stack traces to users), `notImplemented()` |
| `llm.ts` | **Pluggable LLM** (Groq default, Anthropic optional) — TS port of `backend/llm.py` |
| `prompts.ts` | `generateNarration`, `answerQuestion` (grounded + escalation) |
| `email.ts` | Resend/Postmark interface + `dev` console fallback; `sendEscalationEmail` |
| `parse.ts` | `parseDeck` — PPTX (unzip + presentation.xml order) / PDF (pdf-parse) text extraction; `validateUpload` (type/size, 25MB) |
| `render.ts` | `renderPdfPages` (pdfjs-dist + @napi-rs/canvas, pure Node, max 60 pages) + `convertToPdf` (LibreOffice, PPTX → PDF) |
| `deckProcessor.ts` | `processDeckUpload` — orchestrates parse.ts + render.ts into one pipeline |
| `storage.ts` | `uploadRenderedImages` / `signSlideImagePaths` — page images in the private decks bucket |
| `jobs.ts` | Async job design (jobs table + poller) for parse/generate |
| `tokens.ts` | `generateShareToken` (cryptographically random, non-enumerable) |
| `rateLimit.ts` | Recipient ask limit (20/session) + graceful over-limit message |
| `recipient.ts` | `getPublishedDeckByToken` — the single service-role read path |
| `types.ts` | TS types mirroring the DB schema |

---

## 3. Happy path (PRD §3) → where it lives

| Journey step | Implementation |
|---|---|
| 1. Land → sign up | `src/app/page.tsx`, `(auth)/signup` |
| 2. Redirect to empty Dashboard | `(app)/dashboard` (empty state) |
| 3. New Deck → upload → parsed preview | `(app)/decks/new`, `POST /api/decks`, `POST /api/decks/:id/parse` |
| 4. Generate script → editor | `POST /api/decks/:id/generate-script`, `(app)/decks/[id]/edit` |
| 5. Inline edit + autosave | `PATCH /api/decks/:id/script` (debounced) |
| 6. Close + resume where left off | `decks.last_viewed_slide_index` + latest draft `script_versions` |
| 7. Publish → link (+QR later) | `POST /api/decks/:id/publish` → `shares.token` |
| 8. Copy link, send via own tools | Share UI (no email-send in v1) |
| 9. Recipient opens link, no login | `d/[token]/page.tsx` → `Player` |
| 10. Events → analytics update | `POST /api/d/:token/event`, `(app)/decks/[id]/analytics` (poll 15s) |
| 11. Escalation → email to sender | `ask` route → `lib/email.sendEscalationEmail` |
| 12. Edit + republish (links keep working) | new `script_versions` snapshot; share pointer advanced on **explicit confirm** |

---

## 4. Screen-by-screen (PRD §4) → routes/components

| PRD | Screen | Route / file | Key TODOs |
|---|---|---|---|
| 4.1 | Sign up | `(auth)/signup/page.tsx` | weak-pw inline validation; "exists" copy w/o enumeration; resend (1/60s) |
| 4.2 | Log in | `(auth)/login/page.tsx` | generic error; unverified banner; soft rate-limit |
| 4.3 | Forgot / reset | `(auth)/forgot-password`, `(auth)/reset-password` | token 1h single-use; expired → resend |
| 4.4 | Dashboard | `(app)/dashboard/page.tsx` | deck grid, status badges, empty state, sort/filter, upload-failed retry |
| 4.5 | Upload | `(app)/decks/new/page.tsx` | client type/size reject; async parse + progress; parsed-preview confirm; no-text manual entry |
| 4.6 | Script generation | `POST /api/decks/:id/generate-script` | explicit trigger; per-slide stream + regenerate |
| 4.7 | Script editor + rehearsal | `(app)/decks/[id]/edit/{page,Workspace,LivePreview,Lightbox}.tsx` | page grid + lightbox; debounced autosave + Saved/Saving/Failed; voice picker/preview; "walk through your build" rehearsal (console + player + Q&A via `POST /api/decks/:id/rehearse-ask`); resume slide; regenerate-all confirm — not done |
| 4.8 | Publish | `POST /api/decks/:id/publish` | verified email + all-narration gate; snapshot; create/rotate share |
| 4.9 | Share | Share UI + `POST /api/shares/:token/revoke` | copy link; revoke; regenerate token |
| 4.10 | Analytics | `(app)/decks/[id]/analytics/page.tsx`, `GET /api/decks/:id/analytics` | done: totals, per-slide drop-off, question log, poll 15s, empty state. Aggregates across every share the deck has had, not just the active one |
| 4.11 | Account/settings | `(app)/account/page.tsx`, `DELETE /api/account` | done: name/password (direct supabase-js, self-scoped RLS), Google status. Delete is **immediate**, not the PRD's 30-day soft-delete (that needs a pending-deletion flag + purge job — bigger than "basic settings"); relies on `on delete cascade` from decks.user_id for cleanup |
| 4.12 | Recipient runtime | `d/[token]/page.tsx` + `Player.tsx`, `GET/POST /api/d/[token]*` | done: session created per page view, opened/slide_viewed/completed events, Q&A escalation, "link not active" page. Not done: TTS narration playback (still text-only) |

---

## 5. REST endpoints (PRD §6) → route handlers

All under `src/app/api/`. **Every user-scoped route** calls `requireUser()`
then `assertDeckOwner()` (the pattern is already wired in each handler).

| Method | Path | File | Status |
|---|---|---|---|
| POST | /api/auth/signup | `api/auth/signup/route.ts` | stub (usually client-side) |
| POST | /api/auth/login | `api/auth/login/route.ts` | stub |
| GET | /api/auth/google/callback | `api/auth/google/callback/route.ts` | **wired** (exchangeCodeForSession + redirect) |
| POST | /api/auth/forgot-password | `api/auth/forgot-password/route.ts` | stub (client calls `supabase.auth.resetPasswordForEmail` directly) |
| POST | /api/auth/reset-password | `api/auth/reset-password/route.ts` | stub (client calls `supabase.auth.updateUser` directly) |
| GET | /api/auth/verify-email | `api/auth/verify-email/route.ts` | **wired** (verifyOtp + redirect) |
| GET | /api/decks | `api/decks/route.ts` | **wired** (owner list) |
| POST | /api/decks | `api/decks/route.ts` | **wired** (upload to Storage, insert deck, inline parse -> slides) |
| GET | /api/decks/:id | `api/decks/[id]/route.ts` | **wired** (owner + fetch, incl. active share) |
| PATCH | /api/decks/:id | `api/decks/[id]/route.ts` | **wired** (title / last_viewed_slide_index) |
| DELETE | /api/decks/:id | `api/decks/[id]/route.ts` | **wired** (soft-delete) |
| POST | /api/decks/:id/parse | `api/decks/[id]/parse/route.ts` | **wired** (re-parse retry after parse_failed) |
| POST | /api/decks/:id/generate-script | `api/decks/[id]/generate-script/route.ts` | **wired** (generateNarration -> new draft script_versions) |
| PATCH | /api/decks/:id/script | `api/decks/[id]/script/route.ts` | **wired** (autosave into draft, or new draft post-publish) |
| POST | /api/decks/:id/rehearse-ask | `api/decks/[id]/rehearse-ask/route.ts` | **wired** (grounded Q&A against the draft, owner-only, not persisted) |
| POST | /api/decks/:id/publish | `api/decks/[id]/publish/route.ts` | **wired** (validate, snapshot, create/rotate share) |
| GET | /api/decks/:id/analytics | `api/decks/[id]/analytics/route.ts` | **wired** (opens/completion/per-slide views/question log) |
| POST | /api/shares/:token/revoke | `api/shares/[token]/revoke/route.ts` | **wired** |
| GET | /api/d/:token | `api/d/[token]/route.ts` | **wired** (service-role read) |
| POST | /api/d/:token/event | `api/d/[token]/event/route.ts` | **wired** (opened/slide_viewed/completed, session-scoped to the token) |
| DELETE | /api/account | `api/account/route.ts` | **wired** (immediate delete via auth.admin, not the 30-day soft-delete) |
| POST | /api/d/:token/ask | `api/d/[token]/ask/route.ts` | **fully wired** (LLM + escalate + rate-limit + persist) |

Stubs return **501 Not Implemented** with a `todo` field — the auth/ownership
gate runs *before* the 501 so the security pattern is real from day one.

---

## 6. State machines (PRD §7)

- **Deck:** `uploading → parse_failed (retry→uploading) | draft → draft (autosave)
  → published → draft (post-publish edits: new script_version, share untouched
  until explicit republish)`. Enum: `deck_status`.
- **Share:** `(none) → active (on publish) → revoked (manual) | active
  (regenerate → old revoked, new active)`. Enum: `share_status`.
- **Session (recipient):** `opened → (slide_viewed)* → (question_asked →
  answered | escalated)* → completed | abandoned (inferred from inactivity)`.
  Enum: `event_type`.

---

## 7. Fallback / error matrix (PRD §8) → handled where

| Failure | Handled in |
|---|---|
| Upload: unsupported/too large | `lib/parse.validateUpload` (client-side reject) |
| Upload: no text extracted | parse job → mark slides `needsManualText`, manual entry UI |
| Script gen: LLM fails | `generate-script` route: retry once → per-slide regenerate |
| Autosave: network drop | editor: localStorage queue + backoff + visible "unsynced" warning |
| Publish: validation fails | `publish` route: specific jump-to-slide errors |
| Recipient: invalid/revoked token | `getPublishedDeckByToken` → clean "link not active" page/JSON |
| Recipient: Q&A backend error | `ask` route: **auto-escalate**, warm hand-off (never raw error) |
| Login: wrong credentials | generic "email or password is incorrect" |
| Any server 500 | `http.handle()` logs w/ request id; user sees friendly retry |

---

## 8. Non-functional (PRD §9)

- **Performance:** dashboard/editor instant for ≤30 slides; parse/generate are
  async with visible progress (`jobs` table).
- **Availability:** `/d/:token` is the highest-priority surface — kept fully
  server-rendered and dependency-light.
- **Accessibility:** keyboard-navigable forms/editor; recipient view degrades
  without audio (carry the prototype's `hasTTS` fallback into `Player.tsx`).
- **Retention:** recipient session data kept indefinitely; account delete
  cascades after the 30-day soft-delete window.

---

## 9. Security (PRD §11) — non-negotiable

- **LLM keys + Supabase service role are SERVER-ONLY.** `serverEnv` is imported
  only from `"server-only"` modules (`llm.ts`, `recipient.ts`, routes). This is
  the **exact bug class hit earlier** (an LLM key shipped in browser JS) — do
  not repeat it. Verify with view-source / network tab before shipping (PRD §13).
- **Ownership on every mutation:** `requireUser()` + `assertDeckOwner()` +
  RLS (`owns_deck`/`owns_share`). Never trust a client-supplied `user_id`.
- **Share tokens** are 192-bit random base64url (`lib/tokens`) — not enumerable.
- **Uploads** validated for type/size before processing; parsing in an async
  job, not inline.
- **Passwords** hashed by Supabase Auth (never hand-rolled).
- **Recipient ask rate-limit:** 20/session (`lib/rateLimit`) → graceful
  "continue over email" message.

---

## 10. Adopted §14 open decisions (defaults locked)

1. **Republish** requires **explicit "push update" confirmation** (safer).
2. **Ask rate-limit** = **20/session** (env `ASK_RATE_LIMIT_PER_SESSION`).
3. **Soft-delete** kept — **30-day** window before hard delete.
4. **QR code** on share → **Phase 2**.

---

## Coexistence & migration with the FastAPI prototype

- `backend/` (FastAPI) and `frontend/` (vanilla JS) remain the working
  reference and are **untouched**. Run them exactly as before (`uvicorn`).
- The new app lives entirely in `web/` — no shared files, no port conflict
  (FastAPI on `:8000`, Next.js on `:3000`).
- **Logic parity path:** the narration + grounded-Q&A prompts are already
  ported to `web/src/lib/prompts.ts` and the provider to `web/src/lib/llm.ts`
  (1:1 with `backend/llm.py`). **Deck parsing** is now ported too:
  `lib/parse.ts` unzips `.pptx` directly (reading `ppt/slides/slideN.xml`,
  ordered via `presentation.xml` + rels rather than filename — PowerPoint
  doesn't rename files when slides are reordered) and uses `pdf-parse` with a
  custom per-page `pagerender` for `.pdf`. Page-image rendering (thumbnails,
  like the FastAPI prototype's PyMuPDF path) is not ported — text-only for now.
  Parsing runs **inline** in `POST /api/decks` rather than through
  `lib/jobs.ts`'s job-table design: at the 25MB cap, officeparser/pdf-parse are
  fast enough that a queue + poller would be infra without a matching need yet;
  `jobs.ts` is left as the documented design for if/when that changes.
- **Retirement:** once `web/` reaches Phase 1 acceptance (PRD §13), the FastAPI
  prototype can be retired (or kept as an internal parsing microservice if we
  keep the PyMuPDF renderer).

---

## Environment variables (all placeholders in `.env.local.example`)

Browser-safe: `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_ANON_KEY`.

**Server-only (never in browser bundles):** `SUPABASE_SERVICE_ROLE_KEY`,
`SUPABASE_DECKS_BUCKET`, `LLM_PROVIDER`, `GROQ_API_KEY`, `GROQ_MODEL`,
`GROQ_BASE_URL`, `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`, `ANTHROPIC_VERSION`,
`GOOGLE_OAUTH_CLIENT_ID/SECRET`, `EMAIL_PROVIDER`, `EMAIL_FROM`,
`RESEND_API_KEY`, `POSTMARK_SERVER_TOKEN`, `ASK_RATE_LIMIT_PER_SESSION`.

---

## Phase 1 build order (sequencing & dependencies)

Build in this order — each step unblocks the next:

1. **Supabase project + migrations** — apply `0001_init.sql` through
   `0004_page_images.sql` and `0005_deck_render_status.sql`; enable Email + Google auth; create the `decks`
   Storage bucket.
2. **Auth** (§4.1–4.3) — signup/login/verify/reset; middleware gating; profile
   auto-create trigger already in migration.
3. **Upload + parse + render** (§4.5) — done: `POST /api/decks` (Storage +
   deck row + inline `lib/deckProcessor` = `lib/parse` text + `lib/render`
   page images), retry via `POST /api/decks/:id/parse`, upload UI with
   client-side validation. PPTX render via LibreOffice (`lib/render.ts`); PDF
   recommended for most reliable previews. Without LibreOffice, PPTX falls back
   to text-only. Not done: parsed-preview confirm step, no-text per-slide manual
   entry, resume-slide.
4. **Script gen + edit + rehearse + autosave** (§4.6–4.7) — done: the editor
   (`decks/[id]/edit`) is now the full Studio experience (parity with
   `deck_agent_v0/frontend/studio.js`): page grid with real slide images,
   `generate-script`, debounced `PATCH /script` autosave, a voice picker +
   speed slider + preview (Web Speech API), and a "walk through your build"
   rehearsal mode — simulated engagement console (dwell time, completion,
   rep inbox), the actual player (slide image + spoken narration + progress
   dots), and grounded Q&A against the draft narration
   (`POST /api/decks/:id/rehearse-ask`, not persisted — see
   `/api/d/:token/ask` for the real recipient path). Publish happens from
   inside rehearsal. Not done: per-slide streaming/regenerate, resume-slide,
   "regenerate all" confirm dialog.
5. **Publish + share** (§4.8–4.9) — done: validation gate, `script_versions`
   snapshot, `shares` token create/rotate, copy link, revoke. Not done: QR
   code, explicit republish confirm dialog (currently republishes immediately).
6. **Recipient runtime persisted** (§4.12) — `Player` TTS + events; `ask` route
   already wired (add session creation + persistence).
7. **Analytics** (§4.10) — aggregate endpoint + dashboard charts, 15s polling.
8. **Escalation email** (§4.1 journey 11) — wire `sendEscalationEmail` on
   escalate; swap `EMAIL_PROVIDER=dev` → Resend/Postmark.

Then **Phase 2** (QR, link regeneration, richer analytics, settings polish,
soft-delete UX) and **Phase 3** (teams, CRM, in-app email, multi-language).

## Phase 1 "done" (PRD §13 acceptance)

- Sign up → verify → login → upload real PPTX → generate script → edit → close →
  return → land exactly where left off.
- Published link opens in a logged-out browser with zero login prompts.
- Answerable question → grounded answer + slide highlight; unanswerable →
  real escalation email within seconds.
- Revoke → immediate clean "link not active", not an error.
- **No LLM/Supabase secret in any browser bundle** (verify via network tab).

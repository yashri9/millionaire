# Architecture — start here

This is the "I just opened this repo, orient me" doc. For feature-by-feature
build status and the original spec, see [`BUILD_PLAN.md`](./BUILD_PLAN.md).
For DB schema and how to apply migrations, see
[`supabase/README.md`](./supabase/README.md). This file is about **where to
look when you need to change something** — read it once, then use it as an
index.

## What this app does, end to end

A sender uploads a deck (PPTX/PDF) → it's parsed into slides with rendered
images → an LLM writes spoken narration per slide → the sender rehearses the
exact experience a recipient will get (voice + talking avatar + Q&A) →
publishes a link → a recipient opens that link with no login, hears the
narration, and can ask questions grounded in the deck → the sender sees
engagement analytics.

Each arrow above is a real file boundary. Trace it:

| Step | Files |
|---|---|
| 1. Upload | `(app)/decks/new/page.tsx` → `POST /api/decks` |
| 2. Parse + render | `lib/deckProcessor.ts` orchestrates `lib/parse.ts` (text) + `lib/render.ts` (page images, PDF via pdfjs-dist, PPTX via LibreOffice→PDF first) → `lib/storage.ts` uploads images to Supabase Storage |
| 3. Generate narration | `(app)/decks/[id]/edit/Workspace.tsx` → `POST /api/decks/:id/generate-script` → `lib/prompts.ts`'s `generateNarration` → `lib/llm.ts`'s `callLLM` |
| 4. Rehearse | `(app)/decks/[id]/edit/LivePreview.tsx` — voice via `components/TalkingAvatar.tsx`, Q&A via `POST /api/decks/:id/rehearse-ask` |
| 5. Publish | `POST /api/decks/:id/publish` — snapshots narration, creates/rotates a `shares` row with a token from `lib/tokens.ts` |
| 6. Recipient opens link | `d/[token]/page.tsx` (creates a session) → `d/[token]/Player.tsx` (plays narration, same avatar component, logs events) |
| 7. Recipient asks a question | `POST /api/d/[token]/ask` → `lib/prompts.ts`'s `answerQuestion`, grounded ONLY in the deck, auto-escalates on any failure |
| 8. Sender sees analytics | `(app)/decks/[id]/analytics/page.tsx` polls `GET /api/decks/:id/analytics`, which aggregates the sessions/events/questions steps 6-7 wrote |

## Folder map

```
src/app/
  (auth)/          public: signup, login, forgot/reset password, verify-email, check-email
  (app)/           authenticated: dashboard, decks/new, decks/[id]/edit (the Studio), decks/[id]/analytics, account
  d/[token]/       PUBLIC recipient runtime — no login, ever (see lib/recipient.ts)
  api/             route handlers, one folder per resource, mirrors the URL

src/lib/           all server-side logic — see table below
src/components/    shared UI used in more than one place (LogoutButton, TalkingAvatar, ScaffoldNote)
supabase/migrations/   SQL schema + RLS + grants, applied in filename order
```

| `lib/` file | Job |
|---|---|
| `env.ts` | `publicEnv` (browser-safe) vs `serverEnv` (secrets) split — see "Secrets" below |
| `auth.ts` | `requireUser()` — every owner-scoped API route calls this first |
| `ownership.ts` | `assertDeckOwner()` — called right after `requireUser()` in every deck-scoped route |
| `http.ts` | `handle()` wraps every route body so errors never leak a stack trace; `ApiError` for expected failures |
| `parse.ts` | Slide **text** extraction (PPTX unzip, PDF via pdf-parse) |
| `render.ts` | Slide **image** rendering (PDF via pdfjs-dist, PPTX via LibreOffice→PDF first) |
| `deckProcessor.ts` | Combines the two above into what the upload/retry routes actually call |
| `storage.ts` | Uploads rendered images to the private Storage bucket + signs URLs for the browser |
| `llm.ts` | `callLLM(system, user)` — the ONLY place that calls Groq/Anthropic; swap/add a provider here |
| `prompts.ts` | The two actual prompts: `generateNarration` and `answerQuestion` |
| `recipient.ts` | The ONE place that reads a published deck by token (service-role, bypasses RLS — recipients never authenticate) |
| `rateLimit.ts` | Recipient Q&A rate limit (per session) |
| `tokens.ts` | Share-link token generation |
| `email.ts` | Escalation email sending (Resend/Postmark/dev-console) |
| `jobs.ts` | **Unused design doc**, not wired up — see "Deliberate simplifications" below |
| `types.ts` | TS types mirroring the DB schema |

## Conventions (follow these, don't reinvent per-route)

- **Every owner-scoped API route** starts with `requireUser()` then
  `assertDeckOwner(id, user.id)` (or the share/token equivalent). Copy the
  pattern from any existing route in `api/decks/[id]/*` rather than rolling
  your own check.
- **Every route body is wrapped in `handle(async () => {...})`** from
  `lib/http.ts`. Throw `ApiError(status, message)` for expected failures;
  anything else becomes a generic 500 with a request ID (never a raw stack
  trace to the client).
- **The recipient path never touches RLS.** `lib/recipient.ts` and the
  `api/d/[token]/*` routes use `createServiceClient()` (bypasses RLS)
  because there is no logged-in user to check `auth.uid()` against. Never
  add an anon RLS policy as a shortcut here — the service-role read path is
  the security boundary, not the DB policy.
- **Secrets**: `serverEnv` (in `lib/env.ts`) vs `publicEnv`. Never import
  `serverEnv` from a `"use client"` file — that ships the secret into the
  browser bundle. This exact bug class is called out in `.env.local.example`
  because it happened once already.
- **Dev/stub mode**: `isSupabaseConfigured()` (in `lib/env.ts`) is checked
  wherever the app needs to degrade gracefully with no Supabase project
  configured. Client components use it to show a "dev mode" message instead
  of crashing.
- **Styling**: one global stylesheet, `src/app/globals.css`. No CSS
  modules, no Tailwind. Class names are shared across files (e.g. `.card`,
  `.btn`, `.muted`) — grep before inventing a new one.

## "I want to change X" — where to look

- **Add/swap an LLM provider** → `lib/llm.ts`'s `callLLM()`. It's an
  if/else on `serverEnv.llmProvider`, not a plugin interface — deliberately
  simple for two providers; if you're adding a third, that's the point
  where an interface starts paying for itself.
- **Change the narration prompt/style/length logic** → `lib/prompts.ts`'s
  `generateNarration` + `wordsPerSlide()`.
- **Change the Q&A grounding/escalation behavior** → `lib/prompts.ts`'s
  `answerQuestion`. Note there are TWO callers: the real recipient path
  (`api/d/[token]/ask`, persisted + rate-limited) and the sender's rehearsal
  (`api/decks/[id]/rehearse-ask`, not persisted) — keep them in sync if you
  change grounding behavior.
- **Support a new upload file type** → `lib/parse.ts` (text) and
  `lib/render.ts` (images) both dispatch on file extension; add a branch in
  each, then wire it into `lib/deckProcessor.ts`.
- **Change slide-narration playback / the avatar** →
  `components/TalkingAvatar.tsx` is the shared hook+component. It's used in
  both `decks/[id]/edit/LivePreview.tsx` (sender rehearsal) and
  `d/[token]/Player.tsx` (real recipient) — changes usually need to land in
  both call sites, not just the shared component.
- **Add a new authenticated page** → put it under `(app)/`, follow
  `dashboard/page.tsx`'s pattern (client component, fetches its own data on
  mount) unless it's simple enough to be a server component like the
  scaffolded pages still are.
- **Add a new API route** → mirror any existing one in `api/decks/[id]/*`:
  `requireUser` → `assertDeckOwner` → `handle()`-wrapped body.
- **Change the DB schema** → add a new numbered file in
  `supabase/migrations/`. Remember RLS policies (`0002_rls.sql`) AND base
  table grants (`0003_grants.sql`) — Postgres checks grants before RLS, so a
  new table needs both or every query 403s. See `supabase/README.md`.
- **Change auth (login/signup/reset/OAuth)** → `lib/auth.ts` +
  `(auth)/*/page.tsx`. Most of this calls `supabase-js` directly from the
  client (no server route) — that's deliberate, not a stub; see the
  `/api/auth/*` route comments for why they're intentionally unused.

## Deliberate simplifications (don't "fix" these without checking why first)

- **Parsing/rendering runs inline** in the upload request, not through
  `lib/jobs.ts`'s job-table design — fast enough at the 25MB cap that a
  queue+poller is infra without a matching need yet. `jobs.ts` documents the
  design if that changes.
- **Account deletion is immediate**, not the originally-specced 30-day
  soft-delete — that needs a pending-deletion flag + purge job, a bigger
  feature than "basic settings." See `api/account/route.ts`.
- **The default talking avatar's lip movement is approximate**, driven by
  the Web Speech API's `boundary` events, not real phoneme timing — see
  `components/TalkingAvatar.tsx`. A real AI avatar video integration (D-ID)
  exists at `lib/avatarVideo.ts` + `POST /api/decks/:id/generate-avatar-video`
  but is **not linked from any UI** — two things are still undecided first:
  where the avatar's source photo comes from (one env-var default today, not
  a per-user picker) and the real plan/billing gate (no subscription system
  exists in this app yet, so "paid feature" isn't enforceable server-side).
- **PPTX slide images need LibreOffice installed** on whatever machine runs
  the server (`lib/render.ts`'s `convertToPdf`). Without it, PPTX falls back
  to text-only slides — same fallback the original FastAPI prototype uses.
  PDF rendering has no such dependency (pure Node via pdfjs-dist).
- **No true RAG / vector search** — Q&A grounding is "stuff the whole
  deck's text into the prompt," not chunking+embeddings+similarity search.
  Fine at deck-sized context; would need revisiting for very large decks or
  additional reference documents.

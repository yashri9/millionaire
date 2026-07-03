# Deck Agent — web (Next.js + Supabase)

The v1 app: sender dashboard, upload → parse → AI script → edit → publish, plus
the public recipient runtime at `/d/[token]`. Built per the v1 PRD.

> This is **separate from** and does **not** touch the FastAPI prototype in
> `../backend` + `../frontend`, which stays as the reference implementation.
> See [`BUILD_PLAN.md`](./BUILD_PLAN.md) for the full plan and the coexistence /
> migration path. DB schema + how to apply live in
> [`supabase/README.md`](./supabase/README.md).

## Stack

- **Next.js 15** (App Router) + **React 19**
- **Supabase** — Postgres + Auth (email/password + Google) + Storage
- **Pluggable LLM** — Groq (default) or Anthropic, server-side only
  (`src/lib/llm.ts`, a 1:1 TS port of `backend/llm.py`)
- Parsing: `officeparser` (PPTX) + `pdf-parse` (PDF); Email: Resend (or dev stub)

## Run in stub / dev mode (no external services)

Everything runs without any real credentials — auth/DB/parse degrade to
stubs, and API stubs return `501` with a `todo`.

```powershell
cd web
npm install
copy .env.local.example .env.local   # leave placeholders as-is for stub mode
npm run dev                           # http://localhost:3000
```

What works in stub mode:
- All pages render (auth, dashboard, editor, account, recipient).
- The middleware does **not** gate routes (no Supabase env → open).
- `/api/d/[token]/ask` still answers **if** `GROQ_API_KEY` is set (LLM only,
  no DB); otherwise it gracefully returns the escalation hand-off line.

## Plug in real services

1. **Supabase**: create a project, apply migrations (see `supabase/README.md`),
   then set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and
   `SUPABASE_SERVICE_ROLE_KEY`. Enable Email + Google auth; create a private
   `decks` Storage bucket.
2. **LLM**: set `GROQ_API_KEY` (default provider). To switch to Anthropic, set
   `LLM_PROVIDER=anthropic` + `ANTHROPIC_API_KEY`.
3. **Email**: set `EMAIL_PROVIDER=resend` + `RESEND_API_KEY` (or leave `dev` to
   log emails to the console).

> **Security:** only `NEXT_PUBLIC_*` vars reach the browser. The service role
> key and all LLM/email keys are server-only — never import `serverEnv` from a
> `"use client"` file. This is the exact bug class flagged in the PRD (§11).

## Scripts

```powershell
npm run dev         # dev server
npm run build       # production build
npm run start       # run the production build
npm run typecheck   # tsc --noEmit
npm run lint        # next lint
```

## Layout

```
src/app/(auth)/     signup, login, forgot/reset, verify, check-email  (public)
src/app/(app)/      dashboard, decks/new, decks/[id]/edit|analytics, account  (authed)
src/app/d/[token]/  recipient runtime (page + Player)  (public, token only)
src/app/api/        route handlers (PRD §6)
src/lib/            supabase, auth, ownership, llm, prompts, email, parse, jobs, tokens, rateLimit, recipient, types
supabase/migrations/ SQL schema + RLS
```

## Status of endpoints

`GET /api/decks`, `GET /api/decks/[id]`, `GET /api/d/[token]`,
`POST /api/d/[token]/ask`, `GET /api/auth/verify-email`, and
`GET /api/auth/google/callback` are **wired**. Signup, login, logout, forgot
password, and reset password are wired client-side directly against
`supabase-js` (see `src/app/(auth)/*` and `src/components/LogoutButton.tsx`).
The rest are scaffolded **stubs** (`501` + `todo`) with the `requireUser` +
`assertDeckOwner` security pattern already in place. Fill them in following
the Phase 1 order in `BUILD_PLAN.md`.

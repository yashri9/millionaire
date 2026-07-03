# File Map — what lives where & what it does

A living index of every file/folder and its responsibility. Keep this updated
whenever files are added, moved, or repurposed. For deeper architecture, see
`DOCS.md`; for the v1 product plan, see `web/BUILD_PLAN.md` (once scaffolded).

---

## Repo root
| Path | Responsibility |
|------|----------------|
| `README.md` | Quick start: install, add key, run the server, share links. |
| `DOCS.md` | Deep architecture: pipeline, endpoints, AI grounding, deployment. |
| `FILE_MAP.md` | This file — index of files and their responsibilities. |
| `.gitignore` | Excludes secrets (`backend/.env`), runtime storage, Python/OS cruft. |

## `backend/` — FastAPI app (current working prototype)
| Path | Responsibility |
|------|----------------|
| `backend/server.py` | The API. Upload→convert→render→extract, narrate & Q&A proxy, publish, fetch deck, rep inbox, static/route serving. Serves the studio at `/`, viewer at `/d/{id}`. |
| `backend/llm.py` | Pluggable LLM provider. `call_llm()` talks to Groq (default) or Anthropic; provider/model/key read from `.env`. Only place model APIs are called. |
| `backend/requirements.txt` | Python dependencies (fastapi, uvicorn, pymupdf, python-pptx, httpx, etc.). |
| `backend/.env.example` | Template for env vars (`LLM_PROVIDER`, `GROQ_API_KEY`, `ANTHROPIC_*`, `SOFFICE_PATH`). Copy to `.env`. |
| `backend/.env` | **Gitignored.** Real secrets (active Groq key). Never committed. |
| `backend/storage/` | **Gitignored.** Created at runtime; one folder per deck (`source`, `pages/`, `thumbs/`, `deck.json`). |

## `frontend/` — vanilla JS client (served by the backend)
| Path | Responsibility |
|------|----------------|
| `frontend/index.html` | Studio markup: upload → review pages → generate narration → live walk-through → publish. |
| `frontend/studio.js` | Studio logic: upload, thumbnail grid + lightbox, narration gen/edit, voice picker, live preview (playback, dwell, metrics, Q&A, rep inbox, signal beam), publish. |
| `frontend/styles.css` | All studio + live-preview + viewer styling (design tokens, layout, animations). |
| `frontend/config.js` | Frontend config (`API_BASE`). No secrets. |
| `frontend/viewer.html` | Published full-screen player markup (loaded at `/d/{id}`). |
| `frontend/viewer.js` | Viewer logic: fetch published deck, narrated playback, grounded Q&A with escalation. |

## `web/` — Next.js + Supabase v1 app (scaffold, plan-first)
> The v1 product per the PRD. Currently a build-ready scaffold: API routes are
> mostly `501` stubs (with auth+ownership already wired) except the recipient
> `ask` flow which is fully implemented. See `web/BUILD_PLAN.md` for the full plan.

### Root
| Path | Responsibility |
|------|----------------|
| `web/BUILD_PLAN.md` | Maps every PRD section to files; Phase-1 order; acceptance criteria; migration plan. |
| `web/README.md` | How to run in stub/dev mode and plug in real services. |
| `web/.env.local.example` | All env placeholders (Supabase, Google OAuth, GROQ/Anthropic, email, app URL). |
| `web/middleware.ts` | Gates the authed area; keeps `/d/` + `/api/d/` always public (auth-boundary rule). |
| `web/next.config.mjs`, `tsconfig.json`, `package.json` | Next.js / TS / dependency config. |

### `web/supabase/` — database
| Path | Responsibility |
|------|----------------|
| `supabase/config.toml` | Supabase CLI local config (created by `supabase init`; used for `link` / `db push`). |
| `supabase/migrations/0001_init.sql` | All §5 tables + enums, triggers, soft-delete, `jobs` table, unique `shares.token` index. |
| `supabase/migrations/0002_rls.sql` | Owner-only RLS (`owns_deck`/`owns_share`); no anon policies (recipient uses service role). |
| `supabase/README.md` | How to apply migrations (CLI / dashboard). |

### `web/src/app/` — pages (App Router route groups)
| Path | Responsibility |
|------|----------------|
| `app/page.tsx`, `layout.tsx`, `globals.css` | Root landing/shell + global styles. |
| `app/(auth)/*` | Sender auth screens: signup, login, forgot/reset password, verify + check-email. |
| `app/(app)/dashboard/page.tsx` | Sender's deck list/home (§4.4). |
| `app/(app)/decks/new/page.tsx` | Upload + parsed-preview confirm (§4.5). |
| `app/(app)/decks/[id]/edit/page.tsx` | Script editor with autosave/resume (§4.7). |
| `app/(app)/decks/[id]/analytics/page.tsx` | Per-deck analytics (§4.10). |
| `app/(app)/account/page.tsx` | Account/settings (§4.11). |
| `app/(app)/layout.tsx` | Authed-area shell. |
| `app/d/[token]/page.tsx` + `Player.tsx` | Public recipient runtime — narrated deck + Q&A (§4.12). No login. |

### `web/src/app/api/` — route handlers (§6)
| Path | Responsibility |
|------|----------------|
| `api/auth/*` | signup, login, google/callback, forgot/reset password, verify-email. |
| `api/decks/route.ts` | List (wired) + create/upload deck. |
| `api/decks/[id]/route.ts` | Get (wired) / update / delete a deck. |
| `api/decks/[id]/parse`,`generate-script`,`script`,`publish`,`analytics` | Parse, AI script gen, autosave, publish/share, analytics (stubs). |
| `api/shares/[token]/revoke/route.ts` | Revoke a share link. |
| `api/d/[token]/route.ts` | Fetch published deck for recipient (wired). |
| `api/d/[token]/ask/route.ts` | **Fully implemented:** grounded Q&A + auto-escalate + 20/session rate-limit + persistence. |
| `api/d/[token]/event/route.ts` | Log recipient open/slide_viewed/completed. |

### `web/src/lib/` — server/shared libraries
| Path | Responsibility |
|------|----------------|
| `lib/env.ts` | Public vs server-only env split (secrets never reach browser). |
| `lib/supabase/{client,server,middleware}.ts` | Supabase browser client, server/service client, SSR middleware. |
| `lib/auth.ts`, `ownership.ts` | `requireUser()` + `assertDeckOwner()` (ownership checks on every mutation). |
| `lib/llm.ts`, `prompts.ts` | Pluggable LLM provider (Groq default / Anthropic) — TS port of `backend/llm.py` — + prompt templates. |
| `lib/email.ts` | Email sender (Resend + dev/console fallback). |
| `lib/parse.ts`, `jobs.ts` | Deck parsing interface + async job helpers. |
| `lib/tokens.ts`, `rateLimit.ts` | Crypto-random share tokens + per-session rate limiting. |
| `lib/recipient.ts`, `http.ts`, `types.ts` | Recipient data access, error-safe response helper (no stack traces), shared types. |
| `src/components/ScaffoldNote.tsx` | Placeholder banner for not-yet-built screens. |

> Not yet ported: page-image rendering (prototype's LibreOffice + PyMuPDF path).
> `web/BUILD_PLAN.md` documents the two options (Node renderer vs. calling the Python service during transition).

---

## Conventions
- **Secrets** live only in server env (`backend/.env`, later `web/.env.local`) — never in browser-delivered code.
- **Runtime/generated data** (`backend/storage/`, published decks) is gitignored.
- Keep this map **to the point**: one line per file describing its single responsibility.

# Studio Access — Supabase Auth

## Environment

Set in `apps/web/.env.local`:

| Variable | Where used | Notes |
| --- | --- | --- |
| `NEXT_PUBLIC_APP_URL` | redirects, emails | local: `http://localhost:3010` · prod: `https://voxdeck.vercel.app` |
| `NEXT_PUBLIC_SUPABASE_URL` | browser + middleware | Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | browser + middleware | Publishable/anon key only |
| `SUPABASE_SERVICE_ROLE_KEY` | server routes only | Never ship to the client |

## Supabase Dashboard

1. **Auth → URL configuration**
   - Site URL: `https://voxdeck.vercel.app` (local override: `http://localhost:3010`)
   - Redirect URLs:
     - `https://voxdeck.vercel.app/**`
     - `https://voxdeck.vercel.app/api/auth/google/callback`
     - `https://voxdeck.vercel.app/reset-password`
     - `https://voxdeck.vercel.app/verify-email`
     - `http://localhost:3010/**`
     - `http://localhost:3010/api/auth/google/callback`
     - `http://localhost:3010/reset-password`
     - `http://localhost:3010/verify-email`
2. **Auth → Providers → Email**: enable; keep “Confirm email” on for production-like flows.
3. **Auth → Providers → Google**: enable and paste Google Cloud OAuth client ID/secret.
4. **SQL**: apply migrations under `apps/web/supabase/migrations/` (profiles + RLS + self-insert).

## App routes

| Route | Purpose |
| --- | --- |
| `/login` | Email/password + Google |
| `/signup` | Create account |
| `/forgot-password` | Request reset link |
| `/reset-password` | Set new password (recovery session) |
| `/verify-email` | Resend / status |
| `/check-email` | Post-signup “check inbox” |
| `/api/auth/google/callback` | OAuth code exchange |
| `/dashboard`, `/decks`, `/account` | Protected (middleware + session) |

## Architecture

- Identity: Supabase Auth (`auth.users`)
- App profile: `public.profiles` (RLS; trigger + self-insert fallback)
- Session gate: `src/middleware.ts` → `lib/supabase/middleware.ts`
- Client state: `AuthProvider`
- User-facing errors: `lib/auth-errors.ts` (`mapAuthError`)

## Deferred (v2)

MFA, email change, account deletion, advanced identity linking UI.

# Supabase — schema & how to apply

This folder holds the Postgres schema and RLS policies for Deck Agent v1
(PRD §5 data model, §11 security).

```
migrations/
  0001_init.sql   # enums, tables, indexes, soft-delete, triggers, jobs table
  0002_rls.sql    # Row Level Security: owner-only access; recipient path is service-role only
```

## Apply the migrations

### Option A — Supabase CLI (recommended)

Project ref for this app: **`dtnvnsxdbsgjjpfsyoxn`**

```powershell
cd web
npx supabase login          # opens browser — required once
npx supabase link --project-ref dtnvnsxdbsgjjpfsyoxn
npx supabase db push
```

If `db push` times out on the direct `db.*.supabase.co` host (IPv6/network),
run `supabase login` + `link` first (uses the Supabase API), or use Option B.

The CLI applies files in `supabase/migrations/` in filename order
(`0001_` then `0002_`).

### Troubleshooting: "type already exists" / partial migration

If `db push` fails with `type "deck_status" already exists`, a previous run
partially applied schema but did not finish (or migration history is out of sync).

1. Migrations are **idempotent** — safe to re-run after repair.
2. Mark stuck migrations as reverted, then push again:

```powershell
npx supabase migration repair --status reverted --linked 0001 0002
npx supabase db push
```

3. Confirm with `npx supabase migration list` (both should show local + remote).

### Option B — Dashboard SQL editor

1. Open your project → **SQL Editor**.
2. Paste the contents of `0001_init.sql`, run it.
3. Paste the contents of `0002_rls.sql`, run it.

## What to configure in the dashboard (not in SQL)

- **Auth → Providers → Email**: enable email/password + email confirmations.
- **Auth → Providers → Google**: paste the Google OAuth client id/secret
  (PRD §4.1). Add the callback `https://<project>.supabase.co/auth/v1/callback`.
- **Storage**: create a bucket named `decks` (or match `SUPABASE_DECKS_BUCKET`),
  keep it **private**. Uploaded source files are read server-side only.

## Security model (read before adding policies)

- Sender access is enforced by RLS: `deck.user_id = auth.uid()` cascades to
  slides / script_versions / shares / analytics via the `owns_deck` /
  `owns_share` helpers.
- The **recipient** (prospect) has **no login and no direct table access**.
  The `/d/[token]` runtime is served by server routes using the **service role**
  client, which bypasses RLS. There are intentionally **no anon/public
  policies** — never expose the service role key to the browser.

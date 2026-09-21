-- ============================================================================
-- Deck Agent v1 — table grants for the `authenticated` role (PRD §11)
-- Idempotent: GRANT is safe to re-run.
--
-- RLS policies (0002_rls.sql) restrict which ROWS a role can touch, but
-- Postgres also requires baseline table-level privileges before RLS is even
-- consulted — without these grants every query gets a flat
-- "permission denied for table X", regardless of any RLS policy. Full CRUD is
-- granted uniformly here; RLS policies (select-only on sessions/events/
-- questions/notifications/jobs, owner-scoped elsewhere) remain the actual
-- fine-grained gate, since Postgres still denies any command with no matching
-- permissive policy even when the GRANT allows it.
-- ============================================================================

grant usage on schema public to authenticated, anon;

grant select, insert, update, delete on
  public.profiles,
  public.decks,
  public.slides,
  public.script_versions,
  public.shares,
  public.sessions,
  public.events,
  public.questions,
  public.notifications,
  public.jobs
to authenticated;

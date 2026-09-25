-- 0009 — grant service_role table privileges for the parse/jobs pipeline.
-- Idempotent: GRANT is safe to re-run.
--
-- 0003 only granted authenticated. The service-role client (enqueueJob,
-- runParseJob, Vision OCR cache/rate limits) needs table-level privileges
-- too — RLS is bypassed, but Postgres still checks GRANTs.

grant usage on schema public to service_role;

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
to service_role;

grant select, insert, update, delete on public.rate_limits to service_role;

grant usage, select on all sequences in schema public to service_role;

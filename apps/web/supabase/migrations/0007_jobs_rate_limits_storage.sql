-- 0007 — rate limits, job backoff, optional pgmq, storage upload policies
-- Free-tier safe: jobs table is the durable queue (FOR UPDATE SKIP LOCKED).
-- pgmq is enabled when available for future Supabase Queues use.

-- ---- rate_limits (sliding window) ------------------------------------------
create table if not exists rate_limits (
  key text not null,
  window_start timestamptz not null,
  count int not null default 0,
  primary key (key, window_start)
);
create index if not exists rate_limits_window_idx on rate_limits (window_start);

-- ---- jobs: backoff + payload + new types -----------------------------------
alter table jobs add column if not exists run_after timestamptz not null default now();
alter table jobs add column if not exists payload jsonb not null default '{}'::jsonb;
alter table jobs add column if not exists step text;

do $$ begin
  alter type job_type add value if not exists 'tts_pregen';
exception when duplicate_object then null;
when others then null;
end $$;

do $$ begin
  alter type job_type add value if not exists 'escalation_notify';
exception when duplicate_object then null;
when others then null;
end $$;

create index if not exists jobs_pending_run_idx
  on jobs (status, run_after)
  where status = 'pending';

-- ---- pgmq (best-effort; ignore if extension unavailable) --------------------
do $$ begin
  create extension if not exists pgmq;
exception when others then
  raise notice 'pgmq not available on this plan — jobs table remains the queue';
end $$;

do $$ begin
  perform pgmq.create('deck_pipeline');
exception when others then
  raise notice 'pgmq.create skipped';
end $$;

-- ---- storage: authenticated users may upload into their own prefix ---------
-- Bucket itself must exist (created in dashboard). Policies are idempotent.
do $$ begin
  insert into storage.buckets (id, name, public)
  values ('decks', 'decks', false)
  on conflict (id) do nothing;
exception when others then null;
end $$;

drop policy if exists "decks_owner_insert" on storage.objects;
drop policy if exists "decks_owner_select" on storage.objects;
drop policy if exists "decks_owner_update" on storage.objects;

create policy "decks_owner_insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'decks'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "decks_owner_select" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'decks'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "decks_owner_update" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'decks'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

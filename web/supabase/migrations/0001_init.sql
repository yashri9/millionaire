-- ============================================================================
-- Deck Agent v1 — initial schema (PRD §5)
-- Idempotent: safe to re-run if a prior push partially applied.
-- ============================================================================

create extension if not exists "pgcrypto";

-- ---- Enums (idempotent) ----------------------------------------------------
do $$ begin create type deck_status as enum ('uploading', 'parse_failed', 'draft', 'published');
exception when duplicate_object then null; end $$;
do $$ begin create type share_status as enum ('active', 'revoked');
exception when duplicate_object then null; end $$;
do $$ begin create type event_type as enum ('opened', 'slide_viewed', 'question_asked', 'escalated', 'completed');
exception when duplicate_object then null; end $$;
do $$ begin create type notification_channel as enum ('email');
exception when duplicate_object then null; end $$;
do $$ begin create type notification_status as enum ('sent', 'failed');
exception when duplicate_object then null; end $$;
do $$ begin create type job_type as enum ('parse', 'generate_script');
exception when duplicate_object then null; end $$;
do $$ begin create type job_status as enum ('pending', 'running', 'done', 'failed');
exception when duplicate_object then null; end $$;

-- ---- updated_at helper -----------------------------------------------------
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---- profiles (extends auth.users) ----------------------------------------
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text,
  google_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
drop trigger if exists profiles_updated_at on profiles;
create trigger profiles_updated_at before update on profiles
  for each row execute function set_updated_at();

create or replace function handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, name, google_id)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', new.raw_user_meta_data->>'full_name'),
    new.raw_user_meta_data->>'provider_id'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ---- decks -----------------------------------------------------------------
create table if not exists decks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'Untitled deck',
  status deck_status not null default 'uploading',
  source_file_url text,
  last_viewed_slide_index int not null default 0,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists decks_user_id_idx on decks(user_id) where deleted_at is null;
drop trigger if exists decks_updated_at on decks;
create trigger decks_updated_at before update on decks
  for each row execute function set_updated_at();

-- ---- slides ----------------------------------------------------------------
create table if not exists slides (
  id uuid primary key default gen_random_uuid(),
  deck_id uuid not null references decks(id) on delete cascade,
  order_index int not null,
  title text not null default '',
  bullets jsonb not null default '[]'::jsonb,
  unique (deck_id, order_index)
);
create index if not exists slides_deck_id_idx on slides(deck_id);

-- ---- script_versions -------------------------------------------------------
create table if not exists script_versions (
  id uuid primary key default gen_random_uuid(),
  deck_id uuid not null references decks(id) on delete cascade,
  is_published boolean not null default false,
  narration jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists script_versions_deck_id_idx on script_versions(deck_id);

-- ---- shares ----------------------------------------------------------------
create table if not exists shares (
  id uuid primary key default gen_random_uuid(),
  deck_id uuid not null references decks(id) on delete cascade,
  token text not null,
  script_version_id uuid not null references script_versions(id),
  status share_status not null default 'active',
  created_at timestamptz not null default now()
);
create unique index if not exists shares_token_key on shares(token);
create index if not exists shares_deck_id_idx on shares(deck_id);

-- ---- sessions (recipient) --------------------------------------------------
create table if not exists sessions (
  id uuid primary key default gen_random_uuid(),
  share_id uuid not null references shares(id) on delete cascade,
  opened_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  completed boolean not null default false
);
create index if not exists sessions_share_id_idx on sessions(share_id);

-- ---- events ----------------------------------------------------------------
create table if not exists events (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions(id) on delete cascade,
  type event_type not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists events_session_id_idx on events(session_id);

-- ---- questions -------------------------------------------------------------
create table if not exists questions (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions(id) on delete cascade,
  text text not null,
  answer_text text,
  escalated boolean not null default false,
  confidence double precision,
  slide_ref int,
  bullet_ref int,
  created_at timestamptz not null default now()
);
create index if not exists questions_session_id_idx on questions(session_id);

-- ---- notifications ---------------------------------------------------------
create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  question_id uuid not null references questions(id) on delete cascade,
  channel notification_channel not null default 'email',
  sent_at timestamptz,
  status notification_status not null default 'sent'
);
create index if not exists notifications_user_id_idx on notifications(user_id);

-- ---- jobs ------------------------------------------------------------------
create table if not exists jobs (
  id uuid primary key default gen_random_uuid(),
  type job_type not null,
  deck_id uuid not null references decks(id) on delete cascade,
  status job_status not null default 'pending',
  error text,
  attempts int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists jobs_status_idx on jobs(status);
drop trigger if exists jobs_updated_at on jobs;
create trigger jobs_updated_at before update on jobs
  for each row execute function set_updated_at();

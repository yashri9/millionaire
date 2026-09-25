-- 0011 — Instinct outbound ?ref= tracking (ref_clicks)
-- Idempotent: safe to re-run.

create table if not exists public.ref_clicks (
  id bigint generated always as identity primary key,
  ref text not null,
  user_agent text,
  created_at timestamptz not null default now()
);

alter table public.ref_clicks enable row level security;

-- No policies: anon/authenticated cannot read or write. Server uses service_role.
grant select, insert on public.ref_clicks to service_role;

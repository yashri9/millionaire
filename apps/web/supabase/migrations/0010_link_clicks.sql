-- 0010 — outbound link click tracking (homepage ?ref=)
-- Idempotent: safe to re-run.

create table if not exists public.link_clicks (
  id uuid primary key default gen_random_uuid(),
  ref text,
  path text,
  user_agent text,
  created_at timestamptz not null default now()
);

create index if not exists link_clicks_created_at_idx on public.link_clicks (created_at desc);
create index if not exists link_clicks_ref_idx on public.link_clicks (ref);

alter table public.link_clicks enable row level security;

-- No anon/authenticated policies: inserts go through service_role only.
grant select, insert on public.link_clicks to service_role;

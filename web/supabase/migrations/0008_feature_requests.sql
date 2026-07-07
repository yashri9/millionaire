-- A shared feature-request board (like Canny) visible to every signed-in
-- user, not per-owner data — see src/app/(app)/feedback/page.tsx.
create table if not exists feature_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  details text,
  created_at timestamptz not null default now()
);
create index if not exists feature_requests_created_at_idx on feature_requests (created_at desc);

create table if not exists feature_request_votes (
  request_id uuid not null references feature_requests(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (request_id, user_id)
);

alter table feature_requests enable row level security;
alter table feature_request_votes enable row level security;

-- Every signed-in user can read the whole board and vote on anything; only
-- the author can delete their own request. There is no "owner" concept here
-- the way there is for decks (lib/ownership.ts doesn't apply).
drop policy if exists feature_requests_read_all on feature_requests;
create policy feature_requests_read_all on feature_requests
  for select using (auth.role() = 'authenticated');
drop policy if exists feature_requests_insert_own on feature_requests;
create policy feature_requests_insert_own on feature_requests
  for insert with check (user_id = auth.uid());
drop policy if exists feature_requests_delete_own on feature_requests;
create policy feature_requests_delete_own on feature_requests
  for delete using (user_id = auth.uid());

drop policy if exists feature_request_votes_read_all on feature_request_votes;
create policy feature_request_votes_read_all on feature_request_votes
  for select using (auth.role() = 'authenticated');
drop policy if exists feature_request_votes_insert_own on feature_request_votes;
create policy feature_request_votes_insert_own on feature_request_votes
  for insert with check (user_id = auth.uid());
drop policy if exists feature_request_votes_delete_own on feature_request_votes;
create policy feature_request_votes_delete_own on feature_request_votes
  for delete using (user_id = auth.uid());

-- Base table grants — RLS alone isn't enough, see supabase/README.md.
grant select, insert, delete on feature_requests to authenticated;
grant select, insert, delete on feature_request_votes to authenticated;

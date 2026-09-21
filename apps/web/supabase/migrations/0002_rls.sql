-- ============================================================================
-- Deck Agent v1 — Row Level Security (PRD §11)
-- Idempotent: safe to re-run if a prior push partially applied.
-- ============================================================================

alter table profiles         enable row level security;
alter table decks            enable row level security;
alter table slides           enable row level security;
alter table script_versions  enable row level security;
alter table shares           enable row level security;
alter table sessions         enable row level security;
alter table events           enable row level security;
alter table questions        enable row level security;
alter table notifications    enable row level security;
alter table jobs             enable row level security;

-- ---- profiles --------------------------------------------------------------
drop policy if exists profiles_self_select on profiles;
create policy profiles_self_select on profiles
  for select using (id = auth.uid());
drop policy if exists profiles_self_update on profiles;
create policy profiles_self_update on profiles
  for update using (id = auth.uid());

-- ---- decks -----------------------------------------------------------------
drop policy if exists decks_owner_select on decks;
create policy decks_owner_select on decks
  for select using (user_id = auth.uid());
drop policy if exists decks_owner_insert on decks;
create policy decks_owner_insert on decks
  for insert with check (user_id = auth.uid());
drop policy if exists decks_owner_update on decks;
create policy decks_owner_update on decks
  for update using (user_id = auth.uid());
drop policy if exists decks_owner_delete on decks;
create policy decks_owner_delete on decks
  for delete using (user_id = auth.uid());

-- ---- helper: does the current user own this deck? --------------------------
create or replace function owns_deck(the_deck_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from decks d
    where d.id = the_deck_id and d.user_id = auth.uid()
  );
$$;

-- ---- slides / script_versions / shares -------------------------------------
drop policy if exists slides_owner_all on slides;
create policy slides_owner_all on slides
  for all using (owns_deck(deck_id)) with check (owns_deck(deck_id));

drop policy if exists script_versions_owner_all on script_versions;
create policy script_versions_owner_all on script_versions
  for all using (owns_deck(deck_id)) with check (owns_deck(deck_id));

drop policy if exists shares_owner_all on shares;
create policy shares_owner_all on shares
  for all using (owns_deck(deck_id)) with check (owns_deck(deck_id));

-- ---- analytics tables ------------------------------------------------------
create or replace function owns_share(the_share_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from shares s join decks d on d.id = s.deck_id
    where s.id = the_share_id and d.user_id = auth.uid()
  );
$$;

drop policy if exists sessions_owner_select on sessions;
create policy sessions_owner_select on sessions
  for select using (owns_share(share_id));

drop policy if exists events_owner_select on events;
create policy events_owner_select on events
  for select using (
    exists (select 1 from sessions se where se.id = events.session_id and owns_share(se.share_id))
  );

drop policy if exists questions_owner_select on questions;
create policy questions_owner_select on questions
  for select using (
    exists (select 1 from sessions se where se.id = questions.session_id and owns_share(se.share_id))
  );

-- ---- notifications ---------------------------------------------------------
drop policy if exists notifications_owner_select on notifications;
create policy notifications_owner_select on notifications
  for select using (user_id = auth.uid());

-- ---- jobs ------------------------------------------------------------------
drop policy if exists jobs_owner_select on jobs;
create policy jobs_owner_select on jobs
  for select using (owns_deck(deck_id));

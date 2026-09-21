-- Persist slide-render outcome on the deck row (survives reloads; no client-side guessing).
alter table decks add column if not exists rendered boolean not null default true;
alter table decks add column if not exists render_warning text;

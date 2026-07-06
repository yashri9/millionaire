-- Lets a user customize the narration prompt's style/instructions from
-- Account settings instead of editing lib/prompts.ts. Reuses profiles' own
-- self-scoped RLS + grants (0002_rls.sql / 0003_grants.sql already cover
-- every column on this table) — no new policy or grant needed.
alter table profiles add column if not exists narration_prompt text;

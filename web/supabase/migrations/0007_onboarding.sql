-- One-time cohort onboarding, shown right after first login (see
-- src/app/onboarding/page.tsx). Reuses profiles' own self-scoped RLS +
-- grants (0002_rls.sql / 0003_grants.sql already cover every column on this
-- table) — no new policy or grant needed.
alter table profiles add column if not exists onboarding_role text;
alter table profiles add column if not exists onboarding_use_case text;
alter table profiles add column if not exists onboarding_team_size text;
alter table profiles add column if not exists onboarding_referral_source text;
alter table profiles add column if not exists onboarding_challenge text;
alter table profiles add column if not exists onboarding_completed_at timestamptz;

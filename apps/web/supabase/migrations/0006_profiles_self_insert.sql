-- Allow authenticated users to insert their own profile row
-- (idempotent fallback when the auth trigger already ran or was skipped)

drop policy if exists profiles_self_insert on public.profiles;
create policy profiles_self_insert on public.profiles
  for insert
  to authenticated
  with check (id = auth.uid());

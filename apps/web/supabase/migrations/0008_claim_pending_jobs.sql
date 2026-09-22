-- Optional atomic claim helper for the jobs worker.
create or replace function claim_pending_jobs(p_limit int, p_now timestamptz)
returns setof jobs
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with cte as (
    select id
    from jobs
    where status = 'pending'
      and run_after <= p_now
    order by created_at asc
    for update skip locked
    limit greatest(1, least(p_limit, 10))
  )
  update jobs j
  set status = 'running',
      attempts = j.attempts + 1,
      updated_at = now()
  from cte
  where j.id = cte.id
  returning j.*;
end;
$$;

revoke all on function claim_pending_jobs(int, timestamptz) from public;
grant execute on function claim_pending_jobs(int, timestamptz) to service_role;

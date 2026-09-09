-- 00078 · The sweep for jobs that never came back.
--
-- claim_job flips a job to 'fired' and the handler runs. If the lambda dies in
-- between — a timeout, a cold start, a deploy mid-flight — the row stays
-- 'fired' for ever: nothing swept it, nothing retried it, and api/jobs/fire.ts
-- deliberately answers 200 so QStash will not either, because the ledger owns
-- retry policy. So 'fired' was the one state a job could not leave, and for an
-- outbound_send that is a reply the operator watches sit at "Sending…"
-- indefinitely with nobody told.
--
-- The reaping itself is the edge's, not this function's: it has to address the
-- alert from the tenant's own runtime, and it has to leave a message alone
-- when the handler did record the send before dying. Here is only the clock.
--
-- Every quarter hour at 4, 19, 34 and 49 — minutes no other sweep uses, and
-- offset off the :00/:15 grid for the same reason sweep-health is: a tick that
-- lands on another sweep's tick judges work seconds old.
create or replace function public.trigger_stale_jobs_sweep()
returns bigint
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_key text;
  v_url text;
  v_id  bigint;
begin
  select public.get_cron_sweep_key() into v_key;
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'edge_base_url';
  if v_key is null or v_url is null then
    raise warning 'stale jobs sweep not configured (missing cron_sweep_key or edge_base_url)';
    return null;
  end if;
  select net.http_post(
    url     := v_url || '/api/cron/jobs',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-key', v_key),
    body    := '{}'::jsonb,
    timeout_milliseconds := 55000
  ) into v_id;
  return v_id;
end $$;
revoke execute on function public.trigger_stale_jobs_sweep() from public, anon, authenticated;

select cron.schedule('stale-jobs-sweep', '4,19,34,49 * * * *', $$select public.trigger_stale_jobs_sweep()$$);

-- The sweep reads jobs by state and age on every tick. Without this it is a
-- sequential scan over every job the product has ever scheduled, four times an
-- hour, for a query whose answer is almost always nothing.
create index if not exists jobs_fired_at_idx on public.jobs (fired_at) where state = 'fired';

-- Evidence rows have a shelf life.
--
-- Every signed delivery from the phone provider writes two rows into events
-- (webhook.auth, webhook.delivery) — one pair per turn of every call — so the
-- signature question and the "what did this delivery carry" question could be
-- answered from a table instead of from logs nobody can read. They answered
-- it. Past a month they are weight: the answer either settled the question or
-- it is stale, and the partitioned table holds them forever. Nothing else in
-- events is touched: consent changes, erasures, usage and the message ledger
-- are the record, not telemetry.

create or replace function public.purge_events(p_keep interval default '30 days')
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare v_count integer;
begin
  delete from public.events
   where kind in ('webhook.auth', 'webhook.delivery')
     and created_at < now() - p_keep;
  get diagnostics v_count = row_count;
  return v_count;
end $$;

revoke execute on function public.purge_events(interval) from public, anon, authenticated;

comment on function public.purge_events(interval) is
  'Drops webhook.auth and webhook.delivery evidence rows older than p_keep (default 30 days). Every other event kind is the record and is never purged here.';

-- 04:23 daily: six minutes after purge-cron-history (04:17), on a minute no
-- sweep tick uses (:23 is not a multiple of 5, 10 or 30).
select cron.unschedule('purge-events') where exists (select 1 from cron.job where jobname = 'purge-events');
select cron.schedule('purge-events', '23 4 * * *', $$select public.purge_events()$$);

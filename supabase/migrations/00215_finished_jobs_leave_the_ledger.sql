-- 00215 · Finished jobs leave the ledger.
--
-- Nothing purged `jobs`, so every send left a row holding its number, address
-- and words (outbound_send) or a staff device's push token (push_receipts) for
-- as long as the workspace existed, and an erasure had to read all of them. A
-- finished row is needed only briefly: the longest window the code leans on is
-- Apify's redelivery of a round's last page, about 32 hours, against
-- jobs_lead_collect_once (00140); a failed row is cited in alerts, which are
-- kept 90 days (00057). So a done or canceled row goes a week after it last
-- changed, a failed one after 90 days. A finished outbound_send whose message
-- is still queued stays: the reach-out sender may yet adopt it. Scheduled and
-- fired rows are the live ledger and are never read here. Numbers: contracts'
-- RETENTION_DAYS (jobs_finished, jobs_failed).

create or replace function public.purge_jobs(p_finished interval default '7 days', p_failed interval default '90 days')
returns integer
language plpgsql
security definer
set search_path = public
-- A purge waits for nobody: a row an erasure is scrubbing this second is purged tomorrow.
set lock_timeout = '3s'
as $$
declare
  v_total integer := 0;
  v_n     integer;
begin
  -- A thousand at a time, so no one statement holds the ledger for long.
  loop
    delete from public.jobs j
     where j.id in (
       select c.id from public.jobs c
        where ((c.state in ('done', 'canceled') and c.updated_at < now() - p_finished)
            or (c.state = 'failed' and c.updated_at < now() - p_failed))
          -- A CASE, not an AND, so the cast only ever sees a well-formed id (a
          -- scrubbed payload has none): Postgres promises no order among ANDs.
          and not exists (
            select 1 from public.messages m
             where c.kind = 'outbound_send'
               and m.id = case
                            when c.payload->>'message_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                            then (c.payload->>'message_id')::uuid
                          end
               and m.status = 'queued'
          )
        limit 1000
     );
    get diagnostics v_n = row_count;
    v_total := v_total + v_n;
    exit when v_n < 1000;
  end loop;
  return v_total;
end $$;
revoke execute on function public.purge_jobs(interval, interval) from public, anon, authenticated;
comment on function public.purge_jobs(interval, interval) is
  'Nightly. Deletes done and canceled jobs a week after they last changed and failed ones after 90 days, a thousand at a time, keeping any finished outbound_send whose message is still queued. Never reads a scheduled or fired row. Numbers: contracts'' RETENTION_DAYS.';

select cron.unschedule('purge-jobs') where exists (select 1 from cron.job where jobname = 'purge-jobs');
select cron.schedule('purge-jobs', '51 4 * * *', $$select public.purge_jobs()$$);

-- Judged on its runs, like the other purges (00107).
insert into public.sweep_status (sweep, jobname, max_silence, judged_by, requested_at) values
  ('purge_jobs', 'purge-jobs', interval '26 hours', 'run', null)
on conflict (sweep) do update
   set jobname = excluded.jobname, max_silence = excluded.max_silence, judged_by = excluded.judged_by;

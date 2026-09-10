-- 00099 · A clock that ticks every ten seconds keeps a day of history, not a fortnight.
--
-- 00098 put three jobs on a ten-second schedule: the ledger's heartbeat and the
-- two row clocks. pg_cron writes a row to cron.job_run_details for every run --
-- 25,920 a day between the three -- and purge_cron_history() kept every run for
-- fourteen days: about 360,000 rows, nearly all of them "succeeded" in under a
-- millisecond. Nothing here is watched through those rows. sweep_health() reads
-- the heartbeat's own sweep_status row and pg_net's responses, so a day of
-- history is enough to read a recent failure by hand, and a fortnight is noise
-- and disk.
--
-- A job is frequent when pg_cron schedules it in seconds. The per-job floor
-- still applies, so every job keeps its latest runs whatever their age. The rule
-- is a third horizon rather than a constant inside the body, so a caller that
-- wants to delete nothing -- the watchdog's integration test -- can still say so.
--
-- language sql rather than plpgsql: the body is checked when this migration
-- applies, not on its first run at 04:17.

drop function if exists public.purge_cron_history(interval, integer);

create or replace function public.purge_cron_history(
  p_keep          interval default '14 days',
  p_keep_per_job  integer  default 30,
  p_keep_frequent interval default '1 day'
)
returns integer
language sql
security definer
set search_path = public
as $$
  with ranked as (
    select d.runid,
           row_number() over (partition by d.jobid order by d.start_time desc nulls first) as rn,
           coalesce(j.schedule like '% seconds', false) as frequent
      from cron.job_run_details d
      left join cron.job j on j.jobid = d.jobid
  ),
  gone as (
    delete from cron.job_run_details d
     using ranked r
     where r.runid = d.runid
       and r.rn > p_keep_per_job
       and d.start_time < now() - case when r.frequent then p_keep_frequent else p_keep end
    returning 1
  )
  select count(*)::integer from gone
$$;

revoke execute on function public.purge_cron_history(interval, integer, interval) from public, anon, authenticated;

comment on function public.purge_cron_history(interval, integer, interval) is
  'Bounds cron.job_run_details: drops runs older than p_keep, or older than p_keep_frequent for a job pg_cron schedules in seconds, except the most recent p_keep_per_job of each job. Rows with a null start_time are never deleted. Scheduled daily as purge-cron-history (00026).';

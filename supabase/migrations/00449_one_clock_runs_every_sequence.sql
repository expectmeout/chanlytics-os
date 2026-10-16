-- 00449: one clock runs every sequence (decision 0060, S2: "one clock, two cadences"). Three pg_cron jobs asked the edge
-- for a sequence's work: playbooks-sweep (the moments, hourly at :05, 00048), reach-out-sweep (the leads' send clock,
-- every minute, 00186) and reach-out-check-sweep (the check before each cold email, every minute, 00197). They become one
-- job, sequences-clock, every minute, which asks each part at its own speed: the moments at five past the hour, as
-- before, and the check and the send clock each minute, each deciding for itself whether there is work, as before.
--
-- Nothing an edge door does changes, nor when it is asked: each part still records its own sweep_status row, and
-- sweep_health still judges each by its own silence, now against the one job they share. A part that raises is caught
-- and said as a warning, so one part's fault never stops the others from being asked that minute; a part that cannot
-- record itself goes silent, and sweep_health says so, as it did when it had its own job. Applied before the dashboard
-- deploys or after: no app reads a job's name. Re-runnable.

set local lock_timeout = '3s';

-- An instant may be named (a test's), else the clock's own: pg_cron calls it bare.
create or replace function public.trigger_sequences_clock(p_at timestamptz default now())
returns void
language plpgsql
security definer
set search_path = 'public', 'extensions'
as $$
begin
  -- The moments: once an hour, at five past, as playbooks-sweep ran.
  if extract(minute from p_at)::int = 5 then
    begin
      perform public.trigger_playbooks_sweep();
    exception when others then
      raise warning 'sequences-clock: the moments were not asked: %', sqlerrm;
    end;
  end if;
  -- The check before each cold email: every minute, asked only when a send waits for it.
  begin
    perform public.trigger_reach_out_check_sweep();
  exception when others then
    raise warning 'sequences-clock: the check was not asked: %', sqlerrm;
  end;
  -- The leads' send clock: every minute, asked only when a checked send is due or a run is ready to finish.
  begin
    perform public.trigger_reach_out_sweep();
  exception when others then
    raise warning 'sequences-clock: the send clock was not asked: %', sqlerrm;
  end;
end $$;
revoke execute on function public.trigger_sequences_clock(timestamptz) from public, anon, authenticated;
comment on function public.trigger_sequences_clock(timestamptz) is
  'The one clock every sequence runs on (0060, S2): each minute it asks the moments'' sweep (at five past the hour), the check and the leads'' send clock, each at its own speed and each recording its own sweep_status row; one part''s fault is a warning and never stops the others.';

-- Each part keeps its row and its silence, judged against the one job.
update public.sweep_status
   set jobname = 'sequences-clock'
 where sweep in ('playbooks', 'reach_out', 'reach_out_check');

select cron.unschedule(j.jobname)
  from cron.job j
 where j.jobname in ('playbooks-sweep', 'reach-out-sweep', 'reach-out-check-sweep');
select cron.unschedule('sequences-clock') where exists (select 1 from cron.job where jobname = 'sequences-clock');
select cron.schedule('sequences-clock', '* * * * *', $$select public.trigger_sequences_clock()$$);

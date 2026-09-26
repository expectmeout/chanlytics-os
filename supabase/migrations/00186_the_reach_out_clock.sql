-- 00186 · The reach-out clock.
--
-- Reach out, Part 3 (the plan's PR 5). Every minute; it calls the edge (/api/cron/reach-out) only when there is work:
-- a send due in a run that goes ahead on a running chain (a send whose domain was removed is one: it is planned again on
-- another once its time has passed), a send claimed or queued (its email's
-- outcome to read), a canceled or failed run with sends still open, or a run that goes ahead with none left open (to
-- finish). Otherwise it records that it looked, so a quiet clock is still a watched one (00107). A run waiting for its
-- owner, and a paused chain, call nothing: their sends keep until they go ahead, and are planned again then.

set local lock_timeout = '3s';

-- The runs of reach-outs, by state: the clock asks for its open ones every minute.
create index if not exists broadcasts_reach_out_state on public.broadcasts (state) where audience->>'kind' = 'reach_out';

create or replace function public.trigger_reach_out_sweep()
returns bigint
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if exists (
       select 1 from public.reach_out_sends s
         join public.broadcasts b on b.id = s.broadcast_id
         join public.playbooks p on p.id = s.playbook_id
         join public.playbooks r on r.id = s.root_id
        where s.state = 'planned' and s.send_at <= now()
          and b.state in ('scheduled', 'sending') and p.state = 'running' and r.state = 'running')
     or exists (select 1 from public.reach_out_sends where state in ('claimed', 'queued'))
     or exists (
       select 1 from public.broadcasts b
        where b.audience->>'kind' = 'reach_out' and b.state in ('canceled', 'failed')
          and exists (select 1 from public.reach_out_sends s where s.broadcast_id = b.id and s.state in ('planned', 'claimed')))
     or exists (
       select 1 from public.broadcasts b
        where b.audience->>'kind' = 'reach_out' and b.state in ('scheduled', 'sending')
          and not exists (select 1 from public.reach_out_sends s
                           where s.broadcast_id = b.id and s.state in ('planned', 'claimed', 'queued'))) then
    return public.request_sweep('reach_out', '/api/cron/reach-out', 55000);
  end if;
  insert into public.sweep_status (sweep, requested_at) values ('reach_out', now())
  on conflict (sweep) do update set requested_at = excluded.requested_at;
  return null;
end $$;
revoke execute on function public.trigger_reach_out_sweep() from public, anon, authenticated;
comment on function public.trigger_reach_out_sweep() is
  'The reach-out clock (Reach out, Part 3). Calls the edge only when a send is due in a run that goes ahead, one is claimed or queued, a closed run keeps open sends, or a run is ready to finish; otherwise records that it looked.';

insert into public.sweep_status (sweep, jobname, max_silence, judged_by, requested_at) values
  -- every minute, recording itself each time: five minutes is five missed ticks.
  ('reach_out', 'reach-out-sweep', interval '5 minutes', 'request', now())
on conflict (sweep) do update
   set jobname = excluded.jobname, max_silence = excluded.max_silence, judged_by = excluded.judged_by;

select cron.unschedule('reach-out-sweep') where exists (select 1 from cron.job where jobname = 'reach-out-sweep');
select cron.schedule('reach-out-sweep', '* * * * *', $$select public.trigger_reach_out_sweep()$$);

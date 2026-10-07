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

/* ------------------------------------------------------ the clock's reads -- */

-- Each step's work, chosen here and bounded here: a list of ids in a request's address, or a page PostgREST cuts at
-- its thousand rows, would stop the clock (a URL too long) or finish a run that still had a send (its page cut short).
-- Service role only; the edge's clock (apps/edge lib/reach-out/clock.ts) asks them. Each takes one workspace to keep to
-- (p_tenant_id), or every workspace (null, as the clock asks): a test proves the clock on one without touching another's.

-- Queued sends and their emails, the ones with an outcome to read first: a row still queued (its job to come) or
-- waiting on its receipt goes last, so it never holds the page.
create or replace function public.reach_out_queued_outcomes(p_limit int, p_tenant_id uuid default null)
returns table (send jsonb, status text, error jsonb, sent_at text, written_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select to_jsonb(s), m.status, m.error, m.meta->'status_at'->>'sent', m.created_at
    from public.reach_out_sends s
    left join public.messages m on m.id = s.message_id
   where s.state = 'queued' and (p_tenant_id is null or s.tenant_id = p_tenant_id)
   order by (m.id is not null and (m.status = 'queued'
                                   or (m.status = 'failed' and coalesce(m.error->>'outcome', '') = 'unknown'))),
            s.updated_at
   limit greatest(coalesce(p_limit, 0), 0)
$$;
revoke execute on function public.reach_out_queued_outcomes(int, uuid) from public, anon, authenticated;
grant execute on function public.reach_out_queued_outcomes(int, uuid) to service_role;

-- Planned sends left past `p_before` in a run that goes ahead on a running chain: the ones the clock plans again. A
-- run waiting for its owner, or a paused chain, keeps its sends out of the page, however many and however old.
create or replace function public.reach_out_stale_sends(p_before timestamptz, p_limit int, p_tenant_id uuid default null)
returns setof public.reach_out_sends
language sql
stable
security definer
set search_path = public
as $$
  select s.* from public.reach_out_sends s
    join public.broadcasts b on b.id = s.broadcast_id
    join public.playbooks p on p.id = s.playbook_id
    join public.playbooks r on r.id = s.root_id
   where s.state = 'planned' and s.send_at <= p_before and (p_tenant_id is null or s.tenant_id = p_tenant_id)
     and b.state in ('scheduled', 'sending') and p.state = 'running' and r.state = 'running'
   order by s.send_at
   limit greatest(coalesce(p_limit, 0), 0)
$$;
revoke execute on function public.reach_out_stale_sends(timestamptz, int, uuid) from public, anon, authenticated;
grant execute on function public.reach_out_stale_sends(timestamptz, int, uuid) to service_role;

-- The open sends of runs canceled or failed, with their email's state: planned ones, queued ones (their email still
-- to be withdrawn), and claimed ones whose writer is done with them (claimed before `p_stuck_before`). A claim younger
-- than that is its writer's, and the unstick step's after it.
create or replace function public.reach_out_closed_sends(p_stuck_before timestamptz, p_limit int, p_tenant_id uuid default null)
returns table (send jsonb, email_status text)
language sql
stable
security definer
set search_path = public
as $$
  select to_jsonb(s), m.status
    from public.reach_out_sends s
    join public.broadcasts b on b.id = s.broadcast_id
    left join public.messages m on m.id = s.message_id
   where b.state in ('canceled', 'failed') and (p_tenant_id is null or s.tenant_id = p_tenant_id)
     and (s.state in ('planned', 'queued') or (s.state = 'claimed' and s.claimed_at < p_stuck_before))
   limit greatest(coalesce(p_limit, 0), 0)
$$;
revoke execute on function public.reach_out_closed_sends(timestamptz, int, uuid) from public, anon, authenticated;
grant execute on function public.reach_out_closed_sends(timestamptz, int, uuid) to service_role;

-- Reach-out runs that go ahead with no send left open: the ones to finish.
create or replace function public.reach_out_finishable(p_limit int, p_tenant_id uuid default null)
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select b.id from public.broadcasts b
   where b.audience->>'kind' = 'reach_out' and b.state in ('scheduled', 'sending')
     and (p_tenant_id is null or b.tenant_id = p_tenant_id)
     and not exists (select 1 from public.reach_out_sends s
                      where s.broadcast_id = b.id and s.state in ('planned', 'claimed', 'queued'))
   limit greatest(coalesce(p_limit, 0), 0)
$$;
revoke execute on function public.reach_out_finishable(int, uuid) from public, anon, authenticated;
grant execute on function public.reach_out_finishable(int, uuid) to service_role;

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

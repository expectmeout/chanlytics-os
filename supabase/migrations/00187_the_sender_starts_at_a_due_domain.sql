-- 00187 · The sender starts at a domain with sends due, and counts the workspace's month.
--
-- Reach out, Part 3 (the plan's PR 6). The two reads the reach-out clock's claim asks before it claims (apps/edge
-- lib/reach-out/sender.ts), each chosen and bounded here, as 00186's are:
--
--   reach_out_due_domains(at, limit, tenant)   the verified domains with a send due in a run that goes ahead on a
--                                              running chain, the one waiting longest first. Filtered before its
--                                              limit: a domain whose due sends all wait (their chain paused, their run
--                                              with its owner) never takes a place in the page, and a page of sends
--                                              could not name one domain a thousand times and the next one never.
--   reach_out_month_sent(tenant, at)           the cold emails a workspace wrote this calendar month, in its own
--                                              zone, that left or may still leave: the ones that left, the ones of
--                                              unknown outcome, and the ones still queued for their job (so a tick
--                                              cannot claim past the allowance while emails wait to go). One the door
--                                              refused, or that never left, spends nothing.
--
-- Service role only.

set local lock_timeout = '3s';

create or replace function public.reach_out_due_domains(p_at timestamptz, p_limit int, p_tenant_id uuid default null)
returns table (id uuid, tenant_id uuid)
language sql
stable
security definer
set search_path = public
as $$
  select d.id, d.tenant_id
    from public.sending_domains d
    cross join lateral (
      select min(s.send_at) as first_due
        from public.reach_out_sends s
        join public.broadcasts b on b.id = s.broadcast_id
        join public.playbooks p on p.id = s.playbook_id
        join public.playbooks r on r.id = s.root_id
       where s.domain_id = d.id and s.state = 'planned' and s.send_at <= p_at
         and b.state in ('scheduled', 'sending') and p.state = 'running' and r.state = 'running') due
   where d.state = 'verified' and due.first_due is not null
     and (p_tenant_id is null or d.tenant_id = p_tenant_id)
   order by due.first_due, d.id
   limit greatest(coalesce(p_limit, 0), 0)
$$;
revoke execute on function public.reach_out_due_domains(timestamptz, int, uuid) from public, anon, authenticated;
grant execute on function public.reach_out_due_domains(timestamptz, int, uuid) to service_role;
comment on function public.reach_out_due_domains(timestamptz, int, uuid) is
  'The verified domains with a reach-out send due in a run that goes ahead on a running chain, longest waiting first (00187). Service role only.';

create or replace function public.reach_out_month_sent(p_tenant_id uuid, p_at timestamptz)
returns int
language sql
stable
security definer
set search_path = public
as $$
  with zone as (
    select coalesce(nullif(btrim(t.timezone), ''), 'America/New_York') as tz
      from public.tenants t where t.id = p_tenant_id
  ), month as (
    select date_trunc('month', p_at at time zone zone.tz) at time zone zone.tz as since,
           (date_trunc('month', p_at at time zone zone.tz) + interval '1 month') at time zone zone.tz as until
      from zone
  )
  select count(*)::int
    from public.messages m, month
   where m.tenant_id = p_tenant_id and m.created_at >= month.since and m.created_at < month.until
     and m.channel = 'email' and m.direction = 'outbound' and m.meta->>'source' = 'reach_out'
     and (public.email_left(m.status, m.error)
          or m.status = 'queued'
          or (m.status = 'failed' and coalesce(m.error->>'outcome', '') = 'unknown'))
$$;
revoke execute on function public.reach_out_month_sent(uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.reach_out_month_sent(uuid, timestamptz) to service_role;
comment on function public.reach_out_month_sent(uuid, timestamptz) is
  'The cold emails a workspace wrote this calendar month in its own zone that left, may have left, or wait to go: what its month''s allowance has spent (00187). Service role only.';

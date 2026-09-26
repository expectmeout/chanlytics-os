-- 00187 · The sender starts at a domain with sends due, and counts the workspace's month.
--
-- Reach out, Part 3 (the plan's PR 6). The two reads the reach-out clock's claim asks before it claims (apps/edge
-- lib/reach-out/sender.ts), each chosen and bounded here, as 00186's are:
--
--   reach_out_due_domains(at, limit, tenant, skip_tenants, skip_domains)
--       the verified domains with a day's share (clean) and a send due in a run that goes ahead on a running chain,
--       the one waiting longest first. Filtered before its limit: a domain whose due sends all wait (their chain
--       paused, their run with its owner) never takes a place in the page. The sender reads another page past the
--       workspaces it holds this tick (their month spent, their foot unwritable) and the domains it has done, so
--       those never keep a domain that can send out of it.
--   reach_out_month_sent(tenant, at)
--       the cold emails a workspace wrote this calendar month, in its own zone, that left or may still leave: the
--       ones that left, the ones of unknown outcome, and the ones still queued for their job (so a tick cannot claim
--       past the allowance while emails wait to go). One the door refused, or that never left, spends nothing. Read
--       through an index of the cold emails alone, so a busy workspace's month of replies is never scanned for it.
--
-- Service role only.

set local lock_timeout = '3s';

create index if not exists messages_reach_out_month on public.messages (tenant_id, created_at)
  where meta->>'source' = 'reach_out';

create or replace function public.reach_out_due_domains(
  p_at timestamptz,
  p_limit int,
  p_tenant_id uuid default null,
  p_skip_tenants uuid[] default '{}',
  p_skip_domains uuid[] default '{}'
)
returns table (id uuid, tenant_id uuid)
language sql
stable
security definer
set search_path = public
as $$
  select d.id, d.tenant_id
    from public.sending_domains d
    -- Its earliest due send that goes ahead: the domain's due sends in time order (reach_out_sends_due), the first
    -- that passes, so a paused chain's backlog is walked only as far as the first that does.
    cross join lateral (
      select s.send_at as first_due
        from public.reach_out_sends s
        join public.broadcasts b on b.id = s.broadcast_id
        join public.playbooks p on p.id = s.playbook_id
        join public.playbooks r on r.id = s.root_id
       where s.domain_id = d.id and s.state = 'planned' and s.send_at <= p_at
         and b.state in ('scheduled', 'sending') and p.state = 'running' and r.state = 'running'
       order by s.send_at
       limit 1) due
   where d.state = 'verified' and d.clean_since is not null
     and (p_tenant_id is null or d.tenant_id = p_tenant_id)
     and not (d.tenant_id = any (coalesce(p_skip_tenants, '{}')))
     and not (d.id = any (coalesce(p_skip_domains, '{}')))
   order by due.first_due, d.id
   limit greatest(coalesce(p_limit, 0), 0)
$$;
revoke execute on function public.reach_out_due_domains(timestamptz, int, uuid, uuid[], uuid[])
  from public, anon, authenticated;
grant execute on function public.reach_out_due_domains(timestamptz, int, uuid, uuid[], uuid[]) to service_role;
comment on function public.reach_out_due_domains(timestamptz, int, uuid, uuid[], uuid[]) is
  'The verified, clean domains with a reach-out send due in a run that goes ahead on a running chain, longest waiting first, past the workspaces and domains the caller has done with this tick (00187). Service role only.';

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
     and m.meta->>'source' = 'reach_out' and m.channel = 'email' and m.direction = 'outbound'
     and (public.email_left(m.status, m.error)
          or m.status = 'queued'
          or (m.status = 'failed' and coalesce(m.error->>'outcome', '') = 'unknown'))
$$;
revoke execute on function public.reach_out_month_sent(uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.reach_out_month_sent(uuid, timestamptz) to service_role;
comment on function public.reach_out_month_sent(uuid, timestamptz) is
  'The cold emails a workspace wrote this calendar month in its own zone that left, may have left, or wait to go: what its month''s allowance has spent (00187). Service role only.';

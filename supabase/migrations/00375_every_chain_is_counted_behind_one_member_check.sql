-- 00375 · Every chain's numbers are counted, behind one question of who may read a workspace.
--
-- Reach out Part 6's report (reach_out_report: 00241, 00261, 00360) lists at most twenty chains, the ones that wrote or
-- handed in the period, so a chain past the twentieth and a chain that sent nothing looked the same: absent. Campaigns'
-- ledger says each chain's last 30 days on its row, and "—" only where nothing was read; Reports' Reach-outs section
-- says each chain beside the report, over the report's own days. Now:
--
--   may_read_workspace(tenant)  whether the caller may read a workspace: a member of it, and a partner's seat only on a
--                               session that showed its second factor (00218, 00261, 00280). The member check ten definer
--                               reads write inline, said once for the next ones (those ten keep theirs until each is next
--                               changed). Security definer, since it reads memberships for the caller; it asks auth.uid(),
--                               never a parameter.
--   reach_out_chain_totals      every chain of the workspace (a reach-out's first step), by its id: what it wrote in the
--   (tenant, days, end)         window reach_out_report reads (00360), p_days days in the workspace's zone (1 to 90, held
--                               there as campaign_series holds its own) to `p_end`, the window's last day (null is today,
--                               and a day that has not come is read as today), and nothing after the midnight that ends
--                               it; how many of the businesses it wrote to wrote back; and when it last wrote in it. One
--                               pass over the emails that left (email_left, email_sent_at), each business counted once a
--                               chain at its last email, wrote back as the report says it (outreach_wrote_back): for a
--                               chain the report lists over the same window, the sums of its steps. A chain that wrote
--                               nothing is { written: 0, wrote_back: 0, last_at: null }, never absent. Security definer,
--                               because outreach_wrote_back is the service role's; behind may_read_workspace.
--
-- And reach_out_report's comment says the days it takes, 1 to 90: 00360 took any of them and its comment kept "7, 30 or
-- 90". Its body is 00360's.
--
-- reach-out-back/chain-totals.db.test.mjs holds both. Deploy order: either. Nothing calls reach_out_chain_totals until
-- Campaigns or Reports reads it, and that read says "—" while it is missing (packages/db isMissingDoor). Re-runnable: a
-- draft of this file made the function without `p_end` on local stacks, and it is dropped first, so no database holds two
-- for PostgREST to choose between.

create or replace function public.may_read_workspace(p_tenant uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null and exists (
    select 1 from public.memberships m
     where m.tenant_id = p_tenant
       and m.user_id = auth.uid()
       and (m.role <> 'partner' or public.session_shows_second_factor()))
$$;
revoke execute on function public.may_read_workspace(uuid) from public, anon;
grant execute on function public.may_read_workspace(uuid) to authenticated, service_role;
comment on function public.may_read_workspace(uuid) is
  'Whether the caller (auth.uid(), never a parameter) may read this workspace: a member of it, a partner''s seat only on a session that showed its second factor (00218, 00261). The one member check for a definer read (00375); the ten that inline it keep theirs until each is next changed.';

drop function if exists public.reach_out_chain_totals(uuid, integer);

create or replace function public.reach_out_chain_totals(p_tenant_id uuid, p_days integer, p_end date default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_days  integer := least(greatest(coalesce(p_days, 30), 1), 90);
  v_tz    text;
  v_today date;
  v_end   date;
  v_since timestamptz;
  v_stop  timestamptz;
begin
  if not public.may_read_workspace(p_tenant_id) then
    raise exception 'Workspace not found.' using errcode = 'P0002';
  end if;
  select coalesce(nullif(t.timezone, ''), 'America/New_York') into v_tz from public.tenants t where t.id = p_tenant_id;
  v_tz := coalesce(v_tz, 'America/New_York');
  v_today := (now() at time zone v_tz)::date;
  -- The window's last day and where it stops, as reach_out_report reads them (00360): today, or the earlier day a member
  -- picked, never a day that has not come; and the midnight after it, so a window that ended counts nothing after it.
  v_end   := least(coalesce(p_end, v_today), v_today);
  v_since := ((v_end - (v_days - 1))::timestamp) at time zone v_tz;
  v_stop  := ((v_end + 1)::timestamp) at time zone v_tz;
  return (
    -- An email that left (email_left), dated by when it left (email_sent_at), as reach_out_report counts it.
    with sent as (
      select s.root_id, s.lead_id, s.contact_id,
             coalesce(s.sent_at, public.email_sent_at(m.meta, m.status_updated_at, m.created_at)) as sent_at
        from public.reach_out_sends s
        left join public.messages m on m.id = s.message_id
       where s.tenant_id = p_tenant_id
         and (s.state = 'sent' or (s.state = 'failed' and public.email_left(m.status, m.error)))
    ),
    period as (
      select x.* from sent x where x.sent_at >= v_since and x.sent_at < v_stop
    ),
    -- Each business once a chain, at its last email of the period.
    last_sent as (
      select distinct on (x.root_id, x.lead_id) x.root_id, x.lead_id, x.contact_id
        from period x
        join public.leads l on l.id = x.lead_id and l.tenant_id = p_tenant_id
       order by x.root_id, x.lead_id, x.sent_at desc
    ),
    wrote as (
      select w.contact_id from public.outreach_wrote_back(p_tenant_id, array(
        select distinct ls.contact_id from last_sent ls where ls.contact_id is not null)) w(contact_id)
    ),
    per_chain as (
      select x.root_id, count(*) as written, max(x.sent_at) as last_at
        from period x
       group by x.root_id
    ),
    wrote_back as (
      select ls.root_id, count(*) as wrote_back
        from last_sent ls
       where ls.contact_id in (select w.contact_id from wrote w)
       group by ls.root_id
    )
    select coalesce(jsonb_object_agg(r.id::text, jsonb_build_object(
             'written', coalesce(c.written, 0),
             'wrote_back', coalesce(b.wrote_back, 0),
             'last_at', c.last_at)), '{}'::jsonb)
      from public.playbooks r
      left join per_chain c on c.root_id = r.id
      left join wrote_back b on b.root_id = r.id
     where r.tenant_id = p_tenant_id and r.kind = 'reach_out' and r.trigger = 'lead_first'
  );
end $$;
revoke execute on function public.reach_out_chain_totals(uuid, integer, date) from public, anon;
grant execute on function public.reach_out_chain_totals(uuid, integer, date) to authenticated, service_role;
comment on function public.reach_out_chain_totals(uuid, integer, date) is
  'Every chain of the workspace (a reach-out''s first step), by its id, for a member (may_read_workspace): what it wrote over p_days days (1 to 90) to the window''s last day in the workspace''s zone, the window reach_out_report reads, how many businesses it wrote to wrote back (outreach_wrote_back, each once a chain at its last email) and when it last wrote in it; a chain that wrote nothing is { written: 0, wrote_back: 0, last_at: null } (00375). `p_end` is the window''s last day, as 00360 reads it: null is today, and a day that has not come is read as today.';

comment on function public.reach_out_report(uuid, integer, date) is
  'Reports'' Reach-outs section (Reach out Part 6, H1, H3-H6), for a member: over p_days days (1 to 90; any other is refused) to the window''s last day in the workspace''s zone, the emails that left and what came of them. has_reach_out, totals, series (written per day), chains (at most 20, each with its steps; reach_out_chain_totals counts every chain over the same window, 00375), angles (the top 8, other_angles, no_angle) and domains (at most 10; a removed domain''s host is null). Each lead is counted once per chain at its last email of the period; wrote back is outreach_wrote_back. `p_end` (00360) is the window''s last day, in the workspace''s zone: null is today, and a day that has not come is read as today.';

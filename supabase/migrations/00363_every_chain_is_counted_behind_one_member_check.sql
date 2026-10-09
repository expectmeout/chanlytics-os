-- 00363 · Every chain's numbers are counted, behind one question of who may read a workspace.
--
-- Reach out Part 6's report (reach_out_report: 00241, 00261, 00361) lists at most twenty chains, the ones that wrote or
-- handed in the period, so a chain past the twentieth and a chain that sent nothing looked the same: absent. Campaigns'
-- ledger says each chain's last 30 days on its row, and "—" only where nothing was read. Now:
--
--   may_read_workspace(tenant)  whether the caller may read a workspace: a member of it, and a partner's seat only on a
--                               session that showed its second factor (00218, 00261, 00280). The member check ten definer
--                               reads write inline, said once for the next ones (those ten keep theirs until each is next
--                               changed). Security definer, since it reads memberships for the caller; it asks auth.uid(),
--                               never a parameter.
--   reach_out_chain_totals      every chain of the workspace (a reach-out's first step), by its id: what it wrote over the
--   (tenant, days)              last p_days days in the workspace's zone (1 to 90, held there as campaign_series holds its
--                               own), how many of the businesses it wrote to wrote back, and when it last wrote. One pass
--                               over the emails that left (email_left, email_sent_at), each business counted once a chain
--                               at its last email, wrote back as the report says it (outreach_wrote_back): for a chain
--                               the report lists, the sums of its steps. A chain that wrote nothing is
--                               { written: 0, wrote_back: 0, last_at: null }, never absent. Security definer, because
--                               outreach_wrote_back is the service role's; behind may_read_workspace.
--
-- reach-out-back/chain-totals.db.test.mjs holds both. Deploy order: either. Nothing calls reach_out_chain_totals until
-- Campaigns reads it, and that read says "—" while it is missing (packages/db isMissingDoor). Re-runnable.

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
  'Whether the caller (auth.uid(), never a parameter) may read this workspace: a member of it, a partner''s seat only on a session that showed its second factor (00218, 00261). The one member check for a definer read (00363); the ten that inline it keep theirs until each is next changed.';

create or replace function public.reach_out_chain_totals(p_tenant_id uuid, p_days integer)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_days  integer := least(greatest(coalesce(p_days, 30), 1), 90);
  v_tz    text;
  v_since timestamptz;
begin
  if not public.may_read_workspace(p_tenant_id) then
    raise exception 'Workspace not found.' using errcode = 'P0002';
  end if;
  select coalesce(nullif(t.timezone, ''), 'America/New_York') into v_tz from public.tenants t where t.id = p_tenant_id;
  v_tz := coalesce(v_tz, 'America/New_York');
  v_since := (((now() at time zone v_tz)::date - (v_days - 1))::timestamp) at time zone v_tz;
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
      select x.* from sent x where x.sent_at >= v_since
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
revoke execute on function public.reach_out_chain_totals(uuid, integer) from public, anon;
grant execute on function public.reach_out_chain_totals(uuid, integer) to authenticated, service_role;
comment on function public.reach_out_chain_totals(uuid, integer) is
  'Every chain of the workspace (a reach-out''s first step), by its id, for a member (may_read_workspace): what it wrote over the last p_days days in the workspace''s zone (1 to 90), how many businesses it wrote to wrote back (outreach_wrote_back, each once a chain at its last email) and when it last wrote; a chain that wrote nothing is { written: 0, wrote_back: 0, last_at: null } (00363).';

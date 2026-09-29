-- 00247 · A partner's seat opens no door until the session showed its second factor.
--
-- 00218 (decision 0013, M3) hid a partner's seat from row policies and gated is_acting_member and
-- caller_has_permission on aal2, and said has_permission (the service role's, about any user) was unchanged. But the
-- SECURITY DEFINER doors a session calls straight through PostgREST check the caller themselves, and a definer
-- function never sees the restrictive policy: the lead finder's eleven doors ask has_permission(auth.uid(), …,
-- 'find'), team_roster, reach_out_reach and reach_out_chain_report ask memberships, and partner_overview and
-- partner_workspace_money read the partner record. So a session signed in with a partner's password alone could start
-- a search and spend the workspace's month, read every member's email, and read each brought workspace's numbers,
-- billing and money (the re-score of 28 September 2026).
--
-- Now each asks what 00218 asks: a partner's seat counts for the calling session only once it showed its second
-- factor (session_shows_second_factor). has_permission gates only the question about the caller itself
-- (p_user = auth.uid()): the service role asking about any user, with no session, answers as before, and the
-- dashboard's own door refuses the same session first (seatNeedsSecondFactor). The partner's own reads answer nothing
-- to a session without it, as they answer nothing to a caller who is no partner. Every other role is unchanged.
--
-- Each function is its latest definition (00201, 00068, 00204, 00211, 00241) with the one clause added; grants
-- stand, since create or replace keeps them. Re-runnable. A later change to any of them keeps the clause
-- (partners/second-factor-doors.db.test.mjs holds it).

create or replace function public.has_permission(p_user uuid, p_tenant_id uuid, p_permission text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.memberships m
     where m.user_id = p_user and m.tenant_id = p_tenant_id
       and m.role = any (case p_permission
         when 'approve'    then array['owner', 'operator', 'partner']
         when 'autonomy'   then array['owner', 'operator', 'partner']
         when 'disconnect' then array['owner', 'partner']
         when 'billing'    then array['owner']
         when 'team'       then array['owner']
         when 'settings'   then array['owner', 'partner']
         when 'export'     then array['owner']
         when 'find'       then array['owner', 'partner']
         else array[]::text[] end)
       -- A partner's seat, asked about the calling session, counts only once it showed its second factor (0013).
       and (m.role <> 'partner' or p_user is distinct from (select auth.uid()) or public.session_shows_second_factor())
  )
$$;

create or replace function public.team_roster(p_tenant_id uuid)
returns table (membership_id uuid, member_user_id uuid, email text, role text, joined_at timestamptz, display_name text)
language plpgsql
security definer
set search_path = public
as $$
begin
  -- THE guard. A definer function that reads auth.users and does not check who
  -- is asking is an email-enumeration endpoint for every workspace at once.
  if not exists (
    select 1 from public.memberships m
     where m.tenant_id = p_tenant_id and m.user_id = auth.uid()
       and (m.role <> 'partner' or public.session_shows_second_factor())
  ) then
    raise exception 'Not a member of this workspace.' using errcode = '42501';
  end if;

  -- Every reference is qualified: the OUT parameters are in scope for the
  -- whole body, and an unqualified `email` or `display_name` is ambiguous at
  -- call time.
  return query
    select m.id, m.user_id, u.email::text, m.role, m.created_at, coalesce(p.display_name, '')::text
      from public.memberships m
      join auth.users u on u.id = m.user_id
      left join public.profiles p on p.user_id = m.user_id
     where m.tenant_id = p_tenant_id
     order by m.created_at;
end $$;

create or replace function public.partner_overview()
returns table (
  tenant_id           uuid,
  slug                text,
  name                text,
  status              text,
  timezone            text,
  created_at          timestamptz,
  members             integer,
  billing_mode        text,
  billing_status      text,
  trial_end           timestamptz,
  current_period_end  timestamptz,
  line_e164           text,
  line_kind           text,
  voice_state         text,
  sms_state           text,
  reg_step            text,
  reg_mock            boolean,
  reg_sole_prop       boolean,
  line_error          text,
  whatsapp_number     text,
  whatsapp_active     boolean,
  voice_number        text,
  voice_active        boolean,
  last_inbound_at     timestamptz
)
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  -- The caller's own workspaces as partner, and only while the partner seat is theirs: the list is the check.
  return query
    select * from public.platform_overview_rows_for(array(
      select pt.tenant_id
        from public.partner_tenants pt
        join public.partners p on p.id = pt.partner_id
        join public.memberships m on m.tenant_id = pt.tenant_id and m.user_id = p.user_id and m.role = 'partner'
       where p.user_id = (select auth.uid()) and public.session_shows_second_factor()
    ));
end $$;

create or replace function public.partner_workspace_money()
returns table (
  tenant_id      uuid,
  name           text,
  on_team        boolean,
  standing       text,
  currency       text,
  held_cents     bigint,
  payable_cents  bigint,
  paid_cents     bigint,
  month_cents    bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select pt.tenant_id,
         t.name,
         exists (select 1 from public.memberships m
                  where m.tenant_id = pt.tenant_id and m.user_id = p.user_id and m.role = 'partner'),
         pt.standing,
         coalesce(e.currency, 'usd'),
         coalesce(e.held, 0)::bigint,
         coalesce(e.payable, 0)::bigint,
         coalesce(e.paid, 0)::bigint,
         coalesce(e.month, 0)::bigint
    from public.partner_tenants pt
    join public.partners p on p.id = pt.partner_id
    join public.tenants t on t.id = pt.tenant_id
    left join lateral (
      select x.currency,
             sum(x.earned_cents) filter (where x.state = 'held') as held,
             sum(x.earned_cents) filter (where x.state = 'payable') as payable,
             sum(x.earned_cents) filter (where x.state = 'paid') as paid,
             sum(x.earned_cents) filter (where x.kind = 'share' and x.state <> 'void'
                                           and x.paid_at >= date_trunc('month', now())) as month
        from public.partner_earnings x
       where x.tenant_id = pt.tenant_id and x.partner_id = pt.partner_id
       group by x.currency
    ) e on true
   where p.user_id = (select auth.uid()) and public.session_shows_second_factor()
   order by t.name, e.currency
$$;

create or replace function public.reach_out_reach(p_tenant_id uuid, p_search_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not exists (
       select 1 from public.memberships m where m.tenant_id = p_tenant_id and m.user_id = auth.uid()
          and (m.role <> 'partner' or public.session_shows_second_factor())) then
    raise exception 'Workspace not found.' using errcode = 'P0002';
  end if;
  return jsonb_build_object(
    'ready', (select count(*) from public.reach_out_audience(p_tenant_id, p_search_id, 5000, false)),
    'with_unconfirmed', (select count(*) from public.reach_out_audience(p_tenant_id, p_search_id, 5000, true)),
    'phone_only', (select count(*) from public.lead_search_members sm
                     join public.leads l on l.id = sm.lead_id and l.tenant_id = sm.tenant_id
                    where sm.tenant_id = p_tenant_id and sm.search_id = p_search_id
                      and sm.class = 'qualified' and sm.counted and sm.blanked_at is null
                      and l.stage = 'ready' and l.erased_at is null and l.blanked_at is null
                      and (nullif(btrim(l.email), '') is null or l.email_state in ('none', 'invalid'))
                      and l.phone_e164 is not null),
    'of', (select count(*) from public.lead_search_members sm
            where sm.tenant_id = p_tenant_id and sm.search_id = p_search_id
              and sm.class = 'qualified' and sm.counted and sm.blanked_at is null),
    'chain', (select p.id from public.playbooks p
               where p.tenant_id = p_tenant_id and p.lead_search_id = p_search_id and p.kind = 'reach_out'));
end $$;

create or replace function public.reach_out_chain_report(p_tenant_id uuid, p_root_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not exists (
       select 1 from public.memberships m where m.tenant_id = p_tenant_id and m.user_id = auth.uid()
          and (m.role <> 'partner' or public.session_shows_second_factor())) then
    raise exception 'Workspace not found.' using errcode = 'P0002';
  end if;
  if not exists (select 1 from public.playbooks p
                  where p.id = p_root_id and p.tenant_id = p_tenant_id and p.kind = 'reach_out'
                    and p.trigger = 'lead_first') then
    raise exception 'Reach-out not found.' using errcode = 'P0002';
  end if;
  return (
    with recursive c as (
      select p.id, 0 as n from public.playbooks p where p.id = p_root_id
      union all
      select p.id, c.n + 1 from public.playbooks p join c on p.after_playbook_id = c.id
    ),
    -- Each lead's last send that left, in this chain: where its answer is counted.
    last_sent as (
      select distinct on (s.lead_id) s.lead_id, s.playbook_id, s.contact_id, l.email, l.closed_reason, l.booked_at
        from public.reach_out_sends s
        join public.leads l on l.id = s.lead_id and l.tenant_id = s.tenant_id
       where s.root_id = p_root_id and s.tenant_id = p_tenant_id and s.state = 'sent'
       order by s.lead_id, s.sent_at desc
    ),
    -- Who of them wrote back, asked once for all (the send door's own reading).
    wrote as (
      select w.contact_id from public.outreach_wrote_back(p_tenant_id, array(
        select ls.contact_id from last_sent ls where ls.contact_id is not null)) w(contact_id)
    ),
    answered as (
      select ls.playbook_id,
             count(*) filter (where ls.contact_id in (select contact_id from wrote)) as wrote_back,
             count(*) filter (where ls.closed_reason = 'said_no') as said_no,
             -- Interested (00241, H1): a reading of the lead's reply, not undone, that wants more (Part 5's G6).
             count(*) filter (where exists (
               select 1 from public.reach_out_replies r
                where r.tenant_id = p_tenant_id and r.lead_id = ls.lead_id and r.undone_at is null
                  and r.claim <> 'auto_reply' and r.intent in ('interested', 'question'))) as interested,
             -- Booked (00241, H2): an appointment seen after an email of the reach-out left.
             count(*) filter (where ls.booked_at is not null) as booked
        from last_sent ls
       group by ls.playbook_id
    )
    select jsonb_build_object(
      'steps', coalesce((select jsonb_agg(jsonb_build_object(
        'id', c.id,
        'n', c.n,
        -- An email that left (00241): sent, or failed by a receipt after it left (email_left), as Reports counts it.
        'written', (select count(*) from public.reach_out_sends s left join public.messages m on m.id = s.message_id
                     where s.playbook_id = c.id
                       and (s.state = 'sent' or (s.state = 'failed' and public.email_left(m.status, m.error)))),
        'delivered', (select count(*) from public.reach_out_sends s join public.messages m on m.id = s.message_id
                       where s.playbook_id = c.id and s.state = 'sent' and m.status in ('delivered', 'read')),
        'bounced', (select count(*) from public.reach_out_sends s join public.messages m on m.id = s.message_id
                     where s.playbook_id = c.id and m.status = 'failed' and m.error->>'provider' = 'bounced'),
        'wrote_back', coalesce((select a.wrote_back from answered a where a.playbook_id = c.id), 0),
        'said_no', coalesce((select a.said_no from answered a where a.playbook_id = c.id), 0),
        'interested', coalesce((select a.interested from answered a where a.playbook_id = c.id), 0),
        'booked', coalesce((select a.booked from answered a where a.playbook_id = c.id), 0),
        'waiting', (select count(*) from public.reach_out_sends s
                     where s.playbook_id = c.id and s.state in ('planned', 'claimed', 'queued')),
        'held', (select count(*) from public.reach_out_sends s where s.playbook_id = c.id and s.state = 'held'),
        'handed', (select count(*) from public.reach_out_sends s where s.playbook_id = c.id and s.state = 'handed'))
        order by c.n) from c), '[]'::jsonb),
      'runs', coalesce((select jsonb_agg(r order by r->>'run_for' desc) from (
        select jsonb_build_object('id', b.id, 'step_id', b.playbook_id, 'run_for', b.run_for, 'state', b.state,
                                  'planned', b.recipient_count,
                                  'written', (select count(*) from public.reach_out_sends s
                                                left join public.messages m on m.id = s.message_id
                                               where s.broadcast_id = b.id
                                                 and (s.state = 'sent' or (s.state = 'failed'
                                                      and public.email_left(m.status, m.error)))),
                                  'held', (select count(*) from public.reach_out_sends s
                                            where s.broadcast_id = b.id and s.state = 'held'),
                                  'handed', (select count(*) from public.reach_out_sends s
                                              where s.broadcast_id = b.id and s.state = 'handed')) as r
          from public.broadcasts b
         where b.tenant_id = p_tenant_id and b.audience->>'kind' = 'reach_out'
           and b.audience->>'root_id' = p_root_id::text
         order by b.run_for desc
         limit 5) x), '[]'::jsonb),
      'can_remove', not exists (select 1 from public.reach_out_sends s
                                 where s.root_id = p_root_id and s.state in ('claimed', 'queued', 'sent', 'failed')))
  );
end $$;

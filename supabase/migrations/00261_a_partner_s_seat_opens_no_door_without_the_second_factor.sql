-- 00261 · A partner's seat opens no door until the session showed its second factor.
--
-- 00218 (decision 0013, M3) hid a partner's seat from row policies and gated is_acting_member and
-- caller_has_permission on aal2, and said has_permission (the service role's, about any user) was unchanged. But the
-- SECURITY DEFINER doors a session calls straight through PostgREST check the caller themselves, and a definer
-- function never sees the restrictive policy: the lead finder's eleven doors ask has_permission(auth.uid(), …,
-- 'find'), team_roster and Reach out's reads (reach_out_reach, reach_out_chain_report, reach_out_report,
-- reach_out_search_lines, reach_out_lead_timeline) ask memberships, and partner_overview, partner_workspace_money and
-- partner_balance read the partner record. So a session signed in with a partner's password alone could start a
-- search and spend the workspace's month, read every member's email, and read each brought workspace's numbers,
-- billing and money, and the partner's own earnings (the re-score of 28 September 2026).
--
-- Now each asks what 00218 asks: a partner's seat counts for the calling session only once it showed its second
-- factor (session_shows_second_factor). has_permission gates only the question about the caller itself
-- (p_user = auth.uid()): the service role asking about any user, with no session, answers as before, and the
-- dashboard's own door refuses the same session first (seatNeedsSecondFactor). The partner's own reads answer nothing
-- to a session without it, as they answer nothing to a caller who is no partner. Every other role is unchanged.
--
-- Each of the nine functions is its latest definition, with the one clause added: has_permission 00201,
-- team_roster 00068, partner_overview 00204, partner_workspace_money 00204, partner_balance 00203,
-- reach_out_reach 00211, reach_out_chain_report 00241,
-- reach_out_report 00241, reach_out_search_lines 00241.
-- Grants stand, since create or replace keeps them. Re-runnable. A later change to any of them keeps the clause
-- (partners/second-factor.db.test.mjs holds it). The row policies a partner's own reads pass through (partners,
-- partner_tenants, partner_earnings on user_id = auth.uid()) are 00218's concern and unchanged here.
--
-- Not here: reach_out_lead_timeline. Reach out's Part 7 redefined it in 00242, applied to production before this file
-- and not yet on the branch it was written on, so a copy of 00241's here would undo that change. It takes the same
-- clause in Reach out's next change to it.

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

create or replace function public.partner_balance()
returns table (currency text, state text, earned_cents bigint, next_payable_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select e.currency, e.state, sum(e.earned_cents)::bigint, min(e.payable_at) filter (where e.state = 'held')
    from public.partner_earnings e
    join public.partners p on p.id = e.partner_id
   where p.user_id = (select auth.uid()) and e.state <> 'void' and public.session_shows_second_factor()
   group by e.currency, e.state
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

create or replace function public.reach_out_report(p_tenant_id uuid, p_days int)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_tz    text;
  v_today date;
  v_since timestamptz;
begin
  if auth.uid() is null or not exists (
       select 1 from public.memberships m where m.tenant_id = p_tenant_id and m.user_id = auth.uid()
          and (m.role <> 'partner' or public.session_shows_second_factor())) then
    raise exception 'Workspace not found.' using errcode = 'P0002';
  end if;
  if p_days is null or p_days not in (7, 30, 90) then
    raise exception 'A period is 7, 30 or 90 days.' using errcode = '22023';
  end if;
  select coalesce(nullif(t.timezone, ''), 'America/New_York') into v_tz from public.tenants t where t.id = p_tenant_id;
  v_tz := coalesce(v_tz, 'America/New_York');
  v_today := (now() at time zone v_tz)::date;
  v_since := (v_today - (p_days - 1))::timestamp at time zone v_tz;
  return (
    -- An email that left (00179's one spelling, email_left): sent, or failed by a receipt after it left, which is how
    -- the clock settles a send whose email bounced before it was read sent. Dated by when it left.
    with left_ as (
      select s.id, s.root_id, s.playbook_id, s.lead_id, s.contact_id, s.domain_id,
             coalesce(s.sent_at, public.email_sent_at(m.meta, m.status_updated_at, m.created_at)) as sent_at,
             lower(nullif(btrim(s.angle), '')) as angle, m.status, m.error, m.meta
        from public.reach_out_sends s
        left join public.messages m on m.id = s.message_id
       where s.tenant_id = p_tenant_id
         and (s.state = 'sent' or (s.state = 'failed' and public.email_left(m.status, m.error)))
    ),
    sent as (
      select * from left_ x where x.sent_at >= v_since
    ),
    handed as (
      select s.root_id, s.playbook_id, count(*) as n
        from public.reach_out_sends s
       where s.tenant_id = p_tenant_id and s.state = 'handed' and s.sent_at >= v_since
       group by s.root_id, s.playbook_id
    ),
    last_sent as (
      select distinct on (x.root_id, x.lead_id) x.root_id, x.playbook_id, x.lead_id, x.contact_id, x.angle,
             l.closed_reason, l.booked_at
        from sent x
        join public.leads l on l.id = x.lead_id and l.tenant_id = p_tenant_id
       order by x.root_id, x.lead_id, x.sent_at desc
    ),
    wrote as (
      select w.contact_id from public.outreach_wrote_back(p_tenant_id, array(
        select distinct ls.contact_id from last_sent ls where ls.contact_id is not null)) w(contact_id)
    ),
    answers as (
      select ls.root_id, ls.playbook_id, ls.lead_id, ls.angle,
             coalesce(ls.contact_id in (select contact_id from wrote), false) as wrote_back,
             exists (select 1 from public.reach_out_replies r
                      where r.tenant_id = p_tenant_id and r.lead_id = ls.lead_id and r.undone_at is null
                        and r.claim <> 'auto_reply' and r.intent in ('interested', 'question')) as interested,
             ls.booked_at is not null as booked,
             coalesce(ls.closed_reason = 'said_no', false) as said_no
        from last_sent ls
    ),
    angles as (
      select x.angle, count(*) as written,
             (select count(*) from answers a where a.angle = x.angle and a.wrote_back) as wrote_back,
             row_number() over (order by count(*) desc, x.angle) as rank
        from sent x
       where x.angle is not null
       group by x.angle
    ),
    domains as (
      select x.domain_id, d.host, d.state, d.held_why, d.held_at, count(*) as sent,
             count(*) filter (where x.status in ('delivered', 'read')) as delivered,
             count(*) filter (where x.status = 'failed' and x.error->>'provider' = 'bounced'
                                and lower(coalesce(x.error->>'kind', '')) = 'permanent') as bounced,
             count(*) filter (where x.meta->'email'->>'complained_at' is not null) as complained
        from sent x
        left join public.sending_domains d on d.id = x.domain_id and d.tenant_id = p_tenant_id
       group by x.domain_id, d.host, d.state, d.held_why, d.held_at
    )
    select jsonb_build_object(
      'timezone', v_tz,
      'days', p_days,
      'today', v_today,
      'since', v_today - (p_days - 1),
      'has_reach_out', exists (select 1 from public.playbooks p
                               where p.tenant_id = p_tenant_id and p.kind = 'reach_out' and p.trigger = 'lead_first'),
      'totals', jsonb_build_object(
        'written', (select count(*) from sent),
        'delivered', (select count(*) from sent where status in ('delivered', 'read')),
        'bounced', (select count(*) from sent where status = 'failed' and error->>'provider' = 'bounced'),
        'wrote_back', (select count(*) from answers where wrote_back),
        'interested', (select count(*) from answers where interested),
        'booked', (select count(*) from answers where booked),
        'said_no', (select count(*) from answers where said_no),
        'handed', coalesce((select sum(n) from handed), 0)),
      'series', (
        select coalesce(jsonb_agg(jsonb_build_object('day', g.day, 'written', coalesce(c.n, 0)) order by g.day), '[]'::jsonb)
          from (select (v_today - k) as day from generate_series(0, p_days - 1) k) g
          left join (select (x.sent_at at time zone v_tz)::date as day, count(*) as n from sent x group by 1) c
            on c.day = g.day),
      'chains', coalesce((
        select jsonb_agg(ch.body order by ch.last_at desc nulls last)
          from (
            select r.id,
                   (select max(x.sent_at) from sent x where x.root_id = r.id) as last_at,
                   jsonb_build_object(
                     'root_id', r.id,
                     'name', r.name,
                     'state', r.state,
                     'search', (select jsonb_build_object('id', q.id, 'name', q.name)
                                  from public.lead_searches q where q.id = r.lead_search_id),
                     'last_at', (select max(x.sent_at) from sent x where x.root_id = r.id),
                     'runs', (select count(*) from public.broadcasts b
                               where b.tenant_id = p_tenant_id and b.audience->>'kind' = 'reach_out'
                                 and b.audience->>'root_id' = r.id::text and b.run_for >= v_today - (p_days - 1)),
                     'steps', (
                       with recursive c as (
                         select p.id, 0 as n from public.playbooks p where p.id = r.id
                         union all
                         select p.id, c.n + 1 from public.playbooks p join c on p.after_playbook_id = c.id
                       )
                       select coalesce(jsonb_agg(jsonb_build_object(
                         'id', c.id,
                         'n', c.n,
                         'hand', p.hand->>'kind',
                         'written', (select count(*) from sent x where x.playbook_id = c.id),
                         'delivered', (select count(*) from sent x where x.playbook_id = c.id
                                         and x.status in ('delivered', 'read')),
                         'bounced', (select count(*) from sent x where x.playbook_id = c.id
                                       and x.status = 'failed' and x.error->>'provider' = 'bounced'),
                         'wrote_back', (select count(*) from answers a where a.playbook_id = c.id and a.wrote_back),
                         'interested', (select count(*) from answers a where a.playbook_id = c.id and a.interested),
                         'booked', (select count(*) from answers a where a.playbook_id = c.id and a.booked),
                         'said_no', (select count(*) from answers a where a.playbook_id = c.id and a.said_no),
                         'handed', coalesce((select h.n from handed h where h.playbook_id = c.id), 0))
                         order by c.n), '[]'::jsonb)
                         from c join public.playbooks p on p.id = c.id)) as body
              from public.playbooks r
             where r.tenant_id = p_tenant_id and r.kind = 'reach_out' and r.trigger = 'lead_first'
               and (exists (select 1 from sent x where x.root_id = r.id)
                    or exists (select 1 from handed h where h.root_id = r.id))
             order by 2 desc nulls last
             limit 20
          ) ch), '[]'::jsonb),
      'angles', coalesce((
        select jsonb_agg(jsonb_build_object('angle', a.angle, 'written', a.written, 'wrote_back', a.wrote_back)
                         order by a.rank)
          from angles a where a.rank <= 8), '[]'::jsonb),
      'other_angles', jsonb_build_object(
        'written', coalesce((select sum(a.written) from angles a where a.rank > 8), 0),
        'wrote_back', coalesce((select sum(a.wrote_back) from angles a where a.rank > 8), 0)),
      'no_angle', (select count(*) from sent where angle is null),
      'domains', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'host', d.host, 'state', d.state, 'held_why', d.held_why, 'held_at', d.held_at,
                 'sent', d.sent, 'delivered', d.delivered, 'bounced', d.bounced, 'complained', d.complained)
               order by d.sent desc, d.host)
          from (select * from domains order by sent desc, host limit 10) d), '[]'::jsonb))
  );
end $$;

create or replace function public.reach_out_search_lines(p_tenant_id uuid, p_search_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_root     public.playbooks%rowtype;
  v_tz       text;
  v_midnight timestamptz;
begin
  if auth.uid() is null or not exists (
       select 1 from public.memberships m where m.tenant_id = p_tenant_id and m.user_id = auth.uid()
          and (m.role <> 'partner' or public.session_shows_second_factor())) then
    raise exception 'Workspace not found.' using errcode = 'P0002';
  end if;
  select * into v_root from public.playbooks p
   where p.tenant_id = p_tenant_id and p.kind = 'reach_out' and p.trigger = 'lead_first'
     and p.lead_search_id = p_search_id
   order by p.created_at desc
   limit 1;
  if not found then
    return null;
  end if;
  select coalesce(nullif(t.timezone, ''), 'America/New_York') into v_tz from public.tenants t where t.id = p_tenant_id;
  v_tz := coalesce(v_tz, 'America/New_York');
  v_midnight := date_trunc('day', now() at time zone v_tz) at time zone v_tz;
  return (
    -- left_at: when an email left (sent, or failed by a receipt after it left: email_left), else null.
    with sends as (
      select s.id, s.lead_id, s.state, s.reason, s.send_at, s.checked_at, s.domain_id, s.message_id,
             case when s.state = 'sent' then s.sent_at
                  when s.state = 'failed' and public.email_left(m.status, m.error)
                    then public.email_sent_at(m.meta, m.status_updated_at, m.created_at) end as left_at,
             coalesce(m.status = 'failed' and m.error->>'provider' = 'bounced', false) as bounced,
             b.state in ('pending_approval', 'scheduled', 'sending') as live
        from public.reach_out_sends s
        join public.broadcasts b on b.id = s.broadcast_id
        left join public.messages m on m.id = s.message_id
       where s.tenant_id = p_tenant_id and s.root_id = v_root.id
    ),
    per as (
      select x.lead_id,
             count(*) filter (where x.left_at is not null) as sent,
             min(x.left_at) as first_sent_at,
             max(x.left_at) as last_sent_at,
             min(x.send_at) filter (where x.state = 'planned' and x.live) as next_at,
             bool_or(x.state = 'held' and x.live) as held,
             bool_or(x.state = 'handed') as handed,
             bool_or(x.bounced and x.left_at is not null) as bounced,
             max(x.left_at) filter (where x.bounced) as bounced_at,
             max(x.left_at) as ord
        from sends x
       group by x.lead_id
    )
    select jsonb_build_object(
      'chain', jsonb_build_object('root_id', v_root.id, 'name', v_root.name, 'state', v_root.state),
      'written_to', (select count(*) from per where sent > 0),
      'today', (select count(*) from sends where left_at >= v_midnight),
      'next', (select jsonb_build_object('at', x.send_at, 'business', l.business_name, 'host', d.host)
                 from sends x
                 join public.leads l on l.id = x.lead_id
                 left join public.sending_domains d on d.id = x.domain_id
                where x.state = 'planned' and x.live and x.checked_at is not null
                order by x.send_at
                limit 1),
      'held', (select count(*) from sends where state = 'held' and live),
      'waiting_run_id', (select b.id from public.broadcasts b
                          where b.tenant_id = p_tenant_id and b.audience->>'kind' = 'reach_out'
                            and b.audience->>'root_id' = v_root.id::text and b.state = 'pending_approval'
                          order by b.created_at desc
                          limit 1),
      'leads', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'lead_id', p.lead_id,
                 'stage', l.stage,
                 'closed_reason', l.closed_reason,
                 'sent', p.sent,
                 'first_sent_at', p.first_sent_at,
                 'last_sent_at', p.last_sent_at,
                 'next_at', p.next_at,
                 'held', coalesce(p.held, false),
                 'handed', coalesce(p.handed, false),
                 'bounced', coalesce(p.bounced, false),
                 'bounced_at', p.bounced_at,
                 'email_state', l.email_state,
                 'reply', (select jsonb_build_object('intent', r.intent, 'claim', r.claim, 'read_at', r.read_at,
                                                     'undone', r.undone_at is not null)
                             from public.reach_out_replies r
                            where r.tenant_id = p_tenant_id and r.lead_id = p.lead_id
                            order by r.read_at desc
                            limit 1),
                 'away_until', (select max(r.until_at) from public.reach_out_replies r
                                 where r.tenant_id = p_tenant_id and r.lead_id = p.lead_id and r.intent = 'away'
                                   and r.claim = 'auto_reply' and r.until_at > now() and r.undone_at is null),
                 'resume_at', l.resume_at,
                 'booked_at', l.booked_at,
                 'stopped_at', l.reach_out_stopped_at))
          from (select * from per order by ord desc nulls first, lead_id limit 2000) p
          join public.leads l on l.id = p.lead_id and l.tenant_id = p_tenant_id), '[]'::jsonb)
    )
  );
end $$;

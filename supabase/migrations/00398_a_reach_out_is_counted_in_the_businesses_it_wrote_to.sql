-- 00398 · A reach-out is counted in the businesses it wrote to (Reports › Campaigns › Reach-outs, the Campaigns home).
--
-- reach_out_report (00241, 00261, 00360) and reach_out_chain_totals (00375) counted what a reach-out wrote in emails and
-- what came back (wrote back, interested, booked, said no) in businesses, each business once a chain at its last email of
-- the window, and every share a page drew put the one over the other: a business that got three emails made three of the
-- denominator and one of the numerator. The unit rule: emails written, businesses answered, and a share of an outcome is of
-- businesses. Now both say the businesses beside the emails, with the same population the outcomes are counts of, so
-- `wrote_back <= businesses` always:
--
--   reach_out_report       `totals.businesses`: the businesses written to, each once a chain at its last email of the
--                          window; every step's `businesses`: the ones whose last email was that step; every angle's: the
--                          ones whose last email had that angle, and `other_angles.businesses` the sum for the angles past
--                          the top eight (an angle or step every business moved past has emails and no businesses: right).
--                          And `before`: { written, delivered, bounced }, the emails of the period before, the same count of
--                          days ending the day before the window's first.
--   reach_out_chain_totals each chain's `businesses`: the businesses it wrote to, the same population as its `wrote_back`;
--                          a chain that wrote nothing is { written: 0, businesses: 0, wrote_back: 0, last_at: null }.
--
-- The period before says what was written only: an outcome is state now (outreach_wrote_back has no time bound), so a prior
-- period's outcomes would be today's state of an older cohort and not what that period earned. Nothing else moves:
-- `written`, `delivered` and `bounced` stay emails, the outcomes stay businesses, the series, the chains' list, the domains
-- and the refusals are 00360's. Both functions stay definers: their helpers (email_left, email_sent_at, outreach_wrote_back)
-- are the service role's alone, and each keeps its own check of who may read (the member check with a partner's second
-- factor; may_read_workspace). Same signatures and return type, so PostgREST has one of each to choose.
--
-- reach_out_report's `left_` (the emails that left) is now read by the window and by the period before, which would make
-- Postgres hold it whole: the tenant's every email, their jsonb included. It is `not materialized`, so `sent` keeps only the
-- window's rows as it did and `before` is an aggregate that holds none, at the price of reading the emails a second time.
--
-- reports/campaigns/reach-out-businesses.db.test.mjs holds it. Deploy order: either; a dashboard before this reads
-- `businesses` and `before` as absent and says the emails alone. Re-runnable: `create or replace`, the grants and comments
-- said again.

set local lock_timeout = '3s';

create or replace function public.reach_out_report(p_tenant_id uuid, p_days int, p_end date default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_tz    text;
  v_today date;
  v_end   date;
  v_since timestamptz;
  v_stop  timestamptz;
  v_prior timestamptz;
begin
  if auth.uid() is null or not exists (
       select 1 from public.memberships m where m.tenant_id = p_tenant_id and m.user_id = auth.uid()
          and (m.role <> 'partner' or public.session_shows_second_factor())) then
    raise exception 'Workspace not found.' using errcode = 'P0002';
  end if;
  -- Any count of days Reports reads, as its other functions take them (00360): a month so far and a window a member
  -- picked are neither 7, 30 nor 90, and this refused both.
  if p_days is null or p_days < 1 or p_days > 90 then
    raise exception 'A period is 1 to 90 days.' using errcode = '22023';
  end if;
  select coalesce(nullif(t.timezone, ''), 'America/New_York') into v_tz from public.tenants t where t.id = p_tenant_id;
  v_tz := coalesce(v_tz, 'America/New_York');
  v_today := (now() at time zone v_tz)::date;
  -- The window's last day and where it stops, as report_series reads them (00360).
  v_end   := least(coalesce(p_end, v_today), v_today);
  v_since := (v_end - (p_days - 1))::timestamp at time zone v_tz;
  v_stop  := ((v_end + 1)::timestamp) at time zone v_tz;
  -- Where the period before begins (00398): the same count of days, ending where the window begins.
  v_prior := (v_end - (p_days * 2 - 1))::timestamp at time zone v_tz;
  return (
    -- An email that left (00179's one spelling, email_left): sent, or failed by a receipt after it left, which is how
    -- the clock settles a send whose email bounced before it was read sent. Dated by when it left. Read twice now (the
    -- window's `sent` and the period before), so not materialized (00398): each read takes the rows it needs, and the
    -- tenant's whole history of emails is never held for the second.
    with left_ as not materialized (
      select s.id, s.root_id, s.playbook_id, s.lead_id, s.contact_id, s.domain_id,
             coalesce(s.sent_at, public.email_sent_at(m.meta, m.status_updated_at, m.created_at)) as sent_at,
             lower(nullif(btrim(s.angle), '')) as angle, m.status, m.error, m.meta
        from public.reach_out_sends s
        left join public.messages m on m.id = s.message_id
       where s.tenant_id = p_tenant_id
         and (s.state = 'sent' or (s.state = 'failed' and public.email_left(m.status, m.error)))
    ),
    sent as (
      select * from left_ x where x.sent_at >= v_since and x.sent_at < v_stop
    ),
    handed as (
      select s.root_id, s.playbook_id, count(*) as n
        from public.reach_out_sends s
       where s.tenant_id = p_tenant_id and s.state = 'handed' and s.sent_at >= v_since and s.sent_at < v_stop
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
             (select count(*) from answers a where a.angle = x.angle) as businesses,
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
      'end', v_end,
      'since', v_end - (p_days - 1),
      'has_reach_out', exists (select 1 from public.playbooks p
                               where p.tenant_id = p_tenant_id and p.kind = 'reach_out' and p.trigger = 'lead_first'),
      'totals', jsonb_build_object(
        'written', (select count(*) from sent),
        'businesses', (select count(*) from last_sent),
        'delivered', (select count(*) from sent where status in ('delivered', 'read')),
        'bounced', (select count(*) from sent where status = 'failed' and error->>'provider' = 'bounced'),
        'wrote_back', (select count(*) from answers where wrote_back),
        'interested', (select count(*) from answers where interested),
        'booked', (select count(*) from answers where booked),
        'said_no', (select count(*) from answers where said_no),
        'handed', coalesce((select sum(n) from handed), 0)),
      -- What the period before wrote, counted as the totals count it: emails only (00398).
      'before', (
        select jsonb_build_object(
                 'written', count(*),
                 'delivered', count(*) filter (where x.status in ('delivered', 'read')),
                 'bounced', count(*) filter (where x.status = 'failed' and x.error->>'provider' = 'bounced'))
          from left_ x where x.sent_at >= v_prior and x.sent_at < v_since),
      'series', (
        select coalesce(jsonb_agg(jsonb_build_object('day', g.day, 'written', coalesce(c.n, 0)) order by g.day), '[]'::jsonb)
          from (select (v_end - k) as day from generate_series(0, p_days - 1) k) g
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
                                 and b.audience->>'root_id' = r.id::text and b.run_for >= v_end - (p_days - 1)
                                 and b.run_for <= v_end),
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
                         'businesses', (select count(*) from answers a where a.playbook_id = c.id),
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
        select jsonb_agg(jsonb_build_object('angle', a.angle, 'written', a.written, 'businesses', a.businesses,
                                            'wrote_back', a.wrote_back)
                         order by a.rank)
          from angles a where a.rank <= 8), '[]'::jsonb),
      'other_angles', jsonb_build_object(
        'written', coalesce((select sum(a.written) from angles a where a.rank > 8), 0),
        'businesses', coalesce((select sum(a.businesses) from angles a where a.rank > 8), 0),
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
revoke all on function public.reach_out_report(uuid, integer, date) from public, anon;
grant execute on function public.reach_out_report(uuid, integer, date) to authenticated, service_role;
comment on function public.reach_out_report(uuid, integer, date) is
  'Reports'' Reach-outs section (Reach out Part 6, H1, H3-H6), for a member: over p_days days (1 to 90; any other is refused) to the window''s last day in the workspace''s zone, the emails that left and what came of them. has_reach_out, totals, before (written, delivered and bounced over the same count of days before the window, 00398: outcomes are state now, so they have no period before), series (written per day), chains (at most 20, each with its steps; reach_out_chain_totals counts every chain over the same window, 00375), angles (the top 8, other_angles, no_angle) and domains (at most 10; a removed domain''s host is null). Emails are written, delivered and bounced; businesses are the leads written to, each once per chain at its last email of the period, and every outcome (wrote back, interested, booked, said no) is a count of them, so it is never more than `businesses`, on the totals, on a step (the businesses whose last email was that step), on an angle (the ones whose last email had it) and past the top 8 (00398); wrote back is outreach_wrote_back. `p_end` (00360) is the window''s last day, in the workspace''s zone: null is today, and a day that has not come is read as today.';

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
    -- The businesses a chain wrote to (00398): the population wrote_back is a count of.
    written_to as (
      select ls.root_id, count(*) as businesses
        from last_sent ls
       group by ls.root_id
    ),
    wrote_back as (
      select ls.root_id, count(*) as wrote_back
        from last_sent ls
       where ls.contact_id in (select w.contact_id from wrote w)
       group by ls.root_id
    )
    select coalesce(jsonb_object_agg(r.id::text, jsonb_build_object(
             'written', coalesce(c.written, 0),
             'businesses', coalesce(n.businesses, 0),
             'wrote_back', coalesce(b.wrote_back, 0),
             'last_at', c.last_at)), '{}'::jsonb)
      from public.playbooks r
      left join per_chain c on c.root_id = r.id
      left join written_to n on n.root_id = r.id
      left join wrote_back b on b.root_id = r.id
     where r.tenant_id = p_tenant_id and r.kind = 'reach_out' and r.trigger = 'lead_first'
  );
end $$;
revoke all on function public.reach_out_chain_totals(uuid, integer, date) from public, anon;
grant execute on function public.reach_out_chain_totals(uuid, integer, date) to authenticated, service_role;
comment on function public.reach_out_chain_totals(uuid, integer, date) is
  'Every chain of the workspace (a reach-out''s first step), by its id, for a member (may_read_workspace): what it wrote over p_days days (1 to 90) to the window''s last day in the workspace''s zone, the window reach_out_report reads, in emails (written) and in businesses (the ones it wrote to, each once a chain at its last email: the population wrote_back is a count of, so wrote_back is never more than businesses, 00398), how many of them wrote back (outreach_wrote_back) and when it last wrote in it; a chain that wrote nothing is { written: 0, businesses: 0, wrote_back: 0, last_at: null } (00375, 00398). `p_end` is the window''s last day, as 00360 reads it: null is today, and a day that has not come is read as today.';

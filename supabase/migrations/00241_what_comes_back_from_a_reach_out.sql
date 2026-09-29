-- 00241 · What comes back from a reach-out.
--
-- Reach out, Part 6 (docs/superpowers/plans/2026-09-28-reach-out-part-6-what-comes-back.md, H1-H12). The owner sees what
-- a reach-out wrote and what came of it, on Reports, the chain's row, Leads, the lead's peek and a person's page, and
-- hears the day's numbers at 6 PM. Two facts on a lead, and the reads and the one door that show them:
--
--   leads.booked_at            the first appointment the calendar sweep saw after an email of the reach-out left (H2):
--                              stamped once whatever the lead's stage, so a lead that wrote back and then booked counts.
--   leads.reach_out_stopped_at its owner stopped writing to it (H10).
--   reach_out_replies_lead     a lead's readings, which every read below asks.
--   reach_out_booked           00227's, whole, stamping booked_at; it still converts only a ready or nurture lead.
--   reach_out_chain_report     00228's, whole, with interested and booked per step (H7).
--   outreach_lead_facts        00226's, whole, with `stopped`: the send door skips a stopped lead's email.
--   reach_out_followers        00226's, whole, leaving a stopped lead out.
--   reach_out_report           Reports' read over a period (H1, H3-H6); members only.
--   reach_out_search_lines     Leads' read for an open search: the chain's strip and a line per lead (H8); members only.
--   reach_out_lead_timeline    one lead's emails and readings, for its peek and its person's page (H9, H11); members only.
--   reach_out_lead_stop        "Stop writing to them" (H10): an acting member's door.
--   reach_out_day_due          the workspaces whose 6 PM it is, with the day's numbers, not told yet (H12); service role.
--   notifications_kind_check   00222's list, with reach_out_day.
--
-- Every statement re-runs. The two columns take ACCESS EXCLUSIVE on a table a live workspace reads, so the same lock
-- guard as 00140, 00142, 00166 and 00220.
set local lock_timeout = '3s';
do $$
begin
  raise notice 'lock_timeout for this migration: %', current_setting('lock_timeout');
  if current_setting('lock_timeout') <> '3s' then
    raise warning 'this file was applied outside a transaction, so SET LOCAL did nothing: run it inside begin/commit, or set lock_timeout yourself before it';
  end if;
end $$;

/* ------------------------------------------------------------ 1. two facts on a lead -- */

alter table public.leads add column if not exists booked_at timestamptz;
comment on column public.leads.booked_at is
  'When the first appointment the calendar sweep saw for this lead starts, when it starts after an email of a reach-out left (Reach out Part 6, H2; reach_out_booked). Stamped once, whatever the lead''s stage: a lead that wrote back and then booked is Talking already and booked all the same. Reports and Leads count and say it.';

alter table public.leads add column if not exists reach_out_stopped_at timestamptz;
comment on column public.leads.reach_out_stopped_at is
  'When its owner stopped a reach-out writing to this lead (Reach out Part 6, H10; reach_out_lead_stop). The send door refuses its email (outreach_lead_facts.stopped, outreach_stopped) and no later step reaches it (reach_out_followers). The lead is not closed: stopping is not a no.';

create index if not exists reach_out_replies_lead
  on public.reach_out_replies (tenant_id, lead_id) where lead_id is not null;

/* ------------------------------------------------------------ 2. a booking, whatever the stage (H2) -- */

-- 00227's, whole, but for the stages it matches and the stamp.
create or replace function public.reach_out_booked(p_tenant_id uuid, p_seen jsonb)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lead record;
  v_n    int := 0;
begin
  if p_tenant_id is null or p_seen is null or jsonb_typeof(p_seen) <> 'array' then
    return 0;
  end if;
  for v_lead in
    with seen as (
      -- At most 500 appointments' contacts a call, as the sweep bounds them; a start that is not a time is no start.
      -- The cast sits behind its own test, since a filter beside it may run after it.
      select lower(nullif(btrim(x.s->>'email'), '')) as email,
             nullif(btrim(x.s->>'phone'), '')        as phone,
             case when coalesce(x.s->>'start', '') ~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})$'
                  then (x.s->>'start')::timestamptz end as start_at
        from (select e from jsonb_array_elements(p_seen) e limit 500) x(s)
       where jsonb_typeof(x.s) = 'object'
    ),
    matched as (
      select l.id, s.start_at
        from seen s join public.leads l on l.tenant_id = p_tenant_id and lower(l.email) = s.email
       where s.email is not null
      union all
      select l.id, s.start_at
        from seen s join public.leads l on l.tenant_id = p_tenant_id and l.phone_e164 = s.phone
       where s.phone is not null
      union all
      select l.id, s.start_at
        from seen s
        join public.contacts c on c.tenant_id = p_tenant_id and lower(c.email) = s.email and c.erased_at is null
        join public.leads l on l.tenant_id = p_tenant_id and l.contact_id = c.id
       where s.email is not null
      union all
      select l.id, s.start_at
        from seen s
        join public.contacts c on c.tenant_id = p_tenant_id and c.phone_e164 = s.phone and c.erased_at is null
        join public.leads l on l.tenant_id = p_tenant_id and l.contact_id = c.id
       where s.phone is not null
    )
    select m.id, min(m.start_at) as start_at, l.stage
      from matched m
      join public.leads l on l.id = m.id
     where m.start_at is not null
       and l.stage in ('ready', 'nurture', 'converted')
       and l.erased_at is null and l.blanked_at is null
       -- An appointment starting after an email of the reach-out left: one made before it was not the reach-out's.
       and exists (
         select 1 from public.reach_out_sends x
          where x.tenant_id = p_tenant_id and x.lead_id = m.id and x.state = 'sent' and x.sent_at < m.start_at)
     group by m.id, l.stage
  loop
    -- The first appointment seen after an email of the reach-out left, whatever the lead's stage (00241, H2): a lead
    -- that wrote back and then booked is Talking already, and is booked all the same. Stamped once, never moved.
    update public.leads set booked_at = v_lead.start_at where id = v_lead.id and booked_at is null;
    if v_lead.stage in ('ready', 'nurture') and coalesce((public.lead_convert_by(p_tenant_id, v_lead.id, 'booking',
                   jsonb_build_object('start', v_lead.start_at))->>'moved')::boolean, false) then
      v_n := v_n + 1;
    end if;
  end loop;
  return v_n;
end $$;
revoke execute on function public.reach_out_booked(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.reach_out_booked(uuid, jsonb) to service_role;
comment on function public.reach_out_booked(uuid, jsonb) is
  'The calendar sweep''s door (Reach out Part 5, G19, N3): p_seen is [{email?, phone?, start}], at most 500 read. Each ready or nurture lead a reach-out sent to, whose address or number or its person''s is one seen, on an appointment starting after an email of the reach-out left, is booked (leads.booked_at, the first such start, once, 00241) and, when ready or nurture, converts through lead_convert_by (how booking, with the start). Answers how many moved. Service role only.';

/* ------------------------------------------------------------ 3. the chain's report (H7) -- */

-- 00228's, whole, with interested and booked per step, counted where wrote back and said no are: at each lead's last
-- step that wrote to it.
create or replace function public.reach_out_chain_report(p_tenant_id uuid, p_root_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not exists (
       select 1 from public.memberships m where m.tenant_id = p_tenant_id and m.user_id = auth.uid()) then
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
revoke execute on function public.reach_out_chain_report(uuid, uuid) from public, anon;
grant execute on function public.reach_out_chain_report(uuid, uuid) to authenticated, service_role;

/* ------------------------------------------------------------ 4. a stop the door reads (H10) -- */

-- 00226's lead facts, unchanged but for `stopped`.
create or replace function public.outreach_lead_facts(
  p_tenant_id uuid,
  p_contact_id uuid,
  p_to text,
  p_lead_id uuid default null
) returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    -- The send's own lead when it names one (a reach-out's always does); else the lead still being written to wins.
    'lead_stage', coalesce(
      (select l.stage from public.leads l
        where p_lead_id is not null and l.id = p_lead_id and l.tenant_id = p_tenant_id
          and l.contact_id = p_contact_id and l.erased_at is null and l.blanked_at is null),
      (select l.stage from public.leads l
        where p_lead_id is null and l.tenant_id = p_tenant_id and l.contact_id = p_contact_id
          and l.erased_at is null and l.blanked_at is null
        order by (l.stage in ('ready', 'nurture')) desc, l.found_at desc
        limit 1)),
    'suppressed', public.lead_address_suppressed(p_tenant_id, p_to),
    'wrote_back', exists (select 1 from public.outreach_wrote_back(p_tenant_id, array[p_contact_id])),
    -- An automatic out-of-office (00222, G8) whose day is still ahead: from this person, or answering the send's lead
    -- from another address of the business. Two arms, so the first can use reach_out_replies_away.
    'away', exists (select 1 from public.reach_out_replies r
                     where r.tenant_id = p_tenant_id and r.contact_id = p_contact_id
                       and r.intent = 'away' and r.claim = 'auto_reply'
                       and r.until_at > now() and r.undone_at is null)
            or (p_lead_id is not null
                and exists (select 1 from public.reach_out_replies r
                             where r.tenant_id = p_tenant_id and r.lead_id = p_lead_id
                               and r.intent = 'away' and r.claim = 'auto_reply'
                               and r.until_at > now() and r.undone_at is null)),
    -- Its owner stopped writing to this lead (00241, Part 6's H10): the door skips its email, and the followers
    -- leave it out.
    'stopped', p_lead_id is not null
               and exists (select 1 from public.leads l
                            where l.id = p_lead_id and l.tenant_id = p_tenant_id
                              and l.reach_out_stopped_at is not null)
  )
$$;
revoke execute on function public.outreach_lead_facts(uuid, uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.outreach_lead_facts(uuid, uuid, text, uuid) to service_role;
comment on function public.outreach_lead_facts(uuid, uuid, text, uuid) is
  'A cold email''s facts about its lead: lead_stage (the send''s own lead when named, else the one still being written to), suppressed, wrote_back (00181), away (an automatic out-of-office whose day is still ahead, 00226), stopped (its owner stopped writing to it, 00241). Service role only.';

-- 00226's followers, unchanged but for the stopped left out.
create or replace function public.reach_out_followers(
  p_tenant_id uuid, p_step_id uuid, p_parent_id uuid, p_after_days int, p_limit int)
returns table (lead_id uuid, contact_id uuid, email text, region text, hours jsonb, parent_message_id uuid,
               facts jsonb, bounced boolean)
language sql
stable
security definer
set search_path = public
as $$
  select f.lead_id, f.contact_id, f.email, f.region, f.hours, f.parent_message_id, f.facts, f.bounced
    from (
      select l.id as lead_id, s.contact_id, lower(btrim(l.email)) as email, l.region, l.hours,
             s.message_id as parent_message_id, s.sent_at,
             public.outreach_lead_facts(p_tenant_id, s.contact_id, lower(btrim(l.email)), l.id) as facts,
             exists (select 1 from public.reach_out_sends b join public.messages bm on bm.id = b.message_id
                      where b.root_id = s.root_id and b.lead_id = l.id
                        and bm.status = 'failed' and bm.error->>'provider' in ('bounced', 'failed')) as bounced
        from public.reach_out_sends s
        join public.leads l on l.id = s.lead_id and l.tenant_id = s.tenant_id
        join public.messages m on m.id = s.message_id
       where s.tenant_id = p_tenant_id and s.playbook_id = p_parent_id and s.state = 'sent'
         and s.sent_at <= now() - make_interval(days => p_after_days)
         and s.contact_id is not null
         and not exists (select 1 from public.reach_out_sends x
                          where x.playbook_id = p_step_id and x.lead_id = l.id
                            and not (x.state = 'skipped' and x.reason = 'outreach_away'))
    ) f
   where f.facts->>'lead_stage' in ('ready', 'nurture')
     and not coalesce((f.facts->>'suppressed')::boolean, true)
     and not coalesce((f.facts->>'wrote_back')::boolean, true)
     and not coalesce((f.facts->>'away')::boolean, false)
     and not coalesce((f.facts->>'stopped')::boolean, false)
     and not f.bounced
   order by f.sent_at
   limit greatest(p_limit, 0)
$$;
revoke execute on function public.reach_out_followers(uuid, uuid, uuid, int, int) from public, anon, authenticated;
grant execute on function public.reach_out_followers(uuid, uuid, uuid, int, int) to service_role;

/* ------------------------------------------------------------ 5. Reports (H1, H3-H6) -- */

-- What a workspace's reach-outs wrote over one of Reports' periods, and what came of it. The period is the last
-- p_days days in the workspace's zone, today included, as campaign_series reads it. Each lead's answer is counted once
-- per chain, at the last email of the period that wrote to it, as the chain's report counts (00228). Wrote back is the
-- send door's reading (outreach_wrote_back), asked once. Bounded: 20 chains, 8 angles and the rest in one, 10 domains.
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
       select 1 from public.memberships m where m.tenant_id = p_tenant_id and m.user_id = auth.uid()) then
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
revoke execute on function public.reach_out_report(uuid, int) from public, anon;
grant execute on function public.reach_out_report(uuid, int) to authenticated, service_role;
comment on function public.reach_out_report(uuid, int) is
  'Reports'' Reach-outs section (Reach out Part 6, H1, H3-H6), for a member: over the last p_days (7, 30 or 90) days in the workspace''s zone, the emails that left and what came of them. has_reach_out, totals, series (written per day), chains (at most 20, each with its steps), angles (the top 8, other_angles, no_angle) and domains (at most 10; a removed domain''s host is null). Each lead is counted once per chain at its last email of the period; wrote back is outreach_wrote_back.';

/* ------------------------------------------------------------ 6. Leads while it writes (H8) -- */

-- An open search's chain, as Leads draws it: the strip's facts, and one line of facts per lead the chain has a send
-- for (at most 2,000: 200 a run, one run a day, is ten days of a full run). Null when the search has no chain.
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
       select 1 from public.memberships m where m.tenant_id = p_tenant_id and m.user_id = auth.uid()) then
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
revoke execute on function public.reach_out_search_lines(uuid, uuid) from public, anon;
grant execute on function public.reach_out_search_lines(uuid, uuid) to authenticated, service_role;
comment on function public.reach_out_search_lines(uuid, uuid) is
  'Leads while it writes (Reach out Part 6, H8), for a member: an open search''s chain, or null when it has none. chain {root_id, name, state}, written_to, today (emails that left since the workspace''s midnight), next {at, business, host} (the earliest planned and checked email of a live run), held, waiting_run_id, and leads: at most 2,000 lines of facts, one per lead the chain has a send for.';

/* ------------------------------------------------------------ 7. one lead's story (H9, H11) -- */

-- A lead's reach-out, as its peek and its person's page draw it: its chain and search, each of its sends (at most 20,
-- in time order) and its readings (at most 10, newest first, each with whether the caller may undo it: 00222's
-- reach_out_reply_undoable, the one rule), and whether it may be stopped. Null for a lead the workspace does not hold.
create or replace function public.reach_out_lead_timeline(p_tenant_id uuid, p_lead_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_lead public.leads%rowtype;
  v_root uuid;
begin
  if auth.uid() is null or not exists (
       select 1 from public.memberships m where m.tenant_id = p_tenant_id and m.user_id = auth.uid()) then
    raise exception 'Workspace not found.' using errcode = 'P0002';
  end if;
  select * into v_lead from public.leads l
   where l.id = p_lead_id and l.tenant_id = p_tenant_id and l.erased_at is null and l.blanked_at is null;
  if not found then
    return null;
  end if;
  select s.root_id into v_root from public.reach_out_sends s
   where s.tenant_id = p_tenant_id and s.lead_id = p_lead_id
   order by s.created_at desc
   limit 1;
  return jsonb_build_object(
    'lead_id', v_lead.id,
    'business_name', v_lead.business_name,
    'stage', v_lead.stage,
    'closed_reason', v_lead.closed_reason,
    'found_at', v_lead.found_at,
    'email_state', v_lead.email_state,
    'resume_at', v_lead.resume_at,
    'booked_at', v_lead.booked_at,
    'stopped_at', v_lead.reach_out_stopped_at,
    'chain', (select jsonb_build_object('root_id', p.id, 'name', p.name, 'state', p.state)
                from public.playbooks p where p.id = v_root and p.tenant_id = p_tenant_id),
    -- The chain's search when there is one, else the newest search that found the lead.
    'search', coalesce(
      (select jsonb_build_object('id', q.id, 'name', q.name, 'asked', q.asked, 'fit', sm.fit)
         from public.playbooks p
         join public.lead_searches q on q.id = p.lead_search_id and q.tenant_id = p_tenant_id
         left join public.lead_search_members sm on sm.search_id = q.id and sm.lead_id = v_lead.id
        where p.id = v_root),
      (select jsonb_build_object('id', q.id, 'name', q.name, 'asked', q.asked, 'fit', sm.fit)
         from public.lead_search_members sm
         join public.lead_searches q on q.id = sm.search_id and q.removed_at is null
        where sm.tenant_id = p_tenant_id and sm.lead_id = v_lead.id and sm.blanked_at is null
        order by sm.created_at desc
        limit 1)),
    -- The person's email thread: where the reach-out's emails, and the answers to them, are.
    'conversation_id', (select m.conversation_id from public.reach_out_sends s join public.messages m on m.id = s.message_id
                         where s.tenant_id = p_tenant_id and s.lead_id = v_lead.id and s.state = 'sent'
                         order by s.sent_at desc
                         limit 1),
    'sends', coalesce((
      with recursive c as (
        select p.id, 0 as n from public.playbooks p where p.id = v_root
        union all
        select p.id, c.n + 1 from public.playbooks p join c on p.after_playbook_id = c.id
      )
      select jsonb_agg(jsonb_build_object(
               'id', s.id,
               'n', c.n,
               'hand', p.hand->>'kind',
               'state', s.state,
               'reason', s.reason,
               'send_at', s.send_at,
               'sent_at', coalesce(s.sent_at, case when s.state = 'failed' and public.email_left(m.status, m.error)
                                                  then public.email_sent_at(m.meta, m.status_updated_at, m.created_at) end),
               'left', s.state = 'sent' or (s.state = 'failed' and coalesce(public.email_left(m.status, m.error), false)),
               'angle', s.angle,
               'host', d.host,
               'message_id', s.message_id,
               'email_status', m.status,
               'bounced', coalesce(m.status = 'failed' and m.error->>'provider' = 'bounced', false))
             order by coalesce(s.sent_at, s.send_at, s.created_at), s.id)
        from (select * from public.reach_out_sends x
               where x.tenant_id = p_tenant_id and x.lead_id = v_lead.id and x.root_id = v_root
               order by x.created_at desc
               limit 20) s
        left join c on c.id = s.playbook_id
        left join public.playbooks p on p.id = s.playbook_id
        left join public.sending_domains d on d.id = s.domain_id
        left join public.messages m on m.id = s.message_id), '[]'::jsonb),
    'readings', coalesce((
      select jsonb_agg(jsonb_build_object(
               'message_id', r.message_id,
               'read_at', r.read_at,
               'intent', r.intent,
               'claim', r.claim,
               'summary', r.summary,
               'undone', r.undone_at is not null,
               'until_at', r.until_at,
               -- What the reading did, as its door recorded it (contracts readingPlan): the page says it, never re-derives it.
               'stops', coalesce((r.plan->>'stops')::boolean, false),
               'convert', coalesce((r.plan->>'convert')::boolean, false),
               'said_no', coalesce((r.plan->>'saidNo')::boolean, false),
               'can_undo', public.reach_out_reply_undoable(r.message_id) is null)
             order by r.read_at desc)
        from (select * from public.reach_out_replies x
               where x.tenant_id = p_tenant_id and x.lead_id = v_lead.id
               order by x.read_at desc
               limit 10) r), '[]'::jsonb),
    'can_stop', v_root is not null and v_lead.reach_out_stopped_at is null
  );
end $$;
revoke execute on function public.reach_out_lead_timeline(uuid, uuid) from public, anon;
grant execute on function public.reach_out_lead_timeline(uuid, uuid) to authenticated, service_role;
comment on function public.reach_out_lead_timeline(uuid, uuid) is
  'One lead''s reach-out (Reach out Part 6, H9, H11), for a member: the lead''s stage, dates and search, its chain, its person''s email thread, its sends (at most 20, in time order), its readings (at most 10, newest first, with can_undo from reach_out_reply_undoable) and can_stop. Null for a lead the workspace does not hold.';

/* ------------------------------------------------------------ 8. Stop writing to them (H10) -- */

-- An acting member stops a reach-out writing to one lead: the lead is stamped, and its planned and held emails in live
-- runs are skipped (owner_stopped). An email already claimed or queued is refused at the door by the stamp
-- (outreach_lead_facts.stopped); only one already handed to the provider goes, and the answer counts them. The lead is
-- not closed. A lead no chain ever planned is refused; a second stop does nothing.
create or replace function public.reach_out_lead_stop(p_lead_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant  uuid;
  v_lead    public.leads%rowtype;
  v_skipped int;
  v_leaving int;
begin
  if auth.uid() is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  -- Whose it is first, and only then the lock: a stranger never holds another workspace's lead row.
  select l.tenant_id into v_tenant from public.leads l where l.id = p_lead_id;
  if v_tenant is null or not public.is_acting_member(v_tenant) then
    raise exception 'Lead not found.' using errcode = 'P0002';
  end if;
  select * into v_lead from public.leads where id = p_lead_id and tenant_id = v_tenant for update;
  if not found or v_lead.erased_at is not null or v_lead.blanked_at is not null then
    raise exception 'Lead not found.' using errcode = 'P0002';
  end if;
  if not exists (select 1 from public.reach_out_sends s where s.tenant_id = v_lead.tenant_id and s.lead_id = p_lead_id) then
    raise exception 'Nothing has been written to them yet.' using errcode = '22023';
  end if;
  if v_lead.reach_out_stopped_at is not null then
    return jsonb_build_object('stopped', false, 'already', true, 'skipped', 0, 'leaving', 0);
  end if;
  update public.leads set reach_out_stopped_at = now() where id = p_lead_id;
  with skipped as (
    update public.reach_out_sends s
       set state = 'skipped', reason = 'owner_stopped'
      from public.broadcasts b
     where b.id = s.broadcast_id and b.state in ('pending_approval', 'scheduled', 'sending')
       and s.tenant_id = v_lead.tenant_id and s.lead_id = p_lead_id and s.state in ('planned', 'held')
    returning 1
  )
  select count(*) into v_skipped from skipped;
  select count(*) into v_leaving from public.reach_out_sends s
   where s.tenant_id = v_lead.tenant_id and s.lead_id = p_lead_id and s.state in ('claimed', 'queued');
  return jsonb_build_object('stopped', true, 'already', false, 'skipped', v_skipped, 'leaving', v_leaving);
end $$;
revoke execute on function public.reach_out_lead_stop(uuid) from public, anon;
grant execute on function public.reach_out_lead_stop(uuid) to authenticated, service_role;
comment on function public.reach_out_lead_stop(uuid) is
  '"Stop writing to them" (Reach out Part 6, H10), an acting member''s door: stamps leads.reach_out_stopped_at and skips the lead''s planned and held sends in live runs (owner_stopped). Answers {stopped, already, skipped, leaving}: leaving counts the claimed and queued emails, which the send door refuses by the stamp. Refused for a lead no chain ever planned (22023) or one the caller may not act on (P0002).';

/* ------------------------------------------------------------ 9. the day's numbers at 6 PM (H12) -- */

-- The workspaces with a reach-out whose local hour at p_now is 18, not told that day (a reach_out_day notification
-- about the local day), with a number above zero: emails that left since their midnight, readings of a person's reply,
-- of them the interested (or a question), the noes (any claim, not undone), the day's emails that bounced, and the holds
-- in live runs. At most p_limit. The hourly playbooks sweep writes each one's bell row.
create or replace function public.reach_out_day_due(p_now timestamptz, p_limit int)
returns table (tenant_id uuid, day date, numbers jsonb)
language sql
stable
security definer
set search_path = public
as $$
  with here as (
    select t.id, z.tz, (p_now at time zone z.tz)::date as day,
           date_trunc('day', p_now at time zone z.tz) at time zone z.tz as since
      from public.tenants t
     cross join lateral (select coalesce(nullif(t.timezone, ''), 'America/New_York') as tz) z
     where extract(hour from p_now at time zone z.tz) >= 18
       and exists (select 1 from public.playbooks p
                    where p.tenant_id = t.id and p.kind = 'reach_out' and p.trigger = 'lead_first')
  ), counted as (
    select h.id, h.day, jsonb_build_object(
      'written', (select count(*) from public.reach_out_sends s left join public.messages m on m.id = s.message_id
                   where s.tenant_id = h.id
                     and (s.state = 'sent' or (s.state = 'failed' and public.email_left(m.status, m.error)))
                     and coalesce(s.sent_at, public.email_sent_at(m.meta, m.status_updated_at, m.created_at))
                         between h.since and p_now),
      'wrote_back', (select count(*) from public.reach_out_replies r
                      where r.tenant_id = h.id and r.read_at >= h.since and r.read_at <= p_now
                        and r.claim <> 'auto_reply'),
      'interested', (select count(*) from public.reach_out_replies r
                      where r.tenant_id = h.id and r.read_at >= h.since and r.read_at <= p_now
                        and r.claim <> 'auto_reply' and r.undone_at is null
                        and r.intent in ('interested', 'question')),
      'said_no', (select count(*) from public.reach_out_replies r
                   where r.tenant_id = h.id and r.read_at >= h.since and r.read_at <= p_now
                     and r.undone_at is null and r.intent = 'no'),
      'bounced', (select count(*) from public.reach_out_sends s join public.messages m on m.id = s.message_id
                   where s.tenant_id = h.id and s.state in ('sent', 'failed')
                     and m.status = 'failed' and m.error->>'provider' = 'bounced'
                     and coalesce(s.sent_at, public.email_sent_at(m.meta, m.status_updated_at, m.created_at))
                         between h.since and p_now),
      'held', (select count(*) from public.reach_out_sends s join public.broadcasts b on b.id = s.broadcast_id
                where s.tenant_id = h.id and s.state = 'held'
                  and b.state in ('pending_approval', 'scheduled', 'sending'))) as numbers
      from here h
     where not exists (select 1 from public.notifications n
                        where n.tenant_id = h.id and n.created_at >= h.since - interval '1 day'
                          and n.kind = 'reach_out_day' and n.subject_type = 'reach_out_day'
                          and n.subject_id = h.day::text)
  )
  select c.id, c.day, c.numbers
    from counted c
   where (c.numbers->>'written')::int + (c.numbers->>'wrote_back')::int + (c.numbers->>'said_no')::int
         + (c.numbers->>'held')::int > 0
   order by c.id
   limit greatest(coalesce(p_limit, 0), 0)
$$;
revoke execute on function public.reach_out_day_due(timestamptz, int) from public, anon, authenticated;
grant execute on function public.reach_out_day_due(timestamptz, int) to service_role;
comment on function public.reach_out_day_due(timestamptz, int) is
  'The day''s reach-out numbers at 6 PM (Reach out Part 6, H12): each workspace with a reach-out whose local hour at p_now is 18, not yet told that local day (a reach_out_day notification about it), with a number above zero. numbers {written, wrote_back, interested, said_no, bounced, held}. At most p_limit. Service role only.';

/* ------------------------------------------------------------ 10. the kind -- */

-- 00222's list, with reach_out_day: the day's reach-out numbers, a line in the bell (H12).
alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in ('handoff','deadman','call','number','sweep','job_failed','playbook','calendar_people','alert','review','billing','template_ready','template_blocked','broadcast_sent','broadcast_stopped','leads_ready','leads_question','note_for_you','reach_out_replied','reach_out_day'));

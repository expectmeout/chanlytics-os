-- 00360 · A report is read over the days a member picks (Reports, the date range).
--
-- Every report function read "p_days ending today": report_series (00304), campaign_series (00329), reach_out_report
-- (00261) and reviews_ledger (00350) each anchored on the workspace's today, so Reports could offer four periods and no
-- other. Each takes the window's last day now, `p_end date default null`: null is today, as before, and a day that
-- has not come is read as today. A period by name passes none, so every read Reports makes today is the read it made
-- yesterday, and the dashboard and this migration may deploy in either order: only a window that ended before today
-- names `p_end`, and it is refused in words until this is applied.
--
-- Two things move in each function, and nothing else of them:
--   1. The anchor. `v_end` is the window's last day and takes `v_today`'s place wherever a day was counted from it; the
--      answer still says `today`, the workspace's real one, and says `end` beside it.
--   2. The far bound. Each source was read from the window's first instant onward, which is the window only while no row
--      is later than today. Each is read to `v_stop` now, the midnight after the window's last day in the workspace's
--      zone, so a window that ended in September counts nothing of October. For a window that ends today no row is past
--      it, and the answer is the same to the byte (tests/reports/periods/report-window.db.test.mjs holds both:
--      a window is the same slice of the days whichever day it is asked from).
--
-- reach_out_report also takes any count of days from 1 to 90, as the other three do: it refused all but 7, 30 and 90,
-- so the month so far (`month`, nine days on the 9th) read nothing of the reach-outs.
--
-- A function with one more argument is another function to Postgres, and PostgREST cannot choose between two that take
-- the same named arguments: the old signatures are dropped first, in this one transaction, and the grants and comments
-- are said again for the new ones (a dropped function's go with it). Nothing in the schema depends on any of the four.
-- Re-runnable: the drops are `if exists`, the rest `create or replace`.

-- ---------------------------------------------------------------- report_series
-- As 00304 left it, with the window's last day and its far bound.
drop function if exists public.report_series(uuid, integer);

create or replace function public.report_series(p_tenant_id uuid, p_days integer default 30, p_end date default null)
returns jsonb
language plpgsql
stable
set search_path = public
as $$
declare
  v_tz     text;
  v_days   integer := least(greatest(coalesce(p_days, 30), 1), 90);
  v_span   integer;
  v_today  date;
  v_end    date;
  v_start  timestamptz;
  v_stop   timestamptz;
  v_result jsonb;
begin
  select timezone into v_tz from tenants where id = p_tenant_id;
  if v_tz is null then
    return jsonb_build_object('error', 'unknown_tenant');
  end if;

  v_span  := v_days * 2;
  v_today := (now() at time zone v_tz)::date;
  -- The window's last day (00360): today, or the earlier day a member picked. Never a day that has not come.
  v_end   := least(coalesce(p_end, v_today), v_today);
  v_start := ((v_end - (v_span - 1))::timestamp) at time zone v_tz;
  -- Where the window stops: the midnight after its last day. Every source is read to here, so a window that ended
  -- before today counts nothing that came after it.
  v_stop  := ((v_end + 1)::timestamp) at time zone v_tz;

  with days as (
    select (v_end - (v_span - 1) + g)::date as day
      from generate_series(0, v_span - 1) g
  ),
  -- NOT MATERIALIZED (00037): same reason as in metrics_summary.
  real_msgs as not materialized (
    select * from messages
     where tenant_id = p_tenant_id
       and coalesce(meta->>'backfill', 'false') <> 'true'
  ),
  msgs as (
    select m.*, (m.created_at at time zone v_tz)::date as day
      from real_msgs m
     where m.created_at >= v_start and m.created_at < v_stop
  ),
  inbound as (select * from msgs where direction = 'inbound' and sender = 'customer'),
  out_sent as (
    select * from msgs
     where direction = 'outbound' and status in ('sent', 'delivered', 'read')
  ),
  -- ONE definition of "who answered" and "how fast", shared with metrics_summary (00035, 00303).
  answered as (
    select r.*, (r.asked_at at time zone v_tz)::date as day
      from public.first_replies(p_tenant_id, v_start) r
     where r.asked_at < v_stop
  ),
  -- A call someone spoke on (00303).
  calls_w as (
    select k.*, (k.started_at at time zone v_tz)::date as day
      from calls k
     where k.tenant_id = p_tenant_id and k.started_at >= v_start and k.started_at < v_stop
       and public.call_connected(k.status, k.duration_ms)
  ),
  escs as (
    select e.*, (e.created_at at time zone v_tz)::date as day
      from escalations e
     where e.tenant_id = p_tenant_id and e.created_at >= v_start and e.created_at < v_stop
  ),
  -- Each person's first moment, one rule with metrics_summary (00303).
  fresh as (
    select (f.first_at at time zone v_tz)::date as day
      from public.contact_first_moments(p_tenant_id) f
     where f.first_at >= v_start and f.first_at < v_stop
  ),
  per_day as (
    select d.day,
           coalesce(i.messages_in, 0)   as messages_in,
           coalesce(i.conversations, 0) as conversations,
           coalesce(a.answered_ai, 0)   as answered_ai,
           coalesce(a.answered_you, 0)  as answered_you,
           coalesce(a.unanswered, 0)    as unanswered,
           coalesce(o.out_ai, 0)        as out_ai,
           coalesce(o.out_you, 0)       as out_you,
           coalesce(e.escalations, 0)   as escalations,
           coalesce(k.calls, 0)         as calls,
           coalesce(k.call_seconds, 0)  as call_seconds,
           coalesce(f.new_contacts, 0)  as new_contacts
      from days d
      left join (select i.day, count(*) as messages_in, count(distinct i.conversation_id) as conversations
                   from inbound i group by i.day) i on i.day = d.day
      left join (select a.day,
                        count(*) filter (where a.who = 'ai')   as answered_ai,
                        count(*) filter (where a.who = 'you')  as answered_you,
                        count(*) filter (where a.who = 'none') as unanswered
                   from answered a group by a.day) a on a.day = d.day
      left join (select o.day,
                        count(*) filter (where o.sender = 'ai') as out_ai,
                        -- the owner's own sends; a broadcast's, a playbook's or a reach-out's are not (00304)
                        count(*) filter (where o.sender = 'human' and not public.automated_send(o.meta)) as out_you
                   from out_sent o group by o.day) o on o.day = d.day
      left join (select e.day, count(*) as escalations from escs e group by e.day) e on e.day = d.day
      left join (select k.day, count(*) as calls, round(sum(k.duration_ms) / 1000.0) as call_seconds
                   from calls_w k group by k.day) k on k.day = d.day
      left join (select f.day, count(*) as new_contacts from fresh f group by f.day) f on f.day = d.day
  ),
  -- When people reached the business this period, on the tenant's clock: one source for the hours and the arrivals.
  arrivals_now as (
    select (i.created_at at time zone v_tz) as t from inbound i where i.day > v_end - v_days
    union all
    select (k.started_at at time zone v_tz) as t from calls_w k where k.day > v_end - v_days
  ),
  hour_counts as (
    select extract(isodow from x.t)::int as dow, extract(hour from x.t)::int as hr, count(*)::int as n
      from arrivals_now x
     group by 1, 2
  ),
  hour_grid as (
    select d.dow, jsonb_agg(coalesce(hc.n, 0) order by h.hr) as cells
      from generate_series(1, 7) as d(dow)
     cross join generate_series(0, 23) as h(hr)
      left join hour_counts hc on hc.dow = d.dow and hc.hr = h.hr
     group by d.dow
  ),
  -- 00304: each local day and quarter hour something came in, for the page's while-you-were-closed (openAt).
  arrival_counts as (
    select to_char(x.t::date, 'YYYY-MM-DD') as d,
           (extract(hour from x.t)::int * 4 + floor(extract(minute from x.t) / 15)::int) as q,
           count(*)::int as n
      from arrivals_now x
     group by 1, 2
  )
  select jsonb_build_object(
    'timezone', v_tz,
    'days', v_days,
    'span_days', v_span,
    'today', to_char(v_today, 'YYYY-MM-DD'),
    'end', to_char(v_end, 'YYYY-MM-DD'),
    'series', (select jsonb_agg(jsonb_build_object(
                 'day', to_char(p.day, 'YYYY-MM-DD'),
                 'messages_in', p.messages_in,
                 'conversations', p.conversations,
                 'answered_ai', p.answered_ai,
                 'answered_you', p.answered_you,
                 'unanswered', p.unanswered,
                 'out_ai', p.out_ai,
                 'out_you', p.out_you,
                 'escalations', p.escalations,
                 'calls', p.calls,
                 'call_seconds', p.call_seconds,
                 'new_contacts', p.new_contacts) order by p.day)
                from per_day p),
    'reasons', coalesce((select jsonb_object_agg(reason, n) from (
                 select reason, count(*) as n from escs
                  where day > v_end - v_days
                  group by reason) r), '{}'::jsonb),
    'reply_seconds', coalesce((select jsonb_agg(round(ai_seconds)) from answered
                                where day > v_end - v_days and ai_seconds is not null), '[]'::jsonb),
    'sentiments', coalesce((select jsonb_object_agg(coalesce(sentiment, 'Unknown'), n) from (
                    select sentiment, count(*) as n from calls_w
                     where day > v_end - v_days
                     group by sentiment) s), '{}'::jsonb),
    'voicemail', (select count(*) from calls_w where day > v_end - v_days and in_voicemail),
    'replies', coalesce((select jsonb_agg(jsonb_build_object(
                                  'day', to_char(a.day, 'YYYY-MM-DD'),
                                  's', round(a.ai_seconds),
                                  'hold', round(coalesce(a.ai_hold_s, 0)))
                                order by a.asked_at)
                           from answered a
                          where a.day > v_end - v_days and a.ai_seconds is not null), '[]'::jsonb),
    'channels', jsonb_build_object(
      'current', jsonb_build_object(
        'whatsapp', (select count(*) from inbound i where i.day > v_end - v_days and i.channel = 'whatsapp'),
        'sms',      (select count(*) from inbound i where i.day > v_end - v_days and i.channel = 'sms'),
        'email',    (select count(*) from inbound i where i.day > v_end - v_days and i.channel = 'email'),
        'voice',    (select count(*) from calls_w k where k.day > v_end - v_days)),
      'previous', jsonb_build_object(
        'whatsapp', (select count(*) from inbound i where i.day <= v_end - v_days and i.channel = 'whatsapp'),
        'sms',      (select count(*) from inbound i where i.day <= v_end - v_days and i.channel = 'sms'),
        'email',    (select count(*) from inbound i where i.day <= v_end - v_days and i.channel = 'email'),
        'voice',    (select count(*) from calls_w k where k.day <= v_end - v_days))),
    'hours', (select jsonb_agg(g.cells order by g.dow) from hour_grid g),
    'arrivals', coalesce((select jsonb_agg(jsonb_build_object('d', a.d, 'q', a.q, 'n', a.n) order by a.d, a.q)
                            from arrival_counts a), '[]'::jsonb)
  ) into v_result;

  return v_result;
end $$;

revoke all on function public.report_series(uuid, integer, date) from public, anon;
grant execute on function public.report_series(uuid, integer, date) to authenticated, service_role;

comment on function public.report_series(uuid, integer, date) is
  'Reports: the receptionist''s numbers day by day over p_days and the same number of days before them (customer messages, who answered and how fast, calls, the people who needed a person, new people), with the period''s reply times, reasons, moods, channels and arrivals, each on its day in the workspace''s own zone. SECURITY INVOKER: the caller''s RLS decides what a member reads. `p_end` (00360) is the window''s last day, in the workspace''s zone: null is today, and a day that has not come is read as today.';

-- ---------------------------------------------------------------- campaign_series
-- As 00329 left it, with the window's last day and its far bound.
drop function if exists public.campaign_series(uuid, integer);

create or replace function public.campaign_series(p_tenant_id uuid, p_days integer default 30, p_end date default null)
returns jsonb
language plpgsql
stable
set search_path = public
as $$
declare
  v_tz     text;
  v_days   integer := least(greatest(coalesce(p_days, 30), 1), 90);
  v_span   integer;
  v_today  date;
  v_end    date;
  v_start  timestamptz;
  v_stop   timestamptz;
  v_cur    date;
  v_result jsonb;
begin
  select timezone into v_tz from tenants where id = p_tenant_id;
  if v_tz is null then
    return jsonb_build_object('error', 'unknown_tenant');
  end if;

  v_span  := v_days * 2;
  v_today := (now() at time zone v_tz)::date;
  -- The window's last day and where it stops, as report_series reads them (00360).
  v_end   := least(coalesce(p_end, v_today), v_today);
  v_start := ((v_end - (v_span - 1))::timestamp) at time zone v_tz;
  v_stop  := ((v_end + 1)::timestamp) at time zone v_tz;
  v_cur   := v_end - (v_days - 1);

  with days as (
    select (v_end - (v_span - 1) + g)::date as day
      from generate_series(0, v_span - 1) g
  ),
  -- Every message a broadcast or a playbook run actually sent in the span,
  -- with the receipt WhatsApp gave it and the thread it landed in.
  sent as (
    select r.broadcast_id, r.contact_id, r.sent_at,
           -- The channel it went by (00298); a row from before channels went by WhatsApp, as every run then did.
           coalesce(r.channel, 'whatsapp') as channel,
           (r.sent_at at time zone v_tz)::date as day,
           m.status as message_status, m.conversation_id,
           b.playbook_id, b.name as broadcast_name, b.template_name
      from broadcast_recipients r
      join broadcasts b on b.id = r.broadcast_id
      left join messages m on m.id = r.message_id
     where r.tenant_id = p_tenant_id
       and r.state = 'sent'
       and r.sent_at >= v_start and r.sent_at < v_stop
  ),
  -- Replied: the customer wrote in that thread after the message went out, in their own words: not a call's note
  -- (an inbound row the system wrote) and not a program writing from their address (message_is_a_persons_words, 00299).
  -- The same rule the Broadcasts page counts by (the dashboard's broadcasts reader, contracts isPersonsWords).
  sent_r as (
    select s.*,
           (s.message_status in ('delivered', 'read')) as delivered,
           (s.message_status = 'read')                as was_read,
           exists (select 1 from messages i
                    where i.conversation_id = s.conversation_id
                      and i.direction = 'inbound'
                      and i.sender = 'customer'
                      and public.message_is_a_persons_words(i.meta)
                      and i.created_at > s.sent_at
                      and i.created_at <= s.sent_at + interval '72 hours')  as replied
      from sent s
  ),
  -- A yes or a stop, from the desk or in the customer's own words: the
  -- consent ledger both doors write (00013, 00043), email's own answer with them (00174: the one-click unsubscribe an
  -- offer by email invites, and YES OFFERS by email), which this left out while offers went by WhatsApp alone. One
  -- answer a person a day each way: the unsubscribe page's "stop all" writes the STOP and email's own no for one
  -- press (stop_all_messages), and that is one stop.
  consent as (
    select distinct (e.created_at at time zone v_tz)::date as day, e.subject_id, e.data->>'consent' as consent
      from events e
     where e.tenant_id = p_tenant_id
       and e.kind = 'contact.consent_changed'
       and e.created_at >= v_start and e.created_at < v_stop
  ),
  -- Each day from one pass over each source, grouped by the day (00251), where a scalar subquery per day and per
  -- count scanned both again for every day.
  per_day as (
    select d.day,
           coalesce(s.sent, 0)      as sent,
           coalesce(s.delivered, 0) as delivered,
           coalesce(s.was_read, 0)  as was_read,
           coalesce(s.replied, 0)   as replied,
           coalesce(c.opt_ins, 0)   as opt_ins,
           coalesce(c.opt_outs, 0)  as opt_outs
      from days d
      left join (select s.day, count(*) as sent,
                        count(*) filter (where s.delivered) as delivered,
                        count(*) filter (where s.was_read)  as was_read,
                        count(*) filter (where s.replied)   as replied
                   from sent_r s group by s.day) s on s.day = d.day
      left join (select c.day,
                        count(*) filter (where c.consent = 'opted_in')  as opt_ins,
                        count(*) filter (where c.consent = 'opted_out') as opt_outs
                   from consent c group by c.day) c on c.day = d.day
  ),
  -- The current period by source: a playbook's runs together, a one-off
  -- broadcast on its own.
  sources as (
    select coalesce(s.playbook_id, s.broadcast_id) as id,
           (s.playbook_id is not null)             as is_playbook,
           coalesce(max(p.name), max(s.broadcast_name)) as name,
           max(s.template_name)                    as template_name,
           count(distinct s.broadcast_id)          as runs,
           count(*)                                as sent,
           count(*) filter (where s.delivered)     as delivered,
           count(*) filter (where s.was_read)      as was_read,
           count(*) filter (where s.replied)       as replied,
           max(s.sent_at)                          as last_at
      from sent_r s
      left join playbooks p on p.id = s.playbook_id
     where s.day >= v_cur
     group by coalesce(s.playbook_id, s.broadcast_id), (s.playbook_id is not null)
  ),
  -- The current period by the channel each message went by (0030): each channel's own receipts, read receipts
  -- WhatsApp's alone, so a share of them is said over WhatsApp's own sends.
  by_channel as (
    select s.channel,
           count(*)                            as sent,
           count(*) filter (where s.delivered) as delivered,
           count(*) filter (where s.was_read)  as was_read,
           count(*) filter (where s.replied)   as replied
      from sent_r s
     where s.day >= v_cur
     group by s.channel
  )
  select jsonb_build_object(
    'timezone', v_tz,
    'days', v_days,
    'span_days', v_span,
    'today', to_char(v_today, 'YYYY-MM-DD'),
    'end', to_char(v_end, 'YYYY-MM-DD'),
    'series', (select jsonb_agg(jsonb_build_object(
                 'day', to_char(p.day, 'YYYY-MM-DD'),
                 'sent', p.sent,
                 'delivered', p.delivered,
                 'read', p.was_read,
                 'replied', p.replied,
                 'opt_ins', p.opt_ins,
                 'opt_outs', p.opt_outs) order by p.day)
               from per_day p),
    'sources', coalesce((select jsonb_agg(jsonb_build_object(
                 'id', x.id,
                 'kind', case when x.is_playbook then 'playbook' else 'broadcast' end,
                 'name', x.name,
                 'template_name', x.template_name,
                 'runs', x.runs,
                 'sent', x.sent,
                 'delivered', x.delivered,
                 'read', x.was_read,
                 'replied', x.replied,
                 'last_at', x.last_at) order by x.sent desc, x.last_at desc)
               from sources x), '[]'::jsonb),
    'by_channel', coalesce((select jsonb_agg(jsonb_build_object(
                 'channel', c.channel,
                 'sent', c.sent,
                 'delivered', c.delivered,
                 'read', c.was_read,
                 'replied', c.replied) order by c.sent desc, c.channel)
               from by_channel c), '[]'::jsonb)
  ) into v_result;

  return v_result;
end $$;

revoke all on function public.campaign_series(uuid, integer, date) from public, anon;
grant execute on function public.campaign_series(uuid, integer, date) to authenticated, service_role;

comment on function public.campaign_series(uuid, integer, date) is
  'Reports › Campaigns: messages sent by broadcasts and playbook runs, delivered and read receipts, replies (the customer''s own words: not a call''s note, an automatic reply or a list''s mail), yeses and stops (an unsubscribe from offers by email among them, 00174; one a person a day each way), day by day over two periods, and the current period by source and by the channel each went by (0030; a row naming none went by WhatsApp). `p_end` (00360) is the window''s last day, in the workspace''s zone: null is today, and a day that has not come is read as today.';

-- ---------------------------------------------------------------- reach_out_report
-- As 00261 left it, with the window's last day and its far bound.
drop function if exists public.reach_out_report(uuid, integer);

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
        'delivered', (select count(*) from sent where status in ('delivered', 'read')),
        'bounced', (select count(*) from sent where status = 'failed' and error->>'provider' = 'bounced'),
        'wrote_back', (select count(*) from answers where wrote_back),
        'interested', (select count(*) from answers where interested),
        'booked', (select count(*) from answers where booked),
        'said_no', (select count(*) from answers where said_no),
        'handed', coalesce((select sum(n) from handed), 0)),
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

revoke all on function public.reach_out_report(uuid, integer, date) from public, anon;
grant execute on function public.reach_out_report(uuid, integer, date) to authenticated, service_role;

comment on function public.reach_out_report(uuid, integer, date) is
  'Reports'' Reach-outs section (Reach out Part 6, H1, H3-H6), for a member: over the last p_days (7, 30 or 90) days in the workspace''s zone, the emails that left and what came of them. has_reach_out, totals, series (written per day), chains (at most 20, each with its steps), angles (the top 8, other_angles, no_angle) and domains (at most 10; a removed domain''s host is null). Each lead is counted once per chain at its last email of the period; wrote back is outreach_wrote_back. `p_end` (00360) is the window''s last day, in the workspace''s zone: null is today, and a day that has not come is read as today.';

-- ---------------------------------------------------------------- reviews_ledger
-- As 00350 left it, with the window's last day and its far bound.
drop function if exists public.reviews_ledger(uuid, integer);

create or replace function public.reviews_ledger(p_tenant_id uuid, p_days integer default 30, p_end date default null)
returns jsonb
language plpgsql
stable
set search_path = public
as $$
declare
  v_tz        text;
  v_days      integer := least(greatest(coalesce(p_days, 30), 1), 92);
  v_today     date;
  v_end       date;         -- the period's last day: today, or the earlier day a member picked (00360)
  v_since     date;         -- the period's first day
  v_prior     date;         -- the period before's first day
  v_read_from timestamptz;  -- the instant the period before begins, in the zone
  v_stop      timestamptz;  -- the midnight after the period's last day, in the zone
  -- The most reviews that wait the answer lists: contracts REVIEWS_WAITING_SHOWN, which the database test holds to this.
  v_waiting_shown constant integer := 5;
  -- How far a receptionist's event may be from the reply it wrote: Google's updateTime on the reply moves when the owner
  -- rewrites it on Google, and the event then names a reply that is no longer there.
  v_slack     constant interval := interval '6 hours';
  v_result    jsonb;
begin
  select timezone into v_tz from tenants where id = p_tenant_id;
  if v_tz is null then
    return jsonb_build_object('error', 'unknown_tenant');
  end if;

  v_today     := (now() at time zone v_tz)::date;
  v_end       := least(coalesce(p_end, v_today), v_today);
  v_since     := v_end - (v_days - 1);
  v_prior     := v_since - v_days;
  v_read_from := (v_prior::timestamp) at time zone v_tz;
  v_stop      := ((v_end + 1)::timestamp) at time zone v_tz;

  select jsonb_build_object(
    'timezone', v_tz,
    'today', to_char(v_today, 'YYYY-MM-DD'),
    'end', to_char(v_end, 'YYYY-MM-DD'),
    'days', v_days,
    'on_record', jsonb_build_object(
      'profile', c.profile,
      'places', c.places,
      'complete', coalesce((select g.reviews_complete from google_connections g where g.tenant_id = p_tenant_id), false)),
    -- The profile's reviews dated from the period before's first day, each on its day in the zone, oldest first.
    'written', coalesce((select jsonb_agg(jsonb_build_object(
                 'id', w.id,
                 'd', to_char(w.d, 'YYYY-MM-DD'),
                 'rating', w.rating,
                 'replied', w.replied,
                 'secs', w.secs,
                 'by', w.by) order by w.published_at, w.id)
               from (select r.id, r.rating, r.published_at,
                            (r.published_at at time zone v_tz)::date as d,
                            (r.reply_text is not null) as replied,
                            case when r.reply_text is not null and r.replied_at >= r.published_at
                                 then extract(epoch from (r.replied_at - r.published_at))::integer end as secs,
                            case when r.reply_text is not null and ev.writer = 'receptionist'
                                  and abs(extract(epoch from (ev.wrote_at - r.replied_at))) <= extract(epoch from v_slack)
                                 then 'receptionist' end as by
                       from google_reviews r
                       -- The reply's last event, whoever wrote it: a person's reply through Chanlytics files one with no `by`.
                       left join lateral (
                         select e.data->>'by' as writer, e.created_at as wrote_at
                           from events e
                          where e.tenant_id = r.tenant_id and e.kind = 'google.replied'
                            and e.subject_type = 'review' and e.subject_id = r.id
                          order by e.created_at desc, e.id desc
                          limit 1) ev on true
                      where r.tenant_id = p_tenant_id and r.origin = 'profile' and r.published_at >= v_read_from
                        and r.published_at < v_stop) w), '[]'::jsonb),
    'waiting_total', c.waiting,
    -- The oldest that wait, the ones with no date last: the columns the Google read draws a review by, and why a reply
    -- written for it was held (google.reply_held), where one was.
    'waiting', coalesce((select jsonb_agg(to_jsonb(q) order by q.published_at asc nulls last, q.id)
                 from (select r.id, r.review_id, r.origin, r.rating, r.author, r.author_uri, r.author_photo_uri, r.body,
                              r.language_code, r.published_at, r.reply_text, r.replied_at, r.maps_uri, r.first_seen_at,
                              (select e.data->>'why'
                                 from events e
                                where e.tenant_id = r.tenant_id and e.kind = 'google.reply_held'
                                  and e.subject_type = 'review' and e.subject_id = r.id
                                  and e.data->>'why' is not null
                                order by e.created_at desc, e.id desc
                                limit 1) as held
                         from google_reviews r
                        where r.tenant_id = p_tenant_id and r.origin = 'profile' and r.reply_text is null
                        order by r.published_at asc nulls last, r.id
                        limit v_waiting_shown) q), '[]'::jsonb)
  ) into v_result
  from (select count(*) filter (where origin = 'profile')                            as profile,
               count(*) filter (where origin = 'places')                             as places,
               count(*) filter (where origin = 'profile' and reply_text is null)     as waiting
          from google_reviews
         where tenant_id = p_tenant_id) c;

  return v_result;
end $$;

revoke all on function public.reviews_ledger(uuid, integer, date) from public, anon;
grant execute on function public.reviews_ledger(uuid, integer, date) to authenticated, service_role;

comment on function public.reviews_ledger(uuid, integer, date) is
  'Reports › Reviews: the profile''s reviews from the period before''s first day (each on its day in the workspace''s zone, with whether it has a reply, how long the reply took, and who wrote it: the receptionist where its own event is within six hours of the reply), the counts of each origin, whether the record is all of Google''s, and the oldest five that wait for a reply with why a reply written for one was held. One statement, under the caller''s RLS. `p_end` (00360) is the window''s last day, in the workspace''s zone: null is today, and a day that has not come is read as today.';

-- 00251 · A report draws each day from one pass.
--
-- report_series (00139) and campaign_series (00174) built each day of their two
-- periods, up to 180 days, from a scalar subquery per count, and each subquery
-- scanned its whole source for the one day it wanted: report_series' messages,
-- first replies, sends, escalations and calls about ten times a day, and its
-- contacts pass (firsts, fresh), inlined into the day's subquery, once a day for
-- every contact; campaign_series' sends and consent changes six times a day.
-- So a report cost its days times its period's rows, and Reports its days
-- times its contacts on top. Now each source is read once and grouped by the
-- day, and the days take their counts from the groups: the same numbers, a zero
-- for a day with none, as before.
--
-- Each function is copied as it stands from its latest migration with only its
-- per_day replaced. Only the bodies change, so `create or replace` takes them:
-- nothing is dropped, and the grants and campaign_series' comment stand; they
-- are restated so this file reads on its own.

create or replace function public.report_series(p_tenant_id uuid, p_days integer default 30)
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
  v_start  timestamptz;
  v_result jsonb;
begin
  select timezone into v_tz from tenants where id = p_tenant_id;
  if v_tz is null then
    return jsonb_build_object('error', 'unknown_tenant');
  end if;

  v_span  := v_days * 2;
  v_today := (now() at time zone v_tz)::date;
  v_start := ((v_today - (v_span - 1))::timestamp) at time zone v_tz;

  with days as (
    select (v_today - (v_span - 1) + g)::date as day
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
     where m.created_at >= v_start
  ),
  inbound as (select * from msgs where direction = 'inbound' and sender = 'customer'),
  out_sent as (
    select * from msgs
     where direction = 'outbound' and status in ('sent', 'delivered', 'read')
  ),
  -- ONE definition of "who answered" and "how fast", shared with metrics_summary (00035).
  answered as (
    select r.*, (r.asked_at at time zone v_tz)::date as day
      from public.first_replies(p_tenant_id, v_start) r
  ),
  calls_w as (
    select k.*, (k.started_at at time zone v_tz)::date as day
      from calls k
     where k.tenant_id = p_tenant_id and k.started_at >= v_start
       and k.status <> 'not_connected'
  ),
  escs as (
    select e.*, (e.created_at at time zone v_tz)::date as day
      from escalations e
     where e.tenant_id = p_tenant_id and e.created_at >= v_start
  ),
  firsts as (
    select c.id,
           least(
             coalesce((select min(m.channel_ts) from messages m
                        where m.contact_id = c.id
                          and coalesce(m.meta->>'backfill', 'false') <> 'true'),
                      'infinity'::timestamptz),
             coalesce((select min(k.started_at) from calls k
                        where k.contact_id = c.id and k.status <> 'not_connected'),
                      'infinity'::timestamptz)
           ) as first_at
      from contacts c
     where c.tenant_id = p_tenant_id
       and not exists (select 1 from messages b
                        where b.contact_id = c.id
                          and coalesce(b.meta->>'backfill', 'false') = 'true')
  ),
  fresh as (
    select (first_at at time zone v_tz)::date as day
      from firsts
     where first_at >= v_start and first_at < 'infinity'::timestamptz
  ),
  -- Each day from one pass over each source, grouped by the day (00251). A scalar subquery per day and per count
  -- scanned every source again for every day, and ran the contacts pass (firsts, fresh) once a day.
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
                        count(*) filter (where o.sender = 'ai')    as out_ai,
                        count(*) filter (where o.sender = 'human') as out_you
                   from out_sent o group by o.day) o on o.day = d.day
      left join (select e.day, count(*) as escalations from escs e group by e.day) e on e.day = d.day
      left join (select k.day, count(*) as calls, round(sum(k.duration_ms) / 1000.0) as call_seconds
                   from calls_w k group by k.day) k on k.day = d.day
      left join (select f.day, count(*) as new_contacts from fresh f group by f.day) f on f.day = d.day
  ),
  -- v3: when people reached the business, this period, in the tenant's zone.
  hour_counts as (
    select extract(isodow from x.t)::int as dow, extract(hour from x.t)::int as hr, count(*)::int as n
      from (
        select (i.created_at at time zone v_tz) as t from inbound i where i.day > v_today - v_days
        union all
        select (k.started_at at time zone v_tz) as t from calls_w k where k.day > v_today - v_days
      ) x
     group by 1, 2
  ),
  hour_grid as (
    select d.dow, jsonb_agg(coalesce(hc.n, 0) order by h.hr) as cells
      from generate_series(1, 7) as d(dow)
     cross join generate_series(0, 23) as h(hr)
      left join hour_counts hc on hc.dow = d.dow and hc.hr = h.hr
     group by d.dow
  )
  select jsonb_build_object(
    'timezone', v_tz,
    'days', v_days,
    'span_days', v_span,
    'today', to_char(v_today, 'YYYY-MM-DD'),
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
                  where day > v_today - v_days
                  group by reason) r), '{}'::jsonb),
    'reply_seconds', coalesce((select jsonb_agg(round(ai_seconds)) from answered
                                where day > v_today - v_days and ai_seconds is not null), '[]'::jsonb),
    'sentiments', coalesce((select jsonb_object_agg(coalesce(sentiment, 'Unknown'), n) from (
                    select sentiment, count(*) as n from calls_w
                     where day > v_today - v_days
                     group by sentiment) s), '{}'::jsonb),
    'voicemail', (select count(*) from calls_w where day > v_today - v_days and in_voicemail),
    -- v3
    'replies', coalesce((select jsonb_agg(jsonb_build_object('day', to_char(a.day, 'YYYY-MM-DD'), 's', round(a.ai_seconds))
                                          order by a.asked_at)
                           from answered a
                          where a.day > v_today - v_days and a.ai_seconds is not null), '[]'::jsonb),
    'channels', jsonb_build_object(
      'current', jsonb_build_object(
        'whatsapp',  (select count(*) from inbound i where i.day > v_today - v_days and i.channel = 'whatsapp'),
        'sms',       (select count(*) from inbound i where i.day > v_today - v_days and i.channel = 'sms'),
        'email',     (select count(*) from inbound i where i.day > v_today - v_days and i.channel = 'email'),
        'instagram', (select count(*) from inbound i where i.day > v_today - v_days and i.channel = 'instagram'),
        'voice',     (select count(*) from calls_w k where k.day > v_today - v_days)),
      'previous', jsonb_build_object(
        'whatsapp',  (select count(*) from inbound i where i.day <= v_today - v_days and i.channel = 'whatsapp'),
        'sms',       (select count(*) from inbound i where i.day <= v_today - v_days and i.channel = 'sms'),
        'email',     (select count(*) from inbound i where i.day <= v_today - v_days and i.channel = 'email'),
        'instagram', (select count(*) from inbound i where i.day <= v_today - v_days and i.channel = 'instagram'),
        'voice',     (select count(*) from calls_w k where k.day <= v_today - v_days))),
    'hours', (select jsonb_agg(g.cells order by g.dow) from hour_grid g)
  ) into v_result;

  return v_result;
end $$;

revoke all on function public.report_series(uuid, integer) from public, anon;
grant execute on function public.report_series(uuid, integer) to authenticated;

create or replace function public.campaign_series(p_tenant_id uuid, p_days integer default 30)
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
  v_start  timestamptz;
  v_cur    date;
  v_result jsonb;
begin
  select timezone into v_tz from tenants where id = p_tenant_id;
  if v_tz is null then
    return jsonb_build_object('error', 'unknown_tenant');
  end if;

  v_span  := v_days * 2;
  v_today := (now() at time zone v_tz)::date;
  v_start := ((v_today - (v_span - 1))::timestamp) at time zone v_tz;
  v_cur   := v_today - (v_days - 1);

  with days as (
    select (v_today - (v_span - 1) + g)::date as day
      from generate_series(0, v_span - 1) g
  ),
  -- Every message a broadcast or a playbook run actually sent in the span,
  -- with the receipt WhatsApp gave it and the thread it landed in.
  sent as (
    select r.broadcast_id, r.contact_id, r.sent_at,
           (r.sent_at at time zone v_tz)::date as day,
           m.status as message_status, m.conversation_id,
           b.playbook_id, b.name as broadcast_name, b.template_name
      from broadcast_recipients r
      join broadcasts b on b.id = r.broadcast_id
      left join messages m on m.id = r.message_id
     where r.tenant_id = p_tenant_id
       and r.state = 'sent'
       and r.sent_at >= v_start
  ),
  -- Replied: the customer wrote in that thread after the message went out —
  -- the same rule the Broadcasts page counts by.
  sent_r as (
    select s.*,
           (s.message_status in ('delivered', 'read')) as delivered,
           (s.message_status = 'read')                as was_read,
           exists (select 1 from messages i
                    where i.conversation_id = s.conversation_id
                      and i.direction = 'inbound'
                      and i.created_at > s.sent_at
                      and i.created_at <= s.sent_at + interval '72 hours')  as replied
      from sent s
  ),
  -- A yes or a stop, from the desk or in the customer's own words: the
  -- consent ledger both doors write (00013, 00043). Not email's own answer (00174).
  consent as (
    select (e.created_at at time zone v_tz)::date as day, e.data->>'consent' as consent
      from events e
     where e.tenant_id = p_tenant_id
       and e.kind = 'contact.consent_changed'
       and e.created_at >= v_start
       and coalesce(e.data->>'purpose', '') <> 'email_marketing'
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
  )
  select jsonb_build_object(
    'timezone', v_tz,
    'days', v_days,
    'span_days', v_span,
    'today', to_char(v_today, 'YYYY-MM-DD'),
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
               from sources x), '[]'::jsonb)
  ) into v_result;

  return v_result;
end $$;

revoke all on function public.campaign_series(uuid, integer) from public, anon;
grant execute on function public.campaign_series(uuid, integer) to authenticated;
comment on function public.campaign_series(uuid, integer) is
  'Reports › Campaigns: messages sent by broadcasts and playbook runs, delivered and read receipts, replies, yeses and stops (not an unsubscribe from email, 00174) — day by day over two periods, and the current period by playbook or broadcast. Invoker''s RLS.';

-- 00139 · Reports say where and when.
--
-- report_series v3, for the Reports redesign (18 Sep 2026). Three fields join the report; every field it already
-- returned is unchanged, so the page that is live keeps working before and after this lands.
--
--   replies  every receptionist first reply in the current period, with the day it was asked (tenant zone) and its
--            seconds, so contracts can take a true median a day or a week at a time. reply_seconds stays for the
--            clients that still read it.
--   channels inbound customer messages by messages.channel, and connected calls as voice, for this period and the
--            one before. A conversation is one per person and spans every channel, so the channel is the message's.
--   hours    inbound customer messages plus connected calls in the current period: 7 rows (ISO weekday, Monday
--            first) of 24 hours, in the tenant's zone.
--
-- The definitions are this function's own: backfilled messages excluded, a call that never connected is no call,
-- and "who answered, how fast" is first_replies (00035).

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
  per_day as (
    select d.day,
           (select count(*) from inbound i where i.day = d.day)                              as messages_in,
           (select count(distinct i.conversation_id) from inbound i where i.day = d.day)     as conversations,
           (select count(*) from answered a where a.day = d.day and a.who = 'ai')            as answered_ai,
           (select count(*) from answered a where a.day = d.day and a.who = 'you')           as answered_you,
           (select count(*) from answered a where a.day = d.day and a.who = 'none')          as unanswered,
           (select count(*) from out_sent o where o.day = d.day and o.sender = 'ai')         as out_ai,
           (select count(*) from out_sent o where o.day = d.day and o.sender = 'human')      as out_you,
           (select count(*) from escs e where e.day = d.day)                                 as escalations,
           (select count(*) from calls_w k where k.day = d.day)                              as calls,
           (select coalesce(round(sum(k.duration_ms) / 1000.0), 0) from calls_w k
             where k.day = d.day)                                                             as call_seconds,
           (select count(*) from fresh f where f.day = d.day)                                as new_contacts
      from days d
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

-- 00379 · Automated mail is no customer message (Reports, the Receptionist lens).
--
-- An automatic reply, a list's mail and a delivery report arrive as email from a customer's address, and the email
-- intake reads which they are (meta.email.claim: `automated`, `auto_reply`, `report`; 00299). The reports counted every
-- `sender = 'customer'` row all the same, so an out-of-office was a customer message on Overview, on Today and on the
-- Receptionist lens, and one nobody had answered. A customer message is now one whose words are a person's,
-- `message_is_a_persons_words(meta)` (00299), the rule has_relationship and people_list's last_wrote_at already read.
--
-- Three functions say "a customer message", and they must agree: answered_ai + answered_you + unanswered is the day's
-- messages_in, and Today reads what Reports reads.
--   1. first_replies   (00303): the `asks` CTE, the messages that wait for an answer.
--   2. report_series   (00360): the `inbound` CTE, the messages counted per day and channel, and the hours and quarter
--                       hours people arrive at (an automatic reply is no one arriving).
--   3. metrics_summary (00359): `messages_in`, `conversations_active` and `now.last_inbound_at`, the last because
--                       Today draws it beside messages_in ("last at 10:30, answered in N s"): on a day of nothing but
--                       an out-of-office the card would say "0 customer messages, last at 10:30".
-- Each is copied from its latest migration with that predicate added and nothing else changed; the signatures are the
-- same, so `create or replace` takes them, and the grants and the comment are said again.
--
-- What stays as it is:
--   * contact_first_moments: a person's first word in either direction, or first connected call. Whoever wrote first,
--     whatever it said, is a person we heard from; "a new person" gets its one rule in the People lens, not here.
--   * metrics_summary's `awaiting`: live state (whose turn is it), Today's own, not a count of customer messages.
--   * platform_metrics_roll's messages_in: an operator's rollup of what landed per channel; its `asks` follows
--     first_replies by itself.
--
-- Either deploy order works: no key or column changes, and the dashboard reads the same shape. Re-runnable: every
-- statement is `create or replace` or restated.

set local lock_timeout = '3s';

-- ---------------------------------------------------------------- first_replies
create or replace function public.first_replies(p_tenant_id uuid, p_start timestamptz)
returns table (
  asked_at        timestamptz,
  conversation_id uuid,
  ai_at           timestamptz,
  human_at        timestamptz,
  who             text,
  ai_seconds      numeric,
  ai_hold_s       numeric
)
language sql
stable
set search_path = public
as $$
  with real_msgs as not materialized (
    select * from messages
     where tenant_id = p_tenant_id
       and coalesce(meta->>'backfill', 'false') <> 'true'
  ),
  asks as (
    select m.created_at as asked_at, m.conversation_id
      from real_msgs m
     where m.created_at >= p_start
       and m.direction = 'inbound' and m.sender = 'customer'
       and public.message_is_a_persons_words(m.meta)
  ),
  -- when each outbound row actually LEFT: the send event for the queued path, the row itself for an immediate send
  sent as not materialized (
    select o.id, o.conversation_id, o.sender, o.created_at,
           coalesce((select min(e.created_at) from events e
                      where e.tenant_id = p_tenant_id
                        and e.kind = 'message.sent'
                        and e.subject_type = 'message'
                        and e.subject_id = o.id), o.created_at) as sent_at,
           -- the hold the owner set, as the reply was queued (draft-queue.ts); none for a reply sent at once
           case when jsonb_typeof(o.meta->'delay_ms') = 'number'
                then (o.meta->>'delay_ms')::numeric / 1000.0 else 0 end as hold_s,
           -- written as 'human' and nobody's answer (00303)
           public.automated_send(o.meta) as automated
      from real_msgs o
     where o.direction = 'outbound'
       and o.status in ('sent', 'delivered', 'read')
  ),
  firsts as (
    select a.asked_at, a.conversation_id, ai.sent_at as ai_at, ai.hold_s,
           (select min(s.sent_at) from sent s
             where s.conversation_id = a.conversation_id and s.sender = 'human' and not s.automated
               and s.created_at > a.asked_at) as human_at
      from asks a
      left join lateral (
        select s.sent_at, s.hold_s from sent s
         where s.conversation_id = a.conversation_id and s.sender = 'ai' and s.created_at > a.asked_at
         order by s.sent_at
         limit 1
      ) ai on true
  )
  select asked_at, conversation_id, ai_at, human_at,
         case when ai_at is not null and (human_at is null or ai_at <= human_at) then 'ai'
              when human_at is not null then 'you'
              else 'none' end as who,
         case when ai_at is not null and (human_at is null or ai_at <= human_at)
              then extract(epoch from (ai_at - asked_at)) end as ai_seconds,
         case when ai_at is not null and (human_at is null or ai_at <= human_at)
              then hold_s end as ai_hold_s
    from firsts
$$;

revoke all on function public.first_replies(uuid, timestamptz) from public, anon;
grant execute on function public.first_replies(uuid, timestamptz) to authenticated, service_role;

-- ---------------------------------------------------------------- report_series
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
  -- A customer message is one whose words are a person's (00379): not an automatic reply, a list's mail or a report.
  inbound as (select * from msgs where direction = 'inbound' and sender = 'customer' and public.message_is_a_persons_words(meta)),
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

-- ---------------------------------------------------------------- metrics_summary
create or replace function public.metrics_summary(p_tenant_id uuid, p_days integer default 1)
returns jsonb
language plpgsql
stable
set search_path = public
as $$
declare
  v_tz     text;
  v_name   text;
  v_status text;
  v_days   integer := greatest(coalesce(p_days, 1), 1);
  v_start  timestamptz;
  v_result jsonb;
begin
  select timezone, name, status into v_tz, v_name, v_status
    from tenants where id = p_tenant_id;
  if v_tz is null then
    return jsonb_build_object('error', 'unknown_tenant');
  end if;

  -- Tenant-local calendar days, not 24-hour multiples: the interval
  -- arithmetic this replaces shifted the window an hour across a DST change.
  v_start := ((((now() at time zone v_tz)::date) - (v_days - 1))::timestamp) at time zone v_tz;

  with
  -- everything the tenant has ever said or heard, minus the import's
  -- timestamp-less rows: they carry no true event time and can never be
  -- placed on a calendar day.
  -- NOT MATERIALIZED (00037): referenced more than once, this CTE was
  -- materialised on PG17 and the per-conversation lookup below scanned it
  -- instead of using the (conversation_id, created_at) index.
  real_msgs as not materialized (
    select * from messages
     where tenant_id = p_tenant_id
       and coalesce(meta->>'backfill', 'false') <> 'true'
  ),
  msgs as (select * from real_msgs where created_at >= v_start),
  -- an outbound message counts only once it has actually left
  out_sent as (select * from msgs where direction = 'outbound'
                 and status in ('sent', 'delivered', 'read')),
  -- ONE definition of "who answered" and "how fast", shared with
  -- report_series (00035). This function counted any later AI reply AND any
  -- later human reply, not exclusively, and timed the AI from its draft.
  replies as (select * from public.first_replies(p_tenant_id, v_start)),
  calls_win as (
    select * from calls where tenant_id = p_tenant_id and started_at >= v_start
       and public.call_connected(status, duration_ms)   -- 00304: a call someone spoke on, one rule with Reports (00303)
  ),
  -- Each person's first moment, one rule with report_series (00303): never the erased, never a person with neither.
  fresh_contacts as (
    select f.contact_id as id
      from public.contact_first_moments(p_tenant_id) f
     where f.first_at >= v_start
  ),
  -- live state: whose turn is it? the last thing said in the thread was theirs.
  awaiting as (
    select cv.id from conversations cv
     where cv.tenant_id = p_tenant_id
       and cv.state in ('open', 'needs_human')
       and (select r.sender from real_msgs r
             where r.conversation_id = cv.id
             order by r.created_at desc limit 1) = 'customer'
  )
  select jsonb_build_object(
    'workspace', jsonb_build_object(
      'name', v_name, 'timezone', v_tz, 'status', v_status),

    'channels', coalesce((
      select jsonb_agg(jsonb_build_object(
               'kind', tc.kind, 'status', tc.status, 'number', tc.number_e164)
             order by tc.kind)
        from tenant_channels tc where tc.tenant_id = p_tenant_id), '[]'::jsonb),

    'window', jsonb_build_object(
      'days', v_days,
      'since', v_start,
      'since_local', to_char(v_start at time zone v_tz, 'YYYY-MM-DD"T"HH24:MI:SS'),
      'now_local',   to_char(now()   at time zone v_tz, 'YYYY-MM-DD"T"HH24:MI:SS')),

    'now', jsonb_build_object(
      'escalations_open', (select count(*) from escalations
                            where tenant_id = p_tenant_id and state = 'open'),
      'oldest_open_escalation_at', (select min(created_at) from escalations
                                     where tenant_id = p_tenant_id and state = 'open'),
      'threads_needing_human', (select count(*) from conversations
                                 where tenant_id = p_tenant_id and state = 'needs_human'),
      'threads_snoozed', (select count(*) from conversations
                           where tenant_id = p_tenant_id and state = 'snoozed'),
      'threads_awaiting_reply', (select count(*) from awaiting),
      'last_inbound_at',  (select max(coalesce(channel_ts, created_at)) from real_msgs
                            where direction = 'inbound' and sender = 'customer'
                              and public.message_is_a_persons_words(meta)),
      'last_outbound_at', (select max(created_at) from real_msgs
                            where direction = 'outbound'
                              and status in ('sent', 'delivered', 'read'))),

    'period', jsonb_build_object(
      -- A customer message is one whose words are a person's (00379), as in report_series and first_replies.
      'messages_in',  (select count(*) from msgs where direction = 'inbound' and sender = 'customer' and public.message_is_a_persons_words(meta)),
      'messages_out_ai',  (select count(*) from out_sent where sender = 'ai'),
      'messages_out_you', (select count(*) from out_sent where sender = 'human'
                             and not public.automated_send(meta)),
      'conversations_active',
        (select count(distinct conversation_id) from msgs
          where direction = 'inbound' and sender = 'customer' and public.message_is_a_persons_words(meta)),

      'answered_by_ai',  (select count(*) from replies where who = 'ai'),
      'answered_by_you', (select count(*) from replies where who = 'you'),
      'unanswered_in_window',
        (select count(*) from replies where who = 'none'),
      'median_reply_seconds_ai',
        (select round(percentile_cont(0.5) within group (order by ai_seconds))
           from replies where who = 'ai'),

      'send_failures', (select count(*) from msgs
                         where direction = 'outbound' and status = 'failed'),

      'escalations_new', (select count(*) from escalations
                           where tenant_id = p_tenant_id and created_at >= v_start),
      'escalation_reasons',
        coalesce((select jsonb_object_agg(reason, n) from (
          select reason, count(*) as n from escalations
           where tenant_id = p_tenant_id and state = 'open'
           group by reason) r), '{}'::jsonb),

      'calls',        (select count(*) from calls_win),
      'call_seconds', (select coalesce(round(sum(duration_ms) / 1000.0), 0) from calls_win),
      'call_sentiments',
        coalesce((select jsonb_object_agg(coalesce(sentiment, 'Unknown'), n) from (
          select sentiment, count(*) as n from calls_win group by sentiment) s), '{}'::jsonb),
      'calls_voicemail', (select count(*) from calls_win where in_voicemail),

      'new_contacts', (select count(*) from fresh_contacts)),

    -- The day's replies the receptionist answered, each with the seconds it took and the seconds it was held, whole as
    -- report_series rounds them: what Today's sentence about speed is counted from (contracts holdOf). They are the
    -- rows this function already read to count who answered; the page asked first_replies for them a second time.
    -- A day only: a longer window's replies are Reports', and null says this answer carries none.
    'replies', case when v_days = 1 then coalesce((
      select jsonb_agg(jsonb_build_object(
               'asked_at', r.asked_at,
               's', round(r.ai_seconds),
               'hold', round(coalesce(r.ai_hold_s, 0)))
             order by r.asked_at)
        from replies r
       where r.ai_seconds is not null), '[]'::jsonb) end
  ) into v_result;

  return v_result;
end $$;

revoke all on function public.metrics_summary(uuid, integer) from public, anon;
grant execute on function public.metrics_summary(uuid, integer) to authenticated, service_role;

-- Hygiene, from the Tier 1 review: F44 column-scoped UPDATE grants, F48 the
-- people list and the two metrics functions reading fewer rows.
--
-- The three functions are re-created VERBATIM from their latest definitions
-- (people_list from 00031, metrics_summary and report_series from 00035) with
-- one substitution each, marked ADDED/NOT MATERIALIZED (00037) inline.
--
-- people_list: opening ONE person's profile materialised every message the
-- tenant ever exchanged, because the p_contact_id filter sat only on the
-- outer select. The message CTE now carries it too.
--
-- metrics_summary / report_series: `real_msgs` is referenced more than once,
-- which PG12+ materialises by default; the per-conversation subquery then
-- scanned the whole materialised set instead of using the conversation
-- index. NOT MATERIALIZED lets the planner push the predicate down.

-- ------------------------------------------------------------------ F48
create or replace function public.people_list(p_tenant_id uuid, p_contact_id uuid default null)
returns table (
  id                      uuid,
  display_name            text,
  wa_profile_name         text,
  phone_e164              text,
  consent                 text,
  consent_source          text,
  consent_updated_at      timestamptz,
  dnc                     boolean,
  channels                text[],
  conversation_count      integer,
  escalation_count        integer,
  needs_human             boolean,
  open_escalation_reason  text,
  open_escalation_since   timestamptz,
  latest_conversation_id  uuid,
  latest_state            text,
  latest_paused_until     timestamptz,
  latest_assignee_user_id uuid,
  latest_snooze_until     timestamptz,
  latest_wa_inbound_at    timestamptz,
  last_message_at         timestamptz,
  last_message_direction  text,
  last_message_sender     text,
  last_inbound_text       text,
  last_inbound_at         timestamptz,
  last_call_at            timestamptz,
  call_count              integer,
  call_seconds            integer,
  first_contact_at        timestamptz,
  earliest_row_at         timestamptz,
  has_backfill            boolean,
  has_chat                boolean,
  queued_reply_at         timestamptz
)
language sql
stable
set search_path = public
as $$
  with ev as (
    select m.contact_id, m.direction, m.sender, m.type, m.body, m.status, m.created_at,
           case when coalesce(m.meta->>'backfill', 'false') = 'true'
                then m.channel_ts
                else coalesce(m.channel_ts, m.created_at) end as at,
           coalesce(m.meta->>'backfill', 'false') = 'true' as backfill,
           -- Something the customer actually saw or said. A reply still in its
           -- cancel window, a canceled or failed send, an internal note and a
           -- call's own summary row are not "the last word" in the thread.
           m.type in ('text', 'template', 'media')
             and m.status not in ('queued', 'canceled', 'failed') as spoken
      from messages m
     where m.tenant_id = p_tenant_id
       and m.contact_id is not null
       -- ADDED (00037): one person's profile reads one person's rows. The
       -- filter used to sit only on the outer select, so opening a single
       -- profile materialised every message the tenant ever exchanged.
       and (p_contact_id is null or m.contact_id = p_contact_id)
  )
  select
    c.id, c.display_name, c.wa_profile_name, c.phone_e164,
    c.consent, c.consent_source, c.consent_updated_at, c.dnc,
    coalesce(ids.channels, '{}'::text[]),
    coalesce(cvs.n, 0),
    coalesce(esc.n, 0),
    coalesce(cvs.needs_human, false),
    oe.reason,
    oe.created_at,
    lc.id, lc.state, lc.paused_until, lc.assignee_user_id, lc.snooze_until, lc.last_wa_inbound_at,
    lm.at, lm.direction, lm.sender,
    li.body, li.at,
    lk.last_at,
    coalesce(lk.n, 0),
    coalesce(lk.seconds, 0),
    least(ma.first_at, lk.first_at),
    least(ma.first_row_at, lk.first_row_at),
    coalesce(ma.has_backfill, false),
    coalesce(ma.has_chat, false),
    ma.queued_at
  from contacts c
  left join lateral (
    select array_agg(distinct ci.channel order by ci.channel) as channels
      from contact_identities ci where ci.contact_id = c.id
  ) ids on true
  left join lateral (
    select count(*)::int as n, bool_or(cv.state = 'needs_human') as needs_human
      from conversations cv where cv.contact_id = c.id
  ) cvs on true
  left join lateral (
    select count(*)::int as n
      from escalations e join conversations cv on cv.id = e.conversation_id
     where cv.contact_id = c.id
  ) esc on true
  left join lateral (
    select e.reason, e.created_at
      from escalations e join conversations cv on cv.id = e.conversation_id
     where cv.contact_id = c.id and e.state = 'open'
     order by e.created_at desc
     limit 1
  ) oe on true
  left join lateral (
    select cv.id, cv.state, cv.paused_until, cv.assignee_user_id, cv.snooze_until, cv.last_wa_inbound_at
      from conversations cv
     where cv.contact_id = c.id
     order by cv.last_message_at desc nulls last, cv.created_at desc
     limit 1
  ) lc on true
  left join lateral (
    select e.at, e.direction, e.sender
      from ev e
     where e.contact_id = c.id and e.at is not null and e.spoken
     order by e.at desc
     limit 1
  ) lm on true
  left join lateral (
    select e.at, e.body
      from ev e
     where e.contact_id = c.id and e.at is not null
       and e.direction = 'inbound' and e.spoken and e.body is not null
     order by e.at desc
     limit 1
  ) li on true
  left join lateral (
    select min(e.at) filter (where e.spoken) as first_at,
           min(e.created_at) as first_row_at,
           bool_or(e.backfill) as has_backfill,
           bool_or(e.type in ('text', 'template', 'media')) as has_chat,
           max(e.created_at) filter (where e.direction = 'outbound' and e.status = 'queued') as queued_at
      from ev e where e.contact_id = c.id
  ) ma on true
  left join lateral (
    select count(*)::int as n,
           (coalesce(sum(k.duration_ms), 0) / 1000)::int as seconds,
           max(k.started_at) as last_at,
           min(k.started_at) as first_at,
           min(k.created_at) as first_row_at
      from calls k where k.contact_id = c.id
       and k.status <> 'not_connected'   -- ADDED (00031): never connected, never phoned
  ) lk on true
  where c.tenant_id = p_tenant_id
    and c.erased_at is null
    and c.merged_into_contact_id is null
    and (p_contact_id is null or c.id = p_contact_id)
  order by greatest(lm.at, lk.last_at) desc nulls last, c.created_at desc
  limit 1000
$$;

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
       and status <> 'not_connected'   -- ADDED (00031): a dial that never connected is not a call
  ),
  fresh_contacts as (
    select c.id from contacts c
     where c.tenant_id = p_tenant_id
       -- ADDED (00026): an erased contact has no messages and no calls, so it
       -- scores 'infinity' below and would be counted as new in every window
       -- from now on. A deletion must never be reported as growth.
       and c.erased_at is null
       and not exists (select 1 from messages b
                        where b.contact_id = c.id
                          and coalesce(b.meta->>'backfill', 'false') = 'true')
       and least(
             coalesce((select min(m.channel_ts) from messages m where m.contact_id = c.id),
                      'infinity'::timestamptz),
             coalesce((select min(k.started_at) from calls k
                        where k.contact_id = c.id and k.status <> 'not_connected'),   -- ADDED (00031)
                      'infinity'::timestamptz)
           ) >= v_start
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
                            where direction = 'inbound' and sender = 'customer'),
      'last_outbound_at', (select max(created_at) from real_msgs
                            where direction = 'outbound'
                              and status in ('sent', 'delivered', 'read'))),

    'period', jsonb_build_object(
      'messages_in',  (select count(*) from msgs where direction = 'inbound' and sender = 'customer'),
      'messages_out_ai',  (select count(*) from out_sent where sender = 'ai'),
      'messages_out_you', (select count(*) from out_sent where sender = 'human'),
      'conversations_active',
        (select count(distinct conversation_id) from msgs
          where direction = 'inbound' and sender = 'customer'),

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

      'new_contacts', (select count(*) from fresh_contacts))
  ) into v_result;

  return v_result;
end $$;

revoke all on function public.metrics_summary(uuid, integer) from public, anon;
grant execute on function public.metrics_summary(uuid, integer) to authenticated;

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
  -- ONE definition of "who answered" and "how fast", shared with
  -- metrics_summary (00035).
  answered as (
    select r.*, (r.asked_at at time zone v_tz)::date as day
      from public.first_replies(p_tenant_id, v_start) r
  ),
  calls_w as (
    select k.*, (k.started_at at time zone v_tz)::date as day
      from calls k
     where k.tenant_id = p_tenant_id and k.started_at >= v_start
       and k.status <> 'not_connected'   -- ADDED (00031)
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
                        where k.contact_id = c.id and k.status <> 'not_connected'),   -- ADDED (00031)
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
    'voicemail', (select count(*) from calls_w where day > v_today - v_days and in_voicemail)
  ) into v_result;

  return v_result;
end $$;

revoke all on function public.report_series(uuid, integer) from public, anon;
grant execute on function public.report_series(uuid, integer) to authenticated;

-- ------------------------------------------------------------------ F44
-- Column-scoped UPDATE for the session role.
--
-- The member UPDATE policies (00014) are row-scoped: a signed-in operator
-- could rewrite an inbound message's body, a conversation's contact, an
-- escalation's reason, straight through PostgREST. RLS is the row floor;
-- these grants are the column door. The lists are exactly the columns the
-- dashboard's verbs set — take-over, hand-back, snooze, wake, archive, reply,
-- cancel-send, resolve — and nothing else. The service role bypasses them,
-- as it bypasses RLS; the edge and the jobs are unchanged.
revoke update on public.conversations from authenticated, anon;
grant update (state, paused_until, snooze_until, assignee_user_id, last_message_at)
  on public.conversations to authenticated;

revoke update on public.messages from authenticated, anon;
grant update (status, error) on public.messages to authenticated;

revoke update on public.escalations from authenticated, anon;
grant update (state, resolved_by_user_id, decision_id) on public.escalations to authenticated;

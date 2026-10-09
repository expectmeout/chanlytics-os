-- 00359 · The day's replies ride with the day's numbers.
--
-- Today's read computed who answered first twice. metrics_summary reads first_replies (00303) to count who answered
-- and how fast, and answers the median; the median of a held reply is the hold, so the page's sentence about speed
-- needs each reply's seconds and hold, and the server asked first_replies for them again, beside the function, on
-- every read of Today and every refresh of it (server/metrics/metrics.ts). Read on production on 9 October 2026
-- (pg_stat_statements): 4,257 calls of this function and 4,254 of that one, the two heaviest the dashboard makes for
-- each call, 196 ms and 139 ms in the database on average over workspaces whose largest holds 111 messages. The cost
-- is the planning of two large statements under row security, not the rows.
--
-- So the function answers the rows it already read: `replies`, for a window of one day, each reply the receptionist
-- answered with the moment it was asked, its seconds and its hold, rounded as report_series rounds them (00304), in
-- the order they were asked. Null for a longer window, whose replies are Reports'. The function is copied from its
-- latest migration (00304) with that key alone added; only the body changes, so `create or replace` takes it and the
-- grants stand; they are restated.
--
-- Either deploy order works. A dashboard that does not know the key ignores it, as it ignores any key of the answer
-- it does not read; one that knows it and meets a database without it asks first_replies as it always did.

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
                            where direction = 'inbound' and sender = 'customer'),
      'last_outbound_at', (select max(created_at) from real_msgs
                            where direction = 'outbound'
                              and status in ('sent', 'delivered', 'read'))),

    'period', jsonb_build_object(
      'messages_in',  (select count(*) from msgs where direction = 'inbound' and sender = 'customer'),
      'messages_out_ai',  (select count(*) from out_sent where sender = 'ai'),
      'messages_out_you', (select count(*) from out_sent where sender = 'human'
                             and not public.automated_send(meta)),
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
grant execute on function public.metrics_summary(uuid, integer) to authenticated;

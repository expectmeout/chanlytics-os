-- 00254 · A person who has never written or phoned is not new.
--
-- metrics_summary counts as new a person whose first word or call falls in the
-- window: the earliest of their messages' provider times and their connected
-- calls' starts (00037, fresh_contacts). A person with neither scored
-- 'infinity', which is after every window's start, so they were new in every
-- window. 00026 kept the erased out for that reason; the doors that add a
-- person before they say a word came later (the calendar, a lead and by hand,
-- 00138; an import, 00170). So a workspace that imported five hundred people
-- was told on Today, every day, that five hundred more people were new, and the
-- list its figure opens, People's New this week, never had them. Reports' own
-- count of the new already passes over them (report_series, 00139 :96).
--
-- A person with neither now has no first moment, and no window holds it.
-- Everyone else is counted as before. The function is copied as 00037 has it
-- with only that change, and the erased row's comment says what it still does.
-- Only the body changes, so `create or replace` takes it and the grants stand;
-- they are restated so this file reads on its own.

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
       -- ADDED (00026): a deletion must never be reported as growth.
       and c.erased_at is null
       and not exists (select 1 from messages b
                        where b.contact_id = c.id
                          and coalesce(b.meta->>'backfill', 'false') = 'true')
       -- Their first word or call, whichever came first: least() passes over
       -- the one they never had. A person with neither has no first moment, so
       -- no window holds it (00254); they scored 'infinity' and were new in
       -- every window.
       and least(
             (select min(m.channel_ts) from messages m where m.contact_id = c.id),
             (select min(k.started_at) from calls k
               where k.contact_id = c.id and k.status <> 'not_connected')   -- ADDED (00031)
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

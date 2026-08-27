-- Slice 4 — the final shape of metrics_summary, and the last replace of it.
--
-- Three corrections over 0010, each one a thing the live pilot data proved wrong:
--
-- 1. A CANCELED send counted as a message you sent. The pilot has exactly one
--    outbound/human/canceled row — the 15s cancel window doing its job — and it
--    was being reported as a reply that went out. Only 'sent'/'delivered'/'read'
--    ever count as having left the building; 'queued' has not gone yet, and
--    'canceled'/'failed' never will.
-- 2. A backfilled row could be credited as the ANSWER to a real message. The
--    import wrote five rows one second apart, so any latency they touch is
--    fiction — they are now excluded from both sides of the reply-time lateral,
--    not just the inbound side.
-- 3. The payload gained what the brief actually needs to speak honestly:
--    workspace identity and status, channel connection state (a quiet morning
--    and a disconnected number produce identical zeros and must never read the
--    same), the oldest open escalation, and last inbound/outbound so a day with
--    no traffic can still prove the line is being listened to.

create or replace function public.metrics_summary(p_tenant_id uuid, p_days integer default 1)
returns jsonb
language plpgsql
stable
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

  v_start := (date_trunc('day', now() at time zone v_tz) at time zone v_tz)
             - make_interval(days => v_days - 1);

  with
  -- everything the tenant has ever said or heard, minus the import's
  -- timestamp-less rows: they carry no true event time and can never be
  -- placed on a calendar day.
  real_msgs as (
    select * from messages
     where tenant_id = p_tenant_id
       and coalesce(meta->>'backfill', 'false') <> 'true'
  ),
  msgs as (select * from real_msgs where created_at >= v_start),
  -- an outbound message counts only once it has actually left
  out_sent as (select * from msgs where direction = 'outbound'
                 and status in ('sent', 'delivered', 'read')),
  replies as (
    select m.created_at as asked_at, m.conversation_id,
           (select min(o.created_at) from real_msgs o
             where o.conversation_id = m.conversation_id
               and o.direction = 'outbound'
               and o.sender = 'ai'
               and o.status in ('sent', 'delivered', 'read')
               and o.created_at > m.created_at) as ai_at,
           (select min(o.created_at) from real_msgs o
             where o.conversation_id = m.conversation_id
               and o.direction = 'outbound'
               and o.sender = 'human'
               and o.status in ('sent', 'delivered', 'read')
               and o.created_at > m.created_at) as human_at
      from msgs m
     where m.direction = 'inbound' and m.sender = 'customer'
  ),
  calls_win as (
    select * from calls where tenant_id = p_tenant_id and started_at >= v_start
  ),
  fresh_contacts as (
    select c.id from contacts c
     where c.tenant_id = p_tenant_id
       and not exists (select 1 from messages b
                        where b.contact_id = c.id
                          and coalesce(b.meta->>'backfill', 'false') = 'true')
       and least(
             coalesce((select min(m.channel_ts) from messages m where m.contact_id = c.id),
                      'infinity'::timestamptz),
             coalesce((select min(k.started_at) from calls k where k.contact_id = c.id),
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

      'answered_by_ai',  (select count(*) from replies where ai_at is not null),
      'answered_by_you', (select count(*) from replies where human_at is not null),
      'unanswered_in_window',
        (select count(*) from replies where ai_at is null and human_at is null),
      'median_reply_seconds_ai',
        (select round(percentile_cont(0.5) within group (
                  order by extract(epoch from (ai_at - asked_at))))
           from replies where ai_at is not null),

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

grant execute on function public.metrics_summary(uuid, integer) to authenticated;

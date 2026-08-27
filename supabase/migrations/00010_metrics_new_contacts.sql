-- Slice 4 fix (caught by running 0009 against live data the same day the
-- backfills ran): "2 new customers today" was fiction.
--
-- contacts.first_seen_at is the moment the ROW was created, which for every
-- imported contact is the moment the backfill ran — not the moment we actually
-- met them. Both pilot contacts therefore looked brand new today; one of them
-- has been messaging the salon for weeks, the other called yesterday evening.
--
-- A contact is "new in the window" only when we hold EVIDENCE their first
-- activity falls inside it:
--   * any backfilled message => pre-existing, full stop. The Blob history the
--     import came from stored role/content only, so those rows have no true
--     timestamp and can never prove a first-contact date.
--   * otherwise the earliest real event time — a message's channel_ts (the
--     provider's own clock) or a call's started_at.
-- No evidence, no claim. Better to under-count than to invent a customer.
--
-- Also drops human_replies_by_you, which was messages_out_human by another name.

create or replace function public.metrics_summary(p_tenant_id uuid, p_days integer default 1)
returns jsonb
language plpgsql
stable
as $$
declare
  v_tz     text;
  v_start  timestamptz;
  v_result jsonb;
begin
  select timezone into v_tz from tenants where id = p_tenant_id;
  if v_tz is null then
    return jsonb_build_object('error', 'unknown_tenant');
  end if;

  v_start := (date_trunc('day', now() at time zone v_tz) at time zone v_tz)
             - make_interval(days => greatest(p_days, 1) - 1);

  with msgs as (
    select * from messages
     where tenant_id = p_tenant_id
       and created_at >= v_start
       and coalesce(meta->>'backfill', 'false') <> 'true'
  ),
  replies as (
    select m.created_at as asked_at,
           (select min(o.created_at) from messages o
             where o.conversation_id = m.conversation_id
               and o.direction = 'outbound'
               and o.sender = 'ai'
               and o.created_at > m.created_at) as answered_at
      from msgs m
     where m.direction = 'inbound' and m.sender = 'customer'
  ),
  calls_win as (
    select * from calls
     where tenant_id = p_tenant_id
       and started_at >= v_start
  ),
  fresh_contacts as (
    select c.id
      from contacts c
     where c.tenant_id = p_tenant_id
       and not exists (
         select 1 from messages b
          where b.contact_id = c.id
            and coalesce(b.meta->>'backfill', 'false') = 'true')
       and least(
             coalesce((select min(m.channel_ts) from messages m where m.contact_id = c.id),
                      'infinity'::timestamptz),
             coalesce((select min(k.started_at) from calls k where k.contact_id = c.id),
                      'infinity'::timestamptz)
           ) >= v_start
  )
  select jsonb_build_object(
    'window_days', greatest(p_days, 1),
    'since', v_start,
    'timezone', v_tz,

    'messages_in',        (select count(*) from msgs where direction = 'inbound' and sender = 'customer'),
    'messages_out_ai',    (select count(*) from msgs where sender = 'ai'),
    'messages_out_human', (select count(*) from msgs where sender = 'human'),
    'conversations_active',
      (select count(distinct conversation_id) from msgs where direction = 'inbound' and sender = 'customer'),

    'median_reply_seconds',
      (select round(percentile_cont(0.5) within group (
                order by extract(epoch from (answered_at - asked_at))))
         from replies where answered_at is not null),
    'answered_by_ai',   (select count(*) from replies where answered_at is not null),
    'awaiting_reply',   (select count(*) from replies where answered_at is null),

    'escalations_open',  (select count(*) from escalations
                           where tenant_id = p_tenant_id and state = 'open'),
    'escalations_new',   (select count(*) from escalations
                           where tenant_id = p_tenant_id and created_at >= v_start),
    'escalation_reasons',
      coalesce((select jsonb_object_agg(reason, n) from (
        select reason, count(*) as n from escalations
         where tenant_id = p_tenant_id and state = 'open'
         group by reason) r), '{}'::jsonb),

    'calls',           (select count(*) from calls_win),
    'call_seconds',    (select coalesce(round(sum(duration_ms) / 1000.0), 0) from calls_win),
    'call_sentiments',
      coalesce((select jsonb_object_agg(coalesce(sentiment, 'Unknown'), n) from (
        select sentiment, count(*) as n from calls_win group by sentiment) s), '{}'::jsonb),
    'calls_voicemail', (select count(*) from calls_win where in_voicemail),

    'new_contacts',    (select count(*) from fresh_contacts),

    'threads_needing_human',
      (select count(*) from conversations
        where tenant_id = p_tenant_id and state = 'needs_human'),
    'threads_snoozed',
      (select count(*) from conversations
        where tenant_id = p_tenant_id and state = 'snoozed')
  ) into v_result;

  return v_result;
end $$;

grant execute on function public.metrics_summary(uuid, integer) to authenticated;

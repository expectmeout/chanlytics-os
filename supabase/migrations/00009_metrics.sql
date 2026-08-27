-- Slice 4 / migration 0009 — the numbers behind the morning brief.
--
-- SECURITY INVOKER (the default) is deliberate: every inner select runs as the
-- calling session, so the existing RLS policies do the tenant scoping. No
-- SECURITY DEFINER, no membership re-check to get wrong, and the smoke-test
-- tenant is invisible because nobody is a member of it.
--
-- "Today" is the TENANT's day (tenants.timezone, IANA) — a US salon's day must
-- not roll over at 8pm because the database thinks in UTC.
--
-- Backfilled rows are excluded from activity counts: their created_at was
-- synthesized during the Blob import, so counting them as "today" would invent
-- traffic that never happened.

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
  -- how fast the receptionist answers: per inbound, the gap to the next
  -- outbound in the same conversation
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
  calls_today as (
    select * from calls
     where tenant_id = p_tenant_id
       and started_at >= v_start
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

    'calls',           (select count(*) from calls_today),
    'call_seconds',    (select coalesce(round(sum(duration_ms) / 1000.0), 0) from calls_today),
    'call_sentiments',
      coalesce((select jsonb_object_agg(coalesce(sentiment, 'Unknown'), n) from (
        select sentiment, count(*) as n from calls_today group by sentiment) s), '{}'::jsonb),
    'calls_voicemail', (select count(*) from calls_today where in_voicemail),

    'new_contacts',    (select count(*) from contacts
                          where tenant_id = p_tenant_id and first_seen_at >= v_start),
    'human_replies_by_you',
      (select count(*) from msgs where sender = 'human' and sent_by is not null),

    -- live state, not a window: what is on the operator's plate right now
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

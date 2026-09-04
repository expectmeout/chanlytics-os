-- 00030 Reports: the receptionist's numbers, day by day.
--
-- SECURITY INVOKER like metrics_summary, so RLS scopes every inner select to
-- the caller's workspaces. The same rules as the Today metrics, kept in the
-- tenant's own time zone:
--   * rows imported without a timestamp are on no calendar day;
--   * an outbound message counts once it has actually left;
--   * "answered by" is whoever replied FIRST after each customer message;
--   * a person is new only by evidence (no imported history).
-- Returns twice the requested days so the client can compare this period with
-- the one before it without a second call. Raw reply latencies for the current
-- period travel as an array: the median, the tail and the buckets are computed
-- where they are tested.

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
  real_msgs as (
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
  replies as (
    select m.day, m.created_at as asked_at,
           (select min(o.created_at) from real_msgs o
             where o.conversation_id = m.conversation_id
               and o.direction = 'outbound' and o.sender = 'ai'
               and o.status in ('sent', 'delivered', 'read')
               and o.created_at > m.created_at) as ai_at,
           (select min(o.created_at) from real_msgs o
             where o.conversation_id = m.conversation_id
               and o.direction = 'outbound' and o.sender = 'human'
               and o.status in ('sent', 'delivered', 'read')
               and o.created_at > m.created_at) as human_at
      from inbound m
  ),
  answered as (
    select day, asked_at,
           case when ai_at is not null and (human_at is null or ai_at <= human_at) then 'ai'
                when human_at is not null then 'you'
                else 'none' end as who,
           case when ai_at is not null then extract(epoch from (ai_at - asked_at)) end as ai_seconds
      from replies
  ),
  calls_w as (
    select k.*, (k.started_at at time zone v_tz)::date as day
      from calls k
     where k.tenant_id = p_tenant_id and k.started_at >= v_start
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
             coalesce((select min(k.started_at) from calls k where k.contact_id = c.id),
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

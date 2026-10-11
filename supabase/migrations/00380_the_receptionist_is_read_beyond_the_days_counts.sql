-- 00380 · The receptionist is read beyond the days' counts (Reports, the Receptionist lens).
--
-- report_series (00304, 00360, 00379) says what the receptionist did day by day: who answered, how fast, the calls. The
-- Receptionist lens asks what that does not: what became of the replies it held back, what customers asked about and in
-- which language, the replies the door refused, how the calls ended, how long a handover took, the calls nobody took and
-- whether anyone answered within an hour, when people write by the workspace's own clock, the booking links sent, and what
-- is stuck now. This is the lens's own read, `receptionist_series(p_tenant_id, p_days, p_end)`: one statement, under the
-- caller's RLS (SECURITY INVOKER), over the window report_series reads (00360: `p_end` is its last day, null is today, a
-- day that has not come is today) and, for the parts that are set against before, the same number of days before it.
--
--   hold         The receptionist's drafts of the window (outbound `ai` rows whose meta.source is `veto_window` or
--                `low_confidence`, queueDraft in apps/edge/lib/receptionist/draft-queue.ts) by what became of each, from the
--                row's status and error: sent (sent, delivered, read), waiting (queued), and for canceled: canceled (the
--                owner's own, no error: cancel-send.ts), steered (error.reason `steered`: the rewrite is a NEW row with
--                meta.source `steered`, the continuation, so it is not counted again), overtaken
--                (`superseded_by_newer_message`, 00284, 00362), person_first (`superseded_by_human`, verbs.ts, ingest.ts and
--                the door's refusal in deliver.ts). Anything else, a failure or a refusal, is `other`. `low_confidence` counts
--                the drafts held for the owner's look across outcomes. There is no "sooner" bucket: no "send now" exists.
--   topics       Inbound customer messages on WhatsApp or SMS whose words are a person's (message_is_a_persons_words, 00299),
--                and the intent the receptionist stamped on those it read (message_stamp_handled, 00305). Email is in
--                neither: it carries no stamp, so a count over it would only grow `of`.
--   languages    The receptionist's replies that left, and the language each says it was written in (BrainMeta.language).
--   blocked      The replies the send door refused (`message.send_blocked`, deliver.ts) with purpose `conversational`, by
--                reason, leaving out `superseded_by_human`: the hold counts that one.
--   call_endings Connected calls of the window (call_connected, 00303) by why they ended; none recorded is `unknown`.
--   handover     Escalations created in the period whose reason is not `opt_out` or `callback` (there is nothing to send, or
--                the answer is a phone call): the seconds to the first message a person sent in that thread that has left
--                (not an automated send: automated_send, 00303), and to the escalation's resolution (K4, 00308: a null
--                `resolved_at` is unknown, never counted). Medians are whole seconds.
--   missed       Inbound calls of the period that never connected, or reached voicemail (the three signals contracts'
--                reachedVoicemail reads: `in_voicemail`, `disconnection_reason = voicemail_reached`, `outcome = voicemail`;
--                restated here once and held to it by the test), by PERSON at their first such call; the calls with no person
--                are `unknown`. A person is `touched` when the business reached them within an hour: an outbound message that
--                left (a campaign's text-back is the business answering), or a connected call that is not a voicemail, begins
--                within `v_touch` after the missed call. `pending` is a person whose hour has not passed: in neither `n` nor
--                `touched`, as the answer is not known yet.
--   after_hours  Every customer message of the window (the rows of first_replies, so only a person's words) by the local day
--                and quarter hour it came in, and how many the receptionist answered first. The page says which of these
--                came while the business was closed: it holds the hours, this does not.
--   links        The people sent the booking link in the window: a call with outcome `booking_link_sent` (inbound) or a
--                `booking_link.sent` event (00313) on a message to them, one row per person at their first link.
--   stuck        The open escalations as of now, not the window's, with the thread's state, pause and assignee; the reader
--                decides who is waiting (standingOfThread), so the rule has one spelling.
--
-- Every scan is bounded by the window (and by the period before where it is read), but four, which read past its last
-- instant on purpose: `stuck` (open escalations now, at most 500); the touch check (a text-back or a call after the window
-- still answers a miss inside it, and it is bounded by the missed people); the handover's first reply (a person's reply to an
-- escalation may come after the window, and it is bounded by the escalations); and first_replies (who answered a customer
-- message, which report_series reads the same way, and whose later rows are dropped here). Either deploy order works: the
-- dashboard answers "no read yet" in words until this is applied (isMissingDoor), and nothing else reads the function.
-- Re-runnable: `create or replace`, the grants and the comment said again.

set local lock_timeout = '3s';

create or replace function public.receptionist_series(p_tenant_id uuid, p_days integer default 30, p_end date default null)
returns jsonb
language plpgsql
stable
set search_path = public
as $$
declare
  v_tz     text;
  v_days   integer := least(greatest(coalesce(p_days, 30), 1), 90);
  v_today  date;
  v_end    date;          -- the window's last day: today, or the earlier day a member picked (00360)
  v_start  timestamptz;   -- the window's first instant
  v_prior  timestamptz;   -- the period before's first instant
  v_stop   timestamptz;   -- the midnight after the window's last day, in the zone
  -- How long the business has to reach a person who rang and found nobody. Contracts says it as "an hour"
  -- (MISSED_CALL_TOUCH_WORDS); the database test holds the two together at 3,599 and 3,601 seconds.
  v_touch  constant interval := interval '1 hour';
  v_result jsonb;
begin
  select timezone into v_tz from tenants where id = p_tenant_id;
  if v_tz is null then
    return jsonb_build_object('error', 'unknown_tenant');
  end if;

  v_today := (now() at time zone v_tz)::date;
  v_end   := least(coalesce(p_end, v_today), v_today);
  v_start := ((v_end - (v_days - 1))::timestamp) at time zone v_tz;
  v_prior := ((v_end - (v_days * 2 - 1))::timestamp) at time zone v_tz;
  v_stop  := ((v_end + 1)::timestamp) at time zone v_tz;

  with
  -- The window and the one before it, as periods: every part that is set against before reads both through this.
  periods(is_now) as (values (true), (false)),
  -- NOT MATERIALIZED (00037): same reason as in report_series.
  real_msgs as not materialized (
    select * from messages
     where tenant_id = p_tenant_id
       and coalesce(meta->>'backfill', 'false') <> 'true'
  ),

  -- ---------------------------------------------------------------- hold
  held as (
    select (m.created_at >= v_start) as is_now,
           (m.meta->>'source' = 'low_confidence') as unsure,
           case
             when m.status in ('sent', 'delivered', 'read') then 'sent'
             when m.status = 'queued' then 'waiting'
             when m.status = 'canceled' then
               case
                 when m.error is null or jsonb_typeof(m.error) = 'null' then 'canceled'
                 when m.error->>'reason' = 'steered' then 'steered'
                 when m.error->>'reason' = 'superseded_by_newer_message' then 'overtaken'
                 when m.error->>'reason' = 'superseded_by_human' then 'person_first'
                 else 'other'
               end
             else 'other'
           end as outcome
      from real_msgs m
     where m.created_at >= v_prior and m.created_at < v_stop
       and m.direction = 'outbound' and m.sender = 'ai'
       and m.meta->>'source' in ('veto_window', 'low_confidence')
  ),
  hold_stats as (
    select p.is_now,
           count(h.outcome)                                  as total,
           count(*) filter (where h.outcome = 'sent')         as sent,
           count(*) filter (where h.outcome = 'canceled')     as canceled,
           count(*) filter (where h.outcome = 'steered')      as steered,
           count(*) filter (where h.outcome = 'overtaken')    as overtaken,
           count(*) filter (where h.outcome = 'person_first') as person_first,
           count(*) filter (where h.outcome = 'waiting')      as waiting,
           count(*) filter (where h.outcome = 'other')        as other,
           count(*) filter (where h.unsure)                   as low_confidence
      from periods p
      left join held h on h.is_now = p.is_now
     group by p.is_now
  ),

  -- ---------------------------------------------------------------- topics and languages (the window alone)
  topic_msgs as (
    select nullif(btrim(m.meta->>'intent'), '') as intent
      from real_msgs m
     where m.created_at >= v_start and m.created_at < v_stop
       and m.direction = 'inbound' and m.sender = 'customer'
       and m.channel in ('whatsapp', 'sms')
       and public.message_is_a_persons_words(m.meta)
  ),
  lang_msgs as (
    select nullif(btrim(m.meta->>'language'), '') as lang
      from real_msgs m
     where m.created_at >= v_start and m.created_at < v_stop
       and m.direction = 'outbound' and m.sender = 'ai'
       and m.status in ('sent', 'delivered', 'read')
  ),

  -- ---------------------------------------------------------------- blocked and call endings (the window alone)
  blocked as (
    select coalesce(nullif(e.data->>'reason', ''), 'unknown') as reason
      from events e
     where e.tenant_id = p_tenant_id and e.kind = 'message.send_blocked'
       and e.created_at >= v_start and e.created_at < v_stop
       and e.data->>'purpose' = 'conversational'
       and coalesce(e.data->>'reason', '') <> 'superseded_by_human'
  ),
  call_ends as (
    select coalesce(k.disconnection_reason, 'unknown') as reason
      from calls k
     where k.tenant_id = p_tenant_id and k.started_at >= v_start and k.started_at < v_stop
       and public.call_connected(k.status, k.duration_ms)
  ),

  -- ---------------------------------------------------------------- handover
  esc as (
    select e.id, e.created_at, e.resolved_at, (e.created_at >= v_start) as is_now,
           -- the first message a person sent in the thread after it, that has left
           (select min(o.created_at) from real_msgs o
             where o.conversation_id = e.conversation_id
               and o.direction = 'outbound' and o.sender = 'human'
               and o.status in ('sent', 'delivered', 'read')
               and not public.automated_send(o.meta)
               and o.created_at > e.created_at) as first_reply_at
      from escalations e
     where e.tenant_id = p_tenant_id and e.created_at >= v_prior and e.created_at < v_stop
       and e.reason not in ('opt_out', 'callback')
  ),
  esc_stats as (
    select p.is_now,
           count(e.id) as n,
           count(e.first_reply_at) as replied_n,
           round(percentile_cont(0.5) within group (order by extract(epoch from (e.first_reply_at - e.created_at)))) as replied_s,
           count(e.id) filter (where e.resolved_at >= e.created_at) as settled_n,
           round(percentile_cont(0.5) within group (order by extract(epoch from (e.resolved_at - e.created_at)))
                 filter (where e.resolved_at >= e.created_at)) as settled_s
      from periods p
      left join esc e on e.is_now = p.is_now
     group by p.is_now
  ),

  -- ---------------------------------------------------------------- missed
  -- This tenant's calls from the period before's first instant, with no upper bound: a text-back after the window is seen.
  calls_all as not materialized (
    select k.contact_id, k.started_at, k.direction, k.status,
           public.call_connected(k.status, k.duration_ms) as connected,
           -- contracts reachedVoicemail, restated once
           (coalesce(k.in_voicemail, false)
            or coalesce(k.disconnection_reason, '') = 'voicemail_reached'
            or coalesce(k.outcome, '') = 'voicemail') as voicemail
      from calls k
     where k.tenant_id = p_tenant_id and k.started_at >= v_prior
  ),
  missed_calls as (
    select c.contact_id, c.started_at, (c.started_at >= v_start) as is_now
      from calls_all c
     where c.started_at < v_stop and c.direction <> 'outbound'
       and (c.status = 'not_connected' or (c.connected and c.voicemail))
  ),
  people_missed as (
    select m.contact_id, m.is_now, min(m.started_at) as called_at
      from missed_calls m
     where m.contact_id is not null
     group by m.contact_id, m.is_now
  ),
  missed_seen as (
    select p.is_now, p.called_at,
           (p.called_at + v_touch > now()) as pending,
           (exists (select 1 from real_msgs o
                     where o.contact_id = p.contact_id
                       and o.direction = 'outbound' and o.status in ('sent', 'delivered', 'read')
                       and o.created_at > p.called_at and o.created_at <= p.called_at + v_touch)
            or exists (select 1 from calls_all k
                        where k.contact_id = p.contact_id and k.connected and not k.voicemail
                          and k.started_at > p.called_at and k.started_at <= p.called_at + v_touch)) as touched
      from people_missed p
  ),
  missed_stats as (
    select p.is_now,
           count(s.called_at) filter (where not s.pending)                as n,
           count(s.called_at) filter (where not s.pending and s.touched) as touched,
           count(s.called_at) filter (where s.pending)                   as pending,
           (select count(*) from missed_calls m where m.is_now = p.is_now and m.contact_id is null) as unknown
      from periods p
      left join missed_seen s on s.is_now = p.is_now
     group by p.is_now
  ),

  -- ---------------------------------------------------------------- after hours
  -- ONE definition of "a customer message" and "who answered it", shared with report_series (00035, 00303, 00379).
  answered as (
    select x.who, (x.asked_at at time zone v_tz) as local_at
      from public.first_replies(p_tenant_id, v_start) x
     where x.asked_at < v_stop
  ),
  arrivals as (
    select to_char(a.local_at::date, 'YYYY-MM-DD') as d,
           (extract(hour from a.local_at)::int * 4 + floor(extract(minute from a.local_at) / 15)::int) as q,
           count(*)::int as n,
           (count(*) filter (where a.who = 'ai'))::int as answered_ai
      from answered a
     group by 1, 2
  ),

  -- ---------------------------------------------------------------- links
  link_rows as (
    select k.contact_id, k.started_at as linked_at
      from calls k
     where k.tenant_id = p_tenant_id and k.started_at >= v_start and k.started_at < v_stop
       and k.direction <> 'outbound' and k.outcome = 'booking_link_sent' and k.contact_id is not null
    union all
    select m.contact_id, e.created_at
      from events e
      join real_msgs m on m.id = e.subject_id
     where e.tenant_id = p_tenant_id and e.kind = 'booking_link.sent'
       and e.created_at >= v_start and e.created_at < v_stop
       and e.subject_type = 'message' and m.contact_id is not null
  ),
  link_people as (
    select l.contact_id, min(l.linked_at) as linked_at
      from link_rows l
     group by l.contact_id
  ),

  -- ---------------------------------------------------------------- stuck (now, not the window)
  stuck_rows as (
    select e.id, e.reason, e.created_at, c.state, c.paused_until, c.assignee_user_id
      from escalations e
      join conversations c on c.id = e.conversation_id and c.tenant_id = e.tenant_id
     where e.tenant_id = p_tenant_id and e.state = 'open'
     order by e.created_at, e.id
     limit 500
  )

  select jsonb_build_object(
    'timezone', v_tz,
    'today', to_char(v_today, 'YYYY-MM-DD'),
    'end', to_char(v_end, 'YYYY-MM-DD'),
    'days', v_days,
    'hold', jsonb_build_object(
      'now', (select jsonb_build_object(
                'total', s.total, 'sent', s.sent, 'canceled', s.canceled, 'steered', s.steered,
                'overtaken', s.overtaken, 'person_first', s.person_first, 'waiting', s.waiting,
                'other', s.other, 'low_confidence', s.low_confidence)
                from hold_stats s where s.is_now),
      'before', (select jsonb_build_object('total', s.total, 'sent', s.sent)
                   from hold_stats s where not s.is_now)),
    'topics', jsonb_build_object(
      'of', (select count(*) from topic_msgs),
      'stamped', (select count(*) from topic_msgs where intent is not null),
      'by_intent', coalesce((select jsonb_object_agg(t.intent, t.n) from (
                     select intent, count(*) as n from topic_msgs where intent is not null group by intent) t), '{}'::jsonb)),
    'languages', jsonb_build_object(
      'of', (select count(*) from lang_msgs),
      'stamped', (select count(*) from lang_msgs where lang is not null),
      'by_language', coalesce((select jsonb_object_agg(t.lang, t.n) from (
                       select lang, count(*) as n from lang_msgs where lang is not null group by lang) t), '{}'::jsonb)),
    'blocked', jsonb_build_object(
      'total', (select count(*) from blocked),
      'by_reason', coalesce((select jsonb_object_agg(t.reason, t.n) from (
                     select reason, count(*) as n from blocked group by reason) t), '{}'::jsonb)),
    'call_endings', jsonb_build_object(
      'total', (select count(*) from call_ends),
      'by_reason', coalesce((select jsonb_object_agg(t.reason, t.n) from (
                     select reason, count(*) as n from call_ends group by reason) t), '{}'::jsonb)),
    'handover', (select jsonb_object_agg(
                   case when s.is_now then 'now' else 'before' end,
                   jsonb_build_object(
                     'n', s.n,
                     'replied', jsonb_build_object('n', s.replied_n, 'median_s', s.replied_s),
                     'settled', jsonb_build_object('n', s.settled_n, 'median_s', s.settled_s)))
                   from esc_stats s),
    'missed', (select jsonb_object_agg(
                 case when s.is_now then 'now' else 'before' end,
                 jsonb_build_object('n', s.n, 'touched', s.touched, 'pending', s.pending, 'unknown', s.unknown))
                 from missed_stats s),
    'after_hours', coalesce((select jsonb_agg(
                     jsonb_build_object('d', a.d, 'q', a.q, 'n', a.n, 'a', a.answered_ai) order by a.d, a.q)
                     from arrivals a), '[]'::jsonb),
    'links', jsonb_build_object(
      'total', (select count(*) from link_people),
      'people', coalesce((select jsonb_agg(
                  jsonb_build_object('c', l.contact_id, 'at', l.linked_at) order by l.linked_at, l.contact_id)
                  from (select * from link_people order by linked_at, contact_id limit 500) l), '[]'::jsonb)),
    'stuck', jsonb_build_object(
      'open', coalesce((select jsonb_agg(
                jsonb_build_object('reason', s.reason, 'created_at', s.created_at, 'state', s.state,
                                   'paused_until', s.paused_until, 'assignee_user_id', s.assignee_user_id)
                order by s.created_at, s.id)
                from stuck_rows s), '[]'::jsonb))
  ) into v_result;

  return v_result;
end $$;

revoke all on function public.receptionist_series(uuid, integer, date) from public, anon;
grant execute on function public.receptionist_series(uuid, integer, date) to authenticated, service_role;

comment on function public.receptionist_series(uuid, integer, date) is
  'Reports › Receptionist: what the receptionist did beyond the days'' counts, over p_days and the same number of days before them: its held replies by what became of them (hold: sent, canceled, steered, overtaken by a newer message, a person first, waiting, other), what customers asked about on WhatsApp and SMS (the intent stamped by message_stamp_handled, 00305) and the language it replied in, the conversational replies the send door refused (message.send_blocked), how connected calls ended, how long a handover took to a person''s first reply and to its end (escalations, not opt_out or callback), the calls nobody took or that reached voicemail and whether the business reached the person within an hour, the customer messages by local day and quarter hour with those the receptionist answered first (first_replies), the people sent the booking link (calls, 00313 events), and the open escalations as of now. SECURITY INVOKER: the caller''s RLS decides what a member reads. `p_end` (00360) is the window''s last day, in the workspace''s zone: null is today, and a day that has not come is read as today.';

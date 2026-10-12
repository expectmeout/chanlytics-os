-- 00395 · The People lens is read beyond the days' counts (Reports, the People lens).
--
-- report_series (00304, 00360, 00379) counts messages and calls day by day: how many arrived, never how many people they
-- were. The People lens asks what that cannot: who reached the business, and how many of them were new; on which
-- channel; how the new ones first came; how many answers about being written to were won and lost, and how; which email
-- addresses stopped working; and how many steps were done, and on time. This is the lens's own read,
-- `people_series(p_tenant_id, p_days, p_end)`: one statement, under the caller's RLS (SECURITY INVOKER), over the window
-- report_series reads (00360: `p_end` is its last day, null is today, a day that has not come is today, in the
-- workspace's zone) and the same number of days before it, for the parts that are set against before. Counts only: no
-- name, number or address leaves it.
--
--   live         The people every count is of: contacts of the workspace with `erased_at is null and
--                merged_into_contact_id is null` (People's own predicate, people_page). An erased person keeps a tombstone
--                with `dnc` set, an `acquired_via` and all their consent events; a merged-away record keeps a row while its
--                messages, calls, events and notes live on the one it was merged into. Neither is a person here.
--   reached      The distinct live people who reached the business in the period: an inbound customer message in their own
--                words (message_is_a_persons_words, 00299, 00373) on WhatsApp, SMS or email, over the messages a history
--                moved in (`meta.backfill`) does not touch, by the row's `created_at`; or an inbound call that connected
--                (call_connected, 00303) by `started_at`. A call note, an automatic reply, a delivery report, what the
--                business sent and a call nobody took reach nobody. `new` is a person reached in the period whose first
--                reach-in, contact_first_moments (00394), falls in the same period; the rest are known. This is not
--                report_series.messages_in (messages, of anyone, counted not as people), and not People's lists (as of
--                now, by People's own rules, read from the pool).
--   by_channel   The same population by the way they came, as people: `count(distinct contact_id)` for each of
--                whatsapp, sms, email and voice (the calls). A person who wrote on two channels is in both, so the four
--                add to at least `reached.people`.
--   first_came   The NEW people of the window by `contacts.acquired_via` (00306, 00307: whatsapp, sms, email, call, ad,
--                calendar, import, lead, manual), a person whose way was not kept (null, anyone made before it was
--                kept) as `unknown`. The values add up to `reached.now.new`.
--   consent      The answers recorded in the window and the period before: events `contact.consent_changed` of a live
--                person whose `consent` is `opted_in` (`yes`) or `opted_out` (`stop`). A merge restating an answer
--                (source `merge`) and the trigger that ends a yes to offers on a STOP (source `stop`, consent
--                `unknown`) are no person's own answer and are left out. One per person, kind of message and answer in
--                each period, the earliest event's `source` standing for it: a person who changed their answer counts
--                once in each, and one who said yes twice counts once. The kind of message is the event's `purpose`:
--                absent is `messages` (the answer about their visit), `marketing` is `offers`, `email_marketing` is
--                `email_offers`; any other purpose is left out, so `by_purpose` always adds to `total`. An event that
--                names no `source` is counted under `unknown`. The window is told by source and by kind of message; the
--                period before only in totals.
--   email_stopped  The live people whose email address stopped working in the window (`contact.email_suppressed`,
--                written by the email receipts door), once each, by the first reason (hard_bounce, complaint, provider;
--                an event that names none is `unknown`). The event is the history; the address's state on the contact is
--                People's own count, as of now.
--   steps        Steps done in the window: notes of live people with a day (`due_on`, 00166) marked done (`done_at`) in
--                it, and how many were done on their day or before, by the workspace's day (`done_at` in the zone <=
--                `due_on`), so `done - on_time` were late. A step is state, not history: one marked done and then undone
--                leaves the count, and one whose day was moved after it was done is judged by its day now.
--
-- Where this and the Overview part: `reached.now.new` is the Overview's New people (report_series `fresh`, metrics_summary
-- `fresh_contacts`) for the same days wherever a person's first reach-in is also a row made in that period. It is the
-- smaller number where the provider's time (channel_ts, which a first moment reads) falls on the day before the window and
-- the row (created_at, which reached reads) on its first day, and for a record marked merged that still has its rows on it
-- (contact_first_moments does not look at the mark; `live` does). A merge the door completed moves the record's messages,
-- calls and events to the person it was merged into (00365), so such a record has no moments left.
--
-- The reads of messages, calls and events are bounded by the periods (messages_tenant_inbound_recent,
-- calls_tenant_started, events_tenant_kind_created). Two are not: the steps are a read of the workspace's notes filtered by
-- `done_at` (no index serves it: person_notes_steps_open is a partial index of the open ones; the table is small), and
-- contact_first_moments is a scan of every contact of the workspace, which report_series already pays, so opening the
-- People lens pays it twice (plan, open question 2). Either deploy order works: the dashboard answers "no read yet" in
-- words until this is applied (isMissingDoor), and nothing else reads the function.
-- Re-runnable: `create or replace`, the grants and the comment said again.

set local lock_timeout = '3s';

create or replace function public.people_series(p_tenant_id uuid, p_days integer default 30, p_end date default null)
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
  -- The people every count is of. Not materialized: each use looks its own row up by key.
  live as not materialized (
    select c.id as contact_id
      from contacts c
     where c.tenant_id = p_tenant_id
       and c.erased_at is null
       and c.merged_into_contact_id is null
  ),

  -- ---------------------------------------------------------------- who reached you
  reach_msgs as (
    select m.contact_id, m.channel, (m.created_at >= v_start) as is_now
      from real_msgs m
      join live l on l.contact_id = m.contact_id
     where m.created_at >= v_prior and m.created_at < v_stop
       and m.direction = 'inbound' and m.sender = 'customer'
       and m.channel in ('whatsapp', 'sms', 'email')
       and public.message_is_a_persons_words(m.meta)
  ),
  reach_calls as (
    select k.contact_id, 'voice'::text as channel, (k.started_at >= v_start) as is_now
      from calls k
      join live l on l.contact_id = k.contact_id
     where k.tenant_id = p_tenant_id
       and k.started_at >= v_prior and k.started_at < v_stop
       and k.direction = 'inbound'
       and public.call_connected(k.status, k.duration_ms)
  ),
  reach_rows as (
    select * from reach_msgs
    union all
    select * from reach_calls
  ),
  reach_people as (
    select distinct r.contact_id, r.is_now from reach_rows r
  ),
  -- Each person's first reach-in (00394), told by the period it falls in; a first moment outside both is no one's here.
  firsts as (
    select f.contact_id, (f.first_at >= v_start) as is_now
      from public.contact_first_moments(p_tenant_id) f
     where f.first_at >= v_prior and f.first_at < v_stop
  ),
  new_people as (
    select r.contact_id, r.is_now
      from reach_people r
      join firsts f on f.contact_id = r.contact_id and f.is_now = r.is_now
  ),
  reach_stats as (
    select p.is_now,
           (select count(*) from reach_people r where r.is_now = p.is_now) as people,
           (select count(*) from new_people n where n.is_now = p.is_now)   as newcomers
      from periods p
  ),
  channel_stats as (
    select p.is_now,
           count(distinct r.contact_id) filter (where r.channel = 'whatsapp') as whatsapp,
           count(distinct r.contact_id) filter (where r.channel = 'sms')      as sms,
           count(distinct r.contact_id) filter (where r.channel = 'email')    as email,
           count(distinct r.contact_id) filter (where r.channel = 'voice')    as voice
      from periods p
      left join reach_rows r on r.is_now = p.is_now
     group by p.is_now
  ),

  -- ---------------------------------------------------------------- how the new ones first came (the window alone)
  first_came as (
    select coalesce(c.acquired_via, 'unknown') as via, count(*) as n
      from new_people np
      join contacts c on c.id = np.contact_id
     where np.is_now
     group by 1
  ),

  -- ---------------------------------------------------------------- the answers recorded
  -- One row a person, kind of message, answer and period: the earliest event's source. A purpose this lens has no word
  -- for is left out; a source nobody wrote is `unknown`.
  consent_ev as (
    select distinct on (e.subject_id, x.purpose, x.answer, x.is_now)
           e.subject_id as contact_id, x.purpose, x.answer, x.is_now,
           coalesce(nullif(btrim(e.data->>'source'), ''), 'unknown') as source
      from events e
      join live l on l.contact_id = e.subject_id
     cross join lateral (select case e.data->>'purpose'
                                  when 'marketing' then 'offers'
                                  when 'email_marketing' then 'email_offers'
                                  else 'messages' end                          as purpose,
                                case e.data->>'consent' when 'opted_in' then 'yes' else 'stop' end as answer,
                                (e.created_at >= v_start)                       as is_now) x
     where e.tenant_id = p_tenant_id and e.kind = 'contact.consent_changed'
       and e.created_at >= v_prior and e.created_at < v_stop
       and e.data->>'consent' in ('opted_in', 'opted_out')
       and coalesce(e.data->>'source', '') not in ('merge', 'stop')
       and coalesce(e.data->>'purpose', '') in ('', 'marketing', 'email_marketing')
     order by e.subject_id, x.purpose, x.answer, x.is_now, e.created_at, e.id
  ),
  consent_stats as (
    select p.is_now, a.answer,
           count(c.contact_id)                              as total,
           count(*) filter (where c.purpose = 'messages')     as messages,
           count(*) filter (where c.purpose = 'offers')       as offers,
           count(*) filter (where c.purpose = 'email_offers') as email_offers
      from periods p
      cross join (values ('yes'), ('stop')) a(answer)
      left join consent_ev c on c.is_now = p.is_now and c.answer = a.answer
     group by p.is_now, a.answer
  ),

  -- ---------------------------------------------------------------- email that stopped working (the window alone)
  email_ev as (
    select distinct on (e.subject_id)
           e.subject_id as contact_id,
           coalesce(nullif(btrim(e.data->>'reason'), ''), 'unknown') as reason
      from events e
      join live l on l.contact_id = e.subject_id
     where e.tenant_id = p_tenant_id and e.kind = 'contact.email_suppressed'
       and e.created_at >= v_start and e.created_at < v_stop
     order by e.subject_id, e.created_at, e.id
  ),

  -- ---------------------------------------------------------------- steps done (the window alone)
  steps_done as (
    select ((pn.done_at at time zone v_tz)::date <= pn.due_on) as on_time
      from person_notes pn
      join live l on l.contact_id = pn.contact_id
     where pn.tenant_id = p_tenant_id
       and pn.due_on is not null
       and pn.done_at >= v_start and pn.done_at < v_stop
  )

  select jsonb_build_object(
    'timezone', v_tz,
    'today', to_char(v_today, 'YYYY-MM-DD'),
    'end', to_char(v_end, 'YYYY-MM-DD'),
    'days', v_days,
    'reached', jsonb_build_object(
      'now', (select jsonb_build_object('people', s.people, 'new', s.newcomers) from reach_stats s where s.is_now),
      'before', (select jsonb_build_object('people', s.people, 'new', s.newcomers) from reach_stats s where not s.is_now)),
    'by_channel', jsonb_build_object(
      'now', (select jsonb_build_object('whatsapp', s.whatsapp, 'sms', s.sms, 'email', s.email, 'voice', s.voice)
                from channel_stats s where s.is_now),
      'before', (select jsonb_build_object('whatsapp', s.whatsapp, 'sms', s.sms, 'email', s.email, 'voice', s.voice)
                   from channel_stats s where not s.is_now)),
    'first_came', jsonb_build_object(
      'by_via', coalesce((select jsonb_object_agg(f.via, f.n) from first_came f), '{}'::jsonb)),
    'consent', jsonb_build_object(
      'now', jsonb_build_object(
        'yes', (select jsonb_build_object(
                  'total', s.total,
                  'by_source', coalesce((select jsonb_object_agg(t.source, t.n) from (
                                 select c.source, count(*) as n from consent_ev c
                                  where c.is_now and c.answer = 'yes' group by c.source) t), '{}'::jsonb),
                  'by_purpose', jsonb_build_object('messages', s.messages, 'offers', s.offers, 'email_offers', s.email_offers))
                  from consent_stats s where s.is_now and s.answer = 'yes'),
        'stop', (select jsonb_build_object(
                   'total', s.total,
                   'by_source', coalesce((select jsonb_object_agg(t.source, t.n) from (
                                  select c.source, count(*) as n from consent_ev c
                                   where c.is_now and c.answer = 'stop' group by c.source) t), '{}'::jsonb),
                   'by_purpose', jsonb_build_object('messages', s.messages, 'offers', s.offers, 'email_offers', s.email_offers))
                   from consent_stats s where s.is_now and s.answer = 'stop')),
      'before', jsonb_build_object(
        'yes', (select s.total from consent_stats s where not s.is_now and s.answer = 'yes'),
        'stop', (select s.total from consent_stats s where not s.is_now and s.answer = 'stop'))),
    'email_stopped', jsonb_build_object(
      'total', (select count(*) from email_ev),
      'by_reason', coalesce((select jsonb_object_agg(t.reason, t.n) from (
                     select reason, count(*) as n from email_ev group by reason) t), '{}'::jsonb)),
    'steps', jsonb_build_object(
      'done', (select count(*) from steps_done),
      'on_time', (select count(*) from steps_done where on_time))
  ) into v_result;

  return v_result;
end $$;

revoke all on function public.people_series(uuid, integer, date) from public, anon;
grant execute on function public.people_series(uuid, integer, date) to authenticated, service_role;

comment on function public.people_series(uuid, integer, date) is
  'Reports › People: who reached the business over p_days and the same number of days before them, as people and never as messages (distinct live people with an inbound message in their own words on WhatsApp, SMS or email, or an inbound call that connected; new where contact_first_moments, 00394, puts their first reach-in in the same period), on which channel, how the new ones first came (contacts.acquired_via, 00306; null is unknown), the yeses and stops recorded (contact.consent_changed events, one per person, kind of message and answer, a merge and a stop that ends a yes to offers left out; by source and kind of message in the window, in totals before it), the email addresses that stopped working (contact.email_suppressed events, once a person), and the steps done (person_notes with a day, done in the window) and how many on their day or before by the workspace''s own day. Counts only. SECURITY INVOKER: the caller''s RLS decides what a member reads. `p_end` (00360) is the window''s last day, in the workspace''s zone: null is today, and a day that has not come is read as today.';

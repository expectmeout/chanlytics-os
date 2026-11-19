-- 00646 · A page names the ad someone came through (decision 0049, call 2; the Ads build plan's step 1).
--
-- Since 00644 an ad tap keeps what the ad said. No page read it: a person who first wrote after tapping an ad was
-- "An ad" in Reports, and the Ads page counted them without saying which ad. This gives an ad its name in one
-- place, and has the people report say how many each ad brought, so the page that names an ad counts the same
-- people the report counts.
--
--   ad_named       The ad a first touch names, as a page says it: its platform and its name, the headline the newest
--                  entry kept for it; no name where none did. A member's read, under their own row rules.
--   people_series  Re-made in place, the same but for one more key: `first_came.by_ad`, the new people an ad
--                  brought, a row an ad (platform, name, n), the most first. Its rows add up to the count under `ad`
--                  in `first_came.by_via`, since both read the same people. Nothing else of the answer changes.
--
-- Deploy order: either. A dashboard ahead of this reads no `by_ad` and names no ad, as today; a database ahead of
-- the dashboard answers one key more, which today's page does not read. Re-runnable.

set local lock_timeout = '3s';

create or replace function public.ad_named(p_tenant_id uuid, p_ref text)
returns jsonb
language sql
stable
set search_path = public
as $$
  select jsonb_build_object(
           'platform', r.platform,
           'name', (select e.said ->> 'headline'
                      from public.ad_entries e
                     where e.tenant_id = p_tenant_id
                       and e.platform = r.platform
                       and e.platform_ad_id = r.ad
                       and e.said ? 'headline'
                     order by e.created_at desc
                     limit 1))
    from (select case when p_ref ~ '^(meta|google|tiktok):.' then split_part(p_ref, ':', 1)
                      when btrim(coalesce(p_ref, '')) = '' then null
                      else 'meta' end as platform,
                 case when p_ref ~ '^(meta|google|tiktok):.' then substr(p_ref, strpos(p_ref, ':') + 1)
                      else nullif(btrim(p_ref), '') end as ad) r
$$;

revoke execute on function public.ad_named(uuid, text) from public, anon;
grant execute on function public.ad_named(uuid, text) to authenticated, service_role;
comment on function public.ad_named(uuid, text) is
  'The ad a first touch names (contacts.acquired_ref), as a page says it (decision 0049, call 2; 00646): its platform, and its name, which is the headline the newest entry kept for it (ad_entries.said, 00644), or null where none did: an ad Chanlytics cannot name yet. A reference keyed by its platform (meta:<id>, google:<id>, tiktok:<id>) is read by its key; a bare id is one a WhatsApp or Instagram message carried, which is Meta''s; no reference at all names no platform. Until Chanlytics holds the ad itself, this is the one place an ad gets its name, so a person''s page and the people report cannot call one ad two things. Names nobody and counts nothing. SECURITY INVOKER: the caller''s RLS decides which entries are read.';

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
  -- The ones an ad brought, by the ad (00646): its platform, and its name where an entry kept what the ad said
  -- (ad_named), so an ad whose id was written two ways is one row, and the ads nobody can name are one row a
  -- platform. One lookup an ad, never one a person. The rows add up to first_came's `ad`.
  first_ads as (
    select public.ad_named(p_tenant_id, r.ref) as named, sum(r.n)::bigint as n
      from (select c.acquired_ref as ref, count(*) as n
              from new_people np
              join contacts c on c.id = np.contact_id
             where np.is_now and c.acquired_via = 'ad'
             group by 1) r
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
      'by_via', coalesce((select jsonb_object_agg(f.via, f.n) from first_came f), '{}'::jsonb),
      'by_ad', coalesce((select jsonb_agg(a.named || jsonb_build_object('n', a.n)
                                         order by a.n desc, a.named ->> 'name', a.named ->> 'platform')
                           from first_ads a), '[]'::jsonb)),
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

comment on function public.people_series(uuid, integer, date) is
  'Reports › People: who reached the business over p_days and the same number of days before them, as people and never as messages (distinct live people with an inbound message in their own words on WhatsApp, SMS or email, or an inbound call that connected; new where contact_first_moments, 00394, puts their first reach-in in the same period), on which channel, how the new ones first came (contacts.acquired_via, 00306; null is unknown) and, of those an ad brought, how many each ad did (`first_came.by_ad`, 00646: an ad by its platform and its name where an entry kept what the ad said, ad_named; the ads nobody can name are one row a platform; the rows add up to the count under `ad`), the yeses and stops recorded (contact.consent_changed events, one per person, kind of message and answer, a merge and a stop that ends a yes to offers left out; by source and kind of message in the window, in totals before it), the email addresses that stopped working (contact.email_suppressed events, once a person), and the steps done (person_notes with a day, done in the window) and how many on their day or before by the workspace''s own day. Counts only. SECURITY INVOKER: the caller''s RLS decides what a member reads. `p_end` (00360) is the window''s last day, in the workspace''s zone: null is today, and a day that has not come is read as today.';

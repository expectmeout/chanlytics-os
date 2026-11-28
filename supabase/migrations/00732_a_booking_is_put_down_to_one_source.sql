-- 00732 · A booking is put down to one source, inside one window (the whole-system plan of 28 Nov 2026, lane 4:
-- R2.19, R2.20, R2.21, R3.16).
--
-- Until now a booking was put down to something by four rules that did not agree: an ad's Booked counted any visit that
-- starts after its person's first touch, however long after (ad_people_in, 00651); an ad's "booked after" and a form's
-- "visits" counted a visit made here after, with no limit of time (00678, 00709); and a post's counted a visit made
-- within fourteen days of the touch (contracts creditOf). So one booking was counted once on every form its person had
-- ever filled in, an ad's worth added every later visit of its people for ever, and a form's "visits" was a count of
-- people. And a sign-up was "confirmed" by the person's consent as it stands today, not by their confirming.
--
--   credit_window_days   The window, said once: fourteen days (the content loop PRD's call 16). Contracts'
--                        CREDIT_WINDOW_DAYS is held to it by a database test.
--   booking_sources      The one rule. For each booking made in a span, every source its person touched inside the
--                        window before it was made, read from every home (touches, ad_entries, how the person first
--                        came where that was an ad, form_entries), once a source at its first touch; one of them the
--                        booking's main source, the rest "helped". A member's read (SECURITY INVOKER).
--   bookings_with_sources   The same rows as one answer for a page: a booking each, with its sources.
--   form_results         Re-made from its newest body (00709) to ask it: the people who booked from a form and those it
--                        helped, counted as people and named so; a form's own totals, each person once however many
--                        places they came through; the bookings themselves; a sign-up's confirmations from their own
--                        event, at their own time; and who has said yes today, apart. `visits` stays in the answer for a
--                        dashboard from before this, holding the people who booked.
--   ad_people_in, ad_people_back, ads_page_counts
--                        Re-made from their newest bodies (00651, 00678, 00683) to ask it: Booked, "booked after" and
--                        what an ad's bookings are worth are of bookings the ad is the main source of.
--
-- No table, no column, no index. Deploy order: either. A dashboard from before this reads the keys it always read; a
-- dashboard ahead of this reads no new key and says the old ones. Re-runnable.

set local lock_timeout = '3s';

/* ---------------------------------------------------------------------------- 1. the window, said once -- */

create or replace function public.credit_window_days()
returns integer
language sql
immutable
set search_path = public
as $$
  select 14
$$;

revoke all on function public.credit_window_days() from public, anon;
grant execute on function public.credit_window_days() to authenticated, service_role;
comment on function public.credit_window_days() is
  'The days before a booking was made that a touch counts for it (00732; the content loop PRD''s call 16): fourteen. The one window every result is read by: booking_sources asks it, so a form''s, an ad''s and a post''s bookings are counted over the same days. Contracts'' CREDIT_WINDOW_DAYS says the same number on the page, and a database test holds the two equal.';

/* ---------------------------------------------------------------------------- 2. the one rule -- */

create or replace function public.booking_sources(
  p_tenant_id uuid,
  p_since timestamptz,
  p_until timestamptz default null,
  p_people uuid[] default null
)
returns table (
  appointment_id uuid,
  contact_id uuid,
  made_at timestamptz,
  starts_at timestamptz,
  status text,
  worth_minor bigint,
  worth_currency text,
  subject_type text,
  subject_id uuid,
  subject_ref text,
  touch_home text,
  touch_id uuid,
  touch_at timestamptz,
  standing text,
  tied boolean
)
language sql
stable
set search_path = public
as $$
  with span as (
    select coalesce(p_since, '-infinity'::timestamptz) as since,
           coalesce(p_until, 'infinity'::timestamptz) as until,
           make_interval(days => public.credit_window_days()) as reach
  ),
  -- The bookings made in the span: a visit neither cancelled nor only asked for, with a moment it was made that the
  -- record can prove. Asked for here and confirmed, or added by a member: its row's own time. Come from a booking page,
  -- its email or a calendar: the moment it arrived as a customer's booking (appointments.arrived_at, 00647). A visit
  -- with neither (a calendar's first read, the owner's own diary) is put down to nothing. Its person is the one it
  -- names, or, where it names none, the one its number or its address is.
  dated as (
    select a.id, a.status, a.starts_at, a.worth_minor, a.worth_currency, a.through_type, a.through_id,
           x.made_at, s.reach,
           coalesce(a.contact_id, by_phone.id, by_email.id) as contact_id
      from appointments a
     cross join span s
     cross join lateral (select case when a.source in ('receptionist', 'person') then a.created_at
                                     else a.arrived_at end as made_at) x
      left join lateral (select c.id
                           from contacts c
                          where a.contact_id is null and a.client_phone is not null
                            and c.tenant_id = a.tenant_id and c.phone_e164 = a.client_phone
                            and c.erased_at is null and c.merged_into_contact_id is null
                          limit 1) by_phone on true
      left join lateral (select c.id
                           from contacts c
                          where a.contact_id is null and by_phone.id is null and a.client_email is not null
                            and c.tenant_id = a.tenant_id and lower(c.email) = lower(a.client_email)
                            and c.erased_at is null and c.merged_into_contact_id is null
                          order by c.created_at
                          limit 1) by_email on true
     where a.tenant_id = p_tenant_id
       and a.status not in ('cancelled', 'proposed')
       -- A booking starts after the touch it is put down to, and that touch is inside the window before it was made.
       and a.starts_at > s.since - s.reach
       and x.made_at >= s.since and x.made_at < s.until
  ),
  -- Only these people's, where a read names them: what follows is asked for their bookings alone.
  made as (
    select d.*
      from dated d
     where p_people is null or d.contact_id = any (p_people)
  ),
  -- An ad's touches, from its two homes: a message that came from an ad (ad_entries; one whose message is a touch
  -- already is read there, once), and an ad as how the person first came (contacts.acquired_via, kept since before an
  -- ad's entries were), at the moment that made them.
  ad_touch as (
    select 'ad_entries'::text as home, e.id as touch_id, g.contact_id, e.ad_id, e.platform, e.platform_ad_id as ad,
           e.created_at as at
      from ad_entries e
      join messages g on g.id = e.message_id and g.tenant_id = e.tenant_id
     cross join span s
     where e.tenant_id = p_tenant_id
       and e.kind = 'chat'
       and e.created_at >= s.since - s.reach and e.created_at < s.until
       and g.contact_id is not null
       and not exists (select 1 from touches t where t.tenant_id = e.tenant_id and t.message_id = e.message_id)
    union all
    select 'contacts', c.id, c.id, null::uuid, r.platform, r.ad, c.created_at
      from contacts c
     cross join lateral public.ad_ref_parts(c.acquired_ref) r
     where c.tenant_id = p_tenant_id
       and c.acquired_via = 'ad'
       and r.platform is not null and r.ad is not null
       and c.id in (select m.contact_id from made m)
  ),
  -- The ad Chanlytics holds for each platform id an entry does not name already, asked once an id (ad_held_for).
  ad_held as (
    select g.platform, g.ad, public.ad_held_for(p_tenant_id, g.platform, g.ad) as ad_id
      from (select distinct x.platform, x.ad from ad_touch x where x.ad_id is null) g
  ),
  -- Every touch that counts for a booking: its person's, before it was made and inside the window, and before it starts.
  touched as (
    -- A post, a link, a comment left on an ad.
    select m.id as appointment_id, 'touches'::text as home, t.id as touch_id,
           t.subject_type, t.subject_id, null::text as subject_ref, t.at
      from made m
      join touches t
        on t.tenant_id = p_tenant_id and t.contact_id = m.contact_id
       and t.at <= m.made_at and t.at >= m.made_at - m.reach and t.at < m.starts_at
    union all
    select m.id, x.home, x.touch_id, 'ad', coalesce(x.ad_id, h.ad_id), x.platform || ':' || x.ad, x.at
      from made m
      join ad_touch x
        on x.contact_id = m.contact_id
       and x.at <= m.made_at and x.at >= m.made_at - m.reach and x.at < m.starts_at
      left join ad_held h on h.platform = x.platform and h.ad = x.ad
    union all
    -- A form's entry, of a form made here or of one the business's own site sends: never a held one, never a test.
    select m.id, 'form_entries', f.id, 'form', coalesce(f.form_id, f.outside_form_id), null, f.created_at
      from made m
      join form_entries f
        on f.tenant_id = p_tenant_id and f.contact_id = m.contact_id
       and f.created_at <= m.made_at and f.created_at >= m.made_at - m.reach and f.created_at < m.starts_at
     where (f.form_id is not null or f.outside_form_id is not null)
       and f.state <> 'held' and not f.test
  ),
  -- Each source once a booking, at its first touch. An ad Chanlytics cannot name is told from another by its reference.
  firsts as (
    select distinct on (x.appointment_id, x.subject_type, coalesce(x.subject_id::text, x.subject_ref))
           x.appointment_id, x.home, x.touch_id, x.subject_type, x.subject_id, x.subject_ref, x.at,
           coalesce(x.subject_id::text, x.subject_ref) as subject_key
      from touched x
     order by x.appointment_id, x.subject_type, coalesce(x.subject_id::text, x.subject_ref), x.at, x.home, x.touch_id
  ),
  -- Tied: the one source the booking itself names (appointments.through_type, through_id: the post or the ad its
  -- conversation answered, 00699; the form its time was asked for on, 00691).
  placed as (
    select f.appointment_id, f.home, f.touch_id, f.subject_type, f.subject_id, f.subject_ref, f.at, f.subject_key,
           m.contact_id, m.made_at, m.starts_at, m.status, m.worth_minor, m.worth_currency,
           (m.through_type is not null and f.subject_type = m.through_type and f.subject_id = m.through_id) as tied
      from firsts f
      join made m on m.id = f.appointment_id
  )
  -- One main source a booking: the one it names; where it names none, the first it touched. Every other one helped.
  select p.appointment_id, p.contact_id, p.made_at, p.starts_at, p.status, p.worth_minor, p.worth_currency,
         p.subject_type, p.subject_id, p.subject_ref, p.home, p.touch_id, p.at,
         case when row_number() over (partition by p.appointment_id
                                      order by p.tied desc, p.at, p.subject_type, p.subject_key) = 1
              then 'main' else 'helped' end,
         p.tied
    from placed p
$$;

revoke all on function public.booking_sources(uuid, timestamptz, timestamptz, uuid[]) from public, anon;
grant execute on function public.booking_sources(uuid, timestamptz, timestamptz, uuid[]) to authenticated, service_role;
comment on function public.booking_sources(uuid, timestamptz, timestamptz, uuid[]) is
  'What each booking is put down to: the one rule a form''s, an ad''s and a post''s results are read by (00732; the content loop PRD''s 9.3 and Appendix A.6, A.7; the whole-system plan of 28 Nov 2026, lane 4). For each booking made from p_since up to p_until (null: no end), of anyone or of p_people alone, a row for every source its person touched inside the window before it (credit_window_days), each source once, at its first touch. A booking: a visit neither cancelled nor only asked for, with a moment it was made that the record can prove: its row''s own time where it was asked for here and confirmed (source receptionist) or added by a member (person); the moment it arrived as a customer''s booking (arrived_at, 00647) where it came from a booking page, its email or a calendar; none otherwise, and such a visit is put down to nothing. Its person: the one it names or, where it names none, the one its number or its address is. A touch counts when it is that person''s, not after the booking was made, inside the window, and before the visit starts. Read from every home (touch_home, touch_id): touches (a post, a link, a comment left on an ad), ad_entries (a message that came from an ad), contacts (an ad as how the person first came) and form_entries (a form made here or one the business''s site sends; never a held entry or a test). subject_type and subject_id name the source; an ad Chanlytics holds no record of has no id and is told apart by subject_ref (platform:its id there). standing: main for the one source the booking is put down to, the one it names itself (tied: appointments.through_type and through_id) or, where it names none, the first touched; helped for every other. So the main rows are one a booking, and may be added up; the helped rows never. Counts nothing, keeps nothing. SECURITY INVOKER: the caller''s row rules decide what is read.';

/* ---------------------------------------------------------------------------- 2b. the rule, for a page -- */

create or replace function public.bookings_with_sources(
  p_tenant_id uuid,
  p_since timestamptz,
  p_until timestamptz default null,
  p_people uuid[] default null,
  p_of text default null
)
returns jsonb
language sql
stable
set search_path = public
as $$
  select jsonb_build_object(
           'window_days', public.credit_window_days(),
           'bookings', coalesce((
             select jsonb_agg(jsonb_build_object(
                                'appointment_id', b.appointment_id, 'contact_id', b.contact_id, 'made_at', b.made_at,
                                'starts_at', b.starts_at, 'status', b.status, 'sources', b.sources)
                              order by b.made_at desc, b.appointment_id)
               from (select s.appointment_id, s.contact_id, s.made_at, s.starts_at, s.status,
                            jsonb_agg(jsonb_build_object(
                                        'type', s.subject_type, 'id', s.subject_id, 'ref', s.subject_ref,
                                        'at', s.touch_at, 'standing', s.standing, 'tied', s.tied)
                                      order by (s.standing = 'main') desc, s.touch_at, s.subject_type) as sources
                       from public.booking_sources(p_tenant_id, p_since, p_until, p_people) s
                      group by s.appointment_id, s.contact_id, s.made_at, s.starts_at, s.status
                     having p_of is null or bool_or(s.subject_type = p_of)) b), '[]'::jsonb))
$$;

revoke all on function public.bookings_with_sources(uuid, timestamptz, timestamptz, uuid[], text) from public, anon;
grant execute on function public.bookings_with_sources(uuid, timestamptz, timestamptz, uuid[], text) to authenticated, service_role;
comment on function public.bookings_with_sources(uuid, timestamptz, timestamptz, uuid[], text) is
  'The one rule as a page reads it (00732): booking_sources'' rows for a span, of anyone or of p_people alone, a booking each with every source it is put down to. {window_days, bookings: [{appointment_id, contact_id, made_at, starts_at, status, sources: [{type, id, ref, at, standing, tied}]}]}, the newest made first, a booking''s main source first among its sources. p_of (post, ad, link or form) keeps only the bookings one such source touched; every source of those is still listed, so a page says what else was on the way. One answer, never a list a request cuts short. Counts nothing, keeps nothing. SECURITY INVOKER: the caller''s row rules decide what is read.';

/* ---------------------------------------------------------------------------- 3. a form's results -- */

create or replace function public.form_results(p_tenant_id uuid, p_days integer default 30)
returns jsonb
language sql
stable
set search_path = public
as $$
  with win as (
    select now() - make_interval(days => greatest(1, least(coalesce(p_days, 30), 366))) as since,
           make_interval(days => public.credit_window_days()) as reach
  ),
  -- What each booking made since the window began is put down to, by the one rule (booking_sources): the forms in it.
  put as materialized (
    select s.appointment_id, s.contact_id, s.made_at, s.subject_id as form, s.standing
      from win
     cross join lateral public.booking_sources(p_tenant_id, win.since, null, null) s
     where s.subject_type = 'form'
  ),
  entered as (
    -- Each entry of a form in the window, made here or owned elsewhere: whether its person was new with it, whether it
    -- became a conversation (a reply that left, or their own message with its code), and whether it asked for a time
    -- (00691).
    select e.id, e.form_id, e.outside_form_id, e.link_id, e.contact_id, e.created_at,
           c.created_at > e.created_at - interval '1 minute' as new_person,
           exists (select 1 from form_entry_links k
                    where k.tenant_id = e.tenant_id and k.entry_id = e.id
                      and (k.kind = 'conversation'
                           or (k.kind = 'reply' and exists (
                                 select 1 from messages m
                                  where m.tenant_id = k.tenant_id and m.id = k.message_id
                                    and m.status not in ('failed', 'canceled'))))) as talked,
           exists (select 1 from form_entry_links k
                    where k.tenant_id = e.tenant_id and k.entry_id = e.id and k.kind = 'visit') as timed
      from form_entries e
      join contacts c on c.tenant_id = e.tenant_id and c.id = e.contact_id
      cross join win
     where e.tenant_id = p_tenant_id
       and (e.form_id is not null or e.outside_form_id is not null) and e.state <> 'held' and not e.test
       and e.created_at > win.since
  ),
  -- Each entry beside each booking put down to its form: the person's, made inside the window after the entry. One
  -- join by person and form, never a read of the bookings once an entry.
  followed as (
    select a.id, a.form_id, a.outside_form_id, p.appointment_id, p.standing
      from entered a
      cross join win
      join put p
        on p.contact_id = a.contact_id and p.form = coalesce(a.form_id, a.outside_form_id)
       and a.created_at <= p.made_at and a.created_at >= p.made_at - win.reach
  ),
  asked as (
    -- Whether a booking followed that is put down to the entry's form: as its main source (booked), or as one that
    -- helped (helped). The time it asked for, confirmed, names the form itself, so it is the form's.
    select a.id, a.form_id, a.outside_form_id, a.link_id, a.contact_id, a.new_person, a.talked, a.timed,
           coalesce(f.booked, false) as booked, coalesce(f.helped, false) as helped
      from entered a
      left join (select x.id, bool_or(x.standing = 'main') as booked, bool_or(x.standing = 'helped') as helped
                   from followed x
                  group by x.id) f on f.id = a.id
  ),
  -- A form's own totals, each person once however many places they came through or times they asked.
  people as (
    select a.form_id, a.outside_form_id, a.contact_id,
           bool_or(a.new_person) as new_person, bool_or(a.booked) as booked, bool_or(a.helped) as helped
      from asked a
     group by a.form_id, a.outside_form_id, a.contact_id
  ),
  -- The bookings themselves, each once: the ones a form in the window is the main source of.
  bookings as (
    select x.form_id, x.outside_form_id, count(distinct x.appointment_id) as appointments
      from followed x
     where x.standing = 'main'
     group by x.form_id, x.outside_form_id
  ),
  -- A sign-up confirmed, from its own event and at its own time (00489): the person's press on the link in the email
  -- their sign-up sent, which the yes door writes once a yes (set_email_offers_yes, source confirmed_signup, naming that
  -- email). It is the form's whose entry asked for the email: their newest sign-up not after it.
  confirms as (
    select v.id, x.outside_form_id
      from events v
      cross join win
      join messages g
        on g.tenant_id = v.tenant_id
       and g.id = case when v.data ->> 'message_id' ~ '^[0-9a-fA-F-]{36}$' then (v.data ->> 'message_id')::uuid end
      cross join lateral (
        select e.outside_form_id
          from form_entries e
         where e.tenant_id = p_tenant_id
           and e.contact_id = g.contact_id
           and e.form = 'signup' and e.outside_form_id is not null
           and e.state <> 'held' and not e.test
           and e.created_at <= g.created_at + interval '1 minute'
         order by e.created_at desc
         limit 1) x
     where v.tenant_id = p_tenant_id
       and v.kind = 'contact.consent_changed'
       and v.subject_type = 'contact'
       and v.data ->> 'source' = 'confirmed_signup'
       and v.data ->> 'consent' = 'opted_in'
       and v.created_at > win.since
  ),
  -- Each form owned elsewhere that has something to say of the window: an entry in it, or a confirmation in it.
  outside_forms as (
    select a.outside_form_id from asked a where a.outside_form_id is not null
    union
    select f.outside_form_id from confirms f
  )
  select jsonb_build_object(
    'window_days', public.credit_window_days(),
    'places', coalesce((
      select jsonb_agg(jsonb_build_object(
               'form_id', x.form_id, 'link_id', x.link_id, 'requests', x.requests, 'talked', x.talked,
               'visits', x.booked, 'booked', x.booked, 'helped', x.helped,
               'people', x.people, 'new_people', x.new_people, 'asked', x.asked))
        from (select a.form_id, a.link_id, count(*) as requests,
                     count(distinct a.contact_id) as people,
                     count(*) filter (where a.talked) as talked,
                     count(*) filter (where a.timed) as asked,
                     count(distinct a.contact_id) filter (where a.booked) as booked,
                     count(distinct a.contact_id) filter (where a.helped and not a.booked) as helped,
                     count(distinct a.contact_id) filter (where a.new_person) as new_people
                from asked a where a.form_id is not null group by a.form_id, a.link_id) x), '[]'::jsonb),
    'forms', coalesce((
      select jsonb_agg(jsonb_build_object(
               'form_id', x.form_id, 'requests', x.requests, 'talked', x.talked, 'asked', x.asked,
               'people', x.people, 'new_people', x.new_people, 'booked', x.booked, 'helped', x.helped,
               'appointments', x.appointments))
        from (select r.form_id, r.requests, r.talked, r.asked, q.people, q.new_people, q.booked, q.helped,
                     coalesce(b.appointments, 0) as appointments
                from (select a.form_id, count(*) as requests,
                             count(*) filter (where a.talked) as talked,
                             count(*) filter (where a.timed) as asked
                        from asked a where a.form_id is not null group by a.form_id) r
                join (select p.form_id, count(*) as people,
                             count(*) filter (where p.new_person) as new_people,
                             count(*) filter (where p.booked) as booked,
                             count(*) filter (where p.helped and not p.booked) as helped
                        from people p where p.form_id is not null group by p.form_id) q on q.form_id = r.form_id
                left join bookings b on b.form_id = r.form_id) x), '[]'::jsonb),
    'outside', coalesce((
      select jsonb_agg(jsonb_build_object(
               'outside_form_id', y.outside_form_id, 'entries', y.entries, 'talked', y.talked,
               'visits', y.booked, 'booked', y.booked, 'helped', y.helped, 'appointments', y.appointments,
               'people', y.people, 'new_people', y.new_people, 'confirmed', y.confirmed,
               'subscribers', y.subscribers))
        from (select o.outside_form_id,
                     coalesce(r.entries, 0) as entries, coalesce(r.talked, 0) as talked,
                     coalesce(q.people, 0) as people, coalesce(q.new_people, 0) as new_people,
                     coalesce(q.booked, 0) as booked, coalesce(q.helped, 0) as helped,
                     coalesce(b.appointments, 0) as appointments,
                     (select count(*) from confirms f where f.outside_form_id = o.outside_form_id) as confirmed,
                     -- Who has said yes today, apart: the form's people, from any day, whose yes to offers by email
                     -- stands now.
                     (select count(distinct e.contact_id)
                        from form_entries e
                        join contacts c on c.tenant_id = e.tenant_id and c.id = e.contact_id
                       where e.tenant_id = p_tenant_id and e.outside_form_id = o.outside_form_id
                         and e.form = 'signup' and e.state <> 'held' and not e.test
                         and c.email_marketing = 'opted_in'
                         and c.erased_at is null and c.merged_into_contact_id is null) as subscribers
                from outside_forms o
                left join (select a.outside_form_id, count(*) as entries,
                                  count(*) filter (where a.talked) as talked
                             from asked a where a.outside_form_id is not null
                            group by a.outside_form_id) r on r.outside_form_id = o.outside_form_id
                left join (select p.outside_form_id, count(*) as people,
                                  count(*) filter (where p.new_person) as new_people,
                                  count(*) filter (where p.booked) as booked,
                                  count(*) filter (where p.helped and not p.booked) as helped
                             from people p where p.outside_form_id is not null
                            group by p.outside_form_id) q on q.outside_form_id = o.outside_form_id
                left join bookings b on b.outside_form_id = o.outside_form_id) y), '[]'::jsonb),
    'opens', coalesce((
      select jsonb_agg(jsonb_build_object('link_id', o.link_id, 'opens', o.opens))
        from (select d.link_id, sum(d.opens) as opens
                from link_days d cross join win
               where d.tenant_id = p_tenant_id and d.day >= (win.since at time zone 'utc')::date
               group by d.link_id) o), '[]'::jsonb),
    'booking_opens', coalesce((
      select jsonb_agg(jsonb_build_object('form_id', b.form_id, 'opens', b.opens))
        from (select d.form_id, sum(d.booking_opens) as opens
                from form_days d cross join win
               where d.tenant_id = p_tenant_id and d.day >= (win.since at time zone 'utc')::date
               group by d.form_id) b), '[]'::jsonb));
$$;

comment on function public.form_results(uuid, integer) is
  'What a workspace''s forms brought over the last p_days (30; 1 to 366), read under the member''s own row rules (00680, 00691, 00709, 00732). places: each hosted form by the link each request came through (link_id null: none), with the requests, how many asked for a time (asked), how many became a conversation (talked), the people who asked (people), those new with their request (new_people), the people who booked from it (booked) and those it helped (helped). forms: each hosted form''s own totals, each person once however many places they came through, and appointments, the bookings themselves, each once. outside: each form owned elsewhere with its entries and the same counts; for a sign-up, confirmed, the confirmations made in the window, each counted once from its own event (contact.consent_changed, source confirmed_signup) for the form whose entry asked for the email pressed; and subscribers, the form''s people whose yes to offers by email stands today, whenever they signed up. Booked and helped are the one rule''s (booking_sources): a booking made inside window_days of the request, booked where the form is its main source (the form its time was asked for on, or the first thing its person touched), helped where another source is. A person is in booked or in helped, never both. visits is booked under its old name, for a dashboard from before 00732. Then each link''s opens, and how often each form''s business''s own booking page was opened from it (booking_opens). Held entries and tests are in no count.';

/* ---------------------------------------------------------------------------- 4. the people an ad brought -- */

create or replace function public.ad_people_in(p_tenant_id uuid, p_days integer, p_end date)
returns table (contact_id uuid, first_at timestamptz, ad_id uuid, booked boolean)
language sql
stable
set search_path = public
as $$
  with win as (
    -- The window people_series reads (00646): its days in the workspace's own zone, ending today or the earlier day asked.
    select ((e.day - (e.days - 1))::timestamp) at time zone e.tz as start_at,
           ((e.day + 1)::timestamp) at time zone e.tz as stop_at
      from (select t.timezone as tz,
                   least(greatest(coalesce(p_days, 30), 1), 90) as days,
                   least(coalesce(p_end, (now() at time zone t.timezone)::date),
                         (now() at time zone t.timezone)::date) as day
              from tenants t
             where t.id = p_tenant_id) e
  ),
  -- Who reached the business in the window, as the people report reads it: their own words, or a call that connected.
  reached as (
    select m.contact_id
      from messages m, win w
     where m.tenant_id = p_tenant_id
       and coalesce(m.meta->>'backfill', 'false') <> 'true'
       and m.created_at >= w.start_at and m.created_at < w.stop_at
       and m.direction = 'inbound' and m.sender = 'customer'
       and m.channel in ('whatsapp', 'sms', 'email')
       and public.message_is_a_persons_words(m.meta)
    union
    select k.contact_id
      from calls k, win w
     where k.tenant_id = p_tenant_id
       and k.started_at >= w.start_at and k.started_at < w.stop_at
       and k.direction = 'inbound'
       and public.call_connected(k.status, k.duration_ms)
  ),
  -- The new ones an ad brought: a first moment in the window, alive, not merged away, first touch an ad.
  came as (
    select c.id as contact_id, f.first_at, c.phone_e164, c.email, r.platform, r.ad
      from public.contact_first_moments(p_tenant_id) f
      join win w on f.first_at >= w.start_at and f.first_at < w.stop_at
      join contacts c on c.id = f.contact_id
     cross join lateral public.ad_ref_parts(c.acquired_ref) r
     where c.tenant_id = p_tenant_id
       and c.erased_at is null
       and c.merged_into_contact_id is null
       and c.acquired_via = 'ad'
       and c.id in (select x.contact_id from reached x)
  ),
  -- What each booking made since the window began is put down to (booking_sources, 00732): the ones an ad is the main
  -- source of.
  put as materialized (
    select s.contact_id, s.subject_id, s.subject_ref
      from win w
     cross join lateral public.booking_sources(p_tenant_id, w.start_at, null, null) s
     where s.subject_type = 'ad' and s.standing = 'main'
  )
  select x.contact_id, x.first_at, a.id,
         exists (select 1
                   from put p
                  where p.contact_id = x.contact_id
                    and case when a.id is null then p.subject_id is null and p.subject_ref = x.platform || ':' || x.ad
                             else p.subject_id = a.id end)
    from came x
    left join ads a on a.id = public.ad_held_for(p_tenant_id, x.platform, x.ad)
$$;

comment on function public.ad_people_in(uuid, integer, date) is
  'The people an ad brought in a window, a row a person (00651, 00732; decision 0049, calls 5 and 6): the same people people_series counts under "An ad" (a first moment in the window, reached the business in it, alive, not merged away, first touch an ad), each with the ad Chanlytics holds for their first touch (ad_held_for, 00666: an ad made here for a tap on any version of its words; null where it holds none) and whether they booked from it: a booking of theirs that the one rule puts down to that ad as its main source (booking_sources: made inside credit_window_days of their touch of the ad, the ad being what the booking names or the first thing they touched). Worked out when read, kept nowhere. SECURITY INVOKER: the caller''s RLS decides what is read.';

/* ---------------------------------------------------------------------------- 5. the people an ad brought back -- */

create or replace function public.ad_people_back(p_tenant_id uuid, p_days integer default 30, p_end date default null)
returns jsonb
language sql
stable
set search_path = public
as $$
  -- The window ad_people_in reads: its days in the workspace's own zone.
  with win as (
    select ((e.day - (e.days - 1))::timestamp) at time zone e.tz as start_at,
           ((e.day + 1)::timestamp) at time zone e.tz as stop_at
      from (select t.timezone as tz,
                   least(greatest(coalesce(p_days, 30), 1), 90) as days,
                   least(coalesce(p_end, (now() at time zone t.timezone)::date),
                         (now() at time zone t.timezone)::date) as day
              from tenants t
             where t.id = p_tenant_id) e
  ),
  -- Each message from an ad in the window, with its person: alive and not merged away.
  entries as (
    select e.platform, e.platform_ad_id, e.created_at, e.new_person, c.id as contact_id, c.phone_e164, c.email
      from ad_entries e
      join win w on e.created_at >= w.start_at and e.created_at < w.stop_at
      join messages m on m.id = e.message_id and m.tenant_id = e.tenant_id
      join contacts c on c.id = m.contact_id and c.tenant_id = m.tenant_id
     where e.tenant_id = p_tenant_id
       and e.kind = 'chat'
       and c.erased_at is null
       and c.merged_into_contact_id is null
  ),
  held as (
    select g.platform, g.platform_ad_id, public.ad_held_for(p_tenant_id, g.platform, g.platform_ad_id) as ad_id
      from (select distinct x.platform, x.platform_ad_id from entries x) g
  ),
  -- Each person once an ad: their first message from it in the window. One that made them is that ad's new person
  -- (ad_people_in counts them), so it brought them, and did not bring them back.
  firsts as (
    select distinct on (x.contact_id, h.ad_id)
           x.contact_id, h.ad_id, x.created_at as first_at, x.new_person, x.phone_e164, x.email,
           x.platform || ':' || x.platform_ad_id as ref
      from entries x
      join held h on h.platform = x.platform and h.platform_ad_id = x.platform_ad_id
     order by x.contact_id, h.ad_id, x.created_at
  ),
  -- What each booking made since the window began is put down to (booking_sources, 00732): the ads in it.
  put as materialized (
    select s.contact_id, s.made_at, s.subject_id, s.subject_ref, s.standing
      from win w
     cross join lateral public.booking_sources(p_tenant_id, w.start_at, null, null) s
     where s.subject_type = 'ad'
  ),
  back as (
    select f.contact_id, f.ad_id,
           exists (select 1
                     from put p
                    where p.contact_id = f.contact_id
                      and p.standing = 'main'
                      and p.made_at >= f.first_at
                      and case when f.ad_id is null then p.subject_id is null and p.subject_ref = f.ref
                               else p.subject_id = f.ad_id end)
             as booked
      from firsts f
     where not f.new_person
  )
  select jsonb_build_object(
           'ads', coalesce((select jsonb_agg(jsonb_build_object('ad_id', g.ad_id, 'people', g.people,
                                                                'booked', g.booked) order by g.ad_id)
                              from (select b.ad_id, count(*) as people, count(*) filter (where b.booked) as booked
                                      from back b
                                     where b.ad_id is not null
                                     group by b.ad_id) g), '[]'::jsonb),
           'unnamed', jsonb_build_object(
                        'people', (select count(*) from back b where b.ad_id is null),
                        'booked', (select count(*) from back b where b.ad_id is null and b.booked)),
           'all', jsonb_build_object(
                    'people', (select count(distinct b.contact_id) from back b),
                    'booked', (select count(distinct b.contact_id) from back b where b.booked)))
    from win
$$;

comment on function public.ad_people_back(uuid, integer, date) is
  'The people an ad brought back (the Ads tracking plan''s T3 and its call 2, 00678; 00732): someone already known who wrote from an ad in the window (ad_people_in''s), alive and not merged away, counted once an ad by their first message from it there, and left out where that message is the one that made them (the ad brought them: ad_people_in counts them). Booked after: a booking of theirs, made at or after that message, that the one rule puts down to that ad as its main source (booking_sources: made inside credit_window_days of their touch of the ad, the ad being what the booking names or the first thing they touched; a visit with no moment it was made that the record can prove is never after). {ads: [{ad_id, people, booked}], unnamed: {people, booked} for ads Chanlytics cannot name, all: {people, booked}, each person once}. Never added to the people an ad brought, nor to the cost of a booked person. Null for a workspace nobody can read. SECURITY INVOKER.';

/* ---------------------------------------------------------------------------- 6. the Ads page's totals -- */

create or replace function public.ads_page_counts(p_tenant_id uuid, p_days integer default 30, p_end date default null)
returns jsonb
language sql
stable
set search_path = public
as $$
  with win as (
    select e.day - (e.days - 1) as from_day, e.day as to_day,
           ((e.day - (e.days - 1))::timestamp) at time zone e.tz as start_at
      from (select t.timezone as tz,
                   least(greatest(coalesce(p_days, 30), 1), 90) as days,
                   least(coalesce(p_end, (now() at time zone t.timezone)::date),
                         (now() at time zone t.timezone)::date) as day
              from tenants t
             where t.id = p_tenant_id) e
  ),
  -- The people an ad brought, read once: the counts and the worth below are of the same people.
  brought as materialized (
    select p.contact_id, p.first_at, p.ad_id, p.booked
      from public.ad_people_in(p_tenant_id, p_days, p_end) p
  ),
  by_ad as (
    select p.ad_id, count(*) as people, count(*) filter (where p.booked) as booked
      from brought p
     group by p.ad_id
  ),
  -- What each ad's platform says it spent in the same days: the platform's half, in the account's own days.
  spent as (
    select d.ad_id, sum(d.spend_minor)::bigint as spend_minor, sum(d.impressions)::bigint as impressions,
           sum(d.clicks)::bigint as clicks, sum(d.platform_results)::bigint as platform_results,
           bool_or(not d.settled) as settling
      from ad_days d, win w
     where d.tenant_id = p_tenant_id and d.day >= w.from_day and d.day <= w.to_day
     group by d.ad_id
  ),
  -- The bookings that make an ad's people booked (ad_people_in's own rule: the ones the ad is the main source of,
  -- booking_sources, 00732), each once, with what it is worth: its own stamp, or nothing, and it is left out.
  put as materialized (
    select s.contact_id, s.subject_id, s.worth_minor, s.worth_currency
      from win w
     cross join lateral public.booking_sources(p_tenant_id, w.start_at, null, null) s
     where s.subject_type = 'ad' and s.standing = 'main'
  ),
  visits as (
    select p.ad_id, s.worth_minor as minor, s.worth_currency as currency
      from brought p
      join put s on s.contact_id = p.contact_id and s.subject_id = p.ad_id
     where p.booked and p.ad_id is not null
  ),
  worth as (
    select x.ad_id,
           count(*) filter (where x.minor is not null) as visits,
           count(*) filter (where x.minor is null) as left_out,
           coalesce((select jsonb_agg(jsonb_build_object('currency', s.currency, 'minor', s.minor) order by s.currency)
                       from (select y.currency, sum(y.minor)::bigint as minor
                               from visits y
                              where y.ad_id = x.ad_id and y.minor is not null
                              group by y.currency) s), '[]'::jsonb) as sums
      from visits x
     group by x.ad_id
  )
  select jsonb_build_object(
           'from', w.from_day,
           'to', w.to_day,
           'window_days', public.credit_window_days(),
           'ads', coalesce((select jsonb_agg(jsonb_build_object('ad_id', b.ad_id, 'people', b.people,
                                                                'booked', b.booked))
                              from by_ad b where b.ad_id is not null), '[]'::jsonb),
           'unnamed', jsonb_build_object(
                        'people', coalesce((select b.people from by_ad b where b.ad_id is null), 0),
                        'booked', coalesce((select b.booked from by_ad b where b.ad_id is null), 0)),
           'spend', coalesce((select jsonb_agg(jsonb_build_object(
                                       'ad_id', s.ad_id, 'spend_minor', s.spend_minor,
                                       'impressions', s.impressions, 'clicks', s.clicks,
                                       'platform_results', s.platform_results, 'settling', s.settling))
                                from spent s), '[]'::jsonb),
           'worth', coalesce((select jsonb_agg(jsonb_build_object(
                                       'ad_id', x.ad_id, 'sums', x.sums,
                                       'visits', x.visits, 'left_out', x.left_out) order by x.ad_id)
                                from worth x), '[]'::jsonb))
    from win w
$$;

comment on function public.ads_page_counts(uuid, integer, date) is
  'The Ads page''s totals for a window, counted whole (00651, 00732; decision 0049, calls 3, 5 and 6): ads, a row an ad Chanlytics holds that brought someone (ad_id, people, booked); unnamed, the people from an ad it cannot name, as one count; spend, what each ad''s platform says it spent, was shown and was tapped in the same days, with whether any of them is still moving (settling); and worth (00683; the Ads tracking plan''s T6), for each ad whose people booked, what their bookings are worth: sums, one a currency and never across (call 9), visits, how many are in them, and left_out, how many have no amount. The bookings are the ones that make its people booked: those the one rule puts down to the ad as its main source (booking_sources, inside window_days of the touch), each once and at the worth stamped on it (appointments.worth_minor); one with none is left out, and counted. The people are ad_people_in''s, so ads plus unnamed is the count people_series says under "An ad". Null for a workspace nobody can read. SECURITY INVOKER.';

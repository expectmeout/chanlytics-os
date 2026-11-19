-- 00651 · The Ads page counts the people an ad brought (decision 0049, calls 5 and 6, as amended: totals counted
-- whole; the Ads build plan's step 2, part 5: the page).
--
-- Since 00650 a connected account's ads and what each spent are kept. This is the other half of the page, worked out
-- when read and kept nowhere (0049, call 3): who each ad brought, and who of them has booked since.
--
--   ad_ref_parts     A first touch's reference (contacts.acquired_ref) as its platform and the platform's id for the
--                    ad: the one reading of it, which ad_named and the page's counts both ask.
--   ad_named         Re-made: an ad Chanlytics holds says its own name (ads.name, the name its owner gave it at the
--                    platform); one it does not hold keeps the headline an entry kept, as before.
--   ad_people_in     The people an ad brought in a window, a row a person: the same people the people report counts
--                    under "An ad" (people_series, 00646: reached the business in the window, for the first time, alive
--                    and not merged away), each with the ad Chanlytics holds for their first touch (none where it holds
--                    none) and whether they have booked since: a visit in the record (appointments, decision 0002)
--                    that starts after their first touch and is neither cancelled nor only asked for, theirs by the
--                    record's own link or, where a visit names no person, by the number or the address it carries.
--   ads_page_counts  The page's totals, counted whole: for each ad its people and how many booked, the people from an
--                    ad Chanlytics cannot name as one count, and what each ad's platform says it spent in the same
--                    days, with whether any of those days is still moving.
--   ad_people        One ad's people, newest first, a page at a time; the ones from an ad nobody can name where no ad
--                    is given.
--
-- A member's reads, under their own row rules (SECURITY INVOKER): each reads only what the caller's session may.
-- A person is counted once, for the ad they first got in touch through; two records of one person merged are one
-- person, at the earlier first touch, because the record merged away is not counted and its history is the kept one's.
--
-- Deploy order: either. A dashboard ahead of this reads no counts and draws the page as it was; a database ahead of
-- the dashboard answers functions nothing calls yet. Re-runnable.

set local lock_timeout = '3s';

/* ----------------------------------------------------------------------------- 1. a first touch's reference, read -- */

create or replace function public.ad_ref_parts(p_ref text)
returns table (platform text, ad text)
language sql
immutable
set search_path = public
as $$
  select case when p_ref ~ '^(meta|google|tiktok):.' then split_part(p_ref, ':', 1)
              when btrim(coalesce(p_ref, '')) = '' then null
              else 'meta' end,
         case when p_ref ~ '^(meta|google|tiktok):.' then substr(p_ref, strpos(p_ref, ':') + 1)
              else nullif(btrim(p_ref), '') end
$$;

revoke all on function public.ad_ref_parts(text) from public, anon;
grant execute on function public.ad_ref_parts(text) to authenticated, service_role;
comment on function public.ad_ref_parts(text) is
  'A first touch''s reference (contacts.acquired_ref) as its platform and the platform''s id for the ad (00651, decision 0049 call 4): keyed by its platform (meta:<id>, google:<id>, tiktok:<id>) it is read by its key; a bare id is one a WhatsApp or Instagram message carried, which is Meta''s; no reference names no platform and no ad. The one reading of a reference: ad_named and the Ads page''s counts both ask it.';

create or replace function public.ad_named(p_tenant_id uuid, p_ref text)
returns jsonb
language sql
stable
set search_path = public
as $$
  select jsonb_build_object(
           'platform', r.platform,
           'name', coalesce(
                     (select a.name
                        from public.ads a
                       where a.tenant_id = p_tenant_id
                         and a.platform = r.platform
                         and a.platform_ad_id = r.ad),
                     (select e.said ->> 'headline'
                        from public.ad_entries e
                       where e.tenant_id = p_tenant_id
                         and e.platform = r.platform
                         and e.platform_ad_id = r.ad
                         and e.said ? 'headline'
                       order by e.created_at desc
                       limit 1)))
    from public.ad_ref_parts(p_ref) r
$$;

comment on function public.ad_named(uuid, text) is
  'The ad a first touch names (contacts.acquired_ref), as a page says it (decision 0049, call 2; 00646, 00651): its platform, and its name. An ad Chanlytics holds (ads, 00648) says its own name, the one its owner gave it at the platform; one it does not hold says the headline the newest entry kept for it (ad_entries.said, 00644), or null where none did: an ad Chanlytics cannot name yet. The reference is read by ad_ref_parts. The one place an ad gets its name, so a person''s page, the people report and the Ads page cannot call one ad two things. Names nobody and counts nothing. SECURITY INVOKER: the caller''s RLS decides what is read.';

/* ------------------------------------------------------------------------------ 2. the people an ad brought -- */

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
  )
  select x.contact_id, x.first_at, a.id,
         exists (select 1
                   from appointments v
                  where v.tenant_id = p_tenant_id
                    and v.starts_at > x.first_at
                    and v.status not in ('cancelled', 'proposed')
                    and (v.contact_id = x.contact_id
                         or (v.contact_id is null
                             and ((v.client_phone is not null and v.client_phone = x.phone_e164)
                                  or (v.client_email is not null and lower(v.client_email) = lower(x.email))))))
    from came x
    left join ads a on a.tenant_id = p_tenant_id and a.platform = x.platform and a.platform_ad_id = x.ad
$$;

revoke all on function public.ad_people_in(uuid, integer, date) from public, anon;
grant execute on function public.ad_people_in(uuid, integer, date) to authenticated, service_role;
comment on function public.ad_people_in(uuid, integer, date) is
  'The people an ad brought in a window, a row a person (00651; decision 0049, calls 5 and 6): the same people people_series counts under "An ad" (a first moment in the window, reached the business in it, alive, not merged away, first touch an ad), each with the ad Chanlytics holds for their first touch (null where it holds none) and whether they have booked since: a visit in the record (appointments) that starts after their first touch and is neither cancelled nor only asked for, theirs by the record''s link or, where a visit names no person, by its number or address. Worked out when read, kept nowhere. SECURITY INVOKER: the caller''s RLS decides what is read.';

/* ------------------------------------------------------------------------------------- 3. the page's totals --- */

create or replace function public.ads_page_counts(p_tenant_id uuid, p_days integer default 30, p_end date default null)
returns jsonb
language sql
stable
set search_path = public
as $$
  with win as (
    select e.day - (e.days - 1) as from_day, e.day as to_day
      from (select least(greatest(coalesce(p_days, 30), 1), 90) as days,
                   least(coalesce(p_end, (now() at time zone t.timezone)::date),
                         (now() at time zone t.timezone)::date) as day
              from tenants t
             where t.id = p_tenant_id) e
  ),
  by_ad as (
    select p.ad_id, count(*) as people, count(*) filter (where p.booked) as booked
      from public.ad_people_in(p_tenant_id, p_days, p_end) p
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
  )
  select jsonb_build_object(
           'from', w.from_day,
           'to', w.to_day,
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
                                from spent s), '[]'::jsonb))
    from win w
$$;

revoke all on function public.ads_page_counts(uuid, integer, date) from public, anon;
grant execute on function public.ads_page_counts(uuid, integer, date) to authenticated, service_role;
comment on function public.ads_page_counts(uuid, integer, date) is
  'The Ads page''s totals for a window, counted whole (00651; decision 0049, calls 3, 5 and 6): ads, a row an ad Chanlytics holds that brought someone (ad_id, people, booked); unnamed, the people from an ad it cannot name, as one count; and spend, what each ad''s platform says it spent, was shown and was tapped in the same days, with whether any of them is still moving (settling). The people are ad_people_in''s, so ads plus unnamed is the count people_series says under "An ad". Null for a workspace nobody can read. SECURITY INVOKER.';

/* ---------------------------------------------------------------------------------------- 4. one ad's people --- */

create or replace function public.ad_people(
  p_tenant_id uuid, p_ad_id uuid default null, p_days integer default 30, p_end date default null,
  p_limit integer default 50, p_offset integer default 0
)
returns jsonb
language sql
stable
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
                    'contact_id', x.contact_id, 'first_at', x.first_at, 'booked', x.booked,
                    'display_name', x.display_name, 'wa_profile_name', x.wa_profile_name,
                    'phone_e164', x.phone_e164)
                  order by x.first_at desc), '[]'::jsonb)
    from (select p.contact_id, p.first_at, p.booked, c.display_name, c.wa_profile_name, c.phone_e164
            from public.ad_people_in(p_tenant_id, p_days, p_end) p
            join contacts c on c.id = p.contact_id
           where p.ad_id is not distinct from p_ad_id
           order by p.first_at desc
           limit least(greatest(coalesce(p_limit, 50), 1), 200)
          offset greatest(coalesce(p_offset, 0), 0)) x
$$;

revoke all on function public.ad_people(uuid, uuid, integer, date, integer, integer) from public, anon;
grant execute on function public.ad_people(uuid, uuid, integer, date, integer, integer) to authenticated, service_role;
comment on function public.ad_people(uuid, uuid, integer, date, integer, integer) is
  'One ad''s people in a window, newest first, a page at a time (00651; decision 0049, call 5): who first got in touch through the ad, when, whether they have booked since, and what names them. The ones from an ad Chanlytics cannot name where p_ad_id is null. The same people ads_page_counts counts (ad_people_in). SECURITY INVOKER.';

-- 00678 · A conversation says its ad, Meta's count stands beside Chanlytics', and an ad counts the people it brought
-- back (the Ads tracking plan's T1, T2 and T3, 21 Nov 2026; its calls 1, 2 and 6, taken as recommended).
--
-- An entry (ad_entries, 00644) is a message that came from an ad: a person who wrote, never a click on the ad. Each
-- read below is a member's, under their own row rules (SECURITY INVOKER), and names the ad by the one rule that does
-- (ad_held_for, 00666; ad_named, 00651).
--
--   ad_entries_in_time  The entries by workspace and time: the two counts below each read a window of them.
--   ad_touches_of       The shared record's reader over ad_entries (the content loop PRD's Appendix A.2), for a
--                       thread: the entries some messages opened, and the ads some first touches name, each with the
--                       ad Chanlytics holds for it and its name. The Inbox asks it only for threads whose person came
--                       from an ad or whose messages carry one, so a thread with no ad costs no read.
--   ad_chats_kept       Meta's count beside Chanlytics' (T2): for each ad that opens a chat the workspace hears, over
--                       the window's days Meta has settled, the chats Meta says it started and the entries Chanlytics
--                       kept on those days, new people and known ones alike. The rule that reads them is contracts'
--                       adChatsKeptRule.
--   ad_people_back      The people an ad brought back (T3, call 2): someone already known who wrote from an ad in the
--                       window, once an ad, and whether they booked after: a visit asked for in a chat and confirmed
--                       there, or one a member added, made after that message and starting after it (the PRD's A.6).
--                       A visit read in from a calendar, a booking email or a tool is never "after": its row's time is
--                       only when Chanlytics first saw it. A line of its own, never added to the people an ad brought.
--
-- Deploy order: either. A dashboard ahead of this reads no line and draws the page and the Inbox as they were; a
-- database ahead of the dashboard answers functions nothing calls yet. Re-runnable.

set local lock_timeout = '3s';

/* ---------------------------------------------------------------------------- 1. the entries, by time -- */

create index if not exists ad_entries_in_time on public.ad_entries (tenant_id, created_at);

/* ---------------------------------------------------------------------------- 2. a thread's ad -- */

create or replace function public.ad_touches_of(p_tenant_id uuid, p_messages uuid[], p_refs text[])
returns jsonb
language sql
stable
set search_path = public
as $$
  -- The entries these messages opened (one a message, ad_entries_one_a_message), each named by its ad's reference.
  with touched as (
    select e.message_id, e.platform || ':' || e.platform_ad_id as ref
      from ad_entries e
     where e.tenant_id = p_tenant_id
       and e.message_id = any (coalesce(p_messages[1:500], '{}'::uuid[]))
  ),
  refs as (
    select distinct r.ref
      from (select t.ref from touched t
            union all
            select unnest(coalesce(p_refs[1:200], '{}'::text[]))) r
     where btrim(coalesce(r.ref, '')) <> ''
  ),
  -- Each reference once: the ad Chanlytics holds for it, and its name as every page says it.
  named as (
    select r.ref,
           public.ad_held_for(p_tenant_id, x.platform, x.ad) as ad_id,
           public.ad_named(p_tenant_id, r.ref) ->> 'name' as name
      from refs r
     cross join lateral public.ad_ref_parts(r.ref) x
     where x.platform is not null and x.ad is not null
  )
  select jsonb_build_object(
           'touches', coalesce((select jsonb_agg(jsonb_build_object('message_id', t.message_id, 'ref', t.ref))
                                  from touched t), '[]'::jsonb),
           'named', coalesce((select jsonb_agg(jsonb_build_object('ref', n.ref, 'ad_id', n.ad_id, 'name', n.name))
                                from named n), '[]'::jsonb))
$$;

revoke all on function public.ad_touches_of(uuid, uuid[], text[]) from public, anon;
grant execute on function public.ad_touches_of(uuid, uuid[], text[]) to authenticated, service_role;
comment on function public.ad_touches_of(uuid, uuid[], text[]) is
  'The shared record''s reader over ad_entries for a thread (the content loop PRD''s Appendix A.2; the Ads tracking plan''s T1, 00678): of p_messages (500 at most), the entries they opened, each named by its ad''s reference; and for every reference, those and p_refs (200 at most, first touches as contacts.acquired_ref keeps them), the ad Chanlytics holds for it (ad_held_for) and its name (ad_named). {touches: [{message_id, ref}], named: [{ref, ad_id, name}]}. Counts nothing. SECURITY INVOKER: the caller''s RLS decides what is read.';

/* ---------------------------------------------------------------------------- 3. Meta's count beside ours -- */

create or replace function public.ad_chats_kept(p_tenant_id uuid, p_days integer default 30, p_end date default null)
returns jsonb
language sql
stable
set search_path = public
as $$
  -- The days the page counts (ads_page_counts' window).
  with win as (
    select e.day - (e.days - 1) as from_day, e.day as to_day
      from (select least(greatest(coalesce(p_days, 30), 1), 90) as days,
                   least(coalesce(p_end, (now() at time zone t.timezone)::date),
                         (now() at time zone t.timezone)::date) as day
              from tenants t
             where t.id = p_tenant_id) e
  ),
  -- Each ad whose chat the workspace hears (a WhatsApp number or an Instagram account of its own), and its days in the
  -- window that Meta has settled with a count of chats, in its account's zone. An ad that opens Messenger, a website or
  -- a wire the workspace does not hear is never compared: nothing it brings could reach Chanlytics.
  settled as (
    select d.ad_id, d.day, d.platform_results, coalesce(c.timezone, 'UTC') as zone
      from ad_days d
      join ads a on a.id = d.ad_id and a.tenant_id = d.tenant_id
      join ad_accounts c on c.id = a.account_id and c.tenant_id = a.tenant_id
     cross join win w
     where d.tenant_id = p_tenant_id
       and d.day >= w.from_day and d.day <= w.to_day
       and d.settled and d.platform_results is not null
       and a.door in ('whatsapp', 'instagram')
       and exists (select 1 from tenant_channels h
                    where h.tenant_id = p_tenant_id and h.kind = a.door and h.status = 'active')
  ),
  -- The entries kept across the window, a day wider each way: an account's zone is not the workspace's.
  entries as (
    select e.platform, e.platform_ad_id, e.created_at
      from ad_entries e, win w
     where e.tenant_id = p_tenant_id
       and e.created_at >= (w.from_day - 1)::timestamp at time zone 'UTC'
       and e.created_at < (w.to_day + 2)::timestamp at time zone 'UTC'
  ),
  -- The ad Chanlytics holds for each platform id, asked once an id: an ad made here is three ads at Meta.
  held as (
    select g.platform, g.platform_ad_id, public.ad_held_for(p_tenant_id, g.platform, g.platform_ad_id) as ad_id
      from (select distinct x.platform, x.platform_ad_id from entries x) g
  ),
  kept as (
    select h.ad_id, (x.created_at at time zone z.zone)::date as day, count(*) as n
      from entries x
      join held h on h.platform = x.platform and h.platform_ad_id = x.platform_ad_id
      join (select distinct s.ad_id, s.zone from settled s) z on z.ad_id = h.ad_id
     group by h.ad_id, 2
  ),
  by_ad as (
    select s.ad_id, sum(s.platform_results)::bigint as meta, coalesce(sum(k.n), 0)::bigint as kept,
           max(s.day) as through
      from settled s
      left join kept k on k.ad_id = s.ad_id and k.day = s.day
     group by s.ad_id
  )
  select coalesce(jsonb_agg(jsonb_build_object('ad_id', b.ad_id, 'name', a.name, 'meta', b.meta, 'kept', b.kept,
                                               'through', b.through)
                            order by b.ad_id), '[]'::jsonb)
    from by_ad b
    join ads a on a.id = b.ad_id
$$;

revoke all on function public.ad_chats_kept(uuid, integer, date) from public, anon;
grant execute on function public.ad_chats_kept(uuid, integer, date) to authenticated, service_role;
comment on function public.ad_chats_kept(uuid, integer, date) is
  'Meta''s count beside Chanlytics'' (the Ads tracking plan''s T2, 00678): for each ad that opens a chat the workspace hears (door whatsapp or instagram, with an active route of that kind), over the window''s days Meta has settled (ad_days.settled, with a count of chats), the chats Meta says it started (meta), the entries Chanlytics kept on those days in the ad''s account zone (kept: new people and known ones alike, each by ad_held_for), and the last of those days (through). Ads with no settled day are left out. The window is ads_page_counts''. Meta counts a chat written within seven days of a tap and Chanlytics an entry when its message arrives, so the two are never equal: contracts adChatsKeptRule says when they have parted. Counts only. SECURITY INVOKER.';

/* ---------------------------------------------------------------------------- 4. the people an ad brought back -- */

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
           x.contact_id, h.ad_id, x.created_at as first_at, x.new_person, x.phone_e164, x.email
      from entries x
      join held h on h.platform = x.platform and h.platform_ad_id = x.platform_ad_id
     order by x.contact_id, h.ad_id, x.created_at
  ),
  back as (
    select f.contact_id, f.ad_id,
           exists (select 1
                     from appointments v
                    where v.tenant_id = p_tenant_id
                      and v.source in ('receptionist', 'person')
                      and v.status not in ('cancelled', 'proposed')
                      and v.created_at > f.first_at
                      and v.starts_at > f.first_at
                      and (v.contact_id = f.contact_id
                           or (v.contact_id is null
                               and ((v.client_phone is not null and v.client_phone = f.phone_e164)
                                    or (v.client_email is not null and lower(v.client_email) = lower(f.email))))))
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

revoke all on function public.ad_people_back(uuid, integer, date) from public, anon;
grant execute on function public.ad_people_back(uuid, integer, date) to authenticated, service_role;
comment on function public.ad_people_back(uuid, integer, date) is
  'The people an ad brought back (the Ads tracking plan''s T3 and its call 2, 00678): someone already known who wrote from an ad in the window (ad_people_in''s), alive and not merged away, counted once an ad by their first message from it there, and left out where that message is the one that made them (the ad brought them: ad_people_in counts them). Booked after: a visit of theirs asked for in a chat and confirmed (source receptionist) or added by a member (source person), neither cancelled nor only asked for, whose row was made after that message and which starts after it (the content loop PRD''s A.6); a visit read in from a calendar, a booking email or a tool is never after, its row''s time being only when Chanlytics first saw it. {ads: [{ad_id, people, booked}], unnamed: {people, booked} for ads Chanlytics cannot name, all: {people, booked}, each person once}. Never added to the people an ad brought, nor to the cost of a booked person. Null for a workspace nobody can read. SECURITY INVOKER.';

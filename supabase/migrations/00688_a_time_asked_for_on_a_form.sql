-- 00688 · A time asked for on a form is the same request a chat opens, and is answered as one (the Forms plan, step F3;
-- Ruben's call 8 of 22 November 2026: "Ask for this time" is a request the business confirms; the form follows the
-- workspace's own booking setting).
--
-- 00443 holds a time a customer picked in a chat for the owner: a proposed visit (appointments, source receptionist)
-- that takes its time for 23 hours at most and never past an hour before it, one open request per person, answered
-- Booked it or Can't (booking_request_answer). Its door also hands the thread to a person (a booking_request hold), and
-- names the thread. A form's request is never a hand-over (the plan's call 14: AI still answers the person the moment
-- they write in), and its person may have no thread at all. So a time asked for on a form is the same row, held the
-- same way and answered by the same door, opened with no thread and no hold, and named from the entry that asked for it
-- (form_entry_links kind visit, which 00680 made for this). The owner answers it on the request itself.
--
--   form_time_request_take  The hosted form's one write with a time asked for: form_request_take, then, for an entry
--                           accepted with its person, the time held for its owner, both in one transaction. The person's
--                           open request before it is cancelled (decision 0061's one open request per person); where a
--                           chat held that one for a person, its hold becomes a reply owed, as Can't leaves it. A time an
--                           hour away or less is held for nobody (too_soon), and the entry is kept as a plain request.
--                           A held entry and a test hold no time. The service role's.
--   form_days, form_booking_open
--                           A business that sends people to its own booking page (the plan's F3 table): an open of that
--                           page from a form is counted by day, as a link's opens are. A count, never a visitor.
--   form_requests_open      Re-made: each request also says the time it asked for, where it asked for one.
--   form_results            Re-made: each place also says how many of its requests asked for a time, and each form how
--                           often its business's booking page was opened from it.
--
-- Nothing else moves: booking_request_open and booking_request_answer are as 00443 and 00679 left them. The request
-- clock (booking_requests_due) reads only requests held in a thread, so a form's request is never told to anyone by
-- itself: past its time it holds nothing, Booked it is refused (expired), and it waits in Needs you for its reply.
--
-- Deploy order: this file first, then the code. The code before it names nothing here; the re-made reads answer a
-- superset of what they answered. No event kind, subscriber, job kind or notice kind is new. Re-runnable.

set local lock_timeout = '3s';

/* ----------------------------------------------------------------------------- 1. a time asked for, taken -- */

create or replace function public.form_time_request_take(
  p_tenant_id  uuid,
  p_form_id    uuid,
  p_version_id uuid,
  p_ref        text,
  p_answers    jsonb,
  p_reach      jsonb,
  p_words      text,
  p_starts_at  timestamptz,
  p_ends_at    timestamptz,
  p_service    text,
  p_timezone   text,
  p_source     jsonb default null,
  p_link_code  text default null,
  p_test       boolean default false,
  p_held_why   text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_taken    jsonb;
  v_entry    uuid;
  v_contact  public.contacts%rowtype;
  v_expires  timestamptz;
  v_id       uuid;
  v_held     record;
  v_gone     record;
  v_service  text := nullif(btrim(coalesce(p_service, '')), '');
begin
  if p_starts_at is null or p_ends_at is null or nullif(btrim(coalesce(p_timezone, '')), '') is null then
    raise exception 'form_time_request_take: a time asked for has a start, an end and a clock' using errcode = '22004';
  end if;
  if p_ends_at <= p_starts_at then
    raise exception 'form_time_request_take: a time ends after it starts' using errcode = '22023';
  end if;
  v_taken := public.form_request_take(p_tenant_id, p_form_id, p_version_id, p_ref, p_answers, p_reach, p_words,
                                      p_source, p_link_code, p_test, p_held_why);
  v_entry := (v_taken ->> 'entry_id')::uuid;
  -- The same press sent twice: the time it held the first time, as it stands.
  if v_taken ->> 'outcome' = 'again' then
    select a.id, a.expires_at into v_held
      from public.form_entry_links k
      join public.appointments a on a.tenant_id = k.tenant_id and a.id = k.appointment_id
     where k.tenant_id = p_tenant_id and k.entry_id = v_entry and k.kind = 'visit'
     order by k.created_at desc limit 1;
    if found then
      return v_taken || jsonb_build_object('time', jsonb_build_object('appointment_id', v_held.id,
                                                                      'expires_at', v_held.expires_at));
    end if;
    return v_taken;
  end if;
  -- Held, a test, closed, stale or forgotten: no person to hold a time for, or nothing kept at all.
  if v_taken ->> 'outcome' <> 'accepted' then
    return v_taken;
  end if;
  -- 23 hours, and never past an hour before the time (00443, as 00679 left it): the same clock as a chat's request.
  v_expires := least(now() + interval '23 hours', p_starts_at - interval '1 hour');
  if v_expires <= now() then
    return v_taken || jsonb_build_object('time', jsonb_build_object('error', 'too_soon'));
  end if;
  select * into v_contact from public.contacts c
   where c.tenant_id = p_tenant_id and c.id = (v_taken ->> 'contact_id')::uuid;
  if not found then
    raise exception 'form_time_request_take: the entry''s person is not there' using errcode = 'P0002';
  end if;
  -- One open request per person (decision 0061): the one they asked for before is cancelled, its time free again.
  -- Where a chat held that one for a person, the hold becomes a reply owed, as Can't leaves it: they asked again here.
  for v_gone in
    update public.appointments a set status = 'cancelled'
     where a.tenant_id = p_tenant_id and a.contact_id = v_contact.id
       and a.source = 'receptionist' and a.status = 'proposed'
    returning a.conversation_id, a.starts_at, a.timezone, a.service
  loop
    if v_gone.conversation_id is not null and exists (
         select 1 from public.escalations e
          where e.tenant_id = p_tenant_id and e.conversation_id = v_gone.conversation_id
            and e.state = 'open' and e.reason = 'booking_request') then
      perform public.escalation_open(
        p_tenant_id, v_gone.conversation_id, 'booking_reply',
        'Asked for '
        || to_char(p_starts_at at time zone p_timezone, 'Dy FMDD Mon, FMHH12:MI AM')
        || ' on a form instead of '
        || to_char(v_gone.starts_at at time zone v_gone.timezone, 'Dy FMDD Mon, FMHH12:MI AM')
        || ': reply to them');
    end if;
  end loop;
  insert into public.appointments (tenant_id, contact_id, conversation_id, source, status, starts_at, ends_at,
                                   title, service, client_name, client_phone, client_email, timezone, expires_at)
  values (p_tenant_id, v_contact.id, null, 'receptionist', 'proposed', p_starts_at, p_ends_at, v_service, v_service,
          coalesce(nullif(btrim(coalesce(v_contact.display_name, '')), ''),
                   nullif(btrim(coalesce(v_contact.wa_profile_name, '')), '')),
          v_contact.phone_e164, v_contact.email, p_timezone, v_expires)
  returning id into v_id;
  -- The visit asked for is the entry's: what it answered, and where it came from, are read through it.
  insert into public.form_entry_links (tenant_id, entry_id, kind, appointment_id)
  values (p_tenant_id, v_entry, 'visit', v_id);
  return v_taken || jsonb_build_object('time', jsonb_build_object('appointment_id', v_id, 'expires_at', v_expires));
end $$;

revoke all on function public.form_time_request_take(uuid, uuid, uuid, text, jsonb, jsonb, text, timestamptz,
                                                     timestamptz, text, text, jsonb, text, boolean, text)
  from public, anon, authenticated;
grant execute on function public.form_time_request_take(uuid, uuid, uuid, text, jsonb, jsonb, text, timestamptz,
                                                        timestamptz, text, text, jsonb, text, boolean, text)
  to service_role;
comment on function public.form_time_request_take(uuid, uuid, uuid, text, jsonb, jsonb, text, timestamptz, timestamptz,
                                                  text, text, jsonb, text, boolean, text) is
  'The hosted form''s one write with a time asked for (00688; the Forms plan, F3; decision 0061): form_request_take, then for an entry accepted with its person the same request a chat opens, in one transaction: a proposed visit (source receptionist) held until the sooner of 23 hours on and an hour before it, with no thread and no hold (a form''s request is never a hand-over), the person''s open request before it cancelled (one held in a chat leaves a reply owed there), and the visit named from the entry (form_entry_links visit). Answers form_request_take''s answer with `time`: {appointment_id, expires_at}, or {error: too_soon} for a time an hour away or less (the entry is kept as a plain request), or none where no time was held (held, a test, closed, stale, forgotten). The same press again answers the time it held. The service role''s alone.';

/* ---------------------------------------------------------------- 2. a business's own booking page, opened -- */

create table if not exists public.form_days (
  form_id        uuid not null,
  tenant_id      uuid not null references public.tenants (id) on delete cascade,
  day            date not null,
  booking_opens  integer not null default 0 check (booking_opens >= 0),
  constraint form_days_pkey primary key (form_id, day),
  -- A day is its form's, in its form's own workspace (as 00279 has every child name its parent).
  constraint form_days_form_id_same_workspace foreign key (tenant_id, form_id)
    references public.forms (tenant_id, id) on delete cascade
);

create index if not exists form_days_workspace on public.form_days (tenant_id, form_id, day);

alter table public.form_days enable row level security;
drop policy if exists form_days_member_select on public.form_days;
create policy form_days_member_select on public.form_days
  for select to authenticated
  using (tenant_id in (select m.tenant_id from public.memberships m where m.user_id = (select auth.uid())));
revoke all on public.form_days from anon, authenticated;
grant select on public.form_days to authenticated;
grant all on public.form_days to service_role;

comment on table public.form_days is
  'What a form brought by day (UTC) that is no entry (00688): how often the business''s own booking page was opened from it, written by form_booking_open alone. A count, never a visitor: no cookie, no address, and nothing booked there is claimed.';

create or replace function public.form_booking_open(p_tenant_id uuid, p_form_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.forms f
                  where f.tenant_id = p_tenant_id and f.id = p_form_id and f.state = 'live') then
    return false;
  end if;
  insert into public.form_days as d (form_id, tenant_id, day, booking_opens)
  values (p_form_id, p_tenant_id, (now() at time zone 'utc')::date, 1)
  on conflict (form_id, day) do update set booking_opens = d.booking_opens + 1;
  return true;
end $$;

revoke all on function public.form_booking_open(uuid, uuid) from public, anon, authenticated;
grant execute on function public.form_booking_open(uuid, uuid) to service_role;
comment on function public.form_booking_open(uuid, uuid) is
  'One more open of the business''s own booking page from a live form, on its day (00688; the Forms plan, F3): true when counted, false for a form that is not live. The service role''s alone; the page never counts a preview.';

/* ------------------------------------------------------------------------------------ 3. a member's reads -- */

create or replace function public.form_requests_open(p_tenant_id uuid)
returns jsonb
language sql
stable
set search_path = public
as $$
  -- A request is open until a link answers it: a member's word, a conversation that took it over, or a reply whose
  -- message did not fail and was not taken back. Sixty days: an older one stays in its form's own list. A request that
  -- asked for a time says the time as its visit stands now (00688).
  select coalesce(jsonb_agg(r.line order by r.created_at desc), '[]'::jsonb)
    from (
      select e.created_at,
             jsonb_build_object(
               'id', e.id, 'form_id', e.form_id, 'version_id', e.version_id, 'contact_id', e.contact_id,
               'created_at', e.created_at, 'answers', e.answers, 'reach', e.reach, 'place', l.place,
               'heading', v.description ->> 'heading',
               'unreached', exists (
                 select 1 from form_entry_links k
                   join messages m on m.tenant_id = k.tenant_id and m.id = k.message_id
                  where k.tenant_id = e.tenant_id and k.entry_id = e.id and k.kind = 'reply'
                    and m.status = 'failed'),
               'time', (
                 select jsonb_build_object('appointment_id', a.id, 'starts_at', a.starts_at, 'ends_at', a.ends_at,
                                           'service', a.service, 'status', a.status, 'expires_at', a.expires_at,
                                           'timezone', a.timezone)
                   from form_entry_links k
                   join appointments a on a.tenant_id = k.tenant_id and a.id = k.appointment_id
                  where k.tenant_id = e.tenant_id and k.entry_id = e.id and k.kind = 'visit'
                  order by k.created_at desc
                  limit 1)) as line
        from form_entries e
        join form_versions v on v.tenant_id = e.tenant_id and v.id = e.version_id
        left join links l on l.tenant_id = e.tenant_id and l.id = e.link_id
       where e.tenant_id = p_tenant_id
         and e.form_id is not null and e.state <> 'held' and not e.test
         and e.created_at > now() - interval '60 days'
         and not exists (
               select 1 from form_entry_links k
                where k.tenant_id = e.tenant_id and k.entry_id = e.id
                  and (k.kind in ('marked', 'conversation')
                       or (k.kind = 'reply' and exists (
                             select 1 from messages m
                              where m.tenant_id = k.tenant_id and m.id = k.message_id
                                and m.status not in ('failed', 'canceled')))))
       order by e.created_at desc
       limit 200) r;
$$;

revoke all on function public.form_requests_open(uuid) from public, anon;
grant execute on function public.form_requests_open(uuid) to authenticated, service_role;
comment on function public.form_requests_open(uuid) is
  'The requests of a workspace''s hosted forms nobody has answered (00680, 00688; the Forms plan, 3.5), newest first, 200 at most over sixty days, read under the member''s own row rules: each with its answers, who it is about as typed, its form''s heading, the place it came through, whether a reply to it failed to reach them (unreached), and the time it asked for as its visit stands now (time: null where it asked for none). Answered is a marked link, a conversation link, or a reply whose message did not fail and was not taken back.';

create or replace function public.form_results(p_tenant_id uuid, p_days integer default 30)
returns jsonb
language sql
stable
set search_path = public
as $$
  with win as (
    select now() - make_interval(days => greatest(1, least(coalesce(p_days, 30), 366))) as since
  ), asked as (
    -- Each request in the window: whether its person was new with it, whether it became a conversation (a reply that
    -- left, or their own message with its code), whether it asked for a time (00688), and whether a visit followed:
    -- the time it asked for, confirmed (00688), or by the rule an ad's is read by (00678), a visit asked for in a chat
    -- and confirmed there, or one a member added, made after the request and starting after.
    select e.form_id, e.link_id, e.contact_id,
           c.created_at > e.created_at - interval '1 minute' as new_person,
           exists (select 1 from form_entry_links k
                    where k.tenant_id = e.tenant_id and k.entry_id = e.id
                      and (k.kind = 'conversation'
                           or (k.kind = 'reply' and exists (
                                 select 1 from messages m
                                  where m.tenant_id = k.tenant_id and m.id = k.message_id
                                    and m.status not in ('failed', 'canceled'))))) as talked,
           exists (select 1 from form_entry_links k
                    where k.tenant_id = e.tenant_id and k.entry_id = e.id and k.kind = 'visit') as timed,
           -- The time it asked for, confirmed: made in the entry's own statement, so the rule below cannot see it.
           exists (select 1 from form_entry_links k
                     join appointments a on a.tenant_id = k.tenant_id and a.id = k.appointment_id
                    where k.tenant_id = e.tenant_id and k.entry_id = e.id and k.kind = 'visit'
                      and a.status not in ('cancelled', 'proposed'))
           or exists (select 1 from appointments a
                    where a.tenant_id = e.tenant_id
                      and a.source in ('receptionist', 'person')
                      and a.status not in ('cancelled', 'proposed')
                      and a.created_at > e.created_at
                      and a.starts_at > e.created_at
                      and (a.contact_id = e.contact_id
                           or (a.contact_id is null
                               and ((a.client_phone is not null and a.client_phone = c.phone_e164)
                                    or (a.client_email is not null and lower(a.client_email) = lower(c.email))))))
             as booked
      from form_entries e
      join contacts c on c.tenant_id = e.tenant_id and c.id = e.contact_id
      cross join win
     where e.tenant_id = p_tenant_id
       and e.form_id is not null and e.state <> 'held' and not e.test
       and e.created_at > win.since
  )
  select jsonb_build_object(
    'places', coalesce((
      select jsonb_agg(jsonb_build_object(
               'form_id', x.form_id, 'link_id', x.link_id, 'requests', x.requests, 'talked', x.talked,
               'visits', x.visits, 'people', x.people, 'new_people', x.new_people, 'asked', x.asked))
        from (select a.form_id, a.link_id, count(*) as requests,
                     count(distinct a.contact_id) as people,
                     count(*) filter (where a.talked) as talked,
                     count(*) filter (where a.timed) as asked,
                     count(distinct a.contact_id) filter (where a.booked) as visits,
                     count(distinct a.contact_id) filter (where a.new_person) as new_people
                from asked a group by a.form_id, a.link_id) x), '[]'::jsonb),
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

revoke all on function public.form_results(uuid, integer) from public, anon;
grant execute on function public.form_results(uuid, integer) to authenticated, service_role;
comment on function public.form_results(uuid, integer) is
  'What a workspace''s hosted forms brought over the last p_days (30; 1 to 366), read under the member''s own row rules (00680, 00688): by form and by the link each request came through (link_id null: none), the requests, how many asked for a time (asked), how many became a conversation (talked), the people who asked (people), those who booked after (visits, by 00678''s rule for a visit that follows) and those new with their request; each link''s opens; and how often each form''s business''s own booking page was opened from it (booking_opens). Held entries and tests are in no count.';

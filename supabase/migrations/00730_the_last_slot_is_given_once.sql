-- 00730 · The last slot is given once (lane 15 of the whole-system plan of 28 Nov 2026, "Time and bookings", the
-- brief's item 3; R1.17).
--
-- A time a customer asks for by text (booking_request_open, 00443/00679) or on a form (form_time_request_take,
-- 00691/00704) is held for the owner as a proposed visit. Neither door looked at what else held that time: the only
-- check was the edge's or the page's, made from the open times read before the reply was written, so two customers who
-- picked the same last time a moment apart were both given it, and one after the other was not refused either.
--
--   appointments_time_taken   New. Whether a time is held by another live visit of the workspace's record: proposed
--                             and not run out, or booked; any source but the calendar feed's own copies, which the open
--                             times read from the feed itself. The rule the open times already keep (packages/db
--                             listAppointmentsBetween), the person's own open request aside, as their open times leave
--                             it aside. It takes the workspace's own lock for the rest of the transaction first, so two
--                             asks for one workspace's times are answered one after the other. The service role's.
--   booking_request_open      Re-made from its newest body (00679) with one check: a taken time answers
--                             {error: taken}, and nothing moves (their open request before it stands).
--   form_time_request_take    Re-made from its newest body (00704) with the same check: the entry is kept as a plain
--                             request and its time answers {error: taken}, as one too soon does.
--
-- What moves, and nothing else does: a time another visit holds is refused at the door, where until now only the open
-- times the reply was written from left it out. No visit already held is changed.
--
-- Locks: none on a table; the doors take an advisory lock per workspace for the length of one request's transaction.
-- Re-runnable. Deploy order: either. A build from before reads {error: taken} as a door that failed: the customer was
-- told the team will confirm, and the thread waits on a person's reply, as a refusal it does not know always has.

set local lock_timeout = '3s';

create or replace function public.appointments_time_taken(
  p_tenant_id uuid,
  p_contact_id uuid,
  p_starts_at timestamp with time zone,
  p_ends_at timestamp with time zone
) returns boolean
language plpgsql
set search_path = public
as $$
begin
  -- One workspace's times are given out one at a time: a second ask waits here until the first has committed or rolled
  -- back, then reads what it left.
  perform pg_advisory_xact_lock(hashtextextended('appointments.time:' || p_tenant_id::text, 0));
  return exists (
    select 1
      from public.appointments a
     where a.tenant_id = p_tenant_id
       and a.status in ('proposed', 'booked')
       and a.source <> 'calendar_feed'
       and (a.expires_at is null or a.expires_at > now())
       and a.starts_at < p_ends_at
       and a.ends_at > p_starts_at
       and not (a.source = 'receptionist' and a.status = 'proposed' and a.contact_id is not distinct from p_contact_id)
  );
end $$;

revoke all on function public.appointments_time_taken(uuid, uuid, timestamp with time zone, timestamp with time zone)
  from public, anon, authenticated;
grant execute on function public.appointments_time_taken(uuid, uuid, timestamp with time zone, timestamp with time zone)
  to service_role;

comment on function public.appointments_time_taken(uuid, uuid, timestamp with time zone, timestamp with time zone) is
  'Whether a time is held by another live visit of the workspace''s record (00730): proposed and not run out, or booked, of any source but the calendar feed''s own copies, overlapping it; the person''s own open request (receptionist, proposed) aside. The rule the open times keep (packages/db listAppointmentsBetween). Takes the workspace''s advisory lock for the rest of the transaction first, so the doors that hold a time (booking_request_open, form_time_request_take) answer two asks one after the other. The service role''s.';

create or replace function public.booking_request_open(p_tenant_id uuid, p_conversation_id uuid, p_contact_id uuid, p_starts_at timestamp with time zone, p_ends_at timestamp with time zone, p_service text, p_timezone text, p_words text) returns jsonb
language plpgsql security definer
set search_path to 'public'
as $$
declare
  v_contact  public.contacts%rowtype;
  v_expires  timestamptz;
  v_id       uuid;
  v_replaced uuid[];
  v_hold     text;
begin
  if p_tenant_id is null or p_conversation_id is null or p_contact_id is null
     or p_starts_at is null or p_ends_at is null or nullif(btrim(coalesce(p_timezone, '')), '') is null then
    raise exception 'booking_request_open: a request is for a person, in a thread, at a time' using errcode = '22004';
  end if;
  if p_ends_at <= p_starts_at then
    raise exception 'booking_request_open: a slot ends after it starts' using errcode = '22023';
  end if;
  -- 23 hours, not a day (00679): when it runs out the customer is told, and WhatsApp carries a free reply only within
  -- 24 hours of their last message.
  v_expires := least(now() + interval '23 hours', p_starts_at - interval '1 hour');
  if v_expires <= now() then
    return jsonb_build_object('error', 'too_soon');
  end if;
  select * into v_contact from public.contacts c
   where c.id = p_contact_id and c.tenant_id = p_tenant_id;
  if not found then
    raise exception 'booking_request_open: no such person in this workspace' using errcode = 'P0002';
  end if;
  if not exists (select 1 from public.conversations v
                  where v.id = p_conversation_id and v.tenant_id = p_tenant_id) then
    raise exception 'booking_request_open: no such thread in this workspace' using errcode = 'P0002';
  end if;
  -- The last slot (00730): a time another live visit of the record holds is taken, asked under the workspace's own
  -- lock, so of two people who pick it a moment apart one is given it and the other is answered taken. Asked before
  -- their own open request is let go, so a taken time leaves the one they hold as it is.
  if public.appointments_time_taken(p_tenant_id, p_contact_id, p_starts_at, p_ends_at) then
    return jsonb_build_object('error', 'taken');
  end if;
  -- One open request per person: the one they asked for before is cancelled, its slot free again.
  with gone as (
    update public.appointments a set status = 'cancelled'
     where a.tenant_id = p_tenant_id and a.contact_id = p_contact_id
       and a.source = 'receptionist' and a.status = 'proposed'
    returning a.id
  )
  select coalesce(array_agg(id), '{}') into v_replaced from gone;
  insert into public.appointments (tenant_id, contact_id, conversation_id, source, status, starts_at, ends_at,
                                   title, service, client_name, client_phone, timezone, expires_at)
  values (p_tenant_id, p_contact_id, p_conversation_id, 'receptionist', 'proposed', p_starts_at, p_ends_at,
          nullif(btrim(coalesce(p_service, '')), ''), nullif(btrim(coalesce(p_service, '')), ''),
          coalesce(nullif(btrim(coalesce(v_contact.display_name, '')), ''), nullif(btrim(coalesce(v_contact.wa_profile_name, '')), '')),
          v_contact.phone_e164, p_timezone, v_expires)
  returning id into v_id;
  v_hold := public.escalation_open(p_tenant_id, p_conversation_id, 'booking_request',
                                   coalesce(nullif(btrim(coalesce(p_words, '')), ''), 'Asked for a booking'));
  return jsonb_build_object('appointment', jsonb_build_object('id', v_id, 'expires_at', v_expires),
                            'replaced', to_jsonb(v_replaced), 'hold', v_hold);
end
$$;

create or replace function public.form_time_request_take(p_tenant_id uuid, p_form_id uuid, p_version_id uuid, p_ref text, p_answers jsonb, p_reach jsonb, p_words text, p_starts_at timestamp with time zone, p_ends_at timestamp with time zone, p_service text, p_timezone text, p_source jsonb DEFAULT NULL::jsonb, p_link_code text DEFAULT NULL::text, p_test boolean DEFAULT false, p_held_why text DEFAULT NULL::text) returns jsonb
language plpgsql security definer
set search_path to 'public'
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
  -- The last slot (00730): a time another live visit holds is taken, under the workspace's own lock (the same one a
  -- chat's request takes). The entry is kept as a plain request, as one too soon is, and their own open request stands.
  if public.appointments_time_taken(p_tenant_id, v_contact.id, p_starts_at, p_ends_at) then
    return v_taken || jsonb_build_object('time', jsonb_build_object('error', 'taken'));
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
  -- What the visit answered is the form (00699's through_type): stamped here, since a form's request has no
  -- conversation for appointments_through_stamp to read, and a visit is stamped at its insert alone.
  insert into public.appointments (tenant_id, contact_id, conversation_id, source, status, starts_at, ends_at,
                                   title, service, client_name, client_phone, client_email, timezone, expires_at,
                                   through_type, through_id)
  values (p_tenant_id, v_contact.id, null, 'receptionist', 'proposed', p_starts_at, p_ends_at, v_service, v_service,
          coalesce(nullif(btrim(coalesce(v_contact.display_name, '')), ''),
                   nullif(btrim(coalesce(v_contact.wa_profile_name, '')), '')),
          v_contact.phone_e164, v_contact.email, p_timezone, v_expires, 'form', p_form_id)
  returning id into v_id;
  -- The visit asked for is the entry's: what it answered, and where it came from, are read through it.
  insert into public.form_entry_links (tenant_id, entry_id, kind, appointment_id)
  values (p_tenant_id, v_entry, 'visit', v_id);
  return v_taken || jsonb_build_object('time', jsonb_build_object('appointment_id', v_id, 'expires_at', v_expires));
end
$$;

comment on function public.booking_request_open(p_tenant_id uuid, p_conversation_id uuid, p_contact_id uuid, p_starts_at timestamp with time zone, p_ends_at timestamp with time zone, p_service text, p_timezone text, p_words text) is
  'A booking the receptionist asks for (00443, decision 0061): a proposed appointments row (source receptionist) that takes its slot until expires_at, the sooner of 23 hours after it was asked (00679) and an hour before the slot, and its thread''s hold (booking_request, through escalation_open) in one transaction; the person''s open request before it is cancelled. Answers {appointment: {id, expires_at}, replaced, hold}, {error: too_soon} for a slot an hour away or less, or {error: taken} for a time another live visit holds (appointments_time_taken, 00730), with nothing moved. The service role''s.';

comment on function public.form_time_request_take(p_tenant_id uuid, p_form_id uuid, p_version_id uuid, p_ref text, p_answers jsonb, p_reach jsonb, p_words text, p_starts_at timestamp with time zone, p_ends_at timestamp with time zone, p_service text, p_timezone text, p_source jsonb, p_link_code text, p_test boolean, p_held_why text) is
  'The hosted form''s one write with a time asked for (00691, 00704; the Forms plan, F3; decision 0061): form_request_take, then for an entry accepted with its person the same request a chat opens, in one transaction: a proposed visit (source receptionist) held until the sooner of 23 hours on and an hour before it, with no thread and no hold (a form''s request is never a hand-over), the person''s open request before it cancelled (one held in a chat leaves a reply owed there), and the visit named from the entry (form_entry_links visit) and saying it answered the form (through_type form, through_id the form, 00699''s columns). Answers form_request_take''s answer with `time`: {appointment_id, expires_at}, or {error: too_soon} for a time an hour away or less (the entry is kept as a plain request), or {error: taken} for a time another live visit holds (appointments_time_taken, 00730; the entry kept the same way), or none where no time was held (held, a test, closed, stale, forgotten). The same press again answers the time it held. The service role''s alone.';

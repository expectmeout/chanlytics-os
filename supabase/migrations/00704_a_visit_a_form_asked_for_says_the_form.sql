-- 00704 · A visit a form asked for says it answered the form (the Forms plan, F3's last line: "a confirmed visit
-- records the form"; the content loop's pass 2, 00699, made the column).
--
-- 00699 gave every visit what it answered (appointments.through_type, through_id: a post, an ad, a link or a form),
-- stamped before it is written by appointments_through_stamp from the latest touch of its conversation. A time asked for
-- on a form opens its visit with no conversation (00691), so that stamp never reads it, and the visit kept only its
-- entry's link (form_entry_links visit). Agreed with pass 2 on 23 November: the form's own door stamps it.
--
--   form_time_request_take  Re-made: the visit it holds says through_type form and through_id the form, at its insert.
--                           Nothing else of 00691's door moves.
--
-- No visit before this is changed: the ones a form asked for are read through their entry, as they were. Deploy order:
-- either; nothing in the code reads the stamp of a form's visit yet. Re-runnable.

set local lock_timeout = '3s';

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
end $$;

revoke all on function public.form_time_request_take(uuid, uuid, uuid, text, jsonb, jsonb, text, timestamptz,
                                                     timestamptz, text, text, jsonb, text, boolean, text)
  from public, anon, authenticated;
grant execute on function public.form_time_request_take(uuid, uuid, uuid, text, jsonb, jsonb, text, timestamptz,
                                                        timestamptz, text, text, jsonb, text, boolean, text)
  to service_role;
comment on function public.form_time_request_take(uuid, uuid, uuid, text, jsonb, jsonb, text, timestamptz, timestamptz,
                                                  text, text, jsonb, text, boolean, text) is
  'The hosted form''s one write with a time asked for (00691, 00704; the Forms plan, F3; decision 0061): form_request_take, then for an entry accepted with its person the same request a chat opens, in one transaction: a proposed visit (source receptionist) held until the sooner of 23 hours on and an hour before it, with no thread and no hold (a form''s request is never a hand-over), the person''s open request before it cancelled (one held in a chat leaves a reply owed there), and the visit named from the entry (form_entry_links visit) and saying it answered the form (through_type form, through_id the form, 00699''s columns). Answers form_request_take''s answer with `time`: {appointment_id, expires_at}, or {error: too_soon} for a time an hour away or less (the entry is kept as a plain request), or none where no time was held (held, a test, closed, stale, forgotten). The same press again answers the time it held. The service role''s alone.';

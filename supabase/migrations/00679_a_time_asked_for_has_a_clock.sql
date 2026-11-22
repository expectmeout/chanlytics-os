-- 00679 · A time a customer asked for has a clock (decision 0061, amended 22 Nov 2026).
--
-- A customer picks a time in a chat, AI says the team will confirm, and the request is held for its owner (00443). If the
-- owner never answered, nothing happened at the end: the time was freed, the owner's card stayed open, and the customer
-- was never told. No clock read appointments.expires_at at all.
--
--   appointments.nudged_at    when its owner was nudged that it is about to run out; null until then. Told once.
--   appointments.lapsed_at    when it ran out with no answer and was closed. Null for every other row.
--   appointments.lapse_told   whether AI told the customer when it ran out: true, or false where the message could not
--                             go and the conversation waits on a person's reply. Null for a row that never ran out.
--   booking_requests_due      the clock's read: the requests to nudge (two hours from their end, of the ones that live
--                             longer than four) and the ones that ran out, oldest first.
--   booking_request_nudged    stamps a nudge, once.
--   booking_request_lapse     closes a request that ran out, in one transaction. Handed a message, it queues it with its
--                             send job (queue_send, 00527), resolves the hold and gives the conversation back to AI.
--                             Handed none, it turns the hold into a reply a person owes (booking_reply), as Can't does.
--                             A request no longer waiting answers `answered` and nothing moves, so a second run is safe.
--   booking_request_open      a request is held for 23 hours, not a day (and still never past an hour before its time):
--                             WhatsApp carries a free reply only within 24 hours of the customer's last message, and at
--                             24 the message that tells them could not go.
--   appointments_note_change  says a request that ran out as `lapsed` with whether they were told, never `cancelled`:
--                             nobody cancelled, and no freed time is offered on it (decision 0082).
--   appointment.lapsed        the door's own event, {told, starts_at, service, contact_id}: Activity's line.
--   job_kinds                 booking_lapse: one job a request, in the reply lane, put on the ledger by the watchdog's tick.
--   notifications.kind        takes booking_lapsed: the owner's one note once a request ran out and AI told the customer.
--
-- The requests that had already run out when this is applied are left alone: they are stamped lapsed_at in the same
-- statement that adds the column, so the clock never takes them up and nobody hears about a request from weeks ago.
-- They stay proposed, with their card as it was.
--
-- The clock's read is over the open requests alone, which are the whole of appointments_request_one (00443: one open
-- request a person), so it needs no index of its own.
--
-- Service role alone for the three new functions. Deploy order: this first. The edge before it calls none of them, and
-- the edge after it, met before this is applied, logs that it could not read what is due and does nothing.
-- Re-runnable.

set local lock_timeout = '3s';

/* ------------------------------------------------------------------------------------------ 1. the job's kind -- */

insert into public.job_kinds (kind, lane, once_parts, once_kept) values
  ('booking_lapse', 0, array['appointment_id'], false)
on conflict (kind) do update
  set lane = excluded.lane, once_parts = excluded.once_parts, once_kept = excluded.once_kept;

/* ----------------------------------------------------------------------------------------- 2. the owner's note -- */

alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind = any (array['handoff', 'deadman', 'call', 'number', 'sweep', 'job_failed', 'playbook',
                           'calendar_people', 'alert', 'review', 'billing', 'template_ready', 'template_blocked',
                           'broadcast_sent', 'broadcast_stopped', 'leads_ready', 'leads_question', 'note_for_you',
                           'reach_out_replied', 'reach_out_day', 'booking_notice', 'opted_out', 'booking',
                           'member_joined', 'member_left', 'note_to_keep', 'reply_held', 'ask_cards', 'website_form',
                           'files_waiting', 'video_ready', 'post_up', 'post_stopped', 'preview_tried',
                           'ad_account', 'footage', 'footage_in',
                           'ad_refused', 'ad_unpaid', 'ad_ended', 'ad_spent', 'ad_quiet', 'ad_draft',
                           'ad_unfinished', 'ad_unconfirmed', 'ad_way_in', 'ads_paused', 'booking_lapsed']));

/* ------------------------------------------------------------------------------------- 3. the request's clock -- */

alter table public.appointments add column if not exists nudged_at timestamptz;

-- lapsed_at, and in the same breath the requests that had already run out: stamped once, when the column first exists,
-- so a second run of this file never takes a request the clock is about to close.
do $$
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'appointments' and column_name = 'lapsed_at') then
    alter table public.appointments add column lapsed_at timestamptz;
    update public.appointments
       set lapsed_at = expires_at
     where source = 'receptionist' and status = 'proposed' and expires_at is not null and expires_at <= now();
  end if;
end $$;

alter table public.appointments add column if not exists lapse_told boolean;

comment on column public.appointments.nudged_at is
  'When the owner of a request AI took was nudged that it is about to run out (00679): once, two hours before expires_at, for a request that lives longer than four. Null until then, and for every other row.';
comment on column public.appointments.lapsed_at is
  'When a request AI took ran out with no answer and was closed (00679 booking_request_lapse). A request that had already run out when 00679 was applied carries its expires_at here and is left as it was. Null for every other row.';
comment on column public.appointments.lapse_told is
  'Whether AI told the customer when their request ran out (00679): true, or false where the message could not go and the conversation waits on a person''s reply. Null for a row that never ran out through booking_request_lapse.';

/* ------------------------------------------------------------------------------- 4. the record says what it was -- */

create or replace function public.appointments_note_change() returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_change text;
begin
  if tg_op = 'INSERT' then
    v_change := case when new.status = 'cancelled' then 'cancelled' else 'added' end;
  elsif new.status = 'cancelled' and old.status is distinct from 'cancelled' then
    -- A request that ran out with no answer (00679) is not a cancellation: nobody cancelled it, and no time is offered on it.
    v_change := case when new.lapse_told is not null and old.lapse_told is null then 'lapsed' else 'cancelled' end;
  elsif old.status = 'proposed' and new.status = 'booked' then
    v_change := 'confirmed';
  elsif new.status in ('kept', 'missed') and old.status is distinct from new.status then
    v_change := new.status;
  elsif new.starts_at is distinct from old.starts_at then
    v_change := 'moved';
  else
    return null;
  end if;
  insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
  values (new.tenant_id, 'appointment.changed', 'appointment', 'appointment', new.id,
          jsonb_build_object('change', v_change, 'source', new.source, 'starts_at', new.starts_at)
          -- Whose word it is, whatever source the visit came by: a signed-in member's, or the service's (00436).
          -- A move says the time it left (decision 0082, 00498): the freed time is that span.
          || case when v_change = 'moved' then jsonb_build_object('was_at', old.starts_at) else '{}'::jsonb end
          -- A request that ran out says whether the customer was told (00679): its owner's note is told from it.
          || case when v_change = 'lapsed' then jsonb_build_object('told', new.lapse_told) else '{}'::jsonb end
          || jsonb_build_object('by', case when auth.uid() is not null then 'member' else 'service' end));
  return null;
end $$;
comment on function public.appointments_note_change() is
  'appointment.changed {change, source, starts_at, by} in the same transaction as the write (00389, 00397, 00436): added, confirmed, cancelled, kept, missed, moved or lapsed, and nothing for a write that changes none of those; by is member when a signed-in member''s session made the write, service for the edge''s (a booking tool''s email, the calendar''s door). A request that ran out with no answer says lapsed and told (00679), never cancelled. On a feed''s row only a moved status is said (appointments_note_status): the feed''s door writes its own events (00348) and never moves a status, so that is a person''s word.';

/* -------------------------------------------------------------------------------- 5. held for 23 hours, not a day -- */

create or replace function public.booking_request_open(
  p_tenant_id uuid,
  p_conversation_id uuid,
  p_contact_id uuid,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_service text,
  p_timezone text,
  p_words text
) returns jsonb
language plpgsql
security definer
set search_path = public
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
end $$;
comment on function public.booking_request_open(uuid, uuid, uuid, timestamptz, timestamptz, text, text, text) is
  'A booking the receptionist asks for (00443, decision 0061): a proposed appointments row (source receptionist) that takes its slot until expires_at, the sooner of 23 hours after it was asked (00679) and an hour before the slot, and its thread''s hold (booking_request, through escalation_open) in one transaction; the person''s open request before it is cancelled. Answers {appointment: {id, expires_at}, replaced, hold}, or {error: too_soon} for a slot an hour away or less. The service role''s.';

/* ---------------------------------------------------------------------------------------- 6. what the clock reads -- */

create or replace function public.booking_requests_due(p_limit integer default 50)
returns table (what text, appointment_id uuid, tenant_id uuid, conversation_id uuid, client_name text,
               starts_at timestamptz, service text, timezone text, expires_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  (select 'lapse'::text, a.id, a.tenant_id, a.conversation_id, a.client_name, a.starts_at, a.service, a.timezone,
          a.expires_at
     from public.appointments a
    where a.source = 'receptionist' and a.status = 'proposed'
      and a.lapsed_at is null
      and a.conversation_id is not null
      and a.expires_at <= now()
    order by a.expires_at
    limit greatest(1, least(coalesce(p_limit, 50), 200)))
  union all
  (select 'nudge'::text, a.id, a.tenant_id, a.conversation_id, a.client_name, a.starts_at, a.service, a.timezone,
          a.expires_at
     from public.appointments a
    where a.source = 'receptionist' and a.status = 'proposed'
      and a.lapsed_at is null and a.nudged_at is null
      and a.conversation_id is not null
      and a.expires_at > now()
      and a.expires_at <= now() + interval '2 hours'
      -- Only a request that lives longer than four hours: a shorter one would be nudged on top of the first alert.
      and a.expires_at - a.created_at > interval '4 hours'
      -- And only while its conversation still waits on its owner for it.
      and exists (select 1 from public.escalations e
                   where e.tenant_id = a.tenant_id and e.conversation_id = a.conversation_id
                     and e.state = 'open' and e.reason = 'booking_request')
    order by a.expires_at
    limit greatest(1, least(coalesce(p_limit, 50), 200)));
$$;
revoke execute on function public.booking_requests_due(integer) from public, anon, authenticated;
grant execute on function public.booking_requests_due(integer) to service_role;
comment on function public.booking_requests_due(integer) is
  'What the request clock is due to act on (00679, decision 0061): `lapse`, the open requests whose expires_at has passed, and `nudge`, the ones within two hours of it that live longer than four, were not nudged, and whose conversation still holds for them; each oldest first, at most p_limit (200 at most). A request stamped lapsed_at is never listed. The service role''s.';

create or replace function public.booking_request_nudged(p_appointment_id uuid) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  update public.appointments
     set nudged_at = now()
   where id = p_appointment_id and nudged_at is null and source = 'receptionist' and status = 'proposed'
  returning id into v_id;
  return v_id is not null;
end $$;
revoke execute on function public.booking_request_nudged(uuid) from public, anon, authenticated;
grant execute on function public.booking_request_nudged(uuid) to service_role;
comment on function public.booking_request_nudged(uuid) is
  'Stamps that a request''s owner was nudged it is about to run out (00679): once, on an open request. True when this call stamped it. The service role''s.';

/* ------------------------------------------------------------------------------------ 7. a request that ran out -- */

create or replace function public.booking_request_lapse(
  p_appointment_id uuid,
  p_reply_words text,
  p_message jsonb default null,
  p_due_at timestamptz default null,
  p_payload jsonb default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row     public.appointments%rowtype;
  v_hold    uuid;
  v_reason  text;
  v_told    boolean := p_message is not null;
  v_message uuid;
begin
  if p_appointment_id is null then
    raise exception 'booking_request_lapse: a request is named' using errcode = '22004';
  end if;
  select * into v_row from public.appointments where id = p_appointment_id for update;
  -- Answered, replaced, closed by an earlier run, or never a request: nothing moves, and nothing is sent.
  if not found or v_row.source <> 'receptionist' or v_row.status <> 'proposed' then
    return jsonb_build_object('outcome', 'answered');
  end if;
  -- Not before its time: until then its owner may still answer it.
  if v_row.expires_at is null or v_row.expires_at > now() then
    return jsonb_build_object('outcome', 'early');
  end if;
  -- The conversation's hold as it stands, held while this runs: the request's own, another reason's, or none.
  if v_row.conversation_id is not null then
    select e.id, e.reason into v_hold, v_reason
      from public.escalations e
     where e.tenant_id = v_row.tenant_id and e.conversation_id = v_row.conversation_id and e.state = 'open'
     for update;
  end if;
  -- Nothing is sent under a hold that is no longer the request's: a person, or a failed send, has the conversation.
  if v_reason is distinct from 'booking_request' then
    v_told := false;
  end if;
  if v_told then
    if (p_message ->> 'tenant_id')::uuid is distinct from v_row.tenant_id
       or (p_message ->> 'conversation_id')::uuid is distinct from v_row.conversation_id then
      raise exception 'booking_request_lapse: the message is for the request''s own conversation' using errcode = '22023';
    end if;
    -- The message and its send job, in this transaction (00527): queued with the close, or neither happened.
    v_message := public.queue_send(p_message, coalesce(p_due_at, now()), coalesce(p_payload, '{}'::jsonb));
  end if;
  update public.appointments
     set status = 'cancelled', lapsed_at = now(), lapse_told = v_told
   where id = v_row.id;
  -- Activity's line, beside the record's own appointment.changed (lapsed), which the owner's note is told from.
  insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
  values (v_row.tenant_id, 'appointment.lapsed', 'appointment', 'appointment', v_row.id,
          jsonb_build_object('told', v_told, 'starts_at', v_row.starts_at, 'service', v_row.service,
                             'contact_id', v_row.contact_id));
  if v_reason is distinct from 'booking_request' then
    return jsonb_build_object('outcome', 'closed');
  end if;
  if v_told then
    -- The conversation goes back to AI: contracts' hand_back move, and the hold resolved as the platform's own close
    -- (no member is named as resolving it, and no decision is recorded, as 00539 conversation_set_aside closes one).
    update public.conversations
       set state = 'open', paused_until = null, snooze_until = null, assignee_user_id = null
     where id = v_row.conversation_id and tenant_id = v_row.tenant_id and state <> 'archived';
    update public.escalations set state = 'resolved' where id = v_hold;
    return jsonb_build_object('outcome', 'told', 'message_id', v_message);
  end if;
  -- Nothing could be sent: the conversation waits on a person's reply, as it does after Can't. The hold's change is
  -- told to its owner from its own event (escalation.changed), and asks for the reply's draft.
  perform public.escalation_open(
    v_row.tenant_id, v_row.conversation_id, 'booking_reply',
    coalesce(nullif(btrim(coalesce(p_reply_words, '')), ''),
             to_char(v_row.starts_at at time zone v_row.timezone, 'Dy FMDD Mon, FMHH12:MI AM')
             || coalesce(' · ' || v_row.service, '') || ' wasn''t confirmed in time: reply to them'));
  return jsonb_build_object('outcome', 'reply');
end $$;
revoke execute on function public.booking_request_lapse(uuid, text, jsonb, timestamptz, jsonb) from public, anon, authenticated;
grant execute on function public.booking_request_lapse(uuid, text, jsonb, timestamptz, jsonb) to service_role;
comment on function public.booking_request_lapse(uuid, text, jsonb, timestamptz, jsonb) is
  'A request AI took that ran out with no answer, closed (00679, decision 0061 as amended), in one transaction under its row''s lock: cancelled, stamped lapsed_at and lapse_told, and said on the ledger as appointment.changed lapsed and appointment.lapsed. Handed a message while the conversation''s hold is still the request''s, it queues it with its send job (queue_send), resolves the hold and gives the conversation back to AI: {outcome: told, message_id}. Handed none, the hold takes p_reply_words as a reply a person owes (booking_reply): {outcome: reply}. A hold of another reason, or none, is left as it stands and nothing is sent: {outcome: closed}. A request no longer waiting answers {outcome: answered}, and one whose time has not come {outcome: early}, with nothing moved. The service role''s.';

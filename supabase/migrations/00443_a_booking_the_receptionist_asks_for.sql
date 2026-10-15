-- 00443 · A booking the receptionist asks for is held for the owner (decision 0061).
--
-- The AI-native plan's item 4 (Ruben, 9 October 2026): the receptionist may REQUEST a booking an owner confirms, and never
-- confirms one itself. When the team confirms its own bookings and the customer picks one of the open times, the request
-- is a record and a hold, opened together, and the owner answers it with Booked it or Can't.
--
--   appointments.source       takes 'receptionist': a time a customer picked by text, held for the owner.
--   appointments.expires_at   when a request stops taking its slot: the sooner of a day after it was asked and an hour
--                             before the slot. Null for every other row, which never expires.
--   appointments.conversation_id  the thread a request came from, where its hold is and the owner's answer goes.
--   appointments_request_one  one open request per person: a second replaces the first.
--   escalations.reason        takes 'booking_request', the hold whose act is to confirm, and 'booking_reply', a booking a
--                             person answers with a reply (contracts ESCALATION_ACTS).
--   decisions.verb            takes 'answer_booking_request': the owner's Booked it or Can't, as theirs.
--   booking_request_open      the service role's: opens the request and its hold in one transaction, replacing the
--                             person's open request.
--   booking_request_answer    a member's: books it and hands the thread back, which resolves its hold (00386's door), or
--                             cancels it and leaves the thread waiting on a reply (the hold's reason becomes booking_reply),
--                             the decisions as theirs.
--
-- The record's own trigger (appointments_note_change) says each move as appointment.changed: added (source receptionist),
-- confirmed, cancelled. Deploy order: this migration first. The edge asks booking_request_open only where a workspace
-- has switched booking requests on (off by default), and the dashboard draws the hold's buttons only for its reason.
-- Re-runnable.

set local lock_timeout = '3s';

alter table public.appointments drop constraint if exists appointments_source_check;
alter table public.appointments add constraint appointments_source_check
  check (source in ('calendar_feed', 'booking_email', 'booking_tool', 'person', 'receptionist'));

alter table public.appointments add column if not exists expires_at timestamptz;
alter table public.appointments add column if not exists conversation_id uuid;
-- The thread is the workspace's own (00279): the key names the workspace too, so a row can never name another's thread.
alter table public.appointments drop constraint if exists appointments_conversation_id_same_workspace;
alter table public.appointments add constraint appointments_conversation_id_same_workspace
  foreign key (tenant_id, conversation_id) references public.conversations (tenant_id, id)
  on delete set null (conversation_id);
comment on column public.appointments.expires_at is
  'When a request the receptionist took stops taking its slot (00443): the sooner of a day after it was asked and an hour before the slot. Null for every other row.';
comment on column public.appointments.conversation_id is
  'The thread a request the receptionist took came from (00443): where its hold is, and where the owner answers the customer.';

create unique index if not exists appointments_request_one
  on public.appointments (tenant_id, contact_id)
  where source = 'receptionist' and status = 'proposed';

alter table public.escalations drop constraint if exists escalations_reason_check;
alter table public.escalations add constraint escalations_reason_check
  check (reason in ('human_token','non_text','refusal','rate_cap','policy_block',
                    'send_failed','deadman','brain_error','manual','opt_out',
                    'state_unavailable','stale','person_hold','budget','policy_ask',
                    'callback','paused','carriers','email_review','booking_request',
                    'booking_reply'));

alter table public.decisions drop constraint if exists decisions_verb_check;
alter table public.decisions add constraint decisions_verb_check check (verb = any (array[
  'approve', 'edit', 'decline', 'snooze', 'wake', 'take_over', 'hand_back', 'resolve', 'archive', 'reply',
  'cancel_send', 'pause_agent', 'resume_agent', 'invite', 'revoke_invite', 'change_role', 'remove_member', 'erase',
  'whisper', 'connect_channel', 'consent_change', 'send_broadcast', 'cancel_broadcast', 'start_playbook',
  'pause_playbook', 'reply_review', 'export', 'end_call', 'record_deal', 'make_list', 'rename_list', 'change_list_rule',
  'add_to_list', 'drop_from_list', 'archive_list', 'restore_list', 'delete_list', 'import', 'open_recording', 'merge',
  'change_playbook', 'mark_visit', 'change_step', 'leave_sequence', 'make_sequence', 'discard_sequence',
  'answer_booking_request'
]));

-- The request and its hold, together. p_words is the hold's line ("Asked for Sat 18 Oct, 2:00 PM · Balayage").
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
  v_expires := least(now() + interval '1 day', p_starts_at - interval '1 hour');
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
revoke execute on function public.booking_request_open(uuid, uuid, uuid, timestamptz, timestamptz, text, text, text)
  from public, anon, authenticated;
grant execute on function public.booking_request_open(uuid, uuid, uuid, timestamptz, timestamptz, text, text, text)
  to service_role;
comment on function public.booking_request_open(uuid, uuid, uuid, timestamptz, timestamptz, text, text, text) is
  'A booking the receptionist asks for (00443, decision 0061): a proposed appointments row (source receptionist) that takes its slot until expires_at, and its thread''s hold (booking_request, through escalation_open) in one transaction; the person''s open request before it is cancelled. Answers {appointment: {id, expires_at}, replaced, hold}, or {error: too_soon} for a slot an hour away or less. The service role''s.';

-- The owner's answer. Booked it books the row and hands the thread back, which resolves its hold; Can't cancels it and
-- leaves the thread waiting on a reply, so the customer is never left with neither.
create or replace function public.booking_request_answer(
  p_appointment_id uuid,
  p_booked boolean,
  p_via text default null,
  p_reply_words text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor    uuid := auth.uid();
  v_row      public.appointments%rowtype;
  v_handed   jsonb;
  v_words    text;
begin
  -- The caller is auth.uid(), read here, never a parameter (00021's rule): the answer is theirs.
  if v_actor is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  if p_booked is null then
    raise exception 'booking_request_answer: booked, or not' using errcode = '22004';
  end if;
  select * into v_row from public.appointments where id = p_appointment_id for update;
  -- One the caller does not act in is one they cannot see: a stranger learns nothing.
  if not found or not public.is_acting_member(v_row.tenant_id) then
    raise exception 'Appointment not found.' using errcode = 'P0002';
  end if;
  if v_row.source <> 'receptionist' then
    return jsonb_build_object('error', 'not_a_request');
  end if;
  if v_row.status <> 'proposed' then
    return jsonb_build_object('error', 'answered', 'status', v_row.status);
  end if;
  -- Past its expiry the request took no slot, so its time may have gone to someone else: it is not booked blind. Can't
  -- still answers it.
  if p_booked and v_row.expires_at is not null and v_row.expires_at <= now() then
    return jsonb_build_object('error', 'expired');
  end if;
  -- A booking no longer expires: it stands on the board until a member says what became of it.
  update public.appointments set status = case when p_booked then 'booked' else 'cancelled' end,
                                 expires_at = case when p_booked then null else expires_at end
   where id = v_row.id;
  if v_row.conversation_id is not null then
    if p_booked then
      -- Booked: the thread goes back to the receptionist through the hand-back door (00386), which resolves its hold as
      -- the member's decision; a booked visit is then the receptionist's to speak of, as any other is.
      if exists (select 1 from public.escalations e
                  where e.tenant_id = v_row.tenant_id and e.conversation_id = v_row.conversation_id
                    and e.state = 'open' and e.reason = 'booking_request') then
        v_handed := public.conversation_hand_back(v_row.tenant_id, v_row.conversation_id, p_via, null);
      end if;
    elsif exists (select 1 from public.escalations e
                   where e.tenant_id = v_row.tenant_id and e.conversation_id = v_row.conversation_id
                     and e.state = 'open' and e.reason = 'booking_request') then
      -- The line the dashboard words (contracts), else the time and the service as they stand.
      v_words := coalesce(nullif(btrim(coalesce(p_reply_words, '')), ''),
                          'Could not book '
                          || to_char(v_row.starts_at at time zone v_row.timezone, 'Dy FMDD Mon, FMHH12:MI AM')
                          || coalesce(' · ' || v_row.service, '') || ': reply to them');
      perform public.escalation_open(v_row.tenant_id, v_row.conversation_id, 'booking_reply', v_words);
    end if;
  end if;
  return jsonb_build_object('appointment', jsonb_build_object('id', v_row.id,
                                                              'status', case when p_booked then 'booked' else 'cancelled' end),
                            'hold', case when coalesce((v_handed ->> 'resolved_escalations')::int, 0) > 0 then 'resolved'
                                         when not p_booked and v_words is not null then 'reply' end)
      || public.team_decision(v_row.tenant_id, v_actor, 'appointment', v_row.id, 'answer_booking_request',
                              jsonb_build_object('booked', p_booked, 'starts_at', v_row.starts_at,
                                                 'contact_id', v_row.contact_id, 'service', v_row.service),
                              p_via, null);
end $$;
revoke execute on function public.booking_request_answer(uuid, boolean, text, text) from public, anon;
grant execute on function public.booking_request_answer(uuid, boolean, text, text) to authenticated;
comment on function public.booking_request_answer(uuid, boolean, text, text) is
  'The owner answers a booking the receptionist asked for (00443, decision 0061): booked, which hands the thread back and so resolves its booking_request hold (conversation_hand_back), or not, which cancels the row and turns the hold into a reply (booking_reply) so the customer is answered; the answer_booking_request decision as theirs, and appointment.changed by the triggers. A refusal is {error}: not_a_request, answered (with its status), expired (Booked it past the request''s expiry). Returns the appointment''s id and status, the hold (resolved, reply or null) and the decision''s id.';

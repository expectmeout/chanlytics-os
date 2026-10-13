-- 00422 · A call that was the call back closes it (the wiring's second audit, X3-1).
--
-- A caller asks for a call back: Today says "Needs a call back", the badge counts it and the bell rings. A member rings
-- them from their page and logs it (Spoke, Save): a note landed, and Today's row, the badge and their History kept saying
-- they need a call back until someone pressed Done or handed the thread back.
--
--   person_call_logged   gains p_closes_call_back (default false): this call was the call back they asked for. The
--                        person's thread (one a person, conversations_tenant_id_contact_id_key), where it holds an open
--                        call-back request (an open escalation whose reason is callback; one open a thread,
--                        escalations_one_open), is handed back through conversation_hand_back, the one door for it, as
--                        the caller and in the same transaction as the note: the release, the hand_back decision (via
--                        'call') and the request resolved by it, so the hold's own trigger closes its bell row (00421)
--                        and Today, the badge and History read it done. A thread asking anything else is left as it
--                        was, and false changes nothing the door did before. The answer gains handed_back (true or
--                        false).
--
-- The old signature is dropped first: a new trailing default makes a second function beside it, and PostgREST would find
-- two. Deploy order: this migration first (a dashboard that sends the new argument to a database without it is refused,
-- and one that does not send it is answered as before). Re-runnable.

set local lock_timeout = '3s';

drop function if exists public.person_call_logged(uuid, text, text, date, boolean, text, text, text, text, text);

create or replace function public.person_call_logged(
  p_contact_id        uuid,
  p_outcome           text,
  p_body              text,
  p_due_on            date default null,
  p_tell              boolean default false,
  p_step_body         text default null,
  p_lead_stage        text default null,
  p_lead_reason       text default null,
  p_lead_note         text default null,
  p_spoke_with        text default null,
  p_closes_call_back  boolean default false
) returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_user   uuid := auth.uid();
  v_person public.contacts%rowtype;
  v_lead   public.leads%rowtype;
  v_tell   boolean := coalesce(p_tell, false);
  v_step_b text := coalesce(nullif(btrim(coalesce(p_step_body, '')), ''), p_body);
  v_stage  text := p_lead_stage;
  v_note   jsonb;
  v_step   jsonb := null;
  v_moved  jsonb := null;
  v_thread uuid;
  v_handed boolean := false;
begin
  if v_user is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  if p_outcome is null
     or p_outcome not in ('spoke', 'interested', 'call_back', 'not_interested', 'voicemail', 'no_answer', 'wrong_number') then
    return jsonb_build_object('error', 'bad_outcome');
  end if;
  -- Both notes' words are judged before either is written, so a call is kept whole or not at all.
  if nullif(btrim(coalesce(p_body, '')), '') is null then
    return jsonb_build_object('error', 'empty');
  end if;
  if char_length(btrim(p_body)) > 600 or char_length(btrim(v_step_b)) > 600 then
    return jsonb_build_object('error', 'too_long');
  end if;
  select * into v_person
    from public.contacts c
   where c.id = p_contact_id and c.erased_at is null and c.merged_into_contact_id is null;
  if not found or not public.is_acting_member(v_person.tenant_id) then
    return jsonb_build_object('error', 'not_found');
  end if;

  -- The note: with a day it is the step itself, unless the receptionist reads it, when the step is its own note beside it
  -- (a step is always the team's, 00166).
  if v_tell and p_due_on is not null then
    v_note := public.person_note_add(p_contact_id, p_body, null, false, 'page', null, null);
    if v_note ? 'error' then
      return v_note;
    end if;
    v_step := public.person_note_add(p_contact_id, v_step_b, null, true, 'page', p_due_on, null);
    if v_step ? 'error' then
      raise exception 'The call back could not be kept: %', v_step->>'error' using errcode = '22023';
    end if;
  else
    v_note := public.person_note_add(p_contact_id, p_body, null, not v_tell, 'page', p_due_on, null);
    if v_note ? 'error' then
      return v_note;
    end if;
  end if;

  -- The lead, where the business they work at is still being worked and the outcome is one of a lead's.
  if p_outcome <> 'spoke' and v_person.lead_id is not null then
    select * into v_lead
      from public.leads l
     where l.id = v_person.lead_id and l.tenant_id = v_person.tenant_id;
    -- A lead nobody stands for yet (a colleague linked by hand to a business never written to) is not moved: its
    -- Interested would make a second person, the business's, beside the one called.
    if found and v_lead.stage <> 'archived' and v_lead.erased_at is null and v_lead.blanked_at is null
       and v_lead.contact_id is not null
       and (p_outcome <> 'wrong_number' or v_person.phone_e164 is null) then
      if v_lead.stage = 'converted' and v_stage = 'nurture' then
        v_stage := null;
      end if;
      v_moved := public.lead_set_stage(v_lead.id, v_stage, p_lead_reason, null, p_outcome, left(p_lead_note, 280),
                                       p_spoke_with);
    end if;
  end if;

  -- The call back they asked for, made (X3-1): their thread, where it holds an open call-back request, handed back as
  -- the caller, the request resolved by that decision (conversation_hand_back: the release, the hold, the ledger).
  if coalesce(p_closes_call_back, false) then
    select c.id into v_thread
      from public.conversations c
      join public.escalations e
        on e.conversation_id = c.id and e.tenant_id = c.tenant_id and e.state = 'open' and e.reason = 'callback'
     where c.tenant_id = v_person.tenant_id and c.contact_id = p_contact_id;
    if v_thread is not null then
      v_handed := public.conversation_hand_back(v_person.tenant_id, v_thread, 'call', null) is not null;
    end if;
  end if;

  return jsonb_build_object('note', v_note->'note', 'step', v_step->'note', 'lead', v_moved, 'handed_back', v_handed);
end $$;

revoke execute on function public.person_call_logged(uuid, text, text, date, boolean, text, text, text, text, text, boolean)
  from public, anon;
grant execute on function public.person_call_logged(uuid, text, text, date, boolean, text, text, text, text, text, boolean)
  to authenticated, service_role;

comment on function public.person_call_logged(uuid, text, text, date, boolean, text, text, text, text, text, boolean) is
  'A call a member made, logged on the person (0052, canvas A M4): a note, the team''s unless p_tell, a step with p_due_on '
  '(beside the note where the receptionist reads it), and, where the person''s business is an open lead with its own '
  'person, the outcome through lead_set_stage (never Spoke; Wrong number only where the person has no number of their '
  'own; a lead Talking kept so by a call that went nowhere). With p_closes_call_back (00422, X3-1), the person''s thread, '
  'where it holds an open call-back request, is handed back through conversation_hand_back as the caller, in the same '
  'transaction. Owner, operator or partner. Answers {note, step, lead, handed_back} or {error}.';

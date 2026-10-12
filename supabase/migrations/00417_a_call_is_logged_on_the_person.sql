-- 00417 · A call is logged on the person.
--
-- Decision 0052 (canvas A, M4 and P2; "Your call" A3, approved 12 Oct 2026): a member rings a person from their own phone,
-- and the page asks "How did the call go?". One door keeps the answer: a note on the person, the team's own unless the
-- receptionist should know (with a day to call back it is a step, which is always the team's), and, where the business the
-- person works at is an open lead, the lead's own outcome through lead_set_stage, so Leads' call log and the person's are
-- one record.
--
--   person_call_logged   Owner, operator or partner (is_acting_member). Writes through person_note_add (its checks, its
--                        contact.noted event, its note-for-you) and lead_set_stage (its checks, its lead.call event, its
--                        lead_operations row), in one transaction: a refused note writes nothing on the lead.
--                        The lead moves only where it is open (not closed, erased or blanked), has its own person
--                        (leads.contact_id: its Interested never makes a second one), and the outcome is a lead's:
--                        Spoke is no lead's; Wrong number marks the lead's number only where the person has no number of
--                        their own (the call rang the listing); and a call that went nowhere (call back, voicemail, no
--                        answer) never takes a lead already Talking back to Contacted. It writes no lead itself.
--                        The words are the caller's (contracts personCallNote, personCallLeadArgs): the door judges what
--                        may be kept, never what it says.
--
-- Re-runnable: create or replace, and the grants as every door's.

create or replace function public.person_call_logged(
  p_contact_id  uuid,
  p_outcome     text,
  p_body        text,
  p_due_on      date default null,
  p_tell        boolean default false,
  p_step_body   text default null,
  p_lead_stage  text default null,
  p_lead_reason text default null,
  p_lead_note   text default null,
  p_spoke_with  text default null
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

  return jsonb_build_object('note', v_note->'note', 'step', v_step->'note', 'lead', v_moved);
end $$;

revoke execute on function public.person_call_logged(uuid, text, text, date, boolean, text, text, text, text, text)
  from public, anon;
grant execute on function public.person_call_logged(uuid, text, text, date, boolean, text, text, text, text, text)
  to authenticated, service_role;

comment on function public.person_call_logged(uuid, text, text, date, boolean, text, text, text, text, text) is
  'A call a member made, logged on the person (0052, canvas A M4): a note, the team''s unless p_tell, a step with p_due_on '
  '(beside the note where the receptionist reads it), and, where the person''s business is an open lead with its own '
  'person, the outcome through lead_set_stage (never Spoke; Wrong number only where the person has no number of their '
  'own; a lead Talking kept so by a call that went nowhere). Owner, operator or partner. Answers {note, step, lead} or '
  '{error}.';

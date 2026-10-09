-- 00356 · A person's answer and its line in their history are one write.
--
-- A member recording a person's consent made two writes: the door (set_contact_consent for messages about their own
-- visit, set_marketing_consent for offers), which changes the answer and keeps its event in one transaction, and then
-- the route's own insert into `decisions`, the line their profile's history shows and an undo names. A decision that
-- failed after the door had run left an answer changed with no line saying who recorded it, and the route answered
-- 500 for a change that had landed. Recorded for a class at once, each person was two round trips, and a decision
-- that threw part-way stopped the rest with nobody told who had been recorded.
--
--   record_consent   the member's one call: the door for the purpose named, then the consent_change decision as
--                    theirs (team_decision, 00277), in one transaction. Who may, what a yes needs, which message an
--                    answer "in their own message" names and what a lead's person may be recorded as are the two
--                    doors' rules, unchanged and still asked there: this function calls them and decides none of it.
--                    Answers what the door answers, with the decision's id beside it.
--
-- The two doors stay as they are for every other caller: the edge records what a customer texted through
-- set_marketing_consent with no session, and the yes page what they chose; neither writes a decision, since no member
-- decided anything.
--
-- Deploy order: this migration first. A dashboard that calls a function the database does not hold answers a consent
-- change with an error and changes nothing. Re-runnable.

create or replace function public.record_consent(
  p_contact_id uuid,
  p_purpose text,
  p_consent text,
  p_source text,
  p_note text default null,
  p_message_id uuid default null,
  p_batch integer default null,
  p_via text default null,
  p_undo_of uuid default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user   uuid := auth.uid();
  v_tenant uuid;
  v_before text;
  v_door   jsonb;
begin
  -- The caller is auth.uid(), read here, never a parameter (00021's rule): the decision below is theirs.
  if v_user is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  if p_purpose is null or p_purpose not in ('conversational', 'marketing') then
    raise exception 'record_consent: the answer is about their visit (conversational) or about offers (marketing)'
      using errcode = '22023';
  end if;
  -- The person's workspace, and the answer they had before the door changes it: the history line says what it was.
  select c.tenant_id, case when p_purpose = 'marketing' then c.marketing_consent else c.consent end
    into v_tenant, v_before
    from public.contacts c
   where c.id = p_contact_id;
  -- A stranger learns nothing (00027's rule); the door below says the same to anyone this let past.
  if v_tenant is null or not public.is_acting_member(v_tenant) then
    raise exception 'Contact not found.' using errcode = 'P0002';
  end if;
  if p_purpose = 'marketing' then
    v_door := public.set_marketing_consent(v_tenant, p_contact_id, p_consent, p_source, p_note, null, p_message_id);
  else
    v_door := public.set_contact_consent(p_contact_id, p_consent, p_source, p_note, p_message_id);
  end if;
  -- The line the route used to write after the door, with the fields it wrote: the purpose only for offers, the
  -- message only where one was named, the size of the batch only for an answer recorded for many at once.
  return v_door || public.team_decision(
    v_tenant, v_user, 'contact', p_contact_id, 'consent_change',
    jsonb_build_object('consent', p_consent, 'source', p_source, 'note', p_note, 'previous', v_before)
      || jsonb_strip_nulls(jsonb_build_object(
           'purpose', case when p_purpose = 'marketing' then 'marketing' end,
           'message_id', p_message_id,
           'batch', p_batch)),
    p_via, p_undo_of);
end $$;

revoke execute on function public.record_consent(uuid, text, text, text, text, uuid, integer, text, uuid) from public, anon;
grant execute on function public.record_consent(uuid, text, text, text, text, uuid, integer, text, uuid) to authenticated, service_role;
comment on function public.record_consent(uuid, text, text, text, text, uuid, integer, text, uuid) is
  'A member records a person''s answer and its line in their history together (00356): the purpose''s own door (set_contact_consent, or set_marketing_consent for offers), then the consent_change decision as theirs, in one transaction. The doors'' rules are unchanged and asked there; this decides none of them. Returns what the door returns with decision_id and undo_dropped. The edge and the yes page keep calling the doors themselves and write no decision.';

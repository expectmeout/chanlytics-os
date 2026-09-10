-- 00100: a yes to OFFERS is written consent, and the door now says so.
--
-- 00095's own comment named the two ways this answer can legitimately arrive:
-- "a text from the customer and a person at the desk recording a form the
-- customer signed. Both are express written consent; neither is an inference."
-- Its check then let two more through -- 'in_person' and 'phone', a SPOKEN yes.
-- For promotional texts that is the one kind of consent the carriers refuse:
-- Twilio lists "the opt-in process relies on verbal consent instead of written
-- consent" among the causes of error 30913, and CTIA requires express written
-- consent for marketing messages.
--
-- So a yes to offers must come from 'form' (a sign-up form the customer signed)
-- or 'customer_message' (their own text). A NO may arrive any way at all:
-- somebody who says "no more offers" at the desk is honoured, not asked to write
-- it down. And a spoken yes is still a yes to messages about their own visit --
-- that is set_consent's door, which this does not touch.
--
-- Nothing on record changes: production held no yes to offers from any source,
-- spoken or otherwise, when this was written.
--
-- The body is 00095's with that one check added; `create or replace` keeps the
-- grants, which are restated so the file reads whole.

create or replace function public.set_marketing_consent(
  p_tenant_id  uuid,
  p_contact_id uuid,
  p_consent    text,
  p_source     text,
  p_note       text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.contacts%rowtype;
begin
  if p_consent not in ('unknown', 'opted_in', 'opted_out') then
    raise exception 'consent must be unknown, opted_in or opted_out' using errcode = '22023';
  end if;
  if p_source not in ('in_person', 'phone', 'form', 'customer_message', 'operator') then
    raise exception 'source must be in_person, phone, form, customer_message or operator' using errcode = '22023';
  end if;
  -- THE ONE CHANGE. A yes to offers is written, or it is not a yes to offers. A
  -- no, and the reset, may arrive any way at all.
  if p_consent = 'opted_in' and p_source not in ('form', 'customer_message') then
    raise exception 'a yes to offers must be in writing: a form the customer signed, or their own message' using errcode = '22023';
  end if;
  if p_note is not null and length(p_note) > 200 then
    raise exception 'note is too long' using errcode = '22023';
  end if;

  -- A signed-in caller must be allowed to act in this workspace. No session at
  -- all is the edge, holding the service key, recording what a customer texted.
  if auth.uid() is not null and not public.is_acting_member(p_tenant_id) then
    raise exception 'Not allowed to act in this workspace.' using errcode = '42501';
  end if;

  select * into v_row from public.contacts
   where id = p_contact_id and tenant_id = p_tenant_id;
  if not found then
    raise exception 'no such contact' using errcode = 'P0002';
  end if;
  if v_row.erased_at is not null then
    raise exception 'that person has been erased' using errcode = '42501';
  end if;

  -- `dnc` is deliberately NOT touched. It is the all-traffic stop, and saying
  -- "no thanks" to offers is not a request to stop hearing about your own
  -- appointment. The reverse is not symmetric and must not be made so: STOP
  -- sets dnc, and dnc blocks offers too.
  update public.contacts
     set marketing_consent            = p_consent,
         marketing_consent_source     = p_source,
         marketing_consent_updated_at = now()
   where id = p_contact_id and tenant_id = p_tenant_id
  returning * into v_row;

  -- The same ledger the conversational answer writes to, with the purpose named,
  -- so one query answers "what has this person agreed to and when". Consent
  -- events are never purged (00038).
  insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
  values (p_tenant_id, 'contact.consent_changed', 'contact', 'contact', p_contact_id,
          jsonb_build_object('purpose', 'marketing', 'consent', p_consent, 'source', p_source, 'note', p_note));

  return jsonb_build_object(
    'marketing_consent', v_row.marketing_consent,
    'marketing_consent_source', v_row.marketing_consent_source,
    'marketing_consent_updated_at', v_row.marketing_consent_updated_at
  );
end $$;

comment on function public.set_marketing_consent(uuid, uuid, text, text, text) is
  'Records a person''s answer about OFFERS, separately from their answer about conversation and appointments. A yes must be written -- a form the customer signed, or their own message; a no may arrive any way. Never touches dnc: declining offers is not a request to stop hearing about your own appointment. Callable by an acting member of the workspace, or by the edge with no session when a customer texts the marketing keyword from their own handset.';

revoke execute on function public.set_marketing_consent(uuid, uuid, text, text, text) from public, anon;
grant  execute on function public.set_marketing_consent(uuid, uuid, text, text, text) to authenticated;

do $$
begin
  raise notice '00100: a yes to offers is written consent -- a signed form or the customer''s own message. A spoken yes is refused for offers and still counts for messages about a visit.';
end $$;

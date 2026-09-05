-- 00043 Consent as a recorded fact.
--
-- A marketing message on WhatsApp needs the customer's yes, and the only yes
-- the product could record was a customer texting START. A salon hears "yes,
-- send me offers" at the front desk and on the phone far more often than by
-- text, so the answer needs a door the people who heard it can use: one
-- definer function, owner or operator, that writes the three consent columns
-- together, keeps the same event the ingest RPC keeps, and returns what
-- changed. The ledger row (verb consent_change) is written by the route, as
-- for every other verb, with who recorded it and how.
--
-- Sources name how the answer was given. 'customer_message' is what the
-- ingest writes for STOP and START; the other four are for a person who
-- heard it. 'operator' is the reset to "not asked".

create or replace function public.set_contact_consent(
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
  v_user   uuid := auth.uid();
  v_tenant uuid;
  v_erased timestamptz;
  v_before text;
  v_dnc    boolean;
begin
  -- The caller is auth.uid(), read HERE, never a parameter (00021's rule).
  if v_user is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  if p_consent is null or p_consent not in ('opted_in', 'opted_out', 'unknown') then
    raise exception 'Consent must be opted_in, opted_out or unknown.' using errcode = '22023';
  end if;
  if p_source is null or p_source not in ('in_person', 'phone', 'form', 'customer_message', 'operator') then
    raise exception 'Source must say how the answer was given.' using errcode = '22023';
  end if;
  if p_note is not null and length(p_note) > 200 then
    raise exception 'Note too long.' using errcode = '22023';
  end if;

  select c.tenant_id, c.erased_at, c.consent into v_tenant, v_erased, v_before
    from contacts c where c.id = p_contact_id;
  -- A stranger learns nothing: not a member reads as not found (00027's
  -- rule). Viewers read only, so they are strangers to this door too.
  if v_tenant is null or not public.is_acting_member(v_tenant) then
    raise exception 'Contact not found.' using errcode = 'P0002';
  end if;
  if v_erased is not null then
    raise exception 'This person was deleted.' using errcode = 'P0002';
  end if;

  -- dnc follows the answer the way the ingest sets it: a no is a no on every
  -- channel, and a yes or a reset lifts the operator's own block.
  v_dnc := (p_consent = 'opted_out');
  update contacts
     set consent = p_consent, dnc = v_dnc,
         consent_source = p_source, consent_updated_at = now()
   where id = p_contact_id;

  insert into events (tenant_id, kind, category, subject_type, subject_id, data)
  values (v_tenant, 'contact.consent_changed', 'contact', 'contact', p_contact_id,
          jsonb_build_object('consent', p_consent, 'source', p_source, 'previous', v_before,
                             'by', v_user, 'note', p_note));

  return jsonb_build_object(
    'contact_id', p_contact_id, 'consent', p_consent, 'dnc', v_dnc,
    'source', p_source, 'previous', v_before, 'updated_at', now());
end $$;

revoke execute on function public.set_contact_consent(uuid, text, text, text) from public, anon;
grant execute on function public.set_contact_consent(uuid, text, text, text) to authenticated;
comment on function public.set_contact_consent(uuid, text, text, text) is
  'Owner or operator records a customer''s answer about marketing messages: consent, dnc and the source together, plus the contact.consent_changed event. The ledger row is the route''s.';

-- The ledger records the answer: verb 'consent_change' on subject 'contact'.
-- packages/contracts/src/enums.ts carries the same list, and
-- tooling/scripts/tests/enums-vs-checks.test.mjs fails if the two drift.

alter table public.decisions drop constraint if exists decisions_verb_check;
alter table public.decisions add constraint decisions_verb_check
  check (verb in (
    'approve', 'edit', 'decline', 'snooze', 'wake', 'take_over', 'hand_back',
    'resolve', 'archive', 'reply', 'cancel_send', 'pause_agent', 'resume_agent',
    'invite', 'revoke_invite', 'change_role', 'remove_member', 'erase', 'whisper',
    'connect_channel', 'consent_change'
  ));

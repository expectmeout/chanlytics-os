-- 00095 · Marketing consent is a separate answer to a separate question.
--
-- THE DEFECT, and it is a regulatory one with a receipt. The carriers refused
-- the Chanlytics campaign with error 30913:
--
--   "The campaign submission has been reviewed and rejected because marketing
--    consent was combined with other consents. Marketing consent must be
--    collected separately."
--
-- They are right, and the page proves it. app.chanlytics.com/yes/<slug> asks for
-- ONE yes -- "Text YES OFFERS ... Sending it is your yes" -- and then says what
-- that yes covers: "You get offers, news AND APPOINTMENT REMINDERS". One
-- control, three purposes, marketing bundled with transactional. That is exactly
-- what 30913 names.
--
-- Underneath, `contacts.consent` is a single tri-state that every path spends:
-- the receptionist's reply, an operator's reply, a booking link, an appointment
-- reminder and a promotional broadcast all read the same field, and
-- 00043's own comment describes it as "a customer's answer about marketing
-- messages". So the one field is asked for one purpose and spent on all of them.
--
-- Two things follow, and both are already true of this product's own data:
--
--   OVER-BLOCKING. `visit_reminder` -- the only utility template in the starter
--   library, sent by the `visit_tomorrow` playbook to somebody with an
--   appointment on the calendar -- is skipped with reason `not_opted_in` unless
--   that person gave marketing-grade consent. A customer who booked a visit is
--   not told about it because they never asked for offers.
--
--   UNDER-BLOCKING. The voice agent's booking-link text is gated on opted_out
--   alone, so `consent = 'unknown'` sails through. Two proactive sends, two
--   different bars, decided per call site rather than by anything about the
--   message.
--
-- WHAT THIS ADDS, and deliberately how little. A second axis on contacts, and
-- ONE new door to write it. Nothing existing is recreated:
--
--   * `ingest_inbound` is the hot path for every inbound message in the product.
--     It is not touched. The edge already decides in TypeScript which keyword
--     arrived; when it is the marketing one it calls the new door afterwards.
--   * `set_contact_consent` keeps its exact signature and behaviour. It is the
--     conversational answer, and it still derives `dnc` from an opt-out, because
--     STOP means stop everything -- which is the carriers' rule and not ours to
--     soften.
--   * `erase_contact` needs no change to be correct (its tombstone sets
--     `dnc = true`, which blocks every purpose), but it now clears the new
--     columns too so an erased row carries no answer about anybody.
--
-- The asymmetry between the two axes is the point. Conversational consent can be
-- implied by a person writing to a business first. Marketing consent cannot be
-- implied by anything: CTIA §5.1 requires "express written consent to
-- specifically receive marketing messages", which is why the only ways to set it
-- here are a text from the customer's own handset and an operator recording a
-- form the customer signed.

alter table public.contacts
  add column if not exists marketing_consent text not null default 'unknown'
    check (marketing_consent in ('unknown', 'opted_in', 'opted_out'));
alter table public.contacts
  add column if not exists marketing_consent_source text;
alter table public.contacts
  add column if not exists marketing_consent_updated_at timestamptz;

comment on column public.contacts.marketing_consent is
  'Whether this person said yes to OFFERS specifically -- separate from public.contacts.consent, which is their answer about conversation and appointments. Never implied: only a text from their own handset or an operator recording a signed form sets it. Carrier error 30913 is what a single combined answer earns.';
comment on column public.contacts.marketing_consent_source is
  'How the marketing answer was given: the same vocabulary consent_source uses. "customer_message" is a text from their own handset, which is the express WRITTEN consent the carriers require for promotional messages.';

-- The audience read for a promotional send: opted in for offers, not stopped,
-- not erased. Partial because that is a small slice of the table and the only
-- slice this question ever asks for.
create index if not exists contacts_marketing_audience
  on public.contacts (tenant_id)
  where marketing_consent = 'opted_in' and dnc = false and erased_at is null;

-- ------------------------------------------------------------------- the door
--
-- ONE function, two callers, because the two ways this answer can legitimately
-- arrive are a text from the customer and a person at the desk recording a form
-- the customer signed. Both are express written consent; neither is an
-- inference.
--
-- The guard reads "a session must be an acting member; the absence of a session
-- is the edge". That is the same posture `ingest_inbound` has had since 00013 --
-- a definer function the edge calls with the service role, unreachable by
-- `anon` because EXECUTE is revoked from it below. It is written as a condition
-- rather than left implicit so the next reader can see it was decided.
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
  'Records a person''s answer about OFFERS, separately from their answer about conversation and appointments. Never touches dnc: declining offers is not a request to stop hearing about your own appointment. Callable by an acting member of the workspace, or by the edge with no session when a customer texts the marketing keyword from their own handset.';

revoke execute on function public.set_marketing_consent(uuid, uuid, text, text, text) from public, anon;
grant  execute on function public.set_marketing_consent(uuid, uuid, text, text, text) to authenticated;

-- ------------------------------------------------------- the tombstone, too
--
-- erase_contact already blocks every purpose by setting dnc, so this is not a
-- correctness fix. It is so an erased row holds no answer about a person who
-- asked to be forgotten.
create or replace function public.erase_marketing_consent(p_contact_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.contacts
     set marketing_consent = 'unknown',
         marketing_consent_source = 'erasure',
         marketing_consent_updated_at = now()
   where id = p_contact_id;
$$;

comment on function public.erase_marketing_consent(uuid) is
  'Clears the marketing answer as part of an erasure. Split from erase_contact rather than rewriting it: that function is long, it is the one path a person''s right to be forgotten runs through, and recreating it to add two columns is a risk with no upside.';

revoke execute on function public.erase_marketing_consent(uuid) from public, anon, authenticated;

do $$
begin
  raise notice '00095: marketing consent is separate. Nothing is opted in yet -- every row starts at unknown, which is the honest state for an answer nobody has been asked for.';
end $$;

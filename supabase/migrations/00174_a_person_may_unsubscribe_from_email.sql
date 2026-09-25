-- 00174 · A person may unsubscribe from a business's email.
--
-- Reach out, Part 2 (docs/superpowers/specs/2026-09-25-reach-out-design.md §4.6-§4.8; the plan is
-- docs/superpowers/plans/2026-09-25-reach-out-part-2-the-wire.md): every campaign email carries a one-click
-- unsubscribe (RFC 8058), and a press of it is honoured by the database, for every later send and every later
-- search. Email marketing is its own answer, apart from the two consent columns: US law lets a business write to
-- another business until it is told to stop (CAN-SPAM), so it starts "not asked", and the one thing a person can
-- say to it here is no.
--
--   contacts.email_marketing   unknown | opted_in | opted_out, with its source and when.
--   set_email_marketing(...)    the door an unsubscribe goes through. Service role only: the public page holds no
--                               session. It records the no, puts the address on the workspace's never-again list
--                               (lead_suppressions, email_opt_out) so no search mails it again, and closes the
--                               leads still being written to as said no (the canvas's states board). A converted
--                               lead keeps its stage; the send door refuses it anyway.

set local lock_timeout = '3s';

alter table public.contacts
  add column if not exists email_marketing text not null default 'unknown',
  add column if not exists email_marketing_source text,
  add column if not exists email_marketing_updated_at timestamptz;

alter table public.contacts drop constraint if exists contacts_email_marketing_check;
alter table public.contacts add constraint contacts_email_marketing_check
  check (email_marketing in ('unknown', 'opted_in', 'opted_out'));

comment on column public.contacts.email_marketing is
  'Whether this person may be sent marketing email (a reach-out, an offer): unknown until they say, opted_out once they unsubscribe. Apart from consent and marketing_consent, which are the texting and WhatsApp answers.';

create or replace function public.set_email_marketing(
  p_tenant_id uuid,
  p_contact_id uuid,
  p_state text,
  p_source text,
  p_evidence jsonb default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_business text;
  v_contact  public.contacts%rowtype;
  v_changed  boolean := false;
  v_lead     record;
begin
  -- One answer a public page can be trusted with: no, from an unsubscribe link. "No thanks" in a reply (Part 5)
  -- and a member's own reset widen this door when they arrive.
  if p_state is distinct from 'opted_out' or p_source is distinct from 'unsubscribe' then
    raise exception 'set_email_marketing records an unsubscribe: opted_out, from unsubscribe' using errcode = '22023';
  end if;
  select t.name into v_business from public.tenants t where t.id = p_tenant_id;
  select * into v_contact from public.contacts c
   where c.id = p_contact_id and c.tenant_id = p_tenant_id
   for update;
  -- A person who is gone, or asked to be forgotten, receives nothing already: nothing is written about them.
  if not found then
    return jsonb_build_object('changed', false, 'found', false, 'business', v_business);
  end if;
  if v_contact.erased_at is not null then
    return jsonb_build_object('changed', false, 'found', true, 'business', v_business);
  end if;

  if v_contact.email_marketing is distinct from 'opted_out' then
    update public.contacts
       set email_marketing = 'opted_out', email_marketing_source = p_source, email_marketing_updated_at = now()
     where id = p_contact_id and tenant_id = p_tenant_id;
    insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
    values (p_tenant_id, 'contact.consent_changed', 'contact', 'contact', p_contact_id,
            jsonb_build_object('purpose', 'email_marketing', 'consent', 'opted_out', 'source', p_source)
            || coalesce(p_evidence, '{}'::jsonb));
    v_changed := true;
  end if;

  -- The never-again list, by the address as it is stored (lower-cased, 00125): the finder drops a suppressed
  -- address from every lead it finds later (core leads runner), and the audience (Part 3) skips it.
  if v_contact.email is not null then
    insert into public.lead_suppressions (tenant_id, kind, hash, what)
    values (p_tenant_id, 'email', public.lead_suppression_hash(p_tenant_id, v_contact.email), 'email_opt_out')
    on conflict (tenant_id, kind, hash) do nothing;
  end if;

  -- The leads still being written to are closed as said no, each with its event. No lead_operations row: the
  -- person's own stop is not the owner's to undo, and the version moves, so an undo of an older step is refused.
  for v_lead in
    update public.leads
       set stage = 'archived', closed_reason = 'said_no', version = version + 1
     where tenant_id = p_tenant_id and contact_id = p_contact_id
       and stage in ('ready', 'nurture') and erased_at is null and blanked_at is null
    returning id
  loop
    insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
    values (p_tenant_id, 'lead.stage', 'lead', 'lead', v_lead.id,
            jsonb_build_object('stage', 'archived', 'reason', 'said_no', 'by', null, 'source', 'unsubscribe'));
  end loop;

  return jsonb_build_object('changed', v_changed, 'found', true, 'business', v_business);
end $$;

revoke execute on function public.set_email_marketing(uuid, uuid, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.set_email_marketing(uuid, uuid, text, text, jsonb) to service_role;
comment on function public.set_email_marketing(uuid, uuid, text, text, jsonb) is
  'The unsubscribe door (Reach out, Part 2): records opted_out from unsubscribe, once (a repeat changes nothing and writes no second event), puts the address on lead_suppressions (email_opt_out) and closes the person''s ready and nurture leads as said_no. Service role only.';

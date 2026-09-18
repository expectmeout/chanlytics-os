-- 00137 · Their own message is one they sent.
--
-- Ruben's decision, 18 Sep 2026. Both consent doors took 'customer_message'
-- from any signed-in member with nothing behind it, so a desk could record
-- that a customer had written their answer without anybody having looked for
-- where. The ledger is what a carrier or a regulator is shown (00110), and
-- "their own message" was the one way of answering it could not back.
--
-- So when a signed-in member records an answer in their own message, the door
-- takes the message: p_message_id, which must be one this person sent this
-- workspace -- inbound, from the customer, on a written wire, with words in it
-- (its text, or a photo's caption). The door reads it itself, and the event
-- keeps its id, its wire, the provider's id and the words: on one line, and
-- at most eighty characters of them, as 00110 keeps a texted answer's. The
-- evidence is then the database's reading of the message and never what a
-- caller wrote, so a session no longer hands p_evidence in at all. A message
-- named beside any other way of answering is refused too: the evidence keys
-- mean "their own message" and nothing else.
--
-- An answer given somewhere Chanlytics does not see is recorded as a sign-up
-- form, with a note saying where. 'form' is unchanged.
--
-- The edge is unchanged. It holds the service key, so auth.uid() is null; it
-- records a customer's own texted YES OFFERS with the evidence it has, names
-- no message and is asked for none, and its older call without p_evidence
-- still resolves.
--
-- A message imported from before Postgres (apps/edge/api/admin/backfill.ts)
-- is filed under 'backfill:<number>:<n>', which is no provider's id, and it
-- names the customer's number, while consent evidence outlives an erasure
-- (00131). So the evidence keeps no provider id for one.
--
-- The refusals are the sentences contracts says (OWN_MESSAGE_REFUSALS), so an
-- owner reads the same words whichever of the two refuses;
-- their-own-message.db.test.mjs holds them equal.
--
-- Each door gains one optional parameter, and its older form is dropped rather
-- than overloaded, so no call is ambiguous: PostgREST resolves a call naming
-- fewer arguments to the new one, defaults filling the rest. The bodies are
-- 00110's (set_marketing_consent) and 00043's (set_contact_consent), with the
-- message added.

drop function if exists public.set_marketing_consent(uuid, uuid, text, text, text, jsonb);

create or replace function public.set_marketing_consent(
  p_tenant_id  uuid,
  p_contact_id uuid,
  p_consent    text,
  p_source     text,
  p_note       text default null,
  p_evidence   jsonb default null,
  p_message_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row      public.contacts%rowtype;
  v_msg      public.messages%rowtype;
  v_words    text;
  v_evidence jsonb := p_evidence;
begin
  if p_consent not in ('unknown', 'opted_in', 'opted_out') then
    raise exception 'consent must be unknown, opted_in or opted_out' using errcode = '22023';
  end if;
  if p_source not in ('in_person', 'phone', 'form', 'customer_message', 'operator') then
    raise exception 'source must be in_person, phone, form, customer_message or operator' using errcode = '22023';
  end if;
  -- A yes to offers is written, or it is not a yes to offers (00100).
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

  -- A member's evidence is read from the message they name, never handed in.
  if auth.uid() is not null and p_evidence is not null then
    raise exception 'The evidence is read from their message. Name the message instead.' using errcode = '22023';
  end if;
  if p_message_id is not null and p_source <> 'customer_message' then
    raise exception 'Only an answer in their own message names a message.' using errcode = '22023';
  end if;
  if auth.uid() is not null and p_source = 'customer_message' and p_message_id is null then
    raise exception 'Choose the message where they said it. If they wrote to you somewhere Chanlytics doesn''t see, record a sign-up form and say where in the note.' using errcode = '22023';
  end if;

  select * into v_row from public.contacts
   where id = p_contact_id and tenant_id = p_tenant_id;
  if not found then
    raise exception 'no such contact' using errcode = 'P0002';
  end if;
  if v_row.erased_at is not null then
    raise exception 'that person has been erased' using errcode = '42501';
  end if;

  -- The message, read here: theirs, to this workspace, on a written wire. A
  -- call's note is the system's, and a reply is ours.
  if p_message_id is not null then
    select m.* into v_msg
      from public.messages m
      join public.conversations c on c.id = m.conversation_id
     where m.id = p_message_id
       and m.tenant_id = p_tenant_id
       and c.tenant_id = p_tenant_id
       and c.contact_id = p_contact_id
       and m.direction = 'inbound'
       and m.sender = 'customer'
       and m.channel not in ('voice', 'system');
    if not found then
      raise exception 'That isn''t a message this person sent you. Choose one of theirs.' using errcode = '22023';
    end if;
    v_words := coalesce(
      nullif(btrim(regexp_replace(coalesce(v_msg.body, ''), '\s+', ' ', 'g')), ''),
      nullif(btrim(regexp_replace(coalesce(v_msg.media->>'caption', ''), '\s+', ' ', 'g')), ''));
    if v_words is null then
      raise exception 'That message has no words in it to show their answer. Choose the one where they said it.' using errcode = '22023';
    end if;
    v_evidence := jsonb_build_object(
      'message_id', v_msg.id,
      'channel', v_msg.channel,
      'message_external_id', case when v_msg.external_id like 'backfill:%' then null else v_msg.external_id end,
      'words', left(v_words, 80));
  end if;

  -- `dnc` is deliberately NOT touched (00095): declining offers is not a
  -- request to stop hearing about your own appointment.
  update public.contacts
     set marketing_consent            = p_consent,
         marketing_consent_source     = p_source,
         marketing_consent_updated_at = now()
   where id = p_contact_id and tenant_id = p_tenant_id
  returning * into v_row;

  -- The same ledger the conversational answer writes to, with the purpose named.
  -- Consent events are never purged (00038).
  insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
  values (p_tenant_id, 'contact.consent_changed', 'contact', 'contact', p_contact_id,
          jsonb_build_object('purpose', 'marketing', 'consent', p_consent, 'source', p_source, 'note', p_note)
          || coalesce(v_evidence, '{}'::jsonb));

  return jsonb_build_object(
    'marketing_consent', v_row.marketing_consent,
    'marketing_consent_source', v_row.marketing_consent_source,
    'marketing_consent_updated_at', v_row.marketing_consent_updated_at
  );
end $$;

comment on function public.set_marketing_consent(uuid, uuid, text, text, text, jsonb, uuid) is
  'Records a person''s answer about OFFERS, separately from their answer about conversation and appointments. A yes must be written (form or their own message). A signed-in member''s "their own message" names the inbound message it was given in (p_message_id), and the event keeps that message''s id, wire, provider id and words; p_evidence is the edge''s alone, for an answer the customer texted. Never touches dnc.';

revoke execute on function public.set_marketing_consent(uuid, uuid, text, text, text, jsonb, uuid) from public, anon;
grant  execute on function public.set_marketing_consent(uuid, uuid, text, text, text, jsonb, uuid) to authenticated, service_role;

drop function if exists public.set_contact_consent(uuid, text, text, text);

create or replace function public.set_contact_consent(
  p_contact_id uuid,
  p_consent    text,
  p_source     text,
  p_note       text default null,
  p_message_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user     uuid := auth.uid();
  v_tenant   uuid;
  v_erased   timestamptz;
  v_before   text;
  v_dnc      boolean;
  v_msg      public.messages%rowtype;
  v_words    text;
  v_evidence jsonb;
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
  if p_message_id is not null and p_source <> 'customer_message' then
    raise exception 'Only an answer in their own message names a message.' using errcode = '22023';
  end if;
  if p_source = 'customer_message' and p_message_id is null then
    raise exception 'Choose the message where they said it. If they wrote to you somewhere Chanlytics doesn''t see, record a sign-up form and say where in the note.' using errcode = '22023';
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

  -- The message, read here, as the offers door reads it.
  if p_message_id is not null then
    select m.* into v_msg
      from public.messages m
      join public.conversations c on c.id = m.conversation_id
     where m.id = p_message_id
       and m.tenant_id = v_tenant
       and c.tenant_id = v_tenant
       and c.contact_id = p_contact_id
       and m.direction = 'inbound'
       and m.sender = 'customer'
       and m.channel not in ('voice', 'system');
    if not found then
      raise exception 'That isn''t a message this person sent you. Choose one of theirs.' using errcode = '22023';
    end if;
    v_words := coalesce(
      nullif(btrim(regexp_replace(coalesce(v_msg.body, ''), '\s+', ' ', 'g')), ''),
      nullif(btrim(regexp_replace(coalesce(v_msg.media->>'caption', ''), '\s+', ' ', 'g')), ''));
    if v_words is null then
      raise exception 'That message has no words in it to show their answer. Choose the one where they said it.' using errcode = '22023';
    end if;
    v_evidence := jsonb_build_object(
      'message_id', v_msg.id,
      'channel', v_msg.channel,
      'message_external_id', case when v_msg.external_id like 'backfill:%' then null else v_msg.external_id end,
      'words', left(v_words, 80));
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
                             'by', v_user, 'note', p_note)
          || coalesce(v_evidence, '{}'::jsonb));

  return jsonb_build_object(
    'contact_id', p_contact_id, 'consent', p_consent, 'dnc', v_dnc,
    'source', p_source, 'previous', v_before, 'updated_at', now());
end $$;

comment on function public.set_contact_consent(uuid, text, text, text, uuid) is
  'Owner or operator records a customer''s answer about messages on their own visit (not offers, which are set_marketing_consent''s since 00095): consent, dnc and the source together, plus the contact.consent_changed event. "Their own message" names the inbound message it was given in (p_message_id), and the event keeps that message''s id, wire, provider id and words. The ledger row is the route''s.';

revoke execute on function public.set_contact_consent(uuid, text, text, text, uuid) from public, anon;
grant  execute on function public.set_contact_consent(uuid, text, text, text, uuid) to authenticated;

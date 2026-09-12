-- A texted answer keeps its evidence.
--
-- The proof of a consent has been the state, the source, the time, a note and
-- the recorder's id. For an answer the customer TEXTED -- START, STOP, ALTA,
-- YES OFFERS -- that left out the one thing a carrier or a regulator asks to
-- see: the message itself. So the two doors a texted answer goes through now
-- write, on the same events row, the channel it came on, the provider's own
-- id of the message (a wamid or a Twilio SID, which the provider can be asked
-- about) and the customer's own words, at most eighty characters of them.
-- "When did she say yes, to what, and how do we know" is answered from the
-- ledger row alone.
--
-- ingest_inbound's body is 00013's, unchanged apart from the two event
-- inserts. set_marketing_consent's is 00100's with one optional parameter,
-- p_evidence, merged into its event: the edge passes what it knows about the
-- message, the desk passes nothing. The five-argument form is dropped rather
-- than overloaded, so no call site is ambiguous; PostgREST resolves a call
-- that names four or five arguments to this one, defaults filling the rest.

drop function if exists public.set_marketing_consent(uuid, uuid, text, text, text);

create or replace function public.set_marketing_consent(
  p_tenant_id  uuid,
  p_contact_id uuid,
  p_consent    text,
  p_source     text,
  p_note       text default null,
  p_evidence   jsonb default null
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
          jsonb_build_object('purpose', 'marketing', 'consent', p_consent, 'source', p_source, 'note', p_note)
          || coalesce(p_evidence, '{}'::jsonb));

  return jsonb_build_object(
    'marketing_consent', v_row.marketing_consent,
    'marketing_consent_source', v_row.marketing_consent_source,
    'marketing_consent_updated_at', v_row.marketing_consent_updated_at
  );
end $$;

comment on function public.set_marketing_consent(uuid, uuid, text, text, text, jsonb) is
  'Records a person''s answer about OFFERS, separately from their answer about conversation and appointments. A yes must be written (form or their own message). p_evidence, for an answer the customer texted, carries the channel, the provider''s message id and the words, onto the events row. Never touches dnc.';

revoke execute on function public.set_marketing_consent(uuid, uuid, text, text, text, jsonb) from public, anon;
grant  execute on function public.set_marketing_consent(uuid, uuid, text, text, text, jsonb) to authenticated;

create or replace function public.ingest_inbound(
  p_tenant_id           uuid,
  p_channel             text,
  p_identity_external_id text,
  p_phone_e164          text,
  p_wa_profile_name     text,
  p_message_external_id text,
  p_type                text,
  p_body                text,
  p_channel_ts          timestamptz,
  p_media               jsonb default null,
  p_meta                jsonb default '{}'::jsonb,
  p_opt_out             boolean default false,
  p_opt_in              boolean default false
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_contact_id      uuid;
  v_conversation_id uuid;
  v_message_id      uuid;
  v_state           text;
  v_paused          timestamptz;
  v_prev_wa         timestamptz;
  v_processed       timestamptz;
  v_consent         text;
  v_dnc             boolean;
  v_ts              timestamptz := coalesce(p_channel_ts, now());
begin
  -- serialize per identity: closes the NULL-phone concurrent-first-message race
  perform pg_advisory_xact_lock(
    hashtextextended(p_tenant_id::text || '|' || p_channel || '|' || p_identity_external_id, 42));

  select contact_id into v_contact_id
    from contact_identities
   where tenant_id = p_tenant_id and channel = p_channel and external_id = p_identity_external_id;

  if v_contact_id is null and p_phone_e164 is not null then
    select id into v_contact_id from contacts
     where tenant_id = p_tenant_id and phone_e164 = p_phone_e164;
  end if;

  if v_contact_id is null then
    insert into contacts (tenant_id, phone_e164, wa_profile_name, last_seen_at)
    values (p_tenant_id, p_phone_e164, p_wa_profile_name, now())
    on conflict (tenant_id, phone_e164) where phone_e164 is not null
      do update set last_seen_at = now(),
                    wa_profile_name = coalesce(excluded.wa_profile_name, contacts.wa_profile_name)
    returning id into v_contact_id;
  else
    update contacts
       set last_seen_at = now(),
           wa_profile_name = coalesce(p_wa_profile_name, wa_profile_name)
     where id = v_contact_id;
  end if;

  if p_opt_out then
    update contacts
       set consent = 'opted_out', dnc = true,
           consent_source = 'customer_message', consent_updated_at = now()
     where id = v_contact_id and consent is distinct from 'opted_out';
    if found then
      insert into events (tenant_id, kind, category, subject_type, subject_id, data)
      values (p_tenant_id, 'contact.consent_changed', 'contact', 'contact', v_contact_id,
              jsonb_build_object('consent', 'opted_out', 'source', 'customer_message',
                                 'channel', p_channel, 'message_external_id', p_message_external_id,
                                 'words', left(p_body, 80)));
    end if;
  elsif p_opt_in then
    -- The way back. Only an explicit word (START / ALTA / UNSTOP) reaches here,
    -- never an ordinary message — otherwise the block would lift itself the
    -- moment the customer said anything at all.
    update contacts
       set consent = 'opted_in', dnc = false,
           consent_source = 'customer_message', consent_updated_at = now()
     where id = v_contact_id and consent is distinct from 'opted_in';
    if found then
      insert into events (tenant_id, kind, category, subject_type, subject_id, data)
      values (p_tenant_id, 'contact.consent_changed', 'contact', 'contact', v_contact_id,
              jsonb_build_object('consent', 'opted_in', 'source', 'customer_message',
                                 'channel', p_channel, 'message_external_id', p_message_external_id,
                                 'words', left(p_body, 80)));
    end if;
  end if;

  -- Read back AFTER the update above, so a STOP arriving in this very batch is
  -- already reflected in what the caller is told.
  select consent, dnc into v_consent, v_dnc from contacts where id = v_contact_id;

  insert into contact_identities (tenant_id, contact_id, channel, external_id)
  values (p_tenant_id, v_contact_id, p_channel, p_identity_external_id)
  on conflict (tenant_id, channel, external_id) do nothing;

  -- monotone recency: a replayed/out-of-order old message can never rewind
  insert into conversations (tenant_id, contact_id, last_message_at, last_inbound_at)
  values (p_tenant_id, v_contact_id, v_ts, v_ts)
  on conflict (tenant_id, contact_id)
    do update set last_message_at = greatest(conversations.last_message_at, excluded.last_message_at),
                  last_inbound_at = greatest(conversations.last_inbound_at, excluded.last_inbound_at)
  returning id, state, paused_until, last_wa_inbound_at
    into v_conversation_id, v_state, v_paused, v_prev_wa;

  -- the atomic replay gate: a duplicate wamid short-circuits BEFORE any
  -- window/metering/reopen side effect
  insert into messages (tenant_id, conversation_id, contact_id, channel, direction, sender,
                        type, body, media, external_id, channel_ts, status, meta)
  values (p_tenant_id, v_conversation_id, v_contact_id, p_channel, 'inbound', 'customer',
          p_type, p_body, p_media, p_message_external_id, p_channel_ts, 'received', p_meta)
  on conflict (tenant_id, external_id) where external_id is not null do nothing
  returning id into v_message_id;

  if v_message_id is null then
    select id, (meta->>'processed_at')::timestamptz
      into v_message_id, v_processed
      from messages
     where tenant_id = p_tenant_id and external_id = p_message_external_id;
    return jsonb_build_object(
      'message_id', v_message_id, 'conversation_id', v_conversation_id,
      'contact_id', v_contact_id, 'is_new', false,
      'processed', v_processed is not null,
      'state', v_state, 'paused_until', v_paused,
      'consent', v_consent, 'dnc', v_dnc);
  end if;

  -- a new customer message reopens a closed thread (never overrides a human)
  if v_state in ('archived', 'snoozed') then
    update conversations
       set state = 'open', snooze_until = null
     where id = v_conversation_id;
    insert into events (tenant_id, kind, category, subject_type, subject_id, data)
    values (p_tenant_id, 'conversation.reopened', 'conversation', 'conversation', v_conversation_id,
            jsonb_build_object('from_state', v_state, 'trigger', 'customer_message'));
    v_state := 'open';
  end if;

  if p_channel = 'whatsapp' then
    -- Meta bills per service conversation; a >24h gap opens a new one (metering).
    if v_prev_wa is null or v_prev_wa < now() - interval '24 hours' then
      insert into events (tenant_id, kind, category, subject_type, subject_id, data)
      values (p_tenant_id, 'usage.wa_conversation', 'usage', 'conversation', v_conversation_id, '{}'::jsonb);
    end if;
    update conversations
       set last_wa_inbound_at = greatest(coalesce(last_wa_inbound_at, 'epoch'::timestamptz), v_ts)
     where id = v_conversation_id;
  end if;

  insert into events (tenant_id, kind, category, subject_type, subject_id, data)
  values (p_tenant_id, 'message.received', 'message', 'message', v_message_id,
          jsonb_build_object('channel', p_channel, 'type', p_type));

  return jsonb_build_object(
    'message_id', v_message_id, 'conversation_id', v_conversation_id,
    'contact_id', v_contact_id, 'is_new', true, 'processed', false,
    'state', v_state, 'paused_until', v_paused,
    'consent', v_consent, 'dnc', v_dnc);
end $$;

revoke execute on function public.ingest_inbound(uuid, text, text, text, text, text, text, text, timestamptz, jsonb, jsonb, boolean, boolean)
  from public, anon, authenticated;

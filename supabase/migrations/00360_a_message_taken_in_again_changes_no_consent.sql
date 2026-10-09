-- 00360 · A message taken in again changes nobody's consent.
--
-- ingest_inbound wrote a STOP's no and a START's yes before its replay gate (the message's own insert, on its unique
-- key), so a message it already held wrote its answer again. Every text is taken in twice by design (its door, then the
-- inbound_answer job that answers it, 00347, which runs the whole inbound phase again with Twilio's own fields), and a
-- WhatsApp message again on Meta's redelivery, an operator's replay and an answer taken up later. So START, then STOP,
-- then the START's job run late opted the person back in and lifted do-not-contact: a yes nobody gave since their no.
-- The mirror held a person out: an old STOP taken in again after their START blocked them.
--
-- Now the answer is written only by the call that kept the message: after the gate, and only when it is new. A message
-- already held reads the person's consent as it stands, so the caller is told what is true, and writes nothing else,
-- as before. The person's row is still locked where the answer was written before, so this door takes its locks in the
-- order it always took them. The email door's own check (db ingestInboundEmail, whether the email is already held)
-- stays: it is the same rule, asked before the call, for a database this migration has not reached.
--
-- Copied from its latest migration (00344) with the two blocks moved and the lock kept; nothing else changes.
-- `create or replace` keeps the grants; they are restated. Either deploy order works: the function's answer has the
-- same keys, and the edge that reads it is the same whichever lands first. Re-runnable.

set local lock_timeout = '3s';

create or replace function public.ingest_inbound(p_tenant_id uuid, p_channel text, p_identity_external_id text, p_phone_e164 text, p_wa_profile_name text, p_message_external_id text, p_type text, p_body text, p_channel_ts timestamp with time zone, p_media jsonb DEFAULT NULL::jsonb, p_meta jsonb DEFAULT '{}'::jsonb, p_opt_out boolean DEFAULT false, p_opt_in boolean DEFAULT false)
returns jsonb
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
  v_person          jsonb;
begin
  -- The person, through the one door (00342, 00344): the wire's identity, the number, and the address when the wire
  -- is email; what they called themselves follows the wire; seen now. The door takes the identity's lock this door
  -- took before it, so two first messages still make one person, and keeps the identity.
  v_person := public.resolve_person(
    p_tenant_id, p_channel, p_identity_external_id, p_phone_e164,
    case when p_channel = 'email'
          and char_length(p_identity_external_id) between 3 and 254
          and p_identity_external_id ~ '^[^[:space:]@<>]+@[^[:space:]@<>]+\.[^[:space:]@<>]+$'
         then p_identity_external_id end,
    p_wa_profile_name, 'observed', 'inbound', '{}'::jsonb, now());
  v_contact_id := (v_person->>'contact_id')::uuid;

  -- A STOP or a START is written below, once the message is known to be new (00360). The person's row is locked
  -- here, where that write used to be, so the person, the thread and the message are still locked in that order.
  if p_opt_out or p_opt_in then
    perform 1 from contacts where id = v_contact_id for no key update;
  end if;

  -- monotone recency: a replayed/out-of-order old message can never rewind
  insert into conversations (tenant_id, contact_id, last_message_at, last_inbound_at)
  values (p_tenant_id, v_contact_id, v_ts, v_ts)
  on conflict (tenant_id, contact_id)
    do update set last_message_at = greatest(conversations.last_message_at, excluded.last_message_at),
                  last_inbound_at = greatest(conversations.last_inbound_at, excluded.last_inbound_at)
  returning id, state, paused_until, last_wa_inbound_at
    into v_conversation_id, v_state, v_paused, v_prev_wa;

  -- the atomic replay gate: a duplicate wamid short-circuits BEFORE any
  -- consent/window/metering/reopen side effect
  insert into messages (tenant_id, conversation_id, contact_id, channel, direction, sender,
                        type, body, media, external_id, channel_ts, status, meta)
  values (p_tenant_id, v_conversation_id, v_contact_id, p_channel, 'inbound', 'customer',
          p_type, p_body, p_media, p_message_external_id, p_channel_ts, 'received', p_meta)
  on conflict (tenant_id, external_id) where external_id is not null do nothing
  returning id into v_message_id;

  if v_message_id is null then
    -- Held already: its answer was written when it was kept, and whatever the person has said since stands. What
    -- the caller is told is their consent as it is now.
    select consent, dnc into v_consent, v_dnc from contacts where id = v_contact_id;
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

revoke all on function public.ingest_inbound(uuid, text, text, text, text, text, text, text, timestamp with time zone, jsonb, jsonb, boolean, boolean) from public, anon, authenticated;
grant execute on function public.ingest_inbound(uuid, text, text, text, text, text, text, text, timestamp with time zone, jsonb, jsonb, boolean, boolean) to service_role;

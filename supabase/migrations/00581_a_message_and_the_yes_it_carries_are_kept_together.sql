-- 00581 · A message and the yes it carries are kept together (the inbound review, C9).
--
-- A START is a yes on the channel it came on, and YES OFFERS a yes to offers. The edge wrote each after ingest_inbound
-- had kept the message, in calls of their own (note_yes_on_channel, set_marketing_consent), so a message could be kept
-- and the yes it carried not. The edge held the two together with a ledger read on every repeat delivery, an error of
-- its own for "kept, but its yes is owed", and a flag saying which visit was to write it. Now ingest_inbound writes
-- both in the transaction that keeps the message: kept together, or not at all.
--
--   p_opt_in_marketing   new, last, default false: the offers yes, recorded as set_marketing_consent records a
--                        customer's own message (source customer_message, the evidence beside it), and never under a
--                        stop that stands after this message.
--   p_opt_in             as before, and then note_yes_on_channel for the channel the START came on.
--
-- The thirteen-argument function is dropped and the fourteen made in one transaction, so PostgREST never holds two to
-- choose between; it is copied from its latest migration (00484) with the lock and the one block above added and
-- nothing else changed. Grants as before: the service role alone.
--
-- Apply BEFORE the edge that passes p_opt_in_marketing deploys. An edge from before it keeps writing both yeses after
-- the ingest, and each is written once: the channel is held by then, so note_yes_on_channel writes nothing, and this
-- function writes no offers yes for an edge that does not pass one. Re-runnable throughout.

set local lock_timeout = '3s';

drop function if exists public.ingest_inbound(uuid, text, text, text, text, text, text, text, timestamp with time zone, jsonb, jsonb, boolean, boolean);

create or replace function public.ingest_inbound(p_tenant_id uuid, p_channel text, p_identity_external_id text, p_phone_e164 text, p_wa_profile_name text, p_message_external_id text, p_type text, p_body text, p_channel_ts timestamp with time zone, p_media jsonb DEFAULT NULL::jsonb, p_meta jsonb DEFAULT '{}'::jsonb, p_opt_out boolean DEFAULT false, p_opt_in boolean DEFAULT false, p_opt_in_marketing boolean DEFAULT false)
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

  -- A STOP or a START is written below, once the message is known to be new (00361), and so are the yeses a message
  -- carries (00581). The person's row is locked here, where that write used to be, so the person, the thread and the
  -- message are still locked in that order. A START's channel is noted under note_yes_on_channel's own lock, taken
  -- here at its full strength so it is never raised later in the transaction.
  if p_opt_in then
    perform 1 from contacts where id = v_contact_id for update;
  elsif p_opt_out or p_opt_in_marketing then
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

  -- The yeses this message carries, kept with it (00581): written here or not at all, and a repeat of the message,
  -- returned above, writes neither (its answer was written when it was kept).
  --
  -- A START is a yes on the channel it came on (contracts consent-channels.ts). The event above is written only when
  -- the answer changed, so a START by text from someone already opted in on WhatsApp is noted here (00297): the event
  -- that adds the channel, written only where their list lacks it.
  if p_opt_in then
    perform public.note_yes_on_channel(p_tenant_id, v_contact_id, p_channel, p_message_external_id, p_body);
  end if;
  -- YES OFFERS, the other answer (contracts consent.ts): its own column and its own ledger line, as the customer's own
  -- message, with what they wrote beside it (00110). Never under a stop that stands after this message: the way back
  -- from a STOP is START, and a yes kept under it would be one no later stop could end (00323). A refusal is the
  -- message's: nothing is kept, and the provider sends it again.
  if p_opt_in_marketing and v_consent is distinct from 'opted_out' and v_dnc is not true then
    perform public.set_marketing_consent(
      p_tenant_id, v_contact_id, 'opted_in', 'customer_message', null,
      jsonb_build_object('channel', p_channel, 'message_external_id', p_message_external_id,
                         'words', nullif(left(coalesce(p_body, ''), 80), '')));
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

  -- When this person last wrote on this wire (decision 0001, step 4), for every wire a person writes on, beside
  -- last_wa_inbound_at above, which is written as it was until no reader is left on it (step 7). The same clock the
  -- column takes, and as monotone: a replayed or late message never rewinds it. A wire this door has never taken is
  -- skipped, never refused: the message is already kept.
  if p_channel in ('whatsapp', 'sms', 'email', 'instagram') then
    insert into conversation_channel_state (tenant_id, conversation_id, channel, last_inbound_at)
    values (p_tenant_id, v_conversation_id, p_channel, v_ts)
    on conflict on constraint conversation_channel_state_one_per_wire
      do update set last_inbound_at = greatest(conversation_channel_state.last_inbound_at, excluded.last_inbound_at);
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

revoke all on function public.ingest_inbound(uuid, text, text, text, text, text, text, text, timestamp with time zone, jsonb, jsonb, boolean, boolean, boolean) from public, anon, authenticated;
grant execute on function public.ingest_inbound(uuid, text, text, text, text, text, text, text, timestamp with time zone, jsonb, jsonb, boolean, boolean, boolean) to service_role;

comment on function public.note_yes_on_channel(uuid, uuid, text, text, text) is
  'Called by ingest_inbound for a START, in the transaction that keeps the message (00581; One message, every channel, step 2): when the person''s answer is a yes and its consent_channels does not hold the channel the START came on (NULL holds WhatsApp), writes the contact.consent_changed event ingest_inbound leaves out for a yes already given, carrying the channel, the message, the words and covers_another_channel, so events_keep_consent_channels adds the channel and the ledger shows the yes. Answers whether it wrote one. A repeat finds the channel held and writes nothing. Never raises. Service role only.';

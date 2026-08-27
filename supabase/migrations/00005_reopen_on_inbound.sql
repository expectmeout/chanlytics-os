-- Slice 2 edge-case fix (found by live test, 2026-08-27):
-- an ARCHIVED or SNOOZED conversation swallowed new customer messages — the row
-- was recorded and the receptionist still replied, but the thread never came
-- back to the operator's queue. A new inbound is a new reason to look
-- (standard inbox semantics: a reply un-archives / un-snoozes).
--
-- Rules, applied only for a genuinely NEW customer message (post-dedupe):
--   archived | snoozed  -> open (snooze_until cleared) + conversation.reopened event
--   needs_human         -> unchanged (a human owns the thread)
--   open                -> unchanged

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
  p_opt_out             boolean default false
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
              jsonb_build_object('consent', 'opted_out', 'source', 'customer_message'));
    end if;
  end if;

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
      'state', v_state, 'paused_until', v_paused);
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
    'state', v_state, 'paused_until', v_paused);
end $$;

revoke execute on function public.ingest_inbound(uuid, text, text, text, text, text, text, text, timestamptz, jsonb, jsonb, boolean)
  from public, anon, authenticated;

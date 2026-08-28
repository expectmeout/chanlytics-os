-- Opt-out was recorded and never enforced.
--
-- Since 00002 the ingest RPC has set consent='opted_out', dnc=true when a
-- customer texts STOP. Nothing in this repository has ever read either column.
-- What happens on the live line is worse than "unimplemented": the customer
-- texts STOP, the RPC records the opt-out, and the SAME request then runs the
-- brain and texts them back. Every later message gets a reply too, and a human
-- replying from the dashboard reaches them as well.
--
-- This migration supplies what enforcement needs, and closes the trap that
-- enforcement alone would spring.
--
--   1. ingest_inbound RETURNS the contact's consent state, so the edge decides
--      using the value this same transaction just wrote — no second query, and
--      no race with a STOP that arrived earlier in the same webhook batch.
--
--   2. An opt-IN path. Blocking sends without one means a customer who texts
--      STOP is silenced forever, including when they text "start" the next
--      morning: one defect traded for a worse one. Only an explicit word
--      counts, so an ordinary message never lifts the block by accident.
--
--   3. An 'opt_out' escalation reason, so the owner is TOLD. A customer opting
--      out is a business event, not a log line.
--
-- The function body below is 00005's, unchanged apart from those edits.

alter table escalations drop constraint if exists escalations_reason_check;
alter table escalations add constraint escalations_reason_check
  check (reason in ('human_token','non_text','refusal','rate_cap','policy_block',
                    'send_failed','deadman','brain_error','manual','opt_out'));

-- Replaced, not overloaded: leaving the 12-arg version callable makes every
-- call site ambiguous.
drop function if exists public.ingest_inbound(
  uuid, text, text, text, text, text, text, text, timestamptz, jsonb, jsonb, boolean);

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
              jsonb_build_object('consent', 'opted_out', 'source', 'customer_message'));
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
              jsonb_build_object('consent', 'opted_in', 'source', 'customer_message'));
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

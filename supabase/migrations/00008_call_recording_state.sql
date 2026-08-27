-- Slice 3 fix (found by running the backfill twice, 2026-08-27):
-- ingest_call's ON CONFLICT used `recording = coalesce(excluded.recording, ...)`,
-- so a re-ingest — whose payload always starts as {provider_url, pending} —
-- overwrote an already-STORED recording back to "pending". The dashboard then
-- said "Recording still processing" forever for audio that was safely copied.
--
-- A completed copy is terminal: never let a fresh provider payload regress it.
-- Also return recording_state so callers can decide whether a copy is needed.

create or replace function public.ingest_call(
  p_tenant_id      uuid,
  p_retell_call_id text,
  p_agent_id       text,
  p_from_e164      text,
  p_from_raw       text,
  p_to_e164        text,
  p_direction      text,
  p_call_type      text,
  p_status         text,
  p_started_at     timestamptz,
  p_ended_at       timestamptz,
  p_duration_ms    integer,
  p_disconnection  text,
  p_sentiment      text,
  p_successful     boolean,
  p_in_voicemail   boolean,
  p_summary        text,
  p_transcript     text,
  p_transcript_obj jsonb,
  p_recording      jsonb,
  p_public_log_url text,
  p_cost           jsonb,
  p_latency        jsonb,
  p_raw            jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_contact_id      uuid;
  v_conversation_id uuid;
  v_channel_id      uuid;
  v_call_id         uuid;
  v_is_new          boolean := false;
  v_rec_state       text;
  v_ts              timestamptz := coalesce(p_started_at, now());
begin
  select id into v_channel_id from tenant_channels
   where kind = 'voice' and external_id = p_agent_id;

  if p_from_e164 is not null then
    perform pg_advisory_xact_lock(hashtextextended(p_tenant_id::text || '|voice|' || p_from_e164, 42));

    select contact_id into v_contact_id from contact_identities
     where tenant_id = p_tenant_id and channel = 'voice' and external_id = p_from_e164;

    if v_contact_id is null then
      select id into v_contact_id from contacts
       where tenant_id = p_tenant_id and phone_e164 = p_from_e164;
    end if;

    if v_contact_id is null then
      insert into contacts (tenant_id, phone_e164, last_seen_at)
      values (p_tenant_id, p_from_e164, greatest(v_ts, now() - interval '10 years'))
      on conflict (tenant_id, phone_e164) where phone_e164 is not null
        do update set last_seen_at = greatest(contacts.last_seen_at, excluded.last_seen_at)
      returning id into v_contact_id;
    end if;

    insert into contact_identities (tenant_id, contact_id, channel, external_id)
    values (p_tenant_id, v_contact_id, 'voice', p_from_e164)
    on conflict (tenant_id, channel, external_id) do nothing;

    insert into conversations (tenant_id, contact_id, last_message_at, last_inbound_at)
    values (p_tenant_id, v_contact_id, v_ts, v_ts)
    on conflict (tenant_id, contact_id)
      do update set last_message_at = greatest(conversations.last_message_at, excluded.last_message_at),
                    last_inbound_at = greatest(conversations.last_inbound_at, excluded.last_inbound_at)
    returning id into v_conversation_id;
  end if;

  insert into calls (
    tenant_id, channel_id, retell_call_id, agent_id, contact_id, conversation_id,
    direction, call_type, from_e164, to_e164, from_raw, status,
    started_at, ended_at, duration_ms, disconnection_reason,
    sentiment, call_successful, in_voicemail, summary, transcript, transcript_object,
    recording, public_log_url, cost, latency, raw
  ) values (
    p_tenant_id, v_channel_id, p_retell_call_id, p_agent_id, v_contact_id, v_conversation_id,
    coalesce(p_direction, 'inbound'), p_call_type, p_from_e164, p_to_e164, p_from_raw,
    coalesce(p_status, 'ended'),
    p_started_at, p_ended_at, p_duration_ms, p_disconnection,
    p_sentiment, p_successful, p_in_voicemail, p_summary, p_transcript, p_transcript_obj,
    p_recording, p_public_log_url, p_cost, p_latency, coalesce(p_raw, '{}'::jsonb)
  )
  on conflict (tenant_id, retell_call_id) do update set
    status               = excluded.status,
    ended_at             = coalesce(excluded.ended_at, calls.ended_at),
    duration_ms          = coalesce(excluded.duration_ms, calls.duration_ms),
    disconnection_reason = coalesce(excluded.disconnection_reason, calls.disconnection_reason),
    sentiment            = coalesce(excluded.sentiment, calls.sentiment),
    call_successful      = coalesce(excluded.call_successful, calls.call_successful),
    in_voicemail         = coalesce(excluded.in_voicemail, calls.in_voicemail),
    summary              = coalesce(excluded.summary, calls.summary),
    transcript           = coalesce(excluded.transcript, calls.transcript),
    transcript_object    = coalesce(excluded.transcript_object, calls.transcript_object),
    -- a stored copy is TERMINAL: a re-ingest must never regress it to pending
    recording            = case
                             when calls.recording->>'fetch_state' = 'stored' then calls.recording
                             else coalesce(excluded.recording, calls.recording)
                           end,
    public_log_url       = coalesce(excluded.public_log_url, calls.public_log_url),
    cost                 = coalesce(excluded.cost, calls.cost),
    latency              = coalesce(excluded.latency, calls.latency),
    contact_id           = coalesce(calls.contact_id, excluded.contact_id),
    conversation_id      = coalesce(calls.conversation_id, excluded.conversation_id),
    raw                  = excluded.raw
  returning id, (xmax = 0), recording->>'fetch_state'
    into v_call_id, v_is_new, v_rec_state;

  if v_is_new then
    insert into events (tenant_id, kind, category, subject_type, subject_id, data)
    values (p_tenant_id, 'call.recorded', 'call', 'call', v_call_id,
            jsonb_build_object('direction', coalesce(p_direction, 'inbound'), 'status', coalesce(p_status, 'ended')));
    if p_duration_ms is not null and p_duration_ms > 0 then
      insert into events (tenant_id, kind, category, subject_type, subject_id, data)
      values (p_tenant_id, 'usage.voice_seconds', 'usage', 'call', v_call_id,
              jsonb_build_object('seconds', round(p_duration_ms / 1000.0)));
    end if;
  end if;

  return jsonb_build_object(
    'call_id', v_call_id, 'is_new', v_is_new,
    'recording_state', v_rec_state,
    'contact_id', v_contact_id, 'conversation_id', v_conversation_id);
end $$;

revoke execute on function public.ingest_call(
  uuid, text, text, text, text, text, text, text, text, timestamptz, timestamptz, integer,
  text, text, boolean, boolean, text, text, jsonb, jsonb, text, jsonb, jsonb, jsonb)
  from public, anon, authenticated;

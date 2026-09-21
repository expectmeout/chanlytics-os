-- 00148 · Old audio goes, even on a quiet line, and stays gone.
--
-- Call audio is removed after RETENTION_DAYS.call_recordings (90, contracts
-- retention.ts) by the first leg of the calls sweep, purgeExpiredRecordings
-- in apps/edge/api/cron/calls.ts. pg_cron reaches that sweep only through
-- trigger_call_reconcile, which posts only when the calls table owes it work,
-- and its list (00034) was a call still marked ongoing, a copy still pending
-- and a thread still owed its call line. Audio past its days was not on it,
-- so on a quiet line the purge never ran, while the privacy page, the PRD and
-- every purged call's own words said ninety days.
--
-- 1. trigger_call_reconcile, from 00034, with that fourth kind of work: a
--    stored recording from a call that started more than 90 days ago, the
--    purge's own predicate. It also says again, where sweep_health() reads
--    it, when it has work and cannot send it, and clears that note when it
--    has none: 00026's rule, lost when 00031 re-declared the trigger from
--    00020's text. The note only. The request is still not recorded, so the
--    edge's answers stay unjudged, as they have been since 00031; judging
--    them is its own decision (pg_net waits 30 s here, the sweep may run 60).
--
-- 2. ingest_call, from 00061, with 'purged' among the final states. A
--    re-ingest carrying a recording URL (a late call_analyzed, the sweep
--    re-ingesting what the provider reports) turned a purged row back to
--    pending, and pending is what sends the copy to fetch the audio again.
--    The webhook's own guard (api/retell-webhook.ts) learns the same state.

create or replace function public.trigger_call_reconcile()
returns bigint
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_key text;
  v_url text;
  v_id  bigint;
  v_pending int;
begin
  select count(*) into v_pending
    from public.calls
   where (status = 'ongoing'
          and (updated_at < now() - interval '5 minutes'
               or started_at < now() - interval '30 minutes'))
      or (status in ('ended', 'error')
          and updated_at < now() - interval '5 minutes'
          and recording->>'fetch_state' = 'pending'
          and coalesce((recording->>'attempts')::int, 0) < 3)
      -- a call that ended without an analysis still owes the thread a line
      or (status in ('ended', 'error')
          and message_id is null
          and conversation_id is not null
          and ended_at < now() - interval '15 minutes')
      -- audio past its retention (contracts RETENTION_DAYS.call_recordings):
      -- exactly what the sweep's first leg, purgeExpiredRecordings, selects
      or (recording->>'fetch_state' = 'stored'
          and started_at < now() - interval '90 days');
  if v_pending = 0 then
    -- 00026: clearing the note here is load-bearing. On an idle line this is
    -- every tick, and a note one transient Vault failure wrote would otherwise
    -- outlive its fault and be mailed to the platform four times a day.
    update public.sweep_status set note = null where sweep = 'calls' and note is not null;
    return null;
  end if;

  select public.get_cron_sweep_key() into v_key;
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'edge_base_url';
  if v_key is null or v_url is null then
    raise warning 'call reconcile not configured (missing cron_sweep_key or edge_base_url)';
    insert into public.sweep_status (sweep, note)
         values ('calls', 'missing cron_sweep_key or edge_base_url in Vault')
    on conflict (sweep) do update set note = excluded.note;
    return null;
  end if;

  select net.http_post(
    url     := v_url || '/api/cron/calls',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-key', v_key),
    body    := '{}'::jsonb,
    timeout_milliseconds := 30000
  ) into v_id;
  update public.sweep_status set note = null where sweep = 'calls' and note is not null;
  return v_id;
end $$;

revoke execute on function public.trigger_call_reconcile() from public, anon, authenticated;

comment on function public.trigger_call_reconcile() is
  'Asks the edge (api/cron/calls) to sweep when the calls table owes it work: a call still marked ongoing, a recording copy still pending, a thread still owed its call line, or audio past its retention. With work and no way to send it, says so in sweep_status; with none, clears that note.';

/* -------------------------------------------- ingest_call, from 00061 -- */

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
  p_raw            jsonb,
  p_analysis       jsonb default null
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
  v_rec_attempts    integer;
  v_prev_duration   integer;
  v_had_row         boolean := false;
  v_ts              timestamptz := coalesce(p_started_at, now());
  v_raw             jsonb := public.scrub_call_raw(p_raw);
  -- The provider's custom analysis, filed as columns: what the caller
  -- wanted, how it ended, what a person should do next, the name they gave.
  v_wanted          text := nullif(btrim(p_analysis->>'caller_wanted'), '');
  v_outcome         text := case when p_analysis->>'outcome' in ('answered','booking_link_sent','callback_needed','voicemail','no_request','other')
                                 then p_analysis->>'outcome' end;
  v_follow_up       text := nullif(btrim(p_analysis->>'follow_up'), '');
  v_caller_name     text := nullif(btrim(p_analysis->>'caller_name'), '');
  v_analysis        jsonb := case when jsonb_typeof(p_analysis) = 'object' and p_analysis <> '{}'::jsonb then p_analysis end;
begin
  select id into v_channel_id from tenant_channels
   where kind = 'voice' and external_id = p_agent_id;

  -- ONE ingest of a given call at a time. Taken BEFORE the prior-state read
  -- below: two concurrent deliveries that both read "no duration yet" would
  -- both meter the call.
  perform pg_advisory_xact_lock(hashtextextended(p_tenant_id::text || '|call|' || p_retell_call_id, 42));

  -- What we already knew about this call. The usage event must fire exactly
  -- once, when the duration FIRST becomes known -- which, for a call that
  -- arrived as `call_started`, is the second or third event, not the first.
  select true, duration_ms into v_had_row, v_prev_duration
    from calls where tenant_id = p_tenant_id and retell_call_id = p_retell_call_id;

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
      -- Only when something moves. Every transcript turn of a live call
      -- re-ingests the same started_at; an unconditional DO UPDATE wrote the
      -- row -- and fired a realtime event that repainted every surface --
      -- for no change at all.
      where conversations.last_message_at is distinct from greatest(conversations.last_message_at, excluded.last_message_at)
         or conversations.last_inbound_at is distinct from greatest(conversations.last_inbound_at, excluded.last_inbound_at)
    returning id into v_conversation_id;
    if v_conversation_id is null then
      select id into v_conversation_id from conversations
       where tenant_id = p_tenant_id and contact_id = v_contact_id;
    end if;
  end if;

  insert into calls (
    tenant_id, channel_id, retell_call_id, agent_id, contact_id, conversation_id,
    direction, call_type, from_e164, to_e164, from_raw, status,
    started_at, ended_at, duration_ms, disconnection_reason,
    sentiment, call_successful, in_voicemail, summary, transcript, transcript_object,
    recording, public_log_url, cost, latency, raw,
    wanted, outcome, follow_up, caller_name, analysis
  ) values (
    p_tenant_id, v_channel_id, p_retell_call_id, p_agent_id, v_contact_id, v_conversation_id,
    coalesce(p_direction, 'inbound'), p_call_type, p_from_e164, p_to_e164, p_from_raw,
    coalesce(p_status, 'ended'),
    p_started_at, p_ended_at, p_duration_ms, p_disconnection,
    p_sentiment, p_successful, p_in_voicemail, p_summary, p_transcript, p_transcript_obj,
    p_recording, null, p_cost, p_latency, v_raw,
    v_wanted, v_outcome, v_follow_up, v_caller_name, v_analysis
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
    -- a live `transcript_updated` turn replaces the previous partial; the
    -- final transcript on call_ended replaces the last partial the same way
    transcript_object    = coalesce(excluded.transcript_object, calls.transcript_object),
    -- a stored, given-up or purged copy is TERMINAL: a re-ingest must never
    -- regress it to pending, a purged one least of all -- pending sends the
    -- copy to fetch the audio again (00148); a pending one keeps its attempt
    -- count across events
    recording            = case
                             when calls.recording->>'fetch_state' in ('stored', 'failed', 'purged') then calls.recording
                             when calls.recording->>'fetch_state' = 'pending' and excluded.recording is not null
                               then calls.recording || excluded.recording
                             else coalesce(excluded.recording, calls.recording)
                           end,
    public_log_url       = null,
    cost                 = coalesce(excluded.cost, calls.cost),
    latency              = coalesce(excluded.latency, calls.latency),
    -- the analysis arrives on call_analyzed and stays: a retried call_ended
    -- carries none and must not blank it
    wanted               = coalesce(excluded.wanted, calls.wanted),
    outcome              = coalesce(excluded.outcome, calls.outcome),
    follow_up            = coalesce(excluded.follow_up, calls.follow_up),
    caller_name          = coalesce(excluded.caller_name, calls.caller_name),
    analysis             = coalesce(excluded.analysis, calls.analysis),
    contact_id           = coalesce(calls.contact_id, excluded.contact_id),
    conversation_id      = coalesce(calls.conversation_id, excluded.conversation_id),
    -- the audit copy keeps the analysis: a retried call_ended landing after
    -- call_analyzed ranks equal and must not replace the richer payload
    raw                  = case
                             when (calls.raw ? 'call_analysis') and not (excluded.raw ? 'call_analysis') then calls.raw
                             else excluded.raw
                           end
  -- FORWARD ONLY. An event older than the row (a retried call_started after
  -- call_ended, a partial transcript after the final one) changes nothing.
  where public.call_status_rank(excluded.status) >= public.call_status_rank(calls.status)
  returning id, (xmax = 0), recording->>'fetch_state', (recording->>'attempts')::int
    into v_call_id, v_is_new, v_rec_state, v_rec_attempts;

  if v_call_id is null then
    -- The upsert declined: nothing moved, including updated_at, so a stale
    -- event cannot restart the heartbeat isLiveCall() reads. Answer from the
    -- row as it stands.
    select id, recording->>'fetch_state', (recording->>'attempts')::int, contact_id, conversation_id
      into v_call_id, v_rec_state, v_rec_attempts, v_contact_id, v_conversation_id
      from calls where tenant_id = p_tenant_id and retell_call_id = p_retell_call_id;
    return jsonb_build_object(
      'call_id', v_call_id, 'is_new', false, 'skipped', true,
      'recording_state', v_rec_state, 'recording_attempts', v_rec_attempts,
      'contact_id', v_contact_id, 'conversation_id', v_conversation_id);
  end if;

  if v_is_new then
    insert into events (tenant_id, kind, category, subject_type, subject_id, data)
    values (p_tenant_id, 'call.recorded', 'call', 'call', v_call_id,
            jsonb_build_object('direction', coalesce(p_direction, 'inbound'), 'status', coalesce(p_status, 'ended')));
  end if;

  -- Metered once, on the event that first carries a duration -- and never a
  -- second row for the same call, whatever the caller believed it knew.
  if p_duration_ms is not null and p_duration_ms > 0
     and (not v_had_row or v_prev_duration is null)
     and not exists (select 1 from events e
                      where e.kind = 'usage.voice_seconds'
                        and e.subject_type = 'call'
                        and e.subject_id = v_call_id) then
    insert into events (tenant_id, kind, category, subject_type, subject_id, data)
    values (p_tenant_id, 'usage.voice_seconds', 'usage', 'call', v_call_id,
            jsonb_build_object('seconds', round(p_duration_ms / 1000.0)));
  end if;

  return jsonb_build_object(
    'call_id', v_call_id, 'is_new', v_is_new, 'skipped', false,
    'recording_state', v_rec_state, 'recording_attempts', v_rec_attempts,
    'contact_id', v_contact_id, 'conversation_id', v_conversation_id);
end $$;

revoke execute on function public.ingest_call(
  uuid, text, text, text, text, text, text, text, text, timestamptz, timestamptz, integer,
  text, text, boolean, boolean, text, text, jsonb, jsonb, text, jsonb, jsonb, jsonb, jsonb)
  from public, anon, authenticated;

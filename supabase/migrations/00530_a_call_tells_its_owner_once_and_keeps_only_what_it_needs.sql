-- A call tells its owner once and keeps only what it needs (decision 0092).
--
--   calls.notice_told_at      The owner's notice went out in full: the bell, the phones and the mail. notified_at, the
--                             claim, says the notice is owed and kept; a mail that failed used to be lost behind it. The
--                             calls sweep finishes a notice claimed and not told, and notifyOnce sends only the mail still
--                             owed. Every notice claimed before this file counts as told.
--   calls.guard_corrected_at  A price said aloud is corrected once a call, whichever instance hears it (an in-memory set
--                             corrected it once per instance).
--   scrub_call_raw            An allowlist of what an audit of the provider's delivery needs. The payload kept the facts
--                             and the caller's memory the call was briefed with, the SIP headers (a forwarded number is
--                             often an owner's own mobile), the telephony ids and three more copies of the transcript,
--                             in a column every member can read. The rows kept so far are scrubbed the same way.
--   ingest_call               Keeps the payload it has when a delivery carries none: a live transcript turn no longer
--                             rewrites it.
--   trigger_call_reconcile    Wakes the sweep for a missed call's thread line, and for a notice claimed and not told.
--
-- The index the sweep finds an owed notice by is 00531's, alone in its file: calls takes a write for every call.

alter table public.calls
  add column if not exists guard_corrected_at timestamptz,
  add column if not exists notice_told_at timestamptz;

comment on column public.calls.guard_corrected_at is 'When a price the receptionist said aloud was corrected on the live call. Set once by an UPDATE ... WHERE guard_corrected_at IS NULL, so a call whose turns reach two instances is corrected once (00530).';
comment on column public.calls.notice_told_at is 'When the owner''s notice of the call went out in full: the bell, the phones and the mail (notified_at is the claim that it is owed). Null with notified_at set is a notice the calls sweep still owes (00530).';

-- The notices claimed before this file were told the way they were told then.
update public.calls set notice_told_at = notified_at where notified_at is not null and notice_told_at is null;

create or replace function public.scrub_call_raw(p_raw jsonb) returns jsonb
    language sql immutable
    set search_path to 'public'
    as $$
  select coalesce((
    select jsonb_object_agg(e.k, e.v)
      from jsonb_each(case when jsonb_typeof(p_raw) = 'object' then p_raw else '{}'::jsonb end) as e(k, v)
     where e.k in ('agent_id', 'agent_name', 'agent_version', 'call_id', 'call_type', 'call_status', 'direction',
                   'disconnection_reason', 'start_timestamp', 'end_timestamp', 'duration_ms', 'call_cost', 'latency',
                   'llm_token_usage', 'call_analysis', 'metadata', 'data_storage_setting', 'opt_in_signed_url')
  ), '{}'::jsonb)
$$;

-- What the rows kept so far hold of the provider's payload, cut to the allowlist.
update public.calls set raw = public.scrub_call_raw(raw) where raw is distinct from public.scrub_call_raw(raw);

create or replace function public.ingest_call(p_tenant_id uuid, p_retell_call_id text, p_agent_id text, p_from_e164 text, p_from_raw text, p_to_e164 text, p_direction text, p_call_type text, p_status text, p_started_at timestamp with time zone, p_ended_at timestamp with time zone, p_duration_ms integer, p_disconnection text, p_sentiment text, p_successful boolean, p_in_voicemail boolean, p_summary text, p_transcript text, p_transcript_obj jsonb, p_recording jsonb, p_public_log_url text, p_cost jsonb, p_latency jsonb, p_raw jsonb, p_analysis jsonb DEFAULT NULL::jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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
  v_person          jsonb;
begin
  -- Only the call's own workspace's line (00164): whatever agent id it
  -- carries, a call is never filed under another workspace's channel.
  select id into v_channel_id from tenant_channels
   where kind = 'voice' and external_id = p_agent_id and tenant_id = p_tenant_id;

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
    -- The caller, through the one door (00342, 00344), once per call: a row that already names them is read, not
    -- resolved again, so a live call's every transcript turn writes nothing of the person. The door takes the voice
    -- identity's lock this door took before it, keeps the identity, and moves last_seen_at to the call's start only
    -- forward.
    if v_had_row then
      select contact_id into v_contact_id from calls
       where tenant_id = p_tenant_id and retell_call_id = p_retell_call_id;
    end if;
    if v_contact_id is null then
      v_person := public.resolve_person(p_tenant_id, 'voice', p_from_e164, p_from_e164, null, null, 'observed', 'call',
                                        '{}'::jsonb, greatest(v_ts, now() - interval '10 years'));
      v_contact_id := (v_person->>'contact_id')::uuid;
    end if;

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
    -- call_analyzed ranks equal and must not replace the richer payload; and
    -- a delivery that carries none (a live transcript turn, 00530) keeps what
    -- the row has rather than rewriting it on every turn
    raw                  = case
                             when excluded.raw = '{}'::jsonb then calls.raw
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

create or replace function public.trigger_call_reconcile() RETURNS bigint
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $$
declare
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
      -- a call that ended without an analysis still owes the thread a line, and so does a missed call (00530)
      or (status in ('ended', 'error', 'not_connected')
          and message_id is null
          and conversation_id is not null
          and coalesce(ended_at, started_at, created_at) < now() - interval '15 minutes')
      -- a notice claimed and not told in full (a mail that failed, deliveries the provider stopped retrying): finished
      -- by the sweep for two days after it was claimed (00530)
      or (notified_at is not null
          and notice_told_at is null
          and notified_at < now() - interval '10 minutes'
          and notified_at > now() - interval '2 days')
      -- a call whose owner was never told, its analysis not here or asking for a call back: asked of the provider for
      -- two hours after it ended (00434, the sweep's settle leg)
      or (status in ('ended', 'error')
          and notified_at is null
          and conversation_id is not null
          and coalesce(duration_ms, 0) >= 15000
          and ended_at < now() - interval '10 minutes'
          and ended_at > now() - interval '2 hours'
          and (summary is null or outcome = 'callback_needed'))
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

  -- The request id and when it was enqueued, or, when Vault cannot send it,
  -- the note: whichever it is, where sweep_health() reads it.
  return public.request_sweep('calls', '/api/cron/calls', 65000);
end $$;

comment on function public.trigger_call_reconcile() is 'Asks the edge (api/cron/calls) to sweep when the calls table owes it work: a call still marked ongoing, a recording copy still pending, a thread still owed its call line (a missed call''s too), a call whose owner was never told (for two hours after it ended), a notice claimed and not told in full (for two days after its claim), or audio past its retention. Asks through request_sweep(), which records the request so sweep_health() judges the answer, and waits 65 s, past the sweep''s own 60. With nothing owed, clears the note and records nothing else.';

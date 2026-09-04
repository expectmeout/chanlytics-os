-- 00034 Call pipeline hardening: one ingest per call at a time, usage metered
-- once, the audit copy keeps its analysis, a conversation row that only moves
-- when something moved, no provider URLs in rows the browser can read, a
-- one-time claim for the post-call email, and a sweep that also checks calls
-- that have simply run too long.
--
-- Review findings F7, F9, F10, F13, F25 (2026-09-04).

-- ---------------------------------------------------------------------------
-- (1) Provider URLs leave the rows. calls is in the realtime publication and
--     members may SELECT it, so every column reached every member's browser
--     over the websocket — including the UNSIGNED public recording URL that the
--     REST layer is careful to strip. The URL is not a fact the product needs
--     to keep: the copy lives in the private bucket, and a retry asks the
--     provider for a fresh one by call id.
-- ---------------------------------------------------------------------------

create or replace function public.scrub_call_raw(p_raw jsonb)
returns jsonb
language sql
immutable
set search_path = public
as $$
  select coalesce(p_raw, '{}'::jsonb) - 'recording_url' - 'recording_multi_channel_url' - 'public_log_url'
$$;

revoke all on function public.scrub_call_raw(jsonb) from public, anon;
grant execute on function public.scrub_call_raw(jsonb) to authenticated, service_role;

update public.calls
   set raw = public.scrub_call_raw(raw),
       public_log_url = null,
       recording = recording - 'provider_url'
 where (raw ? 'recording_url') or (raw ? 'recording_multi_channel_url') or (raw ? 'public_log_url')
    or public_log_url is not null
    or (recording ? 'provider_url');

-- The post-call email and the bot's memory note happen once per call. Retell
-- retries a slow delivery and replays inside the signature window; the claim
-- is what makes the second delivery a no-op.
alter table public.calls add column if not exists notified_at timestamptz;
comment on column public.calls.notified_at is
  'When the post-call summary email and memory note were sent. Set once by an UPDATE ... WHERE notified_at IS NULL, so a retried call_analyzed sends nothing twice.';

-- ---------------------------------------------------------------------------
-- (2) ingest_call, forward-only as in 00031, plus:
--     - an advisory lock on the CALL, taken before the prior-state read, so a
--       webhook retry and the reconcile sweep cannot both see "no duration
--       yet" and both meter the call (and a withheld caller ID, which had no
--       lock at all, is serialised too);
--     - the usage insert refuses a second row for the same call outright;
--     - the audit copy (raw) keeps the analysis when a same-rank retry of
--       call_ended lands after call_analyzed;
--     - raw is scrubbed of provider URLs and public_log_url is never stored;
--     - the conversation row is written only when its timestamps move, so a
--       live call's transcript turns stop producing a conversations event
--       each (which fanned out to every surface).
-- ---------------------------------------------------------------------------

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
  v_rec_attempts    integer;
  v_prev_duration   integer;
  v_had_row         boolean := false;
  v_ts              timestamptz := coalesce(p_started_at, now());
  v_raw             jsonb := public.scrub_call_raw(p_raw);
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
    recording, public_log_url, cost, latency, raw
  ) values (
    p_tenant_id, v_channel_id, p_retell_call_id, p_agent_id, v_contact_id, v_conversation_id,
    coalesce(p_direction, 'inbound'), p_call_type, p_from_e164, p_to_e164, p_from_raw,
    coalesce(p_status, 'ended'),
    p_started_at, p_ended_at, p_duration_ms, p_disconnection,
    p_sentiment, p_successful, p_in_voicemail, p_summary, p_transcript, p_transcript_obj,
    p_recording, null, p_cost, p_latency, v_raw
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
    -- a stored (or given-up) copy is TERMINAL: a re-ingest must never regress
    -- it to pending; a pending one keeps its attempt count across events
    recording            = case
                             when calls.recording->>'fetch_state' in ('stored', 'failed') then calls.recording
                             when calls.recording->>'fetch_state' = 'pending' and excluded.recording is not null
                               then calls.recording || excluded.recording
                             else coalesce(excluded.recording, calls.recording)
                           end,
    public_log_url       = null,
    cost                 = coalesce(excluded.cost, calls.cost),
    latency              = coalesce(excluded.latency, calls.latency),
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
  text, text, boolean, boolean, text, text, jsonb, jsonb, text, jsonb, jsonb, jsonb)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- (3) The sweep also asks about calls that have simply run too long. The Live
--     page said "checking with the phone provider" for a call live past thirty
--     minutes, and the sweep only ever looked at rows nobody had touched for
--     five -- a long call with turns every few seconds was never checked.
-- ---------------------------------------------------------------------------

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
          and ended_at < now() - interval '15 minutes');
  if v_pending = 0 then
    return null;
  end if;

  select public.get_cron_sweep_key() into v_key;
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'edge_base_url';
  if v_key is null or v_url is null then
    raise warning 'call reconcile not configured (missing cron_sweep_key or edge_base_url)';
    return null;
  end if;

  select net.http_post(
    url     := v_url || '/api/cron/calls',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-key', v_key),
    body    := '{}'::jsonb,
    timeout_milliseconds := 30000
  ) into v_id;
  return v_id;
end $$;

revoke execute on function public.trigger_call_reconcile() from public, anon, authenticated;

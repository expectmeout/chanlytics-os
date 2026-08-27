-- Slice 3 / migration 0007 — Calls: the voice channel becomes a first-class
-- surface. Shapes verified against the LIVE Retell account (432 calls probed,
-- 2026-08-27): every column below maps to a real field on the call object.
--
-- Two facts drove this design:
--   * Only 4 of the account's 432 calls belong to Melany's agent — routing and
--     backfill MUST filter on tenant_channels(kind='voice', external_id=agent_id).
--   * recording_url is a PUBLIC unsigned CloudFront URL (HEAD 200, no auth).
--     We keep the provider URL for provenance but copy audio into private
--     Storage, so a customer's recording is never one guessed link away.

create table public.calls (
  id                   uuid primary key default gen_random_uuid(),
  tenant_id            uuid not null references public.tenants (id) on delete cascade,
  channel_id           uuid references public.tenant_channels (id),
  retell_call_id       text not null,
  agent_id             text,
  contact_id           uuid references public.contacts (id) on delete set null,
  conversation_id      uuid references public.conversations (id) on delete set null,
  message_id           uuid references public.messages (id) on delete set null, -- the call_summary note in the thread
  direction            text not null default 'inbound' check (direction in ('inbound','outbound')),
  call_type            text,                       -- phone_call | web_call
  from_e164            text,
  to_e164              text,
  from_raw             text,                       -- withheld / non-E.164 caller id, verbatim
  status               text not null default 'ended' check (status in ('registered','ongoing','ended','error')),
  started_at           timestamptz,
  ended_at             timestamptz,
  duration_ms          integer,
  disconnection_reason text,
  sentiment            text,
  call_successful      boolean,
  in_voicemail         boolean,
  summary              text,
  transcript           text,
  transcript_object    jsonb,                      -- role/content/words with timings
  recording            jsonb,                      -- {provider_url, storage_path, fetch_state, bytes, mime}
  public_log_url       text,
  cost                 jsonb,                      -- call_cost as returned
  latency              jsonb,
  raw                  jsonb not null default '{}'::jsonb,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (tenant_id, retell_call_id)
);

create index calls_tenant_started on public.calls (tenant_id, started_at desc nulls last);
create index calls_conversation on public.calls (conversation_id, started_at desc);
create index calls_contact on public.calls (contact_id, started_at desc);
create index calls_live on public.calls (tenant_id) where status = 'ongoing';

create trigger calls_set_updated_at
  before update on public.calls
  for each row execute function extensions.moddatetime('updated_at');

alter table public.calls enable row level security;

create policy calls_member_select on public.calls
  for select to authenticated
  using (tenant_id in (select m.tenant_id from public.memberships m where m.user_id = (select auth.uid())));

alter publication supabase_realtime add table public.calls;

-- Melany's live voice agent (from tooling/scripts/voice-ids.json — the routing
-- key for both the webhook and the backfill).
insert into public.tenant_channels (tenant_id, kind, external_id, number_e164, config)
select id, 'voice', 'agent_242005d0ce9352af2cef792432', '+13083368109',
       jsonb_build_object('provider', 'retell', 'llm_id', 'llm_ddde8bb71cd8090dece4ca69a2c5')
  from public.tenants where slug = 'melanys-beauty-salon'
on conflict (kind, external_id) do nothing;

-- Ingest one call idempotently: resolve identity, upsert the row, and keep the
-- customer's single cross-channel thread as the place a human reads it.
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
  v_ts              timestamptz := coalesce(p_started_at, now());
begin
  select id into v_channel_id from tenant_channels
   where kind = 'voice' and external_id = p_agent_id;

  -- Identity: a caller with a number joins that contact's existing thread
  -- (cross-channel memory); a withheld number stays call-only.
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
    -- a later webhook stage (ended -> analyzed) enriches the same row
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
    recording            = coalesce(excluded.recording, calls.recording),
    public_log_url       = coalesce(excluded.public_log_url, calls.public_log_url),
    cost                 = coalesce(excluded.cost, calls.cost),
    latency              = coalesce(excluded.latency, calls.latency),
    contact_id           = coalesce(calls.contact_id, excluded.contact_id),
    conversation_id      = coalesce(calls.conversation_id, excluded.conversation_id),
    raw                  = excluded.raw
  returning id, (xmax = 0) into v_call_id, v_is_new;

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
    'contact_id', v_contact_id, 'conversation_id', v_conversation_id);
end $$;

revoke execute on function public.ingest_call(
  uuid, text, text, text, text, text, text, text, text, timestamptz, timestamptz, integer,
  text, text, boolean, boolean, text, text, jsonb, jsonb, text, jsonb, jsonb, jsonb)
  from public, anon, authenticated;

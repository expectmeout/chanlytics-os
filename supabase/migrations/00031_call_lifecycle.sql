-- 00031 Call lifecycle: a call's status only moves forward, a dial that never
-- connected is not a call, usage is metered when the duration becomes known,
-- and a recording copy that did not finish is retried by the sweep.
--
-- Why. Retell delivers webhook events in order but NOT blocking, and retries a
-- non-2xx up to three times, so a retried `call_started` can land after
-- `call_ended`. ingest_call wrote `status = excluded.status`, which flipped an
-- ended call back to "ongoing" -- a phantom live call on every surface that
-- reads the flag, for up to ten minutes, until the reconcile sweep asked the
-- provider. Retell also reports `not_connected` for a dial that never
-- connected; the adapter folded it into "ended", so a missed dial counted as a
-- call with no duration in Today's metrics, Reports and People.
--
-- The rule is a rank: registered (0) < ongoing (1) < ended | error |
-- not_connected (2). An event whose status ranks below the row's is a no-op:
-- nothing is written, updated_at does not move, so a stale event cannot
-- restart the live heartbeat either. The caller is told (`skipped`).

-- The status check was declared inline in 00007, so its name is whatever
-- Postgres chose. Drop it by what it says, not by what it is called.
do $$
declare c record;
begin
  for c in
    select conname from pg_constraint
     where conrelid = 'public.calls'::regclass
       and contype = 'c'
       and pg_get_constraintdef(oid) like '%status%'
  loop
    execute format('alter table public.calls drop constraint %I', c.conname);
  end loop;
end $$;
alter table public.calls
  add constraint calls_status_check
  check (status in ('registered', 'ongoing', 'ended', 'error', 'not_connected'));

-- The ordering, in one place. IMMUTABLE so it can sit in the upsert's WHERE.
create or replace function public.call_status_rank(p_status text)
returns integer
language sql
immutable
set search_path = public
as $$
  select case p_status
           when 'registered' then 0
           when 'ongoing'    then 1
           else 2   -- ended, error, not_connected: terminal
         end
$$;

revoke all on function public.call_status_rank(text) from public, anon;
grant execute on function public.call_status_rank(text) to authenticated, service_role;

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
begin
  select id into v_channel_id from tenant_channels
   where kind = 'voice' and external_id = p_agent_id;

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
    public_log_url       = coalesce(excluded.public_log_url, calls.public_log_url),
    cost                 = coalesce(excluded.cost, calls.cost),
    latency              = coalesce(excluded.latency, calls.latency),
    contact_id           = coalesce(calls.contact_id, excluded.contact_id),
    conversation_id      = coalesce(calls.conversation_id, excluded.conversation_id),
    raw                  = excluded.raw
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

  -- Metered once, on the event that first carries a duration. Before this the
  -- usage row was inside `if v_is_new`, so a call whose first event was
  -- call_started (no duration yet) was never metered at all.
  if p_duration_ms is not null and p_duration_ms > 0
     and (not v_had_row or v_prev_duration is null) then
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

-- The sweep now also retries recording copies that did not finish inside the
-- webhook's time budget. Wake the edge for those too, but only while a retry
-- is still on the table: after three attempts the copy is marked failed and
-- stops counting, so a dead provider URL cannot wake the edge forever.
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
   where updated_at < now() - interval '5 minutes'
     and (status = 'ongoing'
          or (status in ('ended', 'error')
              and recording->>'fetch_state' = 'pending'
              and coalesce((recording->>'attempts')::int, 0) < 3));
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


-- ---------------------------------------------------------------------------
-- metrics_summary
-- 00027 lines 358-512 VERBATIM apart from the two predicates marked ADDED (00031).
-- ---------------------------------------------------------------------------

create or replace function public.metrics_summary(p_tenant_id uuid, p_days integer default 1)
returns jsonb
language plpgsql
stable
as $$
declare
  v_tz     text;
  v_name   text;
  v_status text;
  v_days   integer := greatest(coalesce(p_days, 1), 1);
  v_start  timestamptz;
  v_result jsonb;
begin
  select timezone, name, status into v_tz, v_name, v_status
    from tenants where id = p_tenant_id;
  if v_tz is null then
    return jsonb_build_object('error', 'unknown_tenant');
  end if;

  v_start := (date_trunc('day', now() at time zone v_tz) at time zone v_tz)
             - make_interval(days => v_days - 1);

  with
  -- everything the tenant has ever said or heard, minus the import's
  -- timestamp-less rows: they carry no true event time and can never be
  -- placed on a calendar day.
  real_msgs as (
    select * from messages
     where tenant_id = p_tenant_id
       and coalesce(meta->>'backfill', 'false') <> 'true'
  ),
  msgs as (select * from real_msgs where created_at >= v_start),
  -- an outbound message counts only once it has actually left
  out_sent as (select * from msgs where direction = 'outbound'
                 and status in ('sent', 'delivered', 'read')),
  replies as (
    select m.created_at as asked_at, m.conversation_id,
           (select min(o.created_at) from real_msgs o
             where o.conversation_id = m.conversation_id
               and o.direction = 'outbound'
               and o.sender = 'ai'
               and o.status in ('sent', 'delivered', 'read')
               and o.created_at > m.created_at) as ai_at,
           (select min(o.created_at) from real_msgs o
             where o.conversation_id = m.conversation_id
               and o.direction = 'outbound'
               and o.sender = 'human'
               and o.status in ('sent', 'delivered', 'read')
               and o.created_at > m.created_at) as human_at
      from msgs m
     where m.direction = 'inbound' and m.sender = 'customer'
  ),
  calls_win as (
    select * from calls where tenant_id = p_tenant_id and started_at >= v_start
       and status <> 'not_connected'   -- ADDED (00031): a dial that never connected is not a call
  ),
  fresh_contacts as (
    select c.id from contacts c
     where c.tenant_id = p_tenant_id
       -- ADDED (00026): an erased contact has no messages and no calls, so it
       -- scores 'infinity' below and would be counted as new in every window
       -- from now on. A deletion must never be reported as growth.
       and c.erased_at is null
       and not exists (select 1 from messages b
                        where b.contact_id = c.id
                          and coalesce(b.meta->>'backfill', 'false') = 'true')
       and least(
             coalesce((select min(m.channel_ts) from messages m where m.contact_id = c.id),
                      'infinity'::timestamptz),
             coalesce((select min(k.started_at) from calls k
                        where k.contact_id = c.id and k.status <> 'not_connected'),   -- ADDED (00031)
                      'infinity'::timestamptz)
           ) >= v_start
  ),
  -- live state: whose turn is it? the last thing said in the thread was theirs.
  awaiting as (
    select cv.id from conversations cv
     where cv.tenant_id = p_tenant_id
       and cv.state in ('open', 'needs_human')
       and (select r.sender from real_msgs r
             where r.conversation_id = cv.id
             order by r.created_at desc limit 1) = 'customer'
  )
  select jsonb_build_object(
    'workspace', jsonb_build_object(
      'name', v_name, 'timezone', v_tz, 'status', v_status),

    'channels', coalesce((
      select jsonb_agg(jsonb_build_object(
               'kind', tc.kind, 'status', tc.status, 'number', tc.number_e164)
             order by tc.kind)
        from tenant_channels tc where tc.tenant_id = p_tenant_id), '[]'::jsonb),

    'window', jsonb_build_object(
      'days', v_days,
      'since', v_start,
      'since_local', to_char(v_start at time zone v_tz, 'YYYY-MM-DD"T"HH24:MI:SS'),
      'now_local',   to_char(now()   at time zone v_tz, 'YYYY-MM-DD"T"HH24:MI:SS')),

    'now', jsonb_build_object(
      'escalations_open', (select count(*) from escalations
                            where tenant_id = p_tenant_id and state = 'open'),
      'oldest_open_escalation_at', (select min(created_at) from escalations
                                     where tenant_id = p_tenant_id and state = 'open'),
      'threads_needing_human', (select count(*) from conversations
                                 where tenant_id = p_tenant_id and state = 'needs_human'),
      'threads_snoozed', (select count(*) from conversations
                           where tenant_id = p_tenant_id and state = 'snoozed'),
      'threads_awaiting_reply', (select count(*) from awaiting),
      'last_inbound_at',  (select max(coalesce(channel_ts, created_at)) from real_msgs
                            where direction = 'inbound' and sender = 'customer'),
      'last_outbound_at', (select max(created_at) from real_msgs
                            where direction = 'outbound'
                              and status in ('sent', 'delivered', 'read'))),

    'period', jsonb_build_object(
      'messages_in',  (select count(*) from msgs where direction = 'inbound' and sender = 'customer'),
      'messages_out_ai',  (select count(*) from out_sent where sender = 'ai'),
      'messages_out_you', (select count(*) from out_sent where sender = 'human'),
      'conversations_active',
        (select count(distinct conversation_id) from msgs
          where direction = 'inbound' and sender = 'customer'),

      'answered_by_ai',  (select count(*) from replies where ai_at is not null),
      'answered_by_you', (select count(*) from replies where human_at is not null),
      'unanswered_in_window',
        (select count(*) from replies where ai_at is null and human_at is null),
      'median_reply_seconds_ai',
        (select round(percentile_cont(0.5) within group (
                  order by extract(epoch from (ai_at - asked_at))))
           from replies where ai_at is not null),

      'send_failures', (select count(*) from msgs
                         where direction = 'outbound' and status = 'failed'),

      'escalations_new', (select count(*) from escalations
                           where tenant_id = p_tenant_id and created_at >= v_start),
      'escalation_reasons',
        coalesce((select jsonb_object_agg(reason, n) from (
          select reason, count(*) as n from escalations
           where tenant_id = p_tenant_id and state = 'open'
           group by reason) r), '{}'::jsonb),

      'calls',        (select count(*) from calls_win),
      'call_seconds', (select coalesce(round(sum(duration_ms) / 1000.0), 0) from calls_win),
      'call_sentiments',
        coalesce((select jsonb_object_agg(coalesce(sentiment, 'Unknown'), n) from (
          select sentiment, count(*) as n from calls_win group by sentiment) s), '{}'::jsonb),
      'calls_voicemail', (select count(*) from calls_win where in_voicemail),

      'new_contacts', (select count(*) from fresh_contacts))
  ) into v_result;

  return v_result;
end $$;

grant execute on function public.metrics_summary(uuid, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- people_list
-- 00028 lines 17-160 VERBATIM apart from the predicate marked ADDED (00031).
-- ---------------------------------------------------------------------------

create or replace function public.people_list(p_tenant_id uuid, p_contact_id uuid default null)
returns table (
  id                      uuid,
  display_name            text,
  wa_profile_name         text,
  phone_e164              text,
  consent                 text,
  consent_source          text,
  consent_updated_at      timestamptz,
  dnc                     boolean,
  channels                text[],
  conversation_count      integer,
  escalation_count        integer,
  needs_human             boolean,
  open_escalation_reason  text,
  open_escalation_since   timestamptz,
  latest_conversation_id  uuid,
  latest_state            text,
  latest_paused_until     timestamptz,
  latest_assignee_user_id uuid,
  latest_snooze_until     timestamptz,
  latest_wa_inbound_at    timestamptz,
  last_message_at         timestamptz,
  last_message_direction  text,
  last_message_sender     text,
  last_inbound_text       text,
  last_inbound_at         timestamptz,
  last_call_at            timestamptz,
  call_count              integer,
  call_seconds            integer,
  first_contact_at        timestamptz,
  earliest_row_at         timestamptz,
  has_backfill            boolean,
  has_chat                boolean,
  queued_reply_at         timestamptz
)
language sql
stable
set search_path = public
as $$
  with ev as (
    select m.contact_id, m.direction, m.sender, m.type, m.body, m.status, m.created_at,
           case when coalesce(m.meta->>'backfill', 'false') = 'true'
                then m.channel_ts
                else coalesce(m.channel_ts, m.created_at) end as at,
           coalesce(m.meta->>'backfill', 'false') = 'true' as backfill,
           -- Something the customer actually saw or said. A reply still in its
           -- cancel window, a canceled or failed send, an internal note and a
           -- call's own summary row are not "the last word" in the thread.
           m.type in ('text', 'template', 'media')
             and m.status not in ('queued', 'canceled', 'failed') as spoken
      from messages m
     where m.tenant_id = p_tenant_id
       and m.contact_id is not null
  )
  select
    c.id, c.display_name, c.wa_profile_name, c.phone_e164,
    c.consent, c.consent_source, c.consent_updated_at, c.dnc,
    coalesce(ids.channels, '{}'::text[]),
    coalesce(cvs.n, 0),
    coalesce(esc.n, 0),
    coalesce(cvs.needs_human, false),
    oe.reason,
    oe.created_at,
    lc.id, lc.state, lc.paused_until, lc.assignee_user_id, lc.snooze_until, lc.last_wa_inbound_at,
    lm.at, lm.direction, lm.sender,
    li.body, li.at,
    lk.last_at,
    coalesce(lk.n, 0),
    coalesce(lk.seconds, 0),
    least(ma.first_at, lk.first_at),
    least(ma.first_row_at, lk.first_row_at),
    coalesce(ma.has_backfill, false),
    coalesce(ma.has_chat, false),
    ma.queued_at
  from contacts c
  left join lateral (
    select array_agg(distinct ci.channel order by ci.channel) as channels
      from contact_identities ci where ci.contact_id = c.id
  ) ids on true
  left join lateral (
    select count(*)::int as n, bool_or(cv.state = 'needs_human') as needs_human
      from conversations cv where cv.contact_id = c.id
  ) cvs on true
  left join lateral (
    select count(*)::int as n
      from escalations e join conversations cv on cv.id = e.conversation_id
     where cv.contact_id = c.id
  ) esc on true
  left join lateral (
    select e.reason, e.created_at
      from escalations e join conversations cv on cv.id = e.conversation_id
     where cv.contact_id = c.id and e.state = 'open'
     order by e.created_at desc
     limit 1
  ) oe on true
  left join lateral (
    select cv.id, cv.state, cv.paused_until, cv.assignee_user_id, cv.snooze_until, cv.last_wa_inbound_at
      from conversations cv
     where cv.contact_id = c.id
     order by cv.last_message_at desc nulls last, cv.created_at desc
     limit 1
  ) lc on true
  left join lateral (
    select e.at, e.direction, e.sender
      from ev e
     where e.contact_id = c.id and e.at is not null and e.spoken
     order by e.at desc
     limit 1
  ) lm on true
  left join lateral (
    select e.at, e.body
      from ev e
     where e.contact_id = c.id and e.at is not null
       and e.direction = 'inbound' and e.spoken and e.body is not null
     order by e.at desc
     limit 1
  ) li on true
  left join lateral (
    select min(e.at) filter (where e.spoken) as first_at,
           min(e.created_at) as first_row_at,
           bool_or(e.backfill) as has_backfill,
           bool_or(e.type in ('text', 'template', 'media')) as has_chat,
           max(e.created_at) filter (where e.direction = 'outbound' and e.status = 'queued') as queued_at
      from ev e where e.contact_id = c.id
  ) ma on true
  left join lateral (
    select count(*)::int as n,
           (coalesce(sum(k.duration_ms), 0) / 1000)::int as seconds,
           max(k.started_at) as last_at,
           min(k.started_at) as first_at,
           min(k.created_at) as first_row_at
      from calls k where k.contact_id = c.id
       and k.status <> 'not_connected'   -- ADDED (00031): never connected, never phoned
  ) lk on true
  where c.tenant_id = p_tenant_id
    and c.erased_at is null
    and c.merged_into_contact_id is null
    and (p_contact_id is null or c.id = p_contact_id)
  order by greatest(lm.at, lk.last_at) desc nulls last, c.created_at desc
  limit 1000
$$;

revoke all on function public.people_list(uuid, uuid) from public, anon;
grant execute on function public.people_list(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- report_series
-- 00030 lines 15-162 VERBATIM apart from the two predicates marked ADDED (00031).
-- ---------------------------------------------------------------------------

create or replace function public.report_series(p_tenant_id uuid, p_days integer default 30)
returns jsonb
language plpgsql
stable
set search_path = public
as $$
declare
  v_tz     text;
  v_days   integer := least(greatest(coalesce(p_days, 30), 1), 90);
  v_span   integer;
  v_today  date;
  v_start  timestamptz;
  v_result jsonb;
begin
  select timezone into v_tz from tenants where id = p_tenant_id;
  if v_tz is null then
    return jsonb_build_object('error', 'unknown_tenant');
  end if;

  v_span  := v_days * 2;
  v_today := (now() at time zone v_tz)::date;
  v_start := ((v_today - (v_span - 1))::timestamp) at time zone v_tz;

  with days as (
    select (v_today - (v_span - 1) + g)::date as day
      from generate_series(0, v_span - 1) g
  ),
  real_msgs as (
    select * from messages
     where tenant_id = p_tenant_id
       and coalesce(meta->>'backfill', 'false') <> 'true'
  ),
  msgs as (
    select m.*, (m.created_at at time zone v_tz)::date as day
      from real_msgs m
     where m.created_at >= v_start
  ),
  inbound as (select * from msgs where direction = 'inbound' and sender = 'customer'),
  out_sent as (
    select * from msgs
     where direction = 'outbound' and status in ('sent', 'delivered', 'read')
  ),
  replies as (
    select m.day, m.created_at as asked_at,
           (select min(o.created_at) from real_msgs o
             where o.conversation_id = m.conversation_id
               and o.direction = 'outbound' and o.sender = 'ai'
               and o.status in ('sent', 'delivered', 'read')
               and o.created_at > m.created_at) as ai_at,
           (select min(o.created_at) from real_msgs o
             where o.conversation_id = m.conversation_id
               and o.direction = 'outbound' and o.sender = 'human'
               and o.status in ('sent', 'delivered', 'read')
               and o.created_at > m.created_at) as human_at
      from inbound m
  ),
  answered as (
    select day, asked_at,
           case when ai_at is not null and (human_at is null or ai_at <= human_at) then 'ai'
                when human_at is not null then 'you'
                else 'none' end as who,
           case when ai_at is not null then extract(epoch from (ai_at - asked_at)) end as ai_seconds
      from replies
  ),
  calls_w as (
    select k.*, (k.started_at at time zone v_tz)::date as day
      from calls k
     where k.tenant_id = p_tenant_id and k.started_at >= v_start
       and k.status <> 'not_connected'   -- ADDED (00031)
  ),
  escs as (
    select e.*, (e.created_at at time zone v_tz)::date as day
      from escalations e
     where e.tenant_id = p_tenant_id and e.created_at >= v_start
  ),
  firsts as (
    select c.id,
           least(
             coalesce((select min(m.channel_ts) from messages m
                        where m.contact_id = c.id
                          and coalesce(m.meta->>'backfill', 'false') <> 'true'),
                      'infinity'::timestamptz),
             coalesce((select min(k.started_at) from calls k
                        where k.contact_id = c.id and k.status <> 'not_connected'),   -- ADDED (00031)
                      'infinity'::timestamptz)
           ) as first_at
      from contacts c
     where c.tenant_id = p_tenant_id
       and not exists (select 1 from messages b
                        where b.contact_id = c.id
                          and coalesce(b.meta->>'backfill', 'false') = 'true')
  ),
  fresh as (
    select (first_at at time zone v_tz)::date as day
      from firsts
     where first_at >= v_start and first_at < 'infinity'::timestamptz
  ),
  per_day as (
    select d.day,
           (select count(*) from inbound i where i.day = d.day)                              as messages_in,
           (select count(distinct i.conversation_id) from inbound i where i.day = d.day)     as conversations,
           (select count(*) from answered a where a.day = d.day and a.who = 'ai')            as answered_ai,
           (select count(*) from answered a where a.day = d.day and a.who = 'you')           as answered_you,
           (select count(*) from answered a where a.day = d.day and a.who = 'none')          as unanswered,
           (select count(*) from out_sent o where o.day = d.day and o.sender = 'ai')         as out_ai,
           (select count(*) from out_sent o where o.day = d.day and o.sender = 'human')      as out_you,
           (select count(*) from escs e where e.day = d.day)                                 as escalations,
           (select count(*) from calls_w k where k.day = d.day)                              as calls,
           (select coalesce(round(sum(k.duration_ms) / 1000.0), 0) from calls_w k
             where k.day = d.day)                                                             as call_seconds,
           (select count(*) from fresh f where f.day = d.day)                                as new_contacts
      from days d
  )
  select jsonb_build_object(
    'timezone', v_tz,
    'days', v_days,
    'span_days', v_span,
    'today', to_char(v_today, 'YYYY-MM-DD'),
    'series', (select jsonb_agg(jsonb_build_object(
                 'day', to_char(p.day, 'YYYY-MM-DD'),
                 'messages_in', p.messages_in,
                 'conversations', p.conversations,
                 'answered_ai', p.answered_ai,
                 'answered_you', p.answered_you,
                 'unanswered', p.unanswered,
                 'out_ai', p.out_ai,
                 'out_you', p.out_you,
                 'escalations', p.escalations,
                 'calls', p.calls,
                 'call_seconds', p.call_seconds,
                 'new_contacts', p.new_contacts) order by p.day)
                from per_day p),
    'reasons', coalesce((select jsonb_object_agg(reason, n) from (
                 select reason, count(*) as n from escs
                  where day > v_today - v_days
                  group by reason) r), '{}'::jsonb),
    'reply_seconds', coalesce((select jsonb_agg(round(ai_seconds)) from answered
                                where day > v_today - v_days and ai_seconds is not null), '[]'::jsonb),
    'sentiments', coalesce((select jsonb_object_agg(coalesce(sentiment, 'Unknown'), n) from (
                    select sentiment, count(*) as n from calls_w
                     where day > v_today - v_days
                     group by sentiment) s), '{}'::jsonb),
    'voicemail', (select count(*) from calls_w where day > v_today - v_days and in_voicemail)
  ) into v_result;

  return v_result;
end $$;

revoke all on function public.report_series(uuid, integer) from public, anon;
grant execute on function public.report_series(uuid, integer) to authenticated;

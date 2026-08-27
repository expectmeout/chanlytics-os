-- Slice 1 hardening (three-reviewer pass, 2026-08-27):
-- C1  ingest_inbound: replay/out-of-order safety — message dedupe short-circuits
--     BEFORE any conversation side effect; recency + wa-window monotone via
--     greatest(); metering can never double-fire on replays.
-- I1  advisory xact lock per (tenant, channel, identity) closes the NULL-phone
--     concurrent-first-message orphan race (Instagram/email later).
-- I2  events partitions get RLS enabled (parent's `enable` does not propagate);
--     backfills the pre-created partitions.
-- I3  messages_guard: failed/canceled become terminal states.
-- +   mark_processed(): one-call jsonb merge (replaces a 2-RT read-modify-write).
-- +   conversations_tenant_recent index (serves the dashboard list sort).
-- +   contact profile-name no longer dropped on the upsert race path.

-- ---------------------------------------------------------------- indexes
create index if not exists conversations_tenant_recent
  on public.conversations (tenant_id, last_message_at desc nulls last);

-- ------------------------------------------------------------ mark_processed
create or replace function public.mark_processed(p_tenant_id uuid, p_message_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update messages
     set meta = meta || jsonb_build_object('processed_at', now())
   where id = p_message_id and tenant_id = p_tenant_id;
$$;
revoke execute on function public.mark_processed(uuid, uuid) from public, anon, authenticated;

-- ------------------------------------------------- messages_guard: terminal
create or replace function public.messages_guard() returns trigger
language plpgsql as $$
declare
  old_rank int;
  new_rank int;
begin
  if NEW.conversation_id is distinct from OLD.conversation_id
     or NEW.tenant_id   is distinct from OLD.tenant_id
     or NEW.channel     is distinct from OLD.channel
     or NEW.direction   is distinct from OLD.direction
     or NEW.sender      is distinct from OLD.sender
     or NEW.type        is distinct from OLD.type
     or NEW.body        is distinct from OLD.body
     or NEW.template_name is distinct from OLD.template_name
     or NEW.channel_ts  is distinct from OLD.channel_ts
     or NEW.created_at  is distinct from OLD.created_at
     or (OLD.external_id is not null and NEW.external_id is distinct from OLD.external_id)
  then
    raise exception 'messages content columns are immutable (P3)';
  end if;
  if OLD.status in ('failed','canceled') and NEW.status is distinct from OLD.status then
    raise exception 'messages.status is terminal (% -> % rejected)', OLD.status, NEW.status;
  end if;
  old_rank := case OLD.status when 'received' then 0 when 'queued' then 1 when 'sent' then 2
                              when 'delivered' then 3 when 'read' then 4 else 9 end;
  new_rank := case NEW.status when 'received' then 0 when 'queued' then 1 when 'sent' then 2
                              when 'delivered' then 3 when 'read' then 4 else 9 end;
  if new_rank < old_rank then
    raise exception 'messages.status is monotone (% -> % rejected)', OLD.status, NEW.status;
  end if;
  if NEW.status is distinct from OLD.status then
    NEW.status_updated_at := now();
  end if;
  return NEW;
end $$;

-- ------------------------------------------ events partitions: RLS enabled
create or replace function public.ensure_events_partition(p_month date) returns void
language plpgsql as $$
declare
  v_start date := date_trunc('month', p_month)::date;
  v_end   date := (date_trunc('month', p_month) + interval '1 month')::date;
  v_name  text := 'events_y' || to_char(v_start, 'YYYY') || 'm' || to_char(v_start, 'MM');
begin
  execute format(
    'create table if not exists public.%I partition of public.events for values from (%L) to (%L)',
    v_name, v_start, v_end
  );
  execute format('alter table public.%I enable row level security', v_name);
end $$;

do $$
declare r record;
begin
  for r in select c.relname from pg_class c
             join pg_inherits i on i.inhrelid = c.oid
            where i.inhparent = 'public.events'::regclass
  loop
    execute format('alter table public.%I enable row level security', r.relname);
  end loop;
end $$;

-- ------------------------------------------------- ingest_inbound (v2)
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
  -- window/metering side effect
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

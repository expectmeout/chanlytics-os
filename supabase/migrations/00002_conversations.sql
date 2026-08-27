-- Slice 1 / migration 0002 — Conversations end-to-end substrate:
-- tenant_channels (webhook routing), contacts + contact_identities,
-- conversations, messages (append-only content, monotone delivery status),
-- events (partitioned monthly), jobs, the ingest_inbound RPC (the concurrency
-- gate), media storage bucket, RLS, indexes, and realtime publication entries.
-- Designs frozen in Blueprint v3.0 §3.

-- ------------------------------------------------------------ tenant_channels
create table public.tenant_channels (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenants (id) on delete cascade,
  kind            text not null check (kind in ('whatsapp','voice','sms','email','instagram')),
  external_id     text not null,          -- Meta phone_number_id / Retell agent_id — THE routing key
  number_e164     text,
  waba_id         text,
  credentials_ref text,                   -- Vault secret UUID later; tenant #1 stays on env vars
  status          text not null default 'active' check (status in ('active','disabled')),
  config          jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (kind, external_id)
);
create trigger tenant_channels_set_updated_at
  before update on public.tenant_channels
  for each row execute function extensions.moddatetime('updated_at');

-- ------------------------------------------------------------------ contacts
create table public.contacts (
  id                     uuid primary key default gen_random_uuid(),
  tenant_id              uuid not null references public.tenants (id) on delete cascade,
  phone_e164             text,
  display_name           text,
  wa_profile_name        text,
  consent                text not null default 'unknown' check (consent in ('unknown','opted_in','opted_out')),
  consent_source         text,
  consent_updated_at     timestamptz,
  dnc                    boolean not null default false,
  merged_into_contact_id uuid references public.contacts (id),
  first_seen_at          timestamptz not null default now(),
  last_seen_at           timestamptz not null default now(),
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);
create unique index contacts_tenant_phone_uq
  on public.contacts (tenant_id, phone_e164) where phone_e164 is not null;
create index contacts_tenant_last_seen on public.contacts (tenant_id, last_seen_at desc);
create trigger contacts_set_updated_at
  before update on public.contacts
  for each row execute function extensions.moddatetime('updated_at');

-- --------------------------------------------------------- contact_identities
create table public.contact_identities (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants (id) on delete cascade,
  contact_id  uuid not null references public.contacts (id) on delete cascade,
  channel     text not null check (channel in ('whatsapp','voice','sms','email','instagram')),
  external_id text not null,              -- provider id verbatim (wa_id, IGSID, ...)
  raw         jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  unique (tenant_id, channel, external_id)
);

-- ------------------------------------------------------------- conversations
create table public.conversations (
  id                 uuid primary key default gen_random_uuid(),
  tenant_id          uuid not null references public.tenants (id) on delete cascade,
  contact_id         uuid not null references public.contacts (id) on delete cascade,
  state              text not null default 'open' check (state in ('open','needs_human','snoozed','archived')),
  paused_until       timestamptz,
  snooze_until       timestamptz,
  assignee_user_id   uuid references auth.users (id),
  last_message_at    timestamptz,
  last_inbound_at    timestamptz,        -- UI recency (any channel)
  last_wa_inbound_at timestamptz,        -- THE 24h template-window source (WhatsApp customer-inbound only)
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (tenant_id, contact_id)
);
create index conversations_tenant_state_recent
  on public.conversations (tenant_id, state, last_message_at desc);
create trigger conversations_set_updated_at
  before update on public.conversations
  for each row execute function extensions.moddatetime('updated_at');

-- ------------------------------------------------------------------ messages
create table public.messages (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references public.tenants (id) on delete cascade,
  conversation_id   uuid not null references public.conversations (id) on delete cascade,
  contact_id        uuid references public.contacts (id),
  channel           text not null check (channel in ('whatsapp','voice','sms','email','system')),
  direction         text not null check (direction in ('inbound','outbound')),
  sender            text not null check (sender in ('customer','ai','human','system')),
  sent_by           uuid references auth.users (id),
  type              text not null default 'text' check (type in ('text','template','media','call_summary','note')),
  body              text,
  template_name     text,
  template_vars     jsonb,
  media             jsonb,               -- {provider_media_id, mime_type, caption, filename, sha256, storage_path, fetch_state}
  external_id       text,                -- wamid — the idempotency key
  channel_ts        timestamptz,         -- the provider's own timestamp
  content_hash      text,
  status            text not null default 'received' check (status in ('received','queued','sent','delivered','read','failed','canceled')),
  error             jsonb,
  status_updated_at timestamptz,
  meta              jsonb not null default '{}'::jsonb,
  created_at        timestamptz not null default now()
);
create unique index messages_tenant_external_uq
  on public.messages (tenant_id, external_id) where external_id is not null;
create index messages_conversation_created on public.messages (conversation_id, created_at);

-- P3 (amended): content/identity columns immutable; delivery status monotone.
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
create trigger messages_guard before update on public.messages
  for each row execute function public.messages_guard();

-- -------------------------------------------------------------------- events
create table public.events (
  id           uuid not null default gen_random_uuid(),
  tenant_id    uuid not null,
  kind         text not null,
  category     text not null default 'system',
  subject_type text,
  subject_id   uuid,
  data         jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now(),
  primary key (id, created_at)
) partition by range (created_at);
create index events_tenant_kind_created on public.events (tenant_id, kind, created_at);
create index events_tenant_subject on public.events (tenant_id, subject_type, subject_id, created_at);

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
end $$;

do $$
declare m int;
begin
  for m in 0..13 loop
    perform public.ensure_events_partition((date_trunc('month', now()) + make_interval(months => m))::date);
  end loop;
end $$;

-- Recurring pre-creation (pg_cron): on the 25th, ensure the partition two months out.
create extension if not exists pg_cron;
select cron.schedule(
  'events-partition-precreate',
  '0 12 25 * *',
  $$select public.ensure_events_partition((date_trunc('month', now()) + interval '2 months')::date)$$
);

-- ---------------------------------------------------------------------- jobs
create table public.jobs (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenants (id) on delete cascade,
  kind         text not null check (kind in ('outbound_send','veto_fire','snooze_wake','pause_expire','media_fetch','rollup_daily','deadman','report_weekly','broadcast_send')),
  due_at       timestamptz not null,
  payload      jsonb not null default '{}'::jsonb,
  state        text not null default 'scheduled' check (state in ('scheduled','fired','canceled','failed')),
  cancel_token uuid not null default gen_random_uuid(),
  qstash_id    text,
  attempts     int not null default 0,
  fired_at     timestamptz,
  last_error   text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index jobs_due_scheduled on public.jobs (due_at) where state = 'scheduled';
create unique index jobs_qstash_uq on public.jobs (qstash_id) where qstash_id is not null;
create trigger jobs_set_updated_at
  before update on public.jobs
  for each row execute function extensions.moddatetime('updated_at');

-- ---------------------------------------------------------------- RLS (§8)
alter table public.tenant_channels    enable row level security;
alter table public.contacts           enable row level security;
alter table public.contact_identities enable row level security;
alter table public.conversations      enable row level security;
alter table public.messages           enable row level security;
alter table public.events             enable row level security;
alter table public.jobs               enable row level security;

create policy tenant_channels_member_select on public.tenant_channels
  for select to authenticated
  using (tenant_id in (select m.tenant_id from public.memberships m where m.user_id = (select auth.uid())));
create policy contacts_member_select on public.contacts
  for select to authenticated
  using (tenant_id in (select m.tenant_id from public.memberships m where m.user_id = (select auth.uid())));
create policy contact_identities_member_select on public.contact_identities
  for select to authenticated
  using (tenant_id in (select m.tenant_id from public.memberships m where m.user_id = (select auth.uid())));
create policy conversations_member_select on public.conversations
  for select to authenticated
  using (tenant_id in (select m.tenant_id from public.memberships m where m.user_id = (select auth.uid())));
create policy messages_member_select on public.messages
  for select to authenticated
  using (tenant_id in (select m.tenant_id from public.memberships m where m.user_id = (select auth.uid())));
create policy events_member_select on public.events
  for select to authenticated
  using (tenant_id in (select m.tenant_id from public.memberships m where m.user_id = (select auth.uid())));
-- jobs: no authenticated policies — service-role only.

-- --------------------------------------------------------- realtime (§5)
-- events stays out of the publication for now (partitioned-table publication
-- semantics); its realtime consumers arrive with the integrations pane.
alter publication supabase_realtime add table public.conversations, public.messages;

-- ------------------------------------------------------------- media bucket
insert into storage.buckets (id, name, public)
values ('media', 'media', false)
on conflict (id) do nothing;
-- No storage RLS policies: service-role only until the dashboard serves media.

-- ------------------------------------------------- ingest_inbound (the gate)
-- One atomic call per inbound customer message: contact + identity upsert,
-- conversation upsert, idempotent message insert, window/consent maintenance,
-- metering. Retries (Meta redelivery) collapse on the unique message index.
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
      do update set last_seen_at = now()
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

  insert into conversations (tenant_id, contact_id, last_message_at, last_inbound_at)
  values (p_tenant_id, v_contact_id, v_ts, v_ts)
  on conflict (tenant_id, contact_id)
    do update set last_message_at = excluded.last_message_at,
                  last_inbound_at = excluded.last_inbound_at
  returning id, state, paused_until, last_wa_inbound_at
    into v_conversation_id, v_state, v_paused, v_prev_wa;

  if p_channel = 'whatsapp' then
    -- Meta bills per service conversation; a >24h gap opens a new one (metering).
    if v_prev_wa is null or v_prev_wa < now() - interval '24 hours' then
      insert into events (tenant_id, kind, category, subject_type, subject_id, data)
      values (p_tenant_id, 'usage.wa_conversation', 'usage', 'conversation', v_conversation_id, '{}'::jsonb);
    end if;
    update conversations set last_wa_inbound_at = v_ts where id = v_conversation_id;
  end if;

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

-- ---------------------------------------------------------------------- seeds
-- Melany's live WhatsApp channel (Cloud API test number until coexistence).
insert into public.tenant_channels (tenant_id, kind, external_id, number_e164, waba_id)
select id, 'whatsapp', '695811553614583', '+19177724072', '23902068299460281'
  from public.tenants where slug = 'melanys-beauty-salon'
on conflict (kind, external_id) do nothing;

-- Synthetic smoke-test tenant: golden ingest probes route here, never into a
-- real tenant's data. No memberships -> invisible to every dashboard user.
insert into public.tenants (slug, name, status)
values ('chanlytics-smoke-test', 'Chanlytics Smoke Test', 'test')
on conflict (slug) do nothing;

insert into public.tenant_channels (tenant_id, kind, external_id)
select id, 'whatsapp', 'TEST-PHONE-ID'
  from public.tenants where slug = 'chanlytics-smoke-test'
on conflict (kind, external_id) do nothing;

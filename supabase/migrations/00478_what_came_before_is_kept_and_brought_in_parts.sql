-- 00478 · What came before is kept, and a history is brought in parts (decision 0073, R13, R19 to R21).
--
--   history_import   A job kind: one part of a connection's history brought in (the mailbox's six months of mail from
--                    people, its contacts, a calendar read through the mailbox's grant, WhatsApp's contacts and chats
--                    asked of Meta), each part noting the imports ledger (import_ledger_note, 00477) and scheduling the
--                    next where there is more. Bulk: lane 2, after every reply and everyone waiting.
--   ingest_before    The door a message from before Chanlytics comes in by: an email the mailbox held, a chat WhatsApp
--                    synced with the app kept. The person is resolved as a client list's would be (asserted, never
--                    observed: someone who asked to be forgotten stays forgotten), the thread is made or found, and the
--                    message is kept once by its provider id, marked meta.backfill and handled. Nothing else moves: no
--                    thread reopens, no consent changes, no event says a message was received, nothing is metered, and
--                    no one is told (decision 0073, D15 and D16: shown, never counted as today's, never answered, never
--                    a yes).
--   calendar_grant_note  The calendar a connected mailbox reads, set on the workspace's settings as a section of its own
--                    (calendar_grant) when the mailbox connects with its calendar ticked, taken away when it goes.
--   calendars_due    The calendar sweep's page, now a link or a calendar read through a mailbox's grant (R20).
--
-- Re-runnable throughout.

set local lock_timeout = '3s';

alter table public.jobs drop constraint if exists jobs_kind_check;
alter table public.jobs add constraint jobs_kind_check
  check (kind in ('outbound_send', 'broadcast_send', 'line_provision', 'email_ingest', 'lead_round_start', 'lead_collect', 'lead_check', 'push_send', 'push_receipts', 'reply_read', 'event_deliver', 'booking_read', 'inbound_answer', 'history_import'));

alter table public.jobs alter column lane set expression as (
  case
    when kind = 'inbound_answer' then 0
    when kind in ('outbound_send', 'email_ingest', 'push_send')
         and coalesce(payload->>'purpose', '') <> 'outreach' then 0
    when kind in ('line_provision', 'reply_read', 'booking_read') then 1
    when kind in ('broadcast_send', 'outbound_send', 'lead_round_start', 'lead_collect', 'lead_check',
                  'push_receipts', 'history_import') then 2
    when kind = 'event_deliver' then
      case when payload->>'lane' ~ '^[0-2]$' then (payload->>'lane')::smallint else 2 end
  end
);
comment on column public.jobs.lane is
  'Which work a claim takes first (decision 0018): 0 a reply, 1 someone waiting who is not a customer (a line bought, a lead''s reply read, a booking notice read), 2 bulk (a history brought in, 00478, among it). Generated from kind and payload; an event_deliver runs in its subscription''s lane (payload.lane, 00334), a text''s answer in a reply''s (inbound_answer, 00347); null for a kind the case does not name, claimed last.';

create or replace function public.ingest_before(
  p_tenant_id            uuid,
  p_channel              text,
  p_external             text,
  p_phone                text,
  p_email                text,
  p_name                 text,
  p_message_external_id  text,
  p_direction            text,
  p_type                 text,
  p_body                 text,
  p_channel_ts           timestamptz,
  p_meta                 jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_person   jsonb;
  v_contact  uuid;
  v_conv     uuid;
  v_message  uuid;
  v_inbound  boolean := p_direction = 'inbound';
begin
  if p_tenant_id is null then
    raise exception 'Workspace not found.' using errcode = 'P0002';
  end if;
  if p_channel is null or p_channel not in ('email', 'whatsapp') then
    raise exception 'What came before comes by email or WhatsApp.' using errcode = '22023';
  end if;
  if p_direction is null or p_direction not in ('inbound', 'outbound') then
    raise exception 'A message came in or went out.' using errcode = '22023';
  end if;
  if nullif(btrim(coalesce(p_message_external_id, '')), '') is null or p_channel_ts is null then
    raise exception 'A message from before needs its provider id and its moment.' using errcode = '22023';
  end if;
  if p_meta is not null and jsonb_typeof(p_meta) <> 'object' then
    raise exception 'The meta is an object.' using errcode = '22023';
  end if;

  -- The one door a person passes (00413), as a client list's: asserted, so the erased stay erased (PE001, which the
  -- caller counts and moves past), the wire's identity kept, and a name ranked as an import's.
  begin
    v_person := public.resolve_person(
      p_tenant_id, p_channel, p_external, p_phone, p_email, p_name, 'asserted', 'import',
      jsonb_build_object('before', true), p_channel_ts);
  exception when sqlstate 'PE001' then
    return jsonb_build_object('erased', true);
  end;
  v_contact := (v_person->>'contact_id')::uuid;

  -- The thread, made or found. Its recency only ever moves forward, and what came before never reopens one a person
  -- archived or snoozed: it is history, not something waiting.
  insert into conversations (tenant_id, contact_id, last_message_at, last_inbound_at)
  values (p_tenant_id, v_contact, p_channel_ts, case when v_inbound then p_channel_ts end)
  on conflict (tenant_id, contact_id)
    do update set last_message_at = greatest(conversations.last_message_at, excluded.last_message_at),
                  last_inbound_at = case when v_inbound
                                         then greatest(conversations.last_inbound_at, excluded.last_inbound_at)
                                         else conversations.last_inbound_at end
  returning id into v_conv;

  -- Once by the provider's id (the replay gate every inbound door keeps): a part run again keeps nothing twice.
  insert into messages (tenant_id, conversation_id, contact_id, channel, direction, sender,
                        type, body, external_id, channel_ts, status, meta)
  values (p_tenant_id, v_conv, v_contact, p_channel, p_direction,
          case when v_inbound then 'customer' else 'human' end,
          coalesce(nullif(p_type, ''), 'text'), nullif(p_body, ''), p_message_external_id, p_channel_ts,
          case when v_inbound then 'received' else 'delivered' end,
          coalesce(p_meta, '{}'::jsonb) || jsonb_build_object('backfill', true, 'processed_at', now()))
  on conflict (tenant_id, external_id) where external_id is not null do nothing
  returning id into v_message;

  return jsonb_build_object(
    'message_id', v_message, 'conversation_id', v_conv, 'contact_id', v_contact,
    'is_new', v_message is not null, 'person', v_person->>'outcome');
end $$;

revoke all on function public.ingest_before(uuid, text, text, text, text, text, text, text, text, text, timestamptz, jsonb) from public, anon, authenticated;
grant execute on function public.ingest_before(uuid, text, text, text, text, text, text, text, text, text, timestamptz, jsonb) to service_role;

comment on function public.ingest_before(uuid, text, text, text, text, text, text, text, text, text, timestamptz, jsonb) is
  'A message from before Chanlytics (decision 0073, R19 and R21): an email the connected mailbox held, a chat WhatsApp synced with its app kept. The person is resolved as a client list''s (resolve_person, asserted, source import: the erased stay erased, answered {erased: true}); the thread is made or found, its recency moved only forward, never reopened; the message kept once by its provider id, inbound from the customer or outbound by a person, marked meta.backfill and handled (meta.processed_at). No consent changes, no event, no metering, nobody told: shown, never counted as today''s, never answered, never a yes. The service role''s alone. Answers {message_id (null when already kept), conversation_id, contact_id, is_new, person}.';

/* ------------------------------------------------- the calendar read through a mailbox's grant (R20) -- */

-- The calendar a connected mailbox's grant reads, kept on the workspace's settings as a section of its own
-- (calendar_grant: { mailbox_id, provider }), which a build from before it leaves out. Set when a mailbox connects with
-- its calendar ticked; taken away when that mailbox goes (p_on false, and only if the grant names it). The settings take
-- a new version as any change does (tenant_config_version_moves), so a member's save from before it is stale, never a
-- quiet overwrite.
create or replace function public.calendar_grant_note(
  p_tenant_id  uuid,
  p_mailbox_id uuid,
  p_provider   text,
  p_on         boolean,
  p_by         uuid default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_changed boolean;
begin
  if p_tenant_id is null or p_mailbox_id is null then
    raise exception 'A workspace and a mailbox are needed.' using errcode = '22023';
  end if;
  if p_on and (p_provider is null or p_provider not in ('google', 'microsoft')) then
    raise exception 'A calendar is read through Google or Microsoft.' using errcode = '22023';
  end if;
  if p_on then
    update public.tenant_config c
       set config = jsonb_set(coalesce(c.config, '{}'::jsonb), '{calendar_grant}',
                              jsonb_build_object('mailbox_id', p_mailbox_id, 'provider', p_provider))
     where c.tenant_id = p_tenant_id
       and c.config->'calendar_grant' is distinct from
           jsonb_build_object('mailbox_id', p_mailbox_id, 'provider', p_provider);
  else
    update public.tenant_config c
       set config = c.config - 'calendar_grant'
     where c.tenant_id = p_tenant_id
       and c.config->'calendar_grant'->>'mailbox_id' = p_mailbox_id::text;
  end if;
  v_changed := found;
  -- The settings moved: which field, and who connected or removed the mailbox (decision 0031, invariant 2).
  if v_changed then
    insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
    values (p_tenant_id, 'settings.changed', 'system', 'workspace', p_tenant_id,
            jsonb_build_object('fields', jsonb_build_array('calendar_grant'), 'by', coalesce(p_by::text, 'system'),
                               'version', null, 'via', 'mailbox'));
  end if;
  return v_changed;
end $$;

revoke all on function public.calendar_grant_note(uuid, uuid, text, boolean, uuid) from public, anon, authenticated;
grant execute on function public.calendar_grant_note(uuid, uuid, text, boolean, uuid) to service_role;

comment on function public.calendar_grant_note(uuid, uuid, text, boolean, uuid) is
  'The calendar read through a connected mailbox (decision 0073, R20): p_on sets config.calendar_grant to {mailbox_id, provider}; off takes it away where it names this mailbox. The settings take a new version, as any change does, and a change writes settings.changed {fields: [calendar_grant], by: p_by, via: mailbox} beside it. True when something changed. The service role''s alone: the edge, as a mailbox connects or is removed.';

-- The calendar sweep's page (00245, 00435): a workspace is due for a read of its link or of a calendar its mailbox reads.
create or replace function public.calendars_due(p_before timestamptz, p_limit int, p_tenant_id uuid default null)
returns table (tenant_id uuid, config jsonb, timezone text, due_total bigint, failed_since timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select c.tenant_id, c.config, z.tz, count(*) over (), c.calendar_failed_since
    from public.tenant_config c
    join public.tenants t on t.id = c.tenant_id
    cross join lateral (select public.safe_zone(coalesce(nullif(btrim(t.timezone), ''), 'America/New_York')) as tz) z
   where (nullif(btrim(c.config->'calendar'->>'ical_url'), '') is not null
          or nullif(btrim(c.config->'calendar_grant'->>'mailbox_id'), '') is not null)
     and (p_tenant_id is null or c.tenant_id = p_tenant_id)
     and (c.calendar_checked_at is null or c.calendar_checked_at < p_before)
   order by c.calendar_checked_at nulls first, c.tenant_id
   limit greatest(coalesce(p_limit, 0), 0)
$$;
revoke execute on function public.calendars_due(timestamptz, int, uuid) from public, anon, authenticated;
grant execute on function public.calendars_due(timestamptz, int, uuid) to service_role;
comment on function public.calendars_due(timestamptz, int, uuid) is
  'The workspaces with a calendar to read (a feed''s link, or a calendar read through a connected mailbox, 00478) never read or last read before p_before, never read first, then least recently read, each with its zone and since when its reads have failed (null while they work, 00435), with due_total the count of all that were due. The calendar sweep''s page (00245).';

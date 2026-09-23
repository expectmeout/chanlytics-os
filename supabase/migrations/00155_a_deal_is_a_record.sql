-- 00155 · A deal is a record.
--
-- docs/decisions/0004-deals-record.md. One row per engagement a person is
-- deciding on or has taken: a proposal out, a client, passed, ended. Written
-- by a person through deal_record (an Ask card commits through the same
-- route), never by the receptionist, which reads a deal as it reads the
-- calendar. A stage is an owner's assertion, not a fact about time, so there
-- is no guard trigger: every move is allowed, every move is an event, and the
-- row's version refuses a stale press (the leads' Undo rule, 00142). The
-- people read is recreated whole (00138's rule) to carry the newest open or
-- current deal.
--
-- Two statements take ACCESS EXCLUSIVE on tables a live workspace reads (the
-- CHECKs on decisions, the trigger on contacts), so the same lock guard as
-- 00140 and 00142.
set local lock_timeout = '3s';
do $$
begin
  raise notice 'lock_timeout for this migration: %', current_setting('lock_timeout');
  if current_setting('lock_timeout') <> '3s' then
    raise warning 'this file was applied outside a transaction, so SET LOCAL did nothing: run it inside begin/commit, or set lock_timeout yourself before it';
  end if;
end $$;

/* ------------------------------------------------------------- 1. the table -- */

create table if not exists public.deals (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references public.tenants (id) on delete cascade,
  contact_id     uuid not null references public.contacts (id) on delete cascade,
  lead_id        uuid references public.leads (id) on delete set null,
  -- The profile's service by name, as consult_first names one; null when the
  -- profile lists one service or none.
  service        text check (service is null or char_length(service) between 1 and 80),
  stage          text not null check (stage in ('proposed', 'won', 'lost', 'ended')),
  proposed_at    timestamptz not null default now(),
  decided_at     timestamptz,
  ended_at       timestamptz,
  amount_cents   integer check (amount_cents is null or amount_cents >= 0),
  per            text check (per is null or per in ('once', 'month', 'year')),
  currency       text not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  note           text check (note is null or char_length(note) between 1 and 200),
  -- The consent's shape: {"message_id": ...} for their own message, {"form": "..."} for one signed elsewhere.
  evidence       jsonb,
  -- Who wrote the stage. The product never writes 'receptionist': it does not decide.
  source         text not null default 'person' check (source in ('person', 'payment')),
  version        integer not null default 1,
  created_by     uuid references auth.users (id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
comment on table public.deals is
  'One engagement a person is deciding on or has taken (0004): proposed (a proposal out), won (a client), lost (passed), ended. Written by deal_record on a person''s word, an Ask card through the same route, or a payment webhook later (source); never by the receptionist. A stage is an assertion, so no guard: every move is an event and version refuses a stale press. One open engagement (proposed or won) per person per service.';

-- One open engagement per person per service.
create unique index if not exists deals_open_uq
  on public.deals (tenant_id, contact_id, coalesce(service, ''))
  where stage in ('proposed', 'won');
create index if not exists deals_tenant_stage on public.deals (tenant_id, stage);
create index if not exists deals_contact on public.deals (tenant_id, contact_id, created_at desc);

drop trigger if exists deals_set_updated_at on public.deals;
create trigger deals_set_updated_at before update on public.deals
  for each row execute function extensions.moddatetime('updated_at');

alter table public.deals enable row level security;
drop policy if exists deals_member_select on public.deals;
create policy deals_member_select on public.deals
  for select to authenticated
  using (tenant_id in (select m.tenant_id from public.memberships m where m.user_id = (select auth.uid())));
revoke all on public.deals from anon;
revoke insert, update, delete on public.deals from authenticated;

-- Realtime, added once: the People surface and the person's page re-read on a change.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'deals'
  ) then
    alter publication supabase_realtime add table public.deals;
  end if;
end $$;

/* --------------------------------------------------------------- 2. the door -- */

-- The one door. No id: a new engagement, which starts as a proposal. An id
-- and the version the page saw: a move, refused when anyone changed the row
-- since. Acting members only (is_acting_member, 00014). Each stage's event is
-- written here with its kind as a literal, so the kinds lint sees the emitter
-- (tooling/scripts/tests/event-kinds.test.mjs reads the first dotted literal
-- of each insert). The route records the decision (record_deal on subject
-- deal), as the consent route does.
create or replace function public.deal_record(
  p_contact_id   uuid,
  p_stage        text,
  p_deal_id      uuid default null,
  p_version      integer default null,
  p_service      text default null,
  p_when         timestamptz default null,
  p_amount_cents integer default null,
  p_per          text default null,
  p_note         text default null,
  p_evidence     jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user    uuid := auth.uid();
  v_tenant  uuid;
  v_row     public.deals%rowtype;
  v_from    text;
  v_service text := nullif(btrim(coalesce(p_service, '')), '');
  v_note    text := nullif(btrim(coalesce(p_note, '')), '');
  v_when    timestamptz := coalesce(p_when, now());
begin
  if v_user is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  if p_stage is null or p_stage not in ('proposed', 'won', 'lost', 'ended') then
    return jsonb_build_object('error', 'bad_stage');
  end if;
  if p_per is not null and p_per not in ('once', 'month', 'year') then
    return jsonb_build_object('error', 'bad_per');
  end if;
  if p_amount_cents is not null and p_amount_cents < 0 then
    return jsonb_build_object('error', 'bad_amount');
  end if;
  if v_note is not null and char_length(v_note) > 200 then
    return jsonb_build_object('error', 'note_too_long');
  end if;
  if v_service is not null and char_length(v_service) > 80 then
    return jsonb_build_object('error', 'service_too_long');
  end if;

  select c.tenant_id into v_tenant
    from contacts c
   where c.id = p_contact_id and c.erased_at is null and c.merged_into_contact_id is null;
  if v_tenant is null or not public.is_acting_member(v_tenant) then
    return jsonb_build_object('error', 'not_found');
  end if;

  if p_deal_id is null then
    -- A new engagement starts as a proposal, and only one may be open per service.
    if p_stage <> 'proposed' then
      return jsonb_build_object('error', 'bad_move');
    end if;
    if exists (
      select 1 from deals d
       where d.contact_id = p_contact_id and d.stage in ('proposed', 'won')
         and coalesce(d.service, '') = coalesce(v_service, '')
    ) then
      return jsonb_build_object('error', 'already_open');
    end if;
    insert into deals (tenant_id, contact_id, lead_id, service, stage, proposed_at, amount_cents, per, note, evidence, created_by)
    values (
      v_tenant, p_contact_id,
      (select l.id from leads l where l.contact_id = p_contact_id and l.erased_at is null
        order by l.converted_at desc nulls last limit 1),
      v_service, 'proposed', v_when, p_amount_cents, p_per, v_note, p_evidence, v_user
    )
    returning * into v_row;
    insert into events (tenant_id, kind, category, subject_type, subject_id, data)
    values (v_tenant, 'deal.proposed', 'deal', 'deal', v_row.id,
            jsonb_build_object('deal_id', v_row.id, 'contact_id', p_contact_id, 'stage', 'proposed',
                               'from', null, 'service', v_row.service, 'by', v_user));
    return jsonb_build_object('deal', to_jsonb(v_row), 'from', null);
  end if;

  select * into v_row from deals d
   where d.id = p_deal_id and d.tenant_id = v_tenant and d.contact_id = p_contact_id
   for update;
  if v_row.id is null then
    return jsonb_build_object('error', 'not_found');
  end if;
  if p_version is not null and p_version <> v_row.version then
    return jsonb_build_object('error', 'moved', 'version', v_row.version);
  end if;
  if v_row.stage = 'ended' and p_stage <> 'ended' then
    -- An ended engagement is re-signed as a new row, so tenure and amounts keep their history.
    return jsonb_build_object('error', 'ended');
  end if;
  if p_stage in ('proposed', 'won') and v_row.stage = 'lost' and exists (
    select 1 from deals d
     where d.contact_id = p_contact_id and d.id <> v_row.id and d.stage in ('proposed', 'won')
       and coalesce(d.service, '') = coalesce(v_row.service, '')
  ) then
    return jsonb_build_object('error', 'already_open');
  end if;

  v_from := v_row.stage;
  update deals d
     set stage        = p_stage,
         proposed_at  = case when p_stage = 'proposed' and v_from = 'lost' then v_when else d.proposed_at end,
         decided_at   = case when p_stage in ('won', 'lost') and v_from <> p_stage then v_when
                             when p_stage = 'proposed' then null
                             else d.decided_at end,
         ended_at     = case when p_stage = 'ended' and v_from <> 'ended' then v_when else d.ended_at end,
         amount_cents = coalesce(p_amount_cents, d.amount_cents),
         per          = coalesce(p_per, d.per),
         note         = coalesce(v_note, d.note),
         evidence     = coalesce(p_evidence, d.evidence),
         version      = d.version + 1
   where d.id = v_row.id
  returning * into v_row;

  if v_from = p_stage then
    -- Refreshing a row's details is not a move: no event.
    return jsonb_build_object('deal', to_jsonb(v_row), 'from', v_from);
  end if;
  if p_stage = 'proposed' then
    insert into events (tenant_id, kind, category, subject_type, subject_id, data)
    values (v_tenant, 'deal.proposed', 'deal', 'deal', v_row.id,
            jsonb_build_object('deal_id', v_row.id, 'contact_id', p_contact_id, 'stage', 'proposed',
                               'from', v_from, 'service', v_row.service, 'by', v_user));
  elsif p_stage = 'won' then
    insert into events (tenant_id, kind, category, subject_type, subject_id, data)
    values (v_tenant, 'deal.won', 'deal', 'deal', v_row.id,
            jsonb_build_object('deal_id', v_row.id, 'contact_id', p_contact_id, 'stage', 'won',
                               'from', v_from, 'service', v_row.service, 'by', v_user));
  elsif p_stage = 'lost' then
    insert into events (tenant_id, kind, category, subject_type, subject_id, data)
    values (v_tenant, 'deal.lost', 'deal', 'deal', v_row.id,
            jsonb_build_object('deal_id', v_row.id, 'contact_id', p_contact_id, 'stage', 'lost',
                               'from', v_from, 'service', v_row.service, 'by', v_user));
  else
    insert into events (tenant_id, kind, category, subject_type, subject_id, data)
    values (v_tenant, 'deal.ended', 'deal', 'deal', v_row.id,
            jsonb_build_object('deal_id', v_row.id, 'contact_id', p_contact_id, 'stage', 'ended',
                               'from', v_from, 'service', v_row.service, 'by', v_user));
  end if;
  return jsonb_build_object('deal', to_jsonb(v_row), 'from', v_from);
end $$;

revoke execute on function public.deal_record(uuid, text, uuid, integer, text, timestamptz, integer, text, text, jsonb) from public, anon;
grant execute on function public.deal_record(uuid, text, uuid, integer, text, timestamptz, integer, text, text, jsonb) to authenticated;
comment on function public.deal_record(uuid, text, uuid, integer, text, timestamptz, integer, text, text, jsonb) is
  'Record a deal on a person''s word (0004). No id: a new engagement, which starts proposed; one open engagement per person per service. An id and the version the page saw: a move (any stage to any, except out of ended, which is re-signed as a new row); a stale version answers {error: moved}. Owner or operator. Writes the stage''s event; the route records the decision. Answers {deal, from} or {error}.';

/* ---------------------------------------------------- 3. an erasure keeps no words -- */

-- A person erased keeps no words: the note and the evidence go; the stage,
-- the dates and the amount are the business's own facts and stay, as a
-- lead's counts do (00140).
create or replace function public.deals_erase_on_contact()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if NEW.erased_at is not null and OLD.erased_at is null then
    update deals set note = null, evidence = null, version = version + 1 where contact_id = NEW.id;
  end if;
  return null;
end $$;
revoke execute on function public.deals_erase_on_contact() from public, anon, authenticated;
drop trigger if exists contacts_erase_blanks_deals on public.contacts;
create trigger contacts_erase_blanks_deals
  after update of erased_at on public.contacts
  for each row execute function public.deals_erase_on_contact();
comment on function public.deals_erase_on_contact() is
  'When a person is erased, their deals keep no words: the note and the evidence are blanked; stage, dates and amount stay (0004).';

/* ----------------------------------------------------------- 4. the ledger's words -- */

alter table public.decisions drop constraint if exists decisions_verb_check;
alter table public.decisions add constraint decisions_verb_check
  check (verb in (
    'approve', 'edit', 'decline', 'snooze', 'wake', 'take_over', 'hand_back',
    'resolve', 'archive', 'reply', 'cancel_send', 'pause_agent', 'resume_agent',
    'invite', 'revoke_invite', 'change_role', 'remove_member', 'erase', 'whisper',
    'connect_channel', 'consent_change', 'send_broadcast', 'cancel_broadcast',
    'start_playbook', 'pause_playbook', 'reply_review', 'export', 'end_call',
    'record_deal'
  ));

alter table public.decisions drop constraint if exists decisions_subject_type_check;
alter table public.decisions add constraint decisions_subject_type_check
  check (subject_type in (
    'conversation', 'escalation', 'draft', 'lead', 'message', 'agent',
    'membership', 'invitation', 'contact', 'call', 'channel', 'broadcast', 'playbook', 'review', 'workspace',
    'deal'
  ));

/* ------------------------------------------- 5. the people read carries the deal -- */

-- Recreated whole, as 00138 did: a returned column cannot be added in place,
-- the signature is the same so every caller keeps calling it, and the guard,
-- the grants and the comment are restated.
drop function if exists public.people_list(uuid, uuid, text, integer, integer);

create function public.people_list(p_tenant_id uuid, p_contact_id uuid default null, p_query text default null, p_limit integer default 1000, p_offset integer default 0)
returns table (
  id                      uuid,
  display_name            text,
  wa_profile_name         text,
  phone_e164              text,
  email                   text,
  consent                 text,
  consent_source          text,
  consent_updated_at      timestamptz,
  dnc                     boolean,
  marketing_consent            text,
  marketing_consent_source     text,
  marketing_consent_updated_at timestamptz,
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
  last_inbound_call_at    timestamptz,
  last_inbound_call_summary text,
  call_count              integer,
  call_seconds            integer,
  first_contact_at        timestamptz,
  earliest_row_at         timestamptz,
  has_backfill            boolean,
  has_chat                boolean,
  message_channels        text[],
  queued_reply_at         timestamptz,
  came_from               text,
  -- The newest open or current deal (proposed or won), else the newest of any (0004).
  deal_id                 uuid,
  deal_stage              text,
  deal_service            text,
  deal_proposed_at        timestamptz,
  deal_decided_at         timestamptz,
  deal_ended_at           timestamptz,
  deal_amount_cents       integer,
  deal_per                text
)
language sql
stable
set search_path = public
as $$
  with ev as (
    select m.contact_id, m.direction, m.sender, m.type, m.channel, m.body, m.status, m.created_at,
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
       and (p_contact_id is null or m.contact_id = p_contact_id)
  ),
  -- How they were added, when a door added them: the first contact.added event
  -- for each person, should a door ever write two.
  added as (
    select distinct on (e.subject_id)
           e.subject_id,
           coalesce(e.data->>'source', 'manual') as source
      from events e
     where e.tenant_id = p_tenant_id
       and e.kind = 'contact.added'
       and e.subject_type = 'contact'
       and (p_contact_id is null or e.subject_id = p_contact_id)
     order by e.subject_id, e.created_at
  )
  select
    c.id, c.display_name, c.wa_profile_name, c.phone_e164, c.email,
    c.consent, c.consent_source, c.consent_updated_at, c.dnc,
    c.marketing_consent, c.marketing_consent_source, c.marketing_consent_updated_at,
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
    lk.last_inbound_at,
    lks.summary,
    coalesce(lk.n, 0),
    coalesce(lk.seconds, 0),
    least(ma.first_at, lk.first_at),
    least(ma.first_row_at, lk.first_row_at),
    coalesce(ma.has_backfill, false),
    coalesce(ma.has_chat, false),
    coalesce(ma.channels, '{}'::text[]),
    ma.queued_at,
    -- Where they came from: how they were added, else how a history moved in
    -- began, else their first spoken event.
    case
      when ad.source = 'calendar' then 'calendar'
      when ad.source = 'lead' then 'lead'
      when ad.source is not null then 'manual'
      when coalesce(ma.has_backfill, false) then case when ma.backfill_first in ('call', 'whatsapp', 'sms', 'email') then ma.backfill_first else 'import' end
      when lk.first_at is not null and (ma.first_at is null or lk.first_at <= ma.first_at) then 'call'
      when ma.first_channel in ('whatsapp', 'sms', 'email') then ma.first_channel
    end,
    dl.id, dl.stage, dl.service, dl.proposed_at, dl.decided_at, dl.ended_at, dl.amount_cents, dl.per
  from contacts c
  left join added ad on ad.subject_id = c.id
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
           -- Which wires those words travelled: a person who only ever wrote by email has not used WhatsApp.
           array_agg(distinct e.channel order by e.channel) filter (where e.type in ('text', 'template', 'media')) as channels,
           max(e.created_at) filter (where e.direction = 'outbound' and e.status = 'queued') as queued_at,
           -- The wire of their first spoken message, for came_from.
           (array_agg(e.channel order by e.at, e.created_at) filter (where e.spoken and e.at is not null))[1] as first_channel,
           -- The first row of a history moved in, in the order it was written: a call's note is a call, anything else its wire.
           (array_agg(case when e.type = 'call_summary' then 'call' else e.channel end order by e.created_at)
              filter (where e.backfill))[1] as backfill_first
      from ev e where e.contact_id = c.id
  ) ma on true
  left join lateral (
    select count(*)::int as n,
           (coalesce(sum(k.duration_ms), 0) / 1000)::int as seconds,
           max(k.started_at) as last_at,
           -- The one that means they reached out.
           max(k.started_at) filter (where k.direction = 'inbound') as last_inbound_at,
           min(k.started_at) as first_at,
           min(k.created_at) as first_row_at
      from calls k where k.contact_id = c.id
       and k.status <> 'not_connected'
  ) lk on true
  left join lateral (
    -- What the call they placed was about: what the caller wanted, in the
    -- analysis's plain words, else the provider's summary. The attention
    -- strip reads it where a caller has written nothing.
    select coalesce(k.wanted, k.summary) as summary
      from calls k
     where k.contact_id = c.id
       and k.direction = 'inbound'
       and k.status <> 'not_connected'
       and coalesce(k.wanted, k.summary) is not null
     order by k.started_at desc
     limit 1
  ) lks on true
  left join lateral (
    -- The one deal the row shows: open or current first, then the newest.
    -- pickCurrentDeal in contracts orders a person's list the same way.
    select d.id, d.stage, d.service, d.proposed_at, d.decided_at, d.ended_at, d.amount_cents, d.per
      from deals d
     where d.contact_id = c.id
     order by (d.stage in ('proposed', 'won')) desc, d.created_at desc
     limit 1
  ) dl on true
  where c.tenant_id = p_tenant_id
    and c.erased_at is null
    and c.merged_into_contact_id is null
    and (p_contact_id is null or c.id = p_contact_id)
    -- The search: a name, their name on WhatsApp, their email address, or
    -- three digits of the number, the way the page's own box matches.
    -- Nothing else is indexed here; the page still narrows by state and
    -- list over what it holds.
    and (
      nullif(trim(p_query), '') is null
      or c.display_name ilike '%' || trim(p_query) || '%'
      or c.wa_profile_name ilike '%' || trim(p_query) || '%'
      or c.email ilike '%' || trim(p_query) || '%'
      or (length(regexp_replace(p_query, '\D', '', 'g')) >= 3
          and regexp_replace(coalesce(c.phone_e164, ''), '\D', '', 'g') like '%' || regexp_replace(p_query, '\D', '', 'g') || '%')
    )
  order by greatest(lm.at, lk.last_at) desc nulls last, c.created_at desc, c.id
  limit least(greatest(coalesce(p_limit, 1000), 1), 1000)
  offset greatest(coalesce(p_offset, 0), 0)
$$;

revoke execute on function public.people_list(uuid, uuid, text, integer, integer) from public, anon;
grant execute on function public.people_list(uuid, uuid, text, integer, integer) to authenticated, service_role;

comment on function public.people_list(uuid, uuid, text, integer, integer) is
  'Everyone this workspace has ever heard from, with both consent answers: `consent` for conversation and their own appointments, `marketing_consent` for offers. Two answers because the carriers require them collected separately (error 30913). `came_from` says where each first came from: the door that added them (calendar, lead, manual); else a history moved in from before the database says how it began, in the thread''s own order (a call''s note is call, anything else its wire; import only when it names none); else their first call (call) or the wire of their first message (whatsapp, sms, email); null when nothing says. p_query matches a name, a WhatsApp name, an email address or three digits of the number; p_limit (at most 1000) and p_offset page under one whole order: latest contact first, then the newest added, then the id. The deal_* columns carry the newest open or current deal, else the newest of any (0004).';

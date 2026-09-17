-- 00125 · A person may have an email.
--
-- A contact has been a phone number with a name on it: the unique index is on
-- the number (00002), the erasure digest is of the number (00124), and every
-- way a person arrives -- WhatsApp, a call, a text, an appointment -- brings
-- one. Email is the first channel that does not. Before anything receives or
-- sends an email (docs/plans/2026-09-17-email-channel.md, E1), a person has to
-- be able to HAVE an address: stored once, in one shape, unique in their
-- workspace, set through a door that records who set it, and gone when they
-- are erased.
--
-- The address lives on the contact, beside the number. contact_identities
-- allows an 'email' identity and nothing reads it for lookup, counts it in
-- People or clears it by address; a second home for one fact is how two homes
-- drift.
--
-- The CHECK holds the STORED shape only -- trimmed, lower-cased, one "@", a
-- dotted domain. What is and is not an address is decided once, in
-- packages/contracts/src/email-address.ts (normalizeEmail), and every writer
-- goes through it; the constraint is what stops a writer that did not.

alter table public.contacts
  add column if not exists email text,
  add column if not exists erased_email_hash text;

alter table public.contacts drop constraint if exists contacts_email_check;
alter table public.contacts add constraint contacts_email_check
  check (email is null or (
    email = lower(btrim(email))
    and char_length(email) between 3 and 254
    and email ~ '^[^[:space:]@<>]+@[^[:space:]@<>]+\.[^[:space:]@<>]+$'
  ));

comment on column public.contacts.email is
  'The person''s email address as normalizeEmail stores it: trimmed, lower-cased. One per workspace. A person may have this and no number.';
comment on column public.contacts.erased_email_hash is
  'sha256 hex of "<tenant_id>:<address>", written when an erasure begins and the address still exists, so mail arriving from it later does not bring the person back.';

-- Partial, like the number's (00002): most people have no address, and two
-- people without one are not a conflict.
create unique index if not exists contacts_tenant_email_uq
  on public.contacts (tenant_id, email) where email is not null;

create index if not exists contacts_erased_email_hash_idx
  on public.contacts (tenant_id, erased_email_hash)
  where erased_email_hash is not null;

-- An erased row holds no address.
--
-- A trigger rather than a change to erase_contact, the way 00101 clears the
-- answer about offers: whatever path erases a row, the address goes with it,
-- and the one function the right to be forgotten runs through is not recreated
-- to add a column. BEFORE, because the row being written is the thing to
-- change; 00101's is AFTER because it calls a function that updates the row.
create or replace function public.contact_email_on_erase()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.erased_at is not null and old.erased_at is null then
    new.email := null;
  end if;
  return new;
end $$;

drop trigger if exists contacts_erase_clears_email on public.contacts;
create trigger contacts_erase_clears_email
  before update of erased_at on public.contacts
  for each row execute function public.contact_email_on_erase();

-- The door. Owner or operator, like the name and the notes (00054). An empty
-- address clears it. The event says THAT an address was set or cleared and by
-- whom, never the address: events outlive an erasure (00027), so nothing that
-- identifies a person belongs in one.
create or replace function public.set_person_email(p_contact_id uuid, p_email text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user   uuid := auth.uid();
  v_tenant uuid;
  v_email  text := nullif(lower(btrim(coalesce(p_email, ''))), '');
begin
  if v_user is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  if v_email is not null and (
       char_length(v_email) not between 3 and 254
       or v_email !~ '^[^[:space:]@<>]+@[^[:space:]@<>]+\.[^[:space:]@<>]+$') then
    raise exception 'That is not an email address.' using errcode = '22023';
  end if;
  select c.tenant_id into v_tenant from contacts c where c.id = p_contact_id and c.erased_at is null;
  if v_tenant is null or not public.is_acting_member(v_tenant) then
    raise exception 'Person not found.' using errcode = 'P0002';
  end if;
  begin
    update contacts set email = v_email, updated_at = now() where id = p_contact_id;
  exception when unique_violation then
    raise exception 'Another person here already has that address.' using errcode = '23505';
  end;
  insert into events (tenant_id, kind, category, subject_type, subject_id, data)
  values (v_tenant, 'contact.email_set', 'contact', 'contact', p_contact_id,
          jsonb_build_object('set', v_email is not null, 'by', v_user));
  return jsonb_build_object('contact_id', p_contact_id, 'email', v_email);
end $$;

revoke execute on function public.set_person_email(uuid, text) from public, anon;
grant execute on function public.set_person_email(uuid, text) to authenticated;
comment on function public.set_person_email(uuid, text) is
  'Owner or operator sets a person''s email address; empty clears it. One address per person per workspace; the event records that it changed, never the address.';

-- People lists the address and its search matches it. The body is 00112's;
-- the column, the select and one search clause are the change. Dropped and
-- recreated because a returned column cannot be added in place; the guard and
-- the grants are restated.
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
       and (p_contact_id is null or m.contact_id = p_contact_id)
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
  order by greatest(lm.at, lk.last_at) desc nulls last, c.created_at desc
  limit least(greatest(coalesce(p_limit, 1000), 1), 1000)
  offset greatest(coalesce(p_offset, 0), 0)
$$;

revoke execute on function public.people_list(uuid, uuid, text, integer, integer) from public, anon;
grant execute on function public.people_list(uuid, uuid, text, integer, integer) to authenticated, service_role;

comment on function public.people_list(uuid, uuid, text, integer, integer) is
  'Everyone this workspace has ever heard from, with both consent answers: `consent` for conversation and their own appointments, `marketing_consent` for offers. Two answers because the carriers require them collected separately (error 30913). p_query matches a name, a WhatsApp name, an email address or three digits of the number; p_limit (at most 1000) and p_offset page under one order, latest contact first.';

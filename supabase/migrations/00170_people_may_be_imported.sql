-- 00170 · People may be imported.
--
-- A business's own client list arrives as a spreadsheet: a name, a number and an
-- address per line (Part 0 of docs/superpowers/specs/2026-09-24-campaigns-on-every-channel-design.md).
-- One door takes one line. It finds the person by number, then by address, fills
-- only what is empty (a name, an address, a number), never overwrites, makes nobody
-- who asked to be forgotten, and records no yes: an address on file is not consent.
-- Two numbers are two people, because the number is the stronger identity (00140):
-- an address finds its holder only when the line or the holder has no number, and a
-- line whose new number comes with another person's address is made without it (taken).
-- The forgotten are known by the digests 00124 and 00125 keep: sha256 of
-- "<tenant id>:<value>", in hex, the same bytes lead_suppression_hash() (00140) and
-- contracts' erasure.ts compute, handed in by the route. A line that names one is
-- refused with PE001, a code of its own: 42501 is also Postgres's "permission
-- denied", and a caller that skips a forgotten person's line must not skip every
-- line the day a grant is lost.
-- Re-runnable: create or replace for the door, the CHECK widened only when it lacks
-- the verb, people_list dropped and made again. The CHECK takes ACCESS EXCLUSIVE on
-- decisions, which every act writes to, so the same lock guard as 00166 and 00167.
set local lock_timeout = '3s';
do $$
begin
  raise notice 'lock_timeout for this migration: %', current_setting('lock_timeout');
  if current_setting('lock_timeout') <> '3s' then
    raise warning 'this file was applied outside a transaction, so SET LOCAL did nothing: run it inside begin/commit, or set lock_timeout yourself before it';
  end if;
end $$;

/* ------------------------------------------------------------------------- 1. the door -- */

create or replace function public.import_person(
  p_tenant_id    uuid,
  p_name         text,
  p_phone_e164   text,
  p_email        text,
  p_phone_digest text default null,
  p_email_digest text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user      uuid := auth.uid();
  v_name      text := left(nullif(btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g')), ''), 80);
  v_phone     text := nullif(btrim(coalesce(p_phone_e164, '')), '');
  v_email     text := nullif(lower(btrim(coalesce(p_email, ''))), '');
  v_new_email text;
  v_id        uuid;
  v_email_out text := null;   -- 'set' | 'kept' | 'taken' | null
begin
  if v_user is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  if p_tenant_id is null or not public.is_acting_member(p_tenant_id) then
    raise exception 'Workspace not found.' using errcode = 'P0002';
  end if;
  if v_phone is not null and v_phone !~ '^\+[1-9][0-9]{7,14}$' then
    raise exception 'A phone number in international form is needed.' using errcode = '22023';
  end if;
  if v_email is not null and (
       char_length(v_email) not between 3 and 254
       or v_email !~ '^[^[:space:]@<>]+@[^[:space:]@<>]+\.[^[:space:]@<>]+$') then
    raise exception 'That is not an email address.' using errcode = '22023';
  end if;
  if v_phone is null and v_email is null then
    raise exception 'A number or an address is needed.' using errcode = '22023';
  end if;
  -- The erased stay erased: a line that names one is left alone (00124, 00125).
  if (p_phone_digest is not null and exists (
        select 1 from contacts c where c.tenant_id = p_tenant_id and c.erased_phone_hash = p_phone_digest))
     or (p_email_digest is not null and exists (
        select 1 from contacts c where c.tenant_id = p_tenant_id and c.erased_email_hash = p_email_digest)) then
    raise exception 'That person asked to be forgotten.' using errcode = 'PE001';
  end if;

  -- Find, else make, in two attempts at most: a line that loses a race to make
  -- the same person (their number or their address written by another line
  -- between the look and the insert) looks again and fills the person who won,
  -- rather than dropping its name and its address.
  for v_try in 1..2 loop
    v_id := null;
    if v_phone is not null then
      select c.id into v_id from contacts c
       where c.tenant_id = p_tenant_id and c.phone_e164 = v_phone
         and c.erased_at is null and c.merged_into_contact_id is null
       limit 1;
    end if;
    if v_id is null and v_email is not null then
      select c.id into v_id from contacts c
       where c.tenant_id = p_tenant_id and c.email = v_email
         and c.erased_at is null and c.merged_into_contact_id is null
         and (v_phone is null or c.phone_e164 is null)  -- two numbers are two people
       limit 1;
    end if;
    exit when v_id is not null;

    -- Nobody: they are made, with the address only when nobody here holds it.
    v_new_email := case
      when v_email is not null
       and not exists (select 1 from contacts c where c.tenant_id = p_tenant_id and c.email = v_email)
      then v_email
    end;
    -- Never a person with neither. The early checks make this impossible for
    -- the line as written; it reads what the insert would write, because the
    -- address may be one another person holds and so be left out.
    if v_phone is null and v_new_email is null then
      raise exception 'A number or an address is needed.' using errcode = '22023';
    end if;
    begin
      insert into contacts (tenant_id, phone_e164, email, display_name)
      values (p_tenant_id, v_phone, v_new_email, v_name)
      returning id into v_id;
    exception when unique_violation then
      if v_try = 2 then
        raise;
      end if;
    end;
    if v_id is not null then
      insert into events (tenant_id, kind, category, subject_type, subject_id, data)
      values (p_tenant_id, 'contact.added', 'contact', 'contact', v_id,
              jsonb_build_object('source', 'import', 'title', null, 'by', v_user));
      return jsonb_build_object(
        'contact_id', v_id,
        'existed', false,
        'email', case when v_email is null then null when v_new_email is null then 'taken' else 'set' end);
    end if;
  end loop;

  -- Found. A name, a number or an address we did not have is worth keeping; one
  -- we have is never overwritten.
  if v_name is not null then
    update contacts set display_name = v_name, updated_at = now() where id = v_id and display_name is null;
  end if;
  if v_phone is not null then
    begin
      update contacts set phone_e164 = v_phone, updated_at = now() where id = v_id and phone_e164 is null;
    exception when unique_violation then
      null; -- another person here holds the number: theirs stays theirs
    end;
  end if;
  if v_email is not null then
    if exists (select 1 from contacts c where c.id = v_id and c.email is not null) then
      v_email_out := 'kept';
    elsif exists (select 1 from contacts c where c.tenant_id = p_tenant_id and c.email = v_email) then
      v_email_out := 'taken';
    else
      begin
        perform public.set_person_email(v_id, v_email);
        v_email_out := 'set';
      exception when unique_violation then
        v_email_out := 'taken'; -- another line wrote it between the look and the write
      end;
    end if;
  end if;

  return jsonb_build_object('contact_id', v_id, 'existed', true, 'email', v_email_out);
end $$;

revoke execute on function public.import_person(uuid, text, text, text, text, text) from public, anon;
grant execute on function public.import_person(uuid, text, text, text, text, text) to authenticated;
comment on function public.import_person(uuid, text, text, text, text, text) is
  'One line of an imported client list: find by number, then address (two numbers are two people); fill what is empty; never a yes; the erased stay erased (PE001).';

/* ------------------------------------------------------------- 2. the ledger's word -- */

-- The ledger takes an import: one row per part of fifty, subject the workspace.
-- The verb is appended to the CHECK as it stands, never restated as a list: two
-- programs widen this CHECK in the same week (the Lists program's verbs and this
-- one), and a literal list from either would erase the other's verbs in whichever
-- database it reached second. Postgres keeps `in (...)` as `= ANY (ARRAY[...])`,
-- the form schema-sets.generated.ts is read from, and 'import' goes last in it.
do $$
declare
  v_def text;
begin
  select pg_get_constraintdef(c.oid) into v_def
    from pg_constraint c
   where c.conname = 'decisions_verb_check' and c.conrelid = 'public.decisions'::regclass;
  if v_def is null then
    raise exception '00170: decisions_verb_check is missing, so there is no list of verbs to add import to';
  end if;
  if position('''import''::text' in v_def) > 0 then
    return;
  end if;
  if v_def !~ '::text\]\)\)\)$' then
    raise exception '00170: decisions_verb_check is not the verb = ANY (ARRAY[...]) it appends to: %', v_def;
  end if;
  v_def := regexp_replace(v_def, '::text\]\)\)\)$', '::text, ''import''::text])))');
  execute 'alter table public.decisions drop constraint decisions_verb_check';
  execute 'alter table public.decisions add constraint decisions_verb_check ' || v_def;
end $$;

/* --------------------------------------------- 3. the people read says an import -- */

-- 00166's people_list, copied as it stands, with one arm added to came_from
-- before 'manual' (a person the import door added came from an import) and its
-- comment naming import among the doors. Only the body changes, not the
-- signature or the columns, so `create or replace` alone would take it; the copy
-- keeps 00166's drop and create so it reads line for line beside its source, and
-- restates the grants and the comment the drop takes away.
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
  deal_per                text,
  -- Its link, the last day it stands, and why they passed (0008).
  deal_proposal_url       text,
  deal_valid_until        date,
  deal_lost_reason        text,
  -- The earliest open step on them (0007, amended): by its day, then as it was written.
  step_id                 uuid,
  step_body               text,
  step_due_on             date,
  step_for_user_id        uuid,
  step_deal_id            uuid
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
      when ad.source = 'import' then 'import'
      when ad.source is not null then 'manual'
      when coalesce(ma.has_backfill, false) then case when ma.backfill_first in ('call', 'whatsapp', 'sms', 'email') then ma.backfill_first else 'import' end
      when lk.first_at is not null and (ma.first_at is null or lk.first_at <= ma.first_at) then 'call'
      when ma.first_channel in ('whatsapp', 'sms', 'email') then ma.first_channel
    end,
    dl.id, dl.stage, dl.service, dl.proposed_at, dl.decided_at, dl.ended_at, dl.amount_cents, dl.per,
    dl.proposal_url, dl.valid_until, dl.lost_reason,
    st.id, st.body, st.due_on, st.for_user_id, st.deal_id
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
    select d.id, d.stage, d.service, d.proposed_at, d.decided_at, d.ended_at, d.amount_cents, d.per,
           d.proposal_url, d.valid_until, d.lost_reason
      from deals d
     where d.contact_id = c.id
     order by (d.stage in ('proposed', 'won')) desc, d.created_at desc
     limit 1
  ) dl on true
  left join lateral (
    -- Their next step: the earliest open one, by its day, then the one written first. A step is a note with a day,
    -- for the team only, so the receptionist never reads it; the list carries it for the Pipeline and Today.
    select n.id, n.body, n.due_on, n.for_user_id, n.deal_id
      from person_notes n
     where n.tenant_id = p_tenant_id
       and n.contact_id = c.id
       and n.due_on is not null
       and n.done_at is null
     order by n.due_on, n.created_at, n.id
     limit 1
  ) st on true
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
  'Everyone this workspace has ever heard from, with both consent answers: `consent` for conversation and their own appointments, `marketing_consent` for offers. Two answers because the carriers require them collected separately (error 30913). `came_from` says where each first came from: the door that added them (calendar, lead, import, manual); else a history moved in from before the database says how it began, in the thread''s own order (a call''s note is call, anything else its wire; import only when it names none); else their first call (call) or the wire of their first message (whatsapp, sms, email); null when nothing says. p_query matches a name, a WhatsApp name, an email address or three digits of the number; p_limit (at most 1000) and p_offset page under one whole order: latest contact first, then the newest added, then the id. The deal_* columns carry the newest open or current deal, else the newest of any (0004), with its link, its valid-until day and why they passed (0008). The step_* columns carry their next step: the earliest open note with a day (0007, amended), by its day and then as written.';

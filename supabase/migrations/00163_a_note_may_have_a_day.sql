-- 00163 · A note may have a day.
--
-- docs/decisions/0007-person-notes.md, amended ("A note may have a day"), and
-- the Pipeline, worked (plan 2026-09-23, PR 4). A next step is a note with a
-- day: due_on, done when someone did it (done_at, done_by), and the deal it
-- moves when it names one (deal_id). A step is the team's -- a day sets
-- team_only, and a CHECK holds it -- so the receptionist, which reads only
-- notes not for the team, never reads one. Every workspace gets them, deals
-- or not: "call Tom back Thursday" is a step for a salon as much as a
-- proposal's follow-up is for a studio.
--
-- The doors: person_note_add and person_note_edit take the day and the deal
-- (the older forms are dropped rather than overloaded, 00137, so a call that
-- names fewer arguments resolves to these with the defaults, and a page from
-- before this release keeps what it sent); person_note_done marks a step done
-- or not, by any acting member, with the version the page saw. A step for a
-- teammate rings them as a note does (00158). people_list carries each
-- person's next step: the earliest open one.
--
-- Every statement re-runs. The new columns take ACCESS EXCLUSIVE on a table a
-- live workspace reads, so the same lock guard as 00140, 00142, 00156, 00160.
set local lock_timeout = '3s';
do $$
begin
  raise notice 'lock_timeout for this migration: %', current_setting('lock_timeout');
  if current_setting('lock_timeout') <> '3s' then
    raise warning 'this file was applied outside a transaction, so SET LOCAL did nothing: run it inside begin/commit, or set lock_timeout yourself before it';
  end if;
end $$;

/* ------------------------------------------------------------ 1. a note may have a day -- */

alter table public.person_notes
  add column if not exists due_on  date,
  add column if not exists done_at timestamptz,
  add column if not exists done_by uuid references auth.users (id) on delete set null,
  add column if not exists deal_id uuid references public.deals (id) on delete set null;

comment on column public.person_notes.due_on is
  'The day this note is due (0007, amended): a note with a day is a step, the team''s only (person_notes_step_is_the_teams). By the business''s calendar; null for a note.';
comment on column public.person_notes.done_at is
  'When the step was done; null while it is open. Only a step is done (person_notes_done_is_a_step).';
comment on column public.person_notes.done_by is
  'Who marked the step done; null while it is open, and for a member no longer on the team.';
comment on column public.person_notes.deal_id is
  'The deal this note moves, when it names one: one of the person''s own (the doors refuse anyone else''s). Kept, as null, when the deal goes.';

alter table public.person_notes drop constraint if exists person_notes_step_is_the_teams;
alter table public.person_notes add constraint person_notes_step_is_the_teams
  check (due_on is null or team_only);
alter table public.person_notes drop constraint if exists person_notes_done_is_a_step;
alter table public.person_notes add constraint person_notes_done_is_a_step
  check (done_at is null or due_on is not null);

-- A person's open steps, for people_list's lateral read and Today's.
create index if not exists person_notes_steps_open
  on public.person_notes (tenant_id, contact_id, due_on)
  where due_on is not null and done_at is null;

/* ------------------------------------------------------------------------ 2. the doors -- */

-- 00158's door, with the day and the deal. A day makes the note the team's; the
-- deal must be this person's own. The event names the day and the deal, never
-- the words.
drop function if exists public.person_note_add(uuid, text, uuid, boolean, text);
create or replace function public.person_note_add(
  p_contact_id  uuid,
  p_body        text,
  p_for_user_id uuid default null,
  p_team_only   boolean default false,
  p_source      text default 'page',
  p_due_on      date default null,
  p_deal_id     uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user   uuid := auth.uid();
  v_tenant uuid;
  v_body   text := nullif(btrim(coalesce(p_body, '')), '');
  v_row    public.person_notes%rowtype;
begin
  if v_user is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  if v_body is null then
    return jsonb_build_object('error', 'empty');
  end if;
  if char_length(v_body) > 600 then
    return jsonb_build_object('error', 'too_long');
  end if;
  if p_source is null or p_source not in ('page', 'bulk') then
    return jsonb_build_object('error', 'bad_source');
  end if;
  select c.tenant_id into v_tenant
    from contacts c
   where c.id = p_contact_id and c.erased_at is null and c.merged_into_contact_id is null;
  if v_tenant is null or not public.is_acting_member(v_tenant) then
    return jsonb_build_object('error', 'not_found');
  end if;
  if p_for_user_id is not null and not exists (
    select 1 from memberships m where m.tenant_id = v_tenant and m.user_id = p_for_user_id
  ) then
    return jsonb_build_object('error', 'not_a_member');
  end if;
  if p_deal_id is not null and not exists (
    select 1 from deals d where d.id = p_deal_id and d.tenant_id = v_tenant and d.contact_id = p_contact_id
  ) then
    return jsonb_build_object('error', 'bad_deal');
  end if;
  insert into person_notes (tenant_id, contact_id, body, author_kind, author_user_id, for_user_id, team_only, source,
                            due_on, deal_id)
  values (v_tenant, p_contact_id, v_body, 'member', v_user, p_for_user_id,
          coalesce(p_team_only, false) or p_due_on is not null, p_source, p_due_on, p_deal_id)
  returning * into v_row;
  insert into events (tenant_id, kind, category, subject_type, subject_id, data)
  values (v_tenant, 'contact.noted', 'contact', 'contact', p_contact_id,
          jsonb_build_object('note_id', v_row.id, 'chars', char_length(v_body), 'by', v_user,
                             'for', p_for_user_id, 'team_only', v_row.team_only, 'source', p_source,
                             'due_on', v_row.due_on, 'deal_id', v_row.deal_id));
  perform public.note_for_you_notify(v_tenant, p_contact_id, v_row.id, v_user, p_for_user_id);
  return jsonb_build_object('note', to_jsonb(v_row));
end $$;

revoke execute on function public.person_note_add(uuid, text, uuid, boolean, text, date, uuid) from public, anon;
grant execute on function public.person_note_add(uuid, text, uuid, boolean, text, date, uuid) to authenticated;
comment on function public.person_note_add(uuid, text, uuid, boolean, text, date, uuid) is
  'A member writes a note on a person (0007): up to 600 characters, optionally for one member of the team, optionally for the team only; with a day it is a step, and the team''s only; it may name one of the person''s own deals. Owner or operator. Answers {note} or {error}.';

-- 00158's door, with the day and the deal. A day the page does not send is
-- kept, so a page from before this release cannot take a step's day away;
-- p_clear_due takes it away, and the step's done with it. Whatever the page
-- says of team_only, a note with a day stays the team's.
drop function if exists public.person_note_edit(uuid, text, uuid, boolean, integer);
create or replace function public.person_note_edit(
  p_note_id     uuid,
  p_body        text,
  p_for_user_id uuid default null,
  p_team_only   boolean default false,
  p_version     integer default null,
  p_due_on      date default null,
  p_deal_id     uuid default null,
  p_clear_due   boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_body text := nullif(btrim(coalesce(p_body, '')), '');
  v_row  public.person_notes%rowtype;
  v_was  uuid;
  v_due  date;
begin
  if v_user is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  if v_body is null then
    return jsonb_build_object('error', 'empty');
  end if;
  if char_length(v_body) > 600 then
    return jsonb_build_object('error', 'too_long');
  end if;
  select * into v_row from person_notes n where n.id = p_note_id for update;
  if v_row.id is null or not public.is_acting_member(v_row.tenant_id) then
    return jsonb_build_object('error', 'not_found');
  end if;
  if v_row.author_kind <> 'member' or v_row.author_user_id is distinct from v_user then
    return jsonb_build_object('error', 'not_yours');
  end if;
  if p_version is not null and p_version <> v_row.version then
    return jsonb_build_object('error', 'moved', 'version', v_row.version);
  end if;
  if p_for_user_id is not null and not exists (
    select 1 from memberships m where m.tenant_id = v_row.tenant_id and m.user_id = p_for_user_id
  ) then
    return jsonb_build_object('error', 'not_a_member');
  end if;
  if p_deal_id is not null and not exists (
    select 1 from deals d where d.id = p_deal_id and d.tenant_id = v_row.tenant_id and d.contact_id = v_row.contact_id
  ) then
    return jsonb_build_object('error', 'bad_deal');
  end if;
  v_was := v_row.for_user_id;
  v_due := case when coalesce(p_clear_due, false) then null else coalesce(p_due_on, v_row.due_on) end;
  update person_notes n
     set body = v_body, for_user_id = p_for_user_id,
         team_only = coalesce(p_team_only, false) or v_due is not null,
         due_on = v_due,
         done_at = case when v_due is null then null else n.done_at end,
         done_by = case when v_due is null then null else n.done_by end,
         deal_id = coalesce(p_deal_id, n.deal_id),
         version = n.version + 1
   where n.id = v_row.id
  returning * into v_row;
  insert into events (tenant_id, kind, category, subject_type, subject_id, data)
  values (v_row.tenant_id, 'contact.note_changed', 'contact', 'contact', v_row.contact_id,
          jsonb_build_object('note_id', v_row.id, 'chars', char_length(v_body), 'by', v_user,
                             'for', p_for_user_id, 'team_only', v_row.team_only,
                             'due_on', v_row.due_on, 'deal_id', v_row.deal_id));
  -- Only a note addressed to someone new tells them; a change of words is not news to its reader.
  if p_for_user_id is distinct from v_was then
    perform public.note_for_you_notify(v_row.tenant_id, v_row.contact_id, v_row.id, v_user, p_for_user_id);
  end if;
  return jsonb_build_object('note', to_jsonb(v_row));
end $$;

revoke execute on function public.person_note_edit(uuid, text, uuid, boolean, integer, date, uuid, boolean) from public, anon;
grant execute on function public.person_note_edit(uuid, text, uuid, boolean, integer, date, uuid, boolean) to authenticated;
comment on function public.person_note_edit(uuid, text, uuid, boolean, integer, date, uuid, boolean) is
  'Its author changes a member''s note (0007): the words, who it is for, team only, its day (kept unless sent or cleared; a day keeps it the team''s) and its deal; a stale version answers {error: moved}. Answers {note} or {error}.';

-- A step is done, or open again: by any acting member, since a step for Maria
-- is Maria's to do. Only a step (not_a_step); the version the page saw
-- refuses a stale press (moved). Pressing what already holds changes nothing
-- and writes nothing.
create or replace function public.person_note_done(
  p_note_id uuid,
  p_done    boolean default true,
  p_version integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_done boolean := coalesce(p_done, true);
  v_row  public.person_notes%rowtype;
begin
  if v_user is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  select * into v_row from person_notes n where n.id = p_note_id for update;
  if v_row.id is null or not public.is_acting_member(v_row.tenant_id) then
    return jsonb_build_object('error', 'not_found');
  end if;
  if v_row.due_on is null then
    return jsonb_build_object('error', 'not_a_step');
  end if;
  if p_version is not null and p_version <> v_row.version then
    return jsonb_build_object('error', 'moved', 'version', v_row.version);
  end if;
  if (v_row.done_at is not null) = v_done then
    return jsonb_build_object('note', to_jsonb(v_row));
  end if;
  update person_notes n
     set done_at = case when v_done then now() end,
         done_by = case when v_done then v_user end,
         version = n.version + 1
   where n.id = v_row.id
  returning * into v_row;
  -- Each kind written out, as every event name is: what the activity log and the alerts read by.
  if v_done then
    insert into events (tenant_id, kind, category, subject_type, subject_id, data)
    values (v_row.tenant_id, 'contact.note_done', 'contact', 'contact', v_row.contact_id,
            jsonb_build_object('note_id', v_row.id, 'by', v_user, 'due_on', v_row.due_on, 'deal_id', v_row.deal_id));
  else
    insert into events (tenant_id, kind, category, subject_type, subject_id, data)
    values (v_row.tenant_id, 'contact.note_undone', 'contact', 'contact', v_row.contact_id,
            jsonb_build_object('note_id', v_row.id, 'by', v_user, 'due_on', v_row.due_on, 'deal_id', v_row.deal_id));
  end if;
  return jsonb_build_object('note', to_jsonb(v_row));
end $$;

revoke execute on function public.person_note_done(uuid, boolean, integer) from public, anon;
grant execute on function public.person_note_done(uuid, boolean, integer) to authenticated;
comment on function public.person_note_done(uuid, boolean, integer) is
  'A step is done, or open again (0007, amended): any owner or operator; only a note with a day (not_a_step); a stale version answers {error: moved}; a press that changes nothing writes nothing. Answers {note} or {error}.';

/* --------------------------------------------------- 3. the people read carries the next step -- */

-- Recreated whole, as 00138, 00156 and 00160 did: a returned column cannot be
-- added in place, the signature is the same so every caller keeps calling it,
-- and the grants and the comment are restated. Five columns after
-- deal_lost_reason.
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
  'Everyone this workspace has ever heard from, with both consent answers: `consent` for conversation and their own appointments, `marketing_consent` for offers. Two answers because the carriers require them collected separately (error 30913). `came_from` says where each first came from: the door that added them (calendar, lead, manual); else a history moved in from before the database says how it began, in the thread''s own order (a call''s note is call, anything else its wire; import only when it names none); else their first call (call) or the wire of their first message (whatsapp, sms, email); null when nothing says. p_query matches a name, a WhatsApp name, an email address or three digits of the number; p_limit (at most 1000) and p_offset page under one whole order: latest contact first, then the newest added, then the id. The deal_* columns carry the newest open or current deal, else the newest of any (0004), with its link, its valid-until day and why they passed (0008). The step_* columns carry their next step: the earliest open note with a day (0007, amended), by its day and then as written.';

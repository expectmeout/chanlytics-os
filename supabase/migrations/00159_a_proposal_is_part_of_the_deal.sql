-- 00159 · A proposal is part of the deal.
--
-- docs/decisions/0008-a-proposal-is-part-of-the-deal.md. The proposal link
-- (00154) lived on the person and the deal (00156) knew nothing of it. The
-- deal now holds it: the link, a "valid until" day, and a reason when someone
-- passes, all through the one door. The person's link is attached to their
-- open deal, else to their newest deal; it opens a Proposal out only for a
-- person with no deal, or one whose link was set after they passed or ended.
-- set_person_proposal writes through to the deal, so a page from the release
-- before this one cannot split the two. The person's column is read only for
-- someone with no deal at all, until it retires.
--
-- And the workspace says how its customers buy (tenants.sells_by): deals are
-- on exactly where it says 'proposal' (contracts dealsAreOn). Empty is not
-- asked yet. The timezone's shape (00084): the owner's update policy, and one
-- more column in its grant. Every workspace keeps what it sees today.
--
-- Every statement re-runs. Two take ACCESS EXCLUSIVE on tables a live
-- workspace reads (the new columns on deals and tenants), so the same lock
-- guard as 00140, 00142 and 00156.
set local lock_timeout = '3s';
do $$
begin
  raise notice 'lock_timeout for this migration: %', current_setting('lock_timeout');
  if current_setting('lock_timeout') <> '3s' then
    raise warning 'this file was applied outside a transaction, so SET LOCAL did nothing: run it inside begin/commit, or set lock_timeout yourself before it';
  end if;
end $$;

/* --------------------------------------------------------- 1. the deal holds it -- */

-- The link keeps 00154's CHECK word for word: the stored shape only; the one
-- normalizer (contracts link.ts) decides what a link is.
alter table public.deals
  add column if not exists proposal_url text
    check (proposal_url is null or (
      proposal_url = btrim(proposal_url)
      and char_length(proposal_url) between 10 and 500
      and proposal_url ~ '^https?://[^[:space:]]+$'
    )),
  add column if not exists valid_until date,
  add column if not exists lost_reason text
    check (lost_reason is null or lost_reason in ('price', 'timing', 'elsewhere', 'no_reply', 'not_a_fit', 'other'));

comment on column public.deals.proposal_url is
  'The proposal this deal sent, as a web address (normalizeLink stores it; 00154''s rule). The receptionist sends it when they ask about the proposal and states none of its figures. Blanked when the person is erased: an address can name a person.';
comment on column public.deals.valid_until is
  'The last day the proposal stands, by the business''s calendar; null when it says none.';
comment on column public.deals.lost_reason is
  'Why they passed, set with the move to lost and cleared by any other stage: price, timing, elsewhere, no_reply, not_a_fit, other. The words for it are the deal''s note.';

/* --------------------------------------------- 2. how the workspace's customers buy -- */

alter table public.tenants
  add column if not exists sells_by text check (sells_by is null or sells_by in ('booking', 'proposal'));

-- 00084's door, one more column: the owner's update policy stands, and the
-- table-wide UPDATE stays revoked, so this is the only other column a session writes.
grant update (sells_by) on public.tenants to authenticated;

comment on column public.tenants.sells_by is
  'How this workspace''s customers buy (0008): booking (they book an appointment) or proposal (some get a proposal first). Deals are on exactly when it is proposal; null is not asked yet. Owner-settable through PATCH workspaces, like the timezone (00084).';

/* ------------------------------------------------------------------ 3. the door -- */

-- The older form is dropped rather than overloaded (00137), so no call is
-- ambiguous: PostgREST resolves a call naming fewer arguments to this one,
-- the defaults filling the rest, and an older page gets the older behaviour.
drop function if exists public.deal_record(uuid, text, uuid, integer, text, timestamptz, integer, text, text, jsonb);

-- 00156's body, with the three fields and what to clear. A move keeps what it
-- is not told, and p_clear names the fields a person emptied: proposal_url,
-- valid_until, amount (the amount and its per) and note. Passing sets the
-- reason; any other stage clears it. A passed proposal sent again stands until
-- the day it is given, or no day: the old one belonged to the proposal they
-- passed on. The link is judged here, as the column judges it, so a bad one is
-- a refusal and never a 23514. Events are 00156's, word for word: no link,
-- amount, note or reason in them.
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
  p_evidence     jsonb default null,
  p_proposal_url text default null,
  p_valid_until  date default null,
  p_lost_reason  text default null,
  p_clear        text[] default null
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
  v_url     text := nullif(btrim(coalesce(p_proposal_url, '')), '');
  v_clear   text[] := coalesce(p_clear, '{}'::text[]);
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
  if v_url is not null and (char_length(v_url) not between 10 and 500 or v_url !~ '^https?://[^[:space:]]+$') then
    return jsonb_build_object('error', 'bad_link');
  end if;
  if p_lost_reason is not null
     and p_lost_reason not in ('price', 'timing', 'elsewhere', 'no_reply', 'not_a_fit', 'other') then
    return jsonb_build_object('error', 'bad_reason');
  end if;
  if exists (
    select 1 from unnest(v_clear) as c(field)
     where c.field is null or c.field not in ('proposal_url', 'valid_until', 'amount', 'note')
  ) then
    return jsonb_build_object('error', 'bad_clear');
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
    insert into deals (tenant_id, contact_id, lead_id, service, stage, proposed_at, amount_cents, per, note, evidence,
                       proposal_url, valid_until, created_by)
    values (
      v_tenant, p_contact_id,
      (select l.id from leads l where l.contact_id = p_contact_id and l.erased_at is null
        order by l.converted_at desc nulls last limit 1),
      v_service, 'proposed', v_when, p_amount_cents, p_per, v_note, p_evidence,
      v_url, p_valid_until, v_user
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
         amount_cents = case when 'amount' = any(v_clear) then null else coalesce(p_amount_cents, d.amount_cents) end,
         per          = case when 'amount' = any(v_clear) then null else coalesce(p_per, d.per) end,
         note         = case when 'note' = any(v_clear) then null else coalesce(v_note, d.note) end,
         evidence     = coalesce(p_evidence, d.evidence),
         proposal_url = case when 'proposal_url' = any(v_clear) then null else coalesce(v_url, d.proposal_url) end,
         valid_until  = case when 'valid_until' = any(v_clear) then null
                             when p_stage = 'proposed' and v_from = 'lost' then p_valid_until
                             else coalesce(p_valid_until, d.valid_until) end,
         -- Passing keeps the reason it was given, or the one it had; any other stage has none.
         lost_reason  = case when p_stage = 'lost'
                             then coalesce(p_lost_reason, case when v_from = 'lost' then d.lost_reason end)
                             else null end,
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

revoke execute on function public.deal_record(uuid, text, uuid, integer, text, timestamptz, integer, text, text, jsonb, text, date, text, text[]) from public, anon;
grant execute on function public.deal_record(uuid, text, uuid, integer, text, timestamptz, integer, text, text, jsonb, text, date, text, text[]) to authenticated;
comment on function public.deal_record(uuid, text, uuid, integer, text, timestamptz, integer, text, text, jsonb, text, date, text, text[]) is
  'Record a deal on a person''s word (0004, 0008). No id: a new engagement, which starts proposed, with its link, value and valid-until day; one open engagement per person per service. An id and the version the page saw: a move (any stage to any, except out of ended, which is re-signed as a new row) that keeps what it is not told; p_clear names what a person emptied (proposal_url, valid_until, amount, note). Passing sets the reason, any other stage clears it. A stale version answers {error: moved}. Owner or operator. Writes the stage''s event; the route records the decision. Answers {deal, from} or {error}: bad_link, bad_reason and bad_clear beside 00156''s.';

/* ------------------------------------------------ 4. an erasure takes the link -- */

-- 00156's words, and the link with them: an address can name a person (00154).
create or replace function public.deals_erase_on_contact()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if NEW.erased_at is not null and OLD.erased_at is null then
    update deals set note = null, evidence = null, proposal_url = null, version = version + 1 where contact_id = NEW.id;
  end if;
  return null;
end $$;
revoke execute on function public.deals_erase_on_contact() from public, anon, authenticated;
comment on function public.deals_erase_on_contact() is
  'When a person is erased, their deals keep no words: the note, the evidence and the proposal link are blanked; stage, dates and amount stay (0004, 0008).';

/* -------------------------------------------- 5. the person's door writes through -- */

-- 00154's door, then the deal: the person's open deal, a proposal first, the
-- newest. A proposal takes the link (null when it is cleared), whatever the
-- workspace answers; with no open deal a link opens a Proposal out, as
-- deal_record would, but only where deals are on (sells_by 'proposal'); a
-- client's deal is left alone. So a page from before this release, which sets
-- the link on the person, still lands it where the deal reads it. A person
-- merged into another is not found, as deal_record does not find them.
create or replace function public.set_person_proposal(p_contact_id uuid, p_url text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user   uuid := auth.uid();
  v_tenant uuid;
  v_url    text := nullif(btrim(coalesce(p_url, '')), '');
  v_deal   public.deals%rowtype;
begin
  if v_user is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  if v_url is not null and (
       char_length(v_url) not between 10 and 500
       or v_url !~ '^https?://[^[:space:]]+$') then
    raise exception 'That is not a web address.' using errcode = '22023';
  end if;
  select c.tenant_id into v_tenant
    from contacts c
   where c.id = p_contact_id and c.erased_at is null and c.merged_into_contact_id is null;
  if v_tenant is null or not public.is_acting_member(v_tenant) then
    raise exception 'Person not found.' using errcode = 'P0002';
  end if;
  update contacts set proposal_url = v_url, updated_at = now() where id = p_contact_id;
  insert into events (tenant_id, kind, category, subject_type, subject_id, data)
  values (v_tenant, 'contact.proposal_set', 'contact', 'contact', p_contact_id,
          jsonb_build_object('set', v_url is not null, 'by', v_user));

  -- The update above holds the person's row, so a second press waits for this one and finds the deal it opened.
  select * into v_deal from deals d
   where d.contact_id = p_contact_id and d.stage in ('proposed', 'won')
   order by (d.stage = 'proposed') desc, d.created_at desc
   limit 1
   for update;
  if v_deal.id is not null then
    if v_deal.stage = 'proposed' and v_deal.proposal_url is distinct from v_url then
      update deals set proposal_url = v_url, version = version + 1 where id = v_deal.id;
    end if;
  elsif v_url is not null and exists (select 1 from tenants t where t.id = v_tenant and t.sells_by = 'proposal') then
    insert into deals (tenant_id, contact_id, lead_id, service, stage, proposed_at, proposal_url, source, created_by)
    values (
      v_tenant, p_contact_id,
      (select l.id from leads l where l.contact_id = p_contact_id and l.erased_at is null
        order by l.converted_at desc nulls last limit 1),
      null, 'proposed', now(), v_url, 'person', v_user
    )
    returning * into v_deal;
    insert into events (tenant_id, kind, category, subject_type, subject_id, data)
    values (v_tenant, 'deal.proposed', 'deal', 'deal', v_deal.id,
            jsonb_build_object('deal_id', v_deal.id, 'contact_id', p_contact_id, 'stage', 'proposed',
                               'from', null, 'service', null, 'by', v_user));
  end if;
  return jsonb_build_object('contact_id', p_contact_id, 'proposal_url', v_url);
end $$;

revoke execute on function public.set_person_proposal(uuid, text) from public, anon;
grant execute on function public.set_person_proposal(uuid, text) to authenticated;
comment on function public.set_person_proposal(uuid, text) is
  'Owner or operator sets a person''s proposal link; empty clears it. The event records that it changed, never the address. Writes through to the deal (0008): the person''s open proposal takes the link; with no open deal, a Proposal out is opened with it where deals are on (sells_by proposal); a client''s deal is left alone.';

/* ------------------------------------------- 6. every link on file joins its deal -- */

-- Each live person with a link that no deal of theirs carries yet, where the
-- workspace has not said its customers book:
--   - an open deal (a proposal first, the newest) takes the link where it has none;
--   - else their newest deal (created_at, the row People shows), passed or
--     ended: when the link was last set after that deal closed (decided or
--     ended), the link is a proposal sent since, and a Proposal out is opened,
--     dated when the link was set; otherwise the link was that deal's, and it
--     takes it where it has none, as history -- nothing is reopened;
--   - no deal at all: a Proposal out is opened, dated when the link was set.
-- A deal opened here has its deal.proposed event in deal_record's shape, with
-- nobody as its author and dated when the link was set, so the activity log
-- says when it happened rather than a burst at the push. A second run finds
-- every link carried, or left where it was, and changes nothing.
do $$
declare
  k       record;
  v_deal  public.deals%rowtype;
  v_at    timestamptz;
  v_later boolean;
begin
  for k in
    select c.id, c.tenant_id, c.proposal_url
      from public.contacts c
      join public.tenants t on t.id = c.tenant_id
     where c.proposal_url is not null
       and c.erased_at is null
       and c.merged_into_contact_id is null
       and t.sells_by is distinct from 'booking'
       and not exists (
         select 1 from public.deals d where d.contact_id = c.id and d.proposal_url = c.proposal_url
       )
     order by c.tenant_id, c.id
  loop
    -- When the link was last set: the newest event that set one, not one that cleared it.
    select max(e.created_at) into v_at
      from public.events e
     where e.tenant_id = k.tenant_id
       and e.kind = 'contact.proposal_set'
       and e.subject_type = 'contact'
       and e.subject_id = k.id
       and coalesce((e.data->>'set')::boolean, false);
    -- Their open deal, a proposal first, the newest; else their newest of any stage.
    select * into v_deal from public.deals d
     where d.contact_id = k.id
     order by (d.stage = 'proposed') desc, (d.stage = 'won') desc, d.created_at desc
     limit 1;
    -- Set after the newest deal closed: only a closed deal has a close, and an unknown time is never later.
    v_later := v_deal.id is not null
               and v_deal.stage in ('lost', 'ended')
               and coalesce(v_at > coalesce(v_deal.ended_at, v_deal.decided_at), false);
    if v_deal.id is not null and not v_later then
      if v_deal.proposal_url is null then
        update public.deals set proposal_url = k.proposal_url, version = version + 1 where id = v_deal.id;
      end if;
    else
      insert into public.deals (tenant_id, contact_id, lead_id, service, stage, proposed_at, proposal_url, source, created_by)
      values (
        k.tenant_id, k.id,
        (select l.id from public.leads l where l.contact_id = k.id and l.erased_at is null
          order by l.converted_at desc nulls last limit 1),
        null, 'proposed', coalesce(v_at, now()), k.proposal_url, 'person', null
      )
      returning * into v_deal;
      insert into public.events (tenant_id, kind, category, subject_type, subject_id, data, created_at)
      values (k.tenant_id, 'deal.proposed', 'deal', 'deal', v_deal.id,
              jsonb_build_object('deal_id', v_deal.id, 'contact_id', k.id, 'stage', 'proposed',
                                 'from', null, 'service', null, 'by', null),
              coalesce(v_at, now()));
    end if;
  end loop;
end $$;

/* ------------------------------------------- 7. every workspace keeps what it sees -- */

-- Deals showed wherever a deal was recorded or a consult-first service listed
-- (0004's gate), and the link wherever one was set: those workspaces answer
-- 'proposal'. The rest are not asked yet, and see no deal, as today.
update public.tenants t
   set sells_by = 'proposal'
 where t.sells_by is null
   and (
     exists (select 1 from public.deals d where d.tenant_id = t.id)
     or exists (
       select 1 from public.contacts c
        where c.tenant_id = t.id and c.proposal_url is not null
          and c.erased_at is null and c.merged_into_contact_id is null
     )
     or exists (
       select 1 from public.tenant_config tc
        where tc.tenant_id = t.id
          and jsonb_typeof(tc.config #> '{brain,profile,booking_rules,consult_first}') = 'array'
          and jsonb_array_length(tc.config #> '{brain,profile,booking_rules,consult_first}') > 0
     )
   );

/* ------------------------------------------ 8. the people read carries the deal's link -- */

-- Recreated whole, as 00138 and 00156 did: a returned column cannot be added in
-- place, the signature is the same so every caller keeps calling it, and the
-- grants and the comment are restated. Three columns after deal_per.
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
  deal_lost_reason        text
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
    dl.proposal_url, dl.valid_until, dl.lost_reason
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
  'Everyone this workspace has ever heard from, with both consent answers: `consent` for conversation and their own appointments, `marketing_consent` for offers. Two answers because the carriers require them collected separately (error 30913). `came_from` says where each first came from: the door that added them (calendar, lead, manual); else a history moved in from before the database says how it began, in the thread''s own order (a call''s note is call, anything else its wire; import only when it names none); else their first call (call) or the wire of their first message (whatsapp, sms, email); null when nothing says. p_query matches a name, a WhatsApp name, an email address or three digits of the number; p_limit (at most 1000) and p_offset page under one whole order: latest contact first, then the newest added, then the id. The deal_* columns carry the newest open or current deal, else the newest of any (0004), with its link, its valid-until day and why they passed (0008).';

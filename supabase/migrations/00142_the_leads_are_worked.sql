-- 00142 · The leads are worked.
--
-- Release B's one migration (PRD v3 §9, §0.4, §6.1; the plan is
-- docs/plans/2026-09-19-lead-finder-B-product.md, Task 4.2 and 4.5). 00140
-- found the leads; this file is what an owner does with them afterwards: the
-- stage and the six call outcomes, the draft's "Did you send it?", Not a fit,
-- bulk over a selection or over a view, erase, the export mark, the first
-- day's suggestions, the lists and their counts, the bell's two kinds, and the
-- rule that a converted lead's yes comes only from them, permanently.
--
-- Every door here follows 00140's: SECURITY DEFINER with search_path pinned,
-- auth.uid() read inside (never a parameter, 00021's rule), membership and
-- role checked through the existing helpers (is_acting_member for an
-- operator's act, has_permission for the owner's), a refusal returned as
-- jsonb {error: ...} where the owner will read a sentence and raised only for
-- a caller's bug, execute revoked from public and anon and granted to
-- authenticated. Members read their workspace's rows through row-level
-- security and write nothing directly.
--
-- Two statements here take ACCESS EXCLUSIVE on a table a live workspace is
-- reading -- the CHECK on notifications and the new column on leads -- and
-- both are held until COMMIT while the rest of the file runs. Behind a long
-- read that queues every reader behind us, so the same three-second guard
-- 00140 set is set here, and says so out loud when the file is applied
-- outside a transaction, where SET LOCAL does nothing.
set local lock_timeout = '3s';
do $$
begin
  raise notice 'lock_timeout for this migration: %', current_setting('lock_timeout');
  if current_setting('lock_timeout') <> '3s' then
    raise warning 'this file was applied outside a transaction, so SET LOCAL did nothing: run it inside begin/commit, or set lock_timeout yourself before it';
  end if;
end $$;

/* ------------------------------------------------- 1. columns and sets -- */

-- What the client echoes back to Undo (E9). 00140 gave lead_search_members a
-- version and the leads themselves none, because A's only undo-able acts were
-- Keep, Exclude and Put back, which change a membership. B's acts change the
-- LEAD -- its stage, its closed reason, the wrong number -- so the lead
-- carries the number the page saw, and lead_undo refuses when it moved.
alter table public.leads add column if not exists version integer not null default 1;
comment on column public.leads.version is
  'Bumped by every door that changes this lead. The page sends it back with an Undo and lead_undo refuses when anyone changed the row since (E9).';

-- The lists of the rail are stage lists over the leads a workspace owns, so
-- the stage is read for every one of them.
create index if not exists leads_tenant_stage on public.leads (tenant_id, stage)
  where erased_at is null and blanked_at is null;

-- B's two acts join A's six. Widened with the full list, never an add: the
-- constraint is dropped and re-added, so re-running the file is safe.
alter table public.lead_operations drop constraint if exists lead_operations_kind_check;
alter table public.lead_operations add constraint lead_operations_kind_check
  check (kind in ('undo_search', 'keep', 'exclude', 'put_back', 'include', 'stop', 'stage', 'bulk'));

-- The bell's list as it stands after 00141, plus the finder's two. 00141's own
-- head says it: every widening of this CHECK is drop-and-add with its own full
-- list, so one written from an older list silently removes the newer kinds and
-- recordNotification swallows the insert error.
alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in ('handoff','deadman','call','number','sweep','job_failed','playbook','calendar_people','alert','review','billing','template_ready','template_blocked','broadcast_sent','broadcast_stopped','leads_ready','leads_question'));

-- The first day's suggestions (§8.9): one row per workspace, written by the
-- service (server/service.ts saveLeadSuggestions) after a model call, read by
-- every member. A week old and it is asked again; an owner who changes the
-- business line clears the items and the next read asks at once.
create table if not exists public.lead_suggestions (
  tenant_id     uuid primary key references public.tenants (id) on delete cascade,
  business_line text not null check (char_length(business_line) between 3 and 160),
  by_owner      boolean not null default false,
  items         jsonb not null default '[]'::jsonb,
  made_at       timestamptz not null default now()
);
comment on table public.lead_suggestions is
  'The three or four kinds of business worth reaching, written from the workspace''s business line (§8.9). One row per workspace; by_owner says the line is the owner''s own words, not the workspace''s name and services. The service writes it; members read it.';

alter table public.lead_suggestions enable row level security;
drop policy if exists lead_suggestions_member_select on public.lead_suggestions;
create policy lead_suggestions_member_select on public.lead_suggestions
  for select to authenticated
  using (tenant_id in (select m.tenant_id from public.memberships m where m.user_id = (select auth.uid())));
revoke insert, update, delete on public.lead_suggestions from anon, authenticated;
revoke all on public.lead_suggestions from anon;

/* ----------------------------------------------------------- 2. helpers -- */

-- Which of the rail's lists a lead is in (§6.1), held in one place because
-- three readers ask it: the page, the counts and bulk over a view. The lists
-- are stages, never classes: class is whether the place met the plan and lives
-- on the membership.
--
-- 'all' is every lead the workspace owns, so an archived lead closed 'stale'
-- or 'search_removed' is in All and in no other list: the five named lists are
-- the five the owner can act on, not a partition.
create or replace function public.lead_in_list(p_stage text, p_closed_reason text, p_list text)
returns boolean
language sql
immutable
set search_path = public
as $$
  select coalesce(case coalesce(p_list, 'all')
    when 'all'       then true
    when 'ready'     then p_stage = 'ready'
    when 'nurture'   then p_stage = 'nurture'
    when 'converted' then p_stage = 'converted'
    when 'said_no'   then p_stage = 'archived' and p_closed_reason = 'said_no'
    when 'not_a_fit' then p_stage = 'archived' and p_closed_reason in ('not_a_fit', 'customer')
    else false
  end, false)
$$;
comment on function public.lead_in_list(text, text, text) is
  'The rail''s lists as one rule (§6.1): all, ready, nurture (Contacted), converted (Talking), said_no, not_a_fit (which holds "Already a customer" too). leads_page, lead_list_counts and lead_bulk all ask it, so the lists cannot drift apart.';
revoke execute on function public.lead_in_list(text, text, text) from public, anon;
grant execute on function public.lead_in_list(text, text, text) to authenticated, service_role;

/* -------------------------------------------------------- 3. the doors -- */

-- The one door the peek's stage control, the call question, the draft's "Did
-- you send it?" and Not a fit all reach.
--
-- The rule that costs the most to get wrong: a stage click NEVER converts
-- (§9.6). Marking Talking by hand leaves contact_id null and the answer says
-- converted false. A person is made by one act only -- a call marked
-- Interested -- and then by the person whose number this is when the
-- workspace already has them (25): never a second one.
create or replace function public.lead_set_stage(
  p_lead_id    uuid,
  p_stage      text default null,   -- ready | nurture | converted | archived, or null to keep it (wrong_number)
  p_reason     text default null,   -- said_no | not_a_fit | customer when archived
  p_fit_reason text default null,   -- chain | wrong_kind | too_far | customer | other (Not a fit's why)
  p_outcome    text default null,   -- a call's outcome, or 'emailed'
  p_note       text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user     uuid := auth.uid();
  v_lead     public.leads%rowtype;
  v_before   jsonb;
  v_contact  uuid;
  v_made     jsonb;
  v_existed  boolean := false;
  v_convert  boolean := coalesce(p_outcome = 'interested', false);   -- the one act that makes a person (§9.6)
  v_stage    text;
  v_hash     text;
  v_supp     boolean := false;
  v_op       uuid;
begin
  if v_user is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  select * into v_lead from public.leads where id = p_lead_id;
  -- A stranger learns nothing: not a member reads as not found (00027's rule).
  -- Viewers read only, so they are strangers to this door too.
  if not found or not public.is_acting_member(v_lead.tenant_id) then
    raise exception 'Lead not found.' using errcode = 'P0002';
  end if;
  if v_lead.erased_at is not null or v_lead.blanked_at is not null then
    raise exception 'This lead is gone.' using errcode = 'P0002';
  end if;
  if p_stage is not null and p_stage not in ('ready', 'nurture', 'converted', 'archived') then
    raise exception 'stage must be ready, nurture, converted or archived' using errcode = '22023';
  end if;
  if p_reason is not null and p_reason not in ('said_no', 'not_a_fit', 'customer', 'stale', 'search_removed') then
    raise exception 'reason must be one of the closed reasons' using errcode = '22023';
  end if;
  if p_fit_reason is not null and p_fit_reason not in ('chain', 'wrong_kind', 'too_far', 'customer', 'other') then
    raise exception 'fit_reason must be chain, wrong_kind, too_far, customer or other' using errcode = '22023';
  end if;
  if p_outcome is not null and p_outcome not in ('interested', 'call_back', 'not_interested', 'voicemail', 'no_answer', 'wrong_number', 'emailed') then
    raise exception 'outcome must be one of the six, or emailed' using errcode = '22023';
  end if;
  if p_note is not null and char_length(p_note) > 280 then
    raise exception 'Note too long.' using errcode = '22023';
  end if;

  v_before := jsonb_build_object('stage', v_lead.stage, 'closed_reason', v_lead.closed_reason,
                                 'phone_wrong', v_lead.phone_wrong, 'contact_id', v_lead.contact_id);
  v_stage  := case when v_convert then 'converted' else p_stage end;

  if v_convert then
    -- A real conversation. The person whose number this is, else the person
    -- whose address it is, else a new one named for the business.
    if v_lead.contact_id is not null then
      v_contact := v_lead.contact_id;
      v_existed := true;
    elsif v_lead.phone_e164 ~ '^\+[1-9][0-9]{7,14}$' then
      -- create_person is get-or-create by number (00053), so the workspace
      -- never gets a second person for a number it already has (25), and its
      -- contact.added event with source 'lead' is what People reads back as
      -- "A lead you found" (00138).
      v_made    := public.create_person(v_lead.tenant_id, v_lead.phone_e164, left(nullif(v_lead.business_name, ''), 80), 'lead');
      v_contact := (v_made->>'contact_id')::uuid;
      v_existed := coalesce((v_made->>'existed')::boolean, false);
      -- 00125's door adds the address to a person created by phone, but only
      -- when they have none and nobody else here holds it: a unique violation
      -- inside this door would lose the whole act.
      if v_lead.email is not null
         and not exists (select 1 from public.contacts c where c.id = v_contact and c.email is not null)
         and not exists (select 1 from public.contacts c where c.tenant_id = v_lead.tenant_id and c.email = lower(btrim(v_lead.email))) then
        perform public.set_person_email(v_contact, v_lead.email);
      end if;
    else
      -- A lead with no number converts the way an email-only person arrives:
      -- the address is the identity, and the same contact.added event says
      -- where they came from.
      select c.id into v_contact from public.contacts c
       where c.tenant_id = v_lead.tenant_id and c.email = lower(btrim(coalesce(v_lead.email, '')))
         and c.erased_at is null and c.merged_into_contact_id is null
       limit 1;
      v_existed := v_contact is not null;
      if v_contact is null then
        insert into public.contacts (tenant_id, display_name, email)
        values (v_lead.tenant_id, left(nullif(v_lead.business_name, ''), 80), nullif(lower(btrim(coalesce(v_lead.email, ''))), ''))
        returning id into v_contact;
        insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
        values (v_lead.tenant_id, 'contact.added', 'contact', 'contact', v_contact,
                jsonb_build_object('source', 'lead', 'title', null, 'by', v_user));
      end if;
    end if;
  end if;

  -- One statement, so the version moves exactly once however the lead was
  -- worked, and a stage that was not named is kept (wrong_number).
  update public.leads
     set stage         = coalesce(v_stage, stage),
         closed_reason = case when v_stage = 'archived' then p_reason
                              when v_stage is not null then null
                              else closed_reason end,
         phone_wrong   = (phone_wrong or coalesce(p_outcome, '') = 'wrong_number'),
         contact_id    = coalesce(v_contact, contact_id),
         converted_at  = case when v_convert then coalesce(converted_at, now()) else converted_at end,
         contacted_at  = case when coalesce(v_stage, '') in ('nurture', 'converted') then coalesce(contacted_at, now()) else contacted_at end,
         last_outcome  = coalesce(p_outcome, last_outcome),
         last_note     = case when p_outcome is not null then p_note else last_note end,
         version       = version + 1
   where id = p_lead_id
  returning * into v_lead;

  if v_convert then
    insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
    values (v_lead.tenant_id, 'lead.converted', 'lead', 'lead', p_lead_id,
            jsonb_build_object('contact_id', v_contact, 'existed', v_existed, 'how', 'call', 'by', v_user));
  end if;

  if p_outcome is not null and p_outcome <> 'emailed' then
    insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
    values (v_lead.tenant_id, 'lead.call', 'lead', 'lead', p_lead_id,
            jsonb_build_object('outcome', p_outcome, 'note', p_note, 'by', v_user));
  elsif p_outcome = 'emailed' then
    -- S12: what is recorded is that the OWNER said they sent it.
    insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
    values (v_lead.tenant_id, 'lead.emailed', 'lead', 'lead', p_lead_id,
            jsonb_build_object('by', v_user));
  elsif p_reason in ('not_a_fit', 'customer') then
    insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
    values (v_lead.tenant_id, 'lead.not_a_fit', 'lead', 'lead', p_lead_id,
            jsonb_build_object('why', p_fit_reason, 'by', v_user));
    -- "Already a customer" hides the place from every future search (§0.4,
    -- S8). The hash is A's keyed digest, so the collect's suppression read
    -- refuses the place byte for byte.
    if p_reason = 'customer' and v_lead.place_id is not null then
      v_hash := public.lead_suppression_hash(v_lead.tenant_id, v_lead.place_id);
      insert into public.lead_suppressions (tenant_id, kind, hash, what)
      values (v_lead.tenant_id, 'place', v_hash, 'customer')
      on conflict (tenant_id, kind, hash) do nothing;
      v_supp := found;
    end if;
  else
    insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
    values (v_lead.tenant_id, 'lead.stage', 'lead', 'lead', p_lead_id,
            jsonb_build_object('stage', v_stage, 'reason', p_reason, 'by', v_user));
  end if;

  insert into public.lead_operations (tenant_id, kind, search_id, lead_ids, before, after, version, by)
  values (v_lead.tenant_id, 'stage', null, array[p_lead_id], v_before,
          jsonb_build_object('stage', v_lead.stage, 'closed_reason', v_lead.closed_reason,
                             'phone_wrong', v_lead.phone_wrong, 'contact_id', v_lead.contact_id,
                             'converted', v_convert, 'suppressed', v_supp, 'place_hash', v_hash),
          v_lead.version, v_user)
  returning id into v_op;

  return jsonb_build_object('stage', v_lead.stage, 'closed_reason', v_lead.closed_reason,
                            'contact_id', v_lead.contact_id, 'existed', v_existed, 'converted', v_convert,
                            'op_id', v_op, 'version', v_lead.version);
end $$;
comment on function public.lead_set_stage(uuid, text, text, text, text, text) is
  'Operator. The one door for a lead''s stage, its six call outcomes, "Did you send it?" and Not a fit. A click to converted marks Talking and nothing else: contact_id stays null and the answer says converted false (§9.6). Only outcome interested makes a person -- the one whose number this is when the workspace has them, else whose address, else a new one named for the business with source lead -- and links it. wrong_number marks the number and keeps the stage. reason customer hides the place from every future search. Writes one lead_operations row (kind stage) with the lead''s new version.';
revoke execute on function public.lead_set_stage(uuid, text, text, text, text, text) from public, anon;
grant  execute on function public.lead_set_stage(uuid, text, text, text, text, text) to authenticated;


-- Many at once (S13): the ids the owner selected, or every lead the view
-- matches when they chose "Select all 1,240 that match". One or the other,
-- never both, and one operation row so the whole act undoes as one.
create or replace function public.lead_bulk(
  p_tenant_id uuid,
  p_action    text,
  p_ids       uuid[] default null,
  p_view      jsonb  default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user   uuid := auth.uid();
  v_ids    uuid[];
  v_stage  text;
  v_reason text;
  v_before jsonb := '{}'::jsonb;
  v_done   integer := 0;
  v_op     uuid;
begin
  if v_user is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  if p_tenant_id is null or not public.is_acting_member(p_tenant_id) then
    raise exception 'Workspace not found.' using errcode = 'P0002';
  end if;
  if p_action not in ('contacted', 'not_a_fit') then
    raise exception 'action must be contacted or not_a_fit' using errcode = '22023';
  end if;
  if (p_ids is null) = (p_view is null) then
    raise exception 'name the leads, or the view, and not both' using errcode = '22023';
  end if;
  v_stage  := case p_action when 'contacted' then 'nurture' else 'archived' end;
  v_reason := case p_action when 'not_a_fit' then 'not_a_fit' else null end;

  -- The same rows the page would show: the selection, or the view's filters
  -- with no paging. lead_in_list holds the list rule for both.
  if p_ids is not null then
    select coalesce(array_agg(l.id), '{}') into v_ids
      from public.leads l
     where l.tenant_id = p_tenant_id and l.id = any (p_ids)
       and l.erased_at is null and l.blanked_at is null;
  else
    select coalesce(array_agg(distinct m.lead_id), '{}') into v_ids
      from public.lead_search_members m
      join public.leads l on l.id = m.lead_id
     where m.tenant_id = p_tenant_id
       and (p_view->>'search' is null or m.search_id = (p_view->>'search')::uuid)
       and m.class = coalesce(p_view->>'class', 'qualified')
       and (m.class <> 'qualified' or m.counted)
       and public.lead_in_list(l.stage, l.closed_reason, coalesce(p_view->>'list', 'all'))
       and m.blanked_at is null and l.blanked_at is null and l.erased_at is null;
  end if;
  if coalesce(array_length(v_ids, 1), 0) = 0 then
    return jsonb_build_object('done', 0, 'op_id', null, 'version', 1);
  end if;

  -- What each row was, read before anything is written, with the version this
  -- act will leave it at: Undo restores only the rows nobody touched since.
  select coalesce(jsonb_object_agg(l.id::text, jsonb_build_object(
           'stage', l.stage, 'closed_reason', l.closed_reason, 'seen', l.version + 1)), '{}'::jsonb)
    into v_before
    from public.leads l
   where l.tenant_id = p_tenant_id and l.id = any (v_ids);

  update public.leads l
     set stage         = v_stage,
         closed_reason = case when v_stage = 'archived' then v_reason else null end,
         contacted_at  = case when v_stage = 'nurture' then coalesce(l.contacted_at, now()) else l.contacted_at end,
         version       = l.version + 1
   where l.tenant_id = p_tenant_id and l.id = any (v_ids);
  get diagnostics v_done = row_count;

  -- One event for the act, not one per lead: the operation row holds the ids,
  -- and an activity log with 1,240 rows in it says nothing.
  if p_action = 'not_a_fit' then
    insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
    values (p_tenant_id, 'lead.not_a_fit', 'lead', 'lead', null,
            jsonb_build_object('why', null, 'count', v_done, 'bulk', true, 'by', v_user));
  else
    insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
    values (p_tenant_id, 'lead.stage', 'lead', 'lead', null,
            jsonb_build_object('stage', v_stage, 'reason', v_reason, 'count', v_done, 'bulk', true, 'by', v_user));
  end if;

  -- version 1: a bulk row names no single lead, so the operation is guarded by
  -- undone_at and each lead by the version in `before`.
  insert into public.lead_operations (tenant_id, kind, search_id, lead_ids, before, after, version, by)
  values (p_tenant_id, 'bulk', null, v_ids, v_before,
          jsonb_build_object('action', p_action, 'done', v_done), 1, v_user)
  returning id into v_op;
  return jsonb_build_object('done', v_done, 'op_id', v_op, 'version', 1);
end $$;
comment on function public.lead_bulk(uuid, text, uuid[], jsonb) is
  'Operator. Marks many leads contacted, or not a fit: the ids the owner selected, or every lead the view matches (the same filters leads_page reads, with no paging), never both. One lead_operations row (kind bulk) holds every id with what it was and the version this act leaves it at, so lead_undo restores the rows nobody touched since and says how many it kept. Returns {done, op_id, version}.';
revoke execute on function public.lead_bulk(uuid, text, uuid[], jsonb) from public, anon;
grant  execute on function public.lead_bulk(uuid, text, uuid[], jsonb) to authenticated;

-- Erase one lead, for good (§0.4). The owner's alone, like erasing a person:
-- an operator who can work a lead must not be able to delete it.
create or replace function public.lead_erase(p_lead_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_lead public.leads%rowtype;
begin
  if v_user is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  select * into v_lead from public.leads where id = p_lead_id for update;
  if not found or not exists (select 1 from public.memberships m where m.tenant_id = v_lead.tenant_id and m.user_id = v_user) then
    raise exception 'Lead not found.' using errcode = 'P0002';
  end if;
  if not exists (select 1 from public.memberships m where m.tenant_id = v_lead.tenant_id and m.user_id = v_user and m.role = 'owner') then
    raise exception 'Only an owner can erase a lead.' using errcode = '42501';
  end if;
  if v_lead.erased_at is not null then
    -- Idempotent: a second request is answered, not re-executed.
    return jsonb_build_object('erased', true, 'already', true);
  end if;
  -- The tombstones first, exactly as an erased person's leads are hashed
  -- (00140 leads_erase_on_contact), so no search ever finds this place, this
  -- number or this address again (§0.4).
  if v_lead.place_id is not null then
    insert into public.lead_suppressions (tenant_id, kind, hash, what)
    values (v_lead.tenant_id, 'place', public.lead_suppression_hash(v_lead.tenant_id, v_lead.place_id), 'erased')
    on conflict (tenant_id, kind, hash) do nothing;
  end if;
  if v_lead.phone_e164 is not null then
    insert into public.lead_suppressions (tenant_id, kind, hash, what)
    values (v_lead.tenant_id, 'phone', public.lead_suppression_hash(v_lead.tenant_id, v_lead.phone_e164), 'erased')
    on conflict (tenant_id, kind, hash) do nothing;
  end if;
  if v_lead.email is not null then
    insert into public.lead_suppressions (tenant_id, kind, hash, what)
    values (v_lead.tenant_id, 'email', public.lead_suppression_hash(v_lead.tenant_id, v_lead.email), 'erased')
    on conflict (tenant_id, kind, hash) do nothing;
  end if;
  perform public.lead_blank(p_lead_id);
  update public.leads set erased_at = now(), version = version + 1 where id = p_lead_id;
  -- No operation row: this one is final.
  return jsonb_build_object('erased', true, 'already', false);
end $$;
comment on function public.lead_erase(uuid) is
  'Owner. Erases one lead for good: the place, the number and the address are hashed onto lead_suppressions as erased first, so no search finds them again (§0.4), then lead_blank takes everything that names or reaches the place and erased_at is set. No operation row, because nothing undoes it. Idempotent.';
revoke execute on function public.lead_erase(uuid) from public, anon;
grant  execute on function public.lead_erase(uuid) to authenticated;

-- The export mark (E9): a lead that has left the building keeps its charge,
-- and a removed search that is undone leaves it alone (lead_undo reads
-- exported_at). The route calls this after the file is built.
create or replace function public.lead_export_mark(p_tenant_id uuid, p_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_n    integer;
begin
  if v_user is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  if p_tenant_id is null or not public.has_permission(v_user, p_tenant_id, 'export') then
    raise exception 'Workspace not found.' using errcode = 'P0002';
  end if;
  update public.leads
     set exported_at = now()
   where tenant_id = p_tenant_id and id = any (coalesce(p_ids, '{}'::uuid[]))
     and exported_at is null and erased_at is null and blanked_at is null;
  get diagnostics v_n = row_count;
  return v_n;
end $$;
comment on function public.lead_export_mark(uuid, uuid[]) is
  'Owner (permission export). Stamps exported_at on the leads a download took, once each, and answers how many it marked. An exported lead keeps its charge when a removed search is undone (E9).';
revoke execute on function public.lead_export_mark(uuid, uuid[]) from public, anon;
grant  execute on function public.lead_export_mark(uuid, uuid[]) to authenticated;

-- The Done strip's Undo (PRD v3 §8.6, E9, S11). A round that has just ended
-- delivered leads and charged the month for them; for twenty-four hours the
-- owner may take that back: every lead of that round NOBODY HAS TOUCHED leaves
-- the search, and the ones that counted go back to the allowance of the month
-- they counted in, never to the searching budget (S11).
--
-- Touched is read off the work itself, never off a flag: the stage moved, a
-- person was made, the owner recorded a call or said they sent an email, a
-- number was marked wrong, or the membership was kept, put back or excluded by
-- hand. A lead exported or copied has left the building, so it is removed from
-- the search but keeps its charge (§0.2).
--
-- The act writes one undo_search operation, so the toast's own Undo puts it
-- back through lead_undo like every other act, and lead_searches_view names it
-- for as long as it can be pressed.
create or replace function public.lead_search_undo(p_search_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user     uuid := auth.uid();
  s          public.lead_searches;
  r          public.lead_rounds;
  v_ids      uuid[] := '{}';
  v_credit   jsonb := '{}'::jsonb;
  v_counter  public.lead_counters;
  v_removed  integer := 0;
  v_credited integer := 0;
  v_op       uuid;
  rec        record;
begin
  if v_user is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  select * into s from public.lead_searches where id = p_search_id for update;
  -- The owner's alone (permission find): it gives leads back to the month, and
  -- only the person who spends them may.
  if not found or not public.has_permission(v_user, s.tenant_id, 'find') then
    raise exception 'Search not found.' using errcode = 'P0002';
  end if;
  if s.removed_at is not null then
    return jsonb_build_object('error', 'removed');
  end if;
  select * into r from public.lead_rounds where search_id = p_search_id order by seq desc limit 1;
  if not found or r.state <> 'ended' then
    return jsonb_build_object('error', 'running');
  end if;
  if r.ended_at is null or r.ended_at < now() - interval '24 hours' then
    return jsonb_build_object('error', 'too_late');
  end if;

  for rec in
    select m.id as member_id, m.lead_id, m.counted, m.counted_month, l.exported_at
      from public.lead_search_members m
      join public.leads l on l.id = m.lead_id
     where m.search_id = p_search_id and m.round_id = r.id and m.blanked_at is null
       and l.erased_at is null and l.blanked_at is null
       -- untouched, read off the work
       and l.stage = 'ready' and l.contact_id is null and l.contacted_at is null
       and l.last_outcome is null and not l.phone_wrong
       and m.kept_at is null and coalesce(m.excluded_by, '') <> 'owner'
     for update of m
  loop
    if rec.counted and rec.exported_at is null then
      v_counter := public.lead_counter_take(s.tenant_id, 'allowance', rec.counted_month);
      update public.lead_counters set used = greatest(used - 1, 0), updated_at = now() where id = v_counter.id;
      v_credit   := v_credit || jsonb_build_object(rec.lead_id::text, rec.counted_month);
      v_credited := v_credited + 1;
      update public.lead_search_members
         set blanked_at = now(), counted = false, counted_month = null, version = version + 1
       where id = rec.member_id;
    else
      -- Exported, or never counted: it leaves the search and keeps its charge.
      update public.lead_search_members set blanked_at = now(), version = version + 1 where id = rec.member_id;
    end if;
    v_ids     := array_append(v_ids, rec.lead_id);
    v_removed := v_removed + 1;
  end loop;

  if v_removed = 0 then
    -- Everything here has been worked: there is nothing to give back, and an
    -- operation row with no leads in it is nothing to undo.
    return jsonb_build_object('removed', 0, 'credited', 0, 'op_id', null, 'version', 1);
  end if;
  insert into public.lead_operations (tenant_id, kind, search_id, lead_ids, before, after, version, by)
  values (s.tenant_id, 'undo_search', p_search_id, v_ids,
          jsonb_build_object('removed_at', null, 'credited', v_credit),
          jsonb_build_object('round_id', r.id, 'removed', v_removed, 'credited', v_credited), 1, v_user)
  returning id into v_op;
  return jsonb_build_object('removed', v_removed, 'credited', v_credited, 'op_id', v_op, 'version', 1);
end $$;
comment on function public.lead_search_undo(uuid) is
  'Owner (permission find). The Done strip''s Undo, for twenty-four hours after a round ends (§8.6): every lead of that round nobody has touched leaves the search, and the ones that counted go back to the allowance of the month they counted in (S11), except a lead exported or copied, which leaves but keeps its charge (§0.2). Touched is read off the work: the stage moved, a person was made, a call or an email was recorded, a number was marked wrong, or the membership was kept, put back or excluded by hand. Writes one undo_search operation so the toast can put it back through lead_undo. {error: removed | running | too_late} when it cannot.';
revoke execute on function public.lead_search_undo(uuid) from public, anon;
grant  execute on function public.lead_search_undo(uuid) to authenticated;

/* ---------------------------------------------------------- 4. reads --- */

-- A's page with the rail's list, a direction and the three column sorts
-- added, and the columns the peek reads (the judgment, the other addresses,
-- the duplicate listings, the version the page sends back with an Undo).
--
-- The argument list grows, so the old function is DROPPED and written again:
-- a create-or-replace with more parameters leaves both, and a call naming
-- A's six resolves to neither ("function is not unique"). Every A caller
-- names its arguments, so they all resolve to this one, defaults filling the
-- rest (the same move 00140 made for lead_reserve).
drop function if exists public.leads_page(uuid, uuid, text, text, text, integer);
create or replace function public.leads_page(
  p_tenant_id uuid,
  p_search_id uuid    default null,
  p_class     text    default 'qualified',
  p_sort      text    default 'found',
  p_after_key text    default null,
  p_limit     integer default 200,
  p_list      text    default 'all',
  p_dir       text    default 'asc',
  p_after_id  uuid    default null
)
returns table (
  member_id uuid, lead_id uuid, place_id text, search_id uuid, round_id uuid, class text, excluded_by text, fit text, reason text, distance_m integer,
  counted boolean, counted_month text, judgment jsonb, shares jsonb,
  business_name text, category text, street text, city text, region text, postal_code text, lat double precision, lng double precision,
  website_host text, instagram_url text, phone_e164 text, phone_sources smallint, phone_wrong boolean, email text, email_alternates jsonb,
  email_state text, email_checked_at timestamptz, rating numeric, reviews integer, stage text, closed_reason text, last_outcome text, last_note text,
  contact_id uuid, contacted_at timestamptz, converted_at timestamptz, exported_at timestamptz, found_at timestamptz,
  places integer, version integer, page_key text, sort_key text
)
language sql
stable
security invoker
set search_path = public
as $$
  with args as (
    select coalesce(p_dir, 'asc') = 'desc' as descending,
           case when p_after_id is not null then p_after_key else split_part(coalesce(p_after_key, ''), '|', 1) end as after_k,
           coalesce(p_after_id::text, nullif(split_part(coalesce(p_after_key, ''), '|', 2), '')) as after_id
  ),
  base as (
    select m.id as member_id, m.lead_id, l.place_id, m.search_id, m.round_id, m.class, m.excluded_by, m.fit, m.reason, m.distance_m,
           m.counted, m.counted_month, m.judgment, coalesce(m.judgment->'shares', '[]'::jsonb) as shares,
           l.business_name, l.category, l.street, l.city, l.region, l.postal_code, l.lat, l.lng, l.website_host, l.instagram_url,
           l.phone_e164, l.phone_sources, l.phone_wrong, l.email, l.email_alternates, l.email_state, l.email_checked_at, l.rating, l.reviews,
           l.stage, l.closed_reason, l.last_outcome, l.last_note, l.contact_id, l.contacted_at, l.converted_at, l.exported_at, l.found_at,
           (select count(*)::integer from public.lead_places p where p.lead_id = l.id) as places, l.version,
           case coalesce(p_sort, 'found')
             when 'fit' then (case m.fit when 'strong' then '0' when 'look' then '1' when 'long' then '2' else '3' end)
                             || lpad((9999999999 - floor(extract(epoch from l.found_at)))::bigint::text, 10, '0')
             when 'distance' then lpad(coalesce(m.distance_m, 999999999)::text, 9, '0')
                             || lpad((9999999999 - floor(extract(epoch from l.found_at)))::bigint::text, 10, '0')
             -- The three column sorts B adds. A key is text and never holds
             -- the "|" the packed key splits on.
             when 'business' then left(replace(lower(coalesce(nullif(l.business_name, ''), 'zzzz')), '|', ' '), 60)
                             || lpad((9999999999 - floor(extract(epoch from l.found_at)))::bigint::text, 10, '0')
             when 'rating' then lpad(coalesce((l.rating * 10)::integer, 0)::text, 3, '0')
                             || lpad((9999999999 - floor(extract(epoch from l.found_at)))::bigint::text, 10, '0')
             when 'stage' then (case l.stage when 'ready' then '0' when 'nurture' then '1' when 'converted' then '2' else '3' end)
                             || lpad((9999999999 - floor(extract(epoch from l.found_at)))::bigint::text, 10, '0')
             else lpad((9999999999 - floor(extract(epoch from l.found_at)))::bigint::text, 10, '0')
           end as k
      from public.lead_search_members m
      join public.leads l on l.id = m.lead_id
     where m.tenant_id = p_tenant_id
       and (p_search_id is null or m.search_id = p_search_id)
       and m.class = coalesce(p_class, 'qualified')
       and (m.class <> 'qualified' or m.counted)
       and public.lead_in_list(l.stage, l.closed_reason, coalesce(p_list, 'all'))
       and m.blanked_at is null and l.blanked_at is null and l.erased_at is null
  )
  select b.member_id, b.lead_id, b.place_id, b.search_id, b.round_id, b.class, b.excluded_by, b.fit, b.reason, b.distance_m,
         b.counted, b.counted_month, b.judgment, b.shares,
         b.business_name, b.category, b.street, b.city, b.region, b.postal_code, b.lat, b.lng, b.website_host, b.instagram_url,
         b.phone_e164, b.phone_sources, b.phone_wrong, b.email, b.email_alternates, b.email_state, b.email_checked_at, b.rating, b.reviews,
         b.stage, b.closed_reason, b.last_outcome, b.last_note, b.contact_id, b.contacted_at, b.converted_at, b.exported_at, b.found_at,
         b.places, b.version,
         b.k as page_key,
         b.k || '|' || b.member_id::text as sort_key
    from base b, args a
   where p_after_key is null
      or (a.descending and (b.k, b.member_id::text) < (a.after_k, a.after_id))
      or (not a.descending and (b.k, b.member_id::text) > (a.after_k, a.after_id))
   -- One query, two directions: the pair that is not this call's is a constant
   -- null for every row and sorts nothing.
   order by (case when a.descending then b.k end) desc, (case when a.descending then b.member_id::text end) desc,
            (case when not a.descending then b.k end) asc, (case when not a.descending then b.member_id::text end) asc
   limit least(greatest(coalesce(p_limit, 200), 1), 500)
$$;
comment on function public.leads_page(uuid, uuid, text, text, text, integer, text, text, uuid) is
  'A page of members of one class (qualified: the counted ones; review; excluded) joined to their leads, narrowed to one of the rail''s lists (lead_in_list), keyset-paged on the sort key in either direction, under the caller''s row security. Six sorts: found, fit, distance, business, rating, stage. Hand the last row''s page_key and member_id back as p_after_key and p_after_id; A''s packed sort_key still works on its own, split here, so a caller that names only A''s six arguments pages exactly as it did.';
revoke execute on function public.leads_page(uuid, uuid, text, text, text, integer, text, text, uuid) from public, anon;
grant execute on function public.leads_page(uuid, uuid, text, text, text, integer, text, text, uuid) to authenticated, service_role;

-- The rail's numbers (§6.1). A lead found by two searches is one lead here.
create or replace function public.lead_list_counts(p_tenant_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with mine as (
    select distinct l.id, l.stage, l.closed_reason
      from public.lead_search_members m
      join public.leads l on l.id = m.lead_id
     where m.tenant_id = p_tenant_id and m.class = 'qualified' and m.counted
       and m.blanked_at is null and l.blanked_at is null and l.erased_at is null
  )
  select jsonb_build_object(
    'all',       count(*),
    'ready',     count(*) filter (where public.lead_in_list(stage, closed_reason, 'ready')),
    'nurture',   count(*) filter (where public.lead_in_list(stage, closed_reason, 'nurture')),
    'converted', count(*) filter (where public.lead_in_list(stage, closed_reason, 'converted')),
    'said_no',   count(*) filter (where public.lead_in_list(stage, closed_reason, 'said_no')),
    'not_a_fit', count(*) filter (where public.lead_in_list(stage, closed_reason, 'not_a_fit'))
  ) from mine
$$;
comment on function public.lead_list_counts(uuid) is
  'The six numbers under Leads in the rail: every lead the workspace owns (a qualified membership that counted, not blanked, not erased) and the five stage lists over them, counted once per lead however many searches found it. Never over an erased or blanked row. all is the total, not the sum: a lead closed stale or search_removed is in All and in no other list.';
revoke execute on function public.lead_list_counts(uuid) from public, anon;
grant execute on function public.lead_list_counts(uuid) to authenticated, service_role;

-- A's view with the round's ending time, how many of its leads can be emailed
-- and called, and the operation a finished search's Undo names while its
-- twenty-four hours run. Dropped and written again rather than replaced: a
-- create-or-replace may only add columns at the end, and the round's own
-- columns belong together.
drop view if exists public.lead_searches_view;
create view public.lead_searches_view with (security_invoker = true) as
select s.id, s.tenant_id, s.created_by, s.via, s.card, s.name, s.asked, s.plan, s.removed_at, s.created_at,
       r.id as round_id, r.seq, r.purpose, r.state, r.ending, r.ending_pending, r.question, r.answered, r.target,
       r.plan_version, r.judge_tokens, r.cost_usd, r.waiting_since, r.ended_at,
       coalesce(c.qualified, 0) as qualified, coalesce(c.review, 0) as review, coalesce(c.excluded, 0) as excluded,
       coalesce(c.counted, 0) as counted, coalesce(c.emails_checked, 0) as emails_checked, coalesce(c.with_phone, 0) as with_phone,
       u.id as undo_op_id, u.version as undo_version
  from public.lead_searches s
  left join lateral (
    select r.id, r.seq, r.purpose, r.state, r.ending, r.ending_pending, r.question, r.answered, r.target,
           r.plan_version, r.judge_tokens, r.cost_usd, r.waiting_since, r.ended_at
      from public.lead_rounds r where r.search_id = s.id order by r.seq desc limit 1
  ) r on true
  left join lateral (
    select count(*) filter (where m.class = 'qualified' and m.blanked_at is null) as qualified,
           count(*) filter (where m.class = 'review' and m.blanked_at is null)    as review,
           count(*) filter (where m.class = 'excluded')                           as excluded,
           count(*) filter (where m.counted)                                      as counted,
           count(*) filter (where m.class = 'qualified' and m.blanked_at is null and l.email_state = 'ok')  as emails_checked,
           count(*) filter (where m.class = 'qualified' and m.blanked_at is null and l.phone_e164 is not null and not l.phone_wrong) as with_phone
      from public.lead_search_members m join public.leads l on l.id = m.lead_id where m.search_id = s.id
  ) c on true
  left join lateral (
    select o.id, o.version from public.lead_operations o
     where o.search_id = s.id and o.kind = 'undo_search' and o.undone_at is null and o.at > now() - interval '24 hours'
     order by o.at desc limit 1
  ) u on true;
comment on view public.lead_searches_view is
  'Every column of lead_searches with its latest round (round_id, seq, purpose, state, ending, ending_pending, question, answered, target, plan_version, judge_tokens, cost_usd -- what that round has spent, so cost per Qualified lead is read from here -- waiting_since and ended_at) and its counts over the members: qualified, review, excluded, counted, emails_checked (a qualified lead whose address was checked and answered) and with_phone (a qualified lead with a number nobody has marked wrong). Excluded members stay counted after their details are blanked, so "40 left out" stays 40. undo_op_id and undo_version name the operation this search''s Undo takes while its twenty-four hours run, and are null once it is undone or the day is out.';
revoke all on public.lead_searches_view from public, anon;
grant select on public.lead_searches_view to authenticated, service_role;

/* --------------------------------------------------------- 5. the undo -- */

-- A's door with B's two kinds. Everything above the branches is A's, word for
-- word; the keep/exclude/put_back/include and undo_search branches are A's
-- unchanged.
create or replace function public.lead_undo(p_op_id uuid, p_version integer)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user    uuid := auth.uid();
  op        public.lead_operations;
  m         public.lead_search_members;
  l         public.leads;
  v_counter public.lead_counters;
  v_restored integer := 0;
  v_kept     integer := 0;
  v_recharged integer := 0;
  r          record;
begin
  if v_user is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  select * into op from public.lead_operations where id = p_op_id for update;
  if not found or not public.has_permission(v_user, op.tenant_id, 'find') then
    raise exception 'Operation not found.' using errcode = 'P0002';
  end if;
  if op.undone_at is not null then
    return jsonb_build_object('error', 'undone');
  end if;
  if op.version <> p_version then
    return jsonb_build_object('error', 'changed');
  end if;
  if op.kind in ('keep', 'exclude', 'put_back', 'include') then
    select * into m from public.lead_search_members where search_id = op.search_id and lead_id = op.lead_ids[1] for update;
    if not found or m.version <> op.version then
      return jsonb_build_object('error', 'changed');
    end if;
    update public.lead_search_members
       set class = op.before->>'class', excluded_by = op.before->>'excluded_by',
           counted = (op.before->>'counted')::boolean, counted_month = op.before->>'counted_month',
           kept_at = (op.before->>'kept_at')::timestamptz, kept_by = (op.before->>'kept_by')::uuid,
           version = version + 1
     where id = m.id
    returning * into m;
    -- The lead goes back to the allowance of the month it counted in, never
    -- to the budget (S11); a refund after that month credits that month.
    if (op.after->>'counted')::boolean and not (op.before->>'counted')::boolean then
      v_counter := public.lead_counter_take(op.tenant_id, 'allowance', op.after->>'counted_month');
      update public.lead_counters set used = greatest(used - 1, 0), updated_at = now() where id = v_counter.id;
    end if;
    update public.lead_operations set undone_at = now() where id = p_op_id;
    return jsonb_build_object('ok', true, 'version', m.version);
  end if;
  if op.kind = 'undo_search' then
    -- Two acts write this kind and one branch puts both back: a search that was
    -- removed (lead_search_remove) and a finished round the owner took back
    -- (lead_search_undo). The search comes back with the memberships the act
    -- blanked, except a lead exported or copied since: those are kept as they
    -- are and stay charged (E9).
    update public.lead_searches set removed_at = null where id = op.search_id;
    -- version is qualified on the right: since release B the LEAD has one too,
    -- and an UPDATE ... FROM leads leaves a bare `version` ambiguous (A's line
    -- read `version + 1` and stopped compiling the moment leads.version
    -- existed).
    update public.lead_search_members m2
       set blanked_at = null, version = m2.version + 1
      from public.leads l2
     where m2.search_id = op.search_id and m2.lead_id = l2.id and m2.lead_id = any (op.lead_ids)
       and l2.exported_at is null and l2.blanked_at is null and l2.erased_at is null;
    get diagnostics v_restored = row_count;
    v_kept := coalesce(array_length(op.lead_ids, 1), 0) - v_restored;
    -- And what the act gave back to the month is taken again, lead by lead, in
    -- the month each counted in (S11), and only for the memberships that came
    -- back: one left blanked is exported or was never credited, and either way
    -- it is not charged twice.
    for r in select key, value from jsonb_each_text(coalesce(op.before->'credited', '{}'::jsonb)) loop
      update public.lead_search_members
         set counted = true, counted_month = r.value
       where search_id = op.search_id and lead_id = r.key::uuid and blanked_at is null and not counted;
      if found then
        v_counter := public.lead_counter_take(op.tenant_id, 'allowance', r.value);
        update public.lead_counters set used = used + 1, updated_at = now() where id = v_counter.id;
        v_recharged := v_recharged + 1;
      end if;
    end loop;
    update public.lead_operations set undone_at = now() where id = p_op_id;
    return jsonb_build_object('ok', true, 'restored', v_restored, 'kept', v_kept, 'recharged', v_recharged);
  end if;
  if op.kind = 'stage' then
    -- A person who was made is never unmade from a toast: the route offers no
    -- Undo after a conversion, and the door refuses one if it is asked.
    if coalesce((op.after->>'converted')::boolean, false) then
      return jsonb_build_object('error', 'person');
    end if;
    select * into l from public.leads where id = op.lead_ids[1] for update;
    if not found or l.erased_at is not null or l.blanked_at is not null or l.version <> op.version then
      return jsonb_build_object('error', 'changed');
    end if;
    update public.leads
       set stage = op.before->>'stage', closed_reason = op.before->>'closed_reason',
           phone_wrong = coalesce((op.before->>'phone_wrong')::boolean, false),
           contact_id = (op.before->>'contact_id')::uuid,
           version = version + 1
     where id = l.id
    returning * into l;
    -- "Already a customer" wrote a suppression; taking the act back takes it
    -- back too. Only the one this act wrote, and only a customer's: an email
    -- opt-out and an erasure are nobody's to lift.
    if coalesce((op.after->>'suppressed')::boolean, false) and op.after->>'place_hash' is not null then
      delete from public.lead_suppressions
       where tenant_id = op.tenant_id and kind = 'place' and what = 'customer' and hash = op.after->>'place_hash';
    end if;
    update public.lead_operations set undone_at = now() where id = p_op_id;
    return jsonb_build_object('ok', true, 'version', l.version);
  end if;
  if op.kind = 'bulk' then
    for r in select key as lead_id, value as was from jsonb_each(op.before) loop
      update public.leads
         set stage = r.was->>'stage', closed_reason = r.was->>'closed_reason', version = version + 1
       where id = r.lead_id::uuid and version = (r.was->>'seen')::integer
         and erased_at is null and blanked_at is null;
      if found then v_restored := v_restored + 1; else v_kept := v_kept + 1; end if;
    end loop;
    update public.lead_operations set undone_at = now() where id = p_op_id;
    return jsonb_build_object('ok', true, 'restored', v_restored, 'kept', v_kept);
  end if;
  return jsonb_build_object('error', 'kind');
end $$;
comment on function public.lead_undo(uuid, integer) is
  'Owner. Undoes one operation by its id and the version the client saw: {error: changed} when the operation or any touched row moved since; restores `before`; returns a counted lead to the allowance of the month it counted in, never the budget; a removed search, or a finished round the owner took back, comes back without the leads exported since and takes its credit again; a stage change goes back and takes its "Already a customer" suppression with it, unless it made a person, which is never unmade here; a bulk act restores every row nobody has touched and says how many it kept.';

/* ---------------------------------------------------------- 6. the bell -- */

-- Two kinds on the workspace's bell: a round that stopped to ask, and a
-- search that is done. One row per round per kind, whoever is looking; every
-- member marks their own (00057).
--
-- Nothing rings for the ending 'stopped'. The owner who pressed Stop knows,
-- and removing a search ends its live rounds stopped before the search is
-- marked removed -- so without this, tidying up would tell the workspace the
-- search it just deleted was done.
create or replace function public.lead_rounds_notify()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
  v_n    integer;
begin
  select s.name into v_name from public.lead_searches s where s.id = NEW.search_id;
  if v_name is null then return null; end if;
  if NEW.state = 'waiting_on_owner' and coalesce(OLD.state, '') <> 'waiting_on_owner' then
    insert into public.notifications (tenant_id, kind, title, body, route, subject_type, subject_id)
    select NEW.tenant_id, 'leads_question', left('Your search for ' || v_name || ' needs you', 200),
           coalesce(NEW.question->>'sentence', ''), 'clients/leads:s-' || NEW.search_id::text, 'lead_round', NEW.id::text
     where not exists (select 1 from public.notifications n
                        where n.tenant_id = NEW.tenant_id and n.kind = 'leads_question' and n.subject_id = NEW.id::text);
  elsif NEW.state = 'ended' and coalesce(OLD.state, '') <> 'ended' and coalesce(NEW.ending, '') <> 'stopped' then
    select count(*)::integer into v_n from public.lead_search_members m
     where m.round_id = NEW.id and m.class = 'qualified' and m.blanked_at is null;
    insert into public.notifications (tenant_id, kind, title, body, route, subject_type, subject_id)
    select NEW.tenant_id, 'leads_ready', left('Your search for ' || v_name || ' is done', 200),
           case when v_n > 0 then v_n || ' found.' else 'Nothing new was counted.' end,
           'clients/leads:s-' || NEW.search_id::text, 'lead_round', NEW.id::text
     where not exists (select 1 from public.notifications n
                        where n.tenant_id = NEW.tenant_id and n.kind = 'leads_ready' and n.subject_id = NEW.id::text);
  end if;
  return null;
end $$;
drop trigger if exists lead_rounds_notify on public.lead_rounds;
create trigger lead_rounds_notify after update of state on public.lead_rounds
  for each row execute function public.lead_rounds_notify();
comment on function public.lead_rounds_notify() is
  'The bell''s two lead kinds: one leads_question row when a round stops to ask, one leads_ready row when it ends with anything but "stopped", each once per round, each pointing at the search on People. A member''s own read mark is notification_marks'', as for every other kind.';
revoke execute on function public.lead_rounds_notify() from public, anon, authenticated;

/* ------------------------------------------------- 7. the consent doors -- */

-- A converted lead's yes comes only from them, permanently (PRD decision 19).
--
-- Both bodies are 00137's, word for word, with one block added after the
-- erased check. Neither 00043's four-argument set_contact_consent (dropped at
-- 00137:163) nor 00110's six-argument set_marketing_consent (dropped at
-- 00137:43) is re-created: a create-or-replace with those argument lists
-- would bring back an ambiguous overload and PostgREST would refuse every
-- call. The comments, the revokes and the grants are re-stated for the 00137
-- signatures.

create or replace function public.set_marketing_consent(
  p_tenant_id  uuid,
  p_contact_id uuid,
  p_consent    text,
  p_source     text,
  p_note       text default null,
  p_evidence   jsonb default null,
  p_message_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row      public.contacts%rowtype;
  v_msg      public.messages%rowtype;
  v_words    text;
  v_evidence jsonb := p_evidence;
begin
  if p_consent not in ('unknown', 'opted_in', 'opted_out') then
    raise exception 'consent must be unknown, opted_in or opted_out' using errcode = '22023';
  end if;
  if p_source not in ('in_person', 'phone', 'form', 'customer_message', 'operator') then
    raise exception 'source must be in_person, phone, form, customer_message or operator' using errcode = '22023';
  end if;
  -- A yes to offers is written, or it is not a yes to offers (00100).
  if p_consent = 'opted_in' and p_source not in ('form', 'customer_message') then
    raise exception 'a yes to offers must be in writing: a form the customer signed, or their own message' using errcode = '22023';
  end if;
  if p_note is not null and length(p_note) > 200 then
    raise exception 'note is too long' using errcode = '22023';
  end if;

  -- A signed-in caller must be allowed to act in this workspace. No session at
  -- all is the edge, holding the service key, recording what a customer texted.
  if auth.uid() is not null and not public.is_acting_member(p_tenant_id) then
    raise exception 'Not allowed to act in this workspace.' using errcode = '42501';
  end if;

  -- A member's evidence is read from the message they name, never handed in.
  if auth.uid() is not null and p_evidence is not null then
    raise exception 'The evidence is read from their message. Name the message instead.' using errcode = '22023';
  end if;
  if p_message_id is not null and p_source <> 'customer_message' then
    raise exception 'Only an answer in their own message names a message.' using errcode = '22023';
  end if;
  if auth.uid() is not null and p_source = 'customer_message' and p_message_id is null then
    raise exception 'Choose the message where they said it. If they wrote to you somewhere Chanlytics doesn''t see, record a sign-up form and say where in the note.' using errcode = '22023';
  end if;

  select * into v_row from public.contacts
   where id = p_contact_id and tenant_id = p_tenant_id;
  if not found then
    raise exception 'no such contact' using errcode = 'P0002';
  end if;
  if v_row.erased_at is not null then
    raise exception 'that person has been erased' using errcode = '42501';
  end if;

  -- A converted lead's yes comes only from them (PRD decision 19; permanent,
  -- replacing v2's 90 days). A signed-in caller may record a no, or unknown,
  -- for a person a lead is linked to; never a yes, whatever the source, and
  -- however the message is named. The edge (no session) records what they
  -- texted; the yes page records what they chose. The sentence is contracts'
  -- LEAD_CONSENT_REFUSAL; consent-paths.db.test.mjs holds the two doors equal.
  if auth.uid() is not null and p_consent = 'opted_in'
     and exists (select 1 from public.leads l where l.contact_id = p_contact_id and l.tenant_id = p_tenant_id) then
    raise exception 'This person came from a lead you found. A yes has to come from them: their own message, or your yes page.' using errcode = '42501';
  end if;

  -- The message, read here: theirs, to this workspace, on a written wire. A
  -- call's note is the system's, and a reply is ours.
  if p_message_id is not null then
    select m.* into v_msg
      from public.messages m
      join public.conversations c on c.id = m.conversation_id
     where m.id = p_message_id
       and m.tenant_id = p_tenant_id
       and c.tenant_id = p_tenant_id
       and c.contact_id = p_contact_id
       and m.direction = 'inbound'
       and m.sender = 'customer'
       and m.channel not in ('voice', 'system');
    if not found then
      raise exception 'That isn''t a message this person sent you. Choose one of theirs.' using errcode = '22023';
    end if;
    v_words := coalesce(
      nullif(btrim(regexp_replace(coalesce(v_msg.body, ''), '\s+', ' ', 'g')), ''),
      nullif(btrim(regexp_replace(coalesce(v_msg.media->>'caption', ''), '\s+', ' ', 'g')), ''));
    if v_words is null then
      raise exception 'That message has no words in it to show their answer. Choose the one where they said it.' using errcode = '22023';
    end if;
    v_evidence := jsonb_build_object(
      'message_id', v_msg.id,
      'channel', v_msg.channel,
      'message_external_id', case when v_msg.external_id like 'backfill:%' then null else v_msg.external_id end,
      'words', left(v_words, 80));
  end if;

  -- `dnc` is deliberately NOT touched (00095): declining offers is not a
  -- request to stop hearing about your own appointment.
  update public.contacts
     set marketing_consent            = p_consent,
         marketing_consent_source     = p_source,
         marketing_consent_updated_at = now()
   where id = p_contact_id and tenant_id = p_tenant_id
  returning * into v_row;

  -- The same ledger the conversational answer writes to, with the purpose named.
  -- Consent events are never purged (00038).
  insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
  values (p_tenant_id, 'contact.consent_changed', 'contact', 'contact', p_contact_id,
          jsonb_build_object('purpose', 'marketing', 'consent', p_consent, 'source', p_source, 'note', p_note)
          || coalesce(v_evidence, '{}'::jsonb));

  return jsonb_build_object(
    'marketing_consent', v_row.marketing_consent,
    'marketing_consent_source', v_row.marketing_consent_source,
    'marketing_consent_updated_at', v_row.marketing_consent_updated_at
  );
end $$;

comment on function public.set_marketing_consent(uuid, uuid, text, text, text, jsonb, uuid) is
  'Records a person''s answer about OFFERS, separately from their answer about conversation and appointments. A yes must be written (form or their own message), and never for a person a lead you found is linked to: theirs comes from their own message through the edge, or the yes page (decision 19). A signed-in member''s "their own message" names the inbound message it was given in (p_message_id), and the event keeps that message''s id, wire, provider id and words; p_evidence is the edge''s alone, for an answer the customer texted. Never touches dnc.';

revoke execute on function public.set_marketing_consent(uuid, uuid, text, text, text, jsonb, uuid) from public, anon;
grant  execute on function public.set_marketing_consent(uuid, uuid, text, text, text, jsonb, uuid) to authenticated, service_role;

create or replace function public.set_contact_consent(
  p_contact_id uuid,
  p_consent    text,
  p_source     text,
  p_note       text default null,
  p_message_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user     uuid := auth.uid();
  v_tenant   uuid;
  v_erased   timestamptz;
  v_before   text;
  v_dnc      boolean;
  v_msg      public.messages%rowtype;
  v_words    text;
  v_evidence jsonb;
begin
  -- The caller is auth.uid(), read HERE, never a parameter (00021's rule).
  if v_user is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  if p_consent is null or p_consent not in ('opted_in', 'opted_out', 'unknown') then
    raise exception 'Consent must be opted_in, opted_out or unknown.' using errcode = '22023';
  end if;
  if p_source is null or p_source not in ('in_person', 'phone', 'form', 'customer_message', 'operator') then
    raise exception 'Source must say how the answer was given.' using errcode = '22023';
  end if;
  if p_note is not null and length(p_note) > 200 then
    raise exception 'Note too long.' using errcode = '22023';
  end if;
  if p_message_id is not null and p_source <> 'customer_message' then
    raise exception 'Only an answer in their own message names a message.' using errcode = '22023';
  end if;
  if p_source = 'customer_message' and p_message_id is null then
    raise exception 'Choose the message where they said it. If they wrote to you somewhere Chanlytics doesn''t see, record a sign-up form and say where in the note.' using errcode = '22023';
  end if;

  select c.tenant_id, c.erased_at, c.consent into v_tenant, v_erased, v_before
    from contacts c where c.id = p_contact_id;
  -- A stranger learns nothing: not a member reads as not found (00027's
  -- rule). Viewers read only, so they are strangers to this door too.
  if v_tenant is null or not public.is_acting_member(v_tenant) then
    raise exception 'Contact not found.' using errcode = 'P0002';
  end if;
  if v_erased is not null then
    raise exception 'This person was deleted.' using errcode = 'P0002';
  end if;

  -- A converted lead's yes comes only from them (PRD decision 19; permanent,
  -- replacing v2's 90 days). A signed-in caller may record a no, or unknown,
  -- for a person a lead is linked to; never a yes, whatever the source, and
  -- however the message is named. The edge (no session) records what they
  -- texted; the yes page records what they chose. The sentence is contracts'
  -- LEAD_CONSENT_REFUSAL; consent-paths.db.test.mjs holds the two doors equal.
  if p_consent = 'opted_in'
     and exists (select 1 from public.leads l where l.contact_id = p_contact_id and l.tenant_id = v_tenant) then
    raise exception 'This person came from a lead you found. A yes has to come from them: their own message, or your yes page.' using errcode = '42501';
  end if;

  -- The message, read here, as the offers door reads it.
  if p_message_id is not null then
    select m.* into v_msg
      from public.messages m
      join public.conversations c on c.id = m.conversation_id
     where m.id = p_message_id
       and m.tenant_id = v_tenant
       and c.tenant_id = v_tenant
       and c.contact_id = p_contact_id
       and m.direction = 'inbound'
       and m.sender = 'customer'
       and m.channel not in ('voice', 'system');
    if not found then
      raise exception 'That isn''t a message this person sent you. Choose one of theirs.' using errcode = '22023';
    end if;
    v_words := coalesce(
      nullif(btrim(regexp_replace(coalesce(v_msg.body, ''), '\s+', ' ', 'g')), ''),
      nullif(btrim(regexp_replace(coalesce(v_msg.media->>'caption', ''), '\s+', ' ', 'g')), ''));
    if v_words is null then
      raise exception 'That message has no words in it to show their answer. Choose the one where they said it.' using errcode = '22023';
    end if;
    v_evidence := jsonb_build_object(
      'message_id', v_msg.id,
      'channel', v_msg.channel,
      'message_external_id', case when v_msg.external_id like 'backfill:%' then null else v_msg.external_id end,
      'words', left(v_words, 80));
  end if;

  -- dnc follows the answer the way the ingest sets it: a no is a no on every
  -- channel, and a yes or a reset lifts the operator's own block.
  v_dnc := (p_consent = 'opted_out');
  update contacts
     set consent = p_consent, dnc = v_dnc,
         consent_source = p_source, consent_updated_at = now()
   where id = p_contact_id;

  insert into events (tenant_id, kind, category, subject_type, subject_id, data)
  values (v_tenant, 'contact.consent_changed', 'contact', 'contact', p_contact_id,
          jsonb_build_object('consent', p_consent, 'source', p_source, 'previous', v_before,
                             'by', v_user, 'note', p_note)
          || coalesce(v_evidence, '{}'::jsonb));

  return jsonb_build_object(
    'contact_id', p_contact_id, 'consent', p_consent, 'dnc', v_dnc,
    'source', p_source, 'previous', v_before, 'updated_at', now());
end $$;

comment on function public.set_contact_consent(uuid, text, text, text, uuid) is
  'Owner or operator records a customer''s answer about messages on their own visit (not offers, which are set_marketing_consent''s since 00095): consent, dnc and the source together, plus the contact.consent_changed event. Never a yes for a person a lead you found is linked to: theirs comes from their own message through the edge, or the yes page (decision 19). "Their own message" names the inbound message it was given in (p_message_id), and the event keeps that message''s id, wire, provider id and words. The ledger row is the route''s.';

revoke execute on function public.set_contact_consent(uuid, text, text, text, uuid) from public, anon;
grant  execute on function public.set_contact_consent(uuid, text, text, text, uuid) to authenticated;

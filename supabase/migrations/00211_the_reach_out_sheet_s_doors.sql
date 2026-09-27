-- 00211 · The reach-out sheet's doors.
--
-- Reach out, Part 4 (docs/superpowers/plans/2026-09-26-reach-out-part-4-the-words-and-pages.md, PRs 4 and 5, with the
-- review round's R10, R15–R18 and R23). A member makes and edits a reach-out, counts who a search's chain would write
-- to, answers a held send, and reads how each step of a chain is doing.
--
--   reach_out_sends_step     an index: a step's sends, by their step and state (the save, the removal, the report).
--   reach_out_given_up       the fortnight a send has (R10), one predicate for every door here.
--   outreach_wrote_back      whether people wrote back: 00184's reading moved into one set-based function, which
--                            outreach_lead_facts (re-created) and a chain's report both ask.
--   reach_out_recheck        the one reset of a send's check (R5): planned, unchecked, at its words' next version, what
--                            its owner included it past kept (R7), from a named state only when one is named; past its
--                            fortnight, given up instead. The save, a rewrite, the run's "check the held again", the
--                            hourly release (00197's, re-created on it) and the sender's recheck all ask it.
--   reach_out_save           a chain, whole: its email templates and its playbook rows, made or edited in one transaction.
--                            The service role's (R15): the route checks the member's role and validates the words first,
--                            and passes the member's id. The database keeps only its CHECKs, and one more: a chain's gap
--                            is one of the sheet's (contracts REACH_OUT_GAP_MINUTES).
--   reach_out_remove         a chain that never wrote, removed whole (R16); one that did is paused instead.
--   reach_out_reach          a search's reach, for the sheet and the Leads door. Any member.
--   reach_out_send_decide    an acting member's answer to a held or planned send: include, rewrite, skip, or not a fit
--                            (the lead set aside and the send skipped, atomically: R18).
--   reach_out_run_recheck    every hold of a run the check could not answer, back to be checked, in one call (R18).
--   reach_out_chain_report   a chain's steps counted, its runs, and whether it may be removed (R16, R23). Any member.
--   playbooks                a session deletes moments only (R16): a chain's history goes only through its door.

set local lock_timeout = '3s';

/* ---------------------------------------------------------------- what the doors read -- */

-- A step's sends, by their step: the save, the removal and the report read them so, and without this every such read
-- walked the whole table, every workspace's.
create index if not exists reach_out_sends_step on public.reach_out_sends (playbook_id, state);

-- The fortnight a send has (R10): planned that long ago and still not gone, it is given up, kept_waiting. The SQL form
-- of the clock's REPLAN_GIVE_UP_MS (apps/edge/lib/reach-out/replan.ts), which the clock gives up by (00197
-- reach_out_held_stale); every door here asks this one predicate.
create or replace function public.reach_out_given_up(p_created_at timestamptz)
returns boolean
language sql
stable
set search_path = public
as $$
  select p_created_at < now() - interval '14 days'
$$;
revoke execute on function public.reach_out_given_up(timestamptz) from public, anon;
grant execute on function public.reach_out_given_up(timestamptz) to authenticated, service_role;

-- Whether these people wrote back (00181's three readings, moved here whole from 00184's outreach_lead_facts, which now
-- asks this): a customer's message that is not an auto-reply, a reply to one of the workspace's emails, or a call in.
-- Set-based, so a chain's report asks once for all its leads; the send door asks it for one.
create or replace function public.outreach_wrote_back(p_tenant_id uuid, p_contact_ids uuid[])
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select c.contact_id from public.messages m
    join public.conversations c on c.id = m.conversation_id and c.tenant_id = m.tenant_id
   where m.tenant_id = p_tenant_id and c.contact_id = any (p_contact_ids)
     and m.direction = 'inbound' and m.sender = 'customer'
     and not (m.channel = 'email' and coalesce(m.meta->'email'->>'claim', 'person') = 'auto_reply')
  union
  select c.contact_id from public.messages o
    join public.conversations c on c.id = o.conversation_id and c.tenant_id = o.tenant_id
   where o.tenant_id = p_tenant_id and c.contact_id = any (p_contact_ids)
     and o.channel = 'email' and o.direction = 'outbound' and o.meta->'email'->>'message_id' is not null
     and (exists (
            select 1 from public.messages r
             where r.tenant_id = p_tenant_id and r.channel = 'email' and r.direction = 'inbound'
               and r.sender = 'customer'
               and r.meta->'email'->>'in_reply_to' = o.meta->'email'->>'message_id'
               and coalesce(r.meta->'email'->>'claim', 'person') <> 'auto_reply')
          or exists (
            select 1 from public.messages r
             where r.tenant_id = p_tenant_id and r.channel = 'email' and r.direction = 'inbound'
               and r.sender = 'customer'
               and r.meta->'email'->'references' @> jsonb_build_array(o.meta->'email'->>'message_id')
               and coalesce(r.meta->'email'->>'claim', 'person') <> 'auto_reply'))
  union
  select k.contact_id from public.calls k
   where k.tenant_id = p_tenant_id and k.contact_id = any (p_contact_ids) and k.direction = 'inbound'
$$;
revoke execute on function public.outreach_wrote_back(uuid, uuid[]) from public, anon, authenticated;
grant execute on function public.outreach_wrote_back(uuid, uuid[]) to service_role;

-- 00184's lead facts, unchanged but for wrote_back, which is now the one function above.
create or replace function public.outreach_lead_facts(
  p_tenant_id uuid,
  p_contact_id uuid,
  p_to text,
  p_lead_id uuid default null
) returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    -- The send's own lead when it names one (a reach-out's always does); else the lead still being written to wins.
    'lead_stage', coalesce(
      (select l.stage from public.leads l
        where p_lead_id is not null and l.id = p_lead_id and l.tenant_id = p_tenant_id
          and l.contact_id = p_contact_id and l.erased_at is null and l.blanked_at is null),
      (select l.stage from public.leads l
        where p_lead_id is null and l.tenant_id = p_tenant_id and l.contact_id = p_contact_id
          and l.erased_at is null and l.blanked_at is null
        order by (l.stage in ('ready', 'nurture')) desc, l.found_at desc
        limit 1)),
    'suppressed', exists (
      select 1 from public.lead_suppressions s
       where s.tenant_id = p_tenant_id and s.kind = 'email'
         and s.hash = public.lead_suppression_hash(p_tenant_id, lower(btrim(p_to)))),
    'wrote_back', exists (select 1 from public.outreach_wrote_back(p_tenant_id, array[p_contact_id]))
  )
$$;
revoke execute on function public.outreach_lead_facts(uuid, uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.outreach_lead_facts(uuid, uuid, text, uuid) to service_role;

/* ---------------------------------------------------------------- the one reset -- */

-- A send's check undone: planned, not checked, its words' version moved on so a check still under way for the old
-- words writes nothing (00197 recordCheck), its opening and its hold's detail cleared. What its owner included it past
-- stays (R7). Only from planned, held or claimed: a send that is queued or done has gone as it was checked. Only from
-- `p_from_state` when one is named: the sender resets the send it claimed, never one another tick has claimed since.
-- A send past its fortnight is never planned again: it is given up, kept_waiting (R10). How many went back.
drop function if exists public.reach_out_recheck(uuid[], uuid);
create or replace function public.reach_out_recheck(
  p_send_ids uuid[],
  p_tenant_id uuid default null,
  p_from_state text default null
)
returns int
language sql
volatile
security definer
set search_path = public
as $$
  with asked as (
    select s.id, public.reach_out_given_up(s.created_at) as given_up from public.reach_out_sends s
     where s.id = any (coalesce(p_send_ids, '{}')) and s.state in ('planned', 'held', 'claimed')
       and (p_from_state is null or s.state = p_from_state)
       and (p_tenant_id is null or s.tenant_id = p_tenant_id)
       for update
  ),
  gave_up as (
    update public.reach_out_sends s set state = 'skipped', reason = 'kept_waiting'
      from asked a where a.id = s.id and a.given_up
    returning 1
  ),
  done as (
    update public.reach_out_sends s
       set state = 'planned', reason = null, claimed_at = null, checked_at = null, check_gen = s.check_gen + 1,
           checked_words = null, check_tries = 0, check_first_at = null, check_after = null, check_started_at = null,
           opening = null, angle = null, facts_used = '{}', hold_detail = null
      from asked a where a.id = s.id and not a.given_up
    returning 1
  )
  select count(*)::int from done
$$;
revoke execute on function public.reach_out_recheck(uuid[], uuid, text) from public, anon, authenticated;
grant execute on function public.reach_out_recheck(uuid[], uuid, text) to service_role;

-- 00197's hourly release, on the one reset.
create or replace function public.reach_out_release_unavailable(p_before timestamptz, p_tenant_id uuid default null)
returns int
language sql
volatile
security definer
set search_path = public
as $$
  select public.reach_out_recheck(array(
    select s.id from public.reach_out_sends s
     where s.state = 'held' and s.reason = 'check_unavailable' and s.hold_detail is null
       and s.updated_at < p_before and (p_tenant_id is null or s.tenant_id = p_tenant_id)))
$$;
revoke execute on function public.reach_out_release_unavailable(timestamptz, uuid) from public, anon, authenticated;
grant execute on function public.reach_out_release_unavailable(timestamptz, uuid) to service_role;

/* ---------------------------------------------------------------- the chain's rows -- */

-- A chain's pace is one the sheet offers (contracts REACH_OUT_GAP_MINUTES): the database's copy of the one rule it keeps.
alter table public.playbooks drop constraint if exists playbooks_reach_out_gap;
alter table public.playbooks add constraint playbooks_reach_out_gap
  check (kind <> 'reach_out' or gap_minutes in (5, 8, 12, 20, 30, 60));

-- A session deletes moments only (R16): a chain's rows go through reach_out_remove, which keeps what wrote.
drop policy if exists playbooks_acting_delete on public.playbooks;
create policy playbooks_acting_delete on public.playbooks
  for delete to authenticated
  using (public.is_acting_member(tenant_id) and kind = 'moment');

/* ---------------------------------------------------------------- saving a chain -- */

-- A chain made or edited whole. The route has checked the member's role and validated every word (contracts
-- validateReachOutChain); this checks only what the database holds: the search, the domains and the member are the
-- workspace's, and each step is in its place. The rows' CHECKs hold the rest (a root's signed_by, a step's delay, the
-- gap). New words for a step, or a new name to sign with, send what is planned or held for it back to the check.
create or replace function public.reach_out_save(p_tenant_id uuid, p_user_id uuid, p_chain jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_root     uuid := nullif(p_chain->>'root_id', '')::uuid;
  v_search   uuid := nullif(p_chain->>'search_id', '')::uuid;
  v_name     text := btrim(coalesce(p_chain->>'name', ''));
  v_gap      int := (p_chain->>'gap_minutes')::int;
  v_signed   text := nullif(btrim(coalesce(p_chain->>'signed_by', '')), '');
  v_unconf   boolean := coalesce((p_chain->>'include_unconfirmed')::boolean, false);
  v_domains  uuid[] := coalesce(
               array(select x::uuid from jsonb_array_elements_text(coalesce(p_chain->'domain_ids', '[]'::jsonb)) x), '{}');
  v_steps    jsonb := coalesce(p_chain->'steps', '[]'::jsonb);
  v_n        int := jsonb_array_length(coalesce(p_chain->'steps', '[]'::jsonb));
  v_existing uuid[] := '{}';
  v_dropped  uuid[] := '{}';
  v_signed_was text;
  v_step     jsonb;
  v_i        int;
  v_id       uuid;
  v_prev     uuid;
  v_template uuid;
  v_subject  text;
  v_body     text;
  v_parts    jsonb;
  v_label    text;
  v_ids      uuid[] := '{}';
  v_changed  uuid[] := '{}';
  v_reset    int := 0;
begin
  -- Who may: the one table of permissions (00201 has_permission's approve, a playbook's own: owner, operator, partner).
  if p_tenant_id is null or p_user_id is null or not public.has_permission(p_user_id, p_tenant_id, 'approve') then
    raise exception 'Workspace not found.' using errcode = 'P0002';
  end if;
  if v_n < 1 then raise exception 'A reach-out has at least one email.' using errcode = '22023'; end if;
  if exists (select 1 from unnest(v_domains) d
              where not exists (select 1 from public.sending_domains s where s.id = d and s.tenant_id = p_tenant_id)) then
    raise exception 'Domain not found.' using errcode = 'P0002';
  end if;

  if v_root is null then
    if not exists (select 1 from public.lead_searches s
                    where s.id = v_search and s.tenant_id = p_tenant_id and s.removed_at is null) then
      raise exception 'Search not found.' using errcode = 'P0002';
    end if;
  else
    select lead_search_id, signed_by into v_search, v_signed_was from public.playbooks
     where id = v_root and tenant_id = p_tenant_id and kind = 'reach_out' and trigger = 'lead_first'
       for update;
    if not found then raise exception 'Reach-out not found.' using errcode = 'P0002'; end if;
    -- The chain as it stands, root first.
    with recursive c as (
      select id, 0 as n from public.playbooks where id = v_root
      union all
      select p.id, c.n + 1 from public.playbooks p join c on p.after_playbook_id = c.id
    )
    select array_agg(id order by n) into v_existing from c;
  end if;

  -- An edit keeps the chain's steps in their places: the first k it names are the chain's first k, in order, and any
  -- after them are new.
  for v_i in 0 .. v_n - 1 loop
    v_id := nullif(v_steps->v_i->>'id', '')::uuid;
    if (v_i < coalesce(cardinality(v_existing), 0) and v_id is distinct from v_existing[v_i + 1])
       or (v_i >= coalesce(cardinality(v_existing), 0) and v_id is not null) then
      raise exception 'A step is out of its place. Open the reach-out again.' using errcode = '22023';
    end if;
  end loop;

  -- A step dropped from the end takes its work with it (R17): its live runs canceled, its planned and held sends
  -- skipped, step_removed, then its row. One that wrote keeps its history: its owner pauses the chain instead.
  if coalesce(cardinality(v_existing), 0) > v_n then
    v_dropped := v_existing[v_n + 1:];
    -- Held against a claim while it is judged: a claim waits, or finds them skipped.
    perform 1 from public.reach_out_sends s where s.playbook_id = any (v_dropped) for update;
    if exists (select 1 from public.reach_out_sends s
                where s.playbook_id = any (v_dropped) and s.state in ('claimed', 'queued', 'sent', 'failed')) then
      raise exception 'That step has written already. Pause the reach-out instead.' using errcode = '23503';
    end if;
    update public.broadcasts set state = 'canceled'
     where tenant_id = p_tenant_id and playbook_id = any (v_dropped)
       and state in ('pending_approval', 'scheduled', 'sending');
    update public.reach_out_sends set state = 'skipped', reason = 'step_removed'
     where playbook_id = any (v_dropped) and state in ('planned', 'held');
    -- Their words stay on file (a run of theirs names them: broadcasts.template_id), hidden from Templates.
    update public.templates set hidden_at = coalesce(hidden_at, now())
     where id in (select p.template_id from public.playbooks p where p.id = any (v_dropped));
    -- The first step dropped takes the ones after it (after_playbook_id cascades).
    delete from public.playbooks where id = v_dropped[1];
  end if;

  for v_i in 0 .. v_n - 1 loop
    v_step := v_steps->v_i;
    v_id := nullif(v_step->>'id', '')::uuid;
    v_subject := case when v_i = 0 then btrim(coalesce(v_step->>'subject', '')) end;
    v_body := btrim(coalesce(v_step->>'body', ''));
    v_parts := case when v_i = 0
                 then jsonb_build_array(jsonb_build_object('type', 'HEADER', 'format', 'TEXT', 'text', v_subject),
                                        jsonb_build_object('type', 'BODY', 'text', v_body))
                 else jsonb_build_array(jsonb_build_object('type', 'BODY', 'text', v_body)) end;
    v_label := case v_i when 0 then 'your email' when 1 then 'a nudge' else 'email ' || (v_i + 1) end;

    if v_id is null then
      v_id := gen_random_uuid();
      insert into public.templates (tenant_id, channel, source, name, language, category, meta_status, components,
                                    body_preview, title, created_by)
      values (p_tenant_id, 'email', 'chanlytics', 'reach_out_' || replace(v_id::text, '-', ''), 'en', 'marketing',
              'approved', v_parts, left(v_body, 1024),
              left(left(v_name, 60 - char_length(v_label) - 3) || ' · ' || v_label, 60), p_user_id)
      returning id into v_template;
      insert into public.playbooks (id, tenant_id, kind, name, trigger, policy_class, lead_search_id, after_playbook_id,
                                    after_days, gap_minutes, domain_ids, signed_by, include_unconfirmed, template_id,
                                    template_name, template_language, params, run_hour, cap_per_run, state, created_by)
      values (v_id, p_tenant_id, 'reach_out',
              case when v_i = 0 then v_name else left(v_name, 80 - char_length(v_label) - 3) || ' · ' || v_label end,
              case when v_i = 0 then 'lead_first' else 'after_step' end, 'outreach',
              case when v_i = 0 then v_search end, case when v_i > 0 then v_prev end,
              case when v_i > 0 then (v_step->>'after_days')::int end, v_gap, v_domains,
              case when v_i = 0 then v_signed end, v_i = 0 and v_unconf, v_template,
              'reach_out_' || replace(v_id::text, '-', ''), 'en', '[]'::jsonb, 9, 200, 'running', p_user_id);
    else
      select template_id into v_template from public.playbooks where id = v_id;
      -- New words: what is planned or held for this step is checked again against them (R5).
      if (select components from public.templates where id = v_template) is distinct from v_parts then
        update public.templates set components = v_parts, body_preview = left(v_body, 1024) where id = v_template;
        v_changed := v_changed || v_id;
      end if;
      -- A new name for the chain is its words' new title in Templates too.
      update public.templates set title = left(left(v_name, 60 - char_length(v_label) - 3) || ' · ' || v_label, 60)
       where id = v_template
         and title is distinct from left(left(v_name, 60 - char_length(v_label) - 3) || ' · ' || v_label, 60);
      update public.playbooks
         set name = case when v_i = 0 then v_name else left(v_name, 80 - char_length(v_label) - 3) || ' · ' || v_label end,
             gap_minutes = v_gap, domain_ids = v_domains,
             after_days = case when v_i > 0 then (v_step->>'after_days')::int end,
             signed_by = case when v_i = 0 then v_signed end,
             include_unconfirmed = v_i = 0 and v_unconf
       where id = v_id;
    end if;
    v_prev := v_id;
    v_ids := v_ids || v_id;
  end loop;

  -- A new name to sign with changes every step's words as a business reads them.
  if v_root is not null and v_signed is distinct from v_signed_was then v_changed := v_ids; end if;
  if cardinality(v_changed) > 0 then
    v_reset := public.reach_out_recheck(array(
      select s.id from public.reach_out_sends s
       where s.tenant_id = p_tenant_id and s.playbook_id = any (v_changed) and s.state in ('planned', 'held')),
      p_tenant_id);
  end if;

  return jsonb_build_object('root_id', v_ids[1], 'step_ids', to_jsonb(v_ids), 'rechecked', v_reset);
exception
  when unique_violation then
    raise exception 'This search has a reach-out already.' using errcode = '23505';
end $$;
revoke execute on function public.reach_out_save(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.reach_out_save(uuid, uuid, jsonb) to service_role;
comment on function public.reach_out_save(uuid, uuid, jsonb) is
  'Reach out (Part 4): a chain made or edited whole, its email templates and its playbook rows, for a member the route has checked (service role only, R15). Steps keep their places; a step that wrote is never dropped; new words or a new name send the step''s planned and held sends back to the check.';

/* ---------------------------------------------------------------- removing a chain -- */

-- A chain that never wrote goes whole (R16): its live runs canceled, its words hidden, its rows deleted (its steps and
-- sends cascade). One that wrote keeps its history: its owner pauses it.
create or replace function public.reach_out_remove(p_tenant_id uuid, p_root_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_steps uuid[];
begin
  if auth.uid() is null then raise exception 'Sign in required.' using errcode = '28000'; end if;
  if p_tenant_id is null or not public.is_acting_member(p_tenant_id) then
    raise exception 'Workspace not found.' using errcode = 'P0002';
  end if;
  perform 1 from public.playbooks
   where id = p_root_id and tenant_id = p_tenant_id and kind = 'reach_out' and trigger = 'lead_first' for update;
  if not found then raise exception 'Reach-out not found.' using errcode = 'P0002'; end if;
  with recursive c as (
    select id from public.playbooks where id = p_root_id
    union all
    select p.id from public.playbooks p join c on p.after_playbook_id = c.id
  )
  select array_agg(id) into v_steps from c;
  -- Held against a claim while it is judged: a claim waits, or finds the chain gone.
  perform 1 from public.reach_out_sends s where s.root_id = p_root_id for update;
  if exists (select 1 from public.reach_out_sends s
              where s.root_id = p_root_id and s.state in ('claimed', 'queued', 'sent', 'failed')) then
    raise exception 'This reach-out has written already. Pause it instead.' using errcode = '23503';
  end if;
  update public.broadcasts set state = 'canceled'
   where tenant_id = p_tenant_id and audience->>'kind' = 'reach_out' and audience->>'root_id' = p_root_id::text
     and state in ('pending_approval', 'scheduled', 'sending');
  update public.templates set hidden_at = coalesce(hidden_at, now())
   where id in (select p.template_id from public.playbooks p where p.id = any (v_steps));
  delete from public.playbooks where id = p_root_id;
  return jsonb_build_object('root_id', p_root_id, 'removed', cardinality(v_steps));
end $$;
revoke execute on function public.reach_out_remove(uuid, uuid) from public, anon;
grant execute on function public.reach_out_remove(uuid, uuid) to authenticated, service_role;

/* ---------------------------------------------------------------- a search's reach -- */

create or replace function public.reach_out_reach(p_tenant_id uuid, p_search_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not exists (
       select 1 from public.memberships m where m.tenant_id = p_tenant_id and m.user_id = auth.uid()) then
    raise exception 'Workspace not found.' using errcode = 'P0002';
  end if;
  return jsonb_build_object(
    'ready', (select count(*) from public.reach_out_audience(p_tenant_id, p_search_id, 5000, false)),
    'with_unconfirmed', (select count(*) from public.reach_out_audience(p_tenant_id, p_search_id, 5000, true)),
    'phone_only', (select count(*) from public.lead_search_members sm
                     join public.leads l on l.id = sm.lead_id and l.tenant_id = sm.tenant_id
                    where sm.tenant_id = p_tenant_id and sm.search_id = p_search_id
                      and sm.class = 'qualified' and sm.counted and sm.blanked_at is null
                      and l.stage = 'ready' and l.erased_at is null and l.blanked_at is null
                      and (nullif(btrim(l.email), '') is null or l.email_state in ('none', 'invalid'))
                      and l.phone_e164 is not null),
    'of', (select count(*) from public.lead_search_members sm
            where sm.tenant_id = p_tenant_id and sm.search_id = p_search_id
              and sm.class = 'qualified' and sm.counted and sm.blanked_at is null),
    'chain', (select p.id from public.playbooks p
               where p.tenant_id = p_tenant_id and p.lead_search_id = p_search_id and p.kind = 'reach_out'));
end $$;
revoke execute on function public.reach_out_reach(uuid, uuid) from public, anon;
grant execute on function public.reach_out_reach(uuid, uuid) to authenticated, service_role;

/* ---------------------------------------------------------------- a send's answer -- */

-- An acting member's answer to a held (or planned) send of a live run:
--   include    sent as it reads, and never held for that reason again (R7); refused for a hold the check could not
--              answer (there is nothing to send), and past the fortnight a send has (R10);
--   rewrite    its opening written again: the one reset (reach_out_recheck);
--   skip       not sent, owner_skipped;
--   not_a_fit  its lead set aside as not a fit (the lead's own door, lead_set_stage) and the send skipped, in one
--              transaction (R18).
create or replace function public.reach_out_send_decide(p_send_id uuid, p_decision text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_send public.reach_out_sends%rowtype;
  v_run  text;
begin
  if auth.uid() is null then raise exception 'Sign in required.' using errcode = '28000'; end if;
  select * into v_send from public.reach_out_sends where id = p_send_id for update;
  if not found or not public.is_acting_member(v_send.tenant_id) then
    raise exception 'Email not found.' using errcode = 'P0002';
  end if;
  select state into v_run from public.broadcasts where id = v_send.broadcast_id;
  if v_run is null or v_run not in ('pending_approval', 'scheduled', 'sending') then
    raise exception 'That run is over.' using errcode = '22023';
  end if;
  if v_send.state not in ('held', 'planned') then
    raise exception 'That email has gone.' using errcode = '22023';
  end if;
  case p_decision
    when 'include' then
      if v_send.state <> 'held' or v_send.reason = 'check_unavailable' then
        raise exception 'Only an email the check held for a reason is included.' using errcode = '22023';
      end if;
      if public.reach_out_given_up(v_send.created_at) then
        raise exception 'This email waited two weeks for your answer and was given up.' using errcode = '22023';
      end if;
      update public.reach_out_sends
         set state = 'planned', reason = null, hold_detail = null,
             included_for = array(select distinct x from unnest(included_for || v_send.reason) x order by x)
       where id = p_send_id;
    when 'rewrite' then
      if public.reach_out_given_up(v_send.created_at) then
        raise exception 'This email waited two weeks for your answer and was given up.' using errcode = '22023';
      end if;
      perform public.reach_out_recheck(array[p_send_id], v_send.tenant_id);
    when 'skip' then
      update public.reach_out_sends set state = 'skipped', reason = 'owner_skipped' where id = p_send_id;
    when 'not_a_fit' then
      perform public.lead_set_stage(v_send.lead_id, 'archived', 'not_a_fit',
                                    case when v_send.reason = 'chain' then 'chain' else 'other' end);
      update public.reach_out_sends set state = 'skipped', reason = 'not_a_fit' where id = p_send_id;
    else
      raise exception 'Include, rewrite, skip or not a fit.' using errcode = '22023';
  end case;
  return jsonb_build_object('send_id', p_send_id, 'decision', p_decision);
end $$;
revoke execute on function public.reach_out_send_decide(uuid, text) from public, anon;
grant execute on function public.reach_out_send_decide(uuid, text) to authenticated, service_role;

-- Every hold of a live run the check could not answer, back to be checked in one call (R18): two hundred holds are
-- never two hundred clicks. The holds the hourly release takes, no more: an opening that broke a rule (a detail) is
-- its owner's Rewrite, one at a time. An acting member's.
create or replace function public.reach_out_run_recheck(p_broadcast_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant uuid;
  v_state  text;
begin
  if auth.uid() is null then raise exception 'Sign in required.' using errcode = '28000'; end if;
  select tenant_id, state into v_tenant, v_state from public.broadcasts
   where id = p_broadcast_id and audience->>'kind' = 'reach_out';
  if not found or not public.is_acting_member(v_tenant) then
    raise exception 'Run not found.' using errcode = 'P0002';
  end if;
  if v_state not in ('pending_approval', 'scheduled', 'sending') then
    raise exception 'That run is over.' using errcode = '22023';
  end if;
  return jsonb_build_object('broadcast_id', p_broadcast_id, 'rechecked', public.reach_out_recheck(array(
    select s.id from public.reach_out_sends s
     where s.broadcast_id = p_broadcast_id and s.state = 'held' and s.reason = 'check_unavailable'
       and s.hold_detail is null), v_tenant));
end $$;
revoke execute on function public.reach_out_run_recheck(uuid) from public, anon;
grant execute on function public.reach_out_run_recheck(uuid) to authenticated, service_role;

/* ---------------------------------------------------------------- a chain's report -- */

-- How each step of a chain is doing (R23), read when its row is opened:
--   written    sends that left;
--   delivered  of them, their email delivered or read;
--   bounced    their email failed with the provider's bounce (00184's reading of a bounce);
--   wrote_back, said_no  distinct leads, each counted once, at the last step that wrote to them before they did: the
--              send door writes to nobody after either (contracts outreachRefusalOf), so it is the one they answered.
--              Wrote back is the send door's own reading (outreach_wrote_back, asked once for the chain's leads);
--   waiting    planned, claimed or queued; held, waiting for the owner.
-- And the chain's last runs, and whether it may still be removed (R16: nothing of it has been written).
create or replace function public.reach_out_chain_report(p_tenant_id uuid, p_root_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not exists (
       select 1 from public.memberships m where m.tenant_id = p_tenant_id and m.user_id = auth.uid()) then
    raise exception 'Workspace not found.' using errcode = 'P0002';
  end if;
  if not exists (select 1 from public.playbooks p
                  where p.id = p_root_id and p.tenant_id = p_tenant_id and p.kind = 'reach_out'
                    and p.trigger = 'lead_first') then
    raise exception 'Reach-out not found.' using errcode = 'P0002';
  end if;
  return (
    with recursive c as (
      select p.id, 0 as n from public.playbooks p where p.id = p_root_id
      union all
      select p.id, c.n + 1 from public.playbooks p join c on p.after_playbook_id = c.id
    ),
    -- Each lead's last send that left, in this chain: where its answer is counted.
    last_sent as (
      select distinct on (s.lead_id) s.lead_id, s.playbook_id, s.contact_id, l.email, l.closed_reason
        from public.reach_out_sends s
        join public.leads l on l.id = s.lead_id and l.tenant_id = s.tenant_id
       where s.root_id = p_root_id and s.tenant_id = p_tenant_id and s.state = 'sent'
       order by s.lead_id, s.sent_at desc
    ),
    -- Who of them wrote back, asked once for all (the send door's own reading).
    wrote as (
      select w.contact_id from public.outreach_wrote_back(p_tenant_id, array(
        select ls.contact_id from last_sent ls where ls.contact_id is not null)) w(contact_id)
    ),
    answered as (
      select ls.playbook_id,
             count(*) filter (where ls.contact_id in (select contact_id from wrote)) as wrote_back,
             count(*) filter (where ls.closed_reason = 'said_no') as said_no
        from last_sent ls
       group by ls.playbook_id
    )
    select jsonb_build_object(
      'steps', coalesce((select jsonb_agg(jsonb_build_object(
        'id', c.id,
        'n', c.n,
        'written', (select count(*) from public.reach_out_sends s where s.playbook_id = c.id and s.state = 'sent'),
        'delivered', (select count(*) from public.reach_out_sends s join public.messages m on m.id = s.message_id
                       where s.playbook_id = c.id and s.state = 'sent' and m.status in ('delivered', 'read')),
        'bounced', (select count(*) from public.reach_out_sends s join public.messages m on m.id = s.message_id
                     where s.playbook_id = c.id and m.status = 'failed' and m.error->>'provider' = 'bounced'),
        'wrote_back', coalesce((select a.wrote_back from answered a where a.playbook_id = c.id), 0),
        'said_no', coalesce((select a.said_no from answered a where a.playbook_id = c.id), 0),
        'waiting', (select count(*) from public.reach_out_sends s
                     where s.playbook_id = c.id and s.state in ('planned', 'claimed', 'queued')),
        'held', (select count(*) from public.reach_out_sends s where s.playbook_id = c.id and s.state = 'held'))
        order by c.n) from c), '[]'::jsonb),
      'runs', coalesce((select jsonb_agg(r order by r->>'run_for' desc) from (
        select jsonb_build_object('id', b.id, 'step_id', b.playbook_id, 'run_for', b.run_for, 'state', b.state,
                                  'planned', b.recipient_count,
                                  'written', (select count(*) from public.reach_out_sends s
                                               where s.broadcast_id = b.id and s.state = 'sent'),
                                  'held', (select count(*) from public.reach_out_sends s
                                            where s.broadcast_id = b.id and s.state = 'held')) as r
          from public.broadcasts b
         where b.tenant_id = p_tenant_id and b.audience->>'kind' = 'reach_out'
           and b.audience->>'root_id' = p_root_id::text
         order by b.run_for desc
         limit 5) x), '[]'::jsonb),
      'can_remove', not exists (select 1 from public.reach_out_sends s
                                 where s.root_id = p_root_id and s.state in ('claimed', 'queued', 'sent', 'failed')))
  );
end $$;
revoke execute on function public.reach_out_chain_report(uuid, uuid) from public, anon;
grant execute on function public.reach_out_chain_report(uuid, uuid) to authenticated, service_role;

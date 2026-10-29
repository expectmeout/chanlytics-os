-- 00491 · A cold email ends as its sequence says (decision 0077).
--
-- A sequence to leads chooses how its emails end, and the doors that make and save one say it:
--   sequence_steps.signs_with   'name' (its Signed line, added under the words) or 'mailbox' (its mailbox's own
--                               signature, never on a first email when that signature carries a link: the edge's
--                               coldEndingOf). Read on a sequence's first step, as signed_by and owner_sends are. Every
--                               sequence there is takes 'name'.
--   reach_out_save              as 00472 wrote it, but for signs_with: written where the body names it, kept where it
--                               does not, so a client from before this cannot unset a choice it never showed.
--   sequence_create_leads       as 00465 wrote it, but for two things in a new sequence's chain: its mailboxes are the
--                               connected ones whose SPF and DKIM are not missing (every connected one where none is),
--                               and its first pace is 20 minutes, the contracts' REACH_OUT_GAP_FIRST (it was 12).
--
-- Deploy order: this first, then either app. The edge reads signs_with as it sends, so it must be here before an edge
-- that reads it; a dashboard from before this saves no key, and the column keeps what it holds. Re-runnable.

set local lock_timeout = '3s';
do $$
begin
  raise notice 'lock_timeout for this migration: %', current_setting('lock_timeout');
  if current_setting('lock_timeout') <> '3s' then
    raise warning 'this file was applied outside a transaction, so SET LOCAL did nothing: run it inside begin/commit, or set lock_timeout yourself before it';
  end if;
end $$;

/* ------------------------------------------------------------------------------------------------- 1. the column -- */
alter table public.sequence_steps add column if not exists signs_with text not null default 'name';
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'sequence_steps_signs_with_shape') then
    alter table public.sequence_steps add constraint sequence_steps_signs_with_shape
      check (signs_with in ('name', 'mailbox'));
  end if;
end $$;
comment on column public.sequence_steps.signs_with is
  'How a sequence to leads ends its emails (00491, decision 0077), read on its first step: ''name'', its Signed line (signed_by) under the words, unless their last line names it; ''mailbox'', its mailbox''s own signature, except on a first email when that signature carries a link, which then ends with the name. Written by reach_out_save; members have no grant on it.';

/* ------------------------------------------------------------------------------------------- 2. reach_out_save -- */
-- reach_out_save, as 00472_the_cold_lane_s_own_sending_domains_go.sql wrote it, but for signs_with.
create or replace function public.reach_out_save(p_tenant_id uuid, p_user_id uuid, p_chain jsonb)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $$
declare
  v_root     uuid := nullif(p_chain->>'root_id', '')::uuid;
  v_search   uuid := nullif(p_chain->>'search_id', '')::uuid;
  v_name     text := btrim(coalesce(p_chain->>'name', ''));
  v_gap      int := (p_chain->>'gap_minutes')::int;
  v_signed   text := nullif(btrim(coalesce(p_chain->>'signed_by', '')), '');
  v_unconf   boolean := coalesce((p_chain->>'include_unconfirmed')::boolean, false);
  v_owner    boolean := coalesce((p_chain->>'owner_sends')::boolean, false);
  -- How its emails end (00491, decision 0077): only a body that names it changes it.
  v_signs    text := case p_chain->>'signs_with' when 'mailbox' then 'mailbox' when 'name' then 'name' end;
  v_mailboxes uuid[] := coalesce(
               array(select x::uuid from jsonb_array_elements_text(coalesce(p_chain->'mailbox_ids', '[]'::jsonb)) x), '{}');
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
  v_hand     jsonb;
  v_was_hand jsonb;
  v_ids      uuid[] := '{}';
  v_changed  uuid[] := '{}';
  v_reset    int := 0;
  v_source   uuid;
begin
  -- Who may: the one table of permissions (00201 has_permission's approve, a playbook's own: owner, operator, partner).
  if p_tenant_id is null or p_user_id is null or not public.has_permission(p_user_id, p_tenant_id, 'approve') then
    raise exception 'Workspace not found.' using errcode = 'P0002';
  end if;
  if v_n < 1 then raise exception 'A reach-out has at least one email.' using errcode = '22023'; end if;
  -- A call or a note is the last step, and never the first: the chain writes before it hands anyone over.
  for v_i in 0 .. v_n - 1 loop
    if v_steps->v_i ? 'hand' and (v_i = 0 or v_i < v_n - 1) then
      raise exception 'A call or a note ends the chain.' using errcode = '22023';
    end if;
  end loop;
  -- The mailboxes it writes from are this workspace's, and not removed (00423).
  if exists (select 1 from unnest(v_mailboxes) b
              where not exists (select 1 from public.mailbox_connections c
                                 where c.id = b and c.tenant_id = p_tenant_id and c.state <> 'removed')) then
    raise exception 'Mailbox not found.' using errcode = 'P0002';
  end if;

  if v_root is null then
    if not exists (select 1 from public.lead_searches s
                    where s.id = v_search and s.tenant_id = p_tenant_id and s.removed_at is null) then
      raise exception 'Search not found.' using errcode = 'P0002';
    end if;
    -- Made on a finder search (00459): a list of its own, drawing from that search, so it takes the leads you add too.
    if exists (select 1 from public.lead_searches s where s.id = v_search and s.via not in ('chosen', 'import')) then
      if exists (select 1 from public.sequence_steps r where r.source_search_id = v_search) then
        raise exception 'This search has a reach-out already.' using errcode = '23505';
      end if;
      v_source := v_search;
      v_search := public.reach_out_list_for(p_tenant_id, v_name, p_user_id);
    end if;
  else
    select lead_search_id, signed_by into v_search, v_signed_was from public.sequence_steps
     where id = v_root and tenant_id = p_tenant_id and kind = 'reach_out' and trigger = 'lead_first'
       for update;
    if not found then raise exception 'Reach-out not found.' using errcode = 'P0002'; end if;
    -- The chain as it stands, root first.
    with recursive c as (
      select id, 0 as n from public.sequence_steps where id = v_root
      union all
      select p.id, c.n + 1 from public.sequence_steps p join c on p.after_step_id = c.id
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

  -- A step dropped from the end takes its work with it (R17): its live runs canceled, its planned, held and drafted
  -- sends skipped, step_removed, then its row. One that wrote, or handed anyone to the team, keeps its history: its
  -- owner pauses the chain instead.
  if coalesce(cardinality(v_existing), 0) > v_n then
    v_dropped := v_existing[v_n + 1:];
    -- Held against a claim while it is judged: a claim waits, or finds them skipped.
    perform 1 from public.sequence_sends s where s.lead_id is not null and ( s.step_id = any (v_dropped)) for update;
    if exists (select 1 from public.sequence_sends s
                where s.lead_id is not null and ( s.step_id = any (v_dropped) and s.state in ('claimed', 'queued', 'sent', 'failed', 'handed'))) then
      raise exception 'That step has written already. Pause the reach-out instead.' using errcode = '23503';
    end if;
    update public.sequence_batches set state = 'canceled'
     where tenant_id = p_tenant_id and step_id = any (v_dropped)
       and state in ('pending_approval', 'scheduled', 'sending');
    update public.sequence_sends set state = 'skipped', reason = 'step_removed'
     where sequence_sends.lead_id is not null and ( step_id = any (v_dropped) and state in ('planned', 'held', 'drafted'));
    -- Their words stay on file (a run of theirs names them: broadcasts.template_id), hidden from Templates.
    update public.templates set hidden_at = coalesce(hidden_at, now())
     where id in (select p.template_id from public.sequence_steps p where p.id = any (v_dropped));
    -- The first step dropped takes the ones after it (after_step_id cascades).
    delete from public.sequence_steps where id = v_dropped[1];
  end if;

  for v_i in 0 .. v_n - 1 loop
    v_step := v_steps->v_i;
    v_id := nullif(v_step->>'id', '')::uuid;
    v_hand := case when v_step ? 'hand'
                then jsonb_build_object('kind', v_step->'hand'->>'kind', 'words', btrim(coalesce(v_step->'hand'->>'words', '')))
              end;
    v_subject := case when v_i = 0 then btrim(coalesce(v_step->>'subject', '')) end;
    v_body := btrim(coalesce(v_step->>'body', ''));
    v_parts := case when v_i = 0
                 then jsonb_build_array(jsonb_build_object('type', 'HEADER', 'format', 'TEXT', 'text', v_subject),
                                        jsonb_build_object('type', 'BODY', 'text', v_body))
                 else jsonb_build_array(jsonb_build_object('type', 'BODY', 'text', v_body)) end;
    v_label := case
                 when v_hand is not null then case v_hand->>'kind' when 'call' then 'a call' else 'a note' end
                 when v_i = 0 then 'your email' when v_i = 1 then 'a nudge' else 'email ' || (v_i + 1) end;

    if v_id is null then
      v_id := gen_random_uuid();
      if v_hand is null then
        insert into public.templates (tenant_id, channel, source, name, language, category, meta_status, components,
                                      body_preview, title, created_by)
        values (p_tenant_id, 'email', 'chanlytics', 'reach_out_' || replace(v_id::text, '-', ''), 'en', 'marketing',
                'approved', v_parts, left(v_body, 1024),
                left(left(v_name, 60 - char_length(v_label) - 3) || ' · ' || v_label, 60), p_user_id)
        returning id into v_template;
      end if;
      insert into public.sequence_steps (id, tenant_id, kind, name, trigger, policy_class, lead_search_id, after_step_id,
                                    after_days, gap_minutes, mailbox_ids, owner_sends, signed_by, include_unconfirmed,
                                    template_id, template_name, template_language, hand, params, run_hour, cap_per_run,
                                    state, created_by, signs_with)
      values (v_id, p_tenant_id, 'reach_out',
              case when v_i = 0 then v_name else left(v_name, 80 - char_length(v_label) - 3) || ' · ' || v_label end,
              case when v_i = 0 then 'lead_first' else 'after_step' end, 'outreach',
              case when v_i = 0 then v_search end, case when v_i > 0 then v_prev end,
              case when v_i > 0 then (v_step->>'after_days')::int end, v_gap, v_mailboxes, v_i = 0 and v_owner,
              case when v_i = 0 then v_signed end, v_i = 0 and v_unconf,
              case when v_hand is null then v_template end,
              case when v_hand is null then 'reach_out_' || replace(v_id::text, '-', '') end,
              case when v_hand is null then 'en' end,
              v_hand, '[]'::jsonb, 9, 200, 'running', p_user_id, coalesce(v_signs, 'name'));
    else
      select template_id, hand into v_template, v_was_hand from public.sequence_steps where id = v_id;
      -- A step keeps what it is once it has run: an email that wrote, or a hand that handed, is itself for good.
      if (v_was_hand is null) <> (v_hand is null) then
        if exists (select 1 from public.sequence_sends s where s.lead_id is not null and ( s.step_id = v_id)) then
          raise exception 'That step has run already. Add a new step instead.' using errcode = '23503';
        end if;
        if v_hand is null then
          insert into public.templates (tenant_id, channel, source, name, language, category, meta_status, components,
                                        body_preview, title, created_by)
          values (p_tenant_id, 'email', 'chanlytics', 'reach_out_' || replace(v_id::text, '-', ''), 'en', 'marketing',
                  'approved', v_parts, left(v_body, 1024),
                  left(left(v_name, 60 - char_length(v_label) - 3) || ' · ' || v_label, 60), p_user_id)
          returning id into v_template;
          update public.sequence_steps
             set hand = null, template_id = v_template, template_name = 'reach_out_' || replace(v_id::text, '-', ''),
                 template_language = 'en'
           where id = v_id;
        else
          update public.templates set hidden_at = coalesce(hidden_at, now()) where id = v_template;
          update public.sequence_steps
             set template_id = null, template_name = null, template_language = null, hand = v_hand
           where id = v_id;
          v_template := null;
        end if;
      elsif v_hand is not null then
        update public.sequence_steps set hand = v_hand where id = v_id and hand is distinct from v_hand;
      -- New words: what is planned or held for this step is checked again against them (R5).
      elsif (select components from public.templates where id = v_template) is distinct from v_parts then
        update public.templates set components = v_parts, body_preview = left(v_body, 1024) where id = v_template;
        v_changed := v_changed || v_id;
      end if;
      -- A new name for the chain is its words' new title in Templates too.
      if v_template is not null then
        update public.templates set title = left(left(v_name, 60 - char_length(v_label) - 3) || ' · ' || v_label, 60)
         where id = v_template
           and title is distinct from left(left(v_name, 60 - char_length(v_label) - 3) || ' · ' || v_label, 60);
      end if;
      update public.sequence_steps
         set name = case when v_i = 0 then v_name else left(v_name, 80 - char_length(v_label) - 3) || ' · ' || v_label end,
             gap_minutes = v_gap, mailbox_ids = v_mailboxes,
             owner_sends = v_i = 0 and v_owner,
             after_days = case when v_i > 0 then (v_step->>'after_days')::int end,
             signed_by = case when v_i = 0 then v_signed end,
             signs_with = case when v_i = 0 then coalesce(v_signs, signs_with) else 'name' end,
             include_unconfirmed = v_i = 0 and v_unconf
       where id = v_id;
    end if;
    v_prev := v_id;
    v_ids := v_ids || v_id;
  end loop;

  if v_source is not null then
    update public.sequence_steps set source_search_id = v_source where id = v_ids[1];
  end if;
  -- A new name to sign with changes every step's words as a business reads them.
  if v_root is not null and v_signed is distinct from v_signed_was then v_changed := v_ids; end if;
  if cardinality(v_changed) > 0 then
    v_reset := public.reach_out_recheck(array(
      select s.id from public.sequence_sends s
       where s.lead_id is not null and ( s.tenant_id = p_tenant_id and s.step_id = any (v_changed) and s.state in ('planned', 'held'))),
      p_tenant_id);
  end if;

  return jsonb_build_object('root_id', v_ids[1], 'step_ids', to_jsonb(v_ids), 'rechecked', v_reset);
exception
  when unique_violation then
    raise exception 'This search has a reach-out already.' using errcode = '23505';
end $$;

/* ---------------------------------------------------------------------------------- 3. sequence_create_leads -- */
-- sequence_create_leads, as 00465_one_new_for_every_sequence.sql wrote it, but for its mailboxes and its first pace.
create or replace function public.sequence_create_leads(p_tenant_id uuid, p_first jsonb, p_start boolean, p_decision jsonb,
                                                         p_via text, p_undo_of uuid)
returns jsonb
language plpgsql security definer
set search_path to 'public'
as $$
declare
  v_actor   uuid := auth.uid();
  v_name    text := left(btrim(coalesce(p_first->>'name', '')), 80);
  v_from    uuid := nullif(p_first->>'from', '')::uuid;
  v_list    uuid := nullif(p_first->>'list_id', '')::uuid;
  v_source  uuid := nullif(p_first->>'source_search_id', '')::uuid;
  v_aim     uuid := nullif(p_first->>'aim_search_id', '')::uuid;
  v_search  uuid := nullif(p_first->>'search_id', '')::uuid;
  v_leads   uuid[] := coalesce(array(select x::uuid from jsonb_array_elements_text(coalesce(p_first->'lead_ids', '[]'::jsonb)) x), '{}');
  v_boxes   uuid[];
  v_chain   jsonb;
  v_made    jsonb;
  v_saved   jsonb;
  v_root    uuid;
  v_n       int;
  v_counted int := 0;
  v_left    jsonb := '{}'::jsonb;
begin
  if v_actor is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  if p_tenant_id is null or not public.has_permission(v_actor, p_tenant_id, 'approve') then
    raise exception 'Workspace not found.' using errcode = 'P0002';
  end if;
  if char_length(v_name) = 0 then
    raise exception 'A sequence is named.' using errcode = '22023';
  end if;
  if v_source is not null and exists (select 1 from public.sequence_steps r where r.source_search_id = v_source) then
    raise exception 'Another sequence adds from that search already.' using errcode = '23505';
  end if;
  if v_from is not null then
    v_chain := public.reach_out_chain_of(p_tenant_id, v_from);
    if v_chain is null then
      raise exception 'Sequence not found.' using errcode = 'P0002';
    end if;
  else
    -- Sent from the workspace's connected mailboxes whose SPF and DKIM are not missing (00491, decision 0077), else from
    -- every connected one; with none, or where New said so, handed to the owner to send from their own inbox (00465).
    select coalesce(array_agg(c.id order by c.created_at), '{}') into v_boxes
      from public.mailbox_connections c
     where c.tenant_id = p_tenant_id and c.state = 'connected'
       and coalesce(c.dns->>'spf', '') <> 'missing' and coalesce(c.dns->>'dkim', '') <> 'missing';
    if cardinality(v_boxes) = 0 then
      select coalesce(array_agg(c.id order by c.created_at), '{}') into v_boxes
        from public.mailbox_connections c where c.tenant_id = p_tenant_id and c.state = 'connected';
    end if;
    v_chain := jsonb_build_object(
      'gap_minutes', 20,
      'mailbox_ids', to_jsonb(v_boxes),
      'owner_sends', cardinality(v_boxes) = 0 or coalesce((p_first->>'owner_sends')::boolean, false),
      'steps', case when jsonb_typeof(p_first->'steps') = 'array' and jsonb_array_length(p_first->'steps') > 0
                    then p_first->'steps'
                    else jsonb_build_array(jsonb_build_object('subject', '', 'body', '')) end);
  end if;
  -- A search's ready leads, copied to its list where it does not add from the search (00465): each the search counted
  -- and qualified, not taken out, not put off.
  if v_list is null and cardinality(v_leads) = 0 and v_search is not null and v_source is null then
    v_leads := coalesce(array(
      select m.lead_id from public.lead_search_members m
        join public.lead_searches s on s.id = m.search_id
       where m.search_id = v_search and s.tenant_id = p_tenant_id and s.removed_at is null
         and m.class = 'qualified' and m.counted and m.blanked_at is null and m.later_at is null
       order by m.lead_id), '{}');
  end if;
  if v_list is null then
    if cardinality(v_leads) > 0 then
      v_made := public.lead_search_choose(p_tenant_id, v_name, v_leads);
      if v_made ? 'error' then
        raise exception '%', v_made->>'sentence' using errcode = '22023';
      end if;
      v_list := (v_made->>'search_id')::uuid;
      v_counted := coalesce((v_made->>'counted')::int, 0);
      v_left := coalesce(v_made->'left_out', '{}'::jsonb);
    else
      v_list := public.reach_out_list_for(p_tenant_id, v_name, v_actor);
    end if;
  elsif not exists (select 1 from public.lead_searches s where s.id = v_list and s.tenant_id = p_tenant_id
                       and s.removed_at is null and s.via in ('chosen', 'import')) then
    raise exception 'List not found.' using errcode = 'P0002';
  end if;
  v_saved := public.reach_out_save(p_tenant_id, v_actor,
               v_chain || jsonb_build_object('search_id', v_list, 'name', v_name));
  v_root := (v_saved->>'root_id')::uuid;
  v_n := jsonb_array_length(v_saved->'step_ids');
  update public.sequence_steps
     set state = case when p_start then 'running' else 'paused' end, source_search_id = v_source
   where id = v_root;
  if not p_start then
    update public.sequences set state = 'draft' where id = v_root;
  end if;
  -- How its batches are decided, where New chose (00465): never on its own, which the table refuses.
  if p_first->>'mode' in ('veto', 'ask') then
    update public.sequences set mode = p_first->>'mode' where id = v_root;
  end if;
  if v_aim is not null then
    update public.lead_searches set adds_to = v_root
     where id = v_aim and tenant_id = p_tenant_id and removed_at is null;
  end if;
  return jsonb_build_object('id', v_root, 'steps', v_n, 'state', case when p_start then 'on' else 'draft' end,
                            'list_id', v_list, 'added', v_counted, 'left_out', v_left)
    || public.team_decision(p_tenant_id, v_actor, 'sequence', v_root, 'make_sequence',
         coalesce(p_decision, '{}'::jsonb) || jsonb_build_object('steps', v_n, 'started', p_start, 'starts', 'leads'),
         p_via, p_undo_of);
end $$;

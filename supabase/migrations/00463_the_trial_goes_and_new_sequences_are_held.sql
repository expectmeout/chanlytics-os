-- 00463 · A sequence is approved once, then held (decision 0064: the contract half, applied after the merge's deploys).
--
-- What 00462 left for both apps to stop reading, and the defaults the decision moves:
--
--   policies                     Win-backs, offers and follow-ups start new sequences held for a stop (veto): every
--                                workspace's row that still says ask moves, and a Never (no longer a mode a sequence
--                                takes: one is paused on its page) becomes ask. Ruben's word of 19 Oct 2026 for the live
--                                workspaces; none had approved a batch.
--   sequences                    Each of those classes' sequences that still goes as 00462 found it (ask, never changed
--                                by a member since) follows its row to veto. Its first batch, and any batch of new words,
--                                still waits for an OK (sequence_steps.words_ok_at).
--   provision_tenant             A new workspace's rows for those three classes start at veto.
--   change_playbook              Takes no trial_until: nine keys.
--   start_playbook               Writes none.
--   sequence_step_save           Copies none to a new step.
--   sequence_steps.trial_until   Dropped: a sequence's first batch's OK is the trial.
--
-- Deploy order: after the merge's deploys, as 00460 was (both apps stopped naming trial_until in that merge). Re-runnable.

set local lock_timeout = '3s';
do $$
begin
  raise notice 'lock_timeout for this migration: %', current_setting('lock_timeout');
  if current_setting('lock_timeout') <> '3s' then
    raise warning 'this file was applied outside a transaction, so SET LOCAL did nothing: run it inside begin/commit, or set lock_timeout yourself before it';
  end if;
end $$;

/* --------------------------------------------------------------------------------------------- 1. the defaults -- */

-- The sequences of the three classes that still go as 00462 found them follow their row: ask, and no member's change of
-- their mode since (a change_playbook line naming mode on the first step, whose id is the sequence's).
update public.sequences q
   set mode = 'veto'
  from public.sequence_steps st
 where st.id = q.id
   and st.tenant_id = q.tenant_id
   and q.mode = 'ask'
   and st.kind = 'moment'
   and st.policy_class in ('reengage', 'campaign', 'follow_up')
   and exists (
     select 1 from public.policies p
      where p.tenant_id = q.tenant_id and p.class = st.policy_class and p.subject_type is null
        and p.mode in ('ask', 'never')
   )
   and not exists (
     select 1 from public.decisions d
      where d.tenant_id = q.tenant_id and d.subject_type = 'playbook' and d.subject_id = q.id
        and d.verb = 'change_playbook' and d.payload ? 'mode'
   );

update public.policies
   set mode = 'veto'
 where subject_type is null
   and class in ('reengage', 'campaign', 'follow_up')
   and mode = 'ask';

update public.policies
   set mode = 'ask'
 where subject_type is null
   and class in ('reengage', 'campaign', 'follow_up', 'outreach')
   and mode = 'never';

create or replace function public.provision_tenant(p_tenant_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.policies (tenant_id, class, mode, limits)
  select p_tenant_id, c.class, c.mode,
         case when c.class = 'reply'
              then '{"max_replies_day": 20, "pause_hours": 24, "max_llm_tokens_day": 1000000}'::jsonb
              else '{}'::jsonb end
  from (values
    ('faq','auto'), ('booking','auto'), ('reply','auto'),
    ('reengage','veto'), ('campaign','veto'), ('reviews','ask'), ('money','never'), ('follow_up','veto'),
    ('outreach','veto')
  ) as c(class, mode)
  on conflict (tenant_id, class, subject_type, subject_id) do nothing;

  insert into public.tenant_config (tenant_id) values (p_tenant_id)
  on conflict (tenant_id) do nothing;

  insert into public.billing_accounts (tenant_id, mode, status) values (p_tenant_id, 'stripe', 'none')
  on conflict (tenant_id) do nothing;
end $$;

/* -------------------------------------------------------------------------------------------- 2. the doors -- */

create or replace function public.change_playbook(p_tenant_id uuid, p_playbook_id uuid, p_set jsonb, p_decision jsonb DEFAULT '{}'::jsonb, p_via text DEFAULT NULL::text, p_undo_of uuid DEFAULT NULL::uuid)
 returns jsonb
 language plpgsql
 set search_path to 'public'
as $$
declare
  v_actor uuid := auth.uid();
  v_set   jsonb := case when jsonb_typeof(p_set) = 'object' then p_set else '{}'::jsonb end;
  v_was   public.sequence_steps;
  v_diff  jsonb;
  v_rows  integer;
  v_verb  text;
  v_mode  text;
  v_mode_was text;
  v_mode_moves boolean := false;
begin
  if v_actor is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  if p_tenant_id is null or p_playbook_id is null then
    raise exception 'change_playbook: a playbook is named by its workspace and its id' using errcode = '22004';
  end if;
  -- The nine keys a change may name, and nothing else: a key outside them is refused, never ignored. Eight are the step's
  -- columns; mode is its sequence's (0064). The trial is no key since 00463: a sequence's first batch's OK is it.
  if v_set = '{}'::jsonb or exists (
    select 1 from jsonb_object_keys(v_set) k
     where k not in ('state', 'name', 'run_hour', 'cap_per_run', 'gap_days', 'cadence_days', 'params', 'until',
                     'mode')
  ) then
    raise exception 'change_playbook: name what changes: state, name, run_hour, cap_per_run, gap_days, cadence_days, params, until or mode'
      using errcode = '22023';
  end if;
  -- A null is no value for the seven columns that are never empty, so it is refused, never read as "keep what it
  -- holds". The last day takes it: it clears it.
  if exists (select 1 from jsonb_each(v_set) e
              where jsonb_typeof(e.value) = 'null' and e.key <> 'until') then
    raise exception 'change_playbook: name a value for each column named: only until may be cleared'
      using errcode = '22023';
  end if;
  -- The message's slots are an array, as a run reads them; anything else is refused. What each element is (the slot
  -- specs the route builds) is core's to judge, so whatever a row holds is written back by an undo.
  if v_set ? 'params' and jsonb_typeof(v_set -> 'params') <> 'array' then
    raise exception 'change_playbook: params is the message''s slots, an array' using errcode = '22023';
  end if;
  -- How its batches are decided (0064): each asked, each held for a stop, or each sent. Its sequence's, never a step's.
  if v_set ? 'mode' then
    v_mode := v_set ->> 'mode';
    if v_mode is null or v_mode not in ('auto', 'veto', 'ask') then
      raise exception 'change_playbook: mode is auto, veto or ask' using errcode = '22023';
    end if;
    v_set := v_set - 'mode';
  end if;
  -- The last day in the spelling the row's own is read in (to_jsonb of the cast), so the same day written another way
  -- differs from nothing; a value that is no date is refused by its cast here (22007), before the lock.
  if v_set ? 'until' and jsonb_typeof(v_set -> 'until') <> 'null' then
    v_set := jsonb_set(v_set, '{until}', to_jsonb((v_set ->> 'until')::date));
  end if;
  -- The row as it stands, locked until the transaction ends, read on the caller's rights: a lock asks the update
  -- policy as well as the select policy, so another workspace's row, or one their seat may not change, is no row.
  select * into v_was
    from public.sequence_steps
   where id = p_playbook_id and tenant_id = p_tenant_id
   for update;
  if not found then
    raise exception 'Playbook not found.' using errcode = 'P0002';
  end if;
  -- The sequence's mode as it stands, locked too, on the caller's rights (the sequences' update policy). A one-off has
  -- none: pressing Send decided it. A sequence to leads never sends on its own.
  if v_mode is not null then
    select q.mode into v_mode_was
      from public.sequences q
     where q.id = v_was.sequence_id and q.tenant_id = p_tenant_id
       for update;
    if not found then
      raise exception 'Playbook not found.' using errcode = 'P0002';
    end if;
    if v_mode_was is null then
      raise exception 'A one-off goes as it was sent: it has no mode.' using errcode = '23514';
    end if;
    if v_mode = 'auto' and v_was.kind = 'reach_out' then
      raise exception 'A sequence to leads waits for your OK or holds each batch: it never sends on its own.'
        using errcode = '23514';
    end if;
    v_mode_moves := v_mode is distinct from v_mode_was;
  end if;
  -- What differs from the row as it stands, under the lock: only that is written, answered as `was` and recorded. Where
  -- nothing does, nothing is written and no line is (a second press of Pause, or two at once): the lock above has already
  -- asked the caller's rights, so a seat that may not change it is still told it is not there.
  select coalesce(jsonb_object_agg(k, v_set -> k), '{}'::jsonb) into v_diff
    from jsonb_object_keys(v_set) k
   where (to_jsonb(v_was) ->> k) is distinct from (v_set ->> k);
  if v_diff = '{}'::jsonb and not v_mode_moves then
    return jsonb_build_object('id', p_playbook_id, 'was', '{}'::jsonb, 'decision_id', null, 'undo_dropped', false);
  end if;
  if v_mode_moves then
    update public.sequences q set mode = v_mode where q.id = v_was.sequence_id and q.tenant_id = p_tenant_id;
    get diagnostics v_rows = row_count;
    if v_rows = 0 then
      raise exception 'Playbook not found.' using errcode = 'P0002';
    end if;
  end if;
  if v_diff <> '{}'::jsonb then
    update public.sequence_steps p
       set state        = coalesce(v_diff ->> 'state', p.state),
           name         = coalesce(v_diff ->> 'name', p.name),
           run_hour     = coalesce((v_diff ->> 'run_hour')::integer, p.run_hour),
           cap_per_run  = coalesce((v_diff ->> 'cap_per_run')::integer, p.cap_per_run),
           gap_days     = coalesce((v_diff ->> 'gap_days')::integer, p.gap_days),
           cadence_days = coalesce((v_diff ->> 'cadence_days')::integer, p.cadence_days),
           params       = coalesce(v_diff -> 'params', p.params),
           until        = case when v_diff ? 'until' then (v_diff ->> 'until')::date else p.until end
     where p.id = p_playbook_id and p.tenant_id = p_tenant_id;
    -- A forbidden update raises nothing: counted, so a change the policy refused is never answered as made.
    get diagnostics v_rows = row_count;
    if v_rows = 0 then
      raise exception 'Playbook not found.' using errcode = 'P0002';
    end if;
  end if;
  -- A sequence's settings are its first step's (0060; the loop review, 17 Oct 2026): a customer's steps after it run at
  -- its hour, under its cap and its last day, so a change here reaches all of them; one named as the first was
  -- takes its new name (a step given a name of its own keeps it). On the caller's rights, as the first step's row was.
  if v_diff <> '{}'::jsonb and v_was.id = v_was.sequence_id and v_was.kind = 'moment' then
    update public.sequence_steps n
       set run_hour = f.run_hour, cap_per_run = f.cap_per_run, until = f.until,
           name = case when n.name = v_was.name then f.name else n.name end
      from public.sequence_steps f
     where f.id = p_playbook_id and f.tenant_id = p_tenant_id
       and n.tenant_id = p_tenant_id and n.sequence_id = f.sequence_id and n.id <> f.id
       and n.kind = 'moment' and n.trigger = 'after_step'
       and (n.run_hour, n.cap_per_run, n.until, n.name)
           is distinct from (f.run_hour, f.cap_per_run, f.until,
                             case when n.name = v_was.name then f.name else n.name end);
  end if;
  -- The verb follows the state that moved, never the one named: a state named as it stands is in no diff.
  v_verb := case v_diff ->> 'state'
              when 'running' then 'start_playbook'
              when 'paused' then 'pause_playbook'
              else 'change_playbook'
            end;
  return jsonb_build_object(
           'id', p_playbook_id,
           'was', coalesce((select jsonb_object_agg(k, to_jsonb(v_was) -> k) from jsonb_object_keys(v_diff) k),
                           '{}'::jsonb)
                  || case when v_mode_moves then jsonb_build_object('mode', v_mode_was) else '{}'::jsonb end)
      || public.member_decision(p_tenant_id, 'playbook', p_playbook_id, v_verb, coalesce(p_decision, '{}'::jsonb),
                                p_via, p_undo_of);
end $$;

comment on function public.change_playbook(uuid, uuid, jsonb, jsonb, text, uuid) is
  'A member changes a playbook in place and its line in the ledger together (the change_playbook door): the row locked on the caller''s rights, of the columns p_set names (state, name, run_hour, cap_per_run, gap_days, cadence_days, params, until) only those that differ from the row written, and its sequence''s mode where p_set names mode (auto, veto or ask; none for a one-off, never auto to leads: 00462), then start_playbook or pause_playbook where the state moved, else change_playbook, as theirs (member_decision), in one transaction. A sequence''s first step''s hour, cap and last day reach its customer''s steps after it, and its name those named as it was (00453). A key outside the nine is refused (22023); so is a null, but for until, which it clears, and a params that is not an array. Security invoker: the update policies and the column grants judge it. P0002 where the caller cannot see or change the row. Returns id, was (what each written column held, and the mode), decision_id and undo_dropped; where nothing differs, nothing is written and no line (00377, 00416, 00453, 00462, 00463).';

create or replace function public.start_playbook(p_tenant_id uuid, p_playbook jsonb, p_decision jsonb DEFAULT '{}'::jsonb, p_via text DEFAULT NULL::text, p_undo_of uuid DEFAULT NULL::uuid)
 returns jsonb
 language plpgsql
 set search_path to 'public'
as $$
declare
  v_actor uuid := auth.uid();
  v_id    uuid;
begin
  if v_actor is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  if p_tenant_id is null or jsonb_typeof(p_playbook) is distinct from 'object' then
    raise exception 'start_playbook: a playbook is named whole' using errcode = '22004';
  end if;
  -- On the caller's rights: the table's insert policy judges the row (an acting member, as themselves, a moment, a
  -- list and a message of this workspace), and its checks and unique indexes refuse what they refuse. The workspace,
  -- who made it and that it runs are said here, never by the caller; `kind` is the table's default, a moment. Its last
  -- day is the caller's (00416), null where it names none. Its sequence's mode is made with it (00462 sequence_mode_for).
  insert into public.sequence_steps (tenant_id, name, trigger, list_id, list_key, template_id, template_name,
                                template_language, params, policy_class, state, run_hour, cap_per_run, gap_days,
                                cadence_days, channels, until, created_by)
  select p_tenant_id, r.name, r.trigger, r.list_id, r.list_key, r.template_id, r.template_name,
         r.template_language, r.params, r.policy_class, 'running', r.run_hour, r.cap_per_run, r.gap_days,
         r.cadence_days, r.channels, r.until, v_actor
    from jsonb_populate_record(null::public.sequence_steps, p_playbook) r
  returning id into v_id;
  return jsonb_build_object('id', v_id)
      || public.member_decision(p_tenant_id, 'playbook', v_id, 'start_playbook', p_decision, p_via, p_undo_of);
end $$;

comment on function public.start_playbook(uuid, jsonb, jsonb, text, uuid) is
  'A member starts a playbook and its line in the ledger together (00357): the row, running, then the start_playbook decision as theirs (member_decision), in one transaction. Security invoker: the insert is judged by the table''s own policy, checks and unique indexes, as the route''s insert was. Its last day (until) is written where p_playbook names it, null where it does not (00416); its sequence''s mode is made with it (00462). Returns id, decision_id and undo_dropped.';

create or replace function public.sequence_step_save(p_tenant_id uuid, p_sequence_id uuid, p_step jsonb,
                                                    p_decision jsonb default '{}'::jsonb, p_via text default null,
                                                    p_undo_of uuid default null)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_step jsonb := case when jsonb_typeof(p_step) = 'object' then p_step else '{}'::jsonb end;
  v_first public.sequence_steps%rowtype;
  v_last public.sequence_steps%rowtype;
  v_was public.sequence_steps%rowtype;
  v_t public.templates%rowtype;
  v_id uuid := nullif(v_step->>'id', '')::uuid;
  v_only text[] := coalesce(array(select jsonb_array_elements_text(v_step->'only_if')), '{}');
  v_channels text[] := array(select jsonb_array_elements_text(v_step->'channels'));
  v_out uuid;
  v_place int;
begin
  if v_actor is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  if p_tenant_id is null or not public.is_acting_member(p_tenant_id) then
    raise exception 'Workspace not found.' using errcode = 'P0002';
  end if;
  select * into v_first from public.sequence_steps
   where tenant_id = p_tenant_id and id = p_sequence_id for update;
  if v_first.id is null or v_first.kind <> 'moment' then
    raise exception 'Sequence not found.' using errcode = 'P0002';
  end if;
  if v_id is null then
    -- Its message is the workspace's own, named as the row names it, never as the body says.
    select * into v_t from public.templates
     where tenant_id = p_tenant_id and id = nullif(v_step->>'template_id', '')::uuid;
    if v_t.id is null then
      raise exception 'Message not found.' using errcode = 'P0002';
    end if;
    select * into v_last from public.sequence_steps
     where tenant_id = p_tenant_id and sequence_id = p_sequence_id order by place desc limit 1;
    insert into public.sequence_steps (tenant_id, kind, name, trigger, after_step_id, after_days, only_if, template_id,
                                       template_name, template_language, params, policy_class, state, run_hour,
                                       cap_per_run, until, channels, created_by)
    values (p_tenant_id, 'moment', coalesce(nullif(btrim(v_step->>'name'), ''), v_first.name), 'after_step', v_last.id,
            (v_step->>'after_days')::int, v_only, v_t.id, v_t.name, v_t.language,
            coalesce(v_step->'params', '[]'::jsonb), v_first.policy_class, 'running', v_first.run_hour,
            v_first.cap_per_run, v_first.until,
            coalesce(nullif(v_channels, '{}'), v_first.channels), v_actor)
    returning id, place into v_out, v_place;
  else
    select * into v_was from public.sequence_steps
     where tenant_id = p_tenant_id and sequence_id = p_sequence_id and id = v_id and id <> sequence_id for update;
    if v_was.id is null then
      raise exception 'Step not found.' using errcode = 'P0002';
    end if;
    update public.sequence_steps
       set after_days = coalesce((v_step->>'after_days')::int, after_days),
           only_if = case when v_step ? 'only_if' then v_only else only_if end,
           channels = coalesce(nullif(v_channels, '{}'), channels),
           name = coalesce(nullif(btrim(v_step->>'name'), ''), name),
           params = coalesce(v_step->'params', params)
     where id = v_id
    returning id, place into v_out, v_place;
  end if;
  return jsonb_build_object('id', v_out, 'place', v_place,
    'was', case when v_was.id is null then null else jsonb_build_object(
      'after_days', v_was.after_days, 'only_if', to_jsonb(v_was.only_if), 'channels', to_jsonb(v_was.channels),
      'name', v_was.name, 'params', v_was.params) end)
    || public.member_decision(p_tenant_id, 'sequence', p_sequence_id, 'change_step',
         coalesce(p_decision, '{}'::jsonb) || jsonb_build_object('step_id', v_out, 'added', v_was.id is null),
         p_via, p_undo_of);
end $$;

comment on function public.sequence_step_save(uuid, uuid, jsonb, jsonb, text, uuid) is
  'A customer''s step after the first (D6, 0060), added at the end of its sequence or changed (p_step.id): its wait (after_days), what must still hold (only_if), its message, channels and slots; a new one under the first step''s class, hour, cap and last day (00453), named as it unless given a name. On the member''s own rights (the steps'' policies and column grants); the change_step decision rides in the same transaction. Answers id, place, was and the decision''s.';

/* ----------------------------------------------------------------------------------------- 3. the column goes -- */

alter table public.sequence_steps drop column if exists trial_until;

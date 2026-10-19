-- 00461 · A sequence is approved once, then held (decision 0064, step 1: the expand half).
--
-- What decides a batch moves from the class's Autonomy row to the sequence, and a step's words are seen once:
--
--   sequences.mode               How its batches are decided: auto (each sent), veto (each held thirty minutes for a
--                                stop) or ask (each waits for an OK). A new sequence takes what its class's row says
--                                (sequence_mode_for); a one-off has none, since pressing Send decided it; a sequence to
--                                leads is never auto. A member changes it through change_playbook's new key, mode.
--   sequence_steps.words_ok_at   When a person last let a batch of the step's words go: approved it (approve_broadcast),
--                                or ran it now (assemble_broadcast with its member). Null while its words are new: at
--                                the step's making, when its message or slots change, and when its message's words
--                                change on any channel (templates_words_changed). A batch of a step whose words are new
--                                waits for an OK whatever the mode (contracts batchModeOf).
--   sequence_steps_due           A due step carries its sequence's mode, so the sweep plans by it.
--   sequence_overview            Says each sequence's mode and its first step's words_ok_at; the trial leaves it.
--   sequence_steps_of            Says each step's words_ok_at.
--   notifications                A reply that waits to go is told (kind reply_held, step 2), and its row closes once no
--                                reply of the receptionist's is left queued on its thread (messages_reply_held_closes).
--   sequence_evidence            What each sequence's batches did (step 5): went, after an OK, stopped, skipped unanswered.
--   campaign_ledger              Reports' wait for your OK says how many runs were skipped unanswered in the window.
--   google_reviews               A review's reply held (step 6): draft_text, drafted_at, and posts_at under Holds it;
--                                told when they move, and in reviews_ledger's waiting list, where Reports draws it.
--
-- Backfills: every sequence takes its class's row as it stands (the move of the live workspaces' rows to veto is 00462's,
-- after the deploy, with the sequences that follow them); a step that ever had a batch go is taken as seen; a sequence
-- whose class is set to Never is paused, since the mode it takes cannot be never.
--
-- Deploy order: this first, then either app. A release before this one reads the class's row and the trial as it did,
-- and asks for no new key: change_playbook still takes trial_until, and the trial stays a column until 00462. Re-runnable.

set local lock_timeout = '3s';
do $$
begin
  raise notice 'lock_timeout for this migration: %', current_setting('lock_timeout');
  if current_setting('lock_timeout') <> '3s' then
    raise warning 'this file was applied outside a transaction, so SET LOCAL did nothing: run it inside begin/commit, or set lock_timeout yourself before it';
  end if;
end $$;

/* ------------------------------------------------------------------------------------------------ 1. columns -- */

alter table public.sequences add column if not exists mode text;
alter table public.sequences drop constraint if exists sequences_mode_check;
alter table public.sequences add constraint sequences_mode_check check (mode in ('auto', 'veto', 'ask'));
comment on column public.sequences.mode is
  'How its batches are decided (0064): auto, each sent; veto, each held thirty minutes for a stop; ask, each waits for an OK. A batch of a step whose words are new waits for an OK whatever this says (sequence_steps.words_ok_at). Null for a one-off alone, which pressing Send decided. Never auto for a sequence to leads.';

alter table public.sequence_steps add column if not exists words_ok_at timestamptz;
comment on column public.sequence_steps.words_ok_at is
  'When a person last let a batch of this step''s words go (0064): approved it, or ran it now. Null while its words are new to the owner: at its making, after its message or slots change, after its message''s words change on any channel. A batch of a step whose words are new waits for an OK.';

-- A member changes a sequence's mode through change_playbook (security invoker): the column, on the member's rights.
grant update (mode) on public.sequences to authenticated;
drop policy if exists sequences_acting_update on public.sequences;
create policy sequences_acting_update on public.sequences for update to authenticated
  using (public.is_acting_member(tenant_id)) with check (public.is_acting_member(tenant_id));

/* ---------------------------------------------------------------------------- 2. what a new sequence starts as -- */

-- What a new sequence of a class starts as: the class's Autonomy row, when it is a mode a sequence takes (a sequence to
-- leads never sends on its own), else ask, as a class with no row asks (core run-playbook's rule, fail safe).
create or replace function public.sequence_mode_for(p_tenant_id uuid, p_class text, p_to_leads boolean)
returns text
language sql stable security definer
set search_path = public
as $$
  select coalesce((
    select case when p.mode in ('veto', 'ask') or (p.mode = 'auto' and not coalesce(p_to_leads, false)) then p.mode end
      from public.policies p
     where p.tenant_id = p_tenant_id and p.class = p_class and p.subject_type is null
     order by p.updated_at desc
     limit 1), 'ask')
$$;

revoke all on function public.sequence_mode_for(uuid, text, boolean) from public, anon, authenticated;
grant execute on function public.sequence_mode_for(uuid, text, boolean) to service_role;
comment on function public.sequence_mode_for(uuid, text, boolean) is
  'What a new sequence of p_class starts as in the workspace (0064): its class''s Autonomy row where that is a mode a sequence takes (never auto for one to leads, p_to_leads), else ask. Read by the first step''s trigger, which makes its sequence.';

create or replace function public.sequence_steps_place() returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  if NEW.sequence_id is null then
    if NEW.after_step_id is null then
      -- Its mode is what its class's Autonomy row says a new sequence starts as (0064).
      insert into public.sequences (id, tenant_id, name, starts, state, created_by, mode)
      values (NEW.id, NEW.tenant_id, NEW.name,
              case when NEW.kind = 'reach_out' then 'leads' when NEW.trigger = 'saved_list' then 'list' else 'moment' end,
              case NEW.state when 'running' then 'on' else 'paused' end,
              NEW.created_by,
              public.sequence_mode_for(NEW.tenant_id, NEW.policy_class, NEW.kind = 'reach_out'));
      NEW.sequence_id := NEW.id;
      NEW.place := 1;
    else
      select s.sequence_id, s.place + 1 into NEW.sequence_id, NEW.place
        from public.sequence_steps s
       where s.id = NEW.after_step_id;
      -- No such step: its own id stands in, and the keys refuse the row as a step of another workspace (23503).
      NEW.sequence_id := coalesce(NEW.sequence_id, NEW.after_step_id);
      NEW.place := coalesce(NEW.place, 2);
    end if;
  end if;
  return NEW;
end $$;

/* -------------------------------------------------------------------------- 3. words new to the owner, again -- */

-- A step's message or slots changed: its words are new, and its next batch waits for an OK.
create or replace function public.sequence_steps_words_changed() returns trigger
language plpgsql
set search_path = public
as $$
begin
  if (NEW.template_id, NEW.template_name, NEW.template_language, NEW.params)
     is distinct from (OLD.template_id, OLD.template_name, OLD.template_language, OLD.params) then
    NEW.words_ok_at := null;
  end if;
  return NEW;
end $$;

drop trigger if exists sequence_steps_words_changed on public.sequence_steps;
create trigger sequence_steps_words_changed
  before update of template_id, template_name, template_language, params on public.sequence_steps
  for each row execute function public.sequence_steps_words_changed();

-- A message's words changed on a channel, or it gained a channel: every step that sends it has new words. A version
-- taken out (hidden) adds no words.
create or replace function public.templates_words_changed() returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  if NEW.hidden_at is not null then
    return null;
  end if;
  if TG_OP = 'UPDATE'
     and (NEW.components, NEW.body_preview, NEW.name, NEW.language)
         is not distinct from (OLD.components, OLD.body_preview, OLD.name, OLD.language) then
    return null;
  end if;
  update public.sequence_steps st
     set words_ok_at = null
   where st.tenant_id = NEW.tenant_id and st.template_name = NEW.name and st.template_language = NEW.language
     and st.words_ok_at is not null;
  return null;
end $$;

revoke all on function public.templates_words_changed() from public, anon, authenticated;
revoke all on function public.sequence_steps_words_changed() from public, anon, authenticated;
drop trigger if exists templates_words_changed on public.templates;
create trigger templates_words_changed
  after insert or update of components, body_preview, name, language on public.templates
  for each row execute function public.templates_words_changed();

/* -------------------------------------------------------------------------------------------- 4. backfills -- */

-- A sequence whose class is set to Never runs nothing today: it is paused, since the mode it takes cannot be never.
update public.sequence_steps st
   set state = 'paused'
  from public.policies p
 where p.tenant_id = st.tenant_id and p.class = st.policy_class and p.subject_type is null and p.mode = 'never'
   and st.id = st.sequence_id and st.state = 'running';

-- Every sequence takes its class's row as it stands; one whose first step is gone (ended) asks, as no row does.
update public.sequences q
   set mode = coalesce((select public.sequence_mode_for(f.tenant_id, f.policy_class, f.kind = 'reach_out')
                          from public.sequence_steps f where f.id = q.id), 'ask')
 where q.mode is null and q.starts <> 'date';

-- A step that ever had a batch go was seen going: its words are taken as the owner's.
update public.sequence_steps st
   set words_ok_at = b.at
  from (select step_id, max(coalesce(started_at, scheduled_for, created_at)) as at
          from public.sequence_batches
         where step_id is not null and state in ('scheduled', 'sending', 'sent')
         group by step_id) b
 where b.step_id = st.id and st.words_ok_at is null;

alter table public.sequences drop constraint if exists sequences_mode_is_its_own;
alter table public.sequences add constraint sequences_mode_is_its_own check ((starts = 'date') = (mode is null));
alter table public.sequences drop constraint if exists sequences_leads_never_send;
alter table public.sequences add constraint sequences_leads_never_send check (starts <> 'leads' or mode <> 'auto');

/* -------------------------------------------------------------------- 5. a person lets a step's words go -- */

create or replace function public.approve_broadcast(p_tenant_id uuid, p_broadcast_id uuid, p_send_at timestamp with time zone, p_job jsonb, p_decision jsonb, p_via text DEFAULT NULL::text, p_undo_of uuid DEFAULT NULL::uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $$
declare
  v_actor uuid := auth.uid();
  v_released uuid;
begin
  if v_actor is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  -- An owner or an operator, or a partner on a session that showed its second factor: who may commit a change here.
  if p_tenant_id is null or not public.is_acting_member(p_tenant_id) then
    raise exception 'Workspace not found.' using errcode = 'P0002';
  end if;
  if p_send_at is null then
    raise exception 'approve_broadcast: a run is released for a moment' using errcode = '22004';
  end if;
  -- Only a run still waiting, and this workspace's: the row carries the time its job carries (00119). No row is a run
  -- that moved while the person looked (approved by someone else, skipped, canceled), and nothing else is written.
  update public.sequence_batches
     set state = 'scheduled', scheduled_for = p_send_at
   where id = p_broadcast_id and tenant_id = p_tenant_id and state = 'pending_approval'
  returning id into v_released;
  if v_released is null then
    return null;
  end if;
  -- The member has seen this step's words go in a real batch (0064): its next batches go by the sequence's mode.
  update public.sequence_steps st
     set words_ok_at = now()
    from public.sequence_batches b
   where b.id = v_released and st.id = b.step_id and st.tenant_id = p_tenant_id;
  -- The send, on the ledger no session may write: what the caller carries with it (the request it was approved in)
  -- rides in the payload, and the run it sends is named here, never by the caller.
  if p_job is not null then
    insert into public.jobs (tenant_id, kind, due_at, payload)
    values (p_tenant_id, 'broadcast_send', p_send_at,
            (case when jsonb_typeof(p_job) = 'object' then p_job else '{}'::jsonb end)
              || jsonb_build_object('broadcast_id', p_broadcast_id));
  end if;
  return public.team_decision(p_tenant_id, v_actor, 'broadcast', p_broadcast_id, 'send_broadcast',
                              coalesce(p_decision, '{}'::jsonb), p_via, p_undo_of);
end $$;

-- The 7-argument door's grants and words stay as 00353 wrote them.

create or replace function public.assemble_broadcast(
  p_tenant uuid,
  p_run jsonb,
  p_recipients jsonb,
  p_decision jsonb,
  p_send_at timestamptz default null,
  p_actor uuid default null,
  p_via text default null,
  p_undo_of uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id       uuid;
  v_decision uuid;
begin
  if p_decision is not null and jsonb_typeof(p_decision) <> 'object' then
    raise exception 'assemble_broadcast: a decision is an object' using errcode = '22023';
  end if;
  -- The member the line is written for is one of this workspace's, asked before anything is written: the floor the
  -- session's insert policy on decisions was when the route wrote the line itself.
  if p_decision is not null and p_actor is not null
     and not exists (select 1 from public.memberships m where m.tenant_id = p_tenant and m.user_id = p_actor) then
    raise exception 'Workspace not found.' using errcode = 'P0002';
  end if;
  -- The run, its people and its job: 00282's door, every rule it keeps asked there, and nothing written when it refuses.
  v_id := public.assemble_broadcast(
    p_tenant => p_tenant, p_run => p_run, p_recipients => p_recipients, p_send_at => p_send_at);
  if p_decision is null then
    return jsonb_build_object('id', v_id);
  end if;
  -- The system's decision: the sweep's run, under the mode the owner chose. No person, so no undo link.
  if p_actor is null then
    insert into public.decisions (tenant_id, subject_type, subject_id, verb, actor_type, actor_user_id, payload)
    values (p_tenant, 'broadcast', v_id, 'send_broadcast', 'system', null,
            p_decision || case when p_via is null then '{}'::jsonb else jsonb_build_object('via', p_via) end)
    returning id into v_decision;
    return jsonb_build_object('id', v_id, 'decision_id', v_decision, 'undo_dropped', false);
  end if;
  -- A member ran it now (0064): they let the step's words go, so its next batches go by the sequence's mode.
  if (p_run->>'playbook_id') is not null then
    update public.sequence_steps
       set words_ok_at = now()
     where id = (p_run->>'playbook_id')::uuid and tenant_id = p_tenant;
  end if;
  -- The member's: the person the service role acts for, named by the caller after its own role check.
  return jsonb_build_object('id', v_id)
      || public.team_decision(p_tenant, p_actor, 'broadcast', v_id, 'send_broadcast', p_decision, p_via, p_undo_of);
end $$;

comment on function public.assemble_broadcast(uuid, jsonb, jsonb, jsonb, timestamptz, uuid, text, uuid) is
  'A broadcast''s run, its people, its send job (when p_send_at is set) and the send_broadcast decision on it, in one transaction (00381): 00282''s door called whole, then the decision as the member''s (p_actor, the person the caller acts for) or the system''s (p_actor null, the sweep''s). A member''s run of a step lets its words go (sequence_steps.words_ok_at, 00461). The service role''s alone. Returns {id, decision_id, undo_dropped}; {id} alone when p_decision is null (a run that waits for a person: its approval is its decision, 00353).';

/* ----------------------------------------------------------------------------------------- 6. the mode is changed -- */

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
  -- The ten keys a change may name, and nothing else: a key outside them is refused, never ignored. Nine are the step's
  -- columns; mode is its sequence's (0064).
  if v_set = '{}'::jsonb or exists (
    select 1 from jsonb_object_keys(v_set) k
     where k not in ('state', 'name', 'run_hour', 'cap_per_run', 'gap_days', 'cadence_days', 'params', 'until',
                     'trial_until', 'mode')
  ) then
    raise exception 'change_playbook: name what changes: state, name, run_hour, cap_per_run, gap_days, cadence_days, params, until, trial_until or mode'
      using errcode = '22023';
  end if;
  -- A null is no value for the seven columns that are never empty, so it is refused, never read as "keep what it
  -- holds". The two dates take it: it clears them.
  if exists (select 1 from jsonb_each(v_set) e
              where jsonb_typeof(e.value) = 'null' and e.key not in ('until', 'trial_until')) then
    raise exception 'change_playbook: name a value for each column named: only until and trial_until may be cleared'
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
  -- The two dates in the spelling the row's own are read in (to_jsonb of the cast), so the same day or instant written
  -- another way differs from nothing; a value that is no date is refused by its cast here (22007), before the lock.
  if v_set ? 'until' and jsonb_typeof(v_set -> 'until') <> 'null' then
    v_set := jsonb_set(v_set, '{until}', to_jsonb((v_set ->> 'until')::date));
  end if;
  if v_set ? 'trial_until' and jsonb_typeof(v_set -> 'trial_until') <> 'null' then
    v_set := jsonb_set(v_set, '{trial_until}', to_jsonb((v_set ->> 'trial_until')::timestamptz));
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
           until        = case when v_diff ? 'until' then (v_diff ->> 'until')::date else p.until end,
           trial_until  = case when v_diff ? 'trial_until' then (v_diff ->> 'trial_until')::timestamptz
                               else p.trial_until end
     where p.id = p_playbook_id and p.tenant_id = p_tenant_id;
    -- A forbidden update raises nothing: counted, so a change the policy refused is never answered as made.
    get diagnostics v_rows = row_count;
    if v_rows = 0 then
      raise exception 'Playbook not found.' using errcode = 'P0002';
    end if;
  end if;
  -- A sequence's settings are its first step's (0060; the loop review, 17 Oct 2026): a customer's steps after it run at
  -- its hour, under its cap, its last day and its trial, so a change here reaches all of them; one named as the first was
  -- takes its new name (a step given a name of its own keeps it). On the caller's rights, as the first step's row was.
  if v_diff <> '{}'::jsonb and v_was.id = v_was.sequence_id and v_was.kind = 'moment' then
    update public.sequence_steps n
       set run_hour = f.run_hour, cap_per_run = f.cap_per_run, until = f.until, trial_until = f.trial_until,
           name = case when n.name = v_was.name then f.name else n.name end
      from public.sequence_steps f
     where f.id = p_playbook_id and f.tenant_id = p_tenant_id
       and n.tenant_id = p_tenant_id and n.sequence_id = f.sequence_id and n.id <> f.id
       and n.kind = 'moment' and n.trigger = 'after_step'
       and (n.run_hour, n.cap_per_run, n.until, n.trial_until, n.name)
           is distinct from (f.run_hour, f.cap_per_run, f.until, f.trial_until,
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
  'A member changes a playbook in place and its line in the ledger together (the change_playbook door): the row locked on the caller''s rights, of the columns p_set names (state, name, run_hour, cap_per_run, gap_days, cadence_days, params, until, trial_until) only those that differ from the row written, and its sequence''s mode where p_set names mode (auto, veto or ask; none for a one-off, never auto to leads: 00461), then start_playbook or pause_playbook where the state moved, else change_playbook, as theirs (member_decision), in one transaction. A sequence''s first step''s hour, cap, last day and trial reach its customer''s steps after it, and its name those named as it was (00453). A key outside the ten is refused (22023); so is a null, but for until and trial_until, which it clears, and a params that is not an array. Security invoker: the update policies and the column grants judge it. P0002 where the caller cannot see or change the row. Returns id, was (what each written column held, and the mode), decision_id and undo_dropped; where nothing differs, nothing is written and no line (00377, 00416, 00453, 00461).';

/* --------------------------------------------------------------------------------------------- 7. the reads -- */

create or replace function public.sequence_steps_due(p_kind text, p_at timestamptz, p_last_hour integer, p_limit integer,
                                                    p_tenant_id uuid default null)
returns table(step jsonb, timezone text, due_total bigint)
language sql stable security definer
set search_path = public
as $$
  select to_jsonb(s) || jsonb_build_object('mode', q.mode), z.tz, count(*) over ()
    from public.sequence_steps s
    join public.sequence_steps r on r.id = s.sequence_id
    join public.sequences q on q.id = s.sequence_id
    join public.tenants t on t.id = s.tenant_id
    cross join lateral (select public.safe_zone(coalesce(nullif(btrim(t.timezone), ''), 'America/New_York')) as tz) z
    cross join lateral (select p_at at time zone z.tz as clock) l
   where s.state = 'running' and s.kind = p_kind
     and (s.kind = 'reach_out' or (r.state = 'running' and q.state = 'on'))
     and t.status <> 'paused'
     and (p_tenant_id is null or s.tenant_id = p_tenant_id)
     and extract(hour from l.clock) between s.run_hour and p_last_hour
     and s.last_run_for is distinct from l.clock::date
   order by s.last_run_at nulls first, s.created_at, s.id
   limit greatest(coalesce(p_limit, 0), 0)
$$;

comment on function public.sequence_steps_due(text, timestamptz, integer, integer, uuid) is
  'The running steps of one kind due at p_at by their workspace''s own clock, each with its sequence''s mode (00461), a paused workspace''s never, never run first, then least recently run, with due_total the count of all that were due: the hourly sweep''s pages (playbooks_due''s rule, 00245). A customer''s step after the first is due only while its sequence is on (0060).';

create or replace function public.sequence_overview(p_tenant_id uuid, p_sequence_id uuid default null)
returns jsonb
language sql stable
set search_path = ''
as $$
  with q as (
    select * from public.sequences
     where tenant_id = p_tenant_id and (p_sequence_id is null or id = p_sequence_id)
  ),
  steps as (
    select s.sequence_id, count(*) as n,
           array(select distinct c from public.sequence_steps x, unnest(x.channels) c
                  where x.sequence_id = s.sequence_id order by c) as channels,
           -- The days its steps span (00459): each wait after the first, as the record's rail adds them.
           coalesce(sum(s.after_days) filter (where s.after_step_id is not null), 0) as days,
           -- A sequence to leads' emails still to write (00459): a step's body left empty, as a new draft's is.
           count(*) filter (where s.kind = 'reach_out' and s.hand is null
                              and coalesce(btrim((select x->>'text' from jsonb_array_elements(t.components) x
                                                   where x->>'type' = 'BODY' limit 1)), '') = '') as unwritten
      from public.sequence_steps s
      join q on q.id = s.sequence_id
      left join public.templates t on t.id = s.template_id
     group by s.sequence_id
  ),
  -- Each batch waiting for an OK, as the badge judges one (contracts runWaitsOnYou, by the business's day): its step,
  -- the day it was made for and its moment, which the server's reader asks of each (readers/sequences.ts).
  waiting as (
    select b.sequence_id, count(*) as n, sum(b.recipient_count) as people, min(b.created_at) as oldest,
           jsonb_agg(jsonb_build_object(
             'id', b.id, 'step_id', b.step_id, 'run_for', b.run_for, 'at', b.scheduled_for,
             'people', b.recipient_count,
             'audience', jsonb_build_object('kind', b.audience->>'kind', 'trigger', b.audience->>'trigger'))
             order by b.scheduled_for, b.id) as batches
      from public.sequence_batches b
      join q on q.id = b.sequence_id
     where b.state = 'pending_approval'
     group by b.sequence_id
  ),
  held as (
    select s.sequence_id,
           count(*) filter (where s.state = 'held')    as held,
           count(*) filter (where s.state = 'drafted') as to_send,
           min(coalesce(s.drafted_at, s.created_at))   as oldest
      from public.sequence_sends s
      join q on q.id = s.sequence_id
     where s.lead_id is not null and s.state in ('held', 'drafted')
     group by s.sequence_id
  ),
  -- A reply that asks for an answer: a person interested or asking, read in the last 14 days, not answered or undone.
  replies as (
    select s.sequence_id, count(*) as n, min(r.read_at) as oldest
      from public.sequence_replies r
      join public.sequence_sends s on s.id = r.send_id
      join q on q.id = s.sequence_id
     where r.undone_at is null and r.answered_message_id is null and r.claim in ('person', 'owner')
       and r.intent in ('interested', 'question') and r.read_at > now() - interval '14 days'
     group by s.sequence_id
  ),
  next as (
    select distinct on (b.sequence_id) b.sequence_id, b.id, b.scheduled_for, b.recipient_count, b.state, b.step_id
      from public.sequence_batches b
      join q on q.id = b.sequence_id
     where b.state in ('pending_approval', 'scheduled', 'sending')
     order by b.sequence_id, b.scheduled_for, b.id
  ),
  last as (
    select distinct on (b.sequence_id) b.sequence_id, b.id,
           coalesce(b.finished_at, b.started_at, b.scheduled_for) as at
      from public.sequence_batches b
      join q on q.id = b.sequence_id
     where b.state = 'sent'
     order by b.sequence_id, coalesce(b.finished_at, b.started_at, b.scheduled_for) desc, b.id
  ),
  last_counts as (
    select public.sequence_batch_counts(p_tenant_id, coalesce(array_agg(l.id), '{}')) as counts from last l
  ),
  -- Who is in it (00459): everyone whose place stands, as its People tab files them (sequence_places): a lead added and
  -- not yet planned, waiting for an OK, held, for you to send, up next or between steps. Not who left, finished, or wrote
  -- back and waits for an answer.
  in_it as (
    select p.sequence_id, count(*) as n
      from public.sequence_places(p_tenant_id, p_sequence_id, null) p
     where p.grp not in ('done', 'left', 'replied')
     group by p.sequence_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', q.id,
           'name', q.name,
           'starts', q.starts,
           'state', q.state,
           'mode', q.mode,
           'created_at', q.created_at,
           'first', case when f.id is null then null else jsonb_build_object(
             'id', f.id,
             'kind', f.kind,
             'trigger', f.trigger,
             'state', f.state,
             'policy_class', f.policy_class,
             'run_hour', f.run_hour,
             'list_id', f.list_id,
             'list_key', f.list_key,
             'list_name', (select g.name from public.segments g where g.id = f.list_id),
             'search_id', f.lead_search_id,
             'search_name', (select ls.name from public.lead_searches ls where ls.id = f.lead_search_id),
             'source_search_id', f.source_search_id,
             'source_name', (select ls.name from public.lead_searches ls where ls.id = f.source_search_id),
             -- The search it could add from, while it adds from none (How it runs' auto-add switch): the live finder
             -- search that found most of its list's leads, and that no other sequence adds from already.
             'source_could', case when f.lead_search_id is null or f.source_search_id is not null then null else (
               select jsonb_build_object('id', ls.id, 'name', ls.name)
                 from public.lead_search_members m
                 join public.lead_search_members o
                   on o.tenant_id = m.tenant_id and o.lead_id = m.lead_id and o.search_id <> m.search_id
                 join public.lead_searches ls on ls.id = o.search_id
                where m.search_id = f.lead_search_id and m.tenant_id = q.tenant_id
                  and ls.removed_at is null and ls.via not in ('chosen', 'import')
                  and not exists (select 1 from public.sequence_steps r where r.source_search_id = ls.id)
                group by ls.id, ls.name
                order by count(*) desc, ls.name
                limit 1) end,
             'owner_sends', f.owner_sends,
             'until', f.until,
             'words_ok_at', f.words_ok_at,
             'template_name', f.template_name,
             'template_language', f.template_language) end,
           'date', case when q.starts = 'date' then (
             select jsonb_build_object('batch_id', d.id, 'state', d.state, 'at', d.scheduled_for,
                                       'people', d.recipient_count)
               from public.sequence_batches d where d.id = q.id) end,
           'steps', coalesce(st.n, 0),
           'days', coalesce(st.days, 0),
           'unwritten', coalesce(st.unwritten, 0),
           'channels', coalesce(to_jsonb(st.channels), '[]'::jsonb),
           'needs', jsonb_build_object(
             'waiting', coalesce(w.n, 0),
             'waiting_people', coalesce(w.people, 0),
             'held', coalesce(h.held, 0),
             'to_send', coalesce(h.to_send, 0),
             'replies', coalesce(rp.n, 0),
             'oldest_at', least(w.oldest, h.oldest, rp.oldest),
             'batches', coalesce(w.batches, '[]'::jsonb)),
           'next', case when nx.id is null then null else jsonb_build_object(
             'id', nx.id, 'at', nx.scheduled_for, 'people', nx.recipient_count, 'state', nx.state,
             'place', (select ps.place from public.sequence_steps ps where ps.id = nx.step_id)) end,
           'last', case when ls.id is null then null else jsonb_build_object(
             'id', ls.id, 'at', ls.at,
             'sent', coalesce(((select counts from last_counts) -> ls.id::text ->> 'sent')::int, 0),
             'replied', coalesce(((select counts from last_counts) -> ls.id::text ->> 'replied')::int, 0)) end,
           'in_it', coalesce(ii.n, 0)
         ) order by q.created_at desc, q.id), '[]'::jsonb)
    from q
    left join public.sequence_steps f on f.id = q.id
    left join steps st on st.sequence_id = q.id
    left join waiting w on w.sequence_id = q.id
    left join held h on h.sequence_id = q.id
    left join replies rp on rp.sequence_id = q.id
    left join next nx on nx.sequence_id = q.id
    left join last ls on ls.sequence_id = q.id
    left join in_it ii on ii.sequence_id = q.id
$$;

comment on function public.sequence_overview(uuid, uuid) is
  'The workspace''s sequences (0060), or the one named: how each starts (its first step, with the search it adds from: 00459, when its words were last let go: 00461, or a one-off''s date), how its batches are decided (its mode, 00461), where it stands, its steps, the days they span and the emails still to write (00459), its channels, what needs you (batches waiting for an OK and their people, emails held by the check, emails for you to send, replies to answer, the oldest of them), the batch to come, the last that went with its sent and replied, and who is in it (everyone whose place stands, sequence_places: 00459). Newest first. Under the caller''s row security.';

create or replace function public.sequence_steps_of(p_tenant_id uuid, p_sequence_id uuid, p_days integer default 30)
returns jsonb
language sql stable
set search_path = ''
as $$
  with steps as (
    select s.* from public.sequence_steps s
     where s.tenant_id = p_tenant_id and s.sequence_id = p_sequence_id
  ),
  batches as (
    select b.id, b.step_id from public.sequence_batches b
     where b.tenant_id = p_tenant_id and b.sequence_id = p_sequence_id
       and coalesce(b.started_at, b.scheduled_for) > now() - make_interval(days => least(greatest(coalesce(p_days, 30), 1), 90))
  ),
  counts as (
    select public.sequence_batch_counts(p_tenant_id, coalesce(array_agg(b.id), '{}')) as c from batches b
  ),
  by_step as (
    select b.step_id,
           sum(coalesce(((select c from counts) -> b.id::text ->> 'sent')::int, 0))    as sent,
           sum(coalesce(((select c from counts) -> b.id::text ->> 'replied')::int, 0)) as replied
      from batches b
     group by b.step_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', s.id,
           'place', s.place,
           'name', s.name,
           'kind', s.kind,
           'trigger', s.trigger,
           'state', s.state,
           'after_days', s.after_days,
           'only_if', to_jsonb(s.only_if),
           'channels', to_jsonb(s.channels),
           'template_id', s.template_id,
           'template_name', s.template_name,
           'template_language', s.template_language,
           'params', s.params,
           'hand', s.hand,
           'words_ok_at', s.words_ok_at,
           'next_words', case when s.next_template_name is null then null else jsonb_build_object(
             'template_id', s.next_template_id,
             'name', s.next_template_name,
             'language', s.next_template_language,
             'status', (select t.meta_status from public.templates t
                         where t.tenant_id = s.tenant_id and t.channel = 'whatsapp'
                           and t.name = s.next_template_name and t.language = s.next_template_language
                         order by t.updated_at desc limit 1),
             'rejected_reason', (select t.rejected_reason from public.templates t
                                  where t.tenant_id = s.tenant_id and t.channel = 'whatsapp'
                                    and t.name = s.next_template_name and t.language = s.next_template_language
                                  order by t.updated_at desc limit 1)) end,
           'sent', coalesce(bs.sent, 0),
           'replied', coalesce(bs.replied, 0)
         ) order by s.place), '[]'::jsonb)
    from steps s
    left join by_step bs on bs.step_id = s.id
$$;

comment on function public.sequence_steps_of(uuid, uuid, integer) is
  'A sequence''s steps in their places (0060): each one''s message and the words waiting for WhatsApp with WhatsApp''s answer, when a person last let its words go (00461), its wait and what must still hold of someone due it, its channels, a hand step''s call or note, and what its batches of the last p_days (1 to 90, 30) sent and drew back. Under the caller''s row security.';

/* ------------------------------------------------------------------------------- 8. a reply that waits is told -- */

-- A reply counting down to go in the owner's name is told on the bell and the phone (decision 0064, step 2): the edge's
-- draft queue keeps a row of kind reply_held about the thread as the reply is queued.
alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in ('handoff','deadman','call','number','sweep','job_failed','playbook','calendar_people','alert','review','billing','template_ready','template_blocked','broadcast_sent','broadcast_stopped','leads_ready','leads_question','note_for_you','reach_out_replied','reach_out_day','booking_notice','opted_out','booking','member_joined','member_left','note_to_keep','reply_held'));

-- Its row closes once no reply of the receptionist's counts down on its thread: one leaves the queue (sent, failed or
-- withdrawn by a Stop), and none is left queued there. Through the one door that closes rows (00421).
create or replace function public.messages_reply_held_closes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1 from public.messages m
     where m.tenant_id = NEW.tenant_id
       and m.conversation_id = NEW.conversation_id
       and m.sender = 'ai'
       and m.status = 'queued'
  ) then
    return null;
  end if;
  perform public.notifications_close_about(
    NEW.tenant_id, array['reply_held'], 'conversation', NEW.conversation_id::text
  );
  return null;
exception when others then
  raise warning 'messages_reply_held_closes: %', sqlerrm;
  return null;
end $$;

comment on function public.messages_reply_held_closes() is
  'Closes the open reply_held rows about a thread once a reply of the receptionist''s leaves the queue and none is left queued there (00461, decision 0064: sent, failed or withdrawn by a Stop), through notifications_close_about. Never fails the send: a failure is a warning.';

revoke all on function public.messages_reply_held_closes() from public, anon, authenticated;

drop trigger if exists messages_reply_held_closes on public.messages;
create trigger messages_reply_held_closes
  after update of status on public.messages
  for each row
  when (old.status = 'queued' and new.status is distinct from 'queued' and new.sender = 'ai')
  execute function public.messages_reply_held_closes();

/* ------------------------------------------------------------------------------ 9. each sequence's evidence -- */

-- What a sequence's batches did over the last p_days (decision 0064, step 5): how many went, how many of those went after a
-- member's OK (a send_broadcast decision of a member's: an Approve, or a Run now), how many a member stopped, and how many
-- the sweep skipped because nobody answered before their day ended (a cancel_broadcast of the system's, reason day_passed).
-- A one-off has no step and is not counted. What the record and each Autonomy row say, so the owner moves a mode on what
-- happened, never on a guess; nothing here moves one. Under the caller's row security.
create or replace function public.sequence_evidence(p_tenant_id uuid, p_days integer default 90)
returns table (
  sequence_id uuid,
  policy_class text,
  went integer,
  approved integer,
  stopped integer,
  skipped integer
)
language sql
stable
security invoker
set search_path = public
as $$
  with b as (
    select b.id, b.sequence_id, b.state, st.policy_class
      from public.sequence_batches b
      join public.sequence_steps st on st.id = b.step_id and st.tenant_id = b.tenant_id
     where b.tenant_id = p_tenant_id
       and b.created_at >= now() - make_interval(days => greatest(1, least(coalesce(p_days, 90), 365)))
  ),
  told as (
    select b.id,
           bool_or(d.verb = 'send_broadcast' and d.actor_type = 'user') as by_you,
           bool_or(d.verb = 'cancel_broadcast' and d.actor_type = 'user') as stopped,
           bool_or(d.verb = 'cancel_broadcast' and d.actor_type = 'system' and d.payload ->> 'reason' = 'day_passed')
             as skipped
      from b
      join public.decisions d
        on d.tenant_id = p_tenant_id and d.subject_type = 'broadcast' and d.subject_id = b.id
       and d.verb in ('send_broadcast', 'cancel_broadcast')
     group by b.id
  )
  select b.sequence_id,
         min(b.policy_class),
         (count(*) filter (where b.state in ('sending', 'sent')))::integer,
         (count(*) filter (where b.state in ('sending', 'sent') and coalesce(t.by_you, false)))::integer,
         (count(*) filter (where b.state = 'canceled' and coalesce(t.stopped, false)))::integer,
         (count(*) filter (where b.state = 'canceled' and coalesce(t.skipped, false)))::integer
    from b
    left join told t on t.id = b.id
   group by b.sequence_id
$$;

comment on function public.sequence_evidence(uuid, integer) is
  'What each of a workspace''s sequences'' batches did over the last p_days (1 to 365, 90): went, went after a member''s OK, stopped by a member, skipped by the sweep because nobody answered before their day ended (00461, decision 0064 step 5). One-offs are not counted. Under the caller''s row security.';

revoke all on function public.sequence_evidence(uuid, integer) from public, anon;
grant execute on function public.sequence_evidence(uuid, integer) to authenticated, service_role;


/* ------------------------------------------------------------- 10. Reports says the runs skipped unanswered -- */

-- The Campaigns lens's wait for your OK says, beside the runs approved, how many were skipped because nobody answered
-- before their day ended (decision 0064, step 5). campaign_ledger replaced whole from its latest body (00451), with the
-- one count added to its approval part.
create or replace function public.campaign_ledger(p_tenant_id uuid, p_days integer DEFAULT 30, p_end date DEFAULT NULL::date)
 returns jsonb
 language plpgsql
 stable
 set search_path to 'public'
as $$
declare
  v_tz     text;
  v_days   integer := least(greatest(coalesce(p_days, 30), 1), 90);
  v_today  date;
  v_end    date;          -- the window's last day: today, or the earlier day a member picked (00360)
  v_start  timestamptz;   -- the window's first instant
  v_prior  timestamptz;   -- the period before's first instant
  v_stop   timestamptz;   -- the midnight after the window's last day, in the zone
  v_result jsonb;
begin
  select timezone into v_tz from tenants where id = p_tenant_id;
  if v_tz is null then
    return jsonb_build_object('error', 'unknown_tenant');
  end if;

  v_today := (now() at time zone v_tz)::date;
  v_end   := least(coalesce(p_end, v_today), v_today);
  v_start := ((v_end - (v_days - 1))::timestamp) at time zone v_tz;
  v_prior := ((v_end - (v_days * 2 - 1))::timestamp) at time zone v_tz;
  v_stop  := ((v_end + 1)::timestamp) at time zone v_tz;

  with
  -- The window and the one before it, as periods: every part that is set against before reads both through this.
  periods(is_now) as (values (true), (false)),

  -- The runs a send in the span can belong to. The window is driven from broadcasts_tenant_created, since no index serves
  -- broadcast_recipients by (tenant_id, sent_at); its runs bound which recipients are kept, and the planner reads them
  -- (a hash join of the workspace's recipients at scale, 11 Oct 2026). The kind comes from the audience (a deleted
  -- playbook's run keeps it), the time from when the run started, else when it was to.
  runs_in_reach as (
    select b.id, b.state, b.failure, b.template_name, b.template_language,
           case when b.audience ->> 'kind' = 'reach_out' then 'reach_out'
                when b.audience ->> 'kind' = 'playbook' or b.step_id is not null then 'moment'
                else 'broadcast' end                            as kind,
           coalesce(b.started_at, b.scheduled_for)              as run_at
      from sequence_batches b
     where b.tenant_id = p_tenant_id
       and b.created_at >= v_prior - public.campaign_run_lead()
       and b.created_at <  v_stop
  ),

  -- Every recipient of those runs with the message they were sent, if any (a failed or erased one has none).
  rec as (
    select r.batch_id as broadcast_id, r.contact_id, r.state, r.reason, r.sent_at,
           coalesce(r.channel, 'whatsapp')                      as channel,
           b.kind, b.run_at, b.template_name, b.template_language,
           m.conversation_id, m.status as message_status, m.error as message_error, m.created_at as message_at
      from runs_in_reach b
      join sequence_sends r on r.lead_id is null and ( r.batch_id = b.id and r.tenant_id = p_tenant_id)
      left join messages m on m.id = r.message_id
  ),

  -- What went out in the span: a person a run marked sent, whether they wrote back and how soon, and whether their
  -- reply window is over. One probe of messages_conversation_created (conversation_id, created_at) for each send,
  -- whatever the planner guesses: run_counts' shape (00374), which says why the probe is fenced and names no workspace.
  sent as (
    select s.*,
           (s.first_reply_at is not null)                                  as replied,
           (s.sent_at + public.campaign_reply_window() <= now())           as mature
      from (
        select r.broadcast_id, r.contact_id, r.channel, r.kind, r.template_name, r.template_language, r.sent_at,
               (r.sent_at >= v_start) as is_now,
               (select min(x.at)
                  from (select i.created_at as at
                          from messages i
                         where i.conversation_id = r.conversation_id
                           and i.direction = 'inbound'
                           and i.sender = 'customer'
                           and public.message_is_a_persons_words(i.meta)
                           and i.created_at > r.sent_at
                           and i.created_at <= r.sent_at + public.campaign_reply_window()
                        offset 0) x) as first_reply_at
          from rec r
         where r.state = 'sent'
           and r.sent_at >= v_prior and r.sent_at < v_stop
        -- Fenced here too: the probe is run once a send. Without it the planner pulls `s` up and copies the probe into
        -- `replied` as well, and every send is probed twice.
        offset 0
      ) s
  ),

  -- People, once each however many runs reached them; and the runs that sent, by kind (a reach-out run has no people here).
  people_stats as (
    select p.is_now,
           count(distinct s.contact_id)                                    as sent_to,
           count(distinct s.contact_id) filter (where s.replied)           as wrote_back,
           count(distinct s.contact_id) filter (where not s.mature)        as counting
      from periods p
      left join sent s on s.is_now = p.is_now
     group by p.is_now
  ),
  run_stats as (
    select p.is_now,
           count(distinct s.broadcast_id) filter (where s.kind = 'moment')    as moment,
           count(distinct s.broadcast_id) filter (where s.kind = 'broadcast') as broadcast
      from periods p
      left join sent s on s.is_now = p.is_now
     group by p.is_now
  ),

  -- Held: the people a run did not send to, dated by the run (they have no time of their own), told by a reason of ours.
  held_rows as (
    select r.state,
           case when r.reason ~ '^[a-z][a-z_]{0,39}$' then r.reason else 'other' end as reason
      from rec r
     where r.state in ('skipped', 'failed')
       and r.run_at >= v_start and r.run_at < v_stop
  ),
  held_stats as (
    select count(*)                                  as total,
           count(*) filter (where h.state = 'skipped') as skipped,
           count(*) filter (where h.state = 'failed')  as failed
      from held_rows h
  ),

  -- Stopped: the runs that failed or were canceled, dated by their time; the failed told by a code of ours.
  stopped_rows as (
    select b.state,
           case when b.failure ~ '^[a-z_]+(:[a-z]+)?$' then b.failure else 'other' end as failure
      from runs_in_reach b
     where b.kind in ('moment', 'broadcast')
       and b.state in ('failed', 'canceled')
       and b.run_at >= v_start and b.run_at < v_stop
  ),
  stopped_stats as (
    select count(*) filter (where b.state = 'failed')   as failed,
           count(*) filter (where b.state = 'canceled') as canceled
      from stopped_rows b
  ),

  -- Failed sends: a message marked failed in the window, by the channel it went by and the provider's code (an email has
  -- none); with none, one word of a closed set. The error is read and never repeated.
  failed_rows as (
    select f.channel, f.code,
           case when f.code is null then
                  case when f.channel = 'email' and f.error ->> 'provider' in ('bounced', 'failed', 'suppressed')
                         then f.error ->> 'provider'
                       when f.channel = 'sms' and f.error ->> 'carrier' in ('undelivered', 'failed', 'canceled')
                         then f.error ->> 'carrier'
                       when f.error ->> 'reason' in ('never_delivered', 'run_interrupted', 'orphaned')
                         then f.error ->> 'reason'
                       when f.error ->> 'outcome' = 'unknown' then 'outcome_unknown'
                       else 'unknown' end
           end as kind
      from (select r.channel, r.message_error as error,
                   -- An email carries no code: its word decides (sendFailureWords reads none for email either).
                   case when r.channel = 'email' then null else public.provider_code_of(r.message_error) end as code
              from rec r
             where r.message_status = 'failed'
               and r.message_at >= v_start and r.message_at < v_stop) f
  ),
  failed_by as (
    select f.channel, f.code, f.kind, count(*) as n
      from failed_rows f
     group by f.channel, f.code, f.kind
  ),

  -- By message: the window's sends by the name and language of the run's message; a reply rate is of the mature sends.
  by_message_rows as (
    select s.template_name as name, s.template_language as lang,
           count(*)                                          as sent,
           count(*) filter (where s.mature)                  as mature,
           count(*) filter (where s.mature and s.replied)    as replied
      from sent s
     where s.is_now
     group by s.template_name, s.template_language
     order by count(*) desc, s.template_name, s.template_language
     limit 20
  ),

  -- First reply: the window's answered sends, by seconds to the first answer, each in the first bucket it fits.
  reply_rows as (
    select extract(epoch from s.first_reply_at - s.sent_at)::double precision as seconds
      from sent s
     where s.is_now and s.replied
  ),
  reply_stats as (
    select count(*)                                                       as n,
           round(percentile_cont(0.5) within group (order by q.seconds))::bigint as median_s,
           count(*) filter (where q.seconds <= 900)                       as m15,
           count(*) filter (where q.seconds > 900   and q.seconds <= 3600)   as h1,
           count(*) filter (where q.seconds > 3600  and q.seconds <= 14400)  as h4,
           count(*) filter (where q.seconds > 14400 and q.seconds <= 86400)  as h24,
           count(*) filter (where q.seconds > 86400)                      as h72
      from reply_rows q
  ),

  -- Approval: an approval made in the window, from the run's being made to the decision. Joined to the run by id: the
  -- run may have been made long before, and may be of any kind.
  approval_rows as (
    select extract(epoch from d.created_at - b.created_at)::double precision as seconds
      from decisions d
      join sequence_batches b on b.id = d.subject_id and b.tenant_id = d.tenant_id
     where d.tenant_id = p_tenant_id
       and d.subject_type = 'broadcast'
       and d.verb = 'send_broadcast'
       and d.payload ->> 'approved' = 'true'
       and d.created_at >= v_start and d.created_at < v_stop
  ),
  -- Skipped because nobody answered (decision 0064, step 5): a run the night skipped in the window, its day gone with
  -- nobody's OK (a cancel_broadcast of the system's, reason day_passed), said beside the wait for the ones approved.
  skipped_rows as (
    select d.subject_id
      from decisions d
     where d.tenant_id = p_tenant_id
       and d.subject_type = 'broadcast'
       and d.verb = 'cancel_broadcast'
       and d.actor_type = 'system'
       and d.payload ->> 'reason' = 'day_passed'
       and d.created_at >= v_start and d.created_at < v_stop
  ),
  approval_stats as (
    select count(*)                                                       as n,
           round(percentile_cont(0.5) within group (order by q.seconds))::bigint as median_s,
           count(*) filter (where q.seconds <= 3600)                      as h1,
           count(*) filter (where q.seconds > 3600  and q.seconds <= 14400)  as h4,
           count(*) filter (where q.seconds > 14400 and q.seconds <= 86400)  as h24,
           count(*) filter (where q.seconds > 86400)                      as over
      from approval_rows q
  )

  select jsonb_build_object(
    'timezone', v_tz,
    'today', to_char(v_today, 'YYYY-MM-DD'),
    'end', to_char(v_end, 'YYYY-MM-DD'),
    'days', v_days,
    'people', jsonb_build_object(
      'now', (select jsonb_build_object('sent_to', s.sent_to, 'wrote_back', s.wrote_back, 'counting', s.counting)
                from people_stats s where s.is_now),
      'before', (select jsonb_build_object('sent_to', s.sent_to, 'wrote_back', s.wrote_back)
                   from people_stats s where not s.is_now)),
    'runs', jsonb_build_object(
      'now', (select jsonb_build_object('moment', s.moment, 'broadcast', s.broadcast) from run_stats s where s.is_now),
      'before', (select jsonb_build_object('moment', s.moment, 'broadcast', s.broadcast)
                   from run_stats s where not s.is_now)),
    'held', (select jsonb_build_object(
               'total', s.total,
               'skipped', s.skipped,
               'failed', s.failed,
               'by_reason', coalesce((select jsonb_object_agg(t.reason, t.n) from (
                                select h.reason, count(*) as n from held_rows h group by h.reason) t), '{}'::jsonb))
               from held_stats s),
    'stopped', (select jsonb_build_object(
                  'failed', s.failed,
                  'canceled', s.canceled,
                  'by_failure', coalesce((select jsonb_object_agg(t.failure, t.n) from (
                                   select b.failure, count(*) as n from stopped_rows b
                                    where b.state = 'failed' group by b.failure) t), '{}'::jsonb))
                  from stopped_stats s),
    'failed_sends', jsonb_build_object(
      'total', (select count(*) from failed_rows),
      'by_code', coalesce((select jsonb_agg(jsonb_build_object(
                             'channel', f.channel, 'code', f.code, 'kind', f.kind, 'n', f.n)
                           order by f.n desc, f.channel, f.code, f.kind)
                             from failed_by f), '[]'::jsonb)),
    'by_message', coalesce((select jsonb_agg(jsonb_build_object(
                              'name', m.name, 'language', m.lang, 'sent', m.sent, 'mature', m.mature,
                              'replied', m.replied)
                            order by m.sent desc, m.name, m.lang)
                              from by_message_rows m), '[]'::jsonb),
    'first_reply', (select jsonb_build_object(
                      'n', s.n,
                      'median_s', s.median_s,
                      'buckets', jsonb_build_object('m15', s.m15, 'h1', s.h1, 'h4', s.h4, 'h24', s.h24, 'h72', s.h72))
                      from reply_stats s),
    'approval', (select jsonb_build_object(
                   'n', s.n,
                   'skipped', (select count(*) from skipped_rows),
                   'median_s', s.median_s,
                   'buckets', jsonb_build_object('h1', s.h1, 'h4', s.h4, 'h24', s.h24, 'over', s.over))
                   from approval_stats s)
  ) into v_result;

  return v_result;
end $$;

/* ----------------------------------------------------------------- 11. a review's reply waits like the rest -- */

-- A reply the receptionist wrote under a review and holds (decision 0064, step 6): under Ask me for a member's OK, under
-- Holds it until posts_at, when the hourly sync posts it unless it was stopped. The edge writes them; members read them
-- with the review. A reply posted clears them.
alter table public.google_reviews add column if not exists draft_text text;
alter table public.google_reviews add column if not exists drafted_at timestamptz;
alter table public.google_reviews add column if not exists posts_at timestamptz;
alter table public.google_reviews drop constraint if exists google_reviews_draft_text_check;
alter table public.google_reviews add constraint google_reviews_draft_text_check
  check (draft_text is null or char_length(draft_text) <= 4096);
alter table public.google_reviews drop constraint if exists google_reviews_posts_at_needs_a_draft;
alter table public.google_reviews add constraint google_reviews_posts_at_needs_a_draft
  check (posts_at is null or draft_text is not null);

comment on column public.google_reviews.draft_text is
  'The reply the receptionist wrote for this review and holds (00461, decision 0064 step 6): for a member''s OK under Ask me, or until posts_at under Holds it. Cleared when a reply is posted. The edge writes it.';
comment on column public.google_reviews.drafted_at is
  'When the receptionist wrote the reply it holds (draft_text).';
comment on column public.google_reviews.posts_at is
  'Under Holds it: when the held reply (draft_text) goes; the hourly sync posts it at its first run after, unless a member stopped it, which clears this and leaves the reply waiting for their OK. Null under Ask me.';

/* -------------------------------------------------------- 12. a held reply is seen where its review waits -- */

-- Reports' Reviews draws a review that waits for a reply from reviews_ledger's waiting list (00360), not from the Google
-- read: the list carries the reply the receptionist holds and when it goes, so its line and its Stop stand under the
-- review. As 00360 left it, with the two columns.
create or replace function public.reviews_ledger(p_tenant_id uuid, p_days integer default 30, p_end date default null)
returns jsonb
language plpgsql
stable
set search_path = public
as $$
declare
  v_tz        text;
  v_days      integer := least(greatest(coalesce(p_days, 30), 1), 92);
  v_today     date;
  v_end       date;         -- the period's last day: today, or the earlier day a member picked (00360)
  v_since     date;         -- the period's first day
  v_prior     date;         -- the period before's first day
  v_read_from timestamptz;  -- the instant the period before begins, in the zone
  v_stop      timestamptz;  -- the midnight after the period's last day, in the zone
  -- The most reviews that wait the answer lists: contracts REVIEWS_WAITING_SHOWN, which the database test holds to this.
  v_waiting_shown constant integer := 5;
  -- How far a receptionist's event may be from the reply it wrote: Google's updateTime on the reply moves when the owner
  -- rewrites it on Google, and the event then names a reply that is no longer there.
  v_slack     constant interval := interval '6 hours';
  v_result    jsonb;
begin
  select timezone into v_tz from tenants where id = p_tenant_id;
  if v_tz is null then
    return jsonb_build_object('error', 'unknown_tenant');
  end if;

  v_today     := (now() at time zone v_tz)::date;
  v_end       := least(coalesce(p_end, v_today), v_today);
  v_since     := v_end - (v_days - 1);
  v_prior     := v_since - v_days;
  v_read_from := (v_prior::timestamp) at time zone v_tz;
  v_stop      := ((v_end + 1)::timestamp) at time zone v_tz;

  select jsonb_build_object(
    'timezone', v_tz,
    'today', to_char(v_today, 'YYYY-MM-DD'),
    'end', to_char(v_end, 'YYYY-MM-DD'),
    'days', v_days,
    'on_record', jsonb_build_object(
      'profile', c.profile,
      'places', c.places,
      'complete', coalesce((select g.reviews_complete from google_connections g where g.tenant_id = p_tenant_id), false)),
    -- The profile's reviews dated from the period before's first day, each on its day in the zone, oldest first.
    'written', coalesce((select jsonb_agg(jsonb_build_object(
                 'id', w.id,
                 'd', to_char(w.d, 'YYYY-MM-DD'),
                 'rating', w.rating,
                 'replied', w.replied,
                 'secs', w.secs,
                 'by', w.by) order by w.published_at, w.id)
               from (select r.id, r.rating, r.published_at,
                            (r.published_at at time zone v_tz)::date as d,
                            (r.reply_text is not null) as replied,
                            case when r.reply_text is not null and r.replied_at >= r.published_at
                                 then extract(epoch from (r.replied_at - r.published_at))::integer end as secs,
                            case when r.reply_text is not null and ev.writer = 'receptionist'
                                  and abs(extract(epoch from (ev.wrote_at - r.replied_at))) <= extract(epoch from v_slack)
                                 then 'receptionist' end as by
                       from google_reviews r
                       -- The reply's last event, whoever wrote it: a person's reply through Chanlytics files one with no `by`.
                       left join lateral (
                         select e.data->>'by' as writer, e.created_at as wrote_at
                           from events e
                          where e.tenant_id = r.tenant_id and e.kind = 'google.replied'
                            and e.subject_type = 'review' and e.subject_id = r.id
                          order by e.created_at desc, e.id desc
                          limit 1) ev on true
                      where r.tenant_id = p_tenant_id and r.origin = 'profile' and r.published_at >= v_read_from
                        and r.published_at < v_stop) w), '[]'::jsonb),
    'waiting_total', c.waiting,
    -- The oldest that wait, the ones with no date last: the columns the Google read draws a review by (the reply it holds
    -- and when that goes among them, 00461), and why a reply written for it was held (google.reply_held), where one was.
    'waiting', coalesce((select jsonb_agg(to_jsonb(q) order by q.published_at asc nulls last, q.id)
                 from (select r.id, r.review_id, r.origin, r.rating, r.author, r.author_uri, r.author_photo_uri, r.body,
                              r.language_code, r.published_at, r.reply_text, r.replied_at, r.draft_text, r.posts_at,
                              r.maps_uri, r.first_seen_at,
                              (select e.data->>'why'
                                 from events e
                                where e.tenant_id = r.tenant_id and e.kind = 'google.reply_held'
                                  and e.subject_type = 'review' and e.subject_id = r.id
                                  and e.data->>'why' is not null
                                order by e.created_at desc, e.id desc
                                limit 1) as held
                         from google_reviews r
                        where r.tenant_id = p_tenant_id and r.origin = 'profile' and r.reply_text is null
                        order by r.published_at asc nulls last, r.id
                        limit v_waiting_shown) q), '[]'::jsonb)
  ) into v_result
  from (select count(*) filter (where origin = 'profile')                            as profile,
               count(*) filter (where origin = 'places')                             as places,
               count(*) filter (where origin = 'profile' and reply_text is null)     as waiting
          from google_reviews
         where tenant_id = p_tenant_id) c;

  return v_result;
end $$;

revoke all on function public.reviews_ledger(uuid, integer, date) from public, anon;
grant execute on function public.reviews_ledger(uuid, integer, date) to authenticated, service_role;

comment on function public.reviews_ledger(uuid, integer, date) is
  'Reports › Reviews: the profile''s reviews from the period before''s first day (each on its day in the workspace''s zone, with whether it has a reply, how long the reply took, and who wrote it: the receptionist where its own event is within six hours of the reply), the counts of each origin, whether the record is all of Google''s, and the oldest five that wait for a reply with the reply the receptionist holds for each and when it goes (00461), and why a reply written for one was held. One statement, under the caller''s RLS. `p_end` (00360) is the window''s last day, in the workspace''s zone: null is today, and a day that has not come is read as today.';

-- A held reply written, stopped or posted is told as a reply is (00431's narrowed update, packages/db realtime.ts):
-- Reports' Reviews, Today's Google line and the bell repaint when it appears and when it goes. Not last_seen_at.
create or replace trigger workspace_tell_update after update of reply_text, replied_at, draft_text, posts_at
  on public.google_reviews
  for each row when (old.reply_text is distinct from new.reply_text or old.replied_at is distinct from new.replied_at
                     or old.draft_text is distinct from new.draft_text or old.posts_at is distinct from new.posts_at)
  execute function public.workspace_tell_row_change();

-- 00409 · A campaign ends, runs on trial, and changes its words.
--
-- A campaign ran until someone paused it, sent by itself from its first run when its policy said so, and kept the slot
-- text it was made with. Two columns, both null until written: `until`, the last day it runs (a run on a day past it
-- sends nothing), and `trial_until`, before which a run its policy would send by itself (auto) waits for a person
-- (veto). The change_playbook door (00377) is replaced whole, its signature, rights and answer the same, to take three
-- keys beside its six: `params` (the message's slots, an array of core's specs), `until` and `trial_until`. The two
-- dates take null, which clears them, so an undo can put back what was there; the seven others are never empty. A key
-- outside the nine is refused, as before. The decision is the caller's, naming what it changes (core checkPlaybookPatch
-- judges each value first). A member's session writes both columns, as it writes the rest of a campaign's settings.
-- The start_playbook door (00357) is replaced whole too, its signature, rights and answer the same, to write both
-- columns where a new campaign names them (Ask's card starts one on trial under an auto class); null where it does not.
--
-- Deploy order: this migration first, before the dashboard (runbook, "Apply a migration", step 4). The dashboard reads
-- both columns to change a campaign (db playbookForChange: on a database before it every PUT playbooks/:id fails, the
-- drawer's Pause and Resume and Ask's change card among them), the door before it refuses the three keys, and the start
-- before it writes no trial and no last day, without a word. The edge reads the whole row (00245 playbooks_due's
-- to_jsonb), so it needs nothing of this to run, but only an edge from this change keeps the two (core runPlaybook:
-- effectiveMode, campaignEnded): an older one runs a campaign as its class says and past its last day, so one started
-- on trial under an auto class sends by itself. The edge deploys about three minutes after the dashboard (runbook,
-- "Deploy"): approve no card that starts a campaign on trial or gives one a last day until the edge's /api/version
-- names the merge. Re-runnable.

set local lock_timeout = '3s';

/* -------------------------------------------------------------------------------------------- columns -- */

alter table public.playbooks add column if not exists until date null;
alter table public.playbooks add column if not exists trial_until timestamptz null;

comment on column public.playbooks.until is
  'The last day this campaign runs, on the business''s clock: a run on a day past it sends nothing. Null: it runs until it is paused (00409).';
comment on column public.playbooks.trial_until is
  'Until when this campaign runs on trial: before it, a run its policy would send by itself (auto) waits for a person (veto). Null: no trial (00409).';

-- Column grants are a list (00168, 00278, 00298): the playbook route inserts and the door updates on the member's own
-- session, and a session not granted a column cannot name it. The grant adds to what is held; it takes nothing back.
grant insert (until, trial_until), update (until, trial_until) on public.playbooks to authenticated;

/* ----------------------------------------------------------------------------------------------- the door -- */

create or replace function public.change_playbook(
  p_tenant_id uuid,
  p_playbook_id uuid,
  p_set jsonb,
  p_decision jsonb default '{}'::jsonb,
  p_via text default null,
  p_undo_of uuid default null
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_set   jsonb := case when jsonb_typeof(p_set) = 'object' then p_set else '{}'::jsonb end;
  v_was   public.playbooks;
  v_diff  jsonb;
  v_rows  integer;
  v_verb  text;
begin
  if v_actor is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  if p_tenant_id is null or p_playbook_id is null then
    raise exception 'change_playbook: a playbook is named by its workspace and its id' using errcode = '22004';
  end if;
  -- The nine columns a change may name, and nothing else: a key outside them is refused, never ignored.
  if v_set = '{}'::jsonb or exists (
    select 1 from jsonb_object_keys(v_set) k
     where k not in ('state', 'name', 'run_hour', 'cap_per_run', 'gap_days', 'cadence_days', 'params', 'until',
                     'trial_until')
  ) then
    raise exception 'change_playbook: name what changes: state, name, run_hour, cap_per_run, gap_days, cadence_days, params, until or trial_until'
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
    from public.playbooks
   where id = p_playbook_id and tenant_id = p_tenant_id
   for update;
  if not found then
    raise exception 'Playbook not found.' using errcode = 'P0002';
  end if;
  -- What differs from the row as it stands, under the lock: only that is written, answered as `was` and recorded. Where
  -- nothing does, nothing is written and no line is (a second press of Pause, or two at once): the lock above has already
  -- asked the caller's rights, so a seat that may not change it is still told it is not there.
  select coalesce(jsonb_object_agg(k, v_set -> k), '{}'::jsonb) into v_diff
    from jsonb_object_keys(v_set) k
   where (to_jsonb(v_was) ->> k) is distinct from (v_set ->> k);
  if v_diff = '{}'::jsonb then
    return jsonb_build_object('id', p_playbook_id, 'was', '{}'::jsonb, 'decision_id', null, 'undo_dropped', false);
  end if;
  update public.playbooks p
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
  -- The verb follows the state that moved, never the one named: a state named as it stands is in no diff.
  v_verb := case v_diff ->> 'state'
              when 'running' then 'start_playbook'
              when 'paused' then 'pause_playbook'
              else 'change_playbook'
            end;
  return jsonb_build_object(
           'id', p_playbook_id,
           'was', (select jsonb_object_agg(k, to_jsonb(v_was) -> k) from jsonb_object_keys(v_diff) k))
      || public.member_decision(p_tenant_id, 'playbook', p_playbook_id, v_verb, coalesce(p_decision, '{}'::jsonb),
                                p_via, p_undo_of);
end $$;

revoke execute on function public.change_playbook(uuid, uuid, jsonb, jsonb, text, uuid) from public, anon;
grant execute on function public.change_playbook(uuid, uuid, jsonb, jsonb, text, uuid) to authenticated, service_role;
comment on function public.change_playbook(uuid, uuid, jsonb, jsonb, text, uuid) is
  'A member changes a playbook in place and its line in the ledger together (the change_playbook door): the row locked on the caller''s rights, of the columns p_set names (state, name, run_hour, cap_per_run, gap_days, cadence_days, params, until, trial_until) only those that differ from the row written, then start_playbook or pause_playbook where the state moved, else change_playbook, as theirs (member_decision), in one transaction. A key outside the nine is refused (22023); so is a null, but for until and trial_until, which it clears, and a params that is not an array. Security invoker: the update policy (is_acting_member: an owner, an operator, or a partner on a session that showed its second factor) and the column grants judge it. P0002 where the caller cannot see or change the row. Returns id, was (what each written column held), decision_id and undo_dropped; where nothing differs, nothing is written and no line: was is empty and decision_id null (00377, 00409).';

/* ------------------------------------------------------------------------------------------- the start -- */

create or replace function public.start_playbook(
  p_tenant_id uuid,
  p_playbook jsonb,
  p_decision jsonb default '{}'::jsonb,
  p_via text default null,
  p_undo_of uuid default null
) returns jsonb
language plpgsql
security invoker
set search_path = public
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
  -- day and its trial's end are the caller's (00409), each null where it names none.
  insert into public.playbooks (tenant_id, name, trigger, list_id, list_key, template_id, template_name,
                                template_language, params, policy_class, state, run_hour, cap_per_run, gap_days,
                                cadence_days, channels, until, trial_until, created_by)
  select p_tenant_id, r.name, r.trigger, r.list_id, r.list_key, r.template_id, r.template_name,
         r.template_language, r.params, r.policy_class, 'running', r.run_hour, r.cap_per_run, r.gap_days,
         r.cadence_days, r.channels, r.until, r.trial_until, v_actor
    from jsonb_populate_record(null::public.playbooks, p_playbook) r
  returning id into v_id;
  return jsonb_build_object('id', v_id)
      || public.member_decision(p_tenant_id, 'playbook', v_id, 'start_playbook', p_decision, p_via, p_undo_of);
end $$;

revoke execute on function public.start_playbook(uuid, jsonb, jsonb, text, uuid) from public, anon;
grant execute on function public.start_playbook(uuid, jsonb, jsonb, text, uuid) to authenticated, service_role;
comment on function public.start_playbook(uuid, jsonb, jsonb, text, uuid) is
  'A member starts a playbook and its line in the ledger together (00357): the row, running, then the start_playbook decision as theirs (member_decision), in one transaction. Security invoker: the insert is judged by the table''s own policy, checks and unique indexes, as the route''s insert was. Its last day (until) and its trial''s end (trial_until) are written where p_playbook names them, null where it does not (00409). Returns id, decision_id and undo_dropped.';

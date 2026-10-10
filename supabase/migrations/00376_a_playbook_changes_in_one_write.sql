-- 00376 · A playbook changed in place and its line in the ledger are one write.
--
-- PUT playbooks/:id wrote a pause as two statements on the member's session, the state and then the route's own insert
-- into `decisions`, neither counted: a decision that failed left a playbook paused with nobody on record as having paused
-- it, and an update RLS refused raised nothing and answered success (the 8 October architecture review; the moment spec
-- §4.9 A5, decision D26). A rename or a new hour was rewritten whole, with no line at all. This is the one door for a
-- change in place, in 00357's shape:
--
--   change_playbook   the member's one call: the row, locked, on the CALLER's rights (security invoker, so the table's
--                     update policy and column grants judge it as the route's update was judged), of the columns p_set
--                     names only those whose value differs from the row's written, then the decision as theirs
--                     (member_decision, 00357) in one transaction. The verb is start_playbook or pause_playbook where
--                     the state moves, as the drawer's switch always wrote, else change_playbook: a state named as it
--                     stands moves nothing. It answers the row's id, what each written column held (`was`, read under
--                     the lock, so an undo puts back what was there), the decision's id and undo_dropped. Where nothing
--                     differs nothing is written and no line is: `was` is empty and the decision null (a second press
--                     of Pause, or two at once). A null is refused (22023): none of the six columns is ever empty. A
--                     playbook the caller cannot see or change, or that is not the workspace's, is P0002, and nothing is
--                     written: a forbidden update raises nothing, so the row is locked first and the update counted.
--                     Who may change one is is_acting_member's to say, by the update policy the lock and the write are
--                     judged by, and again by member_decision: an owner or an operator, or a partner on a session that
--                     showed its second factor (0013). A viewer, and a partner on a password alone, find no row. It
--                     reads no membership itself, so it is no seat's door of its own (second-factor-catalog).
--                     What a change may name, and each value's bounds, is core's checkPlaybookPatch before this is
--                     called; the six columns are held here too, so a caller can never write a seventh.
--   decisions_verb_check   00326's list, with 'change_playbook'.
--
-- Deploy order: either. A dashboard that finds no change_playbook here (PGRST202) writes the change the way it did
-- before, for one release (packages/db writePlaybookChange answers "missing"); the dashboard from before this keeps its
-- two statements and is not broken by it. Re-runnable.

/* ----------------------------------------------------------------------------------------------- the verb -- */

alter table public.decisions drop constraint if exists decisions_verb_check;
alter table public.decisions add constraint decisions_verb_check check (
  verb = any (array[
    'approve', 'edit', 'decline', 'snooze', 'wake', 'take_over',
    'hand_back', 'resolve', 'archive', 'reply', 'cancel_send', 'pause_agent',
    'resume_agent', 'invite', 'revoke_invite', 'change_role', 'remove_member', 'erase',
    'whisper', 'connect_channel', 'consent_change', 'send_broadcast', 'cancel_broadcast', 'start_playbook',
    'pause_playbook', 'reply_review', 'export', 'end_call', 'record_deal', 'make_list',
    'rename_list', 'change_list_rule', 'add_to_list', 'drop_from_list', 'archive_list', 'restore_list',
    'delete_list', 'import', 'open_recording', 'merge', 'change_playbook'
  ])
);

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
  -- The six columns a change may name, and nothing else: a key outside them is refused, never ignored.
  if v_set = '{}'::jsonb or exists (
    select 1 from jsonb_object_keys(v_set) k
     where k not in ('state', 'name', 'run_hour', 'cap_per_run', 'gap_days', 'cadence_days')
  ) then
    raise exception 'change_playbook: name what changes: state, name, run_hour, cap_per_run, gap_days or cadence_days'
      using errcode = '22023';
  end if;
  -- A null is no value: none of the six columns is ever empty, so it is refused, never read as "keep what it holds".
  if exists (select 1 from jsonb_each(v_set) e where jsonb_typeof(e.value) = 'null') then
    raise exception 'change_playbook: name a value for each column named: none of the six is ever empty'
      using errcode = '22023';
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
         cadence_days = coalesce((v_diff ->> 'cadence_days')::integer, p.cadence_days)
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
  'A member changes a playbook in place and its line in the ledger together (the change_playbook door): the row locked on the caller''s rights, of the columns p_set names (state, name, run_hour, cap_per_run, gap_days, cadence_days) only those that differ from the row written, then start_playbook or pause_playbook where the state moved, else change_playbook, as theirs (member_decision), in one transaction. A null is refused (22023). Security invoker: the update policy (is_acting_member: an owner, an operator, or a partner on a session that showed its second factor) and the column grants judge it. P0002 where the caller cannot see or change the row. Returns id, was (what each written column held), decision_id and undo_dropped; where nothing differs, nothing is written and no line: was is empty and decision_id null.';

-- 00587 · A sequence to leads may send on its own (decision 0120, stage 3 of "one timeline per person").
--
-- Cold email only ever waited for an OK or held each batch thirty minutes: change_playbook refused Send it for a sequence
-- to leads (00462). Its owner may now choose it, on a sequence that exists and whose emails they have seen go.
--
--   change_playbook   no longer refuses mode auto where the step is a reach-out's. Everything else is 00539's form,
--                     word for word: the keys a change may name, the locks, the diff, the ledger's line.
--
-- What stays as it was, on purpose: a NEW sequence to leads still starts held or asked (sequence_mode_for and
-- sequence_create_leads take veto or ask, never auto), and a step whose words are new still waits for its first OK
-- whatever its sequence says (contracts batchModeOf). So nothing sends on its own that its owner did not set to.
--
-- Deploy order: either. A build before this still offers two choices; a build after it against a database before it
-- gets the old refusal in the door's words, and nothing is written. Re-runnable.

set local lock_timeout = '3s';

create or replace function public.change_playbook(p_tenant_id uuid, p_playbook_id uuid, p_set jsonb, p_decision jsonb DEFAULT '{}'::jsonb, p_via text DEFAULT NULL::text, p_undo_of uuid DEFAULT NULL::uuid) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
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
  -- none: pressing Send decided it. A sequence to leads takes any of the three since 00587 (decision 0120).
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

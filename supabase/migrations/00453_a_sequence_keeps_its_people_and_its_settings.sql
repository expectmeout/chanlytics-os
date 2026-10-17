-- 00453 · A sequence keeps its people and its settings (decision 0060; the Sequences loop review of 17 Oct 2026).
--
-- Two holes in the loop 00440-00452 left, closed:
--
--   sequence_batch_places_back   A customer's batch cut off (skipped, its day gone, stopped, or failed) leaves the people it
--   sequence_batches_cut_off     never reached where they stood before it: in line again for its step, from the day their
--                                wait ended (due on the step's next run), or, for a first step that sent them nothing, out
--                                of a place they never had (and back in the one a new start took them from). Until now
--                                their sends stayed queued, so People said "Up next" for ever, and a step after the first
--                                never reached them again: it asks for the place before it, and they stood at its own.
--   sequence_people              A send of a batch that was cut off is no longer "next": they are in line, as above.
--   change_playbook              A first step's hour, cap, last day, trial and name reach the steps after it. A step after
--   sequence_step_save           the first copied them once, as it was made, so a changed hour moved step 1 alone, a
--                                rename left later batches and the bell under the old name, and a trial held step 1 alone.
--                                A step added later takes them all from the first; one given a name of its own keeps it.
--
-- Then the backfills: every customer's batch already cut off gives back its places, and every step after the first takes
-- its first step's settings. The sends stay queued: a run's sheet reads them as never reached (run-report cutOffWordsOf).
--
-- Deploy order: either. Re-runnable.

set local lock_timeout = '3s';

/* ---------------------------------------------------------------- 1. a batch cut off gives back its places -- */

create or replace function public.sequence_batch_places_back(p_batch_id uuid)
returns integer
language plpgsql security definer
set search_path = public
as $$
declare
  v_b public.sequence_batches%rowtype;
  v_place int;
  v_n int;
begin
  select * into v_b from public.sequence_batches where id = p_batch_id;
  if v_b.id is null or v_b.state not in ('canceled', 'failed') then
    return 0;
  end if;
  -- A customer's step's batch alone: a lead's sends are the lead clock's to close (run_canceled), a one-off has no places.
  select st.place into v_place from public.sequence_steps st where st.id = v_b.step_id and st.kind = 'moment';
  if v_place is null then
    return 0;
  end if;
  with stuck as (
    -- Each person it was to reach and never did, where it is still their latest send in the sequence.
    select s.contact_id
      from public.sequence_sends s
     where s.batch_id = p_batch_id and s.lead_id is null and s.state = 'queued'
       and not exists (select 1 from public.sequence_sends o
                        where o.sequence_id = s.sequence_id and o.lead_id is null and o.contact_id = s.contact_id
                          and o.id <> s.id and o.created_at > s.created_at)
  ),
  latest as (
    select distinct on (e.contact_id) e.id, e.contact_id, e.state, e.place, e.next_at, e.sent_at
      from public.sequence_enrollments e
      join stuck k on k.contact_id = e.contact_id
     where e.sequence_id = v_b.sequence_id and e.lead_id is null
     order by e.contact_id, e.entered_at desc, e.id desc
  ),
  -- The place the batch gave them, still standing: in, at its step, with no day of its own (00441 wrote none for it).
  placed as (
    select l.* from latest l where l.state = 'in' and l.place = v_place and l.next_at is null
  ),
  -- A first step that sent them nothing in this place: they were never in it.
  gone as (
    delete from public.sequence_enrollments e using placed p
     where e.id = p.id and v_place = 1 and p.sent_at is null
    returning e.contact_id
  ),
  -- The place a new start took them from (00441: one still in it leaves as started_again), stands again with its day.
  again as (
    update public.sequence_enrollments e
       set state = 'in', why = null, ended_at = null,
           next_at = coalesce(e.sent_at + make_interval(days => coalesce(
                       (select n.after_days from public.sequence_steps n
                         where n.sequence_id = e.sequence_id and n.place = e.place + 1), 0)), now())
      from gone g
     where e.sequence_id = v_b.sequence_id and e.lead_id is null and e.contact_id = g.contact_id
       and e.state = 'left' and e.why = 'started_again' and e.ended_at >= v_b.created_at
    returning e.id
  ),
  -- Anyone else: in line again for the step, from the day the wait before it ended (when the step before went, and its
  -- wait), so its next run reaches them.
  back as (
    update public.sequence_enrollments e
       set place = greatest(v_place - 1, 1),
           next_at = coalesce(e.sent_at + make_interval(days => coalesce(
                       (select n.after_days from public.sequence_steps n
                         where n.sequence_id = e.sequence_id and n.place = greatest(v_place - 1, 1) + 1), 0)), now())
      from placed p
     where e.id = p.id and not (v_place = 1 and p.sent_at is null)
    returning e.id
  )
  select (select count(*) from gone) + (select count(*) from back) into v_n;
  return v_n;
end $$;

comment on function public.sequence_batch_places_back(uuid) is
  'A customer''s batch cut off (canceled or failed: skipped, its day gone, stopped, or a run that failed) gives back the places it gave (0060; the loop review): each person it never reached, where it is their latest send, is in line again for its step from the day their wait ended, or, for a first step that sent them nothing, out of the place it made (and back in one a new start took them from). Its sends stay queued, as a run''s sheet reads them. How many places moved. Service role only.';

create or replace function public.sequence_batches_cut_off() returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  perform public.sequence_batch_places_back(NEW.id);
  return null;
end $$;

drop trigger if exists sequence_batches_cut_off on public.sequence_batches;
create trigger sequence_batches_cut_off after update of state on public.sequence_batches
  for each row when (NEW.state in ('canceled', 'failed') and OLD.state is distinct from NEW.state)
  execute function public.sequence_batches_cut_off();

revoke all on function public.sequence_batch_places_back(uuid) from public, anon, authenticated;
revoke all on function public.sequence_batches_cut_off() from public, anon, authenticated;
grant execute on function public.sequence_batch_places_back(uuid) to service_role;
grant execute on function public.sequence_batches_cut_off() to service_role;

/* --------------------------------------------- 2. who is in it: a cut-off batch's people are not "up next" -- */

create or replace function public.sequence_people(p_tenant_id uuid, p_sequence_id uuid, p_limit integer default 50)
returns jsonb
language sql stable
set search_path = ''
as $$
  with lim as (select least(greatest(coalesce(p_limit, 50), 1), 200) as n),
  -- Each person's latest send in the sequence: where they stand now.
  latest as (
    select distinct on (coalesce(s.lead_id, s.contact_id))
           s.id as send_id, s.batch_id, s.step_id, s.contact_id, s.lead_id, s.state, s.reason, s.hold_detail,
           s.send_at, s.sent_at, s.drafted_at, s.created_at, s.draft, s.angle, b.state as batch_state, b.scheduled_for
      from public.sequence_sends s
      join public.sequence_batches b on b.id = s.batch_id
     where s.tenant_id = p_tenant_id and s.sequence_id = p_sequence_id
     order by coalesce(s.lead_id, s.contact_id), s.created_at desc, s.id desc
  ),
  placed as (
    select l.*, st.place,
           case
             when l.state = 'held' then 'held'
             when l.state = 'drafted' then 'to_send'
             when l.batch_state = 'pending_approval' and l.state in ('queued', 'planned') then 'waiting'
             when l.state in ('queued', 'planned', 'claimed') and l.batch_state not in ('canceled', 'failed') then 'next'
             else null
           end as grp,
           coalesce(l.drafted_at, l.send_at, l.scheduled_for, l.created_at) as at
      from latest l
      left join public.sequence_steps st on st.id = l.step_id
  ),
  enrolled as (
    select e.id as enrollment_id, e.contact_id, e.lead_id, e.state, e.place, e.why, e.next_at, e.sent_at,
           coalesce(e.ended_at, e.moved_at) as at
      from public.sequence_enrollments e
     where e.tenant_id = p_tenant_id and e.sequence_id = p_sequence_id
  ),
  -- Someone in it between steps (no send of theirs pending), and those done or out, from their enrollments.
  between as (
    select e.* from enrolled e
     where e.state = 'in'
       and not exists (select 1 from placed p where p.grp is not null
                         and coalesce(p.lead_id, p.contact_id) = coalesce(e.lead_id, e.contact_id))
  ),
  rows_of as (
    -- An email handed to its owner, whole (00429 sequence_sends_drafted_is_whole): what their mail app opens with.
    select p.grp, p.contact_id, p.lead_id, p.place, p.at, p.reason as why, p.hold_detail, p.send_id, p.batch_id,
           null::uuid as enrollment_id,
           case when p.grp = 'to_send' and jsonb_typeof(p.draft) = 'object'
                     and jsonb_typeof(p.draft -> 'to') = 'string' and jsonb_typeof(p.draft -> 'subject') = 'string'
                     and jsonb_typeof(p.draft -> 'text') = 'string'
                then jsonb_build_object(
                       'to', p.draft ->> 'to',
                       'subject', p.draft ->> 'subject',
                       'text', p.draft ->> 'text',
                       'follow_up', coalesce(jsonb_typeof(p.draft -> 'parent_id') = 'string', false),
                       'angle', p.angle,
                       'drafted_at', coalesce(p.drafted_at, p.created_at))
           end as draft
      from placed p where p.grp is not null
    union all
    select 'in', b.contact_id, b.lead_id, b.place, coalesce(b.next_at, b.at), null, null, null, null, b.enrollment_id,
           null::jsonb
      from between b
    union all
    select case when e.state = 'done' then 'done' else 'left' end, e.contact_id, e.lead_id, e.place, e.at, e.why,
           null, null, null, e.enrollment_id, null::jsonb
      from enrolled e where e.state in ('done', 'left')
  ),
  named as (
    select r.*,
           coalesce(c.display_name, c.wa_profile_name, ld.business_name) as name,
           row_number() over (partition by r.grp
                              order by case when r.grp in ('done', 'left') then r.at end desc nulls last, r.at, r.contact_id, r.lead_id) as pos
      from rows_of r
      left join public.contacts c on c.id = r.contact_id and c.erased_at is null
      left join public.leads ld on ld.id = r.lead_id
  )
  select jsonb_build_object(
    'counts', coalesce((select jsonb_object_agg(g.grp, g.n) from (select grp, count(*) as n from named group by grp) g),
                       '{}'::jsonb),
    'rows', coalesce((select jsonb_agg(jsonb_build_object(
                        'group', n.grp,
                        'contact_id', n.contact_id,
                        'lead_id', n.lead_id,
                        'enrollment_id', n.enrollment_id,
                        'send_id', n.send_id,
                        'batch_id', n.batch_id,
                        'name', n.name,
                        'place', n.place,
                        'at', n.at,
                        'why', n.why,
                        'hold_detail', n.hold_detail,
                        'draft', n.draft) order by n.grp, n.pos)
                        from named n where n.pos <= (select l.n from lim l)), '[]'::jsonb))
$$;

comment on function public.sequence_people(uuid, uuid, integer) is
  'Who is in a sequence (0060), by where they stand, each group''s count whole and its first p_limit (1 to 200, 50) rows: waiting (a batch waiting for your OK), held (by the check, with why), to_send (an email for you to send, with its draft as it was handed over: 00447), next (going out: never a send of a batch cut off, 00453), in (between steps, their next step''s day), done, and left (with why). A person by their name, a lead by its business''s. Under the caller''s row security.';

/* -------------------------------------------- 3. a sequence's settings are its first step's, every step's -- */

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
    from public.sequence_steps
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
  -- A sequence's settings are its first step's (0060; the loop review, 17 Oct 2026): a customer's steps after it run at
  -- its hour, under its cap, its last day and its trial, so a change here reaches all of them; one named as the first was
  -- takes its new name (a step given a name of its own keeps it). On the caller's rights, as the first step's row was.
  if v_was.id = v_was.sequence_id and v_was.kind = 'moment' then
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
           'was', (select jsonb_object_agg(k, to_jsonb(v_was) -> k) from jsonb_object_keys(v_diff) k))
      || public.member_decision(p_tenant_id, 'playbook', p_playbook_id, v_verb, coalesce(p_decision, '{}'::jsonb),
                                p_via, p_undo_of);
end $$;

comment on function public.change_playbook(uuid, uuid, jsonb, jsonb, text, uuid) is
  'A member changes a playbook in place and its line in the ledger together (the change_playbook door): the row locked on the caller''s rights, of the columns p_set names (state, name, run_hour, cap_per_run, gap_days, cadence_days, params, until, trial_until) only those that differ from the row written, then start_playbook or pause_playbook where the state moved, else change_playbook, as theirs (member_decision), in one transaction. A sequence''s first step''s hour, cap, last day and trial reach its customer''s steps after it, and its name those named as it was (00453). A key outside the nine is refused (22023); so is a null, but for until and trial_until, which it clears, and a params that is not an array. Security invoker: the update policy and the column grants judge it. P0002 where the caller cannot see or change the row. Returns id, was (what each written column held), decision_id and undo_dropped; where nothing differs, nothing is written and no line (00377, 00416, 00453).';

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
                                       cap_per_run, until, trial_until, channels, created_by)
    values (p_tenant_id, 'moment', coalesce(nullif(btrim(v_step->>'name'), ''), v_first.name), 'after_step', v_last.id,
            (v_step->>'after_days')::int, v_only, v_t.id, v_t.name, v_t.language,
            coalesce(v_step->'params', '[]'::jsonb), v_first.policy_class, 'running', v_first.run_hour,
            v_first.cap_per_run, v_first.until, v_first.trial_until,
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
  'A customer''s step after the first (D6, 0060), added at the end of its sequence or changed (p_step.id): its wait (after_days), what must still hold (only_if), its message, channels and slots; a new one under the first step''s class, hour, cap, last day and trial (00453), named as it unless given a name. On the member''s own rights (the steps'' policies and column grants); the change_step decision rides in the same transaction. Answers id, place, was and the decision''s.';

/* ------------------------------------------------------------------------------------------ 4. backfills -- */

-- Every customer's batch already cut off gives back its places, oldest first.
do $$
declare
  r record;
begin
  for r in
    select b.id
      from public.sequence_batches b
      join public.sequence_steps st on st.id = b.step_id and st.kind = 'moment'
     where b.state in ('canceled', 'failed')
       and exists (select 1 from public.sequence_sends s where s.batch_id = b.id and s.lead_id is null and s.state = 'queued')
     order by b.created_at, b.id
  loop
    perform public.sequence_batch_places_back(r.id);
  end loop;
end $$;

-- Every customer's step after the first takes its first step's hour, cap, last day and trial (its name stays: a copy of an
-- old one cannot be told from a name given).
update public.sequence_steps n
   set run_hour = f.run_hour, cap_per_run = f.cap_per_run, until = f.until, trial_until = f.trial_until
  from public.sequence_steps f
 where f.id = n.sequence_id and n.id <> f.id and n.kind = 'moment' and n.trigger = 'after_step'
   and (n.run_hour, n.cap_per_run, n.until, n.trial_until)
       is distinct from (f.run_hour, f.cap_per_run, f.until, f.trial_until);

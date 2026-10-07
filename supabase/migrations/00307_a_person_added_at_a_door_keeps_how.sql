-- 00307 · A person added at a door keeps how.
--
-- The Reports lenses spec, K3, the other half of 00306. A person added at a door (the calendar sweep, create_person,
-- import_person, lead_set_stage, reach_out_person, lead_link_contact) is already declared by the contact.added event their
-- writer inserts beside them, whose `source` is calendar, lead, import or the hand's own word. This trigger reads that
-- event and calls 00306's door, person_set_first_touch, so none of those writers is restated, and the first value wins as
-- it does for a message or a call. A lead's id is the ref where the event names one (reach_out_person's does; lead_set_stage's
-- and the trigger that converts a lead onto a person who wrote first name none, so their ref is null). Cuttable: without
-- it these people read null and People works their source out from the same event, as before. Either deploy order works.
--
-- The door mapping is written once, here, and its twin is people_list's `came_from` (00276, the `ad.source` arms of its
-- case): calendar, lead and import are themselves, any other word, or none, is manual. People's `came_from` still works
-- its answer out when it reads and is not changed here (no page changes in this batch); Reports phase B's registry makes it
-- read contacts.acquired_via first, which is when the two derivations become one. Until then they agree, because they read
-- the same event the same way: the first contact.added event of the person decides, and a word they do not know is manual.
--
-- What it costs, on the ledger that is written on every action. The WHEN is a kind, a subject type and a subject, so a row
-- of any other kind never enters the function; only a person's arrival does, once per person, and that call is one
-- primary-key update that finds nothing to change after their first touch is taken. It traps its own failure as 00306's
-- triggers do (the call sits in an exception block, a subtransaction): a warning and a person with no first touch, never
-- a lost event, so never a lost person, calendar sweep or import. After insert, so the event is on record whatever the
-- stamp does. The trigger is on the partitioned parent, so every partition, and each one made later, carries it.
--
-- The lock. The trigger is created with `create or replace trigger`, which takes SHARE ROW EXCLUSIVE on events and on each
-- partition until commit: writers of the ledger wait for the file, readers do not. `drop trigger if exists` first would take
-- ACCESS EXCLUSIVE on all of them, and every action in the product writes this table, so it is not used. One table family
-- and one lock taken, so there is no second table for a customer's write to be holding while this file waits: the 3 s guard
-- of 00259 bounds the wait, and if it times out nothing was applied and the owner re-runs the file when the line is quiet.
-- Every statement re-runs.
set local lock_timeout = '3s';
do $$
begin
  raise notice 'lock_timeout for this migration: %', current_setting('lock_timeout');
  if current_setting('lock_timeout') <> '3s' then
    raise warning 'this file was applied outside a transaction, so SET LOCAL did nothing: run it inside begin/commit, or set lock_timeout yourself before it';
  end if;
end $$;

create or replace function public.events_note_first_touch()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_word text := NEW.data ->> 'source';
  v_via  text := case when v_word in ('calendar', 'lead', 'import') then v_word else 'manual' end;
begin
  perform public.person_set_first_touch(
    NEW.tenant_id,
    NEW.subject_id,
    v_via,
    case when v_via = 'lead' then NEW.data ->> 'lead_id' end
  );
  return null;
exception when others then
  raise warning 'events_note_first_touch: %', sqlerrm;
  return null;
end $$;

revoke execute on function public.events_note_first_touch() from public, anon, authenticated;
comment on function public.events_note_first_touch() is
  'The first touch of a person added at a door (K3): the source of the contact.added event beside them (calendar, lead, import, any other word or none is manual), through person_set_first_touch, with the lead''s id as the ref where the event names one. The mapping is people_list''s came_from for a door, written once. Never fails the event''s writer: a failure is a warning.';

create or replace trigger events_note_first_touch after insert on public.events
  for each row
  when (new.kind = 'contact.added' and new.subject_type = 'contact' and new.subject_id is not null)
  execute function public.events_note_first_touch();

-- 00310 · A lead's stage event says where the lead came from.
--
-- The Reports lenses spec, K5, the other half. lead.stage carried the stage a lead went to and never the one it left;
-- 00309 now keeps that on the lead (stage_from). This completes the event with it: one trigger on the ledger, so the
-- writers that say a lead's stage (lead_set_stage, set_email_marketing, reach_out_reply_undo) are not restated and a later
-- one is held too. It adds `from` only when the lead moved into the stage the event names in this very transaction
-- (stage_at is now(), and the stage is the event's): an event written for a lead that did not move, or that moved in
-- another transaction, is left as its writer wrote it, never given an older move's from. A writer's own `from` stands. The
-- bulk door's one event names no lead and is not touched. No backfill: an older event has no from, and a tile treats that
-- as unknown.
--
-- It reads one row of leads and writes only the event it is part of, and traps its own failure: a lookup that cannot be
-- made is a warning and the event lands as written. It fires for a lead.stage row about a lead only (the WHEN), so no other
-- event enters it. Either deploy order works (nothing reads `from` yet).
--
-- The lock. A trigger on the events ledger locks its partitions until commit (as 00307's does): one table, one wait, the
-- 3 s guard of 00259; if it times out nothing was applied and the owner re-runs it when the line is quiet. This file reads
-- leads but takes no lock on it. Every statement re-runs.
set local lock_timeout = '3s';
do $$
begin
  raise notice 'lock_timeout for this migration: %', current_setting('lock_timeout');
  if current_setting('lock_timeout') <> '3s' then
    raise warning 'this file was applied outside a transaction, so SET LOCAL did nothing: run it inside begin/commit, or set lock_timeout yourself before it';
  end if;
end $$;

create or replace function public.events_complete_lead_stage()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_from text;
begin
  if jsonb_typeof(NEW.data) = 'object' and not (NEW.data ? 'from') then
    select l.stage_from into v_from
      from public.leads l
     where l.id = NEW.subject_id and l.tenant_id = NEW.tenant_id
       and l.stage_at = now() and l.stage = NEW.data ->> 'stage';
    if v_from is not null then
      NEW.data := NEW.data || jsonb_build_object('from', v_from);
    end if;
  end if;
  return NEW;
exception when others then
  raise warning 'events_complete_lead_stage: %', sqlerrm;
  return NEW;
end $$;

revoke all on function public.events_complete_lead_stage() from public, anon, authenticated;
comment on function public.events_complete_lead_stage() is
  'Adds `from` to a lead.stage event when the lead moved into the event''s stage in this transaction (K5), whoever wrote the event. A writer''s own from stands; an event for a lead that did not just move is left as written. Never fails the insert: a failure is a warning.';

create or replace trigger events_complete_lead_stage before insert on public.events
  for each row
  when (new.kind = 'lead.stage' and new.subject_type = 'lead' and new.subject_id is not null)
  execute function public.events_complete_lead_stage();

-- 00312 · A transferred call says whether it was answered.
--
-- The Reports lenses spec, K7 (the phone half). The receptionist hands a caller to a person with the transfer tool, and
-- the provider says how the call ended: call_transfer (it was transferred), transfer_bridged (the destination picked up and
-- the call was bridged), transfer_cancelled (the attempt was aborted before completion); the product already words them
-- (call-dto.ts DISCONNECTION_LABELS, held to this file by a database test). Nothing kept that as a fact a report can count.
-- call_transfer_answered is the one place that says which endings are a transfer and whether a person picked up (null: not
-- a transfer); the triggers write call.transferred { answered } when a call's ending becomes one. call_take_over is the
-- dashboard's own take-over, not a transfer.
--
-- The trigger is on the call row, not in the webhook: every writer of the ending is held (the webhook's call_ended and
-- call_analyzed, the reconcile sweep), and nothing is added to the answer the provider waits for. A call row is written
-- several times (call_started, call_ended, call_analyzed, a retried delivery), and the event is written once: on the write
-- that first makes the ending a transfer (the WHEN asks the old ending as well as the new, so a redelivery, the analysis
-- that carries the same ending, and a later word that names another transfer all write nothing). A transfer that did not
-- connect and left the caller with the receptionist ends with another reason and writes none. No backfill.
--
-- It sits beside 00306's first-touch triggers on calls and neither depends on the other: this one reads only NEW and
-- writes only an event of a kind no trigger on events reacts to, and theirs write a person, so the order Postgres fires
-- them in (by name) cannot matter, and each traps its own failure, so a failure of one never stops the other. It writes
-- only the event, traps its own failure (a call with no event is a warning, never a failed ingest), and fires only for a
-- transfer ending (the WHEN). Either deploy order works (nothing reads it yet; an older dashboard words the kind as
-- "Call · transferred" until it deploys).
--
-- The lock. A trigger on calls takes SHARE ROW EXCLUSIVE (writers wait, readers do not) until commit: one table, one wait,
-- the 3 s guard of 00259; if it times out nothing was applied and the owner re-runs it when the line is quiet. Every
-- statement re-runs.
set local lock_timeout = '3s';
do $$
begin
  raise notice 'lock_timeout for this migration: %', current_setting('lock_timeout');
  if current_setting('lock_timeout') <> '3s' then
    raise warning 'this file was applied outside a transaction, so SET LOCAL did nothing: run it inside begin/commit, or set lock_timeout yourself before it';
  end if;
end $$;

create or replace function public.call_transfer_answered(p_reason text)
returns boolean
language sql
immutable
set search_path = public
as $$
  -- null: not a transfer. true: a person picked up (call_transfer, and transfer_bridged for a warm one). false: it did not go through.
  select case
           when p_reason in ('call_transfer', 'transfer_bridged') then true
           when p_reason = 'transfer_cancelled' then false
         end
$$;

revoke all on function public.call_transfer_answered(text) from public, anon;
grant execute on function public.call_transfer_answered(text) to authenticated, service_role;
comment on function public.call_transfer_answered(text) is
  'Whether a call''s ending (calls.disconnection_reason) was a transfer and a person picked up (K7): true for call_transfer and transfer_bridged, false for transfer_cancelled, null for any other ending or none. Held to the product''s own words for the endings (call-dto.ts DISCONNECTION_LABELS) by a database test.';

create or replace function public.calls_note_transfer()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
  values (NEW.tenant_id, 'call.transferred', 'call', 'call', NEW.id,
          jsonb_build_object('answered', public.call_transfer_answered(NEW.disconnection_reason)));
  return null;
exception when others then
  raise warning 'calls_note_transfer: %', sqlerrm;
  return null;
end $$;

revoke all on function public.calls_note_transfer() from public, anon, authenticated;
comment on function public.calls_note_transfer() is
  'Writes call.transferred { answered } when a call''s ending becomes a transfer (K7), once per call: on its first row when it arrives ending in one, or on the update that first makes the ending one. Never fails the call''s writer: a failure is a warning.';

create or replace trigger calls_note_transfer after insert on public.calls
  for each row when (public.call_transfer_answered(new.disconnection_reason) is not null)
  execute function public.calls_note_transfer();

-- Only the move from an ending that is not a transfer into one: the old row is asked too, so the same ending delivered
-- again, or another transfer reason after the first, writes nothing.
create or replace trigger calls_note_transfer_on_update after update of disconnection_reason on public.calls
  for each row
  when (public.call_transfer_answered(new.disconnection_reason) is not null
        and public.call_transfer_answered(old.disconnection_reason) is null)
  execute function public.calls_note_transfer();

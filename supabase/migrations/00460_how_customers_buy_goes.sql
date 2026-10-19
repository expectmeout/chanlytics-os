-- 00460 · How customers buy goes: tenants.sells_by is dropped.
--
-- docs/decisions/0008-a-proposal-is-part-of-the-deal.md, amended 18 October 2026 ("Deals for everyone"), step 7. 00458 gave
-- every workspace its own word for a booking (tenants.appointment_word) and kept sells_by one release, read only as the
-- word's fallback where none was stored; its backfill stored "meeting" for every workspace that had said "proposal". No
-- release reads sells_by any more (contracts appointmentWordOf takes the stored word alone), so it goes, and its check and
-- its column grant with it, and the workspace's notice (00431, 00458) stops listening for it.
--
-- Deploy order: the dashboard first. A dashboard from before this release asks for sells_by: its workspace list falls back
-- to the row without the word and the logo, and its word reads "appointment", until this release is out. Every statement
-- re-runs. Dropping a column takes ACCESS EXCLUSIVE on tenants, which every request reads: the lock guard of 00160 and
-- 00458.
set local lock_timeout = '3s';
do $$
begin
  raise notice 'lock_timeout for this migration: %', current_setting('lock_timeout');
  if current_setting('lock_timeout') <> '3s' then
    raise warning 'this file was applied outside a transaction, so SET LOCAL did nothing: run it inside begin/commit, or set lock_timeout yourself before it';
  end if;
end $$;

-- The notice first: a trigger that names the column in its UPDATE OF list holds it. packages/db realtime.ts
-- NARROWED_UPDATES lists the same columns.
create or replace trigger workspace_tell_update after update of status, name, timezone, appointment_word, logo_path
  on public.tenants
  for each row when (
    old.status is distinct from new.status
    or old.name is distinct from new.name
    or old.timezone is distinct from new.timezone
    or old.appointment_word is distinct from new.appointment_word
    or old.logo_path is distinct from new.logo_path
  )
  execute function public.workspace_tell_row_change();

alter table public.tenants drop column if exists sells_by;

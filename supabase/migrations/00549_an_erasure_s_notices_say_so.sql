-- 00549 · An erasure's notices say so (decision 0019; 5 Nov 2026: a press of fifty people was 1,167 of a member's requests
-- in 16 s, from one open tab).
--
-- An erasure tells a workspace's open tabs what it changed, as any write does: a thread gone and a person's tombstone, each
-- its own notice. Delete… for many hands its people to the ledger, which erases them one after another, so the notices come
-- about seven a second for as long as the press runs, 25 minutes for 5,000, and each surface that draws them reads again. A
-- tab could not wait those out by what it hears: a notice names a table, never a row, and an erasure's `contacts UPDATE` is
-- word for word a teammate's rename, which has to arrive as fast as ever. So the notices say which they are.
--
--   workspace_notices_on_erase        As a person's row becomes a tombstone, this transaction is an erasure
--                                     (chanlytics.workspace_erasing, for the transaction alone: a savepoint rolled
--                                     back takes it back, as it takes the notices).
--   contacts_erase_marks_its_notices  The trigger that says so.
--   workspace_tell_at_commit          Re-created: each notice of such a transaction carries `erasure: true`, whichever
--                                     statement kept it, before or after the tombstone: they all go at the commit.
--
-- The legs an erasure commits on their own (their visits' scrub, other people's notes) stay unmarked, and a tab reads them
-- as it reads any write: of the 149 people erased in the two days to 5 Nov, 2 had a visit and none a note. The catch-up (00508) reads the
-- notice back with the word on it and leaves it there: what a tab missed is read at once.
--
-- Deploy order: either. A dashboard that does not read the word reads as it did; one that finds no word reads as it did.
-- Re-runnable.

set local lock_timeout = '3s';

create or replace function public.workspace_notices_on_erase() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform set_config('chanlytics.workspace_erasing', 'true', true);
  return null;
end $$;

comment on function public.workspace_notices_on_erase() is
  'Decision 0019 (00549): as a person''s row becomes a tombstone, says this transaction is an erasure (chanlytics.workspace_erasing, the transaction''s alone), and workspace_tell_at_commit says so on each notice it sends at the commit, so a tab can wait out a stream of erasures and nothing else.';

revoke execute on function public.workspace_notices_on_erase() from public, anon, authenticated;

drop trigger if exists contacts_erase_marks_its_notices on public.contacts;
create trigger contacts_erase_marks_its_notices after update of erased_at on public.contacts
  for each row
  when (old.erased_at is null and new.erased_at is not null)
  execute function public.workspace_notices_on_erase();

create or replace function public.workspace_tell_at_commit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  kept record;
begin
  -- The row as it stands now, not as it was inserted: a deferred trigger is handed the inserted row, and a later statement
  -- of the transaction may have added to what it tells (00510's threads).
  delete from public.workspace_notices_pending where id = new.id returning topic, event, payload into kept;
  if not found then
    return null;
  end if;
  -- The clock now, at the commit: a read that began before it may not hold the change; one that began after it does. And
  -- whether this transaction erased someone (00549): unset, the setting reads null, and the notice says nothing.
  perform realtime.send(
    kept.payload
      || jsonb_build_object('at', to_char(clock_timestamp() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
      || case when current_setting('chanlytics.workspace_erasing', true) = 'true'
              then jsonb_build_object('erasure', true)
              else '{}'::jsonb
         end,
    kept.event,
    kept.topic,
    true);
  return null;
end $$;

comment on function public.workspace_tell_at_commit() is
  'Decision 0019 (00507): sends one notice a statement kept for its workspace, at the commit, with the commit''s clock as `at`, and deletes its row, and says `erasure` where this transaction made a person a tombstone (00549). A deferred constraint trigger on workspace_notices_pending.';

revoke execute on function public.workspace_tell_at_commit() from public, anon, authenticated;

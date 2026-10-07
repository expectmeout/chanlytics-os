-- 00327 · A message's status is told to its workspace.
--
-- The live feed heard a message when it arrived and never again (00265): a statement that moved a message's status,
-- the provider's receipt (sent, delivered, read), a failure, a cancel, an error written to a row later, told nobody. So
-- a thread's ticks stood where the tab last read them, and a send that failed an hour after it left showed its failure
-- only in a tab that happened to reload. Now a statement that updates messages is told on the workspace's topic as every
-- watched table's is: the table, the event and the statuses its rows were left in, never a row.
--
-- The rule is 00265's: a table the feed hears has a notice trigger here and its row in WATCHED (packages/db
-- realtime.ts), and database/each-workspace-is-told-what-changed.db.test.mjs holds the two equal. A notice rides
-- realtime.send, not the supabase_realtime publication, so nothing is added to the publication. `messages` already has
-- the insert trigger of 00265; this is its update trigger, the one 00265's loop leaves out for it.
--
-- The column. The trigger is given `status`, as `calls`' triggers are, and the notice carries the distinct statuses the
-- statement left on the rows it touched: a receipt says delivered or read, a failure says failed, and a late word on a
-- row that already failed (its error) still says failed. That is what lets a tab tell a tick from an inbound row's meta
-- stamp (received, which no tick follows) and Today tell a failure from the rest, without ever being sent a row. The
-- insert trigger is left as it was: an arrival names no status, and its notice is the one every tab hears already.
--
-- What it costs. A statement trigger that reads its transition table once, beside person_moments_changed's, which
-- already reads the same table's updates: no row trigger, no per-row work. It tells once for each statement, workspace
-- and set of statuses a transaction leaves, so a send's queued-to-sent finalizing, each provider receipt and each
-- late stamp on a message is one notice, and a batch updated in one statement is one. That is a row of Realtime's own
-- partition and a broadcast to the workspace's open tabs, for each receipt a customer's phone makes.
--
-- Either deploy order works, the dashboard first is the quieter. A dashboard that listens before this applies hears
-- nothing new. One that has not been reloaded when this applies reads a message's update as it reads an arrival, and
-- re-reads the surfaces that draw messages once a burst of them (a trailing debounce): chattier until the tab is
-- reloaded, never wrong. The new dashboard asks for a message's update by status, and the Inbox, Conversations and
-- Today alone do (apps/dashboard/src/legacy-bridge/surface-realtime.ts).
--
-- The lock. A trigger made on messages takes SHARE ROW EXCLUSIVE (writers wait, readers do not) until commit, the
-- 3 s guard of 00259 and 00313; if it times out nothing was applied and the owner re-runs it when the line is quiet.
-- `create or replace trigger` rather than a drop first, so even the moment between the two is never one a reader waits
-- through (a drop takes ACCESS EXCLUSIVE). Every statement re-runs.
set local lock_timeout = '3s';
do $$
begin
  raise notice 'lock_timeout for this migration: %', current_setting('lock_timeout');
  if current_setting('lock_timeout') <> '3s' then
    raise warning 'this file was applied outside a transaction, so SET LOCAL did nothing: run it inside begin/commit, or set lock_timeout yourself before it';
  end if;
end $$;

create or replace trigger workspace_tell_update after update on public.messages
  referencing new table as changed
  for each statement execute function public.workspace_tell_changes('status');

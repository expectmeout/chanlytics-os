-- 00520 · The notices a call owes are found by their own index (decision 0092).
--
-- A notice claimed and not told (calls.notified_at set, notice_told_at null, 00519) is the calls sweep's to finish, and
-- trigger_call_reconcile wakes the sweep for one between ten minutes and two days old. Both read the calls owed a notice
-- by notified_at; this partial index holds only those, so it stays as small as the notices still owed.
--
-- Built CONCURRENTLY, and alone in its file, as 00355 and 00427 are: calls takes a write for every delivery of every
-- call, and is never locked for an index; an index made concurrently cannot share a transaction, and the migration
-- runner sends a file of several statements as one (database/migrations.test.mjs). Re-runnable; an index left invalid
-- by a build that was interrupted is dropped by hand and the file run again (docs/runbook.md).

create index concurrently if not exists calls_notice_owed on public.calls (notified_at) where notice_told_at is null and notified_at is not null;

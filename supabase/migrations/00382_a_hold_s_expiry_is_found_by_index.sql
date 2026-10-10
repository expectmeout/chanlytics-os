-- 00382 · A hold's expiry is found by index.
--
-- expire_stale_pauses (00132) clears a hold whose control_until has passed, every ten seconds under pg_cron, and read
-- the whole of conversations to find one. A partial index on control_until where it is set, as
-- conversations_pause_due (00098) serves the pause the same sweep clears.
--
-- Built CONCURRENTLY, and alone in its file, as 00355 is: a thread's row is written for every message that arrives
-- (ingest_inbound upserts it), so a plain build would hold every arrival behind it. An index made concurrently cannot
-- share a transaction, and the migration runner sends a file of several statements as one, so this file holds one
-- statement and nothing else, not even a lock_timeout. database/migrations.test.mjs holds conversations to that shape.
-- Either deploy order: nothing names the index. Re-runnable; an index left invalid by a build that was interrupted is
-- dropped by hand and the file run again (docs/runbook.md).

create index concurrently if not exists conversations_control_due on public.conversations (control_until) where control_until is not null;

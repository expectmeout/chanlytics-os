-- 00517 · One index keeps each kept kind once (decision 0089).
--
-- The kinds whose subject is held once while its row is kept and not failed (job_kinds.once_kept: email_ingest,
-- lead_collect, reply_read), by the key jobs_take_their_kind writes (00515), so a webhook replayed after the work was
-- done finds it and a failed row never blocks a replay. One index where three bespoke ones were; 00518 drops two of
-- them once this one holds (the third stays while three SQL writers name it).
--
-- Built CONCURRENTLY, and alone in its file, as 00355 and 00427 are: jobs takes a write for every send, webhook and
-- clock, and is never locked for an index; an index made concurrently cannot share a transaction, and the migration
-- runner sends a file of several statements as one (database/migrations.test.mjs). Re-runnable; an index left invalid by
-- a build that was interrupted, or refused by a subject already on two rows (none should: the three indexes it replaces
-- held the same rows), is dropped by hand and the file run again (docs/runbook.md). 00518 refuses to run over one that
-- is invalid.

create unique index concurrently if not exists jobs_dedupe_kept on public.jobs (dedupe_key) where dedupe_kept and dedupe_key is not null and state <> 'failed';

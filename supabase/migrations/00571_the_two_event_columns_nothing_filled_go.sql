-- 00571 · The two event columns nothing filled go (layer 10, decision 0115, amending 0032's step 6).
--
-- events.aggregate_version and events.causation_id were added in 00334 for a projector that was never built, and no row has
-- ever held a value in either. If a projector comes, a migration adds them back.
--
-- note_sweep_backlog and sweep_status.backlog_ticks go too: only the old sweeps' alarm used them, and a sweep has no backlog
-- of its own now that it hands work out (00569). The ledger's own alarm says when work outruns the runner (jobs_backlog).
--
-- Deploy order: THE EDGE FIRST. Before this release the event_deliver job names both columns in its read, so applying this
-- ahead of that deploy would fail every delivery until it lands. Apply it once the release is live. Re-runnable.

set local lock_timeout = '3s';

alter table public.events
  drop column if exists aggregate_version,
  drop column if exists causation_id;

drop function if exists public.note_sweep_backlog(text, integer);

alter table public.sweep_status drop column if exists backlog_ticks;

-- The jobs table accepts only what something schedules and something handles.
--
-- veto_fire, media_fetch, rollup_daily, deadman and report_weekly were declared
-- ahead of slices that were then built another way (a vetoed reply is an
-- outbound_send with a delay; the deadman is a pg_cron sweep; media is fetched
-- inline) or not built yet. No handler dispatches them, nothing schedules them,
-- and no row of those kinds exists. A kind arrives with its handler and its
-- caller, in one change, so the enum, this CHECK and the dispatch map never
-- disagree about what the queue can carry.
alter table public.jobs drop constraint if exists jobs_kind_check;
alter table public.jobs add constraint jobs_kind_check
  check (kind in ('outbound_send', 'snooze_wake', 'pause_expire', 'broadcast_send', 'blob_thread_erase'));

-- 00079 · How many times we have asked QStash to deliver this job again.
--
-- `attempts` counts FIRES: claim_job increments it when a job is claimed, so a
-- job whose message never arrived sits at zero for ever and cannot bound
-- anything. Two different events in one counter is the conflation this
-- codebase keeps paying for, so recovery gets a column of its own.
--
-- No index: the sweep reads by (state, due_at), which jobs_due_scheduled from
-- 00002 already covers, and this column is only read on the handful of rows
-- that query returns.
alter table public.jobs
  add column if not exists republishes int not null default 0;

comment on column public.jobs.republishes is
  'Times the stale-jobs sweep re-published this job to QStash. attempts counts fires; this counts deliveries asked for.';

-- 00081 · When we last asked QStash to deliver this job again.
--
-- recoveryFor paced from due_at alone, so every quarter-hour tick published
-- again while the previous delivery still had twenty minutes of QStash's own
-- retries left. Three publishes inside forty-five minutes exhausted the budget
-- and the job was marked failed with deliveries still in flight -- which
-- claim_job then refused, because the row was no longer 'scheduled'. The
-- 45-minute threshold was derived from QStash's retry horizon correctly and
-- then applied only to the FIRST publish; this column is what applies it to
-- the rest.
--
-- updated_at would nearly serve: jobs_set_updated_at (00002) keeps it via
-- moddatetime and a scheduled job is otherwise written only at creation. But it
-- means "last written", not "last published", so the next writer of any other
-- column would silently become a pacing decision. Pacing is a correctness
-- property, so it gets a column that says what it means.
--
-- No index: the sweep still reads by (state, due_at), which jobs_due_scheduled
-- from 00002 covers, and this column is read only on the rows that returns.
alter table public.jobs
  add column if not exists last_republish_at timestamptz;

comment on column public.jobs.last_republish_at is
  'When the stale-jobs sweep last re-published this job. Recovery is paced from here, not from due_at, because each publish gets its own QStash retry horizon.';

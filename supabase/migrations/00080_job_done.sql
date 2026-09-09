-- 00080 · A job that finished says so.
--
-- jobs.state had four values and none of them meant "this ran and returned".
-- claim_job flips a job to 'fired'; on success api/jobs/fire.ts logged and
-- answered 200 and left it there. So EVERY successfully completed job in the
-- product's history sits in 'fired' for ever, indistinguishable from one whose
-- lambda died mid-handler.
--
-- That was harmless while nothing read the column. The stale-jobs sweep
-- (00078) reads it: it marks any job in 'fired' past ten minutes as failed and
-- emails the workspace. Which means, from the first real reply tomorrow
-- morning, every successful job would have produced a false alarm ten minutes
-- later. Caught by a probe job before any real one hit it — the table holds
-- ten rows and none had crossed the cutoff.
--
-- The backfill is deliberate and only reaches rows the sweep would have judged
-- anyway. fire.ts may run for sixty seconds, so anything in 'fired' older than
-- ten minutes has finished one way or another; calling that 'done' matches the
-- behaviour every one of those rows already had, which was to be left alone.

alter table public.jobs drop constraint if exists jobs_state_check;
alter table public.jobs add constraint jobs_state_check
  check (state in ('scheduled', 'fired', 'done', 'canceled', 'failed'));

update public.jobs
   set state = 'done'
 where state = 'fired'
   and fired_at < now() - interval '10 minutes';

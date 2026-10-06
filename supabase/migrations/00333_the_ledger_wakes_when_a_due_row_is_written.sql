-- 00333 · The ledger wakes when a due row is written, and a job has one dedupe key.
--
-- Decision 0033, steps 1 and 2. pg_cron asks every ten seconds whether a job is due and knocks on /api/jobs/tick when
-- one is (trigger_jobs_tick, 00098; request_sweep, 00086); nothing knocked when a row was written, so every job waited
-- for the poll on top of its due time. Now a statement that writes a row due now asks for the tick itself:
--
--   jobs_wake      a statement trigger on jobs. When a row it wrote is scheduled and due within two seconds (the time the
--                  knock takes to arrive: pg_net sends it after the commit, and the tick claims as soon as it starts), it
--                  takes sweep_status's 'jobs' row with skip locked and, if it got it and nobody woke the tick within the
--                  last second, stamps woken_at and calls request_sweep. A writer that finds the row held, by another
--                  asker or by the poll's own look, asks nothing and waits for nobody: that other ask, or the poll within
--                  ten seconds, covers its row. The poll stays as it was, the backstop; a tick that finds nothing costs
--                  what it costs today. A row due later than two seconds asks for nothing: the tick's claim loop ends on
--                  its first empty claim (packages/jobs tick.ts), so a knock before a row is due is a knock wasted, and
--                  the poll reaches the row within ten seconds of its due time as before. (0033's Shape said the poll's
--                  interval; the runner's loop decides it, and the note follows the code.)
--   dedupe_key     one text column, unique while a row is scheduled or fired (jobs_dedupe_live). A caller that must
--                  schedule once passes the key; a second insert is a 23505 that scheduleJobOnce reads as
--                  already_scheduled, and a failed row never blocks a replay (00135's rule, now for every kind). The
--                  three bespoke indexes (jobs_email_ingest_uq, jobs_lead_collect_once, jobs_reply_read_once) stay one
--                  release, until every caller writes the key; an older edge writes no key and trips them as today.
--
-- Either deploy order: SQL alone. An edge not yet deployed answers the knock as it answers pg_cron's; an edge that
-- writes the key to a database without the column retries without it (schedule.ts). Re-runnable: columns if not exists,
-- the function replaced, the trigger dropped and made.

set local lock_timeout = '3s';

/* ------------------------------------------------------------------------ 1. one dedupe key -- */

alter table public.jobs add column if not exists dedupe_key text;
comment on column public.jobs.dedupe_key is
  'What makes this row once-only while it is scheduled or fired (jobs_dedupe_live, 00333): a caller that must not schedule twice passes it (email_ingest:<mailbox>:<received>, lead_collect:<run>:<seq>, reply_read:<message>:<stage>, deliver:<event>:<subscriber>). Null for a row nobody keyed.';

create unique index if not exists jobs_dedupe_live on public.jobs (dedupe_key)
  where dedupe_key is not null and state in ('scheduled', 'fired');
comment on index public.jobs_dedupe_live is
  'One live row per dedupe key (00333): a second schedule of the same key is refused (23505) while the first is scheduled or fired; a row that is done, canceled or failed lets the key be scheduled again.';

/* -------------------------------------------------------------------------------- 2. the wake -- */

alter table public.sweep_status add column if not exists woken_at timestamptz;
comment on column public.sweep_status.woken_at is
  'When a row written to the ledger last asked for this sweep itself (jobs_wake, 00333): one ask a second, whatever the writers do.';

create or replace function public.jobs_wake()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Only a row the tick could claim when the knock arrives: scheduled, and due within the two seconds the knock takes.
  if not exists (
    select 1 from new_rows r where r.state = 'scheduled' and r.due_at <= now() + interval '2 seconds'
  ) then
    return null;
  end if;
  -- One ask a second, and never a wait: the row is taken with skip locked, so a writer that finds it held asks nothing.
  perform 1
     from public.sweep_status s
    where s.sweep = 'jobs' and (s.woken_at is null or s.woken_at < now() - interval '1 second')
      for update skip locked;
  if not found then
    return null;
  end if;
  update public.sweep_status set woken_at = now() where sweep = 'jobs';
  perform public.request_sweep('jobs', '/api/jobs/tick');
  return null;
end $$;
-- A definer trigger function fires for every writer and is callable by none of them (database/privileges.db.test.mjs).
revoke all on function public.jobs_wake() from public, anon, authenticated;
grant execute on function public.jobs_wake() to service_role;
comment on function public.jobs_wake() is
  'After a statement writes jobs: a row scheduled and due within two seconds asks for the tick through request_sweep, at most once a second (sweep_status.woken_at), never waiting on another asker (00333, decision 0033).';

drop trigger if exists jobs_wake on public.jobs;
create trigger jobs_wake
  after insert on public.jobs
  referencing new table as new_rows
  for each statement
  execute function public.jobs_wake();

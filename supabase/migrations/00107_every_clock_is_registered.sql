-- 00107 · Every clock is registered as data, and the health check reads the register.
--
-- sweep_health() (00098) carried its expectations as a VALUES list inside the
-- function, so registering a clock meant rewriting the function, and the six
-- clocks nobody typed in -- the monthly partition precreate and the five
-- nightly purges -- were never watched. The register is the table now: one
-- row per clock with the cron job it is, how long it may go silent, and how
-- it is judged: on the HTTP request it enqueued and what the edge answered
-- ('request', as 00098 judged), or on its last run in cron.job_run_details
-- ('run', for the jobs that never leave the database). A row that names no
-- job is reported, loudly, as unregistered, and a new name cannot be created
-- without its job (sweep_status_registered), which is what the CHECK on the
-- name used to guarantee.
--
-- Phase two A, Task 4 (docs/plans/2026-09-11-phase-two-a-sound-and-observable.md).

-- ------------------------------------------------------------- the register
alter table public.sweep_status
  add column if not exists jobname       text,
  add column if not exists max_silence   interval,
  add column if not exists judged_by     text not null default 'request'
    check (judged_by in ('request', 'run')),
  add column if not exists registered_at timestamptz not null default now();
alter table public.sweep_status drop constraint if exists sweep_status_sweep_check;

comment on column public.sweep_status.jobname is
  'The cron.job this clock is. Null means unregistered, which sweep_health() reports as unhealthy.';
comment on column public.sweep_status.max_silence is
  'How long the clock may go without speaking (a request enqueued, or a run that succeeded) before it is unhealthy. Null: silence is not a fault; only the last answer is judged.';
comment on column public.sweep_status.judged_by is
  'request: judged on the HTTP request it enqueued and what the edge answered. run: judged on cron.job_run_details, for the jobs that never leave the database.';
comment on column public.sweep_status.registered_at is
  'A run-judged clock that has never run is healthy until max_silence has passed since it was registered.';

-- The nine HTTP sweeps 00098 knew, with the silences it gave them; the two
-- row clocks 00086 watched by existence alone, now judged on their runs; and
-- the six clocks nobody watched.
insert into public.sweep_status (sweep, jobname, max_silence, judged_by) values
  -- deadman runs every 10 minutes: 25 minutes is two consecutive missed
  -- ticks plus slack. One missed tick is not evidence (pg_cron skips under
  -- load); two consecutive is.
  ('deadman',             'deadman-sweep',              interval '25 minutes',         'request'),
  -- the health check runs at :13 and :43; 70 is two missed ticks + slack.
  -- This row can only be judged on silence from OUTSIDE a health run (by
  -- /api/diag, or by /api/health), which is what catches pg_cron dying.
  ('health',              'sweep-health',               interval '70 minutes',         'request'),
  -- call-reconcile posts only when a call has been ongoing for 5 minutes, so
  -- silence is an idle phone line; it is judged on what the edge answered.
  ('calls',               'call-reconcile',             null,                          'request'),
  -- the ledger's heartbeat asks every ten seconds and records itself every
  -- time; three minutes is eighteen missed ticks.
  ('jobs',                'jobs-tick',                  interval '3 minutes',          'request'),
  -- lines-sweep at :08, :23, :38, :53: 40 minutes is two missed ticks + slack.
  ('lines',               'lines-sweep',                interval '40 minutes',         'request'),
  -- the four hourly HTTP sweeps: two consecutive missed ticks + 20 minutes.
  ('registration',        'registration-sweep',         interval '2 hours 20 minutes', 'request'),
  ('calendar',            'calendar-people-sweep',      interval '2 hours 20 minutes', 'request'),
  ('google',              'google-listings-sweep',      interval '2 hours 20 minutes', 'request'),
  ('playbooks',           'playbooks-sweep',            interval '2 hours 20 minutes', 'request'),
  -- the two row clocks run inside Postgres every ten seconds and return a
  -- paused thread to the receptionist or wake a snooze; 00086 watched only
  -- whether pg_cron still had them. Now their runs are read: three minutes of
  -- no success is eighteen missed ticks, the same arithmetic as the heartbeat.
  ('pauses',              'expire-stale-pauses',        interval '3 minutes',          'run'),
  ('snoozes',             'wake-stale-snoozes',         interval '3 minutes',          'run'),
  -- the monthly precreate (the 25th at 12:00) makes the events partition two
  -- months out; 35 days catches one missed month within ten days.
  ('partitions',          'events-partition-precreate', interval '35 days',            'run'),
  -- the five nightly purges (04:13 to 04:41 UTC); 26 hours is one missed night.
  ('purge_events',        'purge-events',               interval '26 hours',           'run'),
  ('purge_ask',           'purge-ask',                  interval '26 hours',           'run'),
  ('purge_notifications', 'purge-notifications',        interval '26 hours',           'run'),
  ('purge_rate_hits',     'purge-rate-hits',            interval '26 hours',           'run'),
  ('purge_cron_history',  'purge-cron-history',         interval '26 hours',           'run')
on conflict (sweep) do update
   set jobname = excluded.jobname, max_silence = excluded.max_silence, judged_by = excluded.judged_by;

-- A new name must arrive with its job. The upserts request_sweep(),
-- trigger_jobs_tick() and sweep_mark_alerted() make carry no jobname and land
-- on a row that already exists, which BEFORE INSERT sees before ON CONFLICT
-- resolves it, so the rule is: no jobname AND no such row is a refusal.
create or replace function public.sweep_status_registered()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if NEW.jobname is null and not exists (select 1 from public.sweep_status s where s.sweep = NEW.sweep) then
    raise exception 'sweep % is not registered: insert it with the cron job it is (jobname) and how it is judged (judged_by) first', NEW.sweep;
  end if;
  return NEW;
end $$;
drop trigger if exists sweep_status_registered on public.sweep_status;
create trigger sweep_status_registered before insert on public.sweep_status
  for each row execute function public.sweep_status_registered();
comment on function public.sweep_status_registered() is
  'A sweep name that has no row must arrive with its cron job name; the upserts the sweeps themselves make land on rows that exist. Replaces the CHECK on the name that 00083 to 00097 kept widening.';

-- --------------------------------------------------------- the health check
create or replace function public.sweep_health()
returns table (
  sweep           text,
  healthy         boolean,
  detail          text,
  last_request_at timestamptz,
  status_code     integer,
  scheduled       boolean,
  alerted_at      timestamptz
)
language sql
security definer
set search_path = public
as $$
  with last_ok as (
    -- When each job last succeeded. cron.job_run_details is bounded by
    -- purge_cron_history (00026): 14 days, at least 30 runs per job, one day
    -- for the ten-second jobs.
    select d.jobid, max(d.end_time) as at
      from cron.job_run_details d
     where d.status = 'succeeded'
     group by d.jobid
  ),
  latest as (
    -- How each job's most recent run ended.
    select distinct on (d.jobid) d.jobid, d.status, left(d.return_message, 160) as message
      from cron.job_run_details d
     order by d.jobid, d.start_time desc
  ),
  observed as (
    select e.sweep, e.jobname, e.max_silence, e.judged_by, e.registered_at,
           e.request_id, e.requested_at, e.note, e.alerted_at,
           j.jobid is not null                    as job_exists,
           coalesce(j.active, false)              as job_active,
           j.schedule                             as job_schedule,
           r.id is not null                       as has_response,
           r.status_code,
           coalesce(r.timed_out, false)           as timed_out,
           r.error_msg,
           left(r.content, 200)                   as content,
           -- net._http_response is UNLOGGED: a Postgres crash truncates it and
           -- the sequence behind net.http_post resets with it. If pg_net has
           -- recorded anything NEWER than our request, a missing row is really
           -- missing; if it has not, the table was emptied and we say nothing.
           exists (select 1 from net._http_response nr where nr.id > e.request_id)
                                                  as newer_response_seen,
           ok.at                                  as last_ok,
           lt.status                              as last_status,
           lt.message                             as last_message
      from public.sweep_status e
      left join lateral (
        select jobid, active, schedule from cron.job
         where jobname = e.jobname order by jobid limit 1
      ) j on true
      left join last_ok ok on ok.jobid = j.jobid
      left join latest  lt on lt.jobid = j.jobid
      left join net._http_response r on r.id = e.request_id
  ),
  judged as (
    select o.*,
      case
        when o.jobname is null then
          'this clock is not registered: sweep_status names no cron job for it'
        when not o.job_exists then
          'no cron job named ' || o.jobname || ' is scheduled'
        when not o.job_active then
          'the cron job ' || o.jobname || ' is disabled'

        -- Judged on its runs: the jobs that never leave the database.
        when o.judged_by = 'run' and o.last_status = 'failed' then
          'the last run of ' || o.jobname || ' failed: ' || coalesce(o.last_message, '(no message)')
        when o.judged_by = 'run' and o.max_silence is null then
          null
        when o.judged_by = 'run' and o.last_ok is null and o.registered_at > now() - o.max_silence then
          null
        when o.judged_by = 'run' and o.last_ok is null then
          'the job ' || o.jobname || ' has never succeeded; it is scheduled ' || coalesce(o.job_schedule, '(unknown)')
        when o.judged_by = 'run' and o.last_ok < now() - o.max_silence then
          'the job ' || o.jobname || ' last succeeded at ' ||
          to_char(o.last_ok at time zone 'utc', 'YYYY-MM-DD HH24:MI') || ' UTC; it is scheduled ' ||
          coalesce(o.job_schedule, '(unknown)')
        when o.judged_by = 'run' then
          null

        -- Judged on the request it enqueued and what the edge answered, as 00098 did.
        when o.note is not null then
          'the trigger could not send the request: ' || o.note
        when o.max_silence is not null and o.requested_at is null then
          'this sweep has never enqueued a request'
        when o.max_silence is not null and o.requested_at < now() - o.max_silence then
          'last enqueued a request at ' ||
          to_char(o.requested_at at time zone 'utc', 'YYYY-MM-DD HH24:MI') || ' UTC, ' ||
          round((extract(epoch from (now() - o.requested_at)) / 60)::numeric)::text ||
          ' minutes ago; ' || o.jobname || ' is scheduled ' || coalesce(o.job_schedule, '(unknown)')
        when o.requested_at is null or o.requested_at < now() - interval '1 hour' then
          null
        when not o.has_response and o.request_id is not null
             and o.requested_at < now() - interval '2 minutes'
             and o.newer_response_seen then
          'the request was enqueued at ' || to_char(o.requested_at at time zone 'utc', 'HH24:MI') ||
          ' UTC and pg_net never recorded a response'
        when o.timed_out then
          'the request timed out before the edge answered'
        when o.error_msg is not null then
          'pg_net could not complete the request: ' || o.error_msg
        when o.status_code is not null and (o.status_code < 200 or o.status_code > 299) then
          'the edge answered ' || o.status_code || ': ' || coalesce(o.content, '(no body)')
      end as detail
      from observed o
  )
  select j.sweep,
         j.detail is null,
         j.detail,
         case when j.judged_by = 'run' then j.last_ok else j.requested_at end,
         j.status_code,
         j.job_exists and j.job_active,
         j.alerted_at
    from judged j
   order by j.sweep;
$$;

revoke execute on function public.sweep_health() from public, anon, authenticated;

comment on function public.sweep_health() is
  'One row per registered clock (public.sweep_status): healthy, why not, when it last spoke (a request enqueued, or a run that succeeded), what the edge answered, whether pg_cron still has it, and when it was last alerted. The health sweep mails the unhealthy ones and stamps alerted_at only after delivery; /api/health answers 503 to an outside monitor when any is unhealthy.';

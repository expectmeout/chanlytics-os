-- 00098 · Time lives in the row.
--
-- A job was a row AND a QStash message, and only the row could be observed.
-- Every recovery problem this ledger has had was one problem in different
-- clothes -- a delivery that never arrived, a re-publish racing its own
-- original, a retry landing on a row that had moved on, signing keys rotated
-- without the edge being told: two clocks for one event. From here the row is
-- the only clock. A pg_cron heartbeat asks every ten seconds whether anything
-- is due and calls the edge only when something is; the edge claims due rows
-- one at a time, runs each, and records the outcome. A job that did not run is
-- simply still due. There is no publish to lose, no dedup window, no signature
-- to verify, and no second identity to keep in step.
--
-- The two timer kinds are retired rather than moved. A snooze and a pause
-- already carry their own deadline on the conversation (snooze_until,
-- paused_until), and 00006 and 00082 already reopen a thread from it, whoever
-- set it. The job only knew how to ask a broker to remind us, and it disagreed
-- with the sweep about one case: a pause that runs out while the customer's
-- request for a person is still open. The job handed that thread back to the
-- receptionist; the sweep leaves it with a person. The sweep's rule is the one
-- that stays. Both sweeps now run every ten seconds instead of every fifteen
-- minutes, each still its own cron job, so neither can stop the other or the
-- ledger by failing.

-- 1. The broker's machinery goes ---------------------------------------------
-- First, so nothing below is defined against columns that are about to go.
select cron.unschedule('stale-jobs-sweep') where exists (select 1 from cron.job where jobname = 'stale-jobs-sweep');
drop function if exists public.trigger_stale_jobs_sweep();
drop function if exists public.claim_job(uuid);
drop function if exists public.fail_job(uuid, text);
drop index if exists public.jobs_qstash_uq;
alter table public.jobs
  drop column if exists qstash_id,
  drop column if exists republishes,
  drop column if exists last_republish_at,
  -- A token for cancelling by link, which nothing ever read.
  drop column if exists cancel_token;

-- 2. The retired kinds ---------------------------------------------------------
-- Their rows are finished timers carrying nothing but a conversation id. They
-- go rather than being grandfathered behind NOT VALID, so the CHECK is true of
-- every row: a NOT VALID constraint still refuses any later UPDATE of an old
-- row, which is a trap left for the next writer that touches one.
delete from public.jobs where kind in ('snooze_wake', 'pause_expire');
alter table public.jobs drop constraint if exists jobs_kind_check;
alter table public.jobs add constraint jobs_kind_check
  check (kind in ('outbound_send', 'broadcast_send', 'blob_thread_erase'));

-- 3. The lease -------------------------------------------------------------------
alter table public.jobs add column if not exists lease_until timestamptz;
comment on column public.jobs.lease_until is
  'While in the future, a run holds this row. Once past, the run is presumed dead and claim_due_jobs() may take the row again with attempts + 1; whether that run goes ahead or gives up is verdictFor() in packages/jobs/src/ledger.ts.';
create index if not exists jobs_lease_due on public.jobs (lease_until) where state = 'fired';

-- A row the retired callback claimed and never finished has no lease. Give it
-- one that has already run out, so the heartbeat judges it once rather than
-- never.
update public.jobs set lease_until = now() where state = 'fired' and lease_until is null;

-- 4. The claim -------------------------------------------------------------------
-- language sql, so the body is checked when this migration applies rather than
-- on its first call in production.
create or replace function public.claim_due_jobs(p_limit integer, p_lease_seconds integer)
returns setof public.jobs
language sql
security definer
set search_path = public
as $$
  with due as (
    select id
      from public.jobs
     where (state = 'scheduled' and due_at <= now())
        or (state = 'fired' and lease_until < now())
     order by due_at
     limit p_limit
     for update skip locked
  )
  update public.jobs j
     set state       = 'fired',
         fired_at    = now(),
         attempts    = j.attempts + 1,
         lease_until = now() + make_interval(secs => p_lease_seconds)
    from due
   where j.id = due.id
  returning j.*
$$;
revoke execute on function public.claim_due_jobs(integer, integer) from public, anon, authenticated;
comment on function public.claim_due_jobs(integer, integer) is
  'The only way a job becomes fired. Concurrent ticks take disjoint rows (SKIP LOCKED). attempts counts claims: 1 is the first run; more means a lease ran out before a run reported back.';

-- 5. The guard -------------------------------------------------------------------
-- The machine, enforced where every writer has to pass, as messages_guard
-- (00015) does for messages. The ledger had five writers, each remembering its
-- own .eq('state', ...); now there is one rule, and it is here.
create or replace function public.jobs_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if NEW.state is distinct from OLD.state then
    if OLD.state in ('done', 'failed', 'canceled') then
      raise exception 'jobs.state is terminal (% -> % refused)', OLD.state, NEW.state;
    end if;
    if OLD.state = 'scheduled' and NEW.state not in ('fired', 'canceled') then
      raise exception 'a scheduled job may only be fired or canceled (% refused)', NEW.state;
    end if;
    if OLD.state = 'fired' and NEW.state not in ('done', 'failed') then
      raise exception 'a fired job may only finish or fail (% refused)', NEW.state;
    end if;
  end if;
  return NEW;
end $$;
drop trigger if exists jobs_guard on public.jobs;
create trigger jobs_guard before update on public.jobs
  for each row execute function public.jobs_guard();
comment on function public.jobs_guard() is
  'scheduled -> fired | canceled; fired -> fired (a lease taken back) | done | failed; done, failed and canceled are final. A payload may still change on any row: an erasure scrubs finished ones.';

-- 6. The row clocks --------------------------------------------------------------
-- Every ten seconds each asks for the threads whose time has come, so each
-- gets an index holding only those.
create index if not exists conversations_snooze_due on public.conversations (snooze_until) where state = 'snoozed';
create index if not exists conversations_pause_due  on public.conversations (paused_until) where state = 'needs_human';

select cron.unschedule('expire-stale-pauses') where exists (select 1 from cron.job where jobname = 'expire-stale-pauses');
select cron.schedule('expire-stale-pauses', '10 seconds', $$select public.expire_stale_pauses()$$);
select cron.unschedule('wake-stale-snoozes') where exists (select 1 from cron.job where jobname = 'wake-stale-snoozes');
select cron.schedule('wake-stale-snoozes', '10 seconds', $$select public.wake_stale_snoozes()$$);

-- 7. The heartbeat ---------------------------------------------------------------
create or replace function public.trigger_jobs_tick()
returns bigint
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if exists (
    select 1 from public.jobs
     where (state = 'scheduled' and due_at <= now())
        or (state = 'fired' and lease_until < now())
  ) then
    return public.request_sweep('jobs', '/api/jobs/tick');
  end if;
  -- Nothing due: the look itself is the evidence. requested_at moves;
  -- request_id and note stay as the last real call left them, so a failed
  -- answer or a missing Vault secret stays visible until a call succeeds.
  insert into public.sweep_status (sweep, requested_at) values ('jobs', now())
  on conflict (sweep) do update set requested_at = excluded.requested_at;
  return null;
end $$;
revoke execute on function public.trigger_jobs_tick() from public, anon, authenticated;
comment on function public.trigger_jobs_tick() is
  'The ledger heartbeat. Calls the edge through request_sweep() only when a job is due or a lease has run out; otherwise records that it looked, so sweep_health() can tell a quiet ledger from a stopped clock.';

select cron.unschedule('jobs-tick') where exists (select 1 from cron.job where jobname = 'jobs-tick');
select cron.schedule('jobs-tick', '10 seconds', $$select public.trigger_jobs_tick()$$);

-- 8. The watcher -----------------------------------------------------------------
-- sweep_health() exactly as 00086 left it, with two rows changed: 'jobs' is
-- judged against the heartbeat, and 'lines' is watched at all.
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
  with expectation (sweep, jobname, max_silence) as (
    values
      -- deadman runs every 10 minutes: 25 minutes is two consecutive missed
      -- ticks plus slack. One missed tick is not evidence (pg_cron skips under
      -- load); two consecutive is. Worst-case detection with the health check
      -- at :13 and :43 is about 53 minutes, against the TWO HOUR customer-wait
      -- threshold the deadman sweep protects.
      ('deadman'::text, 'deadman-sweep'::text,  interval '25 minutes'),
      -- the health check runs at :13 and :43 -- a 30-minute cadence, so 70 is
      -- two missed ticks + slack. This row can only ever be judged on silence
      -- from OUTSIDE a health run (i.e. by /api/diag): when the health route
      -- itself calls this, its own requested_at is seconds old by construction.
      -- That is what catches pg_cron dying altogether.
      ('health',        'sweep-health',         interval '70 minutes'),
      -- call-reconcile posts ONLY when a call has been 'ongoing' for 5 minutes,
      -- so silence is not a fault -- it is an idle phone line. It is judged on
      -- what the edge answered the last time it was actually asked, which is
      -- exactly when a missing RETELL_API_KEY matters.
      ('calls',         'call-reconcile',       null::interval),
      -- The ledger's heartbeat asks every ten seconds (00098) and records
      -- itself every time, whether or not anything was due, so silence here
      -- means pg_cron is not running it -- or trigger_jobs_tick() is raising,
      -- which pg_cron logs and nothing else would see. Three minutes is
      -- eighteen missed ticks: one skipped under load is not evidence;
      -- eighteen is. When it does call the edge, the answer is judged like any
      -- other sweep's, and a 503 means the ledger could not be claimed from.
      ('jobs',          'jobs-tick',            interval '3 minutes'),
      -- lines-sweep resumes a line whose set-up the function's ceiling cut
      -- off (00097), at :08, :23, :38 and :53, so 40 minutes is two missed
      -- ticks plus slack. 00097 registered it with sweep_status and not here,
      -- which left the one sweep that finishes a paid-for number unwatched.
      ('lines',         'lines-sweep',          interval '40 minutes'),

      -- The four hourly HTTP sweeps. 2h20m is two consecutive missed ticks
      -- plus twenty minutes of slack -- the same "one skip is not evidence,
      -- two is" arithmetic the rows above do for their ten and fifteen
      -- minutes. An hourly sweep cannot be judged faster than that without
      -- turning pg_cron's ordinary skipping into mail.
      ('registration',  'registration-sweep',   interval '2 hours 20 minutes'),
      ('calendar',      'calendar-people-sweep', interval '2 hours 20 minutes'),
      ('google',        'google-listings-sweep', interval '2 hours 20 minutes'),
      ('playbooks',     'playbooks-sweep',      interval '2 hours 20 minutes'),

      -- The two sweeps that run INSIDE Postgres. There is no request to record
      -- and no edge to answer, so `max_silence` is null and they are judged on
      -- the only thing that can be wrong: whether pg_cron still has the job and
      -- whether it is enabled. Both mutate conversation state on their own --
      -- one returns a paused thread to the receptionist, the other wakes a
      -- snooze -- and both were entirely unobserved.
      ('pauses',        'expire-stale-pauses',  null::interval),
      ('snoozes',       'wake-stale-snoozes',   null::interval)
  ),
  observed as (
    select e.sweep, e.jobname, e.max_silence,
           s.request_id, s.requested_at, s.note, s.alerted_at,
           j.jobid is not null                    as job_exists,
           coalesce(j.active, false)              as job_active,
           j.schedule                             as job_schedule,
           r.id is not null                       as has_response,
           r.status_code,
           coalesce(r.timed_out, false)           as timed_out,
           r.error_msg,
           left(r.content, 200)                   as content,
           -- net._http_response is UNLOGGED (pg_class.relpersistence = 'u',
           -- verified on this database): a Postgres crash TRUNCATES it, and
           -- the unlogged sequence behind net.http_post resets with it.
           -- Without this guard every request between two minutes and an hour
           -- old at restart time is reported as "pg_net never recorded a
           -- response" -- a false alarm on the only channel this system alerts
           -- through. If pg_net has recorded anything NEWER than our request,
           -- the missing row is really missing; if it has not, the table was
           -- emptied and we say nothing. Because deadman posts every ten
           -- minutes the ledger heals itself within one tick either way.
           exists (select 1 from net._http_response nr where nr.id > s.request_id)
                                                  as newer_response_seen
      from expectation e
      left join public.sweep_status s on s.sweep = e.sweep
      left join lateral (
        select jobid, active, schedule from cron.job
         where jobname = e.jobname order by jobid limit 1
      ) j on true
      left join net._http_response r on r.id = s.request_id
  ),
  judged as (
    select o.*,
      case
        when not o.job_exists then
          'no cron job named ' || o.jobname || ' is scheduled'
        when not o.job_active then
          'the cron job ' || o.jobname || ' is disabled'
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
         j.requested_at,
         j.status_code,
         j.job_exists and j.job_active,
         j.alerted_at
    from judged j
   order by j.sweep;
$$;

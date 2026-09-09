-- 00086 · Every sweep that changes something on its own is watched.
--
-- 00083 registered ONE sweep with sweep_health() and wrote the honest general
-- rule down instead of quietly applying it: "watch every sweep that mutates
-- state on its own", which is also registration-sweep and calendar-people-sweep.
-- It named two; there are five, and two of them run entirely inside Postgres.
-- This is the whole rule, applied.
--
-- What was unwatched until now, and what its silence would have cost:
--
--   registration-sweep     the only thing that finishes a carrier registration.
--                          Silent, a workspace sits in "waiting on carriers"
--                          for ever and its texting never switches on.
--   calendar-people-sweep  reads each workspace's feed. Silent, the receptionist
--                          keeps offering times that are already taken.
--   google-listings-sweep  reads reviews. Silent, new reviews stop arriving and
--                          the page says "checked 9 days ago" to nobody.
--   playbooks-sweep        SENDS. Silent, no outbound campaign runs at all.
--   expire-stale-pauses    returns a paused conversation to the receptionist.
--                          Silent, threads sit at needs_human for ever while
--                          the dashboard claims a person owns them.
--   wake-stale-snoozes     the same, for snoozes.
--
-- The last two are SQL, not HTTP: they run inside the database, so there is no
-- request to record and no edge to answer. They are judged on the only thing
-- that can be wrong with them -- whether pg_cron still has them, and whether
-- the job is enabled. That is not a lesser check: an unscheduled sweep is
-- exactly the failure nobody notices.
--
-- Registering an HTTP sweep was four things (00083), which is why it stayed
-- undone for four sweeps. Step 1 makes it one, so the next one is a line.

-- 1. One body for "ask the edge and record what you asked".
--
-- Eight triggers each carried their own copy of these twenty-five lines with
-- the name and the path substituted. Four of the copies recorded what they
-- enqueued and four did not, which is precisely why half the sweeps could not
-- be watched: the difference was invisible, sitting inside near-identical
-- functions nobody reads side by side.
--
-- The recording is byte-for-byte what trigger_deadman_sweep does, including the
-- failure path writing the REASON while deliberately NOT refreshing
-- requested_at -- the staleness of requested_at is the backstop that catches a
-- trigger replaced by an older version.
create or replace function public.request_sweep(p_sweep text, p_path text, p_timeout_ms integer default 55000)
returns bigint
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_key text;
  v_url text;
  v_id  bigint;
begin
  select public.get_cron_sweep_key() into v_key;
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'edge_base_url';
  if v_key is null or v_url is null then
    raise warning '% sweep not configured (missing cron_sweep_key or edge_base_url)', p_sweep;
    insert into public.sweep_status (sweep, note)
         values (p_sweep, 'missing cron_sweep_key or edge_base_url in Vault')
    on conflict (sweep) do update set note = excluded.note, request_id = null;
    return null;
  end if;
  select net.http_post(
    url     := v_url || p_path,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-key', v_key),
    body    := '{}'::jsonb,
    timeout_milliseconds := p_timeout_ms
  ) into v_id;
  insert into public.sweep_status (sweep, request_id, requested_at, note)
       values (p_sweep, v_id, now(), null)
  on conflict (sweep) do update
     set request_id = excluded.request_id, requested_at = excluded.requested_at, note = null;
  return v_id;
end $$;

revoke execute on function public.request_sweep(text, text, integer) from public, anon, authenticated;

comment on function public.request_sweep(text, text, integer) is
  'Asks the edge for one sweep and records the pg_net request id in public.sweep_status, so sweep_health() can judge it. The one place a scheduled sweep reaches the edge.';

-- 2. The names sweep_status admits. Same `check (col in (...))` form and the
--    same reason as 00026 and 00083: `= any (array[...])` is identical to
--    Postgres and invisible to the tools in tooling/scripts that read
--    constraints out of migration text.
--
--    The two SQL sweeps are deliberately absent: they never write a row here.
alter table public.sweep_status drop constraint if exists sweep_status_sweep_check;
alter table public.sweep_status add constraint sweep_status_sweep_check
  check (sweep in ('calls', 'deadman', 'health', 'jobs', 'registration', 'calendar', 'google', 'playbooks'));

-- 3. A deploy grace period for each new HTTP sweep, exactly like 00026's and
--    00083's. Without a seed the first health run finds no row, reports "this
--    sweep has never enqueued a request" and mails a false alarm minutes before
--    the first real tick would have filled it in. The first genuine trigger
--    overwrites it.
insert into public.sweep_status (sweep, requested_at)
     values ('registration', now()), ('calendar', now()), ('google', now()), ('playbooks', now())
on conflict (sweep) do nothing;

-- 4. The four triggers, now one line each. Names, return types, revokes and
--    schedules are unchanged, so nothing that calls them has to know.
--
--    The four ALREADY-WATCHED triggers are deliberately left as they are. They
--    work, they are the shape request_sweep was copied from, and there is no
--    way to run a migration against anything but production from this repo yet
--    -- so converging them buys tidiness at the price of touching the alerting
--    plumbing blind. They converge when there is a local Postgres to run
--    migrations against (that is Phase 1 of docs/plans/2026-09-09).
create or replace function public.trigger_registration_sweep()
returns bigint
language sql
security definer
set search_path = public, extensions
as $$ select public.request_sweep('registration', '/api/cron/registrations') $$;
revoke execute on function public.trigger_registration_sweep() from public, anon, authenticated;
comment on function public.trigger_registration_sweep() is
  'Asks the edge to finish carrier registrations the carriers have answered. Recorded in public.sweep_status.';

create or replace function public.trigger_calendar_sweep()
returns bigint
language sql
security definer
set search_path = public, extensions
as $$ select public.request_sweep('calendar', '/api/cron/calendar') $$;
revoke execute on function public.trigger_calendar_sweep() from public, anon, authenticated;
comment on function public.trigger_calendar_sweep() is
  'Asks the edge to read each workspace''s calendar feed. Recorded in public.sweep_status.';

create or replace function public.trigger_google_sweep()
returns bigint
language sql
security definer
set search_path = public, extensions
as $$ select public.request_sweep('google', '/api/cron/google') $$;
revoke execute on function public.trigger_google_sweep() from public, anon, authenticated;
comment on function public.trigger_google_sweep() is
  'Asks the edge to read each linked Google listing. Recorded in public.sweep_status.';

create or replace function public.trigger_playbooks_sweep()
returns bigint
language sql
security definer
set search_path = public, extensions
as $$ select public.request_sweep('playbooks', '/api/cron/playbooks') $$;
revoke execute on function public.trigger_playbooks_sweep() from public, anon, authenticated;
comment on function public.trigger_playbooks_sweep() is
  'Asks the edge to run the playbooks whose hour has come, by each business''s own clock. Recorded in public.sweep_status.';

-- 5. The expectation. Reproduced from 00083 with six rows added and nothing
--    else touched.
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
      -- stale-jobs runs at :4, :19, :34 and :49 -- every fifteen minutes, so
      -- 40 is two consecutive missed ticks plus slack, the same arithmetic
      -- the deadman row does for its ten. It is the sweep that marks jobs
      -- failed, settles the message or broadcast behind them and emails the
      -- workspace.
      --
      -- It answers 503 when it could not read half the ledger, which the
      -- status_code branch below already treats as broken. That is the pair:
      -- the sweep learned to say it did not finish, and this is what listens.
      ('jobs',          'stale-jobs-sweep',     interval '40 minutes'),

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

comment on function public.sweep_health() is
  'Every scheduled sweep that changes state on its own, judged: is the cron job there and enabled, did the trigger manage to send, has it been silent longer than two missed ticks, and what did the edge answer. The two SQL sweeps (pauses, snoozes) are judged on schedule alone -- they never leave the database.';

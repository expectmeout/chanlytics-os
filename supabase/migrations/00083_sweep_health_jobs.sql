-- 00083 · The sweep that marks jobs failed is finally watched.
--
-- sweep_health() judges three of the fourteen scheduled sweeps: deadman,
-- itself, and call-reconcile. Every other one -- including the one added in
-- 00078, which marks jobs failed, settles the message or broadcast behind them
-- and emails the workspace -- runs entirely unobserved. If pg_cron dropped it,
-- or the Vault secret it needs went missing, or the edge started answering
-- 401, nothing would say so and a silent recovery sweep is indistinguishable
-- from a quiet week.
--
-- Registering a sweep is four things, which is why this is not a one-liner:
-- the check constraint on sweep_status enumerates the names, the trigger has
-- to record its own pg_net request id, the health function has to expect it,
-- and it needs a seed row so its first judgement is not a false alarm minutes
-- before its first real tick.
--
-- This does it for stale-jobs only. The honest general rule is "watch every
-- sweep that mutates state on its own", which is also registration-sweep and
-- calendar-people-sweep, but each costs another trigger rewrite and this is a
-- migration about the jobs ledger. The rule is recorded here rather than
-- quietly applied to two sweeps nobody was reviewing.

-- 1. The names sweep_status admits. Same `check (col in (...))` form and same
--    reason as 00026: `= any (array[...])` is identical to Postgres and
--    invisible to the tools in tooling/scripts that read constraints out of
--    migration text.
alter table public.sweep_status drop constraint if exists sweep_status_sweep_check;
alter table public.sweep_status add constraint sweep_status_sweep_check
  check (sweep in ('calls', 'deadman', 'health', 'jobs'));

-- 2. A deploy grace period, exactly like 00026's. Without a seed the first
--    health run finds no jobs row, reports "this sweep has never enqueued a
--    request" and emails a false alarm minutes before the first real tick
--    would have filled it in. The first genuine trigger overwrites this.
insert into public.sweep_status (sweep, requested_at)
     values ('jobs', now())
on conflict (sweep) do nothing;

-- 3. The trigger records what it enqueued. Unchanged from 00078 except for the
--    ledger writes, and they are byte-for-byte the shape trigger_deadman_sweep
--    uses -- including the failure path recording the REASON while deliberately
--    NOT refreshing requested_at, because the staleness of requested_at is the
--    backstop that catches a trigger replaced by an older version.
create or replace function public.trigger_stale_jobs_sweep()
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
    raise warning 'stale jobs sweep not configured (missing cron_sweep_key or edge_base_url)';
    insert into public.sweep_status (sweep, note)
         values ('jobs', 'missing cron_sweep_key or edge_base_url in Vault')
    on conflict (sweep) do update set note = excluded.note, request_id = null;
    return null;
  end if;
  select net.http_post(
    url     := v_url || '/api/cron/jobs',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-key', v_key),
    body    := '{}'::jsonb,
    timeout_milliseconds := 55000
  ) into v_id;
  insert into public.sweep_status (sweep, request_id, requested_at, note)
       values ('jobs', v_id, now(), null)
  on conflict (sweep) do update
     set request_id = excluded.request_id, requested_at = excluded.requested_at, note = null;
  return v_id;
end $$;

revoke execute on function public.trigger_stale_jobs_sweep() from public, anon, authenticated;

comment on function public.trigger_stale_jobs_sweep() is
  'Asks the edge to sweep both halves of the jobs ledger. Records the pg_net request id in public.sweep_status so the answer can be found later.';

-- 4. The expectation. Reproduced from 00026 with one row added and nothing
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
      -- workspace, and until now nothing watched whether it ran at all.
      --
      -- It answers 503 when it could not read half the ledger, which the
      -- status_code branch below already treats as broken. That is the pair:
      -- the sweep learned to say it did not finish, and this is what listens.
      ('jobs',          'stale-jobs-sweep',     interval '40 minutes')
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

revoke execute on function public.sweep_health() from public, anon, authenticated;

comment on function public.sweep_health() is
  'Is each pg_cron -> pg_net sweep actually reaching the edge? healthy = detail is null. Read by /api/cron/health and /api/diag. The health row judges its own SILENCE (which catches pg_cron dying) but never its own last RESPONSE -- when this runs, that request is by definition still in flight; /api/diag is where the health sweep''s own reply is judged.';

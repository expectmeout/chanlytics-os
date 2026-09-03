-- The watchdog had no watcher.
--
-- 00018 and 00020 fire their sweeps with net.http_post, which is ASYNCHRONOUS:
-- pg_cron records the run as 'succeeded' the moment the request is ENQUEUED,
-- whatever the edge answers. Measured on this database before writing this:
-- all 2,750 rows in cron.job_run_details say 'succeeded' (the count of rows
-- with status <> 'succeeded' is exactly zero) -- including every
-- call-reconcile tick that posted nothing at all. The edge's real answer lands
-- only in net._http_response, which pg_net purges after six hours (observed
-- window 02:00 -> 07:50 UTC, 36 rows, every one of them deadman).
--
-- 00019 wrote two functions to answer "is the sweep working?" and gave them no
-- caller anywhere. So a rotated cron_sweep_key (401), a moved edge_base_url
-- (404) or a missing RETELL_API_KEY (503) means abandoned customers stop being
-- flagged and phantom calls stop being reconciled, while the schedule, the run
-- history and the dashboard all say healthy.
--
-- BEFORE THIS CAN MERGE -- READ THIS FIRST.
-- packages/db/src/database.types.ts is a CLOSED generated map, so
-- db.rpc("sweep_health"), db.rpc("sweep_mark_alerted") and
-- db.from("sweep_status") are TS2345/TS2769 errors until it is regenerated,
-- and .github/workflows/ci.yml runs `pnpm -r typecheck` plus a
-- `git diff --exit-code -- packages/*/dist` drift guard. The order is:
--   npx --yes supabase@latest db push --linked
--   npx --yes supabase@latest gen types typescript --linked > /tmp/dbtypes.ts
--   node -e "..."                                   # rewrite to CRLF, see spec
--   corepack pnpm --filter "./packages/*" build     # then commit packages/*/dist
-- THEN merge. `corepack pnpm --filter @chanlytics/db gen:types` does NOT work
-- on the maintainer's machine: that script shells out to a bare `supabase`,
-- which is neither on PATH nor a devDependency here. The RUNTIME deploy order
-- stays free either way; it is the BUILD that has a hard prerequisite.
--
-- WHY A LEDGER RATHER THAN JUST READING net._http_response. That table has no
-- url column (id, status_code, content_type, headers, content, timed_out,
-- error_msg, created -- verified against information_schema) and
-- net.http_request_queue is emptied as requests are processed (currently 0
-- rows), so a response cannot be attributed to an endpoint after the fact. The
-- one join key that survives is the request id net.http_post returns -- which
-- the triggers currently throw away. Verified: net.http_request_queue_id_seq
-- last_value is 774 and max(net._http_response.id) is 774, the same number.
--
-- THE SILENCE CASE IS THE POINT. trigger_deadman_sweep() raises a WARNING and
-- returns null when get_cron_sweep_key() or edge_base_url is unreadable. A
-- warning is not an error: pg_cron still records 'succeeded', no request is
-- made, and NOTHING lands in net._http_response. There is no failed response to
-- find, only an absence -- which is why this ledger records requested_at and
-- why the deadman sweep is judged on how long ago it last enqueued anything.
--
-- WHY THE ALERT IS STILL SENT BY THE EDGE. Same reason as 00018: notify()
-- (apps/edge/lib/notify.ts) owns who may be told what, and a second copy of
-- that rule in plpgsql is the duplication this codebase keeps paying for. A
-- broken sweep is a PLATFORM fault with no tenant, so it takes the same
-- addressing alertUnroutable() uses -- tenantId null, isEnvDefault true -- and
-- carries no customer content.

-- ----------------------------------------------------------------- ledger
-- Three rows, forever. Not a log: the question is "is it working NOW", and a
-- growing history would need its own retention to answer it.
--
-- The `check (col in (...))` form is mandatory even though nothing outside SQL
-- enumerates these three names: `= any (array[...])` is identical to Postgres
-- and invisible to every tool in tooling/scripts that reads constraints out of
-- migration text. This set is DELIBERATELY SQL-only -- there is no
-- packages/contracts counterpart, because no client ever enumerates it and a
-- third parallel copy of three literals is the drift this repo already pays
-- for elsewhere. enums-vs-checks.test.mjs diffs only the columns it names
-- (kind, direction, sender, type, channel, reason, verb, subject_type,
-- actor_type, meta_status, state, status, consent, role, class, mode);
-- `sweep` is not one of them, so adding this breaks nothing.
create table if not exists public.sweep_status (
  sweep        text primary key check (sweep in ('calls', 'deadman', 'health')),
  request_id   bigint,
  requested_at timestamptz,
  note         text,
  alerted_at   timestamptz
);

comment on table public.sweep_status is
  'One row per pg_cron -> pg_net sweep: the last request id (joins net._http_response.id), when it was enqueued, why it could not be, and when we last emailed about it being broken.';
comment on column public.sweep_status.note is
  'Set when the trigger could not send at all (missing Vault secret). Cleared by the next tick that either sends successfully or finds nothing to send. Distinct from a failed RESPONSE, which has no note and a status_code.';
comment on column public.sweep_status.alerted_at is
  'Suppression stamp, set only after an alert was actually DELIVERED, cleared on recovery.';

-- Deny-all, exactly like public.jobs (00002) and public.platform_admins
-- (00001): RLS on, no policies. Verified on this database: public.jobs has
-- relrowsecurity = true with zero rows in pg_policies. Supabase's default
-- privileges grant anon and authenticated full table rights, so without this
-- the sweep state is readable through PostgREST with the anon key. service_role
-- has rolbypassrls = true (verified) and is the only reader that needs it.
alter table public.sweep_status enable row level security;

-- A deploy grace period. Without a seed the first sweep_health() call sees no
-- deadman row, reports "has never enqueued a request", and emails a false
-- alarm minutes before the next real tick would have filled it in. The first
-- genuine trigger overwrites these.
insert into public.sweep_status (sweep, requested_at)
     values ('deadman', now()), ('health', now()), ('calls', null)
on conflict (sweep) do nothing;

-- ------------------------------------------------- the triggers, recording
-- Unchanged from 00018 except for the ledger writes. Note the failure path
-- records the REASON but deliberately does NOT refresh requested_at: the
-- staleness of requested_at is the backstop that catches a trigger replaced by
-- an older version, and refreshing it here would make a permanently
-- misconfigured sweep look freshly attempted.
create or replace function public.trigger_deadman_sweep()
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
    raise warning 'deadman sweep not configured (missing cron_sweep_key or edge_base_url)';
    insert into public.sweep_status (sweep, note)
         values ('deadman', 'missing cron_sweep_key or edge_base_url in Vault')
    on conflict (sweep) do update set note = excluded.note, request_id = null;
    return null;
  end if;
  select net.http_post(
    url     := v_url || '/api/cron/deadman',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-key', v_key),
    body    := '{}'::jsonb,
    timeout_milliseconds := 20000
  ) into v_id;
  insert into public.sweep_status (sweep, request_id, requested_at, note)
       values ('deadman', v_id, now(), null)
  on conflict (sweep) do update
     set request_id = excluded.request_id, requested_at = excluded.requested_at, note = null;
  return v_id;
end $$;

revoke execute on function public.trigger_deadman_sweep() from public, anon, authenticated;

comment on function public.trigger_deadman_sweep() is
  'Asks the edge to flag escalations nobody picked up. Records the pg_net request id in public.sweep_status so the answer can be found later.';

create or replace function public.trigger_call_reconcile()
returns bigint
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_key text;
  v_url text;
  v_id  bigint;
  v_pending int;
begin
  -- Cheap guard, unchanged: on a quiet line this is every tick, and there is
  -- no reason to wake the edge to tell it there is nothing to do. This is also
  -- why the calls sweep has NO silence expectation in sweep_health(): days of
  -- posting nothing is the correct behaviour of an idle phone line.
  select count(*) into v_pending
    from public.calls
   where status = 'ongoing'
     and updated_at < now() - interval '5 minutes';
  if v_pending = 0 then
    -- CLEARING THE NOTE HERE IS LOAD-BEARING. Without it, one transient Vault
    -- failure during a busy period writes a note that this early return then
    -- steps over on every subsequent tick -- forever, on an idle line (there
    -- are currently zero ongoing calls, so this branch is taken on every one
    -- of this job's runs). The note would outlive the fault, sweep_health()
    -- ranks `note` above everything, and the platform mailbox would get four
    -- mails a day about a sweep that has nothing to do and no way to say so.
    -- `note` means "the last time I had work, I could not send it"; having
    -- nothing to send is not a fault, so the note goes.
    update public.sweep_status set note = null where sweep = 'calls' and note is not null;
    return null;
  end if;

  select public.get_cron_sweep_key() into v_key;
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'edge_base_url';
  if v_key is null or v_url is null then
    raise warning 'call reconcile not configured (missing cron_sweep_key or edge_base_url)';
    insert into public.sweep_status (sweep, note)
         values ('calls', 'missing cron_sweep_key or edge_base_url in Vault')
    on conflict (sweep) do update set note = excluded.note, request_id = null;
    return null;
  end if;

  select net.http_post(
    url     := v_url || '/api/cron/calls',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-key', v_key),
    body    := '{}'::jsonb,
    timeout_milliseconds := 30000
  ) into v_id;
  insert into public.sweep_status (sweep, request_id, requested_at, note)
       values ('calls', v_id, now(), null)
  on conflict (sweep) do update
     set request_id = excluded.request_id, requested_at = excluded.requested_at, note = null;
  return v_id;
end $$;

revoke execute on function public.trigger_call_reconcile() from public, anon, authenticated;

comment on function public.trigger_call_reconcile() is
  'Asks the edge to reconcile ongoing calls against the voice provider. No-ops when nothing is stale, and clears any stale failure note when it does.';

/**
 * Ask the edge to check on the other sweeps. Same shape and same Vault secret
 * as the two it watches, so there is still exactly one key to manage.
 */
create or replace function public.trigger_sweep_health()
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
    raise warning 'sweep health check not configured (missing cron_sweep_key or edge_base_url)';
    insert into public.sweep_status (sweep, note)
         values ('health', 'missing cron_sweep_key or edge_base_url in Vault')
    on conflict (sweep) do update set note = excluded.note, request_id = null;
    return null;
  end if;
  select net.http_post(
    url     := v_url || '/api/cron/health',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-key', v_key),
    body    := '{}'::jsonb,
    timeout_milliseconds := 20000
  ) into v_id;
  insert into public.sweep_status (sweep, request_id, requested_at, note)
       values ('health', v_id, now(), null)
  on conflict (sweep) do update
     set request_id = excluded.request_id, requested_at = excluded.requested_at, note = null;
  return v_id;
end $$;

revoke execute on function public.trigger_sweep_health() from public, anon, authenticated;

comment on function public.trigger_sweep_health() is
  'Asks the edge to judge the other sweeps and email the platform operator if any of them stopped reaching it.';

-- ------------------------------------------------------------- the verdict
/**
 * One row per sweep: is it working, and if not, what exactly went wrong.
 *
 * healthy = (detail is null). The ladder is ordered by how far up the chain
 * the failure is, so the first true branch is the most useful sentence:
 * schedule -> trigger -> silence -> response.
 *
 * EVERY column reference in this body is table-qualified on purpose. A
 * `returns table` function keeps its OUT parameter names (sweep, healthy,
 * detail, status_code, alerted_at) in scope for the whole body, and several of
 * them are also column names here. A SQL-language function resolves that in
 * favour of the column silently -- which is worse than an error, because the
 * day someone converts this to plpgsql it becomes "column reference is
 * ambiguous" instead. Qualifying everything means neither language can get it
 * wrong.
 *
 * search_path is `public` only, the house rule. cron.job and
 * net._http_response are reached by fully-qualified name, which needs no
 * search_path entry -- only USAGE on the schema, which the owning role
 * (postgres) has on both (verified: has_schema_privilege is true for cron and
 * net).
 *
 * A response is only JUDGED when the request that produced it is less than an
 * hour old. pg_net drops _http_response rows after six hours, so an older
 * request legitimately has no response row and must never be read as a
 * failure -- which matters for the calls sweep, whose last request can be days
 * old on a quiet line.
 */
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
      ('calls',         'call-reconcile',       null::interval)
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

/**
 * Stamp the sweeps we successfully warned about; clear the ones that recovered.
 *
 * Same lesson as alertUnroutable() in apps/edge/api/whatsapp.ts: only a
 * DELIVERED alert earns the quiet, so the edge calls this with p_alerted only
 * after notify() returned true. Unlike that one the stamp is DURABLE, because
 * a cron-driven route hits a cold lambda most ticks and an in-memory window
 * would suppress nothing.
 *
 * Clearing on recovery is what makes a flapping sweep alert again immediately
 * instead of waiting out a window it earned hours ago -- so the clear is
 * COUNTED too, not fired and forgotten. A forbidden or no-op UPDATE returns
 * success with zero rows in this codebase's experience, and this is the one
 * statement whose silent failure would re-arm suppression wrongly.
 */
create or replace function public.sweep_mark_alerted(p_alerted text[], p_healthy text[])
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_stamped integer;
  v_cleared integer;
begin
  insert into public.sweep_status (sweep, alerted_at)
  select x, now() from unnest(coalesce(p_alerted, '{}'::text[])) as x
  on conflict (sweep) do update set alerted_at = excluded.alerted_at;
  get diagnostics v_stamped = row_count;

  update public.sweep_status
     set alerted_at = null
   where sweep = any(coalesce(p_healthy, '{}'::text[]))
     and alerted_at is not null;
  get diagnostics v_cleared = row_count;

  return v_stamped + v_cleared;
end $$;

revoke execute on function public.sweep_mark_alerted(text[], text[]) from public, anon, authenticated;

comment on function public.sweep_mark_alerted(text[], text[]) is
  'Records that an alert was DELIVERED for each sweep in p_alerted, and clears the suppression stamp of each sweep in p_healthy. Returns rows stamped + rows cleared.';

-- ------------------------------------------------------- cron history purge
/**
 * cron.job_run_details grows forever and is already the largest relation in
 * this database (520 kB / 2,750 rows against public.calls at 360 kB), at about
 * 580 rows a day once every schedule here is running.
 *
 * NO INDEX. cron.job_run_details is owned by supabase_admin and `postgres` is
 * not a member of it (checked: pg_has_role('postgres','supabase_admin','MEMBER')
 * is false), so CREATE INDEX on it is not available to a migration and would
 * abort this one. It is not needed: with this retention the table settles at
 * roughly 8,000 rows, where a once-daily sequential delete is free. The DELETE
 * itself is permitted -- has_table_privilege('postgres','cron.job_run_details',
 * 'delete') is true, and postgres carries BYPASSRLS so pg_cron's own row policy
 * cannot silently narrow it to zero rows.
 *
 * WHY A PER-JOB FLOOR AS WELL AS AN AGE CUT. events-partition-precreate runs
 * MONTHLY ('0 12 25 * *'). A 14-day age-only purge would delete its run record
 * before it ever ran again, so "did the partition get pre-created last month?"
 * -- the question you ask the morning inserts into `events` start failing --
 * would have no answer in cron history at all. Keeping the last 30 runs of
 * every job costs a few hundred rows and keeps 30 months of that job.
 *
 * Rows with a NULL start_time (a run pg_cron has recorded but not started) are
 * never deleted, because `d.start_time < now() - p_keep` is NULL for them and
 * the `nulls first` ordering also ranks them inside the per-job floor. That is
 * the safe direction and it is deliberate -- do not "fix" it into deleting
 * in-flight runs. There are currently zero such rows.
 *
 * Deploying this destroys nothing today: the oldest row in this database is
 * 2026-08-27, seven days old, so the first run deletes zero (checked by
 * running the ranking as a read-only SELECT: zero rows would match).
 */
create or replace function public.purge_cron_history(
  p_keep         interval default '14 days',
  p_keep_per_job integer  default 30
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare v_count integer;
begin
  with ranked as (
    select runid,
           row_number() over (partition by jobid order by start_time desc nulls first) as rn
      from cron.job_run_details
  )
  delete from cron.job_run_details d
   using ranked r
   where r.runid = d.runid
     and r.rn > p_keep_per_job
     and d.start_time < now() - p_keep;
  get diagnostics v_count = row_count;
  return v_count;
end $$;

revoke execute on function public.purge_cron_history(interval, integer) from public, anon, authenticated;

comment on function public.purge_cron_history(interval, integer) is
  'Bounds cron.job_run_details: drops runs older than p_keep, except the most recent p_keep_per_job of each job (events-partition-precreate runs monthly and would otherwise lose its history between runs). Rows with a null start_time are never deleted.';

-- ------------------------------------------------------------- schedules
-- 13 and 43 past the hour. THE OFFSET IS THE WHOLE POINT, not tidiness.
--
-- '*/30' fires at :00 and :30 -- which are BOTH deadman-sweep ticks ('*/10' =
-- :00,:10,...,:50) and both call-reconcile ticks ('*/5'). pg_cron starts the
-- colliding jobs in the same second, trigger_deadman_sweep() overwrites
-- sweep_status.deadman.requested_at with now(), and by the time pg_net
-- delivers this request and the edge calls sweep_health() the deadman request
-- is a second or two old with its response still uncommitted inside the same
-- pg_net worker iteration. It is then exempted by this function's own
-- two-minute grace, falls off the end of the CASE, and reports healthy. A 401,
-- a 404 or a 503 on the deadman sweep -- the three failures this entire
-- migration exists to catch -- would be structurally invisible.
--
-- 13 and 43 sit three minutes after every '*/5', '*/10' and '*/15' tick and
-- clear of the 17-minute purge, so the request being judged is always past the
-- two-minute grace and well inside the one-hour judging window, with its
-- response long since recorded. Cadence is still exactly 30 minutes, so the
-- 70-minute silence window above is unchanged. 48 requests a day.
select cron.unschedule('sweep-health') where exists (select 1 from cron.job where jobname = 'sweep-health');
select cron.schedule('sweep-health', '13,43 * * * *', $$select public.trigger_sweep_health()$$);

-- 04:17 UTC: off the :00/:05/:10/:13/:15/:43/:45 grid every other job shares,
-- so it never piles onto a sweep tick.
select cron.unschedule('purge-cron-history') where exists (select 1 from cron.job where jobname = 'purge-cron-history');
select cron.schedule('purge-cron-history', '17 4 * * *', $$select public.purge_cron_history()$$);

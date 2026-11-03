-- 00526 · The ledger knows its kinds (docs/decisions/0089-the-ledger-knows-its-kinds.md).
--
-- A job kind's facts were spelled in a dozen places in two languages: the jobs.kind CHECK (re-spelled whole in seventeen
-- migrations), the lane (a generated column re-made in seven, each a rewrite of the table), the once-only key (in
-- packages/jobs for the writers there, in three bespoke indexes for the fifteen SQL functions that insert jobs), and the
-- rest in packages/jobs. Now:
--
--   job_kinds            one row a kind: its lane, its once-only rule (the parts of its key, and whether the key holds
--                        while the row is kept or only while it is live), and its pause. jobs.kind references it, so a
--                        new kind is one row here and never a CHECK swap or a table rewrite.
--   jobs_take_their_kind a trigger before every insert, whoever writes it: the lane and the once-only key from the kind's
--                        row. The rule is spelled once, here; packages/jobs no longer computes a key.
--   dedupe_kept          the column that says a row's key holds while it is kept (email_ingest, lead_collect,
--                        reply_read), the rows keyed; 00528 builds the one index over it, online, and 00529 drops
--                        jobs_email_ingest_uq and jobs_reply_read_once (decision 0033, step 3); jobs_lead_collect_once
--                        stays while three SQL writers name its columns in ON CONFLICT.
--                        A lead round's start and each batch of its checks have no rule here: their key (00506) is
--                        the writer's to ask for (packages/jobs, lead_collect_commit), so a door's own start
--                        (lead_round_answer) is never refused for one already waiting.
--   jobs_guard           a job that threw and waits to be tried again goes back to scheduled, its attempts kept: fired
--                        means running. Cancel, withdraw and an erasure's cancel reach a waiting retry as they reach any
--                        scheduled row.
--   claim_due_jobs       skips a paused kind; the capacity clause goes with job_capacity, which nothing ever wrote.
--   trigger_jobs_tick    asks every two seconds: a row that came due in the last three seconds knocks at once (at most
--                        once a second), the rest of the ledger every ten as before, and the quiet look is stamped every
--                        ten seconds, not every two.
--   jobs_backlog         counts a lease that ran out as it counts a due row, and leaves a paused kind out.
--   the canary           a job kind that does nothing, scheduled every minute in our own workspace; sweep_status judges
--                        it by the newest one done ('job'), so /api/health proves the whole loop from outside: pg_cron,
--                        pg_net, the edge, the claim, the handler and the completion.
--   job_kind_pause       the incident lever: a kind paused is never claimed; its rows wait, and run when it resumes.
--   jobs_ledger_now      what Health reads: running, due, waiting and expired by lane, the oldest due, each kind's day.
--
-- Deploy order: this migration, 00527, 00528 and 00529 first, in order, then the apps (packages/jobs no longer writes a key; the trigger does). Re-runnable.

set local lock_timeout = '3s';

/* ----------------------------------------------------------------------------- 1. the kinds -- */

create table if not exists public.job_kinds (
  kind        text primary key,
  lane        smallint not null check (lane between 0 and 2),
  once_parts  text[],
  once_kept   boolean not null default false,
  paused_at   timestamptz,
  paused_why  text check (paused_why is null or char_length(paused_why) between 1 and 500),
  created_at  timestamptz not null default now()
);
alter table public.job_kinds enable row level security;
revoke all on public.job_kinds from anon, authenticated;
grant all on public.job_kinds to service_role;
comment on table public.job_kinds is
  'One row a job kind (00526, decision 0089): the lane a claim takes it in (0 a reply, 1 someone waiting who is not a customer, 2 bulk), its once-only rule and its pause. jobs.kind references it. packages/jobs KIND_POLICY says the rest, and jobs/job-kinds.test.mjs holds the two equal. The service role''s alone.';
comment on column public.job_kinds.once_parts is
  'The parts of the once-only key after the kind, in order: a payload field; @tenant for the workspace; field=default for a field that defaults; field? for one added only when present. A required field the payload does not name gives no key. Null: the kind has no rule ({} is a rule: the kind alone, held once).';
comment on column public.job_kinds.once_kept is
  'True: the key holds while the row is kept and not failed (jobs_dedupe_kept), so a replay after done finds it. False: only while scheduled or fired (jobs_dedupe_live).';

insert into public.job_kinds (kind, lane, once_parts, once_kept) values
  ('outbound_send',    0, null,                                         false),
  ('email_ingest',     0, array['mailbox_id', 'received_id'],          true),
  ('push_send',        0, null,                                         false),
  ('inbound_answer',   0, array['message_id'],                          false),
  ('canary',           0, array['@tenant'],                             false),
  ('line_provision',   1, null,                                         false),
  ('reply_read',       1, array['message_id', 'stage=read'],           true),
  ('booking_read',     1, array['@tenant', 'received_id'],             false),
  ('website_read',     1, array['@tenant'],                             false),
  ('preview_build',    1, array['preview_id'],                          false),
  ('erasure_finish',   1, array['contact_id'],                          false),
  ('broadcast_send',   2, null,                                         false),
  ('lead_round_start', 2, null,                                         false),
  ('lead_collect',     2, array['run_id', 'seq'],                       true),
  ('lead_check',       2, null,                                         false),
  ('push_receipts',    2, null,                                         false),
  ('history_import',   2, array['@tenant', 'source', 'seq', 'connection_id?'], false),
  ('event_deliver',    2, null,                                         false)
on conflict (kind) do update
  set lane = excluded.lane, once_parts = excluded.once_parts, once_kept = excluded.once_kept;

alter table public.jobs drop constraint if exists jobs_kind_check;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'jobs_kind_fkey' and conrelid = 'public.jobs'::regclass) then
    alter table public.jobs add constraint jobs_kind_fkey foreign key (kind) references public.job_kinds (kind);
  end if;
end $$;

/* ------------------------------------------------------------------- 2. the lane and the key -- */

-- The lane is a plain column now, its values kept (no rewrite): the trigger below writes it from the kind's row.
alter table public.jobs alter column lane drop expression if exists;
alter table public.jobs add column if not exists dedupe_kept boolean not null default false;
comment on column public.jobs.lane is
  'Which work a claim takes first (decision 0018): the kind''s lane (job_kinds.lane), written by jobs_take_their_kind at insert; a lane-0 kind whose payload says purpose outreach is bulk, and an event_deliver runs in its subscription''s lane (payload.lane, 00334).';
comment on column public.jobs.dedupe_kept is
  'Whether this row''s once-only key holds while it is kept (job_kinds.once_kept, jobs_dedupe_kept) rather than only while it is live. Written by jobs_take_their_kind.';

create or replace function public.job_dedupe_key_of(p_kind text, p_tenant uuid, p_payload jsonb)
returns text
language plpgsql
stable
set search_path = public
as $$
declare
  v_parts   text[];
  v_found   boolean;
  v_part    text;
  v_name    text;
  v_value   text;
  v_key     text;
begin
  select k.once_parts, true into v_parts, v_found from public.job_kinds k where k.kind = p_kind;
  if v_parts is null then
    -- A failed job run again from the Console names the job it is a copy of: once per failed job, for a kind with no
    -- subject of its own to be held once by.
    if coalesce(v_found, false) and jsonb_typeof(p_payload -> 'requeue_of') = 'string' then
      return 'requeue:' || (p_payload ->> 'requeue_of');
    end if;
    return null;
  end if;
  v_key := p_kind;
  foreach v_part in array v_parts loop
    if v_part = '@tenant' then
      v_key := v_key || ':' || p_tenant::text;
    elsif right(v_part, 1) = '?' then
      v_name := left(v_part, -1);
      v_value := case when jsonb_typeof(p_payload -> v_name) = 'string' then nullif(p_payload ->> v_name, '') end;
      if v_value is not null then
        v_key := v_key || ':' || v_value;
      end if;
    else
      v_name := split_part(v_part, '=', 1);
      v_value := case when jsonb_typeof(p_payload -> v_name) = 'string' then nullif(p_payload ->> v_name, '') end;
      v_value := coalesce(v_value, nullif(split_part(v_part, '=', 2), ''));
      -- A subject the payload does not name is held by nothing, as packages/jobs said it before.
      if v_value is null then
        return null;
      end if;
      v_key := v_key || ':' || v_value;
    end if;
  end loop;
  return v_key;
end $$;
revoke all on function public.job_dedupe_key_of(text, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.job_dedupe_key_of(text, uuid, jsonb) to service_role;
comment on function public.job_dedupe_key_of(text, uuid, jsonb) is
  'The once-only key a job of this kind and payload carries (job_kinds.once_parts, 00526), or null when it carries none. The one spelling of the rule.';

create or replace function public.jobs_take_their_kind()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_kind public.job_kinds;
begin
  select * into v_kind from public.job_kinds k where k.kind = NEW.kind;
  -- A kind with no row is refused by the foreign key, in its own words.
  if not found then
    return NEW;
  end if;
  NEW.lane := case
    when NEW.kind = 'event_deliver' and NEW.payload ->> 'lane' ~ '^[0-2]$' then (NEW.payload ->> 'lane')::smallint
    when v_kind.lane = 0 and coalesce(NEW.payload ->> 'purpose', '') = 'outreach' then 2
    else v_kind.lane
  end;
  if NEW.dedupe_key is null then
    NEW.dedupe_key := public.job_dedupe_key_of(NEW.kind, NEW.tenant_id, NEW.payload);
  end if;
  NEW.dedupe_kept := v_kind.once_kept and NEW.dedupe_key is not null and NEW.dedupe_key not like 'requeue:%';
  return NEW;
end $$;
revoke all on function public.jobs_take_their_kind() from public, anon, authenticated;
drop trigger if exists jobs_take_their_kind on public.jobs;
create trigger jobs_take_their_kind before insert on public.jobs
  for each row execute function public.jobs_take_their_kind();

-- The kinds held while kept: the rows the three bespoke indexes held, keyed now. The one index for all of them is built
-- online in a file of its own (00528: jobs takes a write for every send and every webhook), and the three go once it
-- holds (00529); until then they hold these rows as they did.
update public.jobs j
   set dedupe_key  = coalesce(j.dedupe_key, public.job_dedupe_key_of(j.kind, j.tenant_id, j.payload)),
       dedupe_kept = true
 where j.kind in ('email_ingest', 'lead_collect', 'reply_read')
   and j.state <> 'failed'
   and (j.dedupe_key is null or not j.dedupe_kept)
   and public.job_dedupe_key_of(j.kind, j.tenant_id, j.payload) is not null;

/* ------------------------------------------------------------------ 3. waiting means scheduled -- */

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
    -- A run that threw puts its job back to wait for its next try (00526), with its claims counted as they were, or one
    -- fewer for a run that never started (a kind this runner did not know): the next claim counts on from there.
    if OLD.state = 'fired' and NEW.state = 'scheduled' and NEW.attempts > OLD.attempts then
      raise exception 'a job put back to wait keeps its attempts (% -> % refused)', OLD.attempts, NEW.attempts;
    end if;
    if OLD.state = 'fired' and NEW.state not in ('done', 'failed', 'scheduled') then
      raise exception 'a fired job may only finish, fail or wait for its next try (% refused)', NEW.state;
    end if;
  end if;
  return NEW;
end $$;
comment on function public.jobs_guard() is
  'scheduled -> fired | canceled; fired -> fired (a lease taken back) | done | failed | scheduled (a retry waiting, its attempts kept or one fewer, 00526); done, failed and canceled are final. A payload may still change on any row: an erasure scrubs finished ones.';

/* -------------------------------------------------------------------------------- 4. the claim -- */

create or replace function public.claim_due_jobs(p_limit integer, p_lease_seconds integer)
returns setof public.jobs
language sql
security definer
set search_path = public
as $$
  with
  -- What is running: fired under a live lease. Read once, not per row.
  running as (
    select r.tenant_id, r.lane
      from public.jobs r
     where r.state = 'fired'
       and r.fired_at > now() - make_interval(secs => p_lease_seconds)
       and r.lease_until >= now()
  ),
  -- The workspaces with work of each lane running: they wait their turn behind those with none.
  busy as (
    select distinct tenant_id, lane from running where lane is not null
  ),
  -- The kinds an operator paused (job_kind_pause): their rows wait where they are.
  paused as (
    select k.kind from public.job_kinds k where k.paused_at is not null
  ),
  due as (
    select c.id
      from public.jobs c
     where ((c.state = 'scheduled' and c.due_at <= now())
         or (c.state = 'fired' and c.lease_until < now()))
       and c.kind not in (select p.kind from paused p)
     order by c.lane nulls last,
              -- false before true: within the lane, a workspace with nothing of that lane running goes first (00335).
              (c.tenant_id, c.lane) in (select b.tenant_id, b.lane from busy b),
              c.due_at
     limit p_limit
       for update of c skip locked
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
revoke all on function public.claim_due_jobs(integer, integer) from public, anon, authenticated;
grant execute on function public.claim_due_jobs(integer, integer) to service_role;
comment on function public.claim_due_jobs(integer, integer) is
  'The only way a job becomes fired. Concurrent ticks take different rows (skip locked). Takes the lowest lane first (decision 0018); within a lane a workspace with nothing of that lane running goes first (00335), then the earliest due; a paused kind is left where it is (00526). Takes back a fired row whose lease ran out with attempts + 1.';

drop table if exists public.job_capacity;

/* ------------------------------------------------------------------------------- 5. the clock -- */

create or replace function public.trigger_jobs_tick()
returns bigint
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_woken timestamptz;
begin
  -- A row that came due in the last three seconds asks at once (a reply's veto window, a member's grace), at most once a
  -- second whoever asks (ask_for_tick): it leaves on time, not on the next ten-second poll. The tick it asks for claims
  -- everything due, so the poll below has nothing to add; its answer is the request ask_for_tick made, if it made one.
  if exists (
    select 1 from public.jobs j
     where j.state = 'scheduled'
       and j.due_at <= now() and j.due_at > now() - interval '3 seconds'
       and j.kind not in (select k.kind from public.job_kinds k where k.paused_at is not null)
  ) then
    if public.ask_for_tick() then
      return (select s.request_id from public.sweep_status s where s.sweep = 'jobs');
    end if;
    return null;
  end if;
  -- The rest of the ledger is asked for every ten seconds, as it always was: the pace the tick's overlapping runs are
  -- sized for.
  select s.woken_at into v_woken from public.sweep_status s where s.sweep = 'jobs';
  if (v_woken is null or v_woken < now() - interval '10 seconds')
     and (exists (
            select 1 from public.jobs j
             where ((j.state = 'scheduled' and j.due_at <= now()) or (j.state = 'fired' and j.lease_until < now()))
               and j.kind not in (select k.kind from public.job_kinds k where k.paused_at is not null)
          )
          or exists (select 1 from public.event_outbox)) then
    update public.sweep_status set woken_at = now() where sweep = 'jobs';
    return public.request_sweep('jobs', '/api/jobs/tick');
  end if;
  -- Nothing to ask for: the look itself is the evidence, stamped every ten seconds. request_id and note stay as the last
  -- real call left them, so a failed answer or a missing Vault secret stays visible until a call succeeds.
  insert into public.sweep_status (sweep, requested_at) values ('jobs', now())
  on conflict (sweep) do update set requested_at = excluded.requested_at
   where public.sweep_status.requested_at is null or public.sweep_status.requested_at < now() - interval '10 seconds';
  return null;
end $$;
revoke all on function public.trigger_jobs_tick() from public, anon, authenticated;

select cron.unschedule('jobs-tick') where exists (select 1 from cron.job where jobname = 'jobs-tick');
select cron.schedule('jobs-tick', '2 seconds', $$select public.trigger_jobs_tick()$$);

create or replace function public.jobs_backlog(p_wait interval default interval '2 minutes')
returns integer
language sql
security definer
set search_path = public
as $$
  select count(*)::int
    from public.jobs j
   where ((j.state = 'scheduled' and j.due_at < now() - p_wait)
       or (j.state = 'fired' and j.lease_until < now() - p_wait))
     and not exists (select 1 from public.job_kinds k where k.kind = j.kind and k.paused_at is not null);
$$;
comment on function public.jobs_backlog(interval) is
  'How many jobs the claim could take and has not for longer than p_wait (default two minutes): scheduled rows past their due time and fired rows past their lease (00526), a paused kind''s left out (Health names those). Zero when the heartbeat is draining.';
revoke execute on function public.jobs_backlog(interval) from public, anon, authenticated;
grant execute on function public.jobs_backlog(interval) to service_role;

/* ------------------------------------------------------------------------------ 6. the canary -- */

alter table public.sweep_status add column if not exists kind text;
alter table public.sweep_status drop constraint if exists sweep_status_judged_by_check;
alter table public.sweep_status add constraint sweep_status_judged_by_check
  check (judged_by in ('request', 'run', 'job'));
comment on column public.sweep_status.kind is
  'For a clock judged by job (00526): the job kind whose newest done row says whether the ledger is running its work.';

create or replace function public.schedule_canary()
returns void
language sql
security definer
set search_path = public
as $$
  -- One canary at a time (its key is the kind and the workspace), in our own workspace: the nightly suite's and the smoke's, whose
  -- jobs page nobody and ring no bell. A database with none of ours schedules nothing, and the canary is not judged.
  insert into public.jobs (tenant_id, kind, due_at, payload)
  select t.id, 'canary', now(), '{}'::jsonb
    from public.tenants t
   where t.ours
   order by t.created_at
   limit 1
  on conflict do nothing;
$$;
revoke all on function public.schedule_canary() from public, anon, authenticated;
comment on function public.schedule_canary() is
  'Puts one canary on the ledger, in our first workspace, unless one is already waiting or running (00526). pg_cron calls it every minute (jobs-canary).';

select cron.unschedule('jobs-canary') where exists (select 1 from cron.job where jobname = 'jobs-canary');
select cron.schedule('jobs-canary', '* * * * *', $$select public.schedule_canary()$$);

insert into public.sweep_status (sweep, jobname, max_silence, judged_by, kind, requested_at) values
  ('jobs_canary', 'jobs-canary', interval '3 minutes', 'job', 'canary', null)
on conflict (sweep) do update
  set jobname = excluded.jobname, max_silence = excluded.max_silence, judged_by = excluded.judged_by,
      kind = excluded.kind;

create or replace function public.sweep_health()
returns table(sweep text, healthy boolean, detail text, last_request_at timestamp with time zone, status_code integer,
              scheduled boolean, alerted_at timestamp with time zone)
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
           e.request_id, e.requested_at, e.note, e.alerted_at, e.kind as job_kind,
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
           -- pg_net deletes an answer six hours after recording it, with
           -- everything as old, and a clock that records its looks keeps its
           -- last real ask judged for longer than that. If pg_net holds
           -- nothing OLDER than our request, any answer it had went with the
           -- rest and was judged while it was held, and we say nothing.
           exists (select 1 from net._http_response nr where nr.id < e.request_id)
                                                  as older_response_seen,
           ok.at                                  as last_ok,
           lt.status                              as last_status,
           lt.message                             as last_message,
           -- Judged by job (00526): when the newest row of its kind was done, and whether any workspace of ours is
           -- there for the clock to schedule it in.
           case when e.judged_by = 'job' then
             (select max(d.updated_at) from public.jobs d where d.kind = e.kind and d.state = 'done')
           end                                    as job_done_at,
           case when e.judged_by = 'job' then
             exists (select 1 from public.tenants t where t.ours)
           end                                    as job_watched
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

        -- Judged by the work it puts on the ledger: its newest done row (00526).
        when o.judged_by = 'job' and not coalesce(o.job_watched, false) then
          null
        when o.judged_by = 'job' and o.max_silence is null then
          null
        when o.judged_by = 'job' and o.job_done_at is null and o.registered_at > now() - o.max_silence then
          null
        when o.judged_by = 'job' and o.job_done_at is null then
          'no ' || coalesce(o.job_kind, '(no kind)') || ' job has finished since this clock was registered; ' ||
          o.jobname || ' is scheduled ' || coalesce(o.job_schedule, '(unknown)')
        when o.judged_by = 'job' and o.job_done_at < now() - o.max_silence then
          'the newest ' || coalesce(o.job_kind, '(no kind)') || ' job finished at ' ||
          to_char(o.job_done_at at time zone 'utc', 'YYYY-MM-DD HH24:MI') ||
          ' UTC: the ledger is not running its work (pg_cron, pg_net, the edge, the claim or the handler)'
        when o.judged_by = 'job' then
          null

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
             and o.older_response_seen and o.newer_response_seen then
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
         case when j.judged_by = 'run' then j.last_ok when j.judged_by = 'job' then j.job_done_at else j.requested_at end,
         j.status_code,
         j.job_exists and j.job_active,
         j.alerted_at
    from judged j
   order by j.sweep;
$$;

/* ------------------------------------------------------------------------------ 7. the pause -- */

create or replace function public.job_kind_pause(p_kind text, p_why text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_at timestamptz;
begin
  if nullif(btrim(coalesce(p_why, '')), '') is null then
    return jsonb_build_object('error', 'no_reason');
  end if;
  update public.job_kinds
     set paused_at = coalesce(paused_at, now()), paused_why = left(btrim(p_why), 500)
   where kind = p_kind
  returning paused_at into v_at;
  if v_at is null then
    return jsonb_build_object('error', 'unknown_kind');
  end if;
  return jsonb_build_object('kind', p_kind, 'paused_at', v_at);
end $$;
revoke all on function public.job_kind_pause(text, text) from public, anon, authenticated;
grant execute on function public.job_kind_pause(text, text) to service_role;
comment on function public.job_kind_pause(text, text) is
  'Pauses a job kind (00526): no claim takes its rows until it is resumed, and they wait where they are. The reason is the operator''s, said on Health. Answers {kind, paused_at} or {error: no_reason | unknown_kind}. The Console''s act, on the service role.';

create or replace function public.job_kind_resume(p_kind text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_found boolean;
begin
  update public.job_kinds set paused_at = null, paused_why = null where kind = p_kind
  returning true into v_found;
  if not coalesce(v_found, false) then
    return jsonb_build_object('error', 'unknown_kind');
  end if;
  -- What waited is due: the tick is asked now rather than on the next poll.
  perform public.ask_for_tick();
  return jsonb_build_object('kind', p_kind, 'resumed', true);
end $$;
revoke all on function public.job_kind_resume(text) from public, anon, authenticated;
grant execute on function public.job_kind_resume(text) to service_role;
comment on function public.job_kind_resume(text) is
  'Resumes a paused job kind (00526) and asks the tick for what waited. Answers {kind, resumed} or {error: unknown_kind}. The Console''s act, on the service role.';

/* ---------------------------------------------------------------------------- 8. what Health reads -- */

create or replace function public.jobs_ledger_now()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'lanes', coalesce((
      select jsonb_agg(l order by l.lane)
        from (
          select coalesce(j.lane, -1) as lane,
                 count(*) filter (where j.state = 'fired' and j.lease_until >= now())                   as running,
                 count(*) filter (where j.state = 'scheduled' and j.due_at <= now())                    as due,
                 count(*) filter (where j.state = 'scheduled' and j.due_at > now() and j.attempts > 0)  as waiting,
                 count(*) filter (where j.state = 'fired' and j.lease_until < now())                    as expired,
                 coalesce(max(extract(epoch from (now() - j.due_at))) filter (
                   where j.state = 'scheduled' and j.due_at <= now()), 0)::int                          as oldest_due_s
            from public.jobs j
           where j.state in ('scheduled', 'fired')
           group by coalesce(j.lane, -1)
        ) l
    ), '[]'::jsonb),
    'kinds', coalesce((
      select jsonb_agg(k order by k.kind)
        from (
          select jk.kind, jk.lane, jk.paused_at, jk.paused_why,
                 (select count(*) from public.jobs f
                   where f.kind = jk.kind and f.state = 'failed' and f.updated_at > now() - interval '1 day') as failed_day,
                 (select count(*) from public.jobs d
                   where d.kind = jk.kind and d.state = 'done' and d.updated_at > now() - interval '1 day')   as done_day
            from public.job_kinds jk
        ) k
    ), '[]'::jsonb),
    'canary_done_at', (select max(c.updated_at) from public.jobs c where c.kind = 'canary' and c.state = 'done'),
    'read_at', now()
  );
$$;
revoke all on function public.jobs_ledger_now() from public, anon, authenticated;
grant execute on function public.jobs_ledger_now() to service_role;
comment on function public.jobs_ledger_now() is
  'What the Console''s Health draws of the ledger now (00526): by lane, how many run, are due, wait for a retry and ran past their lease, and the oldest due in seconds; by kind, its lane, its pause and its last day''s failed and done; when the canary last finished. The service role''s alone.';

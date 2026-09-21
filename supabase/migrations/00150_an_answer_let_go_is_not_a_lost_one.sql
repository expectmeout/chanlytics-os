-- 00150 · An answer pg_net has let go of is not one it never recorded.
--
-- pg_net keeps an answer six hours (pg_net.ttl) and then deletes it with
-- everything as old. Two clocks record their looks: with nothing to do, the
-- ledger's heartbeat (00098) and the lead finder's clock (00140) move
-- requested_at and leave request_id at their last real ask, so that a failed
-- answer stays in view. sweep_health() (00107) judges an ask while
-- requested_at is under an hour old, which a look keeps true for as long as
-- the clock runs, and its branch for "no row, older than two minutes, newer
-- answers held" could not tell a deleted answer from a lost one. So once the
-- lead finder had been idle six hours, every health run (at :13 and :43,
-- three minutes after the looks at :10 and :40) would find leads unhealthy
-- and quote the look's time: a mail to the platform, again every six hours
-- by suppression, and /api/health answering 503 for about three minutes in
-- five, until a search asked the edge again. The heartbeat is never caught:
-- its look is seconds old, never two minutes.
--
-- The rule now: a missing answer is evidence only when pg_net still holds
-- answers from both sides of it. Nothing newer held is a table a crash
-- emptied (00026's guard); nothing older held means any answer the ask had
-- went with the rest, and was judged while it was held. A clock that records
-- no look is judged only in the hour after it asks, while pg_net holds six
-- hours of every clock's answers, so its verdict does not change.
--
-- sweep_health() exactly as 00107 left it, with older_response_seen added.
-- Signature, grants and comment are unchanged.

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
           -- pg_net deletes an answer six hours after recording it, with
           -- everything as old, and a clock that records its looks keeps its
           -- last real ask judged for longer than that. If pg_net holds
           -- nothing OLDER than our request, any answer it had went with the
           -- rest and was judged while it was held, and we say nothing.
           exists (select 1 from net._http_response nr where nr.id < e.request_id)
                                                  as older_response_seen,
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
         case when j.judged_by = 'run' then j.last_ok else j.requested_at end,
         j.status_code,
         j.job_exists and j.job_active,
         j.alerted_at
    from judged j
   order by j.sweep;
$$;

revoke execute on function public.sweep_health() from public, anon, authenticated;

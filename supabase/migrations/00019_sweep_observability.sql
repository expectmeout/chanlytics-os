-- Is the sweep actually running?
--
-- 00018 wired pg_cron -> pg_net -> the edge, and made that chain unobservable
-- from the database side: net.http_post returns a request id and the response
-- lands in net._http_response, which nothing exposes. So a sweep that started
-- 401ing — a rotated secret, a moved URL, a deploy that broke the route —
-- would fail silently every ten minutes forever, which is precisely the class
-- of defect the watchdog exists to catch. A watchdog nobody watches is not one.
--
-- These are read-only and service-role-only. They answer the two questions an
-- operator actually asks: did the last sweep succeed, and is the schedule
-- still there.

/**
 * The most recent sweep attempts and what the edge said. `status_code` null
 * means the request never got a response (timeout, DNS, the edge down).
 */
create or replace function public.sweep_recent_responses(p_limit integer default 10)
returns table (
  request_id  bigint,
  status_code integer,
  body        text,
  created_at  timestamptz
)
language sql
security definer
set search_path = public, net
as $$
  select r.id, r.status_code, left(r.content, 500), r.created
    from net._http_response r
   order by r.created desc
   limit greatest(1, least(p_limit, 100));
$$;

revoke execute on function public.sweep_recent_responses(integer) from public, anon, authenticated;

/** The cron schedules this project relies on, and when each last ran. */
create or replace function public.sweep_schedules()
returns table (
  jobname     text,
  schedule    text,
  active      boolean,
  last_run    timestamptz,
  last_status text
)
language sql
security definer
set search_path = public, cron
as $$
  select j.jobname, j.schedule, j.active,
         d.start_time, d.status
    from cron.job j
    left join lateral (
      select start_time, status
        from cron.job_run_details d
       where d.jobid = j.jobid
       order by start_time desc
       limit 1
    ) d on true
   order by j.jobname;
$$;

revoke execute on function public.sweep_schedules() from public, anon, authenticated;

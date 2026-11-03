-- 00509 · A tab says what it could not hear.
--
-- The page-open PRD of 3 November 2026, lane L7. A read that failed in someone's browser, or a live feed that dropped, was
-- said on that tab's status line and in its console and nowhere the platform reads: a customer's feed could be down for a
-- day and Health would show nothing. Each tab now counts them and sends them beside its page speed (POST vitals): how long
-- its feed was down (FEED_DOWN, ms), how many times it came back (FEED_BACK) and each surface's reads that failed
-- (READ_FAILED, the surface its part). page_vitals keeps them as it keeps the page's times; page_freshness says them.
--
-- Either deploy order works: a dashboard that does not send them sends nothing new, and a report of a metric this check
-- refuses is kept by nobody and refused to nobody (keepPageVitals logs it). Re-runnable.

set local lock_timeout = '3s';

-- The metric's set grows by the tab's three.
alter table public.page_vitals drop constraint if exists page_vitals_metric_check;
alter table public.page_vitals add constraint page_vitals_metric_check
  check (metric in ('LCP', 'INP', 'CLS', 'FCP', 'TTFB', 'READY', 'SETTLED', 'FEED_DOWN', 'FEED_BACK', 'READ_FAILED'));

create or replace function public.page_freshness(p_days integer default 7)
returns table (metric text, page text, part text, reports bigint, total double precision)
language sql
stable
security definer
set search_path = ''
as $$
  select v.metric, v.page, v.part, count(*), sum(v.value)
    from public.page_vitals v
   where v.metric in ('FEED_DOWN', 'FEED_BACK', 'READ_FAILED')
     and v.at >= now() - make_interval(days => greatest(1, least(p_days, 30)))
   group by v.metric, v.page, v.part
   order by v.metric, sum(v.value) desc;
$$;

comment on function public.page_freshness(integer) is
  'What tabs could not hear or read over the last p_days (00509; the page-open PRD, L7): for each metric (FEED_DOWN ms, FEED_BACK, READ_FAILED by surface), page and part, how many reports and their total. Counts and durations only. The service role''s.';

revoke execute on function public.page_freshness(integer) from public, anon, authenticated;
grant execute on function public.page_freshness(integer) to service_role;

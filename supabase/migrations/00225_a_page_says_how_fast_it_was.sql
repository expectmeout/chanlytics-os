-- 00225 · A page says how fast it was.
--
-- Field data (plan 2026-09-27, Performance): how fast the pages people use are,
-- from their own browsers, so the bundle's budget is judged against what people
-- see. The shell reports five numbers for each page load (LCP, INP, CLS, FCP,
-- TTFB) to POST /api/v1/vitals, which keeps them here under the id the browser
-- gave each one: INP and CLS grow while a page is open and are reported again,
-- and the later report replaces the earlier. A row holds the name of the page the
-- load landed on, the metric and its value: no person and no workspace. Service
-- role only: the route writes on the server, and the back office reads the 75th
-- percentile through page_vitals_p75().
--
-- The read is bounded by the reports it takes, not by the platform's traffic:
-- the latest 25,000 of the last seven days (contracts' PAGE_VITALS_READ). A row
-- is kept thirty days (contracts' RETENTION_DAYS.page_vitals), purged nightly by
-- a clock registered like every other.

create table if not exists public.page_vitals (
  id     text             primary key check (id ~ '^[A-Za-z0-9-]{1,64}$'),
  at     timestamptz      not null default now(),
  page   text             not null check (page ~ '^[a-z][a-z0-9-]{0,31}$'),
  metric text             not null check (metric in ('LCP', 'INP', 'CLS', 'FCP', 'TTFB')),
  value  double precision not null check (value >= 0 and value <= 600000)
);
create index if not exists page_vitals_at on public.page_vitals (at);
alter table public.page_vitals enable row level security;
revoke all on public.page_vitals from anon, authenticated;
comment on table public.page_vitals is
  'Field data (00225): one row per metric per page load, under the browser''s own id; the landing page, the metric (LCP, INP, CLS, FCP, TTFB) and its value, in ms but for CLS. No person, no workspace. Kept thirty days.';

-- The route's door. A report of an id already kept replaces its value: the
-- later report of a growing INP or CLS is the truer one. An id twice in one
-- call keeps one of them, rather than failing the call.
create or replace function public.note_page_vitals(p_page text, p_vitals jsonb)
returns integer
language sql
set search_path = public
as $$
  with kept as (
    insert into public.page_vitals (id, page, metric, value)
    select distinct on (v.id) v.id, p_page, v.name, v.value
      from jsonb_to_recordset(p_vitals) as v(id text, name text, value double precision)
    on conflict (id) do update set value = excluded.value
    returning 1
  )
  select count(*)::integer from kept
$$;
revoke all on function public.note_page_vitals(text, jsonb) from public, anon, authenticated;
grant execute on function public.note_page_vitals(text, jsonb) to service_role;
comment on function public.note_page_vitals(text, jsonb) is
  'Keeps one page load''s reports ([{id, name, value}]) under the page it landed on; a known id takes the new value. Answers how many it kept. Service role: POST /api/v1/vitals.';

-- The back office's read: the 75th percentile of each metric over every page
-- (page null), then over each page, from the latest reports of the last days.
create or replace function public.page_vitals_p75(p_days integer default 7, p_most integer default 25000)
returns table (metric text, page text, samples integer, p75 double precision, since timestamptz)
language sql
stable
set search_path = public
as $$
  with recent as (
    select v.page, v.metric, v.value, v.at
      from public.page_vitals v
     where v.at > now() - make_interval(days => p_days)
     order by v.at desc
     limit p_most
  )
  select r.metric, r.page, count(*)::integer, percentile_cont(0.75) within group (order by r.value), min(r.at)
    from recent r
   group by grouping sets ((r.metric), (r.metric, r.page))
   order by r.metric, r.page nulls first
$$;
revoke all on function public.page_vitals_p75(integer, integer) from public, anon, authenticated;
grant execute on function public.page_vitals_p75(integer, integer) to service_role;
comment on function public.page_vitals_p75(integer, integer) is
  'The 75th percentile of each metric over the latest p_most reports of the last p_days: one row per metric with page null (every page), then one per metric and page. Service role: the back office.';

select cron.unschedule('purge-page-vitals') where exists (select 1 from cron.job where jobname = 'purge-page-vitals');
select cron.schedule('purge-page-vitals', '29 4 * * *', $$delete from public.page_vitals where at < now() - interval '30 days'$$);

-- Judged on its runs, like the other purges (00107).
insert into public.sweep_status (sweep, jobname, max_silence, judged_by, requested_at) values
  ('purge_page_vitals', 'purge-page-vitals', interval '26 hours', 'run', null)
on conflict (sweep) do update
   set jobname = excluded.jobname, max_silence = excluded.max_silence, judged_by = excluded.judged_by;

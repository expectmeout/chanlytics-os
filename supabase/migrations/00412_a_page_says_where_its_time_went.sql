-- 00412 · A page says where its time went.
--
-- Decision 0053. 00255 kept the browser's five numbers for each page load, named for the page the load landed on. They
-- said how fast a document was, and nothing of what a person waits for inside the app: a move from Today to the
-- Calendar is no page load, and a paint of "Reading…" is a contentful paint. A row may now also be the shell's own
-- measure of a page, or of a part of one, drawn with its rows (READY), or of everything the page draws read (SETTLED),
-- and the browser's five for a move it counts as a navigation (Chromium's soft navigations). Each row says:
--
--   part       the part of the page (`queue`, `table`), or none for the page itself
--   came_from  the page a move left; none for a load; the page itself for a move inside it (a thread opened)
--   warm       whether what it drew was already held when it began (the tab's cache, a view held)
--   device     desk or phone (the kit's one phone width)
--   build      the deploy it ran, so a change is read before and after
--   detail     what the time went on: the read it waited for and how much of that the server said was its own, a script
--              chunk, the element by its test id, a phase. Never a person, a workspace or anything a person wrote: the
--              route checks every key before a row is kept.
--
-- note_page_vitals takes them, and the old call still works: a shell from before this sends the page and its five
-- alone. page_vitals_p75, the first card's read, reads page loads alone (came_from is null and no part), as it always
-- meant to. page_speed and page_spots are the new card's reads, bounded as the first is. Retention is unchanged.
-- Re-runnable: each column and constraint added only where absent, each function replaced.

alter table public.page_vitals
  add column if not exists part text,
  add column if not exists came_from text,
  add column if not exists warm boolean,
  add column if not exists device text,
  add column if not exists build text,
  add column if not exists detail jsonb;

-- The metric's set grows by the shell's two. 00255 wrote the check inline, so it carries its column's name.
alter table public.page_vitals drop constraint if exists page_vitals_metric_check;
alter table public.page_vitals add constraint page_vitals_metric_check
  check (metric in ('LCP', 'INP', 'CLS', 'FCP', 'TTFB', 'READY', 'SETTLED'));
alter table public.page_vitals drop constraint if exists page_vitals_part_check;
alter table public.page_vitals add constraint page_vitals_part_check check (part ~ '^[a-z][a-z0-9-]{0,31}$');
alter table public.page_vitals drop constraint if exists page_vitals_came_from_check;
alter table public.page_vitals add constraint page_vitals_came_from_check check (came_from ~ '^[a-z][a-z0-9-]{0,31}$');
alter table public.page_vitals drop constraint if exists page_vitals_device_check;
alter table public.page_vitals add constraint page_vitals_device_check check (device in ('desk', 'phone'));
alter table public.page_vitals drop constraint if exists page_vitals_build_check;
alter table public.page_vitals add constraint page_vitals_build_check check (build ~ '^[0-9a-z]{3,40}$');
alter table public.page_vitals drop constraint if exists page_vitals_detail_check;
alter table public.page_vitals add constraint page_vitals_detail_check
  check (jsonb_typeof(detail) = 'object' and pg_column_size(detail) <= 2048);

comment on table public.page_vitals is
  'Field data (00255, 00412): one row per metric per page load or move, under its own id; the page it is of, a part of it, the page a move left, whether it drew held rows, the device, the build, and what the time went on. The metrics are the browser''s five (LCP, INP, CLS, FCP, TTFB) and the shell''s two (READY, SETTLED), in ms but for CLS. No person, no workspace. Kept thirty days.';
comment on column public.page_vitals.part is 'The part of the page a READY is of (`queue`, `table`); null for the page itself (00412).';
comment on column public.page_vitals.came_from is 'The page a move left; null for a page load; the page itself for a move inside it (00412).';
comment on column public.page_vitals.warm is 'Whether what it drew was already held when it began: the tab''s cache, a view held (00412).';
comment on column public.page_vitals.device is 'desk, or phone at the kit''s one phone width and under (00412).';
comment on column public.page_vitals.build is 'The deploy the page ran: its sha''s first twelve, or dev (00412).';
comment on column public.page_vitals.detail is 'What the time went on: a read''s route and its server and database time, a chunk, an element''s test id, a phase. Never a person or anything they wrote (00412).';

-- The route's door, with the device and the build of the load beside each report. A report that names its page (a
-- move's) keeps it; one that names none is of the page the load landed on. A known id takes the new value and what it
-- went on: a grown INP is a different interaction. Called with two arguments, as before 00412, it keeps what it did.
drop function if exists public.note_page_vitals(text, jsonb);
create or replace function public.note_page_vitals(
  p_page text,
  p_vitals jsonb,
  p_device text default null,
  p_build text default null
)
returns integer
language sql
set search_path = public
as $$
  with kept as (
    insert into public.page_vitals (id, page, metric, value, part, came_from, warm, device, build, detail)
    select distinct on (v.id)
           v.id, coalesce(v.page, p_page), v.name, v.value, v.part, v."from", v.warm, p_device, p_build, v.detail
      from jsonb_to_recordset(p_vitals)
           as v(id text, name text, value double precision, page text, part text, "from" text, warm boolean, detail jsonb)
    on conflict (id) do update set value = excluded.value, detail = excluded.detail
    returning 1
  )
  select count(*)::integer from kept
$$;
revoke all on function public.note_page_vitals(text, jsonb, text, text) from public, anon, authenticated;
grant execute on function public.note_page_vitals(text, jsonb, text, text) to service_role;
comment on function public.note_page_vitals(text, jsonb, text, text) is
  'Keeps one page load''s reports ([{id, name, value, page?, part?, from?, warm?, detail?}]) with the device and the build; a report naming no page is of p_page; a known id takes the new value and detail. Answers how many it kept. Service role: POST /api/v1/vitals.';

-- The first card's read, unchanged in shape: page loads alone, and the browser's five.
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
       and v.came_from is null
       and v.part is null
       and v.metric in ('LCP', 'INP', 'CLS', 'FCP', 'TTFB')
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

-- Where the time goes: each metric's 75th percentile over every page and over each page, its part ('' for the page
-- itself) and how it was reached (a load, a move, a move inside it; 'all'), then by device and by whether it drew held
-- rows ('all' where a row is over both), with the read the page waited on most often.
create or replace function public.page_speed(p_days integer default 7, p_most integer default 50000)
returns table (
  metric text,
  page text,
  part text,
  how text,
  device text,
  warm text,
  samples integer,
  p75 double precision,
  waits_on text,
  since timestamptz
)
language sql
stable
set search_path = public
as $$
  with recent as (
    select v.metric,
           v.page,
           coalesce(v.part, '') as part,
           case when v.came_from is null then 'load' when v.came_from = v.page then 'within' else 'move' end as how,
           coalesce(v.device, 'unknown') as device,
           case when v.warm then 'held' when not v.warm then 'read' else 'unknown' end as warm,
           v.value,
           v.detail ->> 'wait' as wait,
           v.at
      from public.page_vitals v
     where v.at > now() - make_interval(days => p_days)
       and v.metric in ('READY', 'SETTLED', 'LCP', 'INP', 'CLS')
     order by v.at desc
     limit p_most
  )
  select r.metric,
         case when grouping(r.page) = 1 then null else r.page end,
         r.part,
         case when grouping(r.how) = 1 then 'all' else r.how end,
         case when grouping(r.device) = 1 then 'all' else r.device end,
         case when grouping(r.warm) = 1 then 'all' else r.warm end,
         count(*)::integer,
         percentile_cont(0.75) within group (order by r.value),
         mode() within group (order by r.wait),
         min(r.at)
    from recent r
   group by grouping sets (
     (r.metric, r.part, r.how),
     (r.metric, r.page, r.part),
     (r.metric, r.page, r.part, r.how),
     (r.metric, r.page, r.part, r.how, r.device),
     (r.metric, r.page, r.part, r.how, r.warm)
   )
   order by 1, 2 nulls first, 3, 4, 5, 6
$$;
revoke all on function public.page_speed(integer, integer) from public, anon, authenticated;
grant execute on function public.page_speed(integer, integer) to service_role;
comment on function public.page_speed(integer, integer) is
  'Where the pages'' time goes (00412): READY, SETTLED and the browser''s LCP, INP, CLS at the 75th percentile, over every page (page null) and each page, by part ('''' the page itself), how it was reached (load, move, within, all), device and held rows (all where over both), with the read waited on most. The latest p_most rows of the last p_days. Service role: the back office.';

-- The elements that cost the most: each of the browser's three that names one (detail.el, a test id), by page and
-- element, with the phase its time went on most.
create or replace function public.page_spots(p_days integer default 7, p_most integer default 50000)
returns table (metric text, page text, el text, samples integer, p75 double precision, phase text)
language sql
stable
set search_path = public
as $$
  with recent as (
    select v.metric, v.page, v.detail ->> 'el' as el, v.detail ->> 'phase' as phase, v.value
      from public.page_vitals v
     where v.at > now() - make_interval(days => p_days)
       and v.metric in ('INP', 'LCP', 'CLS')
       and v.detail ? 'el'
     order by v.at desc
     limit p_most
  )
  select r.metric,
         r.page,
         r.el,
         count(*)::integer,
         percentile_cont(0.75) within group (order by r.value),
         mode() within group (order by r.phase)
    from recent r
   group by r.metric, r.page, r.el
   order by r.metric, r.page, r.el
$$;
revoke all on function public.page_spots(integer, integer) from public, anon, authenticated;
grant execute on function public.page_spots(integer, integer) to service_role;
comment on function public.page_spots(integer, integer) is
  'The elements that cost the most (00412): INP, LCP and CLS at the 75th percentile by page and element (detail.el, a test id), with the phase their time went on most. The latest p_most rows of the last p_days. Service role: the back office.';

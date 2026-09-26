-- 00193 · The sweeps read only what is due.
--
-- The playbooks sweep read a page of RUNNING playbooks, least-recently-run first (00089), and judged which were due
-- afterwards, on the edge, by each workspace's own clock. So the page held playbooks that had run today and ones
-- hours from their hour; a due one behind twenty-five of those waited a tick, or a day (twenty-five playbooks made
-- this morning for the evening, never run, sort first under NULLS FIRST until they have run); and `remaining`, what
-- the sweep says it could not reach, counted every running playbook past the page, due or not. Past twenty-five
-- running playbooks that count never reached zero, and from the third tick note_sweep_backlog (00089) called the
-- sweep broken: a red sweep_health and a page to the platform every hour, with any real failure hidden behind it.
-- Reach out (Part 3) added a second page on the same tick, the reach-out steps, counted the same way. The calendar
-- sweep's page took a row whose `calendar` had no address as a feed due, first and for ever, since nothing ever
-- stamps such a row read.
--
-- Now the database judges due-ness and each page is only what is due. A playbook is due as runDueNow (packages/
-- contracts, playbook-schedule.ts) has it: running, at or past its hour by its workspace's clock (tenants.timezone,
-- 00084), not past the last hour a message may go out, and not yet run for that clock's day. The hour ceiling is the
-- caller's (PLAYBOOK_HOURS.max), so the number lives in one place. Every row carries the count of all that were due,
-- so what is left beyond the page is exact and counts nothing that was not due. Service role only; the edge's sweeps
-- ask through packages/db (repositories/sweeps.ts). Each takes one workspace to keep to (p_tenant_id, a test's) or
-- every workspace (null, as the sweeps ask).

set local lock_timeout = '3s';

-- The running playbooks of one kind due at `p_at`: never run first, then the least recently run, `p_limit` of them,
-- each with the zone it was judged in and `due_total`, the count of all that were due -- the caller's "left behind" is
-- `due_total` less the rows it was given. A workspace with no zone is judged on the default the product has kept
-- since 00001, as the edge judges it.
create or replace function public.playbooks_due(p_kind text, p_at timestamptz, p_last_hour int, p_limit int, p_tenant_id uuid default null)
returns table (playbook jsonb, timezone text, due_total bigint)
language sql
stable
security definer
set search_path = public
as $$
  select to_jsonb(p), z.tz, count(*) over ()
    from public.playbooks p
    join public.tenants t on t.id = p.tenant_id
    cross join lateral (select coalesce(nullif(btrim(t.timezone), ''), 'America/New_York') as tz) z
    cross join lateral (select p_at at time zone z.tz as clock) l
   where p.state = 'running' and p.kind = p_kind
     and (p_tenant_id is null or p.tenant_id = p_tenant_id)
     and extract(hour from l.clock) between p.run_hour and p_last_hour
     and p.last_run_for is distinct from l.clock::date
   order by p.last_run_at nulls first, p.created_at, p.id
   limit greatest(coalesce(p_limit, 0), 0)
$$;
revoke execute on function public.playbooks_due(text, timestamptz, int, int, uuid) from public, anon, authenticated;
grant execute on function public.playbooks_due(text, timestamptz, int, int, uuid) to service_role;
comment on function public.playbooks_due(text, timestamptz, int, int, uuid) is
  'The running playbooks of one kind due at p_at by their workspace''s own clock (runDueNow''s rule), never run first, then least recently run, with due_total the count of all that were due. The playbooks sweep''s two pages (00193).';

-- The workspaces whose calendar is due before `p_before` -- a feed's address on the row, and never read or last read
-- before then -- never read first, then the least recently read, `p_limit` of them, each with `due_total`. A row
-- whose `calendar` has no address is not a feed: nothing ever stamps it read, so it holds no place in the page.
create or replace function public.calendars_due(p_before timestamptz, p_limit int, p_tenant_id uuid default null)
returns table (tenant_id uuid, config jsonb, due_total bigint)
language sql
stable
security definer
set search_path = public
as $$
  select c.tenant_id, c.config, count(*) over ()
    from public.tenant_config c
   where nullif(btrim(c.config->'calendar'->>'ical_url'), '') is not null
     and (p_tenant_id is null or c.tenant_id = p_tenant_id)
     and (c.calendar_checked_at is null or c.calendar_checked_at < p_before)
   order by c.calendar_checked_at nulls first, c.tenant_id
   limit greatest(coalesce(p_limit, 0), 0)
$$;
revoke execute on function public.calendars_due(timestamptz, int, uuid) from public, anon, authenticated;
grant execute on function public.calendars_due(timestamptz, int, uuid) to service_role;
comment on function public.calendars_due(timestamptz, int, uuid) is
  'The workspaces with a calendar feed never read or last read before p_before, never read first, then least recently read, with due_total the count of all that were due. The calendar sweep''s page (00193).';

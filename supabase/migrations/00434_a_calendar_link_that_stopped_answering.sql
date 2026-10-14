-- 00434 · A calendar link that stopped answering is a fact with a time, and its owner is told.
--
-- The wiring's second audit, lane R11 (S11-4, step 3). When a workspace's calendar link stopped answering, the
-- receptionist quietly stopped saying which times are open and new visits stopped reaching the Calendar, and nobody was
-- told: the hourly sweep stamped an unreadable link as read (calendar_checked_at, so it goes behind the links that
-- answer), counted it in a log line, and kept nothing that said since when.
--
--   tenant_config.calendar_failed_since   new, service role only: when the sweep's reads of the link began failing, kept
--                                         through every failure after it and cleared by the first read that works. The
--                                         sweep tells the owner once it is a day old (contracts
--                                         CALENDAR_UNREADABLE_TOLD_AFTER_MS), once per breakage, and the read that works
--                                         closes the notice. A stamp column like calendar_checked_at: no member's UPDATE
--                                         grant names it (00089), and the settings watcher and the versions move on a
--                                         version alone (00408), so its writes wake nothing.
--   calendars_due                         the page also answers each workspace's failed_since, so the sweep writes the
--                                         stamp only on the change and decides the notice without a read of its own.
--                                         Its return gains a column, so it is dropped and made again; grants and comment
--                                         as before.
--
-- Either deploy order: an edge from before this reads the page's four columns and writes no stamp. An edge from after
-- it, on a database from before, finds no failed_since on the page and writes none, so nothing it writes names a column
-- the database lacks. Re-runnable.

alter table public.tenant_config add column if not exists calendar_failed_since timestamptz;
comment on column public.tenant_config.calendar_failed_since is
  'When the hourly sweep''s reads of this workspace''s calendar link began failing, kept through every failure after it and cleared by the first read that works (00434). The sweep tells the owner once it is a day old, and the read that works closes the notice. The service role''s, like calendar_checked_at (00089: no member''s UPDATE grant names it).';

drop function if exists public.calendars_due(timestamptz, int, uuid);
create or replace function public.calendars_due(p_before timestamptz, p_limit int, p_tenant_id uuid default null)
returns table (tenant_id uuid, config jsonb, timezone text, due_total bigint, failed_since timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select c.tenant_id, c.config, z.tz, count(*) over (), c.calendar_failed_since
    from public.tenant_config c
    join public.tenants t on t.id = c.tenant_id
    cross join lateral (select public.safe_zone(coalesce(nullif(btrim(t.timezone), ''), 'America/New_York')) as tz) z
   where nullif(btrim(c.config->'calendar'->>'ical_url'), '') is not null
     and (p_tenant_id is null or c.tenant_id = p_tenant_id)
     and (c.calendar_checked_at is null or c.calendar_checked_at < p_before)
   order by c.calendar_checked_at nulls first, c.tenant_id
   limit greatest(coalesce(p_limit, 0), 0)
$$;
revoke execute on function public.calendars_due(timestamptz, int, uuid) from public, anon, authenticated;
grant execute on function public.calendars_due(timestamptz, int, uuid) to service_role;
comment on function public.calendars_due(timestamptz, int, uuid) is
  'The workspaces with a calendar feed never read or last read before p_before, never read first, then least recently read, each with its zone and since when its reads have failed (null while they work, 00434), with due_total the count of all that were due. The calendar sweep''s page (00245).';

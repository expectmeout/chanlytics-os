-- 00089 · Sweeps that reach every tenant, and say when they cannot.
--
-- Two hourly sweeps read EVERY row and then do serial network work inside a
-- sixty-second function:
--
--   cron/calendar.ts   selects all of tenant_config, then per workspace with an
--                      iCal URL fetches the feed over HTTP and writes people
--   cron/playbooks.ts  groups every running playbook by tenant and iterates.
--                      It SENDS.
--
-- At four tenants that is instant. At four hundred it exceeds the timeout part
-- way through -- and because the order never changes, the same early tenants are
-- served every hour and the ones past the cut-off are NEVER served at all. No
-- error, no alert: the sweep returns 200 having done a fraction of its job, and
-- the workspaces at the end of the list have a receptionist offering times that
-- were taken last week.
--
-- The fix already exists three files away. google_listings has `checked_at`,
-- and its sweep takes "never checked first, then the least recently checked,
-- capped" -- so every listing is reached and none starves. This gives
-- tenant_config the same column, and gives both sweeps somewhere to record that
-- they ran out of tick before they ran out of work.

-- 1. When this workspace's calendar was last read. Null means never, and never
--    goes first: a workspace that has just pasted a feed should not wait behind
--    four hundred that were read an hour ago.
alter table public.tenant_config
  add column if not exists calendar_checked_at timestamptz;

comment on column public.tenant_config.calendar_checked_at is
  'When the calendar sweep last read this workspace''s feed. Null = never, and never is served first. Ordering on this is what stops the sweep serving the same early tenants every hour once there are more workspaces than fit in one tick.';

-- The sweep's own query: still waiting, oldest first. Partial, because rows
-- without a feed are the majority and are never the answer.
create index if not exists tenant_config_calendar_due_idx
  on public.tenant_config (calendar_checked_at nulls first)
  where config ? 'calendar';

-- The edge writes it through the service role, and tenant_config's UPDATE grant
-- has been narrowed twice (00037, 00085) -- so a new column needs its own door
-- or the write succeeds and changes nothing. Read the grants rather than
-- assuming them.
do $$
declare
  cols text;
begin
  select string_agg(quote_ident(column_name), ', ' order by column_name)
    into cols
    from information_schema.column_privileges
   where table_schema = 'public'
     and table_name = 'tenant_config'
     and grantee = 'authenticated'
     and privilege_type = 'UPDATE';
  if cols is null then
    raise notice '00089: tenant_config has no column-scoped UPDATE grant; nothing to widen';
  else
    -- Deliberately NOT granted to authenticated: this is a sweep's bookkeeping,
    -- not a member's field. The note records that the narrowing was considered.
    raise notice '00089: calendar_checked_at is service-role only (authenticated has: %)', cols;
  end if;
end $$;

-- 2. How many consecutive ticks a sweep has ended with work left over.
--
-- One tick with a backlog is ordinary: the cap did its job and the rest go next
-- hour. Three in a row is a different fact -- the queue is growing faster than
-- the sweep drains it -- and that is a capacity signal that has to reach a
-- person before a customer notices stale availability.
alter table public.sweep_status
  add column if not exists backlog_ticks integer not null default 0;

comment on column public.sweep_status.backlog_ticks is
  'Consecutive ticks this sweep finished with work still queued. Reset to 0 the moment it drains. At 3 the sweep answers 503, which turns it red in sweep_health and mails the platform.';

-- The counter, moved atomically: a sweep that read-modify-wrote it would race
-- itself on an overlapping tick and undercount exactly when it mattered.
create or replace function public.note_sweep_backlog(p_sweep text, p_remaining integer)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ticks integer;
begin
  update public.sweep_status
     set backlog_ticks = case when p_remaining > 0 then backlog_ticks + 1 else 0 end
   where sweep = p_sweep
  returning backlog_ticks into v_ticks;
  -- No row means the sweep is not registered with sweep_health, which is a
  -- deployment mistake rather than a backlog. Say zero: never alert on the
  -- absence of bookkeeping.
  return coalesce(v_ticks, 0);
end $$;

revoke execute on function public.note_sweep_backlog(text, integer) from public, anon, authenticated;

comment on function public.note_sweep_backlog(text, integer) is
  'Records whether a sweep finished with work left, and returns how many ticks in a row that has now been true. Atomic, because an overlapping tick reading and writing this separately would undercount precisely when the backlog is real.';

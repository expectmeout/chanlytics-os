-- 00402 · A settings change keeps what the settings said.
--
-- Decision 0039, step 3 (9 October 2026). A reply names the version of the settings its prompt was composed from
-- (messages.meta.config_version), and the number opened nothing: tenant_config holds one row a workspace, and a save
-- overwrites it. The number was not the database's either. Each writer moved it by hand, and one that did not (the
-- nightly's seed) left two different settings under one number. A save does say which fields moved and who moved them
-- (the settings.changed event, written after the save by two of its three callers), and never what they said.
--
--   tenant_config_versions       the settings as they stood at each version: the whole config, when it came into
--                                force, who brought it, and when the next replaced it.
--   tenant_config_version_moves  before a change: the version is the database's. A config that changed takes the next
--                                number whatever the writer sent, and a number never goes back, so a version names one
--                                config.
--   tenant_config_version_keep   after it: the row for the new version, in the save's own transaction, so every
--                                writer is held to it; the version before is marked replaced.
--   purge_config_versions        nightly, on its registered clock: a version replaced more than 400 days ago
--                                (contracts RETENTION_DAYS.tenant_config_versions; Ruben, 9 October 2026). The version
--                                in force is never taken.
--
-- Old settings can hold a calendar link, the addresses alerts go to and an owner's notes, so no session reads this
-- table: row security is on with no policy, as on model_turns (00401). The first reader is the operator's
-- (tooling/scripts/ops/turn-read.mjs says the settings a reply was written under). An owner's own view of what changed,
-- or a way back to it, is a page's decision and brings its own policy.
--
-- Who brought a version is the session's own user where there is one (a member's save), else the writer's updated_by
-- where this write set it, else nobody: a sweep or a script has no person, and a stale name is worse than none.
--
-- The two triggers take tenant_config for the instant they are made; the lock guard is 00140's. Either deploy order: no
-- code reads the table, and every writer's own version already moves the way the database now holds it to.
-- Re-runnable: the table and index if not exists, the functions replaced, the triggers dropped and made, the backfill
-- on conflict do nothing, the job unscheduled and made again, the clock's row upserted.
set local lock_timeout = '3s';
do $$
begin
  raise notice 'lock_timeout for this migration: %', current_setting('lock_timeout');
  if current_setting('lock_timeout') <> '3s' then
    raise warning 'this file was applied outside a transaction, so SET LOCAL did nothing: run it inside begin/commit, or set lock_timeout yourself before it';
  end if;
end $$;

/* ------------------------------------------------------------- 1. the record -- */

create table if not exists public.tenant_config_versions (
  tenant_id   uuid not null references public.tenants (id) on delete cascade,
  version     integer not null check (version >= 1),
  config      jsonb not null,
  changed_at  timestamptz not null default now(),
  changed_by  uuid references auth.users (id) on delete set null,
  -- When the next version replaced it; null while it is the one in force.
  replaced_at timestamptz,
  primary key (tenant_id, version)
);

create index if not exists tenant_config_versions_replaced on public.tenant_config_versions (replaced_at)
  where replaced_at is not null;

alter table public.tenant_config_versions enable row level security;
revoke all on public.tenant_config_versions from anon, authenticated;
grant all on public.tenant_config_versions to service_role;
comment on table public.tenant_config_versions is
  'A workspace''s settings as they stood at each version (decision 0039, step 3): what a reply''s meta.config_version opens. Written by the trigger on tenant_config alone, in the save''s own transaction; no session reads it. A version is kept while it is in force and RETENTION_DAYS.tenant_config_versions after it is replaced (purge_config_versions).';

/* ------------------------------------------------- 2. the version is the row's -- */

create or replace function public.tenant_config_version_moves()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.config is distinct from old.config and new.version <= old.version then
    -- A writer that changed the settings and did not move the number, or moved it back.
    new.version := old.version + 1;
  elsif new.version < old.version then
    new.version := old.version;
  end if;
  return new;
end $$;
comment on function public.tenant_config_version_moves() is
  'Before a change to a workspace''s settings: a config that changed takes the next version whatever the writer sent, and a version never goes back, so a version names one config (decision 0039, step 3).';

drop trigger if exists tenant_config_version_moves on public.tenant_config;
create trigger tenant_config_version_moves
  before update of config, version on public.tenant_config
  for each row execute function public.tenant_config_version_moves();

/* ----------------------------------------------------- 3. each version is kept -- */

create or replace function public.tenant_config_version_keep()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_by uuid;
begin
  -- The session's own user where there is one; else the writer's updated_by where this write set it; else nobody.
  v_by := coalesce(
    auth.uid(),
    case when tg_op = 'INSERT' or new.updated_by is distinct from old.updated_by then new.updated_by end
  );
  update public.tenant_config_versions
     set replaced_at = now()
   where tenant_id = new.tenant_id and replaced_at is null and version <> new.version;
  insert into public.tenant_config_versions (tenant_id, version, config, changed_by)
  values (new.tenant_id, new.version, new.config, v_by)
  on conflict (tenant_id, version) do update
     set config = excluded.config, changed_at = now(), changed_by = excluded.changed_by, replaced_at = null;
  return new;
end $$;
revoke all on function public.tenant_config_version_keep() from public, anon, authenticated;
comment on function public.tenant_config_version_keep() is
  'After a workspace''s settings take a new version: the settings as they now stand kept under it, who brought them, and the version before marked replaced, in the save''s own transaction (decision 0039, step 3).';

-- A workspace's first row (provision_tenant), and every change of version after it. The hourly stamp on
-- calendar_checked_at moves no version and calls nothing.
drop trigger if exists tenant_config_version_kept_first on public.tenant_config;
create trigger tenant_config_version_kept_first
  after insert on public.tenant_config
  for each row execute function public.tenant_config_version_keep();

drop trigger if exists tenant_config_version_kept on public.tenant_config;
create trigger tenant_config_version_kept
  after update on public.tenant_config
  for each row when (new.version is distinct from old.version)
  execute function public.tenant_config_version_keep();

-- Where every workspace stands today is its first kept version: one row a workspace. It came into force at the last
-- save its events still hold (settings.changed); else at updated_at, which the hourly calendar stamp also moves, so
-- for a workspace with a feed that is a moment the version was certainly in force, not when it began.
insert into public.tenant_config_versions (tenant_id, version, config, changed_at, changed_by)
select c.tenant_id, c.version, c.config,
       coalesce(
         (select max(e.created_at) from public.events e
           where e.tenant_id = c.tenant_id and e.kind = 'settings.changed'),
         c.updated_at
       ),
       c.updated_by
  from public.tenant_config c
on conflict (tenant_id, version) do nothing;

/* -------------------------------------------------------------- 4. the clock -- */

create or replace function public.purge_config_versions(p_keep interval default '400 days')
returns integer
language plpgsql
security definer
set search_path = public
set lock_timeout = '3s'
as $$
declare v_count integer;
begin
  delete from public.tenant_config_versions where replaced_at is not null and replaced_at < now() - p_keep;
  get diagnostics v_count = row_count;
  return v_count;
end $$;
revoke all on function public.purge_config_versions(interval) from public, anon, authenticated;
grant execute on function public.purge_config_versions(interval) to service_role;
comment on function public.purge_config_versions(interval) is
  'Nightly. Deletes a workspace''s old settings 400 days after they were replaced (contracts RETENTION_DAYS.tenant_config_versions; decision 0039, step 3); the version in force is never taken. Answers how many.';

select cron.unschedule('purge-config-versions') where exists (select 1 from cron.job where jobname = 'purge-config-versions');
select cron.schedule('purge-config-versions', '4 5 * * *', $$select public.purge_config_versions()$$);

insert into public.sweep_status (sweep, jobname, max_silence, judged_by, requested_at) values
  ('purge_config_versions', 'purge-config-versions', interval '26 hours', 'run', null)
on conflict (sweep) do update
   set jobname = excluded.jobname, max_silence = excluded.max_silence, judged_by = excluded.judged_by;

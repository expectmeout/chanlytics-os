-- 00499 · A mailbox brings its own history, and its owner chooses how far back (decision 0086).
--
-- The imports ledger kept one row a workspace and source (00477), and its job's place with it, so every mailbox a
-- workspace connected shared one cursor: a second mailbox connected while the first was still bringing its six months in
-- set the cursor back, and each read on from the other's place (31 Oct 2026). And connecting a mailbox brought its six
-- months in with no say: the owner was told, never asked.
--
--   imports.connection_id     the mailbox a row's mail or contacts came through: one row a mailbox for the sources a
--                             mailbox brings (mailbox, contacts), one a workspace for every other source, as before. A
--                             row's own id becomes its key; (tenant_id, source, connection_id) is unique, a workspace's
--                             own rows (no mailbox) counting as one.
--   imports.run               the run that holds a row, taken as a run starts (or Stop takes it from every run): a part
--                             of a run that no longer holds it writes nothing and ends, so a part mid-read as its owner
--                             presses Stop never writes over the stop, and two parts never read one mailbox at once.
--   mailbox_connections.history
--                             what its owner chose as it connected: six_months (as before) or from_now (only what comes
--                             after). Told to the workspace as it changes.
--   import_ledger_note        takes the mailbox, the run writing and whether it takes the row. A run still going that
--                             an earlier ledger kept as the workspace's (no mailbox) is taken by its mailbox the first
--                             time that mailbox writes, and a writer that names neither writes the workspace's row as
--                             before, so either deploy order works.
--
-- Rows already done or stopped take the mailbox their cursor names, where that mailbox is still the workspace's.

set local lock_timeout = '3s';

/* ----------------------------------------------------------------------- 1. a row a mailbox -- */

alter table public.imports add column if not exists id uuid not null default gen_random_uuid();
alter table public.imports add column if not exists connection_id uuid;
alter table public.imports add column if not exists run text;

do $$
begin
  if exists (select 1 from pg_constraint
              where conrelid = 'public.imports'::regclass and conname = 'imports_pkey'
                and pg_get_constraintdef(oid) = 'PRIMARY KEY (tenant_id, source)') then
    alter table public.imports drop constraint imports_pkey;
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.imports'::regclass and conname = 'imports_pkey') then
    alter table public.imports add constraint imports_pkey primary key (id);
  end if;
end $$;

alter table public.imports drop constraint if exists imports_connection_fk;
alter table public.imports add constraint imports_connection_fk foreign key (tenant_id, connection_id)
  references public.mailbox_connections (tenant_id, id) on delete cascade;
alter table public.imports drop constraint if exists imports_connection_check;
alter table public.imports add constraint imports_connection_check
  check (connection_id is null or source in ('mailbox', 'contacts'));
alter table public.imports drop constraint if exists imports_run_check;
alter table public.imports add constraint imports_run_check check (run is null or char_length(run) between 1 and 40);

create unique index if not exists imports_one_a_source
  on public.imports (tenant_id, source, connection_id) nulls not distinct;
create index if not exists imports_connection on public.imports (tenant_id, connection_id) where connection_id is not null;

comment on table public.imports is
  'What was brought in (decision 0073, R23; 0086): one row a mailbox for what a mailbox brings (mailbox, contacts), one a workspace for every other source; its state, counts, reach, parts, last error and the run that holds it. Everything it counts is before Chanlytics: shown, never counted as today''s, never answered, never a yes. Members read their workspace''s; the jobs and the clients'' file import write through import_ledger_note.';
comment on column public.imports.connection_id is
  'The mailbox this row''s mail or contacts came through (0086); null for a source that is the workspace''s, and for a row an earlier ledger kept before its mailbox took it.';
comment on column public.imports.run is
  'The run that holds this row (0086), taken as a run starts or as its owner stops it: a write of another run changes nothing, and its part ends.';

-- A row done or stopped takes the mailbox its cursor names, while that mailbox is still the workspace's.
update public.imports i
   set connection_id = m.id
  from public.mailbox_connections m
 where i.source in ('mailbox', 'contacts')
   and i.connection_id is null
   and i.state in ('done', 'failed')
   and m.tenant_id = i.tenant_id
   and m.id::text = i.job_cursor->>'connection';

/* -------------------------------------------------------------------- 2. what the owner chose -- */

alter table public.mailbox_connections add column if not exists history text not null default 'six_months';
alter table public.mailbox_connections drop constraint if exists mailbox_connections_history_check;
alter table public.mailbox_connections add constraint mailbox_connections_history_check
  check (history in ('six_months', 'from_now'));
comment on column public.mailbox_connections.history is
  'What its owner chose as it connected (0086): six_months brings the mail of the six months before it in; from_now only what comes after. Bringing the six months in later sets it back to six_months.';

-- An update is told only when a column Connections draws holds something else (0047): the owner's choice is one.
create or replace trigger workspace_tell_update
  after update of state, held_why, resting_until, daily_cap, customer_domain, sent_days, dns, last_error, from_name,
                  signature, address, history
  on public.mailbox_connections
  for each row when (
    old.state is distinct from new.state or old.held_why is distinct from new.held_why
    or old.resting_until is distinct from new.resting_until or old.daily_cap is distinct from new.daily_cap
    or old.customer_domain is distinct from new.customer_domain or old.sent_days is distinct from new.sent_days
    or old.dns is distinct from new.dns or old.last_error is distinct from new.last_error
    or old.from_name is distinct from new.from_name or old.signature is distinct from new.signature
    or old.address is distinct from new.address or old.history is distinct from new.history)
  execute function public.workspace_tell_row_change();

/* -------------------------------------------------------------------------- 3. the one door -- */

drop function if exists public.import_ledger_note(uuid, text, text, jsonb, boolean, integer, integer, timestamptz, text, text, jsonb);

-- A run's row, written: its state; its counts, added to what a part before it counted (p_add) or set whole; its parts;
-- how far back it reached (the oldest kept); where its job stands; its error; the mailbox it came through. A start (or
-- Stop) takes the row for its run (p_take); a write of a run the row is no longer held by changes nothing. The service
-- role writes any source. A member writes only the clients' file of a workspace they act for: the import route is
-- theirs, one part at a time. A writer that names a mailbox first takes the workspace's row a run still going was kept
-- in (the ledger before 0086): the one whose cursor names that mailbox, else one queued or running that names none.
create or replace function public.import_ledger_note(
  p_tenant_id     uuid,
  p_source        text,
  p_state         text,
  p_counts        jsonb default '{}'::jsonb,
  p_add           boolean default false,
  p_parts_done    integer default null,
  p_parts_total   integer default null,
  p_oldest        timestamptz default null,
  p_via           text default null,
  p_error         text default null,
  p_cursor        jsonb default null,
  p_connection_id uuid default null,
  p_run           text default null,
  p_take          boolean default false
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_service boolean := coalesce((select auth.role()), '') = 'service_role';
  v_counts  jsonb := coalesce(p_counts, '{}'::jsonb);
  v_run     text := nullif(btrim(coalesce(p_run, '')), '');
begin
  if not v_service then
    if (select auth.uid()) is null then
      raise exception 'Sign in required.' using errcode = '28000';
    end if;
    if p_source <> 'clients_file' or p_tenant_id is null or not public.is_acting_member(p_tenant_id) then
      raise exception 'Not yours to write.' using errcode = '42501';
    end if;
  end if;
  if jsonb_typeof(v_counts) <> 'object' then
    raise exception 'Counts are an object.' using errcode = '22023';
  end if;
  if p_connection_id is not null and not exists (
       select 1 from public.imports
        where tenant_id = p_tenant_id and source = p_source and connection_id = p_connection_id) then
    update public.imports
       set connection_id = p_connection_id
     where tenant_id = p_tenant_id and source = p_source and connection_id is null
       and (job_cursor->>'connection' = p_connection_id::text
            or (coalesce(job_cursor->>'connection', '') = '' and state in ('queued', 'running')));
  end if;
  insert into public.imports as i (tenant_id, source, connection_id, run, state, counts, parts_done, parts_total, oldest,
                                   via, job_cursor, started_at, finished_at, last_error)
  values (p_tenant_id, p_source, p_connection_id, v_run, p_state, v_counts,
          coalesce(p_parts_done, 0), p_parts_total, p_oldest, nullif(btrim(coalesce(p_via, '')), ''), p_cursor,
          case when p_state in ('running', 'done', 'failed') then now() end,
          case when p_state in ('done', 'failed') then now() end,
          left(nullif(btrim(coalesce(p_error, '')), ''), 500))
  on conflict (tenant_id, source, connection_id) do update set
    state       = excluded.state,
    counts      = case when p_add then
                    (select coalesce(jsonb_object_agg(k, coalesce((i.counts->>k)::numeric, 0) + coalesce((v_counts->>k)::numeric, 0)), '{}'::jsonb)
                       from (select jsonb_object_keys(i.counts) as k union select jsonb_object_keys(v_counts)) keys)
                  else v_counts end,
    parts_done  = coalesce(p_parts_done, i.parts_done),
    parts_total = coalesce(p_parts_total, i.parts_total),
    oldest      = case when p_oldest is null then i.oldest when i.oldest is null then p_oldest else least(i.oldest, p_oldest) end,
    via         = coalesce(excluded.via, i.via),
    job_cursor  = coalesce(p_cursor, i.job_cursor),
    run         = case when p_take then excluded.run else i.run end,
    -- A run that starts again starts its clock again; one still running keeps the clock it started.
    started_at  = case when i.state in ('done', 'failed') and excluded.state in ('queued', 'running') then now()
                       else coalesce(i.started_at, excluded.started_at) end,
    finished_at = case when excluded.state in ('done', 'failed') then now() else null end,
    last_error  = case when excluded.state = 'failed' then excluded.last_error else null end
  -- A part of a run Stop or a later run took the row from writes nothing.
  where p_take or v_run is null or i.run is null or i.run = v_run;
end $$;

revoke execute on function public.import_ledger_note(uuid, text, text, jsonb, boolean, integer, integer, timestamptz, text, text, jsonb, uuid, text, boolean) from public, anon;
grant execute on function public.import_ledger_note(uuid, text, text, jsonb, boolean, integer, integer, timestamptz, text, text, jsonb, uuid, text, boolean) to authenticated, service_role;
comment on function public.import_ledger_note(uuid, text, text, jsonb, boolean, integer, integer, timestamptz, text, text, jsonb, uuid, text, boolean) is
  'A run of bringing history in, recorded in imports (decision 0073, R23; 0086): its state, counts (added or set), parts, reach, cursor, error, the mailbox it came through and the run that holds it (a run that no longer holds it writes nothing). The service role writes any source; an acting member of the workspace only its clients'' file.';

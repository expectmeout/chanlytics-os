-- 00477 · Connected means filled (decision 0073): the record of what was brought in, and what a client file says of a
-- person.
--
--   imports              One row per workspace and source of history brought in (Google's reviews, the calendar, the
--                        clients' file, the mailbox, the contacts, WhatsApp's contacts and chats): its state, its counts,
--                        how far back it reached, its parts, its last error, and where its job stands. The first run's
--                        "Bringing it in", Today's "Brought in" and Connections' sentences read it. Members read their
--                        workspace's; the jobs write it through the door, and a member's own import route only for the
--                        clients' file it is bringing in.
--   import_ledger_note   The door that writes a row: a run's state, counts added or set, its parts and its reach.
--   contacts.before      What another system said of a person before Chanlytics (decision 0073, R22): the client file's
--                        last visit, visits and birthday, and the tool that said it. Shown on the person as before
--                        Chanlytics, never counted as today's, never a yes. Filled only where empty; scrubbed the moment
--                        the person is erased.
--   person_before_note   A member's import route's door: fills a person's notes and what came before, where empty.
--
-- Either deploy order works: a dashboard that never writes the ledger leaves it empty, which reads as nothing brought
-- in, and an edge that never writes it changes nothing a page says. Re-runnable throughout.

set local lock_timeout = '3s';

/* ----------------------------------------------------------------------------- 1. what was brought in -- */

create table if not exists public.imports (
  tenant_id   uuid not null references public.tenants (id) on delete cascade,
  source      text not null check (source in ('google_reviews', 'calendar', 'clients_file', 'mailbox', 'contacts',
                                              'whatsapp_contacts', 'whatsapp_history')),
  state       text not null default 'queued' check (state in ('queued', 'running', 'done', 'failed')),
  -- What it brought, each count where the source has it: people, messages, dropped, past, coming, reviews,
  -- unanswered, unreadable (contracts setup/imports.ts ImportCounts).
  counts      jsonb not null default '{}'::jsonb check (jsonb_typeof(counts) = 'object'),
  parts_done  integer not null default 0 check (parts_done >= 0),
  parts_total integer check (parts_total is null or parts_total >= 1),
  -- How far back it reached.
  oldest      timestamptz,
  -- The tool or provider it came from: vagaro, google, microsoft, link.
  via         text check (via is null or char_length(via) between 1 and 40),
  -- Where the job stands (a page token, Meta's phase, a sync window): the job's own, never read by a page.
  job_cursor  jsonb check (job_cursor is null or jsonb_typeof(job_cursor) = 'object'),
  started_at  timestamptz,
  finished_at timestamptz,
  last_error  text check (last_error is null or char_length(last_error) <= 500),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (tenant_id, source)
);
comment on table public.imports is
  'What was brought in, one row per workspace and source (decision 0073, R23): its state, counts, reach, parts and last error. Everything it counts is before Chanlytics: shown, never counted as today''s, never answered, never a yes. Members read their workspace''s; the jobs and the clients'' file import write through import_ledger_note.';

drop trigger if exists imports_set_updated_at on public.imports;
create trigger imports_set_updated_at
  before update on public.imports
  for each row execute function extensions.moddatetime('updated_at');

alter table public.imports enable row level security;
drop policy if exists imports_member_select on public.imports;
create policy imports_member_select on public.imports for select to authenticated
  using (tenant_id in (select m.tenant_id from public.memberships m where m.user_id = (select auth.uid())));
revoke all on public.imports from anon, authenticated;
grant select on public.imports to authenticated;
grant select, insert, update, delete on public.imports to service_role;

-- A run's row, written: its state; its counts, added to what a part before it counted (p_add) or set whole; its parts;
-- how far back it reached (the oldest kept); where its job stands; its error. The service role writes any source. A
-- member writes only the clients' file of a workspace they act for: the import route is theirs, one part at a time.
create or replace function public.import_ledger_note(
  p_tenant_id   uuid,
  p_source      text,
  p_state       text,
  p_counts      jsonb default '{}'::jsonb,
  p_add         boolean default false,
  p_parts_done  integer default null,
  p_parts_total integer default null,
  p_oldest      timestamptz default null,
  p_via         text default null,
  p_error       text default null,
  p_cursor      jsonb default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_service boolean := coalesce((select auth.role()), '') = 'service_role';
  v_counts  jsonb := coalesce(p_counts, '{}'::jsonb);
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
  insert into public.imports as i (tenant_id, source, state, counts, parts_done, parts_total, oldest, via, job_cursor,
                                   started_at, finished_at, last_error)
  values (p_tenant_id, p_source, p_state, v_counts, coalesce(p_parts_done, 0), p_parts_total, p_oldest,
          nullif(btrim(coalesce(p_via, '')), ''), p_cursor,
          case when p_state in ('running', 'done', 'failed') then now() end,
          case when p_state in ('done', 'failed') then now() end,
          left(nullif(btrim(coalesce(p_error, '')), ''), 500))
  on conflict (tenant_id, source) do update set
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
    -- A run that starts again starts its clock again; one still running keeps the clock it started.
    started_at  = case when i.state in ('done', 'failed') and excluded.state in ('queued', 'running') then now()
                       else coalesce(i.started_at, excluded.started_at) end,
    finished_at = case when excluded.state in ('done', 'failed') then now() else null end,
    last_error  = case when excluded.state = 'failed' then excluded.last_error else null end;
end $$;

revoke execute on function public.import_ledger_note(uuid, text, text, jsonb, boolean, integer, integer, timestamptz, text, text, jsonb) from public, anon;
grant execute on function public.import_ledger_note(uuid, text, text, jsonb, boolean, integer, integer, timestamptz, text, text, jsonb) to authenticated, service_role;
comment on function public.import_ledger_note(uuid, text, text, jsonb, boolean, integer, integer, timestamptz, text, text, jsonb) is
  'A run of bringing history in, recorded in imports (decision 0073, R23): its state, counts (added or set), parts, reach, cursor and error. The service role writes any source; an acting member of the workspace only its clients'' file.';

/* ------------------------------------------------------------------ 2. what a client file says of a person -- */

alter table public.contacts add column if not exists before jsonb;
alter table public.contacts drop constraint if exists contacts_before_check;
alter table public.contacts add constraint contacts_before_check check (
  before is null or (
    jsonb_typeof(before) = 'object'
    and (not before ? 'last_visit' or (before->>'last_visit') ~ '^\d{4}-\d{2}-\d{2}$')
    and (not before ? 'birthday' or (before->>'birthday') ~ '^(\d{4}|-)-\d{2}-\d{2}$')
    and (not before ? 'visits' or (jsonb_typeof(before->'visits') = 'number' and (before->>'visits')::numeric between 0 and 999999))
    and (not before ? 'via' or char_length(before->>'via') between 1 and 40)
  )
);
comment on column public.contacts.before is
  'What another system said of the person before Chanlytics (decision 0073, R22): { via, last_visit, visits, birthday } from a client file. Shown as before Chanlytics; never counted as today''s, never a yes. Filled only where empty (person_before_note); scrubbed when the person is erased.';

-- An erased person keeps nothing another system said of them: whatever door tombstones the row, `before` goes with it.
create or replace function public.contacts_before_erased() returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.erased_at is not null then
    new.before := null;
  end if;
  return new;
end $$;

drop trigger if exists contacts_before_erased on public.contacts;
create trigger contacts_before_erased
  before update of erased_at, before on public.contacts
  for each row execute function public.contacts_before_erased();

-- A person a client file named: their notes, where none are on file, and what came before, each key only where it is
-- not already there. An acting member of the person's workspace; nothing is overwritten, nothing is a yes.
create or replace function public.person_before_note(
  p_tenant_id  uuid,
  p_contact_id uuid,
  p_before     jsonb default null,
  p_notes      text default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_notes  text := left(nullif(btrim(regexp_replace(coalesce(p_notes, ''), '\s+', ' ', 'g')), ''), 600);
  v_before jsonb;
begin
  if (select auth.uid()) is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  if p_tenant_id is null or not public.is_acting_member(p_tenant_id) then
    raise exception 'Workspace not found.' using errcode = 'P0002';
  end if;
  if p_before is not null and jsonb_typeof(p_before) <> 'object' then
    raise exception 'What came before is an object.' using errcode = '22023';
  end if;
  -- Only the keys the column holds.
  select coalesce(jsonb_object_agg(key, value), '{}'::jsonb) into v_before
    from jsonb_each(coalesce(p_before, '{}'::jsonb))
   where key in ('via', 'last_visit', 'visits', 'birthday');
  update public.contacts c
     set notes  = coalesce(c.notes, v_notes),
         before = case when v_before = '{}'::jsonb then c.before else v_before || coalesce(c.before, '{}'::jsonb) end
   where c.id = p_contact_id
     and c.tenant_id = p_tenant_id
     and c.erased_at is null;
end $$;

revoke execute on function public.person_before_note(uuid, uuid, jsonb, text) from public, anon;
grant execute on function public.person_before_note(uuid, uuid, jsonb, text) to authenticated;
comment on function public.person_before_note(uuid, uuid, jsonb, text) is
  'One line of a client file, beyond who the person is (decision 0073, R22): their notes where none are on file, and the last visit, visits, birthday and tool in contacts.before, each where not already there. An acting member; never a yes.';

-- 00551 · A business keeps its files (decision 0099).
--
-- A business's pictures had nowhere to live, and Ask could not name one. Now every picture has one row and one folder,
-- whichever road brought it, and each is looked at once by a small model that writes down what it shows.
--
--   files               One row a file, from the moment its bytes are proven until they are gone: where it came from,
--                       its name, what it shows and where it stands. The owner's word stays over the model's
--                       (owner_named, owner_shelved, who_in_it).
--   files_let_go        What a person removed, by fingerprint alone, so an import does not bring it back.
--   bucket `files`      Private, written only by a signed upload or the service role: <tenant>/<file>/original.<ext>.
--   file_start          A member's upload begins: the permission, the cap, and the file_purge that lets its bytes go a
--                       day on if they never become a file. No row: nothing holds a name for a photo that never arrives.
--   file_found          The one door every road keeps a file by, the service role's, after the server proved the bytes.
--                       Answers kept, here (a twin, or something let go) or full. Asked twice, it answers the same.
--   file_change         Name, shelf, who is in it, and where it stands.
--   file_keep_many      The Inbox's one press.
--   file_remove         Hidden at once, and written to files_let_go at the press; its bytes go by the file_purge job.
--   file_look_keep      The service role's: what the look saw, under the owner's word. A failed try on a file that has a
--                       look changes nothing but when it was tried.
--   file_listing_aside  The service role's: what a public listing offered and nobody kept, when that listing is not this
--                       business's after all, or its real profile has come.
--   file_purged         The service role's: its bytes and Anthropic's copy are gone, so its row goes.
--   job_kinds           file_look, file_fetch, file_purge, all in the bulk lane: an import must not hold a customer's send.
--   imports.source      Gains google_photos. ai_usage.purpose gains file_look. notifications.kind gains files_waiting.
--
-- Two doors at once can each find a name free, so every door that names or files takes one lock a workspace first. A picture
-- can show anyone, and what the look read off it stays on the row: an erasure of a person does not reach it, and the owner
-- deleting that file is the remedy, which takes the row. Deploy order: this migration first. Re-runnable.

set local lock_timeout = '3s';

/* --------------------------------------------------------------------------------------------------- 1. the bucket -- */

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('files', 'files', false, 25000000, array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

/* --------------------------------------------------------------------------------------------------- 2. the tables -- */

create table if not exists public.files (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references public.tenants (id) on delete cascade,
  status         text not null,
  source         text not null,
  source_ref     text,
  name           text not null,
  owner_named    boolean not null default false,
  mime           text not null,
  bytes          bigint not null,
  width          integer,
  height         integer,
  fingerprint    text not null,
  claude_copy    jsonb,
  look           jsonb,
  look_status    text not null default 'waiting',
  look_edition   integer,
  looked_at      timestamptz not null default now(),
  shows          text,
  owner_shelved  boolean not null default false,
  who_in_it      text not null default 'not_asked',
  created_by     uuid references auth.users (id) on delete set null,
  removed_at     timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint files_status_check check (status = any (array['inbox', 'filed', 'set_aside'])),
  constraint files_source_check check (source = any (array['upload', 'google_profile', 'google_listing', 'website'])),
  constraint files_look_status_check check (look_status = any (array['waiting', 'done', 'refused', 'failed'])),
  constraint files_mime_check
    check (mime = any (array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'])),
  constraint files_shows_check
    check (shows = any (array['storefront', 'interior', 'work', 'team', 'product', 'menu', 'logo', 'graphic', 'other'])),
  constraint files_who_in_it_check check (who_in_it = any (array['not_asked', 'no_one', 'agreed'])),
  -- In any language: lower case, hyphens between words, nothing that means something in a path or on a page.
  constraint files_name_shape check (char_length(name) >= 1 and char_length(name) <= 60 and name = lower(name)
                                     and name !~ '[[:space:][:cntrl:]/\\.<>"''&]' and name !~ '^-|-$|--')
);

create unique index if not exists files_one_name on public.files (tenant_id, name) where removed_at is null;
create unique index if not exists files_one_copy on public.files (tenant_id, fingerprint) where removed_at is null;
create index if not exists files_newest on public.files (tenant_id, created_at desc);
-- The sweep's two reads, across workspaces: a look to try again, and a purge to finish.
create index if not exists files_look_again on public.files (looked_at) where removed_at is null and look_status <> 'refused';
create index if not exists files_removed on public.files (removed_at) where removed_at is not null;

comment on table public.files is
  'A business''s files (00551, decision 0099): one row a picture, whichever road brought it, from its bytes proven until they are gone. Its folder in the files bucket is <tenant>/<id>/, and its extension comes from mime.';
comment on column public.files.status is
  'Where it stands: inbox (waits for a person''s word), filed (what Ask may use), set_aside.';
comment on column public.files.source is
  'Which road brought it: a member''s upload, the connected Google profile, the public Google listing, or the business''s website.';
comment on column public.files.source_ref is
  'Where an import read it: the image''s address, or Google''s name for it, which can expire. Empty for an upload.';
comment on column public.files.name is
  'What it goes by, to Ask and in the page''s words: lower case, hyphens, what it shows first. One per workspace among what is kept.';
comment on column public.files.owner_named is
  'A person named it, so the look does not rename it.';
comment on column public.files.fingerprint is
  'sha256 of its first MiB and its size: the same file twice is one row, and a removed one is not imported again (files_let_go).';
comment on column public.files.claude_copy is
  'The copy Anthropic holds for reading it: {id, expires_at, width, height}. Service role only, never shown to the model, a member or a tool.';
comment on column public.files.look is
  'What the look saw, in contracts FileLook. Written only by file_look_keep.';
comment on column public.files.look_status is
  'waiting, done, refused (the model would not read it, so a person sees it), or failed (no answer; the file stays usable, and the sweep tries again for a week).';
comment on column public.files.look_edition is
  'The edition of the look''s rules it was read under (contracts FILE_LOOK_EDITION). A lower one is read again.';
comment on column public.files.looked_at is
  'When it was last looked at, or tried, or kept: what tells the sweep to leave it alone for a day.';
comment on column public.files.shows is
  'Its shelf''s word: from the look, Google''s category, or a person. owner_shelved says a person chose it.';
comment on column public.files.who_in_it is
  'A person''s word alone: not_asked, no_one, or agreed. What the look counted is on look.people, and contracts whoStandsOf reads the two.';
comment on column public.files.removed_at is
  'A person removed it: hidden at once. file_purge lets its bytes go and takes the row.';

alter table public.files enable row level security;
drop policy if exists files_member_select on public.files;
create policy files_member_select on public.files for select to authenticated
  using (tenant_id in (select m.tenant_id from public.memberships m where m.user_id = (select auth.uid())));

-- No member writes the table: every change is a door. claude_copy and the fingerprint are the server's alone.
revoke all on public.files from anon, authenticated;
grant select (id, tenant_id, status, source, source_ref, name, mime, bytes, width, height, look,
              look_status, shows, who_in_it, removed_at, created_at, updated_at)
  on public.files to authenticated;
grant select, insert, update, delete on public.files to service_role;

-- A photo arrives and a look answers: told when a page would draw something else. A purge deletes a row nobody draws.
drop trigger if exists workspace_tell_insert on public.files;
create trigger workspace_tell_insert after insert on public.files referencing new table as changed
  for each statement execute function public.workspace_tell_changes();
drop trigger if exists workspace_tell_update on public.files;
create trigger workspace_tell_update after update of status, name, shows, who_in_it, look_status, look, removed_at on public.files
  for each row
  when (old.status is distinct from new.status or old.name is distinct from new.name or old.shows is distinct from new.shows
        or old.who_in_it is distinct from new.who_in_it or old.look_status is distinct from new.look_status
        or old.look is distinct from new.look or old.removed_at is distinct from new.removed_at)
  execute function public.workspace_tell_row_change();

create table if not exists public.files_let_go (
  tenant_id    uuid not null references public.tenants (id) on delete cascade,
  fingerprint  text not null,
  let_go_at    timestamptz not null default now(),
  primary key (tenant_id, fingerprint)
);
comment on table public.files_let_go is
  'What a person removed from a business''s files, by fingerprint alone, written at the press (00551, decision 0099): an import does not bring it back. A person may still add it again. Nothing else of the file stays.';
alter table public.files_let_go enable row level security;
revoke all on public.files_let_go from anon, authenticated;
grant select, insert, update, delete on public.files_let_go to service_role;

/* ---------------------------------------------------------------------------------------------- 3. the job's kinds -- */

-- A purge is asked for at a start, at a removal and by the sweep, each its own row: `why` keeps one from refusing another.
insert into public.job_kinds (kind, lane, once_parts, once_kept) values
  ('file_look',  2, array['file_id', 'edition'],             false),
  ('file_fetch', 2, array['@tenant', 'source', 'batch'],     false),
  ('file_purge', 2, array['file_id', 'why'],                 false)
on conflict (kind) do update
  set lane = excluded.lane, once_parts = excluded.once_parts, once_kept = excluded.once_kept;

/* ----------------------------------------------------------------------------------------------- 4. a name, free -- */

create or replace function public.file_free_name(p_tenant_id uuid, p_base text, p_self uuid default null)
returns text
language plpgsql
stable
set search_path = public
as $$
declare
  v_base text := left(coalesce(nullif(p_base, ''), 'file'), 60);
  v_name text := v_base;
  v_n    integer := 1;
begin
  while exists (
    select 1 from public.files f
     where f.tenant_id = p_tenant_id and f.name = v_name and f.removed_at is null and f.id is distinct from p_self
  ) loop
    v_n := v_n + 1;
    v_name := regexp_replace(left(v_base, 55), '-+$', '') || '-' || v_n;
  end loop;
  return v_name;
end $$;
revoke all on function public.file_free_name(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.file_free_name(uuid, text, uuid) to service_role;
comment on function public.file_free_name(uuid, text, uuid) is
  'The name itself where it is free in this workspace, else with -2, -3 (00551).';

/* --------------------------------------------------------------------------------------------- 5. a member's doors -- */

create or replace function public.file_start(p_tenant_id uuid, p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
begin
  if v_actor is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  if p_tenant_id is null or not coalesce(public.caller_has_permission(p_tenant_id, 'settings'), false) then
    raise exception 'Not yours to change.' using errcode = '42501';
  end if;
  -- contracts FILES_MAX: the fair word before anything travels. file_found holds it for certain.
  if (select count(*) from public.files f where f.tenant_id = p_tenant_id and f.removed_at is null) >= 1000 then
    raise exception 'This workspace holds as many files as it can. Remove some first.' using errcode = '22023';
  end if;
  -- Bytes that never become a file hold nothing but their folder: this empties it a day on, and leaves a file alone.
  insert into public.jobs (tenant_id, kind, due_at, payload)
  values (p_tenant_id, 'file_purge', now() + interval '1 day', jsonb_build_object('file_id', p_id, 'why', 'start'));
end $$;
revoke all on function public.file_start(uuid, uuid) from public, anon;
grant execute on function public.file_start(uuid, uuid) to authenticated, service_role;
comment on function public.file_start(uuid, uuid) is
  'A member''s upload begins (00551): the settings permission, the workspace''s cap, and the file_purge that lets its bytes go a day on if they never become a file. No row until they are proven.';

create or replace function public.file_change(
  p_tenant_id uuid,
  p_id uuid,
  p_name text default null,
  p_shows text default null,
  p_who_in_it text default null,
  p_status text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_row   public.files;
begin
  if v_actor is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  if p_tenant_id is null or not coalesce(public.caller_has_permission(p_tenant_id, 'settings'), false) then
    raise exception 'Not yours to change.' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_tenant_id::text || '|files', 42));
  select * into v_row from public.files f
   where f.tenant_id = p_tenant_id and f.id = p_id and f.removed_at is null
   for update;
  if not found then
    raise exception 'That file is gone.' using errcode = 'P0002';
  end if;
  if p_status is not null and p_status not in ('filed', 'set_aside') then
    raise exception 'A file is filed or set aside.' using errcode = '22023';
  end if;
  -- not_asked is where a file starts, never something a person says.
  if p_who_in_it is not null and p_who_in_it not in ('no_one', 'agreed') then
    raise exception 'Say no one is in it, or that they agreed.' using errcode = '22023';
  end if;
  if p_name is not null and p_name <> v_row.name and public.file_free_name(p_tenant_id, p_name, p_id) <> p_name then
    raise exception 'Another file has that name.' using errcode = '22023';
  end if;
  update public.files f
     set name = coalesce(p_name, f.name),
         owner_named = f.owner_named or p_name is not null,
         shows = coalesce(p_shows, f.shows),
         owner_shelved = f.owner_shelved or p_shows is not null,
         who_in_it = coalesce(p_who_in_it, f.who_in_it),
         status = coalesce(p_status, f.status),
         updated_at = now()
   where f.tenant_id = p_tenant_id and f.id = p_id;
  -- What was said, and by whom: "they agreed" is a word someone gave, on a day.
  insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
  values (p_tenant_id, 'file.changed', 'setup', 'workspace', p_tenant_id,
          jsonb_build_object('file_id', p_id, 'by', v_actor, 'said',
                             jsonb_strip_nulls(jsonb_build_object('name', p_name, 'shows', p_shows,
                                                                  'who_in_it', p_who_in_it, 'status', p_status))));
end $$;
revoke all on function public.file_change(uuid, uuid, text, text, text, text) from public, anon;
grant execute on function public.file_change(uuid, uuid, text, text, text, text) to authenticated, service_role;
comment on function public.file_change(uuid, uuid, text, text, text, text) is
  'What a person says of a file (00551): its name, its shelf, who is in it, filed or set aside. A field left null stays, and the event keeps what was said.';

create or replace function public.file_keep_many(p_tenant_id uuid, p_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_kept  integer;
begin
  if v_actor is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  if p_tenant_id is null or not coalesce(public.caller_has_permission(p_tenant_id, 'settings'), false) then
    raise exception 'Not yours to change.' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_tenant_id::text || '|files', 42));
  update public.files f
     set status = 'filed', updated_at = now()
   where f.tenant_id = p_tenant_id and f.id = any (p_ids) and f.status = 'inbox' and f.removed_at is null;
  get diagnostics v_kept = row_count;
  if v_kept > 0 then
    insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
    values (p_tenant_id, 'file.kept', 'setup', 'workspace', p_tenant_id, jsonb_build_object('count', v_kept, 'by', v_actor));
  end if;
  return v_kept;
end $$;
revoke all on function public.file_keep_many(uuid, uuid[]) from public, anon;
grant execute on function public.file_keep_many(uuid, uuid[]) to authenticated, service_role;
comment on function public.file_keep_many(uuid, uuid[]) is
  'The Inbox''s one press (00551): what waits, among these, is filed. Answers how many moved.';

create or replace function public.file_remove(p_tenant_id uuid, p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor       uuid := auth.uid();
  v_fingerprint text;
begin
  if v_actor is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  if p_tenant_id is null or not coalesce(public.caller_has_permission(p_tenant_id, 'settings'), false) then
    raise exception 'Not yours to change.' using errcode = '42501';
  end if;
  update public.files f set removed_at = now(), updated_at = now()
   where f.tenant_id = p_tenant_id and f.id = p_id and f.removed_at is null
  returning f.fingerprint into v_fingerprint;
  if not found then
    raise exception 'That file is gone.' using errcode = 'P0002';
  end if;
  -- At the press, not the purge: an import in between must not bring back what was just removed.
  insert into public.files_let_go (tenant_id, fingerprint) values (p_tenant_id, v_fingerprint)
  on conflict (tenant_id, fingerprint) do nothing;
  insert into public.jobs (tenant_id, kind, due_at, payload)
  values (p_tenant_id, 'file_purge', now(), jsonb_build_object('file_id', p_id, 'why', 'remove'));
  insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
  values (p_tenant_id, 'file.removed', 'setup', 'workspace', p_tenant_id,
          jsonb_build_object('file_id', p_id, 'by', v_actor));
end $$;
revoke all on function public.file_remove(uuid, uuid) from public, anon;
grant execute on function public.file_remove(uuid, uuid) to authenticated, service_role;
comment on function public.file_remove(uuid, uuid) is
  'A person removed a file (00551): hidden at once and written to files_let_go, so an import does not bring it back; its bytes, Anthropic''s copy and its row go by the file_purge job.';

/* ------------------------------------------------------------------------------------------ 6. the service's doors -- */

create or replace function public.file_found(
  p_tenant_id uuid,
  p_id uuid,
  p_status text,
  p_source text,
  p_source_ref text,
  p_name text,
  p_mime text,
  p_bytes bigint,
  p_fingerprint text,
  p_width integer,
  p_height integer,
  p_shows text,
  p_edition integer,
  p_actor uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_twin    public.files;
  v_name    text;
  v_waiting integer;
  v_due     timestamptz := now();
begin
  -- One at a time: photos come side by side, and can share a name or be one picture at two addresses.
  perform pg_advisory_xact_lock(hashtextextended(p_tenant_id::text || '|files', 42));
  -- Asked again after a lost answer: the same answer, never its own twin.
  if exists (select 1 from public.files f where f.tenant_id = p_tenant_id and f.id = p_id) then
    return jsonb_build_object('fate', 'kept', 'file_id', p_id);
  end if;
  select * into v_twin from public.files f
   where f.tenant_id = p_tenant_id and f.fingerprint = p_fingerprint and f.removed_at is null;
  if found then
    -- An upload is the owner's word for whatever it twins. Their profile's word files what only waited, and is the better
    -- road for what a listing offered.
    update public.files f
       set status = case when p_source = 'upload' or (p_status = 'filed' and f.status = 'inbox') then 'filed' else f.status end,
           source = case when p_source = 'google_profile' and f.source = 'google_listing' then p_source else f.source end,
           source_ref = case when p_source = 'google_profile' and f.source = 'google_listing' then p_source_ref else f.source_ref end,
           updated_at = now()
     where f.id = v_twin.id and (f.status <> 'filed' or (p_source = 'google_profile' and f.source = 'google_listing'));
    return jsonb_build_object('fate', 'here', 'file_id', v_twin.id);
  end if;
  -- What a person removed is not brought back by the next read of the same place. A person may add it again.
  if p_source <> 'upload' and exists (
    select 1 from public.files_let_go g where g.tenant_id = p_tenant_id and g.fingerprint = p_fingerprint
  ) then
    return jsonb_build_object('fate', 'here', 'file_id', null);
  end if;
  -- contracts FILES_MAX.
  if (select count(*) from public.files f where f.tenant_id = p_tenant_id and f.removed_at is null) >= 1000 then
    return jsonb_build_object('fate', 'full', 'file_id', null);
  end if;
  -- An upload's look starts now, as someone is watching. An import's are paced, so 200 photos are not 200 due rows.
  if p_source <> 'upload' then
    select count(*) into v_waiting from public.files f
     where f.tenant_id = p_tenant_id and f.look_status = 'waiting' and f.removed_at is null;
    v_due := now() + v_waiting * interval '2 seconds';
  end if;
  v_name := public.file_free_name(p_tenant_id, p_name);
  insert into public.files (id, tenant_id, status, source, source_ref, name, mime, bytes, fingerprint,
                            width, height, shows, created_by)
  values (p_id, p_tenant_id, p_status, p_source, p_source_ref, v_name, p_mime, p_bytes, p_fingerprint,
          p_width, p_height, p_shows, p_actor);
  -- As text: a job's once-only key is made of strings (job_dedupe_key_of).
  insert into public.jobs (tenant_id, kind, due_at, payload)
  values (p_tenant_id, 'file_look', v_due, jsonb_build_object('file_id', p_id, 'edition', p_edition::text));
  -- A person's act is on the record. An import's is on its own line, not 200 of these.
  if p_source = 'upload' then
    insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
    values (p_tenant_id, 'file.added', 'setup', 'workspace', p_tenant_id,
            jsonb_build_object('file_id', p_id, 'source', p_source, 'by', p_actor));
  end if;
  return jsonb_build_object('fate', 'kept', 'file_id', p_id);
end $$;
revoke all on function public.file_found(uuid, uuid, text, text, text, text, text, bigint, text, integer, integer, text, integer, uuid)
  from public, anon, authenticated;
grant execute on function public.file_found(uuid, uuid, text, text, text, text, text, bigint, text, integer, integer, text, integer, uuid)
  to service_role;
comment on function public.file_found(uuid, uuid, text, text, text, text, text, bigint, text, integer, integer, text, integer, uuid) is
  'The one door every road keeps a file by, after the server proved its bytes (00551). Answers {fate: kept, here or full, file_id}. No session reaches it: what the bytes are is never the browser''s word.';

create or replace function public.file_look_keep(
  p_tenant_id uuid,
  p_id uuid,
  p_status text,
  p_edition integer,
  p_look jsonb,
  p_name text,
  p_shows text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(p_tenant_id::text || '|files', 42));
  update public.files f
     set look = case when p_status = 'done' then p_look else f.look end,
         -- A try that came to nothing, on a file with a look, leaves that look standing. A failed one changes nothing but when
         -- it was tried, so a raised edition still reads it. A refusal counts as read, or the sweep would ask every day.
         look_status = case when p_status <> 'done' and f.look is not null then f.look_status else p_status end,
         look_edition = case when p_status = 'failed' and f.look is not null then f.look_edition else p_edition end,
         looked_at = now(),
         -- A name is given once, by the first look that can: a later one must not rename what people and Ask call it.
         name = case when p_name is not null and not f.owner_named and f.look is null
                     then public.file_free_name(p_tenant_id, p_name, p_id) else f.name end,
         shows = case when f.owner_shelved or p_status <> 'done' then f.shows else coalesce(p_shows, f.shows) end,
         -- The model would not read it, for the first time: a person looks.
         status = case when p_status = 'refused' and f.status = 'filed' and f.look is null then 'inbox' else f.status end,
         updated_at = now()
   where f.tenant_id = p_tenant_id and f.id = p_id and f.removed_at is null;
end $$;
revoke all on function public.file_look_keep(uuid, uuid, text, integer, jsonb, text, text)
  from public, anon, authenticated;
grant execute on function public.file_look_keep(uuid, uuid, text, integer, jsonb, text, text) to service_role;
comment on function public.file_look_keep(uuid, uuid, text, integer, jsonb, text, text) is
  'What the look saw (00551), under the owner''s word: a name they gave and a shelf they chose stay, a first look alone names a file, and a failed try leaves a good look as it was.';

create or replace function public.file_listing_aside(p_tenant_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_moved integer;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_tenant_id::text || '|files', 42));
  update public.files f
     set status = 'set_aside', updated_at = now()
   where f.tenant_id = p_tenant_id and f.source = 'google_listing' and f.status = 'inbox' and f.removed_at is null
     and not f.owner_named and not f.owner_shelved;
  get diagnostics v_moved = row_count;
  -- Nobody pressed this, so the record says where they went.
  if v_moved > 0 then
    insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
    values (p_tenant_id, 'file.set_aside', 'setup', 'workspace', p_tenant_id, jsonb_build_object('count', v_moved));
  end if;
  return v_moved;
end $$;
revoke all on function public.file_listing_aside(uuid) from public, anon, authenticated;
grant execute on function public.file_listing_aside(uuid) to service_role;
comment on function public.file_listing_aside(uuid) is
  'What a public listing offered and nobody kept goes aside (00551): that listing was not this business''s after all, or its own profile has come. What a person kept or touched stays, and a person can put any of it back.';

create or replace function public.file_purged(p_tenant_id uuid, p_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.files f where f.tenant_id = p_tenant_id and f.id = p_id and f.removed_at is not null;
$$;
revoke all on function public.file_purged(uuid, uuid) from public, anon, authenticated;
grant execute on function public.file_purged(uuid, uuid) to service_role;
comment on function public.file_purged(uuid, uuid) is
  'A removed file''s bytes and Anthropic''s copy are gone (00551), so its row goes. Its fingerprint is already in files_let_go.';

/* ----------------------------------------------------------------------------------------- 7. the closed sets grow -- */

-- contracts IMPORT_SOURCES.
alter table public.imports drop constraint if exists imports_source_check;
alter table public.imports add constraint imports_source_check
  check (source = any (array['google_reviews', 'calendar', 'clients_file', 'mailbox', 'contacts', 'whatsapp_contacts',
                             'whatsapp_history', 'google_photos']));

-- contracts MODEL_PURPOSES.
alter table public.ai_usage drop constraint if exists ai_usage_purpose_check;
alter table public.ai_usage add constraint ai_usage_purpose_check
  check (purpose in ('receptionist', 'reply_draft', 'ask', 'lead_json', 'template_draft', 'review_reply',
                     'lead_judge', 'note_suggest', 'reach_out_check', 'reply_read', 'booking_read', 'lead_suggest',
                     'ask_journal', 'receptionist_review', 'fix_route', 'website_read', 'sender_read', 'file_look'));

-- contracts SERVER_NOTIFICATION_KINDS.
alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind = any (array['handoff', 'deadman', 'call', 'number', 'sweep', 'job_failed', 'playbook', 'calendar_people',
                           'alert', 'review', 'billing', 'template_ready', 'template_blocked', 'broadcast_sent',
                           'broadcast_stopped', 'leads_ready', 'leads_question', 'note_for_you', 'reach_out_replied',
                           'reach_out_day', 'booking_notice', 'opted_out', 'booking', 'member_joined', 'member_left',
                           'note_to_keep', 'reply_held', 'ask_cards', 'website_form', 'files_waiting']));

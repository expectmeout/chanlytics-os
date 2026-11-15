-- 00630 · One picture is one file, whichever road brought it (decision 0134, amended 15 Nov 2026).
--
-- A business's website often shows what its Instagram posts: once both are read, the same picture comes twice, the site's copy
-- smaller and recompressed. A file's fingerprint is its bytes (00551), so the two were two files. Now each picture carries a
-- print of what it looks like, and a print within 24 bits of another's is the same picture.
--
--   files.picture_print   A 128-bit difference hash of the picture (a video's poster), 32 hex characters (core
--                         look/picture-print.ts). Null until printed, and for a picture too plain to print.
--   file_twin_of          The file a print finds: the same kind, not removed, not one this business made, within 24 bits
--                         (a video's also within half a second of its length), the nearest first.
--   file_twin_fate        Which of two twins stays, one rule for both doors: an upload is a person's word and always stays,
--                         and a twin that only waited goes; a road's newcomer goes where its twin was kept or set aside, or
--                         waits and is at least as big; a waiting twin a post uses never goes; two kept files both stay.
--   file_twin_goes        Removal as file_video_begin's twin's is (00556): removed_at, the purge due now, nothing let go,
--                         and a file.removed event that names the file staying.
--   file_found            Takes p_print: a found photo is judged by its look as well as its bytes, before it is kept.
--   file_printed          The service role's: any other picture's print kept and judged the same way (an upload as its
--                         look starts, a video at its digest's first step, a file from before by the backfill script).
--
-- Deploy order: this migration first (the edge passes p_print and calls file_printed). Re-runnable.

set local lock_timeout = '3s';

/* --------------------------------------------------------------------------------------------- 1. the print -- */

alter table public.files add column if not exists picture_print text;
alter table public.files drop constraint if exists files_picture_print_check;
alter table public.files add constraint files_picture_print_check
  check (picture_print is null or picture_print ~ '^[0-9a-f]{32}$');
comment on column public.files.picture_print is
  'What the picture looks like (00630): a 128-bit difference hash, 32 hex characters; a video''s is its poster''s. Twins are within 24 bits. Null until printed.';

/* ------------------------------------------------------------------------------------ 2. the twin and its fate -- */

create or replace function public.file_twin_of(
  p_tenant_id uuid,
  p_id        uuid,
  p_kind      text,
  p_print     text,
  p_seconds   numeric
) returns uuid
language sql
stable
security definer
set search_path to 'public'
as $$
  select f.id from public.files f
   where f.tenant_id = p_tenant_id and f.id <> p_id and f.removed_at is null and f.kind = p_kind
     and f.source <> 'made' and f.picture_print is not null
     and bit_count(('x' || f.picture_print)::bit(128) # ('x' || p_print)::bit(128)) <= 24
     and (p_kind <> 'video' or (f.seconds is not null and p_seconds is not null and abs(f.seconds - p_seconds) <= 0.5))
   order by bit_count(('x' || f.picture_print)::bit(128) # ('x' || p_print)::bit(128)), f.created_at
   limit 1;
$$;

revoke all on function public.file_twin_of(uuid, uuid, text, text, numeric) from public, anon, authenticated;
comment on function public.file_twin_of(uuid, uuid, text, text, numeric) is
  'The file a print finds (00630), by its id: same kind, not removed, not made here, within 24 bits (a video''s within half a second of its length too), the nearest first. Its doors''.';

create or replace function public.file_twin_fate(
  p_source  text,
  p_status  text,
  p_pixels  numeric,
  p_twin_id uuid
) returns text
language sql
stable
security definer
set search_path to 'public'
as $$
  select case
    -- A twin a person kept or set aside: a road brings nothing new; an upload is the person's word for it again.
    when twin.status <> 'inbox' then case when p_source = 'upload' then 'both_stay' else 'new_goes' end
    -- A waiting twin a post already uses stays where it is.
    when exists (select 1 from public.posts p where p.file_id = twin.id) then
      case when p_source = 'upload' or p_status = 'filed' then 'both_stay' else 'new_goes' end
    -- An upload, or a road that files what it brings (the owner's connected profile), over a twin that only waited.
    when p_source = 'upload' or p_status = 'filed' then 'twin_goes'
    -- Two that wait: the bigger stays, and the one already here where they are alike.
    when coalesce(p_pixels, 0) > coalesce(twin.width::numeric * twin.height, 0) then 'twin_goes'
    else 'new_goes'
  end
  from public.files twin
  where twin.id = p_twin_id;
$$;

revoke all on function public.file_twin_fate(text, text, numeric, uuid) from public, anon, authenticated;
comment on function public.file_twin_fate(text, text, numeric, uuid) is
  'Which of two twins stays (00630), for a newcomer of this source, status and size against the twin by its id: new_goes, twin_goes or both_stay. Its doors''.';

create or replace function public.file_twin_goes(p_tenant_id uuid, p_id uuid, p_stays uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  update public.files f set removed_at = now(), updated_at = now()
   where f.tenant_id = p_tenant_id and f.id = p_id and f.removed_at is null;
  if not found then
    return;
  end if;
  -- The purge lets its bytes and its video go. One already on the ledger for this file stays the one.
  insert into public.jobs (tenant_id, kind, due_at, payload)
  values (p_tenant_id, 'file_purge', now(), jsonb_build_object('file_id', p_id, 'why', 'remove'))
  on conflict do nothing;
  -- On the record as a removal, and which file stayed in its place.
  insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
  values (p_tenant_id, 'file.removed', 'setup', 'workspace', p_tenant_id,
          jsonb_build_object('file_id', p_id, 'why', 'twin', 'stays', p_stays));
end $$;

revoke all on function public.file_twin_goes(uuid, uuid, uuid) from public, anon, authenticated;
comment on function public.file_twin_goes(uuid, uuid, uuid) is
  'A twin goes (00630): removed, its purge due now, and a file.removed event that names the file staying. Nothing is let go: a person may add it again. Its doors''.';

/* ------------------------------------------------------------------------- 3. a found photo is judged as it comes -- */

drop function if exists public.file_found(uuid, uuid, text, text, text, text, text, bigint, text, integer, integer, text, integer, uuid);

create or replace function public.file_found(
  p_tenant_id   uuid,
  p_id          uuid,
  p_status      text,
  p_source      text,
  p_source_ref  text,
  p_name        text,
  p_mime        text,
  p_bytes       bigint,
  p_fingerprint text,
  p_width       integer,
  p_height      integer,
  p_shows       text,
  p_edition     integer,
  p_actor       uuid default null,
  p_print       text default null
) returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_twin    public.files;
  v_near    uuid;
  v_fate    text;
  v_name    text;
  v_waiting integer;
  v_due     timestamptz := now();
begin
  if p_print is not null and p_print !~ '^[0-9a-f]{32}$' then
    raise exception 'file_found: % is not a print', p_print using errcode = '22023';
  end if;
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
  -- The same picture by its look (00630): kept once, the better of the two where only one waited.
  if p_print is not null then
    v_near := public.file_twin_of(p_tenant_id, p_id, 'image', p_print, null);
    if v_near is not null then
      v_fate := public.file_twin_fate(p_source, p_status, p_width::numeric * p_height, v_near);
      if v_fate = 'new_goes' then
        return jsonb_build_object('fate', 'here', 'file_id', v_near);
      elsif v_fate = 'twin_goes' then
        perform public.file_twin_goes(p_tenant_id, v_near, p_id);
      end if;
    end if;
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
                            width, height, shows, created_by, picture_print)
  values (p_id, p_tenant_id, p_status, p_source, p_source_ref, v_name, p_mime, p_bytes, p_fingerprint,
          p_width, p_height, p_shows, p_actor, p_print);
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

revoke all on function public.file_found(uuid, uuid, text, text, text, text, text, bigint, text, integer, integer, text, integer, uuid, text) from public, anon, authenticated;
grant execute on function public.file_found(uuid, uuid, text, text, text, text, text, bigint, text, integer, integer, text, integer, uuid, text) to service_role;
comment on function public.file_found(uuid, uuid, text, text, text, text, text, bigint, text, integer, integer, text, integer, uuid, text) is
  'The one door every road keeps a file by, after the server proved its bytes (00551), and judged by its look where it carries a print (00630). Answers {fate: kept, here or full, file_id}. No session reaches it: what the bytes are is never the browser''s word.';

/* ------------------------------------------------------------------------ 4. any other picture, printed later -- */

create or replace function public.file_printed(p_tenant_id uuid, p_id uuid, p_print text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_row  public.files;
  v_near uuid;
  v_fate text;
begin
  if p_print is null or p_print !~ '^[0-9a-f]{32}$' then
    raise exception 'file_printed: % is not a print', p_print using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_tenant_id::text || '|files', 42));
  select * into v_row from public.files f where f.tenant_id = p_tenant_id and f.id = p_id and f.removed_at is null;
  if not found then
    return jsonb_build_object('fate', 'gone', 'twin_id', null);
  end if;
  -- Kept without touching updated_at: a print is no change a page shows.
  update public.files f set picture_print = p_print where f.id = p_id;
  if v_row.source = 'made' then
    return jsonb_build_object('fate', 'kept', 'twin_id', null);
  end if;
  v_near := public.file_twin_of(p_tenant_id, p_id, v_row.kind, p_print, v_row.seconds);
  if v_near is null then
    return jsonb_build_object('fate', 'kept', 'twin_id', null);
  end if;
  v_fate := public.file_twin_fate(v_row.source, v_row.status, v_row.width::numeric * v_row.height, v_near);
  -- This one goes only where nothing uses it either.
  if v_fate = 'new_goes' and not exists (select 1 from public.posts p where p.file_id = p_id) then
    perform public.file_twin_goes(p_tenant_id, p_id, v_near);
    return jsonb_build_object('fate', 'gone', 'twin_id', v_near);
  elsif v_fate = 'twin_goes' then
    perform public.file_twin_goes(p_tenant_id, v_near, p_id);
    return jsonb_build_object('fate', 'kept', 'twin_id', v_near);
  end if;
  return jsonb_build_object('fate', 'kept', 'twin_id', null);
end $$;

revoke all on function public.file_printed(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.file_printed(uuid, uuid, text) to service_role;
comment on function public.file_printed(uuid, uuid, text) is
  'A picture''s print kept and judged (00630): an upload''s as its look starts, a video''s at its digest''s first step, a file from before by the backfill. Answers {fate: kept or gone, twin_id: the twin that went, or that this one gave way to}. The service role''s.';

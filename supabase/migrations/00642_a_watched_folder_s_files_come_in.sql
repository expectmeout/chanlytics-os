-- A watched folder's files come in (the footage sources plan's P3, 18 November 2026).
--
-- 00639 made the three tables and the sync keeps a folder's list true. This is what takes a listed photo or short clip
-- into the Library: one job an item, which screens it by its provider's own record, proves it by its first bytes, finds
-- room, spends the day's budget, and only then moves bytes. A photo's bytes come through the job into Storage; a
-- video's go from its provider to the video platform through the relay, never through the app.
--
--   files.source           gains drive: what a watched Google Drive folder brought. A file's origins are still its
--                          source_items rows; this says which road made the row.
--   source_items           gains what a take keeps: take_after (when a waiting item may next be tried: tomorrow for a
--                          day's budget, later for room), taken_at (when its take last spent the day's budget, which is
--                          what a workspace's day is counted from) and take_tries (how many fetches of it failed).
--   source_days            the platform's day: the bytes moved from providers, the takes begun and the provider's units
--                          spent, one row a day as Google counts a day (Pacific time). The service role's alone.
--   job_kinds              source_take: one item taken, held once per item and try, in the bulk lane.
--   file_video_sourced     a sibling of file_video_found for a watched folder's clip. It takes the clip's size and
--                          length, so room is judged before the video platform is asked: called with no copy named it
--                          only judges (room, here, let_go, full, minutes); called with one it writes the row, and
--                          makes the item its origin in the same transaction.
--   source_takes_hand_out  the hand-out's one statement, for every workspace (the clock) or for one (as a take ends):
--                          each waiting item whose time has come, of a folder still being read, is moved to taking and
--                          given its job, newest first, while its workspace has fewer than so many in flight and the
--                          video platform is preparing fewer than so many clips. A paused kind is handed nothing.
--   source_items.why       a closed set (contracts SOURCE_ITEM_WHYS), held by a check.
--   source_takes_release   a trigger on files: a file removed frees room, so what waited for it is due at once.
--   files_are_full         whether a workspace's Library is at its thousand: the number, once, for the doors here.
--   source_take_spend      the day's budgets, bound in one place: the platform's bytes and units, a workspace's bytes
--                          and takes. Answers go, or wait with which budget binds and when the next day begins.
--   source_units_spend     the provider's units counted as they are spent (the relay's key door, a read).
--
-- And where what a folder brings meets what was found online (the plan's "Found media meets watched sources"):
--
--   file_road_is_owners    whether a road is the owner's own word: an upload, and a folder they confirmed. The one place
--                          that says so.
--   file_twin_fate         asks it where it asked for an upload: a watched file over a look-alike its owner kept or set
--                          aside stays beside it, and is never the one removed.
--   file_video_room        whether a video of this length may come in: longer than AI can watch (long), no room in the
--                          minutes (minutes), or room. The one place both video doors ask.
--   file_video_found       takes the road's own word for the length (p_seconds) and writes it, so a video on its way
--                          counts at once and fifty reels cannot pass sixty minutes. Called with no copy named it only
--                          judges, as file_video_sourced does, so a video with no room costs no fetch.
--   file_media_ready       a found video whose road never said its length is judged by it as the video platform says it:
--                          one too long, or with no room, is passed over: removed, its copy purged, counted on its
--                          road's line, and a long one not fetched again.
--   found_read_spend       a found read's pace and budget, bound in one place: an account once a day, a workspace's
--                          reads a day, the platform's reads a day (source_days.reads).
--
-- Every number of a budget is the edge's one setting, passed in; none is written here. Members read source_items as
-- before; only the service role writes, and none of these functions is a session's to call.
--
-- Deploy order: this migration first (the edge hands out a kind the ledger refuses without its row, and passes
-- file_video_found a length; the old edge names none of it, and its nine-word call of file_video_found still
-- answers). Re-runnable throughout.
--
-- After the review of 18 November (docs: the footage review of P2 and P3): a workspace has a few takes in flight
-- rather than a few a clock turn (5); the clips in flight at the video platform are held under one number (6); freed
-- room releases what waited for it (7); an item of bytes already taken is found by its provider's checksum (8); a
-- watched clip its provider never measured is judged as the video platform says its length (11); the caps' numbers
-- are each in one function (14); an item's reason is one of a closed set (15); a paused kind is handed nothing (16).
--
-- After the sync landed (00641): a video its provider has not measured yet waits for its length as the sync says
-- (source_items.length_until), so the hand-out passes it over until then and the take keeps no wait of its own; and
-- an item left taking with a file that is not a clip on its way (one that was in, left its folder and came back)
-- waits again as a lost take does, so its next take finds the file it holds.

set local lock_timeout = '3s';

/* --------------------------------------------------------------------------------------------- 1. drive is a road -- */

alter table public.files drop constraint if exists files_source_check;
alter table public.files add constraint files_source_check
  check (source = any (array['upload', 'google_profile', 'google_listing', 'website', 'instagram', 'made', 'drive']));

/* ------------------------------------------------------------------------------------ 2. what a take keeps on an item -- */

alter table public.source_items
  add column if not exists take_after timestamptz,
  add column if not exists taken_at   timestamptz,
  add column if not exists take_tries smallint not null default 0;

alter table public.source_items drop constraint if exists source_items_take_tries_check;
alter table public.source_items add constraint source_items_take_tries_check check (take_tries >= 0);

comment on column public.source_items.take_after is
  'When a waiting item may next be taken (00642): the start of the next day where a day''s budget bound, later where the videos or the Library are full. Null: now.';
comment on column public.source_items.taken_at is
  'When its take last spent the day''s budget (00642 source_take_spend): a workspace''s takes and bytes of a day are counted from this, so an item counts once a day however often its fetch is tried.';
comment on column public.source_items.take_tries is
  'How many fetches of it failed (00642): the video platform could not prepare it, or its job stopped. Tried again twice, then failed.';

-- Why an item stands where it does, one of a closed set (contracts SOURCE_ITEM_WHYS), so a screen has words for each.
alter table public.source_items drop constraint if exists source_items_why_check;
alter table public.source_items add constraint source_items_why_check
  check (why is null or why = any (array['budget', 'room', 'library_full', 'videos_off', 'busy', 'folder', 'pace', 'deadline', 'retry', 'lost', 'kind', 'empty', 'too_small', 'unreadable', 'bytes', 'seconds', 'pixels', 'stopped', 'stream', 'not_found']));

-- The clock's read: what waits and is due, whichever workspace's.
create index if not exists source_items_take_due on public.source_items (take_after) where state = 'waiting';
-- One workspace's hand-out: what waits there, newest first.
create index if not exists source_items_waiting on public.source_items (tenant_id, modified_at desc nulls last, id)
  where state = 'waiting';
-- What a workspace has in flight, and what the video platform is preparing for every workspace together.
create index if not exists source_items_taking on public.source_items (tenant_id, kind) where state = 'taking';
-- Bytes already taken, by their provider's own checksum: another item of them shares the file, with no download.
create index if not exists source_items_same_bytes on public.source_items (tenant_id, checksum)
  where checksum is not null and state in ('in', 'let_go');
-- A workspace's day: what it took since the day began.
create index if not exists source_items_taken on public.source_items (tenant_id, taken_at) where taken_at is not null;

/* ------------------------------------------------------------------------------------------ 3. the platform's day -- */

create table if not exists public.source_days (
  day        date primary key,
  bytes      bigint not null default 0 check (bytes >= 0),
  takes      integer not null default 0 check (takes >= 0),
  units      bigint not null default 0 check (units >= 0),
  reads      integer not null default 0 check (reads >= 0),
  updated_at timestamptz not null default now()
);
alter table public.source_days enable row level security;
revoke all on public.source_days from anon, authenticated;
grant all on public.source_days to service_role;
comment on table public.source_days is
  'What taking footage in cost the platform in a day (00642, the footage sources plan''s budgets): the bytes moved from providers, the takes begun, the provider''s units spent and the found reads begun (an account read for its posts), one row a day as Google counts a day (Pacific time). Written only by source_take_spend, source_units_spend and found_read_spend. No workspace and no person on it. The service role''s alone.';

/* ---------------------------------------------------------------------------------------------- 4. the take's job -- */

insert into public.job_kinds (kind, lane, once_parts, once_kept) values
  ('source_take', 2, array['@tenant', 'item_id', 'try'], false)
on conflict (kind) do update
  set lane = excluded.lane, once_parts = excluded.once_parts, once_kept = excluded.once_kept;

/* ------------------------------------------------------------------------------ 5. a watched file is its owner's word -- */

create or replace function public.file_road_is_owners(p_source text)
returns boolean
language sql
immutable
set search_path to 'public'
as $$
  -- An upload, and each provider a folder is watched at (contracts SOURCE_PROVIDERS).
  select p_source in ('upload', 'drive')
$$;

revoke all on function public.file_road_is_owners(text) from public, anon, authenticated;
grant execute on function public.file_road_is_owners(text) to service_role;
comment on function public.file_road_is_owners(text) is
  'Whether a road is the owner''s own word (00642): an upload, which they put there, and a watched folder, which they confirmed. A found road is nobody''s word until a Keep. The one place that says so. Its doors''.';

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
    -- A twin a person kept or set aside: a road brings nothing new; the owner's own word is their word for it again.
    when twin.status <> 'inbox' then case when public.file_road_is_owners(p_source) then 'both_stay' else 'new_goes' end
    -- A waiting twin a post already uses stays where it is.
    when exists (select 1 from public.posts p where p.file_id = twin.id) then
      case when public.file_road_is_owners(p_source) or p_status = 'filed' then 'both_stay' else 'new_goes' end
    -- The owner's own word, or a road that files what it brings (their connected profile), over a twin that only waited.
    when public.file_road_is_owners(p_source) or p_status = 'filed' then 'twin_goes'
    -- Two that wait: the bigger stays, and the one already here where they are alike.
    when coalesce(p_pixels, 0) > coalesce(twin.width::numeric * twin.height, 0) then 'twin_goes'
    else 'new_goes'
  end
  from public.files twin
  where twin.id = p_twin_id;
$$;

revoke all on function public.file_twin_fate(text, text, numeric, uuid) from public, anon, authenticated;
comment on function public.file_twin_fate(text, text, numeric, uuid) is
  'Which of two twins stays (00630), for a newcomer of this source, status and size against the twin by its id: new_goes, twin_goes or both_stay. The owner''s own word (file_road_is_owners, 00642: an upload or a watched folder) is never the one that goes. Its doors''.';

/* --------------------------------------------------------------------------------------- 6. room for a video, once -- */

create or replace function public.files_are_full(p_tenant_id uuid)
returns boolean
language sql
stable
set search_path to 'public'
as $$
  -- contracts FILES_MAX.
  select public.files_toward_cap(p_tenant_id) >= 1000
$$;

revoke all on function public.files_are_full(uuid) from public, anon, authenticated;
grant execute on function public.files_are_full(uuid) to service_role;
comment on function public.files_are_full(uuid) is
  'Whether a workspace''s Library holds its thousand files (00642): the number in one place for the doors that ask it here (file_video_sourced, file_video_found). Its doors''.';

create or replace function public.file_video_room(p_tenant_id uuid, p_seconds numeric)
returns text
language sql
stable
set search_path to 'public'
as $$
  select case
    -- contracts FILE_VIDEO_SECONDS_MAX: longer than AI can watch.
    when p_seconds > 10 * 60 then 'long'
    -- contracts FILE_VIDEO_MINUTES_MAX: a video's own length must fit. One whose road never said its length is let in
    -- on what is known, and judged by its length when the video platform says it (file_media_ready).
    when p_seconds is null and public.video_seconds_toward_cap(p_tenant_id) >= 60 * 60 then 'minutes'
    when public.video_seconds_toward_cap(p_tenant_id) + coalesce(p_seconds, 0) > 60 * 60 then 'minutes'
    else 'room'
  end
$$;

revoke all on function public.file_video_room(uuid, numeric) from public, anon, authenticated;
grant execute on function public.file_video_room(uuid, numeric) to service_role;
comment on function public.file_video_room(uuid, numeric) is
  'Whether a video of this length may come in (00642): long (over ten minutes, more than AI can watch), minutes (the workspace''s sixty would be passed; with no length known, only where they are already full) or room. The one place a video is let in by its length, whichever road brought it. Its doors''.';

/* ---------------------------------------------------------------------------------- 7. a watched folder's clip's row -- */

create or replace function public.file_video_sourced(
  p_tenant_id   uuid,
  p_id          uuid,
  p_item_id     uuid,
  p_media_ref   text,
  p_name        text,
  p_mime        text,
  p_bytes       bigint,
  p_seconds     numeric,
  p_fingerprint text
) returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_held text;
  v_twin uuid;
  v_room text;
begin
  -- One at a time, as every door that names or files takes it (00551).
  perform pg_advisory_xact_lock(hashtextextended(p_tenant_id::text || '|files', 42));
  -- Asked again after a lost answer: the same answer, with the copy the row holds, which may not be this call's.
  select f.media_ref into v_held from public.files f where f.tenant_id = p_tenant_id and f.id = p_id;
  if found then
    return jsonb_build_object('fate', 'kept', 'file_id', p_id, 'media_ref', v_held);
  end if;
  -- The same clip already here, by its bytes' fingerprint whichever road brought it: one file, and one more origin.
  select f.id into v_twin from public.files f
   where f.tenant_id = p_tenant_id and f.fingerprint = p_fingerprint and f.removed_at is null;
  if found then
    return jsonb_build_object('fate', 'here', 'file_id', v_twin);
  end if;
  -- What a person removed is not brought back by the next read of the same place.
  if exists (select 1 from public.files_let_go g where g.tenant_id = p_tenant_id and g.fingerprint = p_fingerprint) then
    return jsonb_build_object('fate', 'let_go', 'file_id', null);
  end if;
  if public.files_are_full(p_tenant_id) then
    return jsonb_build_object('fate', 'full', 'file_id', null);
  end if;
  -- The clip's own length must fit, as every video's: long, minutes or room.
  v_room := public.file_video_room(p_tenant_id, p_seconds);
  -- No copy named: only the judging was asked for, before the video platform is.
  if v_room <> 'room' or p_media_ref is null then
    return jsonb_build_object('fate', v_room, 'file_id', null);
  end if;
  -- Filed at once: confirming the watch was the business's word for what the folder holds.
  insert into public.files (id, tenant_id, status, source, name, mime, bytes, fingerprint, kind, media_ref, media_status,
                            seconds)
  values (p_id, p_tenant_id, 'filed', 'drive', public.file_free_name(p_tenant_id, p_name), p_mime, p_bytes,
          p_fingerprint, 'video', p_media_ref, 'uploading', p_seconds);
  -- The item is this file's origin from the same moment, so a take run again finds the file it began.
  update public.source_items i set file_id = p_id, updated_at = now()
   where i.tenant_id = p_tenant_id and i.id = p_item_id;
  insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
  values (p_tenant_id, 'file.added', 'setup', 'workspace', p_tenant_id,
          jsonb_build_object('file_id', p_id, 'source', 'drive', 'kind', 'video'));
  return jsonb_build_object('fate', 'kept', 'file_id', p_id, 'media_ref', p_media_ref);
end $$;

revoke all on function public.file_video_sourced(uuid, uuid, uuid, text, text, text, bigint, numeric, text) from public, anon, authenticated;
grant execute on function public.file_video_sourced(uuid, uuid, uuid, text, text, text, bigint, numeric, text) to service_role;
comment on function public.file_video_sourced(uuid, uuid, uuid, text, text, text, bigint, numeric, text) is
  'A watched folder''s clip on its way (00642), a sibling of file_video_found that takes the clip''s size and length. With no copy named it only judges, before the video platform is asked: {fate: room, here, let_go, full, minutes or long}. With one it writes the row, uploading and filed, and makes the item its origin: {fate: kept, file_id, media_ref}. Its twin is by its bytes'' fingerprint, as an upload''s. The service role''s.';

/* ------------------------------------------------------------------------- 8. a found video is let in by its length -- */

drop function if exists public.file_video_found(uuid, uuid, text, text, text, text, text, text, text);

create or replace function public.file_video_found(
  p_tenant_id   uuid,
  p_id          uuid,
  p_media_ref   text,
  p_status      text,
  p_source      text,
  p_source_ref  text,
  p_name        text,
  p_mime        text,
  p_fingerprint text,
  p_seconds     numeric default null
) returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_twin uuid;
  v_room text;
begin
  if p_source not in ('website', 'google_profile', 'google_listing', 'instagram') then
    raise exception 'file_video_found: % is not a road', p_source using errcode = '22023';
  end if;
  -- One at a time, as every door that names or files takes it (00551).
  perform pg_advisory_xact_lock(hashtextextended(p_tenant_id::text || '|files', 42));
  -- Asked again after a lost answer: the same answer.
  if exists (select 1 from public.files f where f.tenant_id = p_tenant_id and f.id = p_id) then
    return jsonb_build_object('fate', 'kept', 'file_id', p_id);
  end if;
  -- The same video found again is one file: the one here, filed now if its owner's profile says so.
  select f.id into v_twin from public.files f
   where f.tenant_id = p_tenant_id and f.fingerprint = p_fingerprint and f.removed_at is null;
  if found then
    update public.files f set status = 'filed', updated_at = now()
     where f.id = v_twin and p_status = 'filed' and f.status = 'inbox';
    return jsonb_build_object('fate', 'here', 'file_id', v_twin);
  end if;
  -- What a person removed, or what was passed over as too long, is not brought back by the next read of the same place.
  if exists (select 1 from public.files_let_go g where g.tenant_id = p_tenant_id and g.fingerprint = p_fingerprint) then
    return jsonb_build_object('fate', 'here', 'file_id', null);
  end if;
  if public.files_are_full(p_tenant_id) then
    return jsonb_build_object('fate', 'full', 'file_id', null);
  end if;
  -- Let in by its length where its road says it; one whose road does not is let in on what is known, and judged when
  -- the video platform says its length (file_media_ready).
  v_room := public.file_video_room(p_tenant_id, p_seconds);
  -- No copy named: only the judging was asked for, before the video platform is.
  if v_room <> 'room' or p_media_ref is null then
    return jsonb_build_object('fate', v_room, 'file_id', null);
  end if;
  insert into public.files (id, tenant_id, status, source, source_ref, name, mime, bytes, fingerprint, kind, media_ref,
                            media_status, seconds)
  values (p_id, p_tenant_id, p_status, p_source, p_source_ref, public.file_free_name(p_tenant_id, p_name), p_mime, 0,
          p_fingerprint, 'video', p_media_ref, 'uploading', p_seconds);
  insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
  values (p_tenant_id, 'file.added', 'setup', 'workspace', p_tenant_id,
          jsonb_build_object('file_id', p_id, 'source', p_source, 'kind', 'video'));
  return jsonb_build_object('fate', 'kept', 'file_id', p_id);
end $$;

revoke all on function public.file_video_found(uuid, uuid, text, text, text, text, text, text, text, numeric) from public, anon, authenticated;
grant execute on function public.file_video_found(uuid, uuid, text, text, text, text, text, text, text, numeric) to service_role;
comment on function public.file_video_found(uuid, uuid, text, text, text, text, text, text, text, numeric) is
  'A found video on its way (00626), let in by its length where its road says it (00642, p_seconds). With no copy named it only judges, before the video platform is asked: {fate: room, here, full, minutes or long}. With one it writes the row, uploading, at its road''s status and with its length, so the platform''s word alone can finish it: {fate: kept, file_id}. Its twin is by fingerprint (the road''s name for it, hashed). The service role''s.';

/* ----------------------------------------------------------------- 9. a found video judged as the platform says it -- */

create or replace function public.file_media_ready(p_media_ref text, p_seconds numeric, p_width integer, p_height integer)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_row  public.files;
  v_made boolean := false;
  v_room text;
  v_left text;
begin
  select * into v_row from public.files f where f.media_ref = p_media_ref;
  if not found then
    return jsonb_build_object('fate', 'unknown');
  end if;
  perform pg_advisory_xact_lock(hashtextextended(v_row.tenant_id::text || '|files', 42));
  select * into v_row from public.files f where f.id = v_row.id for update;
  if v_row.removed_at is not null then
    return jsonb_build_object('fate', 'gone', 'tenant_id', v_row.tenant_id, 'file_id', v_row.id);
  end if;
  -- Delivered again: what was done is done.
  if v_row.media_status in ('ready', 'failed') then
    return jsonb_build_object('fate', 'repeated', 'tenant_id', v_row.tenant_id, 'file_id', v_row.id);
  end if;
  -- A video whose road never said its length is judged by it now (00642), by the one rule every road's door asks: one
  -- longer than AI can watch, or with no room left in the minutes, is passed over. It is removed as a twin is (nothing
  -- a person kept: it only just arrived), keeping why and the length it turned out to have, and its purge lets the
  -- copy go. A found one is counted on its road's line, so the owner is told, and a long one is let go by its road's
  -- name for it, so the next read of the same place does not fetch it again. A watched folder's clip (its provider
  -- had not measured it) is its item's to settle: the caller ends the item as too long, or has it wait for room.
  if v_row.seconds is null and p_seconds is not null
     and v_row.source in ('website', 'google_profile', 'google_listing', 'instagram', 'drive') then
    v_room := public.file_video_room(v_row.tenant_id, p_seconds);
    if v_room <> 'room' then
      update public.files f
         set removed_at = now(), updated_at = now(), seconds = p_seconds,
             media_error = case v_room when 'long' then 'too_long' else 'no_room' end
       where f.id = v_row.id;
      insert into public.jobs (tenant_id, kind, due_at, payload)
      values (v_row.tenant_id, 'file_purge', now(), jsonb_build_object('file_id', v_row.id, 'why', 'remove'))
      on conflict do nothing;
      if v_room = 'long' and v_row.source <> 'drive' then
        insert into public.files_let_go (tenant_id, fingerprint) values (v_row.tenant_id, v_row.fingerprint)
        on conflict do nothing;
      end if;
      -- What its road's line counts it as (contracts content/sources.ts): too long to watch, or left for want of room.
      -- And it is one video fewer that came: the line counted it as it was let in.
      v_left := case v_room when 'long' then 'long_videos' else 'left_videos' end;
      update public.imports i
         set counts = i.counts || jsonb_build_object(
               v_left, coalesce((i.counts ->> v_left)::numeric, 0) + 1,
               'videos', greatest(coalesce((i.counts ->> 'videos')::numeric, 0) - 1, 0))
       where i.tenant_id = v_row.tenant_id and i.connection_id is null
         and i.source = case v_row.source when 'website' then 'website_media' when 'instagram' then 'instagram' end;
      insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
      values (v_row.tenant_id, 'file.removed', 'setup', 'workspace', v_row.tenant_id,
              jsonb_build_object('file_id', v_row.id, 'why', v_room));
      return jsonb_build_object('fate', 'passed', 'why', v_room, 'tenant_id', v_row.tenant_id, 'file_id', v_row.id);
    end if;
  end if;
  update public.files f
     set media_status = 'ready',
         seconds = coalesce(p_seconds, f.seconds),
         width = coalesce(p_width, f.width),
         height = coalesce(p_height, f.height),
         ready_at = now(),
         look_status = 'waiting',
         looked_at = now(),
         updated_at = now()
   where f.id = v_row.id;
  -- As text: a job's once-only key is made of strings (job_dedupe_key_of).
  insert into public.jobs (tenant_id, kind, due_at, payload)
  values (v_row.tenant_id, 'video_digest', now(),
          jsonb_build_object('file_id', v_row.id, 'step', 'sheet', 'edition', '1'));
  -- A video made here (00613): playable is made. Found by the file, so one whose bytes were a file already follows it too.
  update public.pieces p set status = 'made', made_at = now(), machine = null, updated_at = now()
   where p.tenant_id = v_row.tenant_id and p.file_id = v_row.id and p.status = 'making';
  v_made := found;
  return jsonb_build_object('fate', 'ready', 'tenant_id', v_row.tenant_id, 'file_id', v_row.id, 'made', v_made);
end $$;

revoke all on function public.file_media_ready(text, numeric, integer, integer) from public, anon, authenticated;
grant execute on function public.file_media_ready(text, numeric, integer, integer) to service_role;
comment on function public.file_media_ready(text, numeric, integer, integer) is
  'The video platform says a video is playable (00556): found by its id there, made a file whether or not the browser said done, and its digest''s first step put on the ledger. A video made here is its piece made (00613: `made`). A video whose road never said its length (a found one, or a watched folder''s clip its provider had not measured) is judged by it here (00642, file_video_room): one too long or with no room is passed over and removed, a found one counted on its road''s line. Answers {fate: ready, repeated, gone, unknown or passed (why: long or minutes), tenant_id, file_id, made}. The service role''s.';

/* ----------------------------------------------------------------------------------- 10. what waits is handed its job -- */

drop function if exists public.source_takes_hand_out(integer, integer, integer);

create or replace function public.source_takes_hand_out(
  p_tenant_id     uuid,
  p_in_flight     integer,
  p_limit         integer,
  p_stale_seconds integer,
  p_videos_max    integer
) returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_ids    uuid[];
  v_flying integer;
  v_videos integer;
  v_handed integer;
begin
  -- The off switch: a paused kind is handed nothing, so no item flips to taking and back while its jobs wait.
  if exists (select 1 from public.job_kinds k where k.kind = 'source_take' and k.paused_at is not null) then
    return 0;
  end if;
  -- A take that never ended (its job lost, or stopped before it wrote anything) waits again, and says it was lost:
  -- its next take first clears a copy it may have left at the video platform. One whose clip is on its way there is
  -- the video platform's to finish, and is left. One that holds any other file (it was in, left its folder and came
  -- back, 00641) waits again too: its next take finds that file and is in with it.
  update public.source_items i
     set state = 'waiting', why = 'lost', take_after = null, updated_at = now()
   where i.state = 'taking'
     and (i.file_id is null or not exists (
            select 1 from public.files f
             where f.id = i.file_id and f.removed_at is null and f.media_status in ('uploading', 'processing')))
     and (p_tenant_id is null or i.tenant_id = p_tenant_id)
     and i.updated_at < now() - make_interval(secs => greatest(p_stale_seconds, 0));
  if p_tenant_id is not null then
    -- One workspace, as a take of its ends or a read finds new files: what it may still have in flight, newest first.
    select count(*) into v_flying from public.source_items i where i.tenant_id = p_tenant_id and i.state = 'taking';
    select array_agg(c.id order by c.place) into v_ids
      from (
        select i.id, row_number() over (order by i.modified_at desc nulls last, i.id) as place
          from public.source_items i
          join public.media_sources s on s.id = i.source_id
         where i.tenant_id = p_tenant_id and i.state = 'waiting' and i.kind in ('image', 'video')
           and (i.take_after is null or i.take_after <= now())
           and (i.length_until is null or i.length_until <= now())
           and s.state in ('setting_up', 'watching')
         order by i.modified_at desc nulls last, i.id
         limit greatest(greatest(p_in_flight, 1) - v_flying, 0)
      ) c;
  else
    -- Every workspace, on the clock: each one's due items newest first, as far as it has room in flight.
    select array_agg(c.id order by c.place, c.id) into v_ids
      from (
        select d.id, d.place
          from (
            select i.id, i.tenant_id,
                   row_number() over (partition by i.tenant_id order by i.modified_at desc nulls last, i.id) as place
              from public.source_items i
              join public.media_sources s on s.id = i.source_id
             where i.state = 'waiting' and i.kind in ('image', 'video')
               and (i.take_after is null or i.take_after <= now())
               and (i.length_until is null or i.length_until <= now())
               and s.state in ('setting_up', 'watching')
          ) d
          left join (
            select i.tenant_id, count(*) as flying from public.source_items i where i.state = 'taking' group by i.tenant_id
          ) f on f.tenant_id = d.tenant_id
         where d.place <= greatest(p_in_flight, 1) - coalesce(f.flying, 0)
         order by d.place, d.id
         limit greatest(p_limit, 1)
      ) c;
  end if;
  -- How many more clips the video platform may be handed: it prepares so many at once for the whole account, and
  -- answers the rest "too many" (its own limit; the setting is the edge's, under it).
  select greatest(p_videos_max, 0) - count(*) into v_videos
    from public.source_items i where i.state = 'taking' and i.kind = 'video';
  -- Each one moved to taking and given its job in one statement: a row is never taking without a job, and the kind's
  -- own key (the item and its try) holds it to one. A clip past the video platform's room waits for the next turn.
  with candidates as (
    select c.id, i.kind,
           count(*) filter (where i.kind = 'video') over (order by c.place) as videos_so_far
      from unnest(v_ids) with ordinality as c(id, place)
      join public.source_items i on i.id = c.id
  ),
  taken as (
    update public.source_items i
       set state = 'taking', why = case when i.why = 'lost' then 'lost' end, take_after = null, updated_at = now()
      from candidates c
     where i.id = c.id and i.state = 'waiting' and (c.kind <> 'video' or c.videos_so_far <= v_videos)
    returning i.id, i.tenant_id, i.take_tries
  )
  insert into public.jobs (tenant_id, kind, due_at, payload)
  select t.tenant_id, 'source_take', now(),
         jsonb_build_object('item_id', t.id::text, 'try', t.take_tries::text)
    from taken t
  on conflict do nothing;
  get diagnostics v_handed = row_count;
  return v_handed;
end $$;

revoke all on function public.source_takes_hand_out(uuid, integer, integer, integer, integer) from public, anon, authenticated;
grant execute on function public.source_takes_hand_out(uuid, integer, integer, integer, integer) to service_role;
comment on function public.source_takes_hand_out(uuid, integer, integer, integer, integer) is
  'The takes'' hand-out (00642, decision 0115): each waiting photo or video whose time has come, of a folder still being read, moved to taking (a video its provider has not measured waits until its length_until, 00641) and given its source_take job in one statement, newest first. For one workspace (p_tenant_id, as a take of its ends) or for all (null, the clock), while a workspace has fewer than p_in_flight in flight, p_limit in all, and the video platform is preparing fewer than p_videos_max clips. A paused kind is handed nothing. A take that never ended (taking, untouched for p_stale_seconds, with no file or one that is not a clip on its way at the video platform) waits again first, marked lost. Answers how many jobs it wrote. The service role''s.';

/* ------------------------------------------------------------------------ 10b. freed room releases what waited for it -- */

create or replace function public.source_takes_release()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  -- A file left the Library, so there is room again: what waited for room in the Library, and for room in the videos
  -- where it was a video, is due now, and the hand-out's next turn takes it. Hours sooner than its rest would end.
  update public.source_items i
     set take_after = null
   where i.tenant_id = new.tenant_id and i.state = 'waiting'
     and (i.why = 'library_full' or (new.kind = 'video' and i.why = 'room'));
  return null;
end $$;

revoke all on function public.source_takes_release() from public, anon, authenticated;
comment on function public.source_takes_release() is
  'A trigger on files (00642): a file removed frees room, so the workspace''s items that waited for room in the Library (and in the videos, where a video left) are due at once. Whoever removed it: a person, a twin, a failed copy.';

drop trigger if exists source_takes_release on public.files;
create trigger source_takes_release
  after update of removed_at on public.files
  for each row
  when (old.removed_at is null and new.removed_at is not null)
  execute function public.source_takes_release();

/* ----------------------------------------------------------------------------------------- 11. the day's budgets -- */

create or replace function public.source_take_spend(
  p_tenant_id            uuid,
  p_item_id              uuid,
  p_bytes                bigint,
  p_units                bigint,
  p_platform_bytes_max   bigint,
  p_workspace_bytes_max  bigint,
  p_workspace_takes_max  integer,
  p_units_max            bigint
) returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  -- Google counts a day in Pacific time, so the day here begins and ends with Google's.
  v_day     date := (now() at time zone 'America/Los_Angeles')::date;
  v_from    timestamptz := v_day::timestamp at time zone 'America/Los_Angeles';
  v_until   timestamptz := (v_day + 1)::timestamp at time zone 'America/Los_Angeles';
  v_counted boolean;
  v_takes   integer;
  v_bytes   bigint;
  v_spent   public.source_days;
begin
  -- One at a time a workspace, so two takes at once cannot both fit the last of its day.
  perform pg_advisory_xact_lock(hashtextextended(p_tenant_id::text || '|takes', 42));
  select coalesce(i.taken_at >= v_from, false) into v_counted from public.source_items i
   where i.tenant_id = p_tenant_id and i.id = p_item_id;
  if not found then
    return jsonb_build_object('fate', 'unknown');
  end if;
  insert into public.source_days (day) values (v_day) on conflict (day) do nothing;
  select * into v_spent from public.source_days d where d.day = v_day for update;
  if v_spent.units + greatest(p_units, 0) > p_units_max then
    return jsonb_build_object('fate', 'wait', 'binds', 'units', 'until', v_until);
  end if;
  if v_spent.bytes + greatest(p_bytes, 0) > p_platform_bytes_max then
    return jsonb_build_object('fate', 'wait', 'binds', 'platform_bytes', 'until', v_until);
  end if;
  -- An item counts once a day in its workspace: a fetch tried again does not spend the business's day twice. The
  -- platform's bytes are counted every time, since every fetch is a download.
  if not v_counted then
    select count(*), coalesce(sum(i.bytes), 0) into v_takes, v_bytes from public.source_items i
     where i.tenant_id = p_tenant_id and i.taken_at >= v_from;
    if v_takes + 1 > p_workspace_takes_max then
      return jsonb_build_object('fate', 'wait', 'binds', 'workspace_takes', 'until', v_until);
    end if;
    if v_bytes + greatest(p_bytes, 0) > p_workspace_bytes_max then
      return jsonb_build_object('fate', 'wait', 'binds', 'workspace_bytes', 'until', v_until);
    end if;
    update public.source_items i set taken_at = now(), bytes = greatest(p_bytes, 0)
     where i.tenant_id = p_tenant_id and i.id = p_item_id;
  end if;
  -- The units are only judged here (p_units is what this take's download will still cost): each is counted where it
  -- is spent, by source_units_spend.
  update public.source_days d
     set bytes = d.bytes + greatest(p_bytes, 0), takes = d.takes + 1, updated_at = now()
   where d.day = v_day;
  return jsonb_build_object('fate', 'go');
end $$;

revoke all on function public.source_take_spend(uuid, uuid, bigint, bigint, bigint, bigint, integer, bigint) from public, anon, authenticated;
grant execute on function public.source_take_spend(uuid, uuid, bigint, bigint, bigint, bigint, integer, bigint) to service_role;
comment on function public.source_take_spend(uuid, uuid, bigint, bigint, bigint, bigint, integer, bigint) is
  'A take''s budget, spent or refused (00642, the footage sources plan''s D15): the platform''s bytes and units of the day (source_days) and the workspace''s takes and bytes of the day (counted from source_items.taken_at), a day as Google counts one. Every number is the caller''s setting. It counts the bytes and the take; the units it only judges (p_units is what the take will still spend), since source_units_spend counts each where it is spent. Answers {fate: go}, {fate: wait, binds: units, platform_bytes, workspace_takes or workspace_bytes, until: when the next day begins}, or {fate: unknown} for an item that is not this workspace''s. The service role''s.';

create or replace function public.source_units_spend(p_units bigint)
returns bigint
language sql
security definer
set search_path to 'public'
as $$
  insert into public.source_days (day, units)
  values ((now() at time zone 'America/Los_Angeles')::date, greatest(p_units, 0))
  on conflict (day) do update
    set units = public.source_days.units + excluded.units, updated_at = now()
  returning units
$$;

revoke all on function public.source_units_spend(bigint) from public, anon, authenticated;
grant execute on function public.source_units_spend(bigint) to service_role;
comment on function public.source_units_spend(bigint) is
  'A provider''s units counted as they are spent (00642): added to the day''s row (source_days), a day as Google counts one. Answers the day''s units so far. The service role''s.';

/* ------------------------------------------------------------------------------- 12. a found read's pace and budget -- */

create or replace function public.found_read_spend(
  p_tenant_id     uuid,
  p_source        text,
  p_account       text,
  p_workspace_max integer,
  p_platform_max  integer
) returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  -- The platform's day is Google's, as a take's is: one row holds both.
  v_day   date := (now() at time zone 'America/Los_Angeles')::date;
  v_until timestamptz := (v_day + 1)::timestamp at time zone 'America/Los_Angeles';
  v_row   public.imports;
  v_reads jsonb;
  v_last  timestamptz;
  v_first timestamptz;
  v_count integer;
  v_spent integer;
  v_since timestamptz;
begin
  if p_source <> 'instagram' then
    raise exception 'found_read_spend: % is not a read that is paced', p_source using errcode = '22023';
  end if;
  -- One at a time a workspace, so two pastes at once cannot both be the last of its day.
  perform pg_advisory_xact_lock(hashtextextended(p_tenant_id::text || '|reads', 42));
  select * into v_row from public.imports i
   where i.tenant_id = p_tenant_id and i.source = p_source and i.connection_id is null;
  -- The reads asked for in the last day, each its account and when: older ones are dropped as the row is written.
  select coalesce(jsonb_agg(r.entry order by r.entry ->> 'at'), '[]'::jsonb) into v_reads
    from jsonb_array_elements(
           case when jsonb_typeof(v_row.job_cursor -> 'reads') = 'array' then v_row.job_cursor -> 'reads' else '[]'::jsonb end
         ) as r(entry)
   where (r.entry ->> 'at')::timestamptz > now() - interval '1 day';
  select max((r.entry ->> 'at')::timestamptz) into v_last
    from jsonb_array_elements(v_reads) as r(entry) where r.entry ->> 'account' = p_account;
  -- Read inside the day: nothing is spent, and the answer says when and what came. One whose last read stopped may be
  -- asked again, and is counted as a read of the workspace's day like any other.
  if v_last is not null and not coalesce(v_row.via = p_account and v_row.state = 'failed', false) then
    return jsonb_build_object(
      'fate', 'read_lately', 'read_at', v_last,
      'state', case when v_row.via = p_account then v_row.state end,
      'counts', case when v_row.via = p_account then v_row.counts else '{}'::jsonb end);
  end if;
  select count(*), min((r.entry ->> 'at')::timestamptz) into v_count, v_first from jsonb_array_elements(v_reads) as r(entry);
  if v_count >= p_workspace_max then
    return jsonb_build_object('fate', 'wait', 'binds', 'workspace_reads', 'until', v_first + interval '1 day');
  end if;
  insert into public.source_days (day) values (v_day) on conflict (day) do nothing;
  select d.reads into v_spent from public.source_days d where d.day = v_day for update;
  if v_spent + 1 > p_platform_max then
    return jsonb_build_object('fate', 'wait', 'binds', 'platform_reads', 'until', v_until);
  end if;
  update public.source_days d set reads = d.reads + 1, updated_at = now() where d.day = v_day;
  -- Only what is newer than this account's last read, where that read finished and left nothing behind: one that left
  -- something (the videos or the Library were full) is read whole again, so what it left can come once there is room.
  v_since := case
    when v_row.via = p_account and v_row.state = 'done'
     and coalesce((v_row.counts ->> 'left_videos')::numeric, 0) + coalesce((v_row.counts ->> 'left_files')::numeric, 0) = 0
    then v_row.started_at end;
  v_reads := v_reads || jsonb_build_array(jsonb_build_object('account', p_account, 'at', now()));
  insert into public.imports as i (tenant_id, source, state, counts, via, job_cursor)
  values (p_tenant_id, p_source, 'queued', '{}'::jsonb, p_account, jsonb_build_object('reads', v_reads))
  on conflict (tenant_id, source, connection_id) do update
    set job_cursor = coalesce(i.job_cursor, '{}'::jsonb) || jsonb_build_object('reads', v_reads);
  return jsonb_build_object('fate', 'go', 'since', v_since);
end $$;

revoke all on function public.found_read_spend(uuid, text, text, integer, integer) from public, anon, authenticated;
grant execute on function public.found_read_spend(uuid, text, text, integer, integer) to service_role;
comment on function public.found_read_spend(uuid, text, text, integer, integer) is
  'A found read''s pace and budget, spent or refused (00642, the footage sources plan''s D21): an account is read once in a day, a workspace asks for p_workspace_max reads in a day (kept on its imports row, job_cursor.reads), and the platform for p_platform_max (source_days.reads, a day as Google counts one). Answers {fate: go, since: when this account''s last whole read began, or null to read it whole}, {fate: read_lately, read_at, state, counts} with nothing spent, or {fate: wait, binds: workspace_reads or platform_reads, until}. An account whose last read stopped may be asked again. The service role''s.';

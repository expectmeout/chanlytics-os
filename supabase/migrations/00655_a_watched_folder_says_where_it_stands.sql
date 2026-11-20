-- A watched folder says where it stands (the footage sources plan's P5, the screens, 19 November 2026).
--
-- The screens a business reads of its watched folder (the row in Settings, Content's card, the Library's line, a clip
-- opened) say one thing each, from one place. What they count is counted here, from the folder's own list, and never
-- kept a second time.
--
--   source_items_tally        a folder's files where they stand: found, in the Library, on their way, landed today,
--                             and waiting for a day's allowance, room in the videos, room in the Library or the
--                             workspace's video switch. A member's own read (the tables' rule decides), one statement.
--   source_items_passed       what a folder holds that is not in the Library, by its state and cause, counted, with
--                             the file's name where it is one: what its sheet lists. A member's own read.
--   source_files_tally        what came from a workspace's watched folders and is still in its Library: how many, how
--                             many clips are kept with their provider, and how many a post or a video used. What a
--                             stop and a disconnect say before the press. The service role's.
--
--   workspace_tell_update     (on files) a copy let go, asked for, back or lost is a change a page draws: an open
--                             page hears it, so a clip coming back plays by itself and its row says where it stands.
--   file_video_begin          an upload that meets a watched clip whose copy is away or lost hands it its
--                             reservation: the clip is coming back by the bytes its owner gave again (fate back).
--                             Until this the bytes were dropped, as any twin's are, and the clip stayed lost.
--   files_copies_awaiting_room  the copies that were asked for and found no room, by when: what the half-hourly pass
--                             asks for again, so a clip comes back by itself once another makes room. Few rows.
--
-- Deploy order: this migration first. The new fate is answered only to an edge that knows it: an older edge would
-- read `back` as no fate at all and refuse the upload, so the edge deploys after. The reads are asked only by the new
-- dashboard, and nothing older names one.
-- Re-runnable throughout.

set local lock_timeout = '3s';

/* -------------------------------------------------------------------------------- 1. a folder's files, counted -- */

create or replace function public.source_items_tally(p_tenant_id uuid, p_source_id uuid)
returns jsonb
language sql
stable
set search_path to 'public'
as $$
  -- What was asked for and is not in yet: a first watch's fifty, or what arrived since. Few rows, by the state's index.
  with moving as (
    select i.state, i.why
      from public.source_items i
     where i.tenant_id = p_tenant_id and i.source_id = p_source_id
       and i.state = any (array['waiting', 'taking'])
  ),
  -- Google counts a day in Pacific time, and a workspace's takes of a day are counted in the same day (00643).
  today as (
    select ((now() at time zone 'America/Los_Angeles')::date)::timestamp at time zone 'America/Los_Angeles' as began
  )
  select jsonb_build_object(
    -- Photos and videos still where they were: every row but those gone, moved out or unreadable, less the folders.
    'found', (select count(*) from public.source_items i
               where i.tenant_id = p_tenant_id and i.source_id = p_source_id
                 and i.state <> all (array['gone', 'outside', 'no_access']))
           - (select count(*) from public.source_items i
               where i.source_id = p_source_id and i.kind = 'folder' and i.tenant_id = p_tenant_id
                 and i.state <> all (array['gone', 'outside', 'no_access'])),
    'in', (select count(*) from public.source_items i
            where i.tenant_id = p_tenant_id and i.source_id = p_source_id and i.state = 'in'),
    -- On their way: being taken, or waiting for nothing but their turn (a try again, the provider's pace).
    'coming', (select count(*) from moving m
                where m.state = 'taking' or m.why is null
                   or m.why <> all (array['budget', 'room', 'library_full', 'videos_off', 'folder'])),
    -- Landed today: what the day's takes brought in, so "12 of 40" is twelve of today's forty.
    'landed', (select count(*) from public.source_items i, today t
                where i.tenant_id = p_tenant_id and i.taken_at >= t.began
                  and i.source_id = p_source_id and i.state = 'in'),
    'budget', (select count(*) from moving m where m.state = 'waiting' and m.why = 'budget'),
    'room', (select count(*) from moving m where m.state = 'waiting' and m.why = 'room'),
    'library_full', (select count(*) from moving m where m.state = 'waiting' and m.why = 'library_full'),
    'videos_off', (select count(*) from moving m where m.state = 'waiting' and m.why = 'videos_off')
  );
$$;

revoke all on function public.source_items_tally(uuid, uuid) from public, anon;
grant execute on function public.source_items_tally(uuid, uuid) to authenticated, service_role;
comment on function public.source_items_tally(uuid, uuid) is
  'A watched folder''s files counted where they stand (00655, the footage sources plan''s screens): found (photos and videos still where they were), in (in the Library), coming (being taken, or waiting only for their turn), landed (in, and counted in today''s takes, a day as Google counts one), and those waiting for a day''s allowance (budget), room in the videos (room), room in the Library (library_full) or the workspace''s video switch (videos_off). Counted from the folder''s own list and kept nowhere. Runs as its caller: a member reads their own workspace''s rows, and another''s count nothing.';

create or replace function public.source_items_passed(p_tenant_id uuid, p_source_id uuid)
returns jsonb
language sql
stable
set search_path to 'public'
as $$
  -- Everything of the folder that is not in the Library and not a folder, by where it stands and why. A cause's one
  -- file is named, so its sentence can name it.
  select coalesce(jsonb_agg(jsonb_build_object(
           'state', g.state, 'why', g.why, 'videos', g.videos, 'photos', g.photos,
           'name', case when g.videos + g.photos = 1 then g.name end)
           order by g.state, g.why nulls first), '[]'::jsonb)
    from (select i.state, i.why,
                 count(*) filter (where i.kind = 'video') as videos,
                 count(*) filter (where i.kind <> 'video') as photos,
                 min(i.name) as name
            from public.source_items i
           where i.tenant_id = p_tenant_id and i.source_id = p_source_id
             and i.state = any (array['listed', 'waiting', 'taking', 'too_big', 'not_media', 'failed', 'gone', 'outside', 'no_access'])
             and i.kind <> 'folder'
           group by i.state, i.why) g;
$$;

revoke all on function public.source_items_passed(uuid, uuid) from public, anon;
grant execute on function public.source_items_passed(uuid, uuid) to authenticated, service_role;
comment on function public.source_items_passed(uuid, uuid) is
  'What a watched folder holds that is not in the Library (00655), by its state and cause: [{state, why, videos, photos, name}], name only where the group is one file. What the folder''s sheet lists: what waits, what was passed over, what could not be brought in, what was only listed. Runs as its caller: a member reads their own workspace''s rows.';

create or replace function public.source_files_tally(p_tenant_id uuid)
returns jsonb
language sql
stable
set search_path to 'public'
as $$
  select jsonb_build_object(
    'files', count(*),
    'away', count(*) filter (where f.kind = 'video' and f.copy_state <> 'here'),
    'used', count(*) filter (where public.file_was_used(f.tenant_id, f.id)))
    from public.files f
   where f.tenant_id = p_tenant_id and public.file_road_is_watched(f.source) and f.removed_at is null;
$$;

revoke all on function public.source_files_tally(uuid) from public, anon, authenticated;
grant execute on function public.source_files_tally(uuid) to service_role;
comment on function public.source_files_tally(uuid) is
  'What came from a workspace''s watched folders and is still in its Library (00655): files (how many), away (clips whose copy is not at the video platform now, so they play only while a folder is watched), used (those a post or a video used, which stay whatever becomes of their folder). What a stop and a disconnect say before the press. The service role''s.';

/* ------------------------------------------------------------------- 2. a copy that waits for room is found -- */

create index if not exists files_copies_awaiting_room on public.files (updated_at)
  where copy_state = 'away' and copy_why = 'room';

/* ------------------------------------------------------------------ 3. a page hears where a clip's copy stands -- */

-- A copy let go, asked for, back or lost is a change a page draws: its row, and the clip opened.
drop trigger if exists workspace_tell_update on public.files;
create trigger workspace_tell_update after update of status, name, shows, who_in_it, look_status, look, removed_at,
                                                     media_status, sound_said, copy_state, copy_why on public.files
  for each row
  when (old.status is distinct from new.status or old.name is distinct from new.name or old.shows is distinct from new.shows
        or old.who_in_it is distinct from new.who_in_it or old.look_status is distinct from new.look_status
        or old.look is distinct from new.look or old.removed_at is distinct from new.removed_at
        or old.media_status is distinct from new.media_status or old.sound_said is distinct from new.sound_said
        or old.copy_state is distinct from new.copy_state or old.copy_why is distinct from new.copy_why)
  execute function public.workspace_tell_row_change();

/* ------------------------------------------------- 4. an upload that meets a clip kept elsewhere brings it back -- */

create or replace function public.file_video_begin(p_tenant_id uuid, p_id uuid, p_media_ref text, p_name text, p_mime text, p_bytes bigint, p_fingerprint text, p_seconds numeric, p_actor uuid default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_twin   uuid;
  v_status text;
  v_held   text;
  v_used   numeric;
  v_back   numeric;
begin
  -- One at a time, as every door that names or files takes it (00551).
  perform pg_advisory_xact_lock(hashtextextended(p_tenant_id::text || '|files', 42));
  -- Asked again after a lost answer: the same answer, with the reservation the row holds, which may not be this one.
  select f.media_ref into v_held from public.files f where f.tenant_id = p_tenant_id and f.id = p_id;
  if found then
    return jsonb_build_object('fate', 'kept', 'file_id', p_id, 'media_ref', v_held);
  end if;
  -- The same clip twice is one file: the one already here, which a person may still be waiting to see.
  select f.id, f.media_status into v_twin, v_status from public.files f
   where f.tenant_id = p_tenant_id and f.fingerprint = p_fingerprint and f.removed_at is null;
  if found and v_status is distinct from 'uploading' then
    -- A watched folder's clip its owner uploaded too (00654): theirs from now on, as any upload. Its copy is never let
    -- go, and a folder's cleanup never removes it.
    update public.files f set owner_uploaded = true, updated_at = now()
     where f.id = v_twin and public.file_road_is_watched(f.source) and not f.owner_uploaded;
    -- Its copy is not at the video platform: let go, or its original gone from its folder (00655). These bytes are the
    -- same clip's, so they bring it back: the reservation becomes its copy, coming back, and the platform's word
    -- finishes it as it finishes any return (file_media_ready: here again, and nothing else). Where the videos have no
    -- room for it that is said as for any upload, and nothing changes.
    select f.seconds into v_back from public.files f
     where f.id = v_twin and f.kind = 'video' and public.file_road_is_watched(f.source)
       and f.copy_state = any (array['away', 'lost']) and f.media_status = 'ready';
    if found then
      if public.file_video_room(p_tenant_id, coalesce(v_back, p_seconds)) = 'minutes' then
        return jsonb_build_object('fate', 'minutes', 'file_id', null);
      end if;
      update public.files f
         set copy_state = 'returning', copy_why = null, media_ref = p_media_ref, updated_at = now()
       where f.id = v_twin;
      return jsonb_build_object('fate', 'back', 'file_id', v_twin);
    end if;
    return jsonb_build_object('fate', 'here', 'file_id', v_twin);
  end if;
  -- One whose bytes never all went, picked again where its upload could not go on: this one takes its place, and the purge
  -- lets the other's reservation go.
  if found then
    update public.files f set removed_at = now(), updated_at = now() where f.id = v_twin;
    insert into public.jobs (tenant_id, kind, due_at, payload)
    values (p_tenant_id, 'file_purge', now(), jsonb_build_object('file_id', v_twin, 'why', 'remove'));
  end if;
  -- contracts FILES_MAX.
  if public.files_toward_cap(p_tenant_id) >= 1000 then
    return jsonb_build_object('fate', 'full', 'file_id', null);
  end if;
  -- contracts FILE_VIDEO_MINUTES_MAX: what is kept and what is on its way, together.
  v_used := public.video_seconds_toward_cap(p_tenant_id);
  if v_used + coalesce(p_seconds, 0) > 60 * 60 then
    return jsonb_build_object('fate', 'minutes', 'file_id', null);
  end if;
  insert into public.files (id, tenant_id, status, source, name, mime, bytes, fingerprint, kind, media_ref, media_status,
                            seconds, created_by)
  values (p_id, p_tenant_id, 'filed', 'upload', public.file_free_name(p_tenant_id, p_name), p_mime, p_bytes,
          p_fingerprint, 'video', p_media_ref, 'uploading', p_seconds, p_actor);
  insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
  values (p_tenant_id, 'file.added', 'setup', 'workspace', p_tenant_id,
          jsonb_build_object('file_id', p_id, 'source', 'upload', 'kind', 'video', 'by', p_actor));
  return jsonb_build_object('fate', 'kept', 'file_id', p_id);
end $$;

revoke all on function public.file_video_begin(uuid, uuid, text, text, text, bigint, text, numeric, uuid) from public, anon, authenticated;
grant execute on function public.file_video_begin(uuid, uuid, text, text, text, bigint, text, numeric, uuid) to service_role;
comment on function public.file_video_begin(uuid, uuid, text, text, text, bigint, text, numeric, uuid) is
  'A member''s video on its way (00556), once the video platform holds its reservation: the row, uploading, with every fact the browser gave, so the platform''s word alone can finish it. Answers {fate: kept, here, back, full or minutes, file_id}. The service role''s. An upload that meets a watched folder''s clip as its twin marks it its owner''s (00654, owner_uploaded); where that clip''s copy is away or lost, the upload''s reservation becomes its copy, coming back (00655, fate back), so the bytes its owner gave again are what it plays from.';

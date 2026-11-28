-- 00729 · A made video is always shelved (lane 1 of the "Prove it works" plan, 28 November 2026; the outside
-- video-archive review's R1.1, R1.4 and R1.5, checked against main at 004ac4b1c4).
--
-- 00695 gave a made video a copy on Chanlytics' own shelf, begun as the video is made. Three ways it stopped short:
-- a video whose run ended between "sent" and its copy's first step, whose call failed, whose shelf was full or who was
-- made before the shelf, had no row and nothing read for one; a copy that failed and was tried again came back
-- without being counted against the shelf's room; and a return that met a copy being put back waited for a person to
-- press again. The rules that close them:
--
--   file_shelf_seconds        New: the shelf's room, counted once. What is on a workspace's shelf and what is on its
--                             way there (saving, saved, checked), of files still there. file_shelf_begin,
--                             file_shelf_again and file_shelf_owed read it, and nothing counts it another way.
--   file_shelf_begin          Re-made from the snapshot's own text: its room is file_shelf_seconds. Same signature,
--                             same answers.
--   file_shelf_again          Re-made with one optional input, p_seconds_max: a FAILED copy comes back only where it
--                             fits (a checked one found missing is counted already). Called with two inputs, as the
--                             code live today does, it is as it was. Not for a copy with no piece (file_shelf_unkept).
--   file_shelf_checked        Re-made: a copy that becomes checked while its video is away, and was asked for and left
--                             waiting on it (copy_why unreadable), puts that return's job back on the ledger in the
--                             same step. Same signature, same answers.
--   file_shelf_owed           New: what the shelf is owed, for every workspace in one statement. The made videos with
--                             no shelf copy's row that fit, newest first, in workspaces whose switch is on; the
--                             copies the shelf refused, to try again; and how many videos a full shelf is holding
--                             back, in how many workspaces. A read: the half-hourly pass begins each through the
--                             doors above, under its workspace's own lock.
--   file_shelf_unkept         New: a made video whose own kept file is gone can be given no copy. Its row says so
--                             (failed, not_found, no piece), once, so the pass does not ask for it again.
--   file_archives_shelf_refused, files_made_videos
--                             Two indexes, each only what file_shelf_owed reads: the copies the shelf refused, by how
--                             long (few rows); and the videos made here and still there, so the statement never reads
--                             a workspace's photos. Timed on an engine at 1,000 workspaces of 100 made videos and 400
--                             photos: 163 ms a pass, both sides read from their indexes alone.
--
-- No table, column, trigger, policy, job kind or event kind. Each door that writes keeps writing file_shelf.moved
-- beside its write (00723).
--
-- Deploy order: apply first, then either. The doors re-made keep their answers, and file_shelf_again keeps taking the
-- two inputs the code live today sends; the two new doors are called only by the edge this change ships with.
-- Re-runnable throughout.

set local lock_timeout = '3s';

/* ------------------------------------------------------------------------------- 1. the shelf's room, counted once -- */

create or replace function public.file_shelf_seconds(p_tenant_id uuid)
returns numeric
language sql
stable
set search_path to 'public'
as $$
  -- What is there and what is on its way there, together: a copy that failed holds no room, and neither does one
  -- whose file was removed (its purge takes it off the shelf).
  select coalesce(sum(f.seconds), 0)
    from public.file_archives a
    join public.files f on f.tenant_id = a.tenant_id and f.id = a.file_id
   where a.tenant_id = p_tenant_id and a.origin = 'shelf' and a.state = any (array['saving', 'saved', 'checked'])
     and f.removed_at is null
$$;

revoke all on function public.file_shelf_seconds(uuid) from public, anon, authenticated;
grant execute on function public.file_shelf_seconds(uuid) to service_role;
comment on function public.file_shelf_seconds(uuid) is
  'The seconds of video a workspace''s shelf holds room for now (00729): the lengths of its files, still there, whose shelf copy is saving, saved or checked. A failed copy holds none. The one place the shelf''s room is counted: file_shelf_begin, file_shelf_again and file_shelf_owed ask it, each against the caller''s limit (contracts FILE_SHELF_MINUTES_MAX). The service role''s.';

create or replace function public.file_shelf_begin(
  p_tenant_id   uuid,
  p_file_id     uuid,
  p_bytes       bigint,
  p_sha256      text,
  p_seconds_max numeric
) returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_file  public.files;
  v_state text;
  v_id    uuid;
begin
  if p_bytes is null or p_bytes < 1 or p_sha256 is null or p_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception 'A shelf copy names its bytes and their SHA-256.' using errcode = '22023';
  end if;
  -- One at a time, as every door that names or files takes it (00551): the shelf's room is read under it.
  perform pg_advisory_xact_lock(hashtextextended(p_tenant_id::text || '|files', 42));
  select * into v_file from public.files f where f.tenant_id = p_tenant_id and f.id = p_file_id;
  -- Only a video made here: its own file is kept, which is what the shelf's copy is put from.
  if not found or v_file.removed_at is not null or v_file.kind <> 'video' or v_file.source <> 'made' then
    return jsonb_build_object('fate', 'none');
  end if;
  select a.state into v_state from public.file_archives a
   where a.tenant_id = p_tenant_id and a.file_id = p_file_id and a.origin = 'shelf';
  if found then
    return jsonb_build_object('fate', 'kept', 'state', v_state);
  end if;
  -- The shelf's room, counted the one way (file_shelf_seconds, 00729) against the caller's limit.
  if public.file_shelf_seconds(p_tenant_id) + coalesce(v_file.seconds, 0) > p_seconds_max then
    return jsonb_build_object('fate', 'full');
  end if;
  insert into public.file_archives (tenant_id, file_id, origin, state)
  values (p_tenant_id, p_file_id, 'shelf', 'saving')
  returning id into v_id;
  -- Its key is its workspace and its file, as the relay builds one from a ticket's own claims (apps/relay).
  insert into public.file_archive_parts (tenant_id, archive_id, part, shelf_key, bytes, sha256, state)
  values (p_tenant_id, v_id, 'video', p_tenant_id::text || '/' || p_file_id::text || '/video', p_bytes, p_sha256,
          'saving');
  -- Its job in the same step: a copy that is saving always has the job that puts it. As text: a job's once-only key
  -- is made of strings (job_dedupe_key_of).
  insert into public.jobs (tenant_id, kind, due_at, payload)
  values (p_tenant_id, 'file_shelve', now(), jsonb_build_object('file_id', p_file_id::text))
  on conflict do nothing;
  insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
  values (p_tenant_id, 'file_shelf.moved', 'content', 'file', p_file_id,
          jsonb_strip_nulls(jsonb_build_object('to', 'saving', 'bytes', p_bytes)));
  return jsonb_build_object('fate', 'begun');
end $$;

revoke all on function public.file_shelf_begin(uuid, uuid, bigint, text, numeric) from public, anon, authenticated;
grant execute on function public.file_shelf_begin(uuid, uuid, bigint, text, numeric) to service_role;
comment on function public.file_shelf_begin(uuid, uuid, bigint, text, numeric) is
  'A made video''s copy on the shelf begun (00695, the archive plan''s B2). Answers {fate}: none (no such video, removed, or not made here); kept, with state (it has a shelf copy already); full (the workspace''s shelved seconds, as file_shelf_seconds counts them (00729), and this video''s would pass p_seconds_max, the caller''s setting: contracts FILE_SHELF_MINUTES_MAX); or begun: the copy saving, its video piece with its key (workspace/file/video), the bytes and the SHA-256 taken as the video was made, and its file_shelve job, all in this one step. The service role''s.';

/* --------------------------------------------------------------------- 2. a failed copy tried again fits, or waits -- */

-- The two-input door goes and comes back with a third, optional one: a call that names two inputs, as the code live
-- before this does, reaches the new door and is answered as it was.
drop function if exists public.file_shelf_again(uuid, uuid);

create or replace function public.file_shelf_again(
  p_tenant_id   uuid,
  p_file_id     uuid,
  p_seconds_max numeric default null
) returns boolean
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_id      uuid;
  v_state   text;
  v_seconds numeric;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_tenant_id::text || '|files', 42));
  -- A copy that was checked or that failed, of a file still there, whose piece names the bytes it is put from: one
  -- with no piece has no file to be put from (file_shelf_unkept), and no job could ever finish it.
  select a.id, a.state, coalesce(f.seconds, 0) into v_id, v_state, v_seconds
    from public.file_archives a
    join public.files f on f.tenant_id = a.tenant_id and f.id = a.file_id
   where a.tenant_id = p_tenant_id and a.file_id = p_file_id and a.origin = 'shelf'
     and a.state = any (array['checked', 'failed']) and f.removed_at is null
     and exists (select 1 from public.file_archive_parts p
                  where p.tenant_id = a.tenant_id and p.archive_id = a.id and p.part = 'video');
  if not found then
    return false;
  end if;
  -- The shelf's one room (file_shelf_seconds, 00729). A checked copy is counted in it already, so putting it back
  -- moves nothing; a failed one is not, so it comes back only where it fits. No limit given: as before 00729.
  if v_state = 'failed' and p_seconds_max is not null
     and public.file_shelf_seconds(p_tenant_id) + v_seconds > p_seconds_max then
    return false;
  end if;
  -- The same bytes and the same SHA-256 are kept: only those can ever be put under its key.
  update public.file_archives a set state = 'saving', why = null, checked_at = null where a.id = v_id;
  update public.file_archive_parts p set state = 'saving', checked_at = null
   where p.tenant_id = p_tenant_id and p.archive_id = v_id and p.part = 'video';
  insert into public.jobs (tenant_id, kind, due_at, payload)
  values (p_tenant_id, 'file_shelve', now(), jsonb_build_object('file_id', p_file_id::text))
  on conflict do nothing;
  insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
  values (p_tenant_id, 'file_shelf.moved', 'content', 'file', p_file_id,
          jsonb_strip_nulls(jsonb_build_object('to', 'saving', 'again', true)));
  return true;
end $$;

revoke all on function public.file_shelf_again(uuid, uuid, numeric) from public, anon, authenticated;
grant execute on function public.file_shelf_again(uuid, uuid, numeric) to service_role;
comment on function public.file_shelf_again(uuid, uuid, numeric) is
  'A shelf copy put back (00695): one that was checked and is found missing or wrong on the shelf, or one that failed, is saving again with its file_shelve job, in one step, its bytes and SHA-256 kept. A failed copy holds no room on the shelf, so with p_seconds_max given (00729) it comes back only where the workspace''s shelved seconds (file_shelf_seconds) and its own stay within it; a checked one is counted already. Its video is not one that may step aside until it is checked again, and one that is away is not lost while this runs. Not for a removed file, nor for a copy with no piece (file_shelf_unkept). Answers whether it was begun. The service role''s.';

/* ------------------------------------------------------------- 3. a return that waited on a copy resumes by itself -- */

create or replace function public.file_shelf_checked(
  p_tenant_id uuid,
  p_file_id   uuid,
  p_bytes     bigint,
  p_sha256    text
) returns text
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_id     uuid;
  v_state  text;
  v_bytes  bigint;
  v_sha256 text;
  v_same   boolean;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_tenant_id::text || '|files', 42));
  select a.id, a.state, p.bytes, p.sha256 into v_id, v_state, v_bytes, v_sha256
    from public.file_archives a
    join public.file_archive_parts p on p.tenant_id = a.tenant_id and p.archive_id = a.id and p.part = 'video'
   where a.tenant_id = p_tenant_id and a.file_id = p_file_id and a.origin = 'shelf';
  if not found then
    return 'none';
  end if;
  -- Compared whole: the size, and the SHA-256 the shelf itself says. One it does not say is not a match.
  v_same := p_bytes is not null and p_bytes = v_bytes and p_sha256 is not null and p_sha256 = v_sha256;
  -- Asked again of one already checked (a second run of its job): the same answer, and nothing is written.
  if v_state = 'checked' then
    return case when v_same then 'checked' else 'none' end;
  end if;
  if v_state <> all (array['saving', 'saved']) then
    return 'none';
  end if;
  if v_same then
    update public.file_archive_parts p set state = 'checked', checked_at = now()
     where p.tenant_id = p_tenant_id and p.archive_id = v_id and p.part = 'video';
    update public.file_archives a set state = 'checked', why = null, checked_at = now() where a.id = v_id;
    insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
    values (p_tenant_id, 'file_shelf.moved', 'content', 'file', p_file_id,
            jsonb_strip_nulls(jsonb_build_object('to', 'checked')));
    -- A return that waited on this copy (00729): the video was asked for while its shelf copy was being put back,
    -- and was left away as unreadable. Its return goes back on the ledger in this step, so it comes back by itself
    -- for whoever asked: Play, a video being made, a post, an ad or AI all ask through the one door. Held once a
    -- file, as every return's job is. As text: a job's once-only key is made of strings (job_dedupe_key_of).
    insert into public.jobs (tenant_id, kind, due_at, payload)
    select f.tenant_id, 'copy_return', now(), jsonb_build_object('file_id', f.id::text)
      from public.files f
     where f.tenant_id = p_tenant_id and f.id = p_file_id and f.removed_at is null
       and f.copy_state = 'away' and f.copy_why = 'unreadable'
    on conflict do nothing;
    return 'checked';
  end if;
  update public.file_archive_parts p set state = 'failed', checked_at = null
   where p.tenant_id = p_tenant_id and p.archive_id = v_id and p.part = 'video';
  update public.file_archives a set state = 'failed', why = 'mismatch', checked_at = null where a.id = v_id;
  insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
  values (p_tenant_id, 'file_shelf.moved', 'content', 'file', p_file_id,
          jsonb_strip_nulls(jsonb_build_object('to', 'failed', 'why', 'mismatch')));
  -- A copy that is away with nothing left to give it back says so.
  perform public.file_copy_settle(p_tenant_id, p_file_id);
  return 'mismatch';
end $$;

revoke all on function public.file_shelf_checked(uuid, uuid, bigint, text) from public, anon, authenticated;
grant execute on function public.file_shelf_checked(uuid, uuid, bigint, text) to service_role;
comment on function public.file_shelf_checked(uuid, uuid, bigint, text) is
  'What the shelf holds of a video compared with what was sent (00695): p_bytes and p_sha256 are the shelf''s own record. Equal to the piece''s own: the copy and its piece are checked, answers checked (and so again for one already checked); and where the video is away and was left waiting on this copy (copy_why unreadable), its copy_return job is written in the same step (00729), so the return resumes by itself. Anything else, a SHA-256 the shelf does not say among it: both failed, why mismatch, answers mismatch, and a copy that is away with nothing left to give it back is settled as lost. No copy saving: none. The service role''s.';

/* --------------------------------------------------------------------------------- 4. what the shelf is owed, found -- */

-- The copies the shelf refused, found by how long: what file_shelf_owed reads. Few rows at any time.
create index if not exists file_archives_shelf_refused
  on public.file_archives (updated_at) where origin = 'shelf' and state = 'failed' and why = 'refused';

-- The videos made here and still there, and nothing else of a Library, with when each was made: file_shelf_owed finds
-- the ones with no shelf copy from this alone, never from a workspace's thousand photos. Timed on an engine before it
-- was added: without it the statement read every file of every workspace whose shelf is on.
create index if not exists files_made_videos
  on public.files (tenant_id, id) include (created_at)
  where kind = 'video' and source = 'made' and removed_at is null;

create or replace function public.file_shelf_owed(
  p_seconds_max   numeric,
  p_bytes_max     bigint,
  p_stale_seconds integer,
  p_limit         integer
) returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $$
  with shelving as (
    -- The workspaces whose made videos keep a shelf copy: the switch read as the app reads it, true and nothing else
    -- (contracts videoShelfOf).
    select c.tenant_id from public.tenant_config c where c.config -> 'features' -> 'video_shelf' = 'true'::jsonb
  ),
  bare as materialized (
    -- A video made here, still there, with no shelf copy's row at all, old enough that its making is over: its run
    -- ended between "sent" and its copy's first step, that call failed, its shelf was full, or it was made before
    -- the switch was on. Found from the made videos' own index against the shelf copies' key (files_made_videos,
    -- file_archives_one_shelf_copy), and kept apart so no file's row is read until it is known to be owed.
    select f.tenant_id, f.id, f.created_at
      from shelving s
      join public.files f on f.tenant_id = s.tenant_id
     where f.kind = 'video' and f.source = 'made' and f.removed_at is null
       and f.created_at < now() - make_interval(secs => greatest(p_stale_seconds, 0))
       and not exists (select 1 from public.file_archives a
                        where a.tenant_id = f.tenant_id and a.file_id = f.id and a.origin = 'shelf')
  ),
  unshelved as (
    select f.tenant_id, f.id as file_id, coalesce(f.seconds, 0) as seconds, coalesce(f.bytes, 0) as bytes,
           b.created_at as at, 'begin' as act
      from bare b
      join public.files f on f.tenant_id = b.tenant_id and f.id = b.id
  ),
  refused as (
    -- A copy the shelf would not take, or whose job ended, a while ago: its own file is still there to put it from.
    -- A failed copy holds no room, so it is weighed against the room as one never begun is.
    select a.tenant_id, a.file_id, coalesce(f.seconds, 0) as seconds, 0::bigint as bytes, a.updated_at as at,
           'again' as act
      from public.file_archives a
      join shelving s on s.tenant_id = a.tenant_id
      join public.files f on f.tenant_id = a.tenant_id and f.id = a.file_id
     where a.origin = 'shelf' and a.state = 'failed' and a.why = 'refused'
       and a.updated_at < now() - make_interval(secs => greatest(p_stale_seconds, 0))
       and f.removed_at is null
       and exists (select 1 from public.file_archive_parts p
                    where p.tenant_id = a.tenant_id and p.archive_id = a.id and p.part = 'video')
  ),
  owed as (
    select * from unshelved union all select * from refused
  ),
  room as (
    -- The shelf's one room (file_shelf_seconds), read once a workspace that is owed anything.
    select w.tenant_id, public.file_shelf_seconds(w.tenant_id) as used
      from (select distinct o.tenant_id from owed o) w
  ),
  judged as (
    select o.tenant_id, o.file_id, o.bytes, o.at, o.act,
           r.used + o.seconds <= p_seconds_max as fits,
           o.bytes <= p_bytes_max as light
      from owed o
      join room r on r.tenant_id = o.tenant_id
  ),
  to_begin as (
    -- Newest first: a video made today is shelved before one made last month.
    select j.tenant_id, j.file_id, j.bytes, j.at from judged j
     where j.act = 'begin' and j.fits and j.light
     order by j.at desc, j.file_id
     limit greatest(p_limit, 0)
  ),
  to_try as (
    select j.tenant_id, j.file_id, j.at from judged j
     where j.act = 'again' and j.fits
     order by j.at, j.file_id
     limit greatest(p_limit, 0)
  )
  select jsonb_build_object(
    'begin', coalesce((select jsonb_agg(jsonb_build_object('tenant_id', b.tenant_id, 'file_id', b.file_id,
                                                           'bytes', b.bytes)
                                        order by b.at desc, b.file_id) from to_begin b), '[]'::jsonb),
    'again', coalesce((select jsonb_agg(jsonb_build_object('tenant_id', t.tenant_id, 'file_id', t.file_id)
                                        order by t.at, t.file_id) from to_try t), '[]'::jsonb),
    'full', jsonb_build_object(
      'videos', (select count(*) from judged j where not j.fits),
      'workspaces', (select count(distinct j.tenant_id) from judged j where not j.fits)),
    'heavy', (select count(*) from judged j where j.act = 'begin' and j.fits and not j.light))
$$;

revoke all on function public.file_shelf_owed(numeric, bigint, integer, integer) from public, anon, authenticated;
grant execute on function public.file_shelf_owed(numeric, bigint, integer, integer) to service_role;
comment on function public.file_shelf_owed(numeric, bigint, integer, integer) is
  'What the shelf is owed, for every workspace in one statement (00729), in workspaces whose switch is on (features.video_shelf true) and for files still there. Answers {begin: [{tenant_id, file_id, bytes}], the videos made here more than p_stale_seconds ago that have no shelf copy''s row, fit the room left (file_shelf_seconds against p_seconds_max) and weigh no more than p_bytes_max, newest first, p_limit at most; again: [{tenant_id, file_id}], the copies the shelf refused more than p_stale_seconds ago that fit, the longest waiting first, p_limit at most; full: {videos, workspaces}, how many of either a full shelf holds back and in how many workspaces; heavy: how many videos that fit weigh more than p_bytes_max}. A read: the caller begins each through file_shelf_begin and file_shelf_again, which judge the room again under the workspace''s lock. Every number is the caller''s setting. The service role''s.';

create or replace function public.file_shelf_unkept(p_tenant_id uuid, p_file_id uuid)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(p_tenant_id::text || '|files', 42));
  -- Only a video made here, still there, with no shelf copy's row: one whose copy was ever begun says what became of
  -- it itself. No piece is written: there are no bytes to name.
  insert into public.file_archives (tenant_id, file_id, origin, state, why)
  select f.tenant_id, f.id, 'shelf', 'failed', 'not_found'
    from public.files f
   where f.tenant_id = p_tenant_id and f.id = p_file_id and f.removed_at is null
     and f.kind = 'video' and f.source = 'made'
     and not exists (select 1 from public.file_archives a
                      where a.tenant_id = f.tenant_id and a.file_id = f.id and a.origin = 'shelf');
  if not found then
    return false;
  end if;
  insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
  values (p_tenant_id, 'file_shelf.moved', 'content', 'file', p_file_id,
          jsonb_strip_nulls(jsonb_build_object('to', 'failed', 'why', 'not_found')));
  return true;
end $$;

revoke all on function public.file_shelf_unkept(uuid, uuid) from public, anon, authenticated;
grant execute on function public.file_shelf_unkept(uuid, uuid) to service_role;
comment on function public.file_shelf_unkept(uuid, uuid) is
  'A made video whose own kept file is gone can be given no shelf copy, and its row says so (00729): a shelf copy failed as not_found, with no piece, written once for a video made here, still there, that has no shelf copy''s row. file_shelf_owed then lists it no more, and the video keeps its place at the video platform, as one with no checked copy always does. Answers whether the row was written. The service role''s.';

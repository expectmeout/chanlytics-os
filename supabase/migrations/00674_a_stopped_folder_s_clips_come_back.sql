-- A stopped folder's clips come back, and a folder says what it could not bring in (the content loop PRD v3.1, pass 0,
-- F1, F3, F4 and F5; Ruben's calls 1 and 2 of 21 November 2026). The first real run of a watched folder found a stopped
-- folder holding 55.8 of the sixty minutes for good, its clips told "connect Drive again" while it was, and a folder's
-- six failed clips, its clip too long and its two Drive was still processing said nowhere but its sheet.
--
--   file_copy_comes_back      whether a clip's copy can be fetched again by itself: its item is in, under a folder
--                             being read or one that was stopped, whose Google account reads. The one place that says
--                             so, which the three below ask. A member's read may ask it: it reads only rows the
--                             member's own read already may.
--   file_copies_let_go,       a stopped folder's clips step aside, and say when they could, as a watched folder's do,
--   file_copies_free_at,      while its account reads (F1). Each asks file_copy_comes_back where it read "a folder
--   video_minutes_by_road     still being read". Nothing else in them moves.
--   files.copy_why            `folder` is split in two: `connection` (its account does not read: signed out, or
--                             whoever connected it left) and `cant_open` (the folder itself won't open). A folder that
--                             was only stopped gives its clips back, so it is no reason. A copy waiting with `folder`
--                             today waits with none: the next press of Play asks again and says the right word.
--   source_items_tally        `in` counts the folder's files in the Library, once each, as the Library holds them (it
--                             counted items, so the row said 23 where the stop said 24 and the Library held 25: F4);
--                             `away` how many of them are kept in Drive; `failed`, `too_long` and `too_large` what
--                             could not come in (F3); `waiting_length` the videos Drive is still processing, which are
--                             no longer counted as coming (F5).
--   platform_health_footage   Health's read of the footage day: Google's units and the bytes moved against Google's
--                             day, and the clips waiting on the video platform's full storage. The service role's.
--   files_copies_stream_full  the copies waiting on the platform's storage, by when: what Health counts. Few rows.
--
-- Deploy order: this migration first. An older edge's wait for a folder (`folder`) is refused for the minutes until
-- the edge deploys, and its job is tried again; the new edge writes only the new words. An older dashboard reads a new
-- word as no word ("kept in Google Drive · Play"), and the new counts as nothing. Re-runnable throughout.

set local lock_timeout = '3s';

/* -------------------------------------------------------------------- 1. what can come back, said in one place -- */

create or replace function public.file_copy_comes_back(p_tenant_id uuid, p_file_id uuid)
returns boolean
language sql
stable
set search_path to 'public'
as $$
  -- An item of the file's that is in, under a folder being read, or one that was stopped: its original is still read
  -- through its account's key, so a copy let go comes back on a press as a watched folder's does. Only while that
  -- account reads: one that needs connecting again gives nothing back, and its folders' clips stay.
  select exists (
    select 1 from public.source_items i
      join public.media_sources s on s.id = i.source_id
      join public.source_connections c on c.id = s.connection_id
     where i.tenant_id = p_tenant_id and i.file_id = p_file_id and i.state = 'in'
       and s.state = any (array['setting_up', 'watching', 'stopped'])
       and c.health = 'ok')
$$;

revoke all on function public.file_copy_comes_back(uuid, uuid) from public, anon;
grant execute on function public.file_copy_comes_back(uuid, uuid) to authenticated, service_role;
comment on function public.file_copy_comes_back(uuid, uuid) is
  'Whether a watched clip''s copy can be fetched again by itself (00674, the content loop PRD''s F1): an item of the file''s that is in, under a folder being read or one that was stopped, whose Google account reads (health ok). The one place that says so: file_copies_let_go, file_copies_free_at and video_minutes_by_road ask it. Runs as its caller: a member reads only their own workspace''s rows.';

/* ------------------------------------------------------- 2. a stopped folder's clips step aside, and say when -- */

create or replace function public.file_copies_let_go(
  p_tenant_id     uuid,
  p_seconds       numeric,
  p_unused_before timestamp with time zone,
  p_rested_before timestamp with time zone,
  p_limit         integer
) returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_short numeric;
  v_gone  jsonb;
begin
  -- One at a time, as every door that names or files takes it (00551): the room is read under it.
  perform pg_advisory_xact_lock(hashtextextended(p_tenant_id::text || '|files', 42));
  -- By room: how many seconds must be freed for a video of p_seconds to fit. None: nothing is let go.
  if p_seconds is not null then
    v_short := p_seconds - public.video_seconds_free(p_tenant_id);
    if v_short <= 0 then
      return '[]'::jsonb;
    end if;
  end if;
  with eligible as (
    -- Only what can come back is let go by itself: a watched folder's clip its owner did not also upload, playable,
    -- looked at (or past the week a look is tried again in), that can be fetched again (00674: a folder being read,
    -- or one stopped whose account reads); named by no video being made; and not used, or arrived, since the rest
    -- began.
    select f.id, f.seconds, coalesce(f.copy_used_at, f.ready_at, f.created_at) as used_at
      from public.files f
     where f.tenant_id = p_tenant_id and f.kind = 'video' and public.file_road_is_watched(f.source)
       and not f.owner_uploaded
       and f.removed_at is null and f.copy_state = 'here' and f.media_status = 'ready' and f.media_ref is not null
       and (f.look_status = any (array['done', 'refused']) or f.created_at < now() - interval '7 days')
       and coalesce(f.copy_used_at, f.ready_at, f.created_at) < p_rested_before
       and public.file_copy_comes_back(f.tenant_id, f.id)
       and not exists (select 1 from public.pieces p
                        where p.tenant_id = f.tenant_id and p.status = 'making'
                          and position(f.id::text in p.plan::text) > 0)
  ),
  ranked as (
    select e.id, e.used_at,
           coalesce(sum(coalesce(e.seconds, 0)) over (order by e.used_at, e.id
                                                      rows between unbounded preceding and 1 preceding), 0) as freed_before,
           sum(coalesce(e.seconds, 0)) over () as freed_all,
           row_number() over (order by e.used_at, e.id) as place
      from eligible e
  ),
  chosen as (
    select r.id from ranked r
     where r.place <= greatest(p_limit, 1)
       and case
             -- By room: the least recently used, as many as free what is short, and none where all of them would not.
             when p_seconds is not null then r.freed_all >= v_short and r.freed_before < v_short
             -- By age: each one unused since the time given.
             else p_unused_before is not null and r.used_at < p_unused_before
           end
  ),
  going as (
    update public.files f
       set copy_state = 'going', copy_why = null, updated_at = now()
      from chosen c
     where f.id = c.id and f.copy_state = 'here'
    returning f.id, f.media_ref, f.seconds
  )
  select coalesce(jsonb_agg(jsonb_build_object('id', g.id, 'media_ref', g.media_ref, 'seconds', g.seconds)), '[]'::jsonb)
    into v_gone
    from going g;
  return v_gone;
end $$;

comment on function public.file_copies_let_go(uuid, numeric, timestamp with time zone, timestamp with time zone, integer) is
  'A workspace''s copies marked going (00654, the footage sources plan''s D6). By room (p_seconds: a video of that length must fit): the least recently used first, as many as free what is short, and none where all that may go would not free it. By age (p_seconds null): each one unused since p_unused_before. Only a watched folder''s clip its owner did not also upload (owner_uploaded), playable, looked at, that can be fetched again (file_copy_comes_back, 00674: a folder being read, or one stopped whose account reads), named by no video being made, and not used or arrived since p_rested_before; p_limit at most. Never an upload, a video made here or a found video. Answers [{id, media_ref, seconds}]: the caller deletes each at the video platform, then says so (file_copy_gone). The service role''s.';

create or replace function public.file_copies_free_at(p_tenant_id uuid, p_rest_seconds integer)
returns timestamp with time zone
language sql
stable
set search_path to 'public'
as $$
  -- The copies that could be let go but may not yet: resting (used, or arrived, within the rest), or held by a look
  -- not done or a video being made. One that may go now is left out: it was weighed, and it did not free enough.
  select min(case
               when coalesce(f.copy_used_at, f.ready_at, f.created_at) >= now() - make_interval(secs => p_rest_seconds)
                 then coalesce(f.copy_used_at, f.ready_at, f.created_at) + make_interval(secs => p_rest_seconds)
               else now() + make_interval(secs => p_rest_seconds)
             end)
    from public.files f
   where f.tenant_id = p_tenant_id and f.kind = 'video' and public.file_road_is_watched(f.source)
     and not f.owner_uploaded
     and f.removed_at is null and f.copy_state = 'here' and f.media_status = 'ready' and f.media_ref is not null
     and public.file_copy_comes_back(f.tenant_id, f.id)
     and (coalesce(f.copy_used_at, f.ready_at, f.created_at) >= now() - make_interval(secs => p_rest_seconds)
          or (f.look_status <> all (array['done', 'refused']) and f.created_at >= now() - interval '7 days')
          or exists (select 1 from public.pieces p
                      where p.tenant_id = f.tenant_id and p.status = 'making'
                        and position(f.id::text in p.plan::text) > 0))
$$;

comment on function public.file_copies_free_at(uuid, integer) is
  'When a copy that may not be let go yet could be (00654): the earliest end of a resting copy''s rest (p_rest_seconds after its last use or its arrival), or the rest from now for one a look not done or a video being made still holds. Null where no copy of the workspace ever may go: what fills its minutes is uploads, made and found videos, or clips that cannot be fetched again (file_copy_comes_back, 00674). A take that found the videos full waits until then. The service role''s.';

create or replace function public.video_minutes_by_road(p_tenant_id uuid)
returns jsonb
language sql
stable
set search_path to 'public'
as $$
  with counted as (
    select f.id, f.source, f.status, f.owner_uploaded, f.copy_state, f.media_status,
           coalesce(f.seconds, 0) as seconds
      from public.files f
     where f.tenant_id = p_tenant_id and f.kind = 'video' and f.removed_at is null and f.media_status <> 'failed'
       and f.copy_state = any (array['here', 'going', 'returning'])
  )
  select jsonb_build_object(
    'total', coalesce(sum(c.seconds), 0),
    'can_step_aside', coalesce(sum(c.seconds) filter (
      where public.file_road_is_watched(c.source) and not c.owner_uploaded and c.copy_state = 'here'
        and c.media_status = 'ready' and public.file_copy_comes_back(p_tenant_id, c.id)), 0),
    'set_aside', coalesce(sum(c.seconds) filter (where c.status = 'set_aside'), 0),
    'own', coalesce(sum(c.seconds) filter (where c.status <> 'set_aside'
                                             and (c.source = 'upload' or c.owner_uploaded)), 0),
    'made', coalesce(sum(c.seconds) filter (where c.status <> 'set_aside' and c.source = 'made'), 0),
    'found', coalesce(sum(c.seconds) filter (
      where c.status <> 'set_aside' and not c.owner_uploaded
        and c.source = any (array['google_profile', 'google_listing', 'website', 'instagram'])), 0))
    from counted c
$$;

/* -------------------------------------------------------------- 3. why a copy waits: the account, or the folder -- */

-- A copy that waited for its folder waits for nothing now: a folder only stopped gives it back, and the next press of
-- Play asks again and says the right word if one still stands between it and the clip.
update public.files set copy_why = null, updated_at = now() where copy_why = 'folder';

alter table public.files drop constraint if exists files_copy_why_check;
alter table public.files add constraint files_copy_why_check
  check (copy_why is null or copy_why = any (array['room', 'budget', 'connection', 'cant_open', 'videos_off', 'busy',
                                                   'stream_full', 'unreadable', 'changed', 'failed', 'stopped', 'gone',
                                                   'outside', 'not_found', 'no_access', 'no_origin']));
comment on column public.files.copy_why is
  'Why a copy is lost (gone, outside, not_found, no_access, no_origin), or why one that is away did not come back when it was last asked for (room, budget, connection, cant_open, videos_off, busy, stream_full, unreadable, changed, failed, stopped). connection: its folder''s account does not read; cant_open: its folder itself won''t open (00674, which split folder: a folder only stopped gives its clips back). One of a closed set (contracts FILE_COPY_WHYS).';

-- What Health counts of the copies waiting on the video platform's own storage.
create index if not exists files_copies_stream_full on public.files (updated_at)
  where copy_state = 'away' and copy_why = 'stream_full';

/* ------------------------------------------------- 4. a folder's files, counted once, and what could not come in -- */

create or replace function public.source_items_tally(p_tenant_id uuid, p_source_id uuid)
returns jsonb
language sql
stable
set search_path to 'public'
as $$
  -- What was asked for and is not in yet: a first watch's fifty, or what arrived since. Few rows, by the state's index.
  with moving as (
    select i.state, i.why, i.length_until > now() as processing
      from public.source_items i
     where i.tenant_id = p_tenant_id and i.source_id = p_source_id
       and i.state = any (array['waiting', 'taking'])
  ),
  -- The folder's files in the Library, each once (two items may hold one file), as the Library holds them: a file
  -- whose original left the folder stays until its week is out, and is counted until then.
  kept as (
    select distinct f.id, f.kind, f.copy_state
      from public.source_items i
      join public.files f on f.id = i.file_id
     where i.tenant_id = p_tenant_id and i.source_id = p_source_id and i.file_id is not null
       and f.tenant_id = p_tenant_id and f.removed_at is null
  ),
  -- What could not come in: tried three times and failed, or too long or too large to bring.
  missed as (
    select i.state, i.why
      from public.source_items i
     where i.tenant_id = p_tenant_id and i.source_id = p_source_id
       and i.state = any (array['failed', 'too_big']) and i.kind <> 'folder'
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
    'in', (select count(*) from kept),
    -- Of them, the clips whose copy is kept in Drive just now.
    'away', (select count(*) from kept k where k.kind = 'video' and k.copy_state <> 'here'),
    -- On their way: being taken, or waiting for nothing but their turn (a try again, the provider's pace). A video Drive
    -- is still processing waits for its length, and is said apart.
    'coming', (select count(*) from moving m
                where m.state = 'taking'
                   or ((m.why is null or m.why <> all (array['budget', 'room', 'library_full', 'videos_off', 'folder']))
                       and not coalesce(m.processing, false))),
    -- Landed today: what the day's takes brought in, so "12 of 40" is twelve of today's forty.
    'landed', (select count(*) from public.source_items i, today t
                where i.tenant_id = p_tenant_id and i.taken_at >= t.began
                  and i.source_id = p_source_id and i.state = 'in'),
    'budget', (select count(*) from moving m where m.state = 'waiting' and m.why = 'budget'),
    'room', (select count(*) from moving m where m.state = 'waiting' and m.why = 'room'),
    'library_full', (select count(*) from moving m where m.state = 'waiting' and m.why = 'library_full'),
    'videos_off', (select count(*) from moving m where m.state = 'waiting' and m.why = 'videos_off'),
    'waiting_length', (select count(*) from moving m
                        where m.state = 'waiting' and coalesce(m.processing, false)
                          and (m.why is null or m.why <> all (array['budget', 'room', 'library_full', 'videos_off', 'folder']))),
    'failed', (select count(*) from missed x where x.state = 'failed'),
    'too_long', (select count(*) from missed x where x.state = 'too_big' and x.why = 'seconds'),
    'too_large', (select count(*) from missed x where x.state = 'too_big' and x.why is distinct from 'seconds')
  );
$$;

comment on function public.source_items_tally(uuid, uuid) is
  'A watched folder''s files counted where they stand (00655, the footage sources plan''s screens; 00674): found (photos and videos still where they were), in (its files in the Library, each once, as the Library holds them), away (of them, clips kept in Drive just now), coming (being taken, or waiting only for their turn), landed (in, and counted in today''s takes, a day as Google counts one), those waiting for a day''s allowance (budget), room in the videos (room), room in the Library (library_full) or the workspace''s video switch (videos_off), waiting_length (videos Drive is still processing, said apart from coming), and what could not come in: failed (tried and failed), too_long (longer than AI can watch), too_large (too heavy, or a photo of too many pixels). Every screen''s count of a folder is one of these. Counted from the folder''s own list and kept nowhere. Runs as its caller: a member reads their own workspace''s rows, and another''s count nothing.';

/* ---------------------------------------------------------------------------- 5. Health's read of the footage -- */

create or replace function public.platform_health_footage()
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $$
  -- Google's day, as the takes count it (00643): Pacific time.
  with today as (select (now() at time zone 'America/Los_Angeles')::date as day),
  spent as (select d.* from public.source_days d, today t where d.day = t.day),
  -- What waits on the video platform's own storage: takes waiting, and copies that could not come back.
  stuck as (
    select i.tenant_id, i.updated_at from public.source_items i
     where i.state = 'waiting' and i.why = 'stream_full'
    union all
    select f.tenant_id, f.updated_at from public.files f
     where f.copy_state = 'away' and f.copy_why = 'stream_full'
  )
  select jsonb_build_object(
    'day', (select t.day from today t),
    'units', coalesce((select s.units from spent s), 0),
    'bytes', coalesce((select s.bytes from spent s), 0),
    'takes', coalesce((select s.takes from spent s), 0),
    'returns', coalesce((select s.returns from spent s), 0),
    'stream_full', (select count(*) from stuck),
    'stream_full_workspaces', coalesce((select jsonb_agg(distinct x.tenant_id) from stuck x), '[]'::jsonb),
    'stream_full_since', (select min(x.updated_at) from stuck x))
$$;

revoke all on function public.platform_health_footage() from public, anon, authenticated;
grant execute on function public.platform_health_footage() to service_role;
comment on function public.platform_health_footage() is
  'Health''s read of watched folders today (00674, the content loop PRD''s 14.3): Google''s day (Pacific time, as the takes count it) of units, bytes, takes and returns spent from source_days, and what waits on the video platform''s own storage (takes waiting and copies away with why stream_full): how many, the workspaces, and since when. Service role only.';

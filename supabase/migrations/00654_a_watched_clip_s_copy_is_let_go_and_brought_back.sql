-- A watched clip's copy is let go and brought back (the footage sources plan's P4, "Availability", 19 November 2026).
--
-- A workspace keeps sixty minutes of video at the video platform. A watched folder brings more than that in a few
-- weeks, and its originals stay with their provider, so a clip's copy at the platform can be let go and fetched again.
-- An upload, a video made here and a found video are never let go: nothing can give one back.
--
--   files.copy_state          where a video's copy at the video platform stands: here, going (being let go), away (let
--                             go, and its folder can give it back), returning (being brought back), lost (its folder
--                             cannot give it back; copy_why says why). Everything but a watched folder's clip is here.
--   files.copy_why            why a copy is lost, or why one that is away could not come back when it was last asked
--                             for: a closed set (contracts FILE_COPY_WHYS).
--   files.copy_used_at        when the copy was last used: played, shown to AI, cut into a video. What is let go first
--                             is what was used longest ago.
--   files.copy_returned_at    when its return last spent the day's budget: a workspace's returns of a day are counted
--                             from it.
--   files_media_shape         a video holds no id at the video platform while its copy is away or lost, and while one
--                             being brought back has not been asked of the platform yet. Nothing else may be empty.
--   source_items.held_seconds the room in the videos a take holds between its judging and its row, so several takes at
--                             the edge of the sixty minutes are not all judged to fit (the review of 18 Nov, finding 9).
--   source_days.returns       the copies brought back in a day, beside the bytes they moved.
--
--   files_toward_cap          a copy that is away or lost weighs stills and words, and does not count toward the
--                             Library's thousand (the plan's D16).
--   video_seconds_toward_cap  the seconds of videos whose copy is here, going or returning, and what takes hold.
--   video_seconds_free        the sixty minutes less that: the cap's number, once, for the functions here.
--   file_video_room           asks it.
--   file_copy_origin          the item a file's copy can be fetched from again, or none.
--   file_copy_standing        why a file's copy cannot come back (gone, outside, not_found, no_access, no_origin), or
--                             null where an origin can give it back. The one place that says so.
--   file_copy_settle          an away or lost copy set to what its origins now say. A trigger on source_items asks it
--                             whenever an item that holds a file moves or goes, so a lost original is said on its row
--                             without anyone asking.
--   file_copies_let_go        marks copies going: by room (the least recently used first, as many as free the seconds
--                             asked for) or by age (unused since a time). Only a watched folder's clip, playable,
--                             looked at, held by a folder still being read, named by no video being made, and not used
--                             within the rest.
--   file_copy_gone            a copy deleted at the platform is away, and holds no id; what waited for room is due.
--   file_copy_return_begin    a return judged and begun in one place: lost, no room, a day's budget, or go, with the
--                             copy marked returning so its room is held before the platform is asked.
--   file_copy_returning       the id the platform gave the copy coming back.
--   file_copy_return_failed   a return that did not happen: the copy is away again, with why.
--   file_media_ready          a copy coming back is here again and nothing else: no look, no digest (fate returned).
--   file_media_failed         a copy the platform could not prepare again leaves the file away, its media_status
--                             untouched (fate unreturned).
--   file_video_sourced        holds room at its judging.
--   source_items_grace_end    the seven-day cleanup (the plan's D3, as narrowed 18 Nov): an item seen in its provider's
--                             bin, or moved out to a place its account can see, seven days ago. Its Library file is
--                             removed only if nothing used it and no other origin holds it; then the item's row goes.
--                             It never reads a file with no origin, and never writes files_let_go.
--   job_kinds                 copy_return: one copy brought back, held once per file, in the lane of someone waiting.
--
-- Every number of a budget or a pace is the edge's setting, passed in. Deploy order: this migration first (the edge
-- schedules a kind the ledger refuses without its row, and reads the new columns); the old edge names none of it, and
-- no copy leaves here before the new one runs. Re-runnable throughout.

set local lock_timeout = '3s';

/* --------------------------------------------------------------------------------------- 1. where a copy stands -- */

alter table public.files
  add column if not exists copy_state       text not null default 'here',
  add column if not exists copy_why         text,
  add column if not exists copy_used_at     timestamptz,
  add column if not exists copy_returned_at timestamptz;

alter table public.files drop constraint if exists files_copy_state_check;
alter table public.files add constraint files_copy_state_check
  check (copy_state = any (array['here', 'going', 'away', 'returning', 'lost']));

alter table public.files drop constraint if exists files_copy_why_check;
alter table public.files add constraint files_copy_why_check
  check (copy_why is null or copy_why = any (array['room', 'budget', 'folder', 'videos_off', 'busy', 'unreadable', 'changed', 'failed', 'stopped', 'gone', 'outside', 'not_found', 'no_access', 'no_origin']));

-- Only a watched folder's clip is ever anything but here; a copy that is away or lost holds no id; and why is said
-- only of one that is away or lost.
alter table public.files drop constraint if exists files_copy_shape;
alter table public.files add constraint files_copy_shape
  check ((copy_state = 'here' or (kind = 'video' and source = 'drive'))
         and (copy_state <> all (array['away', 'lost']) or media_ref is null)
         and (copy_why is null or copy_state = any (array['away', 'lost'])));

alter table public.files drop constraint if exists files_media_shape;
alter table public.files add constraint files_media_shape
  check ((kind = 'image' and media_ref is null and media_status is null)
         or (kind = 'video' and media_status is not null
             and (media_ref is not null or copy_state = any (array['away', 'lost', 'returning']))));

comment on column public.files.copy_state is
  'Where a video''s copy at the video platform stands (00654, the footage sources plan''s Availability): here; going, being let go; away, let go, and its folder can give it back; returning, being brought back; lost, its folder cannot give it back. Only a watched folder''s clip is ever anything but here.';
comment on column public.files.copy_why is
  'Why a copy is lost (gone, outside, not_found, no_access, no_origin), or why one that is away did not come back when it was last asked for (room, budget, folder, videos_off, busy, unreadable, changed, failed, stopped). One of a closed set (contracts FILE_COPY_WHYS).';
comment on column public.files.copy_used_at is
  'When the copy at the video platform was last used: played, shown to AI, cut into a video (00654). What is let go first is what was used longest ago.';
comment on column public.files.copy_returned_at is
  'When a return of the copy last spent the day''s budget (00654 file_copy_return_begin): a workspace''s returns of a day are counted from it.';

-- Members read where a copy stands and why, as they read where a video stands.
grant select (copy_state, copy_why) on public.files to authenticated;

-- A workspace's copies that could be let go: the few of a watched folder that are here.
create index if not exists files_copies_here on public.files (tenant_id, copy_used_at)
  where kind = 'video' and source = 'drive' and copy_state = 'here' and removed_at is null;
-- What is on its way out or back, whichever workspace's: what the sweep asks after.
create index if not exists files_copies_moving on public.files (updated_at)
  where copy_state = any (array['going', 'returning']);
-- A workspace's returns of a day.
create index if not exists files_copies_returned on public.files (tenant_id, copy_returned_at)
  where copy_returned_at is not null;

alter table public.source_items add column if not exists held_seconds numeric;
alter table public.source_items drop constraint if exists source_items_held_seconds_check;
alter table public.source_items add constraint source_items_held_seconds_check
  check (held_seconds is null or held_seconds >= 0);
comment on column public.source_items.held_seconds is
  'The room in the videos its take holds (00654): written as the take is judged to fit, counted toward the minutes while the item is being taken and has no file yet, for ten minutes at most. Null: none held.';

-- What the seven-day cleanup reads: the tombstones, oldest first.
create index if not exists source_items_tombstones on public.source_items (gone_at)
  where state = any (array['gone', 'outside']);

alter table public.source_days add column if not exists returns integer not null default 0;
alter table public.source_days drop constraint if exists source_days_returns_check;
alter table public.source_days add constraint source_days_returns_check check (returns >= 0);

/* ----------------------------------------------------------------------------------------- 2. the return's job -- */

insert into public.job_kinds (kind, lane, once_parts, once_kept) values
  ('copy_return', 1, array['@tenant', 'file_id'], false)
on conflict (kind) do update
  set lane = excluded.lane, once_parts = excluded.once_parts, once_kept = excluded.once_kept;

/* --------------------------------------------------------------------------------------- 3. what counts, once -- */

create or replace function public.file_road_is_watched(p_source text)
returns boolean
language sql
immutable
set search_path to 'public'
as $$
  -- Each provider a folder is watched at (contracts SOURCE_PROVIDERS): what its folder can give back.
  select p_source = 'drive'
$$;

revoke all on function public.file_road_is_watched(text) from public, anon, authenticated;
grant execute on function public.file_road_is_watched(text) to service_role;
comment on function public.file_road_is_watched(text) is
  'Whether a road is a watched folder (00654): the one kind of file whose copy at the video platform can be fetched again, and so the only kind ever let go. Its doors''.';

create or replace function public.files_toward_cap(p_tenant_id uuid)
returns bigint
language sql
stable
set search_path to 'public'
as $$
  select count(*) from public.files f
   where f.tenant_id = p_tenant_id and f.removed_at is null and f.copy_state <> all (array['away', 'lost'])
$$;

comment on function public.files_toward_cap(uuid) is
  'How many of a workspace''s files count toward the Library''s cap (contracts FILES_MAX): every file not removed (00638), but for a watched clip whose copy is away or lost, which weighs stills and words (00654, the footage sources plan''s D16). The one place that count is written: each door that adds a file asks it, and keeps the cap''s number. The service role''s.';

create or replace function public.video_seconds_held(p_tenant_id uuid)
returns numeric
language sql
stable
set search_path to 'public'
as $$
  select coalesce(sum(i.held_seconds), 0) from public.source_items i
   where i.tenant_id = p_tenant_id and i.state = 'taking' and i.kind = 'video' and i.file_id is null
     and i.held_seconds is not null and i.updated_at > now() - interval '10 minutes'
$$;

revoke all on function public.video_seconds_held(uuid) from public, anon, authenticated;
grant execute on function public.video_seconds_held(uuid) to service_role;
comment on function public.video_seconds_held(uuid) is
  'The seconds of video a workspace''s takes hold (00654): each clip judged to fit and not yet a row, for ten minutes at most, so a take whose job died holds nothing for long. Counted by video_seconds_toward_cap. Its doors''.';

create or replace function public.video_seconds_toward_cap(p_tenant_id uuid)
returns numeric
language sql
stable
set search_path to 'public'
as $$
  select coalesce(sum(f.seconds), 0) + public.video_seconds_held(p_tenant_id) from public.files f
   where f.tenant_id = p_tenant_id and f.kind = 'video' and f.removed_at is null and f.media_status <> 'failed'
     and f.copy_state = any (array['here', 'going', 'returning'])
$$;

comment on function public.video_seconds_toward_cap(uuid) is
  'How many seconds of video count toward a workspace''s video minutes (contracts FILE_VIDEO_MINUTES_MAX): every video not removed whose copy did not fail and is at the video platform or on its way there or back (here, going, returning: 00654), what is kept and what is on its way together (00638), and what its takes hold (video_seconds_held). An upload, a video made here and a found video in every status are always here. The one place that sum is written. The service role''s.';

create or replace function public.video_seconds_free(p_tenant_id uuid)
returns numeric
language sql
stable
set search_path to 'public'
as $$
  -- contracts FILE_VIDEO_MINUTES_MAX.
  select 60 * 60 - public.video_seconds_toward_cap(p_tenant_id)
$$;

revoke all on function public.video_seconds_free(uuid) from public, anon, authenticated;
grant execute on function public.video_seconds_free(uuid) to service_role;
comment on function public.video_seconds_free(uuid) is
  'The seconds of video a workspace still has room for (00654): its sixty minutes less what counts toward them. Negative where it is over. The cap''s number in one place for the functions that ask it here. Its doors''.';

create or replace function public.file_video_room(p_tenant_id uuid, p_seconds numeric)
returns text
language sql
stable
set search_path to 'public'
as $$
  select case
    -- contracts FILE_VIDEO_SECONDS_MAX: longer than AI can watch.
    when p_seconds > 10 * 60 then 'long'
    -- A video's own length must fit. One whose road never said its length is let in on what is known, and judged by
    -- its length when the video platform says it (file_media_ready).
    when p_seconds is null and public.video_seconds_free(p_tenant_id) <= 0 then 'minutes'
    when coalesce(p_seconds, 0) > public.video_seconds_free(p_tenant_id) then 'minutes'
    else 'room'
  end
$$;

comment on function public.file_video_room(uuid, numeric) is
  'Whether a video of this length may come in (00643): long (over ten minutes, more than AI can watch), minutes (the workspace''s sixty would be passed; with no length known, only where they are already full) or room. The one place a video is let in by its length, whichever road brought it; what is free is video_seconds_free''s to say (00654). Its doors''.';

/* ------------------------------------------------------------------------------ 4. can a copy come back, and why not -- */

create or replace function public.file_copy_origin(p_tenant_id uuid, p_file_id uuid)
returns uuid
language sql
stable
set search_path to 'public'
as $$
  -- An item that holds the file and that its provider still shows: in, or back in its folder and waiting to be
  -- settled. A tombstone (gone, outside, no_access) gives nothing back.
  select i.id from public.source_items i
   where i.tenant_id = p_tenant_id and i.file_id = p_file_id
     and i.state = any (array['in', 'taking', 'waiting', 'listed'])
   order by (i.state = 'in') desc, i.updated_at desc, i.id
   limit 1
$$;

revoke all on function public.file_copy_origin(uuid, uuid) from public, anon, authenticated;
grant execute on function public.file_copy_origin(uuid, uuid) to service_role;
comment on function public.file_copy_origin(uuid, uuid) is
  'The item a file''s copy can be fetched from again (00654): one that holds the file and that its provider still shows, the one that is in first. Null where no origin can give it back. Its doors''.';

create or replace function public.file_copy_standing(p_tenant_id uuid, p_file_id uuid)
returns text
language sql
stable
set search_path to 'public'
as $$
  select case
    when public.file_copy_origin(p_tenant_id, p_file_id) is not null then null
    else coalesce(
      (select case i.state
                when 'gone' then 'gone'
                when 'outside' then 'outside'
                else case when i.why = 'not_found' then 'not_found' else 'no_access' end
              end
         from public.source_items i
        where i.tenant_id = p_tenant_id and i.file_id = p_file_id
          and i.state = any (array['gone', 'outside', 'no_access'])
        order by i.gone_at desc nulls last, i.id
        limit 1),
      'no_origin')
  end
$$;

revoke all on function public.file_copy_standing(uuid, uuid) from public, anon, authenticated;
grant execute on function public.file_copy_standing(uuid, uuid) to service_role;
comment on function public.file_copy_standing(uuid, uuid) is
  'Why a file''s copy cannot be fetched again, or null where an origin can give it back (00654): gone (seen in its provider''s bin), outside (moved out of the watched folder), not_found (its provider no longer shows it), no_access (its provider no longer lets it be read), no_origin (no watched folder holds it: its account was disconnected, its folder removed, or its bytes replaced). The one place that says so. Its doors''.';

create or replace function public.file_copy_settle(p_tenant_id uuid, p_file_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_why text := public.file_copy_standing(p_tenant_id, p_file_id);
  v_row public.files;
begin
  -- Only a copy that is away or lost is moved: one that is here, going or returning says where it stands itself.
  update public.files f
     set copy_state = case when v_why is null then 'away' else 'lost' end, copy_why = v_why, updated_at = now()
   where f.tenant_id = p_tenant_id and f.id = p_file_id
     and ((f.copy_state = 'away' and v_why is not null)
          or (f.copy_state = 'lost' and v_why is distinct from f.copy_why));
  select * into v_row from public.files f where f.tenant_id = p_tenant_id and f.id = p_file_id;
  if not found then
    return jsonb_build_object('copy_state', null);
  end if;
  return jsonb_build_object('copy_state', v_row.copy_state, 'copy_why', v_row.copy_why,
                            'item_id', public.file_copy_origin(p_tenant_id, p_file_id));
end $$;

revoke all on function public.file_copy_settle(uuid, uuid) from public, anon, authenticated;
grant execute on function public.file_copy_settle(uuid, uuid) to service_role;
comment on function public.file_copy_settle(uuid, uuid) is
  'A copy that is away or lost set to what its origins now say (00654): lost with why where none can give it back, away again where one can. A wait''s own reason on an away copy is left. Answers {copy_state, copy_why, item_id: the origin a return would read}. The service role''s.';

create or replace function public.file_copies_follow_origin()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  -- An item that holds a file moved, let go of it or went: the file's copy says what its origins now say.
  if tg_op = 'DELETE' then
    perform public.file_copy_settle(old.tenant_id, old.file_id);
    return null;
  end if;
  if old.file_id is not null then
    perform public.file_copy_settle(old.tenant_id, old.file_id);
  end if;
  if new.file_id is not null and new.file_id is distinct from old.file_id then
    perform public.file_copy_settle(new.tenant_id, new.file_id);
  end if;
  return null;
end $$;

revoke all on function public.file_copies_follow_origin() from public, anon, authenticated;
comment on function public.file_copies_follow_origin() is
  'A trigger on source_items (00654): an item that holds a Library file changed state, let go of the file or was deleted, so the file''s copy is settled by what its origins now say (file_copy_settle). However it happened: the sync marking it gone, a restore from the bin, a disconnect''s cascade.';

drop trigger if exists source_items_copies_follow on public.source_items;
create trigger source_items_copies_follow
  after update of state, file_id on public.source_items
  for each row
  when ((old.file_id is not null or new.file_id is not null)
        and (old.state is distinct from new.state or old.file_id is distinct from new.file_id))
  execute function public.file_copies_follow_origin();

drop trigger if exists source_items_copies_follow_gone on public.source_items;
create trigger source_items_copies_follow_gone
  after delete on public.source_items
  for each row
  when (old.file_id is not null)
  execute function public.file_copies_follow_origin();

/* ------------------------------------------------------------------------------------------ 5. letting a copy go -- */

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
    -- Only what can come back is let go by itself: a watched folder's clip, playable, looked at (or past the week a
    -- look is tried again in), held by an item that is in, in a folder still being read; named by no video being
    -- made; and not used, or arrived, since the rest began.
    select f.id, f.seconds, coalesce(f.copy_used_at, f.ready_at, f.created_at) as used_at
      from public.files f
     where f.tenant_id = p_tenant_id and f.kind = 'video' and public.file_road_is_watched(f.source)
       and f.removed_at is null and f.copy_state = 'here' and f.media_status = 'ready' and f.media_ref is not null
       and (f.look_status = any (array['done', 'refused']) or f.created_at < now() - interval '7 days')
       and coalesce(f.copy_used_at, f.ready_at, f.created_at) < p_rested_before
       and exists (select 1 from public.source_items i
                     join public.media_sources s on s.id = i.source_id
                    where i.tenant_id = f.tenant_id and i.file_id = f.id and i.state = 'in'
                      and s.state = any (array['setting_up', 'watching']))
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

revoke all on function public.file_copies_let_go(uuid, numeric, timestamp with time zone, timestamp with time zone, integer) from public, anon, authenticated;
grant execute on function public.file_copies_let_go(uuid, numeric, timestamp with time zone, timestamp with time zone, integer) to service_role;
comment on function public.file_copies_let_go(uuid, numeric, timestamp with time zone, timestamp with time zone, integer) is
  'A workspace''s copies marked going (00654, the footage sources plan''s D6). By room (p_seconds: a video of that length must fit): the least recently used first, as many as free what is short, and none where all that may go would not free it. By age (p_seconds null): each one unused since p_unused_before. Only a watched folder''s clip that is playable, looked at, held by an item that is in under a folder still being read, named by no video being made, and not used or arrived since p_rested_before; p_limit at most. Never an upload, a video made here or a found video. Answers [{id, media_ref, seconds}]: the caller deletes each at the video platform, then says so (file_copy_gone). The service role''s.';

create or replace function public.file_copy_gone(p_tenant_id uuid, p_id uuid)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_why text;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_tenant_id::text || '|files', 42));
  -- Away where an origin can still give it back; lost, with why, where none can any more.
  v_why := public.file_copy_standing(p_tenant_id, p_id);
  update public.files f
     set copy_state = case when v_why is null then 'away' else 'lost' end, copy_why = v_why, media_ref = null,
         updated_at = now()
   where f.tenant_id = p_tenant_id and f.id = p_id and f.copy_state = 'going';
  if not found then
    return false;
  end if;
  -- There is room again: what waited for room in the videos is due now, as when a video is removed (00643).
  update public.source_items i
     set take_after = null
   where i.tenant_id = p_tenant_id and i.state = 'waiting' and i.why = 'room';
  return true;
end $$;

revoke all on function public.file_copy_gone(uuid, uuid) from public, anon, authenticated;
grant execute on function public.file_copy_gone(uuid, uuid) to service_role;
comment on function public.file_copy_gone(uuid, uuid) is
  'A copy marked going was deleted at the video platform (00654): the file is away and holds no id there (lost, with why, where no origin can give it back any more), and the workspace''s items that waited for room in the videos are due at once. Answers whether it was one. The service role''s.';

/* --------------------------------------------------------------------------------------- 6. bringing a copy back -- */

create or replace function public.file_copy_return_begin(
  p_tenant_id             uuid,
  p_id                    uuid,
  p_units                 bigint,
  p_platform_bytes_max    bigint,
  p_workspace_returns_max integer,
  p_units_max             bigint,
  p_stale_seconds         integer
) returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  -- Google counts a day in Pacific time, as a take's budget does (00643 source_take_spend).
  v_day     date := (now() at time zone 'America/Los_Angeles')::date;
  v_from    timestamptz := v_day::timestamp at time zone 'America/Los_Angeles';
  v_until   timestamptz := (v_day + 1)::timestamp at time zone 'America/Los_Angeles';
  v_row     public.files;
  v_why     text;
  v_binds   text;
  v_spent   public.source_days;
  v_returns integer;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_tenant_id::text || '|files', 42));
  select * into v_row from public.files f where f.tenant_id = p_tenant_id and f.id = p_id for update;
  if not found or v_row.removed_at is not null or v_row.kind <> 'video' then
    return jsonb_build_object('fate', 'none');
  end if;
  if v_row.copy_state = any (array['here', 'going']) then
    return jsonb_build_object('fate', v_row.copy_state);
  end if;
  -- Being brought back already: a second asker joins it. One whose job died before the platform was asked (it holds
  -- no id, and nothing touched it for a while) is begun again; its room is still held, and its budget was spent.
  if v_row.copy_state = 'returning'
     and (v_row.media_ref is not null
          or v_row.updated_at >= now() - make_interval(secs => greatest(p_stale_seconds, 0))) then
    return jsonb_build_object('fate', 'returning');
  end if;
  v_why := public.file_copy_standing(p_tenant_id, p_id);
  if v_why is not null then
    update public.files f set copy_state = 'lost', copy_why = v_why, media_ref = null, updated_at = now()
     where f.id = p_id;
    return jsonb_build_object('fate', 'lost', 'why', v_why);
  end if;
  if v_row.copy_state <> 'returning' then
    -- Its own length must fit, as a take's: no room is the caller's to make (file_copies_let_go), and to ask again.
    if public.file_video_room(p_tenant_id, v_row.seconds) = 'minutes' then
      update public.files f set copy_state = 'away', copy_why = 'room', updated_at = now() where f.id = p_id;
      return jsonb_build_object('fate', 'room', 'seconds', v_row.seconds);
    end if;
    -- The day's budgets: each return is a whole download again.
    insert into public.source_days (day) values (v_day) on conflict (day) do nothing;
    select * into v_spent from public.source_days d where d.day = v_day for update;
    select count(*) into v_returns from public.files f
     where f.tenant_id = p_tenant_id and f.copy_returned_at >= v_from;
    v_binds := case
      when v_spent.units + greatest(p_units, 0) > p_units_max then 'units'
      when v_spent.bytes + greatest(v_row.bytes, 0) > p_platform_bytes_max then 'platform_bytes'
      when v_returns + 1 > p_workspace_returns_max then 'workspace_returns'
    end;
    if v_binds is not null then
      update public.files f set copy_state = 'away', copy_why = 'budget', updated_at = now() where f.id = p_id;
      return jsonb_build_object('fate', 'wait', 'binds', v_binds, 'until', v_until);
    end if;
    update public.source_days d
       set bytes = d.bytes + greatest(v_row.bytes, 0), returns = d.returns + 1, updated_at = now()
     where d.day = v_day;
  end if;
  -- Returning from here on, so its length counts toward the minutes before the video platform is asked for anything.
  update public.files f
     set copy_state = 'returning', copy_why = null, media_ref = null,
         copy_returned_at = case when v_row.copy_state = 'returning' then f.copy_returned_at else now() end,
         updated_at = now()
   where f.id = p_id;
  return jsonb_build_object('fate', 'go');
end $$;

revoke all on function public.file_copy_return_begin(uuid, uuid, bigint, bigint, integer, bigint, integer) from public, anon, authenticated;
grant execute on function public.file_copy_return_begin(uuid, uuid, bigint, bigint, integer, bigint, integer) to service_role;
comment on function public.file_copy_return_begin(uuid, uuid, bigint, bigint, integer, bigint, integer) is
  'A copy''s return judged and begun in one place (00654, the footage sources plan''s Availability and D15). Answers {fate}: here or going (nothing to bring back now); returning (one is under way: a second asker joins it); lost, with why (no origin can give it back: written on the row); room, with seconds (the videos are full: the caller lets copies go and asks again); wait, with binds (units, platform_bytes or workspace_returns) and until (a day''s budget, a day as Google counts one); or go, with the copy marked returning so its length is held in the minutes before the video platform is asked. Every number is the caller''s setting; p_units is what the return will still spend at the provider. A return whose job died before the platform was asked (returning, no id, untouched for p_stale_seconds) is begun again. The service role''s.';

create or replace function public.file_copy_returning(p_tenant_id uuid, p_id uuid, p_media_ref text)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  update public.files f
     set media_ref = p_media_ref, updated_at = now()
   where f.tenant_id = p_tenant_id and f.id = p_id and f.removed_at is null
     and f.copy_state = 'returning' and f.media_ref is null;
  return found;
end $$;

revoke all on function public.file_copy_returning(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.file_copy_returning(uuid, uuid, text) to service_role;
comment on function public.file_copy_returning(uuid, uuid, text) is
  'The id the video platform gave a copy coming back (00654), kept on its row: only on one that is returning and holds none, so a second return''s copy is never written over a first''s. Answers whether it was kept; where it was not, the caller deletes that copy. The service role''s.';

create or replace function public.file_copy_return_failed(p_tenant_id uuid, p_id uuid, p_why text, p_media_ref text)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  -- By the attempt's own copy (or none, where the platform was never asked): a later return is never undone by an
  -- earlier one's failure.
  update public.files f
     set copy_state = 'away', copy_why = p_why, media_ref = null, updated_at = now()
   where f.tenant_id = p_tenant_id and f.id = p_id
     and f.copy_state = 'returning' and f.media_ref is not distinct from p_media_ref;
  return found;
end $$;

revoke all on function public.file_copy_return_failed(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.file_copy_return_failed(uuid, uuid, text, text) to service_role;
comment on function public.file_copy_return_failed(uuid, uuid, text, text) is
  'A return that did not happen (00654): the file is away again, with why, and holds no id; its media_status is untouched. Only the attempt named by its own copy''s id (null where the video platform was never asked) is undone. Answers whether it was. The service role''s.';

/* ------------------------------------------------------------------- 7. the video platform's word about a return -- */

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
  -- A copy coming back is not a new video (00654): it is here again, and nothing else. No look is reset, no digest is
  -- put on the ledger, nothing is spent on AI. The row was found by this copy's own id, so a word about an earlier
  -- attempt's copy, which the row no longer holds, never reaches here.
  if v_row.copy_state = 'returning' and v_row.media_ref = p_media_ref then
    update public.files f
       set copy_state = 'here', copy_why = null, copy_used_at = now(), updated_at = now()
     where f.id = v_row.id;
    return jsonb_build_object('fate', 'returned', 'tenant_id', v_row.tenant_id, 'file_id', v_row.id);
  end if;
  -- Delivered again: what was done is done.
  if v_row.media_status in ('ready', 'failed') then
    return jsonb_build_object('fate', 'repeated', 'tenant_id', v_row.tenant_id, 'file_id', v_row.id);
  end if;
  -- A video whose road never said its length is judged by it now (00643), by the one rule every road's door asks: one
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

comment on function public.file_media_ready(text, numeric, integer, integer) is
  'The video platform says a video is playable (00556): found by its id there, made a file whether or not the browser said done, and its digest''s first step put on the ledger. A video made here is its piece made (00613: `made`). A video whose road never said its length (a found one, or a watched folder''s clip its provider had not measured) is judged by it here (00643, file_video_room): one too long or with no room is passed over and removed, a found one counted on its road''s line. A copy coming back (00654) is here again and nothing else: no look, no digest. Answers {fate: ready, returned, repeated, gone, unknown or passed (why: long or minutes), tenant_id, file_id, made}. The service role''s.';

create or replace function public.file_media_failed(p_media_ref text, p_error text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_row    public.files;
  v_failed boolean;
  v_made   boolean := false;
begin
  select * into v_row from public.files f where f.media_ref = p_media_ref;
  if not found then
    return jsonb_build_object('fate', 'unknown');
  end if;
  perform pg_advisory_xact_lock(hashtextextended(v_row.tenant_id::text || '|files', 42));
  -- A copy that could not be prepared again (00654): the file stays as it was, away, with why, and lets go of the
  -- failed copy's id (the caller deletes it at the platform). Its media_status is never touched: the video itself was
  -- prepared once, and still is what its stills and its words say.
  update public.files f
     set copy_state = 'away', copy_why = 'failed', media_ref = null, updated_at = now()
   where f.id = v_row.id and f.removed_at is null and f.copy_state = 'returning' and f.media_ref = p_media_ref;
  if found then
    return jsonb_build_object('fate', 'unreturned', 'tenant_id', v_row.tenant_id, 'file_id', v_row.id, 'made', false);
  end if;
  update public.files f
     set media_status = 'failed',
         media_error = left(coalesce(nullif(p_error, ''), 'ERR_UNKNOWN'), 80),
         look_status = case when f.look_status = 'waiting' then 'failed' else f.look_status end,
         looked_at = now(),
         updated_at = now()
   where f.id = v_row.id and f.removed_at is null and f.media_status in ('uploading', 'processing');
  v_failed := found;
  -- A video made here that the platform could not read (00613): its piece says so.
  if v_failed then
    update public.pieces p set status = 'failed', failed_why = 'store', machine = null, updated_at = now()
     where p.tenant_id = v_row.tenant_id and p.file_id = v_row.id and p.status = 'making';
    v_made := found;
  end if;
  return jsonb_build_object('fate', case when v_failed then 'failed' else 'repeated' end,
                            'tenant_id', v_row.tenant_id, 'file_id', v_row.id, 'made', v_made);
end $$;

comment on function public.file_media_failed(text, text) is
  'The video platform could not read a video (00556): its tile says so, and its owner can delete it. A video made here is its piece failed (00613: `made`). A copy that could not be prepared again (00654) leaves its file away, with why, its media_status untouched. Answers {fate: failed, unreturned, repeated or unknown, tenant_id, file_id, made}. The service role''s.';

/* ------------------------------------------------------------------------ 8. a take holds its room as it is judged -- */

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
  -- What this take held at an earlier judging is let go of first (00654), so it is never counted against itself.
  update public.source_items i set held_seconds = null
   where i.tenant_id = p_tenant_id and i.id = p_item_id and i.held_seconds is not null;
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
  -- The clip's own length must fit, as every video's: long, minutes or room. What other takes hold is counted.
  v_room := public.file_video_room(p_tenant_id, p_seconds);
  -- No copy named: only the judging was asked for, before the video platform is.
  if v_room <> 'room' or p_media_ref is null then
    -- Judged to fit: its room is held from now until its row is written (00654, the review's finding 9), so the takes
    -- beside it are judged with it counted, and none is fetched only to be deleted.
    if v_room = 'room' then
      update public.source_items i set held_seconds = coalesce(p_seconds, 0)
       where i.tenant_id = p_tenant_id and i.id = p_item_id and i.state = 'taking';
    end if;
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

comment on function public.file_video_sourced(uuid, uuid, uuid, text, text, text, bigint, numeric, text) is
  'A watched folder''s clip on its way (00643), a sibling of file_video_found that takes the clip''s size and length. With no copy named it only judges, before the video platform is asked: {fate: room, here, let_go, full, minutes or long}; judged to fit, its item holds that room until its row is written (00654, source_items.held_seconds). With one it writes the row, uploading and filed, and makes the item its origin: {fate: kept, file_id, media_ref}. Its twin is by its bytes'' fingerprint, as an upload''s. The service role''s.';

/* -------------------------------------------------------------------------------------- 9. the seven-day cleanup -- */

create or replace function public.source_items_grace_end(p_grace_seconds integer, p_limit integer)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_item    record;
  v_removed integer := 0;
  v_kept    integer := 0;
  v_cleared integer := 0;
begin
  -- Only an item seen in its provider's bin (gone) or moved out to a place its account can see (outside), that long
  -- ago. Never one that only vanished (no_access), and never a file by itself: a disconnect deletes an account's items
  -- by cascade, and the Library's files stay.
  for v_item in
    select i.id, i.tenant_id, i.file_id
      from public.source_items i
     where i.state = any (array['gone', 'outside'])
       and i.gone_at < now() - make_interval(secs => greatest(p_grace_seconds, 0))
     order by i.gone_at
     limit greatest(p_limit, 1)
     for update skip locked
  loop
    -- One at a time a workspace, as every door that files or removes takes it. One busy just now waits for the next turn.
    continue when not pg_try_advisory_xact_lock(hashtextextended(v_item.tenant_id::text || '|files', 42));
    if v_item.file_id is not null
       and exists (select 1 from public.files f where f.id = v_item.file_id and f.removed_at is null) then
      if exists (select 1 from public.source_items o
                  where o.tenant_id = v_item.tenant_id and o.file_id = v_item.file_id and o.id <> v_item.id)
         or exists (select 1 from public.posts p
                     where p.tenant_id = v_item.tenant_id and p.file_id = v_item.file_id)
         or exists (select 1 from public.pieces p
                     where p.tenant_id = v_item.tenant_id and p.status = any (array['making', 'made'])
                       and position(v_item.file_id::text in p.plan::text) > 0)
         or exists (select 1 from public.files m
                     where m.tenant_id = v_item.tenant_id and m.id <> v_item.file_id and m.removed_at is null
                       and m.made is not null and position(v_item.file_id::text in m.made::text) > 0) then
        -- Another origin holds it, or a post or a video made here used it: it stays.
        v_kept := v_kept + 1;
      else
        -- Removed as a twin is, never as a person removes one: nothing is written to files_let_go, so the same bytes
        -- put back in the folder come in again.
        update public.files f set removed_at = now(), updated_at = now() where f.id = v_item.file_id;
        insert into public.jobs (tenant_id, kind, due_at, payload)
        values (v_item.tenant_id, 'file_purge', now(), jsonb_build_object('file_id', v_item.file_id, 'why', 'remove'))
        on conflict do nothing;
        insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
        values (v_item.tenant_id, 'file.removed', 'setup', 'workspace', v_item.tenant_id,
                jsonb_build_object('file_id', v_item.file_id, 'why', 'source_gone'));
        v_removed := v_removed + 1;
      end if;
    end if;
    -- The tombstone has said what it had to: its row goes. A file it leaves with no origin says so (file_copy_settle).
    delete from public.source_items i where i.id = v_item.id;
    v_cleared := v_cleared + 1;
  end loop;
  return jsonb_build_object('removed', v_removed, 'kept', v_kept, 'cleared', v_cleared);
end $$;

revoke all on function public.source_items_grace_end(integer, integer) from public, anon, authenticated;
grant execute on function public.source_items_grace_end(integer, integer) to service_role;
comment on function public.source_items_grace_end(integer, integer) is
  'The seven-day cleanup (00654, the footage sources plan''s D3 as narrowed on 18 November): each item seen in its provider''s bin (gone) or moved out to a place its account can see (outside) p_grace_seconds ago, oldest first, p_limit at most. Its Library file is removed only if no other origin holds it and nothing used it (a post, a video made or being made, a file made from it), as a twin is removed: nothing is written to files_let_go. Then the item''s row is deleted. It reads tombstones only: an item that vanished (no_access) and a file with no origin are never touched. Answers {removed, kept, cleared}. The service role''s.';

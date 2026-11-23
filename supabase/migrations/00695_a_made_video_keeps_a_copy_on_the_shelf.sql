-- A made video keeps a copy on the shelf (the archive plan's B2, 23 November 2026; its PRD is version 1.1).
--
-- A video Chanlytics made held its place in a workspace's sixty minutes for good: nothing could give it back, so it
-- could never be let go. It now keeps a checked copy on a shelf of Chanlytics' own (a private bucket behind the
-- relay), so its copy at the video platform steps aside as a watched folder's clip does and comes back on Play, with
-- no Google key anywhere. The tables are 00686's; this is the rules over them.
--
--   files_copy_shape          any video's copy may be other than here; which may is the doors' to say, below.
--   file_copy_shelved         whether a file has a checked copy on the shelf. The one place that says so.
--   file_copy_standing,       a file with a shelf copy, or one being put there, is not lost; and settle says whether
--   file_copy_settle          the shelf can give it back.
--   file_copies_let_go,       a copy may step aside where it is a watched clip that comes back (as before) or has a
--   file_copies_free_at,      checked shelf copy. Every other condition stays. The same signatures and answers.
--   video_minutes_by_road
--   file_copy_kept            a copy marked going is here again: its shelf copy was not what it should be, so
--                             nothing was deleted.
--   file_copy_return_begin    a return from the shelf spends nothing at Google: its units and the platform's bytes
--                             are neither asked nor written; the workspace's returns a day still bind.
--   file_shelf_begin          a made video's shelf copy begun, and its job written, in one step: the row and its
--                             piece (the bytes and the SHA-256 taken as the video was made), within the shelf's room.
--   file_shelf_checked        what the shelf holds compared with what was sent: checked, or failed as a mismatch.
--   file_shelf_failed         a copy that could not be put, and why.
--   file_shelf_again          a copy found missing or wrong is put back: saving again, with its job, in one step.
--   file_shelf_requeue        a copy left saving for a long while gets its job again: the floor under the two above.
--   job_kinds                 file_shelve.
--
-- Additive. Applied before the code that reads it; the code live today runs on it unchanged: it never moves a copy
-- that is not a watched clip's, and every answer it reads keeps its shape. Re-runnable throughout.

set local lock_timeout = '3s';

/* ------------------------------------------------------------------------------ 1. any video's copy may step aside -- */

-- A copy that is away or lost holds no id, and why is said only of one that is away or lost, as before. That only a
-- watched folder's clip was ever anything but here is no longer so: a video with a checked shelf copy may be too.
alter table public.files drop constraint if exists files_copy_shape;
alter table public.files add constraint files_copy_shape
  check ((copy_state = 'here' or kind = 'video')
         and (copy_state <> all (array['away', 'lost']) or media_ref is null)
         and (copy_why is null or copy_state = any (array['away', 'lost'])));

/* ------------------------------------------------------------------------- 2. what the shelf can give back, once -- */

create or replace function public.file_copy_shelved(p_tenant_id uuid, p_file_id uuid)
returns boolean
language sql
stable
set search_path to 'public'
as $$
  -- A shelf copy that was compared whole with what was sent, its video's piece too. Reads nothing a member may not:
  -- neither the piece's key nor its checksums.
  select exists (
    select 1 from public.file_archives a
      join public.file_archive_parts p on p.tenant_id = a.tenant_id and p.archive_id = a.id
     where a.tenant_id = p_tenant_id and a.file_id = p_file_id and a.origin = 'shelf' and a.state = 'checked'
       and p.part = 'video' and p.state = 'checked')
$$;

revoke all on function public.file_copy_shelved(uuid, uuid) from public, anon;
grant execute on function public.file_copy_shelved(uuid, uuid) to authenticated, service_role;
comment on function public.file_copy_shelved(uuid, uuid) is
  'Whether a file''s video has a checked copy on Chanlytics'' own shelf (00695, the archive plan''s B2): a file_archives row of origin shelf that is checked, whose video piece is checked. The one place that says so: file_copy_standing, file_copy_settle, file_copies_let_go, file_copies_free_at, video_minutes_by_road and file_copy_return_begin ask it. A saved or a picked copy never counts. Runs as its caller: a member reads only their own workspace''s rows.';

create or replace function public.file_copy_standing(p_tenant_id uuid, p_file_id uuid)
returns text
language sql
stable
set search_path to 'public'
as $$
  select case
    -- The shelf holds it (00695): it comes back from there, whatever became of a folder.
    when public.file_copy_shelved(p_tenant_id, p_file_id) then null
    -- Its shelf copy is on its way there, the first time or put back, or could not be put because the shelf gave no
    -- answer: the file it is put from is still Chanlytics' own, so it is not lost. Only a copy whose own file is
    -- gone or is other bytes (not_found, mismatch) leaves nothing to put back.
    when exists (select 1 from public.file_archives a
                  where a.tenant_id = p_tenant_id and a.file_id = p_file_id and a.origin = 'shelf'
                    and (a.state = any (array['saving', 'saved']) or (a.state = 'failed' and a.why = 'refused')))
      then null
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

comment on function public.file_copy_standing(uuid, uuid) is
  'Why a file''s copy cannot be fetched again, or null where something can give it back (00654; 00695 adds the shelf): null where the file has a checked copy on the shelf, one on its way there or being put back, or one the shelf would not take just now; null where a watched folder''s item holds it; else gone (seen in its provider''s bin), outside (moved out of the watched folder), not_found (its provider no longer shows it), no_access (its provider no longer lets it be read), no_origin (nothing holds it: no shelf copy can be put, and no watched folder has it). The one place that says so. Its doors''.';

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
                            'item_id', public.file_copy_origin(p_tenant_id, p_file_id),
                            'shelf', public.file_copy_shelved(p_tenant_id, p_file_id));
end $$;

comment on function public.file_copy_settle(uuid, uuid) is
  'A copy that is away or lost set to what its origins now say (00654): lost with why where none can give it back, away again where one can. A wait''s own reason on an away copy is left. Answers {copy_state, copy_why, item_id: the watched item a return would read, shelf: whether the shelf holds a checked copy (00695), which a return reads first}. The service role''s.';

/* ------------------------------------------------------------------- 3. a shelved video steps aside, as a clip does -- */

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
    -- Only what can come back is let go by itself: a watched folder's clip its owner did not also upload, that can
    -- be fetched again (00674: a folder being read, or one stopped whose account reads), or a video with a checked
    -- copy on the shelf (00695); playable, looked at (or past the week a look is tried again in); named by no video
    -- being made; and not used, or arrived, since the rest began.
    select f.id, f.seconds, coalesce(f.copy_used_at, f.ready_at, f.created_at) as used_at
      from public.files f
     where f.tenant_id = p_tenant_id and f.kind = 'video'
       and f.removed_at is null and f.copy_state = 'here' and f.media_status = 'ready' and f.media_ref is not null
       and (f.look_status = any (array['done', 'refused']) or f.created_at < now() - interval '7 days')
       and coalesce(f.copy_used_at, f.ready_at, f.created_at) < p_rested_before
       and ((public.file_road_is_watched(f.source) and not f.owner_uploaded
             and public.file_copy_comes_back(f.tenant_id, f.id))
            or public.file_copy_shelved(f.tenant_id, f.id))
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
  'A workspace''s copies marked going (00654, the footage sources plan''s D6). By room (p_seconds: a video of that length must fit): the least recently used first, as many as free what is short, and none where all that may go would not free it. By age (p_seconds null): each one unused since p_unused_before. Only a copy something can give back: a watched folder''s clip its owner did not also upload that can be fetched again (file_copy_comes_back, 00674), or a video with a checked copy on the shelf (file_copy_shelved, 00695); playable, looked at, named by no video being made, and not used or arrived since p_rested_before; p_limit at most. Never an upload or a found video, nor a made video the shelf does not hold. Answers [{id, media_ref, seconds}]: the caller checks a shelved one''s copy on the shelf, deletes each at the video platform, then says so (file_copy_gone), or says it stayed (file_copy_kept). The service role''s.';

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
   where f.tenant_id = p_tenant_id and f.kind = 'video'
     and f.removed_at is null and f.copy_state = 'here' and f.media_status = 'ready' and f.media_ref is not null
     and ((public.file_road_is_watched(f.source) and not f.owner_uploaded
           and public.file_copy_comes_back(f.tenant_id, f.id))
          or public.file_copy_shelved(f.tenant_id, f.id))
     and (coalesce(f.copy_used_at, f.ready_at, f.created_at) >= now() - make_interval(secs => p_rest_seconds)
          or (f.look_status <> all (array['done', 'refused']) and f.created_at >= now() - interval '7 days')
          or exists (select 1 from public.pieces p
                      where p.tenant_id = f.tenant_id and p.status = 'making'
                        and position(f.id::text in p.plan::text) > 0))
$$;

comment on function public.file_copies_free_at(uuid, integer) is
  'When a copy that may not be let go yet could be (00654): the earliest end of a resting copy''s rest (p_rest_seconds after its last use or its arrival), or the rest from now for one a look not done or a video being made still holds. Null where no copy of the workspace ever may go: what fills its minutes is uploads and found videos, clips that cannot be fetched again (file_copy_comes_back, 00674), or made videos the shelf does not hold (file_copy_shelved, 00695). A take that found the videos full waits until then. The service role''s.';

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
      where c.copy_state = 'here' and c.media_status = 'ready'
        and ((public.file_road_is_watched(c.source) and not c.owner_uploaded
              and public.file_copy_comes_back(p_tenant_id, c.id))
             or public.file_copy_shelved(p_tenant_id, c.id))), 0),
    'set_aside', coalesce(sum(c.seconds) filter (where c.status = 'set_aside'), 0),
    'own', coalesce(sum(c.seconds) filter (where c.status <> 'set_aside'
                                             and (c.source = 'upload' or c.owner_uploaded)), 0),
    'made', coalesce(sum(c.seconds) filter (where c.status <> 'set_aside' and c.source = 'made'), 0),
    'found', coalesce(sum(c.seconds) filter (
      where c.status <> 'set_aside' and not c.owner_uploaded
        and c.source = any (array['google_profile', 'google_listing', 'website', 'instagram'])), 0))
    from counted c
$$;

create or replace function public.file_copy_kept(p_tenant_id uuid, p_id uuid)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(p_tenant_id::text || '|files', 42));
  -- Marked going, and nothing was deleted: it still holds its id at the video platform, and plays.
  update public.files f
     set copy_state = 'here', copy_why = null, updated_at = now()
   where f.tenant_id = p_tenant_id and f.id = p_id and f.copy_state = 'going' and f.media_ref is not null;
  return found;
end $$;

revoke all on function public.file_copy_kept(uuid, uuid) from public, anon, authenticated;
grant execute on function public.file_copy_kept(uuid, uuid) to service_role;
comment on function public.file_copy_kept(uuid, uuid) is
  'A copy marked going is here again (00695): its copy on the shelf was not what it should be, or the shelf gave no answer, so nothing was deleted at the video platform and the video plays as it did. Only one that is going and still holds its id. Answers whether it was one. The service role''s.';

/* ----------------------------------------------------------------- 4. a return from the shelf spends no provider's day -- */

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
  v_shelf   boolean;
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
    select count(*) into v_returns from public.files f
     where f.tenant_id = p_tenant_id and f.copy_returned_at >= v_from;
    v_shelf := public.file_copy_shelved(p_tenant_id, p_id);
    if v_shelf then
      -- From the shelf (00695): Chanlytics' own, so nothing of a provider's day is asked or written. The workspace's
      -- own number of returns a day still binds.
      if v_returns + 1 > p_workspace_returns_max then
        update public.files f set copy_state = 'away', copy_why = 'budget', updated_at = now() where f.id = p_id;
        return jsonb_build_object('fate', 'wait', 'binds', 'workspace_returns', 'until', v_until);
      end if;
    else
      -- The day's budgets: each return is a whole download again.
      insert into public.source_days (day) values (v_day) on conflict (day) do nothing;
      select * into v_spent from public.source_days d where d.day = v_day for update;
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
  end if;
  -- Returning from here on, so its length counts toward the minutes before the video platform is asked for anything.
  update public.files f
     set copy_state = 'returning', copy_why = null, media_ref = null,
         copy_returned_at = case when v_row.copy_state = 'returning' then f.copy_returned_at else now() end,
         updated_at = now()
   where f.id = p_id;
  return jsonb_build_object('fate', 'go');
end $$;

comment on function public.file_copy_return_begin(uuid, uuid, bigint, bigint, integer, bigint, integer) is
  'A copy''s return judged and begun in one place (00654, the footage sources plan''s Availability and D15). Answers {fate}: here or going (nothing to bring back now); returning (one is under way: a second asker joins it); lost, with why (nothing can give it back: written on the row); room, with seconds (the videos are full: the caller lets copies go and asks again); wait, with binds (units, platform_bytes or workspace_returns) and until (a day''s budget, a day as Google counts one); or go, with the copy marked returning so its length is held in the minutes before the video platform is asked. Every number is the caller''s setting; p_units is what the return will still spend at the provider. A return from the shelf (file_copy_shelved, 00695) spends nothing at a provider: only the workspace''s returns a day bind, and the day''s line is not written. A return whose job died before the platform was asked (returning, no id, untouched for p_stale_seconds) is begun again. The service role''s.';

/* ------------------------------------------------------------------------------------------- 5. the shelf's doors -- */

insert into public.job_kinds (kind, lane, once_parts, once_kept) values
  ('file_shelve', 2, array['@tenant', 'file_id'], false)
on conflict (kind) do update
  set lane = excluded.lane, once_parts = excluded.once_parts, once_kept = excluded.once_kept;

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
  v_used  numeric;
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
  -- The shelf's room: what is there and what is on its way there, together (contracts FILE_SHELF_MINUTES_MAX).
  select coalesce(sum(f.seconds), 0) into v_used
    from public.file_archives a
    join public.files f on f.tenant_id = a.tenant_id and f.id = a.file_id
   where a.tenant_id = p_tenant_id and a.origin = 'shelf' and a.state = any (array['saving', 'saved', 'checked'])
     and f.removed_at is null;
  if v_used + coalesce(v_file.seconds, 0) > p_seconds_max then
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
  return jsonb_build_object('fate', 'begun');
end $$;

revoke all on function public.file_shelf_begin(uuid, uuid, bigint, text, numeric) from public, anon, authenticated;
grant execute on function public.file_shelf_begin(uuid, uuid, bigint, text, numeric) to service_role;
comment on function public.file_shelf_begin(uuid, uuid, bigint, text, numeric) is
  'A made video''s copy on the shelf begun (00695, the archive plan''s B2). Answers {fate}: none (no such video, removed, or not made here); kept, with state (it has a shelf copy already); full (the workspace''s shelved seconds and this video''s would pass p_seconds_max, the caller''s setting: contracts FILE_SHELF_MINUTES_MAX); or begun: the copy saving, its video piece with its key (workspace/file/video), the bytes and the SHA-256 taken as the video was made, and its file_shelve job, all in this one step. The service role''s.';

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
    return 'checked';
  end if;
  update public.file_archive_parts p set state = 'failed', checked_at = null
   where p.tenant_id = p_tenant_id and p.archive_id = v_id and p.part = 'video';
  update public.file_archives a set state = 'failed', why = 'mismatch', checked_at = null where a.id = v_id;
  -- A copy that is away with nothing left to give it back says so.
  perform public.file_copy_settle(p_tenant_id, p_file_id);
  return 'mismatch';
end $$;

revoke all on function public.file_shelf_checked(uuid, uuid, bigint, text) from public, anon, authenticated;
grant execute on function public.file_shelf_checked(uuid, uuid, bigint, text) to service_role;
comment on function public.file_shelf_checked(uuid, uuid, bigint, text) is
  'What the shelf holds of a video compared with what was sent (00695): p_bytes and p_sha256 are the shelf''s own record. Equal to the piece''s own: the copy and its piece are checked, answers checked (and so again for one already checked). Anything else, a SHA-256 the shelf does not say among it: both failed, why mismatch, answers mismatch, and a copy that is away with nothing left to give it back is settled as lost. No copy saving: none. The service role''s.';

create or replace function public.file_shelf_failed(p_tenant_id uuid, p_file_id uuid, p_why text)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_id uuid;
begin
  if p_why is null or p_why <> all (array['mismatch', 'not_found', 'refused']) then
    raise exception 'A shelf copy fails as a mismatch, as not found, or as refused.' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_tenant_id::text || '|files', 42));
  update public.file_archives a set state = 'failed', why = p_why, checked_at = null
   where a.tenant_id = p_tenant_id and a.file_id = p_file_id and a.origin = 'shelf'
     and a.state = any (array['saving', 'saved'])
  returning a.id into v_id;
  if not found then
    return false;
  end if;
  update public.file_archive_parts p set state = 'failed', checked_at = null
   where p.tenant_id = p_tenant_id and p.archive_id = v_id and p.part = 'video';
  -- Not found, or other bytes: the file it is put from is gone or is not the video, so a copy that is away has
  -- nothing left to give it back, and says so. Refused (the shelf would not take it) loses nothing.
  perform public.file_copy_settle(p_tenant_id, p_file_id);
  return true;
end $$;

revoke all on function public.file_shelf_failed(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.file_shelf_failed(uuid, uuid, text) to service_role;
comment on function public.file_shelf_failed(uuid, uuid, text) is
  'A shelf copy that could not be put (00695): one saving is failed, with why: mismatch (the bytes it is put from are not the video''s), not_found (the file it is put from is gone) or refused (the shelf would not take it, or its job ended). The video keeps its place at the video platform and cannot step aside. A copy that is away is then settled: lost where nothing is left to give it back (mismatch, not_found), away still where the shelf only refused. Answers whether one was saving. The service role''s.';

create or replace function public.file_shelf_again(p_tenant_id uuid, p_file_id uuid)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_id uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_tenant_id::text || '|files', 42));
  -- The same bytes and the same SHA-256 are kept: only those can ever be put under its key.
  update public.file_archives a set state = 'saving', why = null, checked_at = null
   where a.tenant_id = p_tenant_id and a.file_id = p_file_id and a.origin = 'shelf'
     and a.state = any (array['checked', 'failed'])
     and exists (select 1 from public.files f
                  where f.tenant_id = a.tenant_id and f.id = a.file_id and f.removed_at is null)
  returning a.id into v_id;
  if not found then
    return false;
  end if;
  update public.file_archive_parts p set state = 'saving', checked_at = null
   where p.tenant_id = p_tenant_id and p.archive_id = v_id and p.part = 'video';
  insert into public.jobs (tenant_id, kind, due_at, payload)
  values (p_tenant_id, 'file_shelve', now(), jsonb_build_object('file_id', p_file_id::text))
  on conflict do nothing;
  return true;
end $$;

revoke all on function public.file_shelf_again(uuid, uuid) from public, anon, authenticated;
grant execute on function public.file_shelf_again(uuid, uuid) to service_role;
comment on function public.file_shelf_again(uuid, uuid) is
  'A shelf copy put back (00695): one that was checked and is found missing or wrong on the shelf, or one that failed, is saving again with its file_shelve job, in one step, its bytes and SHA-256 kept. Its video is not one that may step aside until it is checked again, and one that is away is not lost while this runs. Not for a removed file. Answers whether it was begun. The service role''s.';

-- The copies left saving, found by how long: what the requeue below reads. Few rows at any time.
create index if not exists file_archives_shelf_saving
  on public.file_archives (updated_at) where origin = 'shelf' and state = 'saving';

create or replace function public.file_shelf_requeue(p_stale_seconds integer, p_limit integer)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_count integer;
begin
  with stale as (
    select a.id from public.file_archives a
     where a.origin = 'shelf' and a.state = 'saving'
       and a.updated_at < now() - make_interval(secs => greatest(p_stale_seconds, 0))
     order by a.updated_at
     limit greatest(p_limit, 0)
       for update skip locked
  ),
  touched as (
    -- Touched, so one is asked for again once a stale stretch and no oftener.
    update public.file_archives a set updated_at = now()
      from stale s where a.id = s.id
    returning a.tenant_id, a.file_id
  ),
  queued as (
    insert into public.jobs (tenant_id, kind, due_at, payload)
    select t.tenant_id, 'file_shelve', now(), jsonb_build_object('file_id', t.file_id::text) from touched t
    on conflict do nothing
    returning 1
  )
  select count(*) into v_count from queued;
  return v_count;
end $$;

revoke all on function public.file_shelf_requeue(integer, integer) from public, anon, authenticated;
grant execute on function public.file_shelf_requeue(integer, integer) to service_role;
comment on function public.file_shelf_requeue(integer, integer) is
  'Shelf copies left saving for p_stale_seconds get their file_shelve job written again (00695), p_limit at most, for every workspace in one statement: the floor under file_shelf_begin and file_shelf_again, which write the job themselves. One whose job is still on the ledger gets none (a job is held once a file). Answers how many jobs it wrote. The service role''s.';

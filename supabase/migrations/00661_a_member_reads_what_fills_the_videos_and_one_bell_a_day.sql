-- What the first real run of a watched folder found in 00657 (20 November 2026), mended in the database.
--
--   video_minutes_by_road   Read as a member, it was refused ("permission denied for table files"): it read
--                           files.owner_uploaded and files.media_ref, and a member's grant on files is by column
--                           (00551: never the copy's id). So while a clip waited for room the folder's whole read
--                           failed, and the row in Settings, Content's card and the Library's line said nothing in the
--                           one state where they have something to say. A member may now read owner_uploaded (whether
--                           an upload met a folder's file: a yes or a no on a row of their own workspace), and the
--                           copy's id is no longer read: a video whose copy is here holds its id by files_media_shape,
--                           so copy_state = 'here' already says so.
--   files_ring_footage_in   The day's "N new photos and videos" was found by its folder, so a folder switched the
--                           same day began a second row and left the first open at an older count. It is found by the
--                           workspace's day now and follows the folder watched, and a second row already open that
--                           day is closed: one row a day, as its own comment says.

set local lock_timeout = '3s';

grant select (owner_uploaded) on public.files to authenticated;

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
        and c.media_status = 'ready'
        and exists (select 1 from public.source_items i
                      join public.media_sources s on s.id = i.source_id
                     where i.tenant_id = p_tenant_id and i.file_id = c.id and i.state = 'in'
                       and s.state = any (array['setting_up', 'watching']))), 0),
    'set_aside', coalesce(sum(c.seconds) filter (where c.status = 'set_aside'), 0),
    'own', coalesce(sum(c.seconds) filter (where c.status <> 'set_aside'
                                             and (c.source = 'upload' or c.owner_uploaded)), 0),
    'made', coalesce(sum(c.seconds) filter (where c.status <> 'set_aside' and c.source = 'made'), 0),
    'found', coalesce(sum(c.seconds) filter (
      where c.status <> 'set_aside' and not c.owner_uploaded
        and c.source = any (array['google_profile', 'google_listing', 'website', 'instagram'])), 0))
    from counted c
$$;

create or replace function public.files_ring_footage_in()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_source  public.media_sources;
  v_zone    text;
  v_day     timestamptz;
  v_count   integer;
  v_title   text;
  v_body    text;
  v_row     uuid;
begin
  select * into v_source from public.media_sources s
   where s.tenant_id = new.tenant_id and s.state <> 'stopped'
   order by s.created_at desc limit 1;
  if not found then
    return new;
  end if;
  -- Two files landing at once count once each and keep one row: the second waits for the first's count.
  perform pg_advisory_xact_lock(hashtext('footage_in:' || new.tenant_id::text));
  select t.timezone into v_zone from public.tenants t where t.id = new.tenant_id;
  v_day := date_trunc('day', now() at time zone coalesce(v_zone, 'UTC')) at time zone coalesce(v_zone, 'UTC');
  select count(*) into v_count from public.files f
   where f.tenant_id = new.tenant_id and f.source = 'drive' and f.created_at >= v_day and f.removed_at is null;
  v_title := case when v_count = 1 then '1 new photo or video'
                  else to_char(v_count, 'FM999,999,999') || ' new photos and videos' end;
  v_body := 'From ' || public.footage_quoted(v_source.folder_name) || ' · in your Library';

  -- The workspace's row of the day, whichever folder began it: a folder switched the same day keeps it.
  select n.id into v_row from public.notifications n
   where n.tenant_id = new.tenant_id
     and n.kind = 'footage_in'
     and n.closed_at is null
     and n.created_at >= v_day
   order by n.created_at desc
   limit 1;
  if v_row is not null then
    update public.notifications n
       set title = v_title, body = v_body, created_at = now(),
           subject_type = 'media_source', subject_id = v_source.id::text
     where n.id = v_row;
    -- A second row of the day, begun before this by a folder switched the same day, is closed: one row a day.
    update public.notifications n set closed_at = now()
     where n.tenant_id = new.tenant_id
       and n.kind = 'footage_in'
       and n.closed_at is null
       and n.created_at >= v_day
       and n.id <> v_row;
  else
    insert into public.notifications (tenant_id, kind, title, body, subject_type, subject_id)
    values (new.tenant_id, 'footage_in', v_title, v_body, 'media_source', v_source.id::text);
  end if;
  return new;
end $$;

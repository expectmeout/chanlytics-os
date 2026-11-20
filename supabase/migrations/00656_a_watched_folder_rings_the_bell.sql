-- A watched folder rings the bell (the footage sources plan's P5, part 2, 20 November 2026; the screens canvas's Bell
-- and Removed boards, calls 3 and 8).
--
-- The bell is for what happened while the owner was away. A folder rings it for two things only: new photos and videos,
-- as one notice that counts up through the day, and a folder or its account that needs a person, which closes by itself
-- once it is mended. It never rings for one file, a clip stepping aside or coming back, or a wait that ends by itself.
--
-- The rows follow the folder's own state, so nothing in the sync has to remember to ring: a trigger on each table that
-- holds the state rings when it turns and closes when it turns back.
--
--   media_sources.stopped_why     Why a folder is not read whole, as one closed word (no more sentence to guess from).
--   copy_why, source_items.why   Gain stream_full: the platform's own storage spent, said as "taking longer".
--   notifications.kind            Gains footage (a folder or its account needs someone: Settings › Connections) and
--                                 footage_in (the day's new photos and videos, counted up in place: the Library).
--   footage_hearers               Who hears a folder that needs someone: the members who may change the settings
--                                 (has_permission settings: an owner or a partner) and whoever connected it.
--   footage_ring                  One footage row for each of them, unless the same one is open already: never a new
--                                 row each day for the same wait.
--   source_connections_ring       Google signed the account out: "Google Drive needs you", closed once it is
--                                 connected again or let go.
--   media_sources_ring            The folder paused because whoever connected it left, the folder that can't be
--                                 opened, a wave of removals held for a second look; each closed when it ends, and
--                                 all of them when the folder stops or goes.
--   files_ring_footage_in         A file that came from the folder: the day's notice, brought up to date in place.
--   video_minutes_by_road         What fills the sixty minutes of video, by road, and how much of it can step aside
--                                 by itself (call 3: "wait for room" against "Videos are full", which only the owner
--                                 can mend). A member's own read.
--   source_items_ring_full        A clip that begins to wait for room where nothing can step aside: "Videos are
--                                 full", once, closed when no clip waits for room.
--   source_files_remove           "Remove what came from it too" (Settings 19): what the folder brought and nothing
--                                 used leaves the Library as a person's Remove takes it. A member's door.
--   files.origin_left(_at)        How and when a file's original left its folder, for its row's "leaves Nov 26".
--   files_tallied                 The Library counted, grouped: true past a thousand rows (call 4).
--   piece_stage, pieces.stage     from_drive: a video being made waits for its clips coming back (call 2).
--   memberships_wake_their_folders  Someone left: the folders their account reads are read at the next turn of the
--                                 clock, so the sync's own rule (the plan's D13: a departed person's key does not keep
--                                 working) pauses them within five minutes, not at the next quiet read an hour on.
--   workspace_tell_update         (on notifications) also hears a title change, so a page holding the bell hears the
--                                 count go up.
--
-- Deploy order: either. The rows are written by the database alone; an older page draws an unknown kind as a plain
-- alert. Re-runnable throughout.

set local lock_timeout = '3s';

/* ------------------------------------------------------------------- 0. why a folder is not read whole, a word -- */

-- The sync wrote a sentence into last_error when a folder paused, froze or held more than is listed, and the screens
-- guessed the cause back (the plan session's review of 20 Nov, finding 1). One closed word now says it, which the
-- screens, the bell and AI all key on; last_error is no longer written (no folder on production has one yet).
alter table public.media_sources add column if not exists stopped_why text;
alter table public.media_sources drop constraint if exists media_sources_stopped_why_check;
alter table public.media_sources add constraint media_sources_stopped_why_check
  check (stopped_why is null or stopped_why = any (array['signed_out', 'connector_left', 'cant_open', 'over_listed']));
comment on column public.media_sources.stopped_why is
  'Why a watched folder is not read whole (00656): signed_out (its account''s grant was refused), connector_left (whoever connected it left the workspace), cant_open (the folder cannot be opened), over_listed (it holds more than is listed); null while it is read whole. When: last_error_at.';

-- The video platform's own storage spent is its own word (the review's finding 3), never "videos aren't on": a take
-- and a return each wait with it, and the business is told only that it takes longer and Chanlytics keeps trying.
alter table public.files drop constraint if exists files_copy_why_check;
alter table public.files add constraint files_copy_why_check
  check (copy_why is null or copy_why = any (array['room', 'budget', 'folder', 'videos_off', 'busy', 'stream_full',
                                                   'unreadable', 'changed', 'failed', 'stopped', 'gone', 'outside',
                                                   'not_found', 'no_access', 'no_origin']));
alter table public.source_items drop constraint if exists source_items_why_check;
alter table public.source_items add constraint source_items_why_check
  check (why is null or why = any (array['budget', 'room', 'library_full', 'videos_off', 'busy', 'stream_full',
                                         'folder', 'pace', 'deadline', 'retry', 'lost', 'kind', 'empty', 'too_small',
                                         'unreadable', 'bytes', 'seconds', 'pixels', 'stopped', 'stream',
                                         'not_found']));

/* ---------------------------------------------------------------------------------------- 1. the bell's kinds -- */

alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind = any (array['handoff', 'deadman', 'call', 'number', 'sweep', 'job_failed', 'playbook',
                           'calendar_people', 'alert', 'review', 'billing', 'template_ready', 'template_blocked',
                           'broadcast_sent', 'broadcast_stopped', 'leads_ready', 'leads_question', 'note_for_you',
                           'reach_out_replied', 'reach_out_day', 'booking_notice', 'opted_out', 'booking',
                           'member_joined', 'member_left', 'note_to_keep', 'reply_held', 'ask_cards', 'website_form',
                           'files_waiting', 'video_ready', 'post_up', 'post_stopped', 'preview_tried',
                           'ad_account', 'footage', 'footage_in']));

/* ------------------------------------------------------------------------------------ 2. who hears, and a row -- */

-- A folder's name as a notice says it: quoted, and cut to fit a title (a name may run to 500 characters, a title to
-- 200). A notice is closed by the same words it was rung with, so both sides ask this.
create or replace function public.footage_quoted(p_name text)
returns text
language sql
immutable
set search_path to 'public'
as $$
  select '“' || case when char_length(p_name) > 120 then left(p_name, 119) || '…' else p_name end || '”'
$$;

revoke all on function public.footage_quoted(text) from public, anon, authenticated;
grant execute on function public.footage_quoted(text) to service_role;
comment on function public.footage_quoted(text) is
  'A watched folder''s name as the bell says it (00656): in quotes, cut to 120 characters so every title fits.';

create or replace function public.footage_hearers(p_tenant_id uuid, p_connector uuid)
returns setof uuid
language sql
stable
security definer
set search_path to 'public'
as $$
  select m.user_id
    from public.memberships m
   where m.tenant_id = p_tenant_id
     and (public.has_permission(m.user_id, p_tenant_id, 'settings') or m.user_id = p_connector)
$$;

revoke all on function public.footage_hearers(uuid, uuid) from public, anon, authenticated;
grant execute on function public.footage_hearers(uuid, uuid) to service_role;
comment on function public.footage_hearers(uuid, uuid) is
  'Who hears that a watched folder or its account needs someone (00656): the members who may change the workspace''s settings (has_permission settings) and whoever connected the folder, while they are a member. Service role and the footage bell''s triggers.';

create or replace function public.footage_ring(p_tenant_id uuid, p_subject_type text, p_subject_id text,
                                               p_title text, p_body text, p_connector uuid)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_rung integer;
begin
  insert into public.notifications (tenant_id, kind, title, body, subject_type, subject_id, recipient_user_id)
  select p_tenant_id, 'footage', p_title, p_body, p_subject_type, p_subject_id, h.user_id
    from public.footage_hearers(p_tenant_id, p_connector) as h(user_id)
   where not exists (
           select 1 from public.notifications n
            where n.tenant_id = p_tenant_id
              and n.kind = 'footage'
              and n.subject_type = p_subject_type
              and n.subject_id = p_subject_id
              and n.title = p_title
              and n.recipient_user_id = h.user_id
              and n.closed_at is null
              and n.created_at >= now() - interval '30 days');
  get diagnostics v_rung = row_count;
  return v_rung;
end $$;

revoke all on function public.footage_ring(uuid, text, text, text, text, uuid) from public, anon, authenticated;
grant execute on function public.footage_ring(uuid, text, text, text, text, uuid) to service_role;
comment on function public.footage_ring(uuid, text, text, text, text, uuid) is
  'One bell row of kind footage for each member who hears a watched folder (footage_hearers, 00656), unless the same one is still open for them: a wait that lasts is told once, never again each day. Answers how many rows it wrote.';

/* ------------------------------------------------------------------------- 3. the account Google signed out -- */

create or replace function public.source_connections_ring()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if tg_op = 'DELETE' then
    perform public.notifications_close_about(old.tenant_id, array['footage'], 'source_connection', old.id::text);
    return old;
  end if;
  if new.health = 'needs_reconnect' and old.health is distinct from 'needs_reconnect' then
    perform public.footage_ring(new.tenant_id, 'source_connection', new.id::text, 'Google Drive needs you',
                                format('Google signed %s out. Nothing new comes in.', new.email), new.connected_by);
  elsif old.health = 'needs_reconnect' and new.health is distinct from 'needs_reconnect' then
    perform public.notifications_close_about(new.tenant_id, array['footage'], 'source_connection', new.id::text);
  end if;
  return new;
end $$;

revoke all on function public.source_connections_ring() from public, anon, authenticated;
comment on function public.source_connections_ring() is
  'A trigger on source_connections (00656): Google signed the account out (health needs_reconnect) and the bell says "Google Drive needs you" to whoever may mend it; connected again, or the account let go, and the row closes for everyone.';

drop trigger if exists source_connections_ring on public.source_connections;
create trigger source_connections_ring after update of health or delete on public.source_connections
  for each row execute function public.source_connections_ring();

/* ------------------------------------------------------------------------------------------- 4. the folder -- */

create or replace function public.media_sources_ring()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_name      text;
  v_account   public.source_connections;
  v_who       text;
  v_wave      text;
begin
  if tg_op = 'DELETE' then
    perform public.notifications_close_about(old.tenant_id, array['footage'], 'media_source', old.id::text);
    return old;
  end if;
  if new.state = 'stopped' then
    perform public.notifications_close_about(new.tenant_id, array['footage'], 'media_source', new.id::text);
    return new;
  end if;
  v_name := public.footage_quoted(new.folder_name);
  select * into v_account from public.source_connections c where c.id = new.connection_id;

  -- Paused because whoever connected it left (the sync's D13). Paused by a sign-out is the account's notice, never a
  -- second one for the folder.
  if new.state = 'paused' and old.state is distinct from 'paused' and new.stopped_why = 'connector_left' then
    select nullif(btrim(p.display_name), '') into v_who from public.profiles p where p.user_id = v_account.connected_by;
    perform public.footage_ring(new.tenant_id, 'media_source', new.id::text, v_name || ' is paused',
                                coalesce(v_who || ' connected it and has left.', 'Whoever connected it has left.')
                                  || ' Connect your own Google account.',
                                null);
  elsif old.state = 'paused' and new.state is distinct from 'paused' then
    perform public.notifications_close_about(new.tenant_id, array['footage'], 'media_source', new.id::text,
                                             public.footage_quoted(old.folder_name) || ' is paused');
  end if;

  if new.state = 'frozen' and old.state is distinct from 'frozen' then
    perform public.footage_ring(new.tenant_id, 'media_source', new.id::text, 'Can''t open ' || v_name,
                                'Nothing was removed. Chanlytics keeps trying.', v_account.connected_by);
  elsif old.state = 'frozen' and new.state is distinct from 'frozen' then
    perform public.notifications_close_about(new.tenant_id, array['footage'], 'media_source', new.id::text,
                                             'Can''t open ' || public.footage_quoted(old.folder_name));
  end if;

  -- A wave of removals held for a second look (the sync's hold): one notice, closed when the second look settles it.
  if new.hold_at is not null and old.hold_at is null then
    v_wave := to_char(new.hold_count, 'FM999,999,999') || ' files left ' || v_name || ' at once';
    perform public.footage_ring(new.tenant_id, 'media_source', new.id::text, v_wave,
                                'Nothing was removed. Chanlytics looks again tomorrow.', v_account.connected_by);
  elsif old.hold_at is not null and (new.hold_at is null
                                     or (new.hold_confirmed_at is not null and old.hold_confirmed_at is null)) then
    -- Settled by the second look, or answered by a person (confirm): either way nothing waits on the owner now.
    v_wave := to_char(old.hold_count, 'FM999,999,999') || ' files left ' || public.footage_quoted(old.folder_name)
              || ' at once';
    perform public.notifications_close_about(new.tenant_id, array['footage'], 'media_source', new.id::text, v_wave);
  end if;
  return new;
end $$;

revoke all on function public.media_sources_ring() from public, anon, authenticated;
comment on function public.media_sources_ring() is
  'A trigger on media_sources (00656): the folder paused because whoever connected it left, a folder that can''t be opened, or a wave of removals held for a second look rings the bell once, for whoever may mend it, and closes for everyone when it ends; a folder stopped or gone closes all of its rows.';

drop trigger if exists media_sources_ring on public.media_sources;
create trigger media_sources_ring after update of state, hold_at, hold_confirmed_at or delete on public.media_sources
  for each row execute function public.media_sources_ring();

/* ---------------------------------------------------------------- 5. the day's new photos and videos, counted -- */

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

  select n.id into v_row from public.notifications n
   where n.tenant_id = new.tenant_id
     and n.kind = 'footage_in'
     and n.subject_type = 'media_source'
     and n.subject_id = v_source.id::text
     and n.closed_at is null
     and n.created_at >= v_day
   order by n.created_at desc
   limit 1;
  if v_row is not null then
    update public.notifications n set title = v_title, body = v_body, created_at = now() where n.id = v_row;
  else
    insert into public.notifications (tenant_id, kind, title, body, subject_type, subject_id)
    values (new.tenant_id, 'footage_in', v_title, v_body, 'media_source', v_source.id::text);
  end if;
  return new;
end $$;

revoke all on function public.files_ring_footage_in() from public, anon, authenticated;
comment on function public.files_ring_footage_in() is
  'A trigger on files (00656): a file that came from the watched folder brings the day''s bell row up to date in place, "46 new photos and videos", from the folder, for the whole workspace. Never a row for each file and never two in a day; the day is the workspace''s own.';

drop trigger if exists files_ring_footage_in on public.files;
create trigger files_ring_footage_in after insert on public.files
  for each row when (new.source = 'drive') execute function public.files_ring_footage_in();

/* ------------------------------------------------- 6. the videos are full, and nothing can step aside (call 3) -- */

-- What fills a workspace's sixty minutes of video, by road, in seconds: the videos counted toward the cap
-- (video_seconds_toward_cap's own rows), and of them the clips that can step aside for a new one by themselves
-- (file_copies_let_go's own rule, less the hour a clip rests after it is used: those step aside within the hour). Where
-- clips wait for room and none can step aside, the owner's own videos fill the minutes, and only the owner can make room.
create or replace function public.video_minutes_by_road(p_tenant_id uuid)
returns jsonb
language sql
stable
set search_path to 'public'
as $$
  with counted as (
    select f.id, f.source, f.status, f.owner_uploaded, f.copy_state, f.media_status, f.media_ref,
           coalesce(f.seconds, 0) as seconds
      from public.files f
     where f.tenant_id = p_tenant_id and f.kind = 'video' and f.removed_at is null and f.media_status <> 'failed'
       and f.copy_state = any (array['here', 'going', 'returning'])
  )
  select jsonb_build_object(
    'total', coalesce(sum(c.seconds), 0),
    'can_step_aside', coalesce(sum(c.seconds) filter (
      where public.file_road_is_watched(c.source) and not c.owner_uploaded and c.copy_state = 'here'
        and c.media_status = 'ready' and c.media_ref is not null
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

revoke all on function public.video_minutes_by_road(uuid) from public, anon;
grant execute on function public.video_minutes_by_road(uuid) to authenticated, service_role;
comment on function public.video_minutes_by_road(uuid) is
  'What fills a workspace''s sixty minutes of video, in seconds (00656, the footage screens'' call 3): total (toward the cap), can_step_aside (watched clips that make room by themselves, file_copies_let_go''s rule less its hour of rest), and by road: set_aside (found and set aside), own (added by the owner), made (made here), found (found online and kept). Runs as its caller: a member reads their own workspace''s videos.';

-- A clip that waits for room where none can step aside: "Videos are full" to whoever may make room, once; closed once
-- no clip of the folder waits for room.
create or replace function public.source_items_ring_full()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_source public.media_sources;
  v_minutes jsonb;
begin
  select * into v_source from public.media_sources s where s.id = coalesce(new.source_id, old.source_id);
  if not found then
    return new;
  end if;
  if new.state = 'waiting' and new.why = 'room' then
    v_minutes := public.video_minutes_by_road(new.tenant_id);
    if (v_minutes ->> 'can_step_aside')::numeric = 0 then
      perform public.footage_ring(new.tenant_id, 'media_source', v_source.id::text, 'Videos are full',
                                  'Clips from ' || public.footage_quoted(v_source.folder_name)
                                    || ' wait, and none of your videos can step aside. Remove some to make room.',
                                  (select c.connected_by from public.source_connections c
                                    where c.id = v_source.connection_id));
    end if;
  elsif not exists (select 1 from public.source_items i
                     where i.tenant_id = new.tenant_id and i.source_id = v_source.id
                       and i.state = 'waiting' and i.why = 'room') then
    perform public.notifications_close_about(new.tenant_id, array['footage'], 'media_source', v_source.id::text,
                                             'Videos are full');
  end if;
  return new;
end $$;

revoke all on function public.source_items_ring_full() from public, anon, authenticated;
comment on function public.source_items_ring_full() is
  'A trigger on source_items (00656, the footage screens'' call 3): a clip that begins to wait for room where none of the workspace''s videos can step aside (video_minutes_by_road) rings "Videos are full" once, for whoever may make room; the row closes once no clip of the folder waits for room.';

drop trigger if exists source_items_ring_full on public.source_items;
create trigger source_items_ring_full after update of state, why on public.source_items
  for each row
  when ((new.why = 'room' and new.state = 'waiting') is distinct from (old.why = 'room' and old.state = 'waiting'))
  execute function public.source_items_ring_full();

/* -------------------------------------- 7. a video being made waits for its clips coming back from Drive (call 2) -- */

-- The maker already waits for a clip coming back (00654 ensureCopy); this is the stage its card says while it does, in
-- place of the copy-still-being-made wait, which can take twenty minutes where a return takes about two.
alter table public.pieces drop constraint if exists pieces_stage_check;
alter table public.pieces add constraint pieces_stage_check
  check (stage = any (array['queued', 'waiting_clip', 'from_drive', 'drawing', 'saving']));

create or replace function public.piece_stage(p_piece_id uuid, p_stage text)
returns boolean
language sql
security definer
set search_path to 'public'
as $$
  with staged as (
    update public.pieces p set stage = p_stage, updated_at = now()
     where p.id = p_piece_id and p.status = 'making' and p.stage is distinct from p_stage
       and p_stage = any (array['queued', 'waiting_clip', 'from_drive', 'drawing', 'saving'])
    returning p.id
  )
  select exists (select 1 from staged);
$$;

revoke all on function public.piece_stage(uuid, text) from public, anon, authenticated;
grant execute on function public.piece_stage(uuid, text) to service_role;
comment on function public.piece_stage(uuid, text) is
  'Where a video being made stands, said as it changes (00613, 00656): waiting for a clip''s full-size copy, or for clips coming back from a watched folder (from_drive), which no other door says. Answers whether it changed. The service role''s.';

/* ------------------------------------------------------------ 8. a Library past a thousand rows is counted (call 4) -- */

-- A clip kept in Drive does not count toward the Library's thousand (00654 files_toward_cap), so a Library can hold more
-- rows than one read of them may answer. Its counts are asked of the database grouped, a few rows whatever its size.
create or replace function public.files_tallied(p_tenant_id uuid)
returns table(status text, shows text, source text, kind text, look_status text, created_at timestamptz, n bigint)
language sql
stable
set search_path to 'public'
as $$
  select f.status, f.shows, f.source, f.kind, f.look_status, max(f.created_at) as created_at, count(*) as n
    from public.files f
   where f.tenant_id = p_tenant_id and f.removed_at is null
     and (f.media_status is null or f.media_status <> 'uploading')
   group by f.status, f.shows, f.source, f.kind, f.look_status
$$;

revoke all on function public.files_tallied(uuid) from public, anon;
grant execute on function public.files_tallied(uuid) to authenticated, service_role;
comment on function public.files_tallied(uuid) is
  'A workspace''s Library counted (00656, the footage screens'' call 4): its files grouped by what the counts read (status, shows, source, kind, look_status), with how many of each and the newest one''s arrival, past a thousand as truly as under it. Not a video still on its way (uploading), as the list reads them. Runs as its caller: a member counts their own workspace''s files.';

/* ------------------------------------------------- 9. a file whose original left Drive says when it leaves too -- */

-- Its row says "Deleted in Drive · leaves Nov 26" (the screens canvas's Removed board): when its original was seen in
-- the bin or moved out, and which, kept on the file while no other origin still holds it in the folder. The seven days
-- after are the app's (contracts FOOTAGE_NUMBERS.graceDays, which the cleanup is asked with); only the start is here.
alter table public.files add column if not exists origin_left text;
alter table public.files add column if not exists origin_left_at timestamptz;
alter table public.files drop constraint if exists files_origin_left_check;
alter table public.files add constraint files_origin_left_check
  check ((origin_left is null) = (origin_left_at is null) and (origin_left is null or origin_left = any (array['gone', 'outside'])));
comment on column public.files.origin_left is
  'How a watched file''s original left its folder (00656): gone (seen in its provider''s bin) or outside (moved out); null while an origin still holds it in. With origin_left_at, its row says the day it leaves the Library.';
comment on column public.files.origin_left_at is
  'When a watched file''s original left its folder (00656): the newest of its origins'' gone_at, where none still holds it in.';
grant select (origin_left, origin_left_at) on public.files to authenticated;

create or replace function public.source_items_stamp_left()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_file uuid;
begin
  foreach v_file in array array[case when tg_op <> 'INSERT' then old.file_id end,
                                case when tg_op <> 'DELETE' then new.file_id end]
  loop
    continue when v_file is null;
    update public.files f
       set origin_left    = l.how,
           origin_left_at = l.at
      from (select (array_agg(i.state order by i.gone_at desc))[1] as how, max(i.gone_at) as at
              from public.source_items i
             where i.file_id = v_file and i.state = any (array['gone', 'outside']) and i.gone_at is not null
               and not exists (select 1 from public.source_items k where k.file_id = v_file and k.state = 'in')) l
     where f.id = v_file
       and (f.origin_left is distinct from l.how or f.origin_left_at is distinct from l.at);
  end loop;
  return null;
end $$;

revoke all on function public.source_items_stamp_left() from public, anon, authenticated;
comment on function public.source_items_stamp_left() is
  'A trigger on source_items (00656): a file''s original seen in the bin or moved out, put back, or let go, so the file says how and when its original left (files.origin_left, origin_left_at), while no other origin holds it in.';

drop trigger if exists source_items_stamp_left on public.source_items;
create trigger source_items_stamp_left after update of state, gone_at, file_id or delete on public.source_items
  for each row execute function public.source_items_stamp_left();

/* -------------------------------------------------------- 10. what came from the folder, removed too (Settings 19) -- */

-- Stop watching or Disconnect, and "Remove what came from it too": every file a watched folder brought that no post or
-- video used leaves the Library, as a person's own Remove takes one (file_remove: hidden at once, written to
-- files_let_go so no read brings it back, purged ten minutes on). Never the default; one the owner also added stays.
create or replace function public.source_files_remove(p_tenant_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_actor   uuid := auth.uid();
  v_removed integer := 0;
  v_kept    integer := 0;
  v_file    record;
begin
  if v_actor is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  if p_tenant_id is null or not coalesce(public.caller_has_permission(p_tenant_id, 'settings'), false) then
    raise exception 'Not yours to change.' using errcode = '42501';
  end if;
  -- One at a time, as every door that files or removes takes it (00551).
  perform pg_advisory_xact_lock(hashtextextended(p_tenant_id::text || '|files', 42));
  for v_file in
    select f.id, f.fingerprint, public.file_was_used(f.tenant_id, f.id) as used
      from public.files f
     where f.tenant_id = p_tenant_id and public.file_road_is_watched(f.source) and f.removed_at is null
       and not f.owner_uploaded
  loop
    if v_file.used then
      v_kept := v_kept + 1;
      continue;
    end if;
    update public.files f set removed_at = now(), updated_at = now() where f.id = v_file.id;
    insert into public.files_let_go (tenant_id, fingerprint) values (p_tenant_id, v_file.fingerprint)
    on conflict (tenant_id, fingerprint) do nothing;
    insert into public.jobs (tenant_id, kind, due_at, payload)
    values (p_tenant_id, 'file_purge', now() + interval '10 minutes',
            jsonb_build_object('file_id', v_file.id, 'why', 'remove'));
    v_removed := v_removed + 1;
  end loop;
  if v_removed > 0 then
    insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
    values (p_tenant_id, 'file.removed', 'setup', 'workspace', p_tenant_id,
            jsonb_build_object('by', v_actor, 'bulk', true, 'count', v_removed, 'why', 'from_folder'));
  end if;
  return jsonb_build_object('removed', v_removed, 'kept', v_kept);
end $$;

revoke all on function public.source_files_remove(uuid) from public, anon;
grant execute on function public.source_files_remove(uuid) to authenticated, service_role;
comment on function public.source_files_remove(uuid) is
  'A member who may change the settings removes what came from the workspace''s watched folders (00656, the footage screens'' Settings 19): every such file no post or video used leaves the Library as file_remove takes one (hidden, let go, purged ten minutes on), and one event says how many. One the owner also added, and one a post or a video used, stays. Answers removed and kept.';

/* ------------------------------------------------------------------------ 11. whoever connected it, leaving -- */

create or replace function public.memberships_wake_their_folders()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  update public.media_sources s
     set next_read_at = now(), updated_at = now()
    from public.source_connections c
   where c.id = s.connection_id
     and c.tenant_id = old.tenant_id
     and c.connected_by = old.user_id
     and s.state in ('watching', 'frozen');
  return old;
end $$;

revoke all on function public.memberships_wake_their_folders() from public, anon, authenticated;
comment on function public.memberships_wake_their_folders() is
  'A trigger on memberships (00656, the footage plan''s D13): a member left, so each folder their account reads is read at the next turn of the clock, where the sync finds them gone, pauses it and the bell says so. The rule itself stays the sync''s (openSource).';

drop trigger if exists memberships_wake_their_folders on public.memberships;
create trigger memberships_wake_their_folders after delete on public.memberships
  for each row execute function public.memberships_wake_their_folders();

/* --------------------------------------------------------------------------- 12. a page hears the count rise -- */

drop trigger if exists workspace_tell_update on public.notifications;
create trigger workspace_tell_update after update of closed_at, title on public.notifications
  for each row
  when (old.closed_at is distinct from new.closed_at or old.title is distinct from new.title)
  execute function public.workspace_tell_row_change();

-- Each Library cap is counted in one place (the footage sources plan's P0, 17 November 2026).
--
-- A workspace's Library holds 1,000 files (contracts FILES_MAX) and 60 minutes of video (FILE_VIDEO_MINUTES_MAX). Which
-- files count toward the first was written out in six doors, and which seconds count toward the second in three of
-- them. A watched folder changes both rules later (a copy that is away does not count: the plan's D6 and D16), and a
-- rule written six times is changed five times too few. So, with no change in what any door answers:
--
--   files_toward_cap(tenant)           every file not removed, as each door counted it.
--   video_seconds_toward_cap(tenant)   the seconds of every video not removed whose copy did not fail: what is kept and
--                                      what is on its way, together, as each door summed it.
--
-- and the six doors ask them: file_start (00597), file_found (00630), file_made (00553), file_video_begin (00556),
-- file_video_found (00626) and piece_file_begin (00613). Each is re-made in place, word for word but for that one
-- question (and, in the three that hold minutes, the one sum): its privileges and its comment are kept, and it still
-- holds the cap's own number, so a door refuses exactly where it refused before. The two counts are read after the
-- door's own lock, in the door's own statement, as the inline counts were.
--
-- The two new functions are internal: the doors are definers and call them as their owner; no member and no visitor may.
-- No table, no column, no index. Deploy order: either (no app code names the new functions). Re-runnable.

set local lock_timeout = '3s';

create or replace function public.files_toward_cap(p_tenant_id uuid)
returns bigint
language sql
stable
set search_path = public
as $$
  select count(*) from public.files f where f.tenant_id = p_tenant_id and f.removed_at is null
$$;

revoke all on function public.files_toward_cap(uuid) from public, anon, authenticated;
grant execute on function public.files_toward_cap(uuid) to service_role;
comment on function public.files_toward_cap(uuid) is
  'How many of a workspace''s files count toward the Library''s cap (contracts FILES_MAX): every file not removed (00637). The one place that count is written: each door that adds a file asks it, and keeps the cap''s number. The service role''s.';

create or replace function public.video_seconds_toward_cap(p_tenant_id uuid)
returns numeric
language sql
stable
set search_path = public
as $$
  select coalesce(sum(f.seconds), 0) from public.files f
   where f.tenant_id = p_tenant_id and f.kind = 'video' and f.removed_at is null and f.media_status <> 'failed'
$$;

revoke all on function public.video_seconds_toward_cap(uuid) from public, anon, authenticated;
grant execute on function public.video_seconds_toward_cap(uuid) to service_role;
comment on function public.video_seconds_toward_cap(uuid) is
  'How many seconds of video count toward a workspace''s video minutes (contracts FILE_VIDEO_MINUTES_MAX): every video not removed whose copy did not fail, what is kept and what is on its way together (00637). The one place that sum is written: each door that adds a video asks it, and keeps the cap''s number. The service role''s.';

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
  if p_tenant_id is null or not coalesce(public.caller_has_permission(p_tenant_id, 'add_files'), false) then
    raise exception 'Not yours to change.' using errcode = '42501';
  end if;
  -- contracts FILES_MAX: the fair word before anything travels. file_found holds it for certain.
  if public.files_toward_cap(p_tenant_id) >= 1000 then
    raise exception 'This workspace holds as many files as it can. Remove some first.' using errcode = '22023';
  end if;
  -- Bytes that never become a file hold nothing but their folder: this empties it a day on, and leaves a file alone.
  insert into public.jobs (tenant_id, kind, due_at, payload)
  values (p_tenant_id, 'file_purge', now() + interval '1 day', jsonb_build_object('file_id', p_id, 'why', 'start'));
end $$;

create or replace function public.file_found(p_tenant_id uuid, p_id uuid, p_status text, p_source text, p_source_ref text, p_name text, p_mime text, p_bytes bigint, p_fingerprint text, p_width integer, p_height integer, p_shows text, p_edition integer, p_actor uuid default null::uuid, p_print text default null::text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $_$
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
  if public.files_toward_cap(p_tenant_id) >= 1000 then
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
end $_$;

create or replace function public.file_made(p_tenant_id uuid, p_id uuid, p_name text, p_bytes bigint, p_fingerprint text, p_width integer, p_height integer, p_look jsonb, p_who_in_it text, p_made jsonb, p_actor uuid default null::uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_twin uuid;
begin
  -- One at a time, as every door that names or files takes it (00551).
  perform pg_advisory_xact_lock(hashtextextended(p_tenant_id::text || '|files', 42));
  -- Asked again after a lost answer: the same answer, never its own twin.
  if exists (select 1 from public.files f where f.tenant_id = p_tenant_id and f.id = p_id) then
    return jsonb_build_object('fate', 'kept', 'file_id', p_id);
  end if;
  -- The same picture pressed twice is one file.
  select f.id into v_twin from public.files f
   where f.tenant_id = p_tenant_id and f.fingerprint = p_fingerprint and f.removed_at is null;
  if found then
    return jsonb_build_object('fate', 'here', 'file_id', v_twin);
  end if;
  -- contracts FILES_MAX.
  if public.files_toward_cap(p_tenant_id) >= 1000 then
    return jsonb_build_object('fate', 'full', 'file_id', null);
  end if;
  insert into public.files (id, tenant_id, status, source, name, mime, bytes, fingerprint, width, height,
                            look, look_status, shows, who_in_it, made, created_by)
  values (p_id, p_tenant_id, 'filed', 'made', public.file_free_name(p_tenant_id, p_name), 'image/jpeg', p_bytes,
          p_fingerprint, p_width, p_height, p_look, 'done', 'graphic', p_who_in_it, p_made, p_actor);
  insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
  values (p_tenant_id, 'file.added', 'setup', 'workspace', p_tenant_id,
          jsonb_build_object('file_id', p_id, 'source', 'made', 'by', p_actor));
  return jsonb_build_object('fate', 'kept', 'file_id', p_id);
end $$;

create or replace function public.file_video_begin(p_tenant_id uuid, p_id uuid, p_media_ref text, p_name text, p_mime text, p_bytes bigint, p_fingerprint text, p_seconds numeric, p_actor uuid default null::uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_twin   uuid;
  v_status text;
  v_held   text;
  v_used   numeric;
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

create or replace function public.file_video_found(p_tenant_id uuid, p_id uuid, p_media_ref text, p_status text, p_source text, p_source_ref text, p_name text, p_mime text, p_fingerprint text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_twin uuid;
  v_used numeric;
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
  -- What a person removed is not brought back by the next read of the same place.
  if exists (select 1 from public.files_let_go g where g.tenant_id = p_tenant_id and g.fingerprint = p_fingerprint) then
    return jsonb_build_object('fate', 'here', 'file_id', null);
  end if;
  -- contracts FILES_MAX.
  if public.files_toward_cap(p_tenant_id) >= 1000 then
    return jsonb_build_object('fate', 'full', 'file_id', null);
  end if;
  -- contracts FILE_VIDEO_MINUTES_MAX: a found video's length is the platform's to say, so what is known is counted.
  v_used := public.video_seconds_toward_cap(p_tenant_id);
  if v_used >= 60 * 60 then
    return jsonb_build_object('fate', 'minutes', 'file_id', null);
  end if;
  insert into public.files (id, tenant_id, status, source, source_ref, name, mime, bytes, fingerprint, kind, media_ref,
                            media_status)
  values (p_id, p_tenant_id, p_status, p_source, p_source_ref, public.file_free_name(p_tenant_id, p_name), p_mime, 0,
          p_fingerprint, 'video', p_media_ref, 'uploading');
  insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
  values (p_tenant_id, 'file.added', 'setup', 'workspace', p_tenant_id,
          jsonb_build_object('file_id', p_id, 'source', p_source, 'kind', 'video'));
  return jsonb_build_object('fate', 'kept', 'file_id', p_id);
end $$;

create or replace function public.piece_file_begin(p_piece_id uuid, p_id uuid, p_media_ref text, p_name text, p_bytes bigint, p_fingerprint text, p_seconds numeric)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_piece  public.pieces;
  v_tenant uuid;
  v_held   text;
  v_begun  timestamptz;
  v_twin   uuid;
  v_status text;
  v_used   numeric;
  v_who    text;
begin
  select p.tenant_id into v_tenant from public.pieces p where p.id = p_piece_id;
  if not found then
    return jsonb_build_object('fate', 'ended', 'file_id', null);
  end if;
  -- One at a time, as every door that names or files takes it (00551); the row is read under it, so two runs never both
  -- begin one video's file.
  perform pg_advisory_xact_lock(hashtextextended(v_tenant::text || '|files', 42));
  select * into v_piece from public.pieces p where p.id = p_piece_id for update;
  if not found or v_piece.status <> 'making' then
    return jsonb_build_object('fate', 'ended', 'file_id', null);
  end if;
  -- Asked again (a lost answer, or a second run): the same answer, with the reservation the row holds and when it was begun,
  -- so whoever asks can tell a run still sending it from one that died.
  if v_piece.file_id is not null then
    select f.media_ref, f.created_at into v_held, v_begun from public.files f where f.id = v_piece.file_id;
    return jsonb_build_object('fate', 'kept', 'file_id', v_piece.file_id, 'media_ref', v_held, 'begun_at', v_begun);
  end if;
  -- The same bytes are a file already: this video is that one, and follows it wherever it stands. `twin` says where.
  select f.id, f.media_status into v_twin, v_status from public.files f
   where f.tenant_id = v_piece.tenant_id and f.fingerprint = p_fingerprint and f.removed_at is null;
  if found then
    update public.pieces p
       set file_id = v_twin, machine = null, stage = 'saving', updated_at = now(),
           status = case v_status when 'ready' then 'made' when 'failed' then 'failed' else p.status end,
           failed_why = case when v_status = 'failed' then 'store' else p.failed_why end,
           made_at = case when v_status = 'ready' then now() else p.made_at end
     where p.id = p_piece_id;
    return jsonb_build_object('fate', 'here', 'file_id', v_twin, 'twin', v_status);
  end if;
  -- contracts FILES_MAX.
  if public.files_toward_cap(v_piece.tenant_id) >= 1000 then
    return jsonb_build_object('fate', 'full', 'file_id', null);
  end if;
  -- contracts FILE_VIDEO_MINUTES_MAX: what is kept and what is on its way, together.
  v_used := public.video_seconds_toward_cap(v_piece.tenant_id);
  if v_used + coalesce(p_seconds, 0) > 60 * 60 then
    return jsonb_build_object('fate', 'minutes', 'file_id', null);
  end if;
  -- Who is in it is its files' own word: agreed where the owner said so at the press or of any of them, no one where
  -- every one says so, else not asked. Its files are every one its plan names: a "Hook first" plan's cuts, and in a plan
  -- of blocks a clip's and a photo's, a pair's two pictures and the picture a quote stands over. Read by each file's id
  -- as text, so a plan that names no file (cards of words alone) reads none, and says not asked.
  select case
           when (v_piece.plan ->> 'people_agreed') = 'true' or coalesce(bool_or(f.who_in_it = 'agreed'), false) then 'agreed'
           when coalesce(bool_and(f.who_in_it = 'no_one'), false) then 'no_one'
           else 'not_asked'
         end
    into v_who
    from public.files f
   where f.tenant_id = v_piece.tenant_id
     and f.id::text in (
           select c ->> 'file_id'
             from jsonb_array_elements(case when jsonb_typeof(v_piece.plan -> 'cuts') = 'array'
                                            then v_piece.plan -> 'cuts' else '[]'::jsonb end) c
           union
           select x.id
             from jsonb_array_elements(case when jsonb_typeof(v_piece.plan -> 'blocks') = 'array'
                                            then v_piece.plan -> 'blocks' else '[]'::jsonb end) b,
                  lateral (values (b ->> 'file_id'), (b -> 'before' ->> 'file_id'),
                                  (b -> 'after' ->> 'file_id'), (b -> 'over' ->> 'file_id')) x(id)
            where x.id is not null);
  -- Named for its words, as a post is, so the look that follows does not rename it.
  insert into public.files (id, tenant_id, status, source, name, owner_named, mime, bytes, fingerprint, kind, media_ref,
                            media_status, seconds, created_by, made, who_in_it)
  values (p_id, v_piece.tenant_id, 'filed', 'made', public.file_free_name(v_piece.tenant_id, p_name), true, 'video/mp4',
          p_bytes, p_fingerprint, 'video', p_media_ref, 'uploading', p_seconds, v_piece.created_by,
          jsonb_build_object('piece', v_piece.id, 'shape', v_piece.shape, 'plan', v_piece.plan), v_who);
  update public.pieces p set file_id = p_id, stage = 'saving', updated_at = now() where p.id = p_piece_id;
  insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
  values (v_piece.tenant_id, 'file.added', 'setup', 'workspace', v_piece.tenant_id,
          jsonb_build_object('file_id', p_id, 'source', 'made', 'kind', 'video', 'by', v_piece.created_by));
  return jsonb_build_object('fate', 'kept', 'file_id', p_id);
end $$;

-- 00556 · A business keeps its videos (decision 0099, stage B).
--
-- A business's clips go where its photos go: one row and one folder each, named and shelved the same way, so the library lists
-- them and Ask can see them. The video itself is kept by the video platform, which plays it on any phone, gives any frame of
-- it and its sound alone; the folder holds only what is made of it (its sheet of frames, its poster, its sound). Claude cannot
-- hear, so what a clip says and how it sounds are written down by models that can, and kept on the row, each part naming who
-- heard it.
--
--   files.kind               image or video.
--   files.media_ref          The video platform's id for it. The platform's webhook knows nothing else, so it is unique.
--   files.media_status       uploading (its bytes on their way: no page or Ask counts it yet), processing, ready, failed.
--   files.media_error        Why the platform could not prepare it, in its code (ERR_MALFORMED_VIDEO).
--   files.ready_at           When it became playable.
--   files.seconds            Its length.
--   files.sound              What was heard of it (contracts files/sound.ts FileSound): its words, the note on how it sounds,
--                            or that it has no sound, and which model wrote each. Read by id, never by the list.
--   files.sound_said         The few words the list carries ("Spanish, 2 voices, music").
--   bucket `files`           Takes audio/mp4 too: a video's sound, kept in its folder so a question is never paid for twice.
--   file_video_begin         The service role's: a member's video on its way, once the platform has its reservation. The
--                            browser's facts (name, type, size, length, fingerprint) go with it, so the platform's word alone can
--                            finish the row. Answers kept, here (a twin), full, or minutes (the workspace's are spent).
--   file_media_processing    A member's, with the settings permission: the bytes have all gone, so the tile says it is being made ready.
--   file_media_ready         The service role's: the platform says it is playable. Finds the row by its media_ref, makes it a
--                            file whether or not the browser said done, and puts its digest's first step on the ledger.
--   file_media_failed        The service role's: the platform could not read it.
--   file_upload_lapsed       The service role's: a video whose bytes never arrived, a day on: removed, for the purge to finish.
--   file_sound_keep          The service role's: one part of what was heard, kept as it lands.
--   job_kinds                video_digest, in the bulk lane: one step a run, its once-only key the file and the step.
--   ai_usage                 Its purpose gains file_words and file_hear, its port google and elevenlabs: the models that hear.
--
-- Deploy order: this migration first. Re-runnable.

set local lock_timeout = '3s';

/* --------------------------------------------------------------------------------------------------- 1. the bucket -- */

update storage.buckets
   set allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'audio/mp4']
 where id = 'files';

/* ----------------------------------------------------------------------------------------------------- 2. the row -- */

alter table public.files add column if not exists kind text not null default 'image';
alter table public.files add column if not exists media_ref text;
alter table public.files add column if not exists media_status text;
alter table public.files add column if not exists media_error text;
alter table public.files add column if not exists ready_at timestamptz;
alter table public.files add column if not exists seconds numeric(8,2);
alter table public.files add column if not exists sound jsonb;
alter table public.files add column if not exists sound_said text;

alter table public.files drop constraint if exists files_kind_check;
alter table public.files add constraint files_kind_check check (kind = any (array['image', 'video']));
alter table public.files drop constraint if exists files_media_status_check;
alter table public.files add constraint files_media_status_check
  check (media_status = any (array['uploading', 'processing', 'ready', 'failed']));
-- A picture has none of a video's columns; a video has its platform id and where it stands from its first moment.
alter table public.files drop constraint if exists files_media_shape;
alter table public.files add constraint files_media_shape
  check ((kind = 'image' and media_ref is null and media_status is null)
      or (kind = 'video' and media_ref is not null and media_status is not null));
alter table public.files drop constraint if exists files_sound_said_shape;
alter table public.files add constraint files_sound_said_shape
  check (sound_said is null or char_length(sound_said) between 1 and 120);
alter table public.files drop constraint if exists files_mime_check;
alter table public.files add constraint files_mime_check
  check (mime = any (array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif',
                           'video/mp4', 'video/quicktime', 'video/webm']));

create unique index if not exists files_media_ref on public.files (media_ref) where media_ref is not null;
-- The sweep's read: a video the platform has not answered for.
create index if not exists files_media_waiting on public.files (updated_at)
  where media_status = any (array['uploading', 'processing']);

comment on column public.files.kind is
  'image or video (00556). A video is kept by the video platform; its folder holds only what is made of it.';
comment on column public.files.media_ref is
  'A video''s id at the video platform (00556): what its webhook names it by. Service role only, never shown to a member or the model.';
comment on column public.files.media_status is
  'Where a video stands (00556): uploading (no page or Ask counts it yet), processing, ready, failed. Null for a picture.';
comment on column public.files.media_error is
  'Why the video platform could not prepare it, in its own code. Service role only.';
comment on column public.files.ready_at is
  'When the video became playable.';
comment on column public.files.seconds is
  'A video''s length in seconds: the browser''s word until the platform says its own.';
comment on column public.files.sound is
  'What was heard of a video (contracts files/sound.ts FileSound): its words, the note on how it sounds, or that it has none, each part naming the model that heard it. Written only by file_sound_keep.';
comment on column public.files.sound_said is
  'A video''s sound in a few words, for the list (contracts soundSaidOf). Written only by file_sound_keep.';

-- A member reads what the page and Ask read of a video; its platform id and its error stay the server's.
grant select (kind, seconds, media_status, ready_at, sound, sound_said) on public.files to authenticated;

-- A video becoming playable, or heard, is a change a page draws.
drop trigger if exists workspace_tell_update on public.files;
create trigger workspace_tell_update after update of status, name, shows, who_in_it, look_status, look, removed_at,
                                                     media_status, sound_said on public.files
  for each row
  when (old.status is distinct from new.status or old.name is distinct from new.name or old.shows is distinct from new.shows
        or old.who_in_it is distinct from new.who_in_it or old.look_status is distinct from new.look_status
        or old.look is distinct from new.look or old.removed_at is distinct from new.removed_at
        or old.media_status is distinct from new.media_status or old.sound_said is distinct from new.sound_said)
  execute function public.workspace_tell_row_change();

/* ---------------------------------------------------------------------------------------------- 3. the job's kind -- */

insert into public.job_kinds (kind, lane, once_parts, once_kept) values
  ('video_digest', 2, array['file_id', 'step'], false)
on conflict (kind) do update
  set lane = excluded.lane, once_parts = excluded.once_parts, once_kept = excluded.once_kept;

/* ---------------------------------------------------------------------------------------------------- 4. the doors -- */

create or replace function public.file_video_begin(
  p_tenant_id uuid,
  p_id uuid,
  p_media_ref text,
  p_name text,
  p_mime text,
  p_bytes bigint,
  p_fingerprint text,
  p_seconds numeric,
  p_actor uuid default null
)
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
  if (select count(*) from public.files f where f.tenant_id = p_tenant_id and f.removed_at is null) >= 1000 then
    return jsonb_build_object('fate', 'full', 'file_id', null);
  end if;
  -- contracts FILE_VIDEO_MINUTES_MAX: what is kept and what is on its way, together.
  select coalesce(sum(f.seconds), 0) into v_used from public.files f
   where f.tenant_id = p_tenant_id and f.kind = 'video' and f.removed_at is null and f.media_status <> 'failed';
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
revoke all on function public.file_video_begin(uuid, uuid, text, text, text, bigint, text, numeric, uuid)
  from public, anon, authenticated;
grant execute on function public.file_video_begin(uuid, uuid, text, text, text, bigint, text, numeric, uuid) to service_role;
comment on function public.file_video_begin(uuid, uuid, text, text, text, bigint, text, numeric, uuid) is
  'A member''s video on its way (00556), once the video platform holds its reservation: the row, uploading, with every fact the browser gave, so the platform''s word alone can finish it. Answers {fate: kept, here, full or minutes, file_id}. The service role''s.';

create or replace function public.file_media_processing(p_tenant_id uuid, p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $
declare
  v_actor uuid := auth.uid();
begin
  if v_actor is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  if p_tenant_id is null or not coalesce(public.caller_has_permission(p_tenant_id, 'settings'), false) then
    raise exception 'Not yours to change.' using errcode = '42501';
  end if;
  update public.files f set media_status = 'processing', updated_at = now()
   where f.tenant_id = p_tenant_id and f.id = p_id and f.kind = 'video' and f.media_status = 'uploading'
     and f.removed_at is null;
end $;
revoke all on function public.file_media_processing(uuid, uuid) from public, anon;
grant execute on function public.file_media_processing(uuid, uuid) to authenticated, service_role;
comment on function public.file_media_processing(uuid, uuid) is
  'A member''s video''s bytes have all gone (00556), with the settings permission: the tile says it is being made ready. Only from uploading: the platform''s word may already have come.';

create or replace function public.file_media_ready(p_media_ref text, p_seconds numeric, p_width integer, p_height integer)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.files;
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
  return jsonb_build_object('fate', 'ready', 'tenant_id', v_row.tenant_id, 'file_id', v_row.id);
end $$;
revoke all on function public.file_media_ready(text, numeric, integer, integer) from public, anon, authenticated;
grant execute on function public.file_media_ready(text, numeric, integer, integer) to service_role;
comment on function public.file_media_ready(text, numeric, integer, integer) is
  'The video platform says a video is playable (00556): found by its id there, made a file whether or not the browser said done, and its digest''s first step put on the ledger. Answers {fate: ready, repeated, gone or unknown, tenant_id, file_id}. The service role''s.';

create or replace function public.file_media_failed(p_media_ref text, p_error text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.files;
begin
  select * into v_row from public.files f where f.media_ref = p_media_ref;
  if not found then
    return jsonb_build_object('fate', 'unknown');
  end if;
  perform pg_advisory_xact_lock(hashtextextended(v_row.tenant_id::text || '|files', 42));
  update public.files f
     set media_status = 'failed',
         media_error = left(coalesce(nullif(p_error, ''), 'ERR_UNKNOWN'), 80),
         look_status = case when f.look_status = 'waiting' then 'failed' else f.look_status end,
         looked_at = now(),
         updated_at = now()
   where f.id = v_row.id and f.removed_at is null and f.media_status in ('uploading', 'processing');
  return jsonb_build_object('fate', case when found then 'failed' else 'repeated' end,
                            'tenant_id', v_row.tenant_id, 'file_id', v_row.id);
end $$;
revoke all on function public.file_media_failed(text, text) from public, anon, authenticated;
grant execute on function public.file_media_failed(text, text) to service_role;
comment on function public.file_media_failed(text, text) is
  'The video platform could not read a video (00556): its tile says so, and its owner can delete it. Answers {fate: failed, repeated or unknown, tenant_id, file_id}. The service role''s.';

create or replace function public.file_upload_lapsed(p_tenant_id uuid, p_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  with lapsed as (
    update public.files f set removed_at = now(), updated_at = now()
     where f.tenant_id = p_tenant_id and f.id = p_id and f.kind = 'video' and f.media_status = 'uploading'
       and f.removed_at is null
    returning f.id
  )
  select exists (select 1 from lapsed);
$$;
revoke all on function public.file_upload_lapsed(uuid, uuid) from public, anon, authenticated;
grant execute on function public.file_upload_lapsed(uuid, uuid) to service_role;
comment on function public.file_upload_lapsed(uuid, uuid) is
  'A video whose bytes never arrived, a day on (00556): removed, so the purge lets its reservation and its row go. Answers whether it was such a video. Its fingerprint is not let go: a person may add it again.';

create or replace function public.file_sound_keep(
  p_tenant_id uuid,
  p_id uuid,
  p_part text,
  p_value jsonb,
  p_by jsonb,
  p_said text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_part not in ('words', 'note', 'none') then
    raise exception 'A sound''s part is words, note or none.' using errcode = '22023';
  end if;
  update public.files f
     -- No sound at all is the platform's word on the file, and nothing else is heard of it.
     set sound = case
                   when p_part = 'none' then jsonb_build_object('none', true)
                   else ((coalesce(f.sound, '{}'::jsonb) - 'none')
                         || jsonb_build_object(p_part, p_value))
                        || jsonb_build_object('heard_by', coalesce(f.sound -> 'heard_by', '{}'::jsonb)
                                                          || jsonb_build_object(p_part, p_by))
                 end,
         sound_said = coalesce(nullif(p_said, ''), f.sound_said),
         updated_at = now()
   where f.tenant_id = p_tenant_id and f.id = p_id and f.kind = 'video' and f.removed_at is null;
end $$;
revoke all on function public.file_sound_keep(uuid, uuid, text, jsonb, jsonb, text) from public, anon, authenticated;
grant execute on function public.file_sound_keep(uuid, uuid, text, jsonb, jsonb, text) to service_role;
comment on function public.file_sound_keep(uuid, uuid, text, jsonb, jsonb, text) is
  'One part of what was heard of a video (00556): its words, the note on how it sounds, or that it has no sound, with the model that heard it. The service role''s.';

/* ----------------------------------------------------------------------------------------- 5. the closed sets grow -- */

-- contracts AI_USAGE_PURPOSES (ai/hearing.ts): Anthropic's routes' purposes, then the hearing models'.
alter table public.ai_usage drop constraint if exists ai_usage_purpose_check;
alter table public.ai_usage add constraint ai_usage_purpose_check
  check (purpose in ('receptionist', 'reply_draft', 'ask', 'lead_json', 'template_draft', 'review_reply',
                     'lead_judge', 'note_suggest', 'reach_out_check', 'reply_read', 'booking_read', 'lead_suggest',
                     'ask_journal', 'receptionist_review', 'fix_route', 'website_read', 'sender_read', 'file_look',
                     'file_words', 'file_hear'));

-- contracts AI_USAGE_PORTS.
alter table public.ai_usage drop constraint if exists ai_usage_port_check;
alter table public.ai_usage add constraint ai_usage_port_check
  check (port in ('anthropic', 'typesafe', 'google', 'elevenlabs'));

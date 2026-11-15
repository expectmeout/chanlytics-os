-- 00626 · A found video comes in, and Instagram is a road (Content's empty state, 14 Nov 2026).
--
-- A business's website, its Google profile and now its Instagram bring their photos into the Library; until now no road
-- brought a video. A found video is fetched by the video platform from its address, so its bytes never pass through us, and
-- its row is made as soon as the platform holds it, as an upload's is.
--
--   files.source             Gains instagram: posts and reels of a profile its owner pasted, waiting for their Keep.
--   file_video_found         The service role's: a found video's row, kind video, uploading, at the status its road says
--                            (inbox, or filed for a connected profile). Its twin is found by what the road calls it (the
--                            address, a post's code), since its bytes are never ours to fingerprint; what a person let go is
--                            not brought back; the 1,000 files and 60 minutes hold as for an upload. The platform's word
--                            (file_media_ready) finishes it, and its look is asked for there, as for any video.
--   imports.source           Gains website_media and instagram: a read of the website's photos and videos, and of an
--                            Instagram's posts and reels, on the ledger, so Content's page says "Looking" while it runs.
--   job_kinds                instagram_read: a profile's read started at the scraping platform, then asked after (its
--                            step and try) until its posts are read, in the bulk lane.
--
-- Nothing reads a seat. Deploy order: this migration first. Re-runnable.

set local lock_timeout = '3s';

/* --------------------------------------------------------------------------------------- 1. instagram is a road -- */

alter table public.files drop constraint if exists files_source_check;
alter table public.files add constraint files_source_check
  check (source = any (array['upload', 'google_profile', 'google_listing', 'website', 'instagram', 'made']));

alter table public.imports drop constraint if exists imports_source_check;
alter table public.imports add constraint imports_source_check
  check (source = any (array['google_reviews', 'calendar', 'clients_file', 'mailbox', 'contacts', 'whatsapp_contacts',
                             'whatsapp_history', 'google_photos', 'website_media', 'instagram']));

/* --------------------------------------------------------------------------------------- 2. a found video's row -- */

create or replace function public.file_video_found(
  p_tenant_id   uuid,
  p_id          uuid,
  p_media_ref   text,
  p_status      text,
  p_source      text,
  p_source_ref  text,
  p_name        text,
  p_mime        text,
  p_fingerprint text
) returns jsonb
language plpgsql
security definer
set search_path to 'public'
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
  if (select count(*) from public.files f where f.tenant_id = p_tenant_id and f.removed_at is null) >= 1000 then
    return jsonb_build_object('fate', 'full', 'file_id', null);
  end if;
  -- contracts FILE_VIDEO_MINUTES_MAX: a found video's length is the platform's to say, so what is known is counted.
  select coalesce(sum(f.seconds), 0) into v_used from public.files f
   where f.tenant_id = p_tenant_id and f.kind = 'video' and f.removed_at is null and f.media_status <> 'failed';
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

revoke all on function public.file_video_found(uuid, uuid, text, text, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.file_video_found(uuid, uuid, text, text, text, text, text, text, text) to service_role;
comment on function public.file_video_found(uuid, uuid, text, text, text, text, text, text, text) is
  'A found video on its way (00626), once the video platform is fetching it from its address: the row, uploading, at its road''s status, so the platform''s word alone can finish it. Its twin is by fingerprint (the road''s name for it, hashed). Answers {fate: kept, here, full or minutes, file_id}. The service role''s.';

/* ---------------------------------------------------------------------------------------- 3. instagram's job -- */

insert into public.job_kinds (kind, lane, once_parts, once_kept) values
  ('instagram_read', 2, array['@tenant', 'handle', 'step', 'try'], false)
on conflict (kind) do update
  set lane = excluded.lane, once_parts = excluded.once_parts, once_kept = excluded.once_kept;

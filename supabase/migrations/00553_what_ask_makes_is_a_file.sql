-- 00553 · What Ask makes is a file (decision 0099, step 3).
--
-- A post made from a photo keeps the way everything else does: one row and one folder, so the library lists it, Ask can open it,
-- and deleting it lets its bytes go. Its folder holds a shape each: original.jpg (portrait), square.jpg, story.jpg.
--
--   files.source  Gains made: Ask made it, on a person's press.
--   files.made    How it was made: the file it came from and what was asked, so a later version starts from what this one did.
--   file_made     The one door a made file is kept by, the service role's, after the server stored its bytes. It answers as
--                 file_found does: kept, here (the same picture made again) or full. It leaves no look to do: no model
--                 touched the words, what they say is written down at once, and who is in it is what the photo's row says.
--
-- Deploy order: this migration first. Re-runnable.

set local lock_timeout = '3s';

alter table public.files add column if not exists made jsonb;
comment on column public.files.made is
  'How Ask made it (00553): {from, plan}. Empty on everything a person or an import brought. Read by the service role.';

alter table public.files drop constraint if exists files_source_check;
alter table public.files add constraint files_source_check
  check (source = any (array['upload', 'google_profile', 'google_listing', 'website', 'made']));
comment on column public.files.source is
  'Which road brought it: a member''s upload, the connected Google profile, the public Google listing, the business''s website, or made by Ask on a person''s press.';

create or replace function public.file_made(
  p_tenant_id uuid,
  p_id uuid,
  p_name text,
  p_bytes bigint,
  p_fingerprint text,
  p_width integer,
  p_height integer,
  p_look jsonb,
  p_who_in_it text,
  p_made jsonb,
  p_actor uuid default null
)
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
  if (select count(*) from public.files f where f.tenant_id = p_tenant_id and f.removed_at is null) >= 1000 then
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

revoke all on function public.file_made(uuid, uuid, text, bigint, text, integer, integer, jsonb, text, jsonb, uuid)
  from public, anon, authenticated;
grant execute on function public.file_made(uuid, uuid, text, bigint, text, integer, integer, jsonb, text, jsonb, uuid)
  to service_role;
comment on function public.file_made(uuid, uuid, text, bigint, text, integer, integer, jsonb, text, jsonb, uuid) is
  'What Ask made kept as a file, after the server stored its bytes (00553, decision 0099): kept, here or full. The service role''s.';

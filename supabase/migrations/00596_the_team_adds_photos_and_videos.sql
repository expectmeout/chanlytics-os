-- 00596 · The team adds photos and videos (decision 0099; Ruben, 10 Nov 2026: "Staff can add").
--
-- The people who film the work are the team, on their own phones. Adding a file took the settings permission, the owner's and
-- the partner's, so an operator could see Files and add nothing. A permission of its own, add_files, is the owner's, the
-- partner's and the operator's, a viewer's never: contracts' ROLE_PERMS, restated once in SQL, as every permission is.
--
--   has_permission           Knows add_files.
--   file_start               A member's upload begins: add_files, where it took settings.
--   file_media_processing    A member's video has all gone: add_files, where it took settings, so its tile says it is being made
--                            ready for the one who sent it.
--
-- Naming, shelving, filing, deleting and posting a file keep the settings permission (file_change, file_keep_many,
-- file_remove): who is in a picture is the owner's word. The service role's doors (file_found, file_video_begin, file_made)
-- check no permission; their routes do.
--
-- Deploy order: either. A dashboard before this one refuses an operator at the route; this one, on a database before it, lets
-- an operator start and the door says "Not yours to change.", as it did. Re-runnable.

set local lock_timeout = '3s';

create or replace function public.has_permission(p_user uuid, p_tenant_id uuid, p_permission text)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1 from public.memberships m
     where m.user_id = p_user and m.tenant_id = p_tenant_id
       and m.role = any (case p_permission
         when 'approve'    then array['owner', 'operator', 'partner']
         when 'autonomy'   then array['owner', 'operator', 'partner']
         when 'disconnect' then array['owner', 'partner']
         when 'billing'    then array['owner']
         when 'team'       then array['owner']
         when 'settings'   then array['owner', 'partner']
         when 'export'     then array['owner']
         when 'find'       then array['owner', 'partner']
         when 'add_files'  then array['owner', 'operator', 'partner']
         else array[]::text[] end)
       -- A partner's seat, asked about the calling session, counts only once it showed its second factor (0013).
       and (m.role <> 'partner' or p_user is distinct from (select auth.uid()) or public.session_shows_second_factor())
  )
$$;

comment on function public.has_permission(uuid, uuid, text) is
  'Whether this user may do this in this workspace, by role: contracts'' ROLE_PERMS, restated once in SQL. A partner (0012) sets the workspace up: settings, disconnect and find beside what an operator has; billing, team and export stay the owner''s. add_files (00596) is every role''s but a viewer''s.';

create or replace function public.file_start(p_tenant_id uuid, p_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
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
  if (select count(*) from public.files f where f.tenant_id = p_tenant_id and f.removed_at is null) >= 1000 then
    raise exception 'This workspace holds as many files as it can. Remove some first.' using errcode = '22023';
  end if;
  -- Bytes that never become a file hold nothing but their folder: this empties it a day on, and leaves a file alone.
  insert into public.jobs (tenant_id, kind, due_at, payload)
  values (p_tenant_id, 'file_purge', now() + interval '1 day', jsonb_build_object('file_id', p_id, 'why', 'start'));
end $$;

comment on function public.file_start(uuid, uuid) is
  'A member''s upload begins (00551): the add_files permission (00596: an operator''s too), the workspace''s cap, and the file_purge that lets its bytes go a day on if they never become a file. No row until they are proven.';

create or replace function public.file_media_processing(p_tenant_id uuid, p_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
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
  update public.files f set media_status = 'processing', updated_at = now()
   where f.tenant_id = p_tenant_id and f.id = p_id and f.kind = 'video' and f.media_status = 'uploading'
     and f.removed_at is null;
end $$;

comment on function public.file_media_processing(uuid, uuid) is
  'A member''s video''s bytes have all gone (00556), with the add_files permission (00596: an operator''s too): the tile says it is being made ready. Only from uploading: the platform''s word may already have come.';

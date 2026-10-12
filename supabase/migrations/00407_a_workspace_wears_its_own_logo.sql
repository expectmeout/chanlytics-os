-- 00407 · A workspace wears its own logo.
--
-- The sidebar's workspace circle wore Ask's three for every business (Ruben, 11 Oct 2026: "the organization logo avatar
-- badge displays the ask instead of the user organization's logo"). A workspace now keeps one picture of its own: a
-- square PNG the owner chose or the business's website declared, made in the browser and remade by the server
-- (dashboard server/workspace/logo/png.ts), never an SVG and never the file as it was sent.
--
-- Where it lives. A public bucket on the Supabase origin the dashboard's content policy already lets images in from,
-- as the leads' marks (00161), written only by the service role (no policy on storage.objects names it), PNG alone and
-- 256KB at most. Each picture is its own file, `<tenant id>/<random uuid>.png`, and not named by its hash: a workspace
-- that saves the same picture twice must not have its new name equal its old one, which the save then removes.
--
-- Who writes the address. Nobody through a grant: the table-wide UPDATE on tenants stays revoked (00084), and no column
-- grant is added. A member-writable address that the server's service role later acts on (removing the previous file)
-- would let a member point it at another workspace's file and have it removed: the class 00260 closed for a message's
-- media. The one writer is set_workspace_logo, a door that asks the caller's settings permission (a partner on a
-- session that showed its second factor), takes the row, answers the address it held, and writes the change's event in
-- the same transaction. The CHECK binds the address to the row's own id, so even the door cannot be made to point one
-- workspace at another's folder.
--
-- Every statement re-runs. The column takes ACCESS EXCLUSIVE on tenants, which every page's boot reads, so the same
-- lock guard as 00160.
set local lock_timeout = '3s';
do $$
begin
  raise notice 'lock_timeout for this migration: %', current_setting('lock_timeout');
  if current_setting('lock_timeout') <> '3s' then
    raise warning 'this file was applied outside a transaction, so SET LOCAL did nothing: run it inside begin/commit, or set lock_timeout yourself before it';
  end if;
end $$;

/* ---------------------------------------------------------------- 1. the bucket -- */

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('workspace-logos', 'workspace-logos', true, 262144, array['image/png'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

/* ---------------------------------------------------------------- 2. the column -- */

alter table public.tenants add column if not exists logo_path text;
alter table public.tenants drop constraint if exists tenants_logo_path_shape;
alter table public.tenants add constraint tenants_logo_path_shape
  check (
    logo_path is null
    or (split_part(logo_path, '/', 1) = id::text
        and logo_path ~ '^[0-9a-f-]{36}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.png$')
  );
comment on column public.tenants.logo_path is
  'The workspace''s own logo (00407): <tenant id>/<uuid>.png in the public workspace-logos bucket, a square PNG the server remade; null when it has none and its initials stand in. Written only by set_workspace_logo.';

/* ------------------------------------------------------------------ 3. the door -- */

create or replace function public.set_workspace_logo(p_tenant_id uuid, p_logo_path text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user   uuid := auth.uid();
  v_path   text := nullif(btrim(coalesce(p_logo_path, '')), '');
  v_before text;
begin
  if v_user is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  if p_tenant_id is null or not public.caller_has_permission(p_tenant_id, 'settings') then
    raise exception 'Only someone who may change this workspace''s settings can change its logo.' using errcode = '42501';
  end if;
  if v_path is not null and split_part(v_path, '/', 1) <> p_tenant_id::text then
    raise exception 'That picture is not this workspace''s.' using errcode = '22023';
  end if;
  -- The row, held against a second save at once; "no key", so the many writes that only point at the workspace go on.
  select t.logo_path into v_before from public.tenants t where t.id = p_tenant_id for no key update;
  if not found then
    raise exception 'Workspace not found.' using errcode = 'P0002';
  end if;
  update public.tenants set logo_path = v_path where id = p_tenant_id;
  insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
  values (p_tenant_id, 'settings.changed', 'system', 'workspace', p_tenant_id,
          jsonb_build_object('fields', jsonb_build_array('logo'), 'by', v_user, 'version', null));
  return v_before;
end $$;

revoke execute on function public.set_workspace_logo(uuid, text) from public, anon;
grant execute on function public.set_workspace_logo(uuid, text) to authenticated, service_role;
comment on function public.set_workspace_logo(uuid, text) is
  'Sets (or, with null, clears) the workspace''s logo address for a caller who may change its settings (caller_has_permission ''settings'': a partner only on a session that showed its second factor), refuses an address outside the workspace''s own folder, writes settings.changed {fields: [logo], by} in the same transaction, and answers the address it held, which the save then removes from storage.';

-- 00490 · A business's look is read from its site (decision 0075).
--
-- A workspace wears a logo (00407) and, from here, a colour: `tenants.accent`, the one hex its emails to customers
-- and the pages they open draw the button and the links in. Two doors write it:
--   set_workspace_accent   a member who may change the workspace's settings, as set_workspace_logo is;
--   wear_found_look        the service role, from the website read (website_read): the logo the site declares and the
--                          colour its page wears, written only where the column is empty AND no person ever set that
--                          field (no settings.changed event naming it with a `by`), so an owner's choice stands,
--                          including the choice of none. Its own event says `by: null, from: 'website'`.
-- Re-runnable throughout.

set local lock_timeout = '3s';

alter table public.tenants add column if not exists accent text;
alter table public.tenants drop constraint if exists tenants_accent_shape;
alter table public.tenants add constraint tenants_accent_shape
  check (accent is null or accent ~ '^#[0-9a-f]{6}$');
comment on column public.tenants.accent is
  'The workspace''s own colour (00490): one lower-case #rrggbb its emails to customers and their pages draw the button and links in; null when it has none and ink stands in. Written by set_workspace_accent (a member) and wear_found_look (the website read, only where no person set it).';

create or replace function public.set_workspace_accent(p_tenant_id uuid, p_accent text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user   uuid := auth.uid();
  v_accent text := nullif(lower(btrim(coalesce(p_accent, ''))), '');
  v_before text;
begin
  if v_user is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  if p_tenant_id is null or not public.caller_has_permission(p_tenant_id, 'settings') then
    raise exception 'Only someone who may change this workspace''s settings can change its colour.' using errcode = '42501';
  end if;
  if v_accent is not null and v_accent !~ '^#[0-9a-f]{6}$' then
    raise exception 'A colour is one #rrggbb.' using errcode = '22023';
  end if;
  -- The row, held against a second save at once; "no key", so the many writes that only point at the workspace go on.
  select t.accent into v_before from public.tenants t where t.id = p_tenant_id for no key update;
  if not found then
    raise exception 'Workspace not found.' using errcode = 'P0002';
  end if;
  update public.tenants set accent = v_accent where id = p_tenant_id;
  insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
  values (p_tenant_id, 'settings.changed', 'system', 'workspace', p_tenant_id,
          jsonb_build_object('fields', jsonb_build_array('accent'), 'by', v_user, 'version', null));
  return v_before;
end $$;

revoke execute on function public.set_workspace_accent(uuid, text) from public, anon;
grant execute on function public.set_workspace_accent(uuid, text) to authenticated, service_role;
comment on function public.set_workspace_accent(uuid, text) is
  'Sets (or, with null, clears) the workspace''s colour for a caller who may change its settings (caller_has_permission ''settings''), refuses anything but one #rrggbb, writes settings.changed {fields: [accent], by} in the same transaction, and answers the colour it held.';

create or replace function public.wear_found_look(p_tenant_id uuid, p_logo_path text, p_accent text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_logo   text := nullif(btrim(coalesce(p_logo_path, '')), '');
  v_accent text := nullif(lower(btrim(coalesce(p_accent, ''))), '');
  v_row    public.tenants%rowtype;
  v_wore   text[] := '{}';
begin
  if p_tenant_id is null then
    raise exception 'Workspace not found.' using errcode = 'P0002';
  end if;
  if v_logo is not null and split_part(v_logo, '/', 1) <> p_tenant_id::text then
    raise exception 'That picture is not this workspace''s.' using errcode = '22023';
  end if;
  if v_accent is not null and v_accent !~ '^#[0-9a-f]{6}$' then
    raise exception 'A colour is one #rrggbb.' using errcode = '22023';
  end if;
  select * into v_row from public.tenants t where t.id = p_tenant_id for no key update;
  if not found then
    raise exception 'Workspace not found.' using errcode = 'P0002';
  end if;
  -- A field a person ever set, or cleared, is theirs: never written here.
  if v_logo is not null and v_row.logo_path is null and not exists (
    select 1 from public.events e
     where e.tenant_id = p_tenant_id and e.kind = 'settings.changed'
       and e.data->'fields' ? 'logo' and e.data->>'by' is not null)
  then
    update public.tenants set logo_path = v_logo where id = p_tenant_id;
    v_wore := v_wore || 'logo';
  end if;
  if v_accent is not null and v_row.accent is null and not exists (
    select 1 from public.events e
     where e.tenant_id = p_tenant_id and e.kind = 'settings.changed'
       and e.data->'fields' ? 'accent' and e.data->>'by' is not null)
  then
    update public.tenants set accent = v_accent where id = p_tenant_id;
    v_wore := v_wore || 'accent';
  end if;
  if cardinality(v_wore) > 0 then
    insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
    values (p_tenant_id, 'settings.changed', 'system', 'workspace', p_tenant_id,
            jsonb_build_object('fields', to_jsonb(v_wore), 'by', null, 'from', 'website', 'version', null));
  end if;
  return jsonb_build_object('logo', 'logo' = any (v_wore), 'accent', 'accent' = any (v_wore));
end $$;

revoke execute on function public.wear_found_look(uuid, text, text) from public, anon, authenticated;
grant execute on function public.wear_found_look(uuid, text, text) to service_role;
comment on function public.wear_found_look(uuid, text, text) is
  'The website read''s door (00490): wears the logo path and the colour it found, each only where the column is empty and no person ever set that field (no settings.changed naming it with a by), writes one settings.changed {fields, by: null, from: website} for what it wore, and answers {logo, accent} booleans. Service role only.';

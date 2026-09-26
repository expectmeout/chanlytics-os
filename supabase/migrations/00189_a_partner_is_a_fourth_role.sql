-- 00189 · A partner is a fourth role: it sets a workspace up and runs its receptionist, and touches neither its
--         money nor its team.
--
-- Decision 0011, P1. A partner is the member who brought the workspace and sets it up for its owner. Nothing writes
-- the role yet (P2's create_workspace will); this makes the database ready for it, so the dashboard that knows the
-- role and the rows that will carry it can arrive in either order, and no door meets a role it does not understand.
--
--   memberships.role       admits 'partner'.
--   is_acting_member       admits a partner beside owner and operator: the decisions ledger, the autonomy matrix, and
--                          every verb an operator has.
--   has_permission         the one place a role becomes a permission in SQL (00140), widened: a partner has approve,
--                          autonomy, disconnect, settings and find; not billing, team or export. contracts ROLE_PERMS
--                          is the same table, and lead-engine.db.test.mjs holds the two together.
--   caller_has_permission  has_permission about the caller alone, which is why a session may ask it: the row policies
--                          below read it instead of "role = 'owner'", so a permission is decided in one place.
--   the setting-class doors, re-pointed at that permission: tenant_config (00012), the tenants columns a session may
--   write (00084, 00160), capability_activations (00108), the mailbox (00129). The team, billing, export and erasure
--   doors keep their owner checks: is_workspace_owner (00084) is unchanged and still what they read.

-- --------------------------------------------------------------------------------------------------------- the role

alter table public.memberships drop constraint if exists memberships_role_check;
alter table public.memberships
  add constraint memberships_role_check check (role in ('owner', 'operator', 'partner', 'viewer'));

-- ----------------------------------------------------------------------------------------- a partner acts

create or replace function public.is_acting_member(p_tenant uuid)
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select exists (
    select 1 from public.memberships m
     where m.user_id = (select auth.uid())
       and m.tenant_id = p_tenant
       and m.role in ('owner', 'operator', 'partner')
  );
$$;

comment on function public.is_acting_member(uuid) is
  'True when the caller may COMMIT changes in this tenant (owner, operator or partner). Viewers read only.';

-- ------------------------------------------------------------------------------ the one table of permissions

create or replace function public.has_permission(p_user uuid, p_tenant_id uuid, p_permission text)
returns boolean
language sql
stable
security definer
set search_path = public
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
         else array[]::text[] end)
  )
$$;

comment on function public.has_permission(uuid, uuid, text) is
  'Whether this user may do this in this workspace, by role: contracts'' ROLE_PERMS, restated once in SQL. A partner (0011) sets the workspace up: settings, disconnect and find beside what an operator has; billing, team and export stay the owner''s.';

-- It takes an arbitrary user id, so a signed-in member could read anyone's role with it. The doors call it as
-- definer; a session asks caller_has_permission, which answers about the caller alone.
revoke execute on function public.has_permission(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.has_permission(uuid, uuid, text) to service_role;

-- The same table, about the caller. Safe to grant to every session for the reason is_platform_admin (00091) is: it
-- reveals one bit about the caller and nothing about anybody else. A row policy or a session-called function reads
-- this where it used to read "role = 'owner'", so widening a permission is one edit, above, and never a hunt.
create or replace function public.caller_has_permission(p_tenant_id uuid, p_permission text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_permission((select auth.uid()), p_tenant_id, p_permission);
$$;

comment on function public.caller_has_permission(uuid, text) is
  'has_permission for the calling session: whether the caller may do this in this workspace. Answers only about the caller, which is why every session may ask.';

revoke execute on function public.caller_has_permission(uuid, text) from public, anon;
grant execute on function public.caller_has_permission(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------------- the setting-class doors

-- The receptionist's configuration (00012, re-scoped in 00120): settings.
drop policy if exists tenant_config_owner_update on public.tenant_config;
create policy tenant_config_owner_update on public.tenant_config
  for update to authenticated
  using (public.caller_has_permission(tenant_id, 'settings'))
  with check (public.caller_has_permission(tenant_id, 'settings'));

-- The workspace's own columns a session may write, timezone (00084) and sells_by (00160): settings. The column
-- grants stand; this is only who.
drop policy if exists tenants_owner_update on public.tenants;
create policy tenants_owner_update on public.tenants
  for update to authenticated
  using (public.caller_has_permission(id, 'settings'))
  with check (public.caller_has_permission(id, 'settings'));

-- Switching a capability on or off (00108): the channel permission.
drop policy if exists capability_activations_owner_write on public.capability_activations;
create policy capability_activations_owner_write on public.capability_activations
  for all to authenticated
  using (public.caller_has_permission(tenant_id, 'disconnect'))
  with check (public.caller_has_permission(tenant_id, 'disconnect'));

-- The mailbox (00129): settings. The bodies are 00129's with the check re-pointed; the words stay the owner's until a
-- workspace can say whether it has a partner (0011, P2).
create or replace function public.create_mailbox(p_tenant_id uuid, p_local_part text, p_from_name text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_user  uuid := auth.uid();
  v_local text := lower(btrim(coalesce(p_local_part, '')));
  v_name  text := btrim(coalesce(p_from_name, ''));
  v_row   public.mailboxes;
begin
  if v_user is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  if not public.caller_has_permission(p_tenant_id, 'settings') then
    raise exception 'Only an owner can set up email.' using errcode = '42501';
  end if;
  begin
    insert into mailboxes (tenant_id, local_part, reply_token, from_name)
    values (p_tenant_id, v_local, public.mint_reply_token(), v_name)
    returning * into v_row;
  exception
    when check_violation then
      raise exception 'That cannot be used as an address or a name.' using errcode = '22023';
    when unique_violation then
      if exists (select 1 from mailboxes m where m.tenant_id = p_tenant_id) then
        raise exception 'This workspace already has an email address.' using errcode = '23505';
      end if;
      raise exception 'That address is taken. Try another.' using errcode = '23505';
  end;
  insert into events (tenant_id, kind, category, subject_type, subject_id, data)
  values (p_tenant_id, 'mailbox.created', 'system', 'mailbox', v_row.id, jsonb_build_object('by', v_user));
  return jsonb_build_object('id', v_row.id, 'local_part', v_row.local_part, 'from_name', v_row.from_name);
end $$;

comment on function public.create_mailbox(uuid, text, text) is
  'An owner, or the partner who set the workspace up, gives it its email address, once. The reply route''s token is minted here; the event records who, never the address.';

create or replace function public.rename_mailbox(p_mailbox_id uuid, p_from_name text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user   uuid := auth.uid();
  v_tenant uuid;
  v_name   text := btrim(coalesce(p_from_name, ''));
begin
  if v_user is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  select m.tenant_id into v_tenant from mailboxes m where m.id = p_mailbox_id;
  if v_tenant is null or not public.caller_has_permission(v_tenant, 'settings') then
    raise exception 'Only an owner can change this.' using errcode = '42501';
  end if;
  begin
    update mailboxes set from_name = v_name where id = p_mailbox_id;
  exception when check_violation then
    raise exception 'That cannot be used as a name.' using errcode = '22023';
  end;
  insert into events (tenant_id, kind, category, subject_type, subject_id, data)
  values (v_tenant, 'mailbox.renamed', 'system', 'mailbox', p_mailbox_id, jsonb_build_object('by', v_user));
  return jsonb_build_object('id', p_mailbox_id, 'from_name', v_name);
end $$;

comment on function public.rename_mailbox(uuid, text) is
  'An owner, or the partner who set the workspace up, changes the name customers see beside the workspace''s email address. The address itself is never changed.';

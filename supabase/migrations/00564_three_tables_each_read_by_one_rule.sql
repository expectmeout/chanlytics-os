-- 00564 · Three tables each read (or changed) by one rule, and a function nothing calls goes.
--
-- Production's advisor named three tables where two permissive rules answered the same role and command (decision 0111):
-- each rule is asked for every row, so a read pays for both. Each pair becomes one rule joined by OR, which is what
-- Postgres already did with the two: nobody may do more or less than before.
--   capability_activations: `owner_write` was FOR ALL, so it also let an owner read, beside `member_read`. The read
--     becomes one rule (a member, or one with the `disconnect` permission), and the writes are the owner's alone, one rule
--     a command.
--   partner_tenants: an owner's read of their workspace's partner and a partner's read of their own become one.
--   policies: an acting member's update of a workspace-wide policy and an owner's update of any become one.
-- sweep_recent_responses (00019), the sweeps' last HTTP answers read off pg_net, is called by no code, SQL, schedule or
-- script, and no page or runbook names it: docs/sql-map.md lists what reads each function.
--
-- Re-runnable.

set local lock_timeout = '3s';

drop policy if exists capability_activations_owner_write on public.capability_activations;
drop policy if exists capability_activations_member_read on public.capability_activations;
create policy capability_activations_member_read on public.capability_activations
  for select to authenticated
  using (
    tenant_id in (select m.tenant_id from public.memberships m where m.user_id = (select auth.uid()))
    or public.caller_has_permission(tenant_id, 'disconnect')
  );
drop policy if exists capability_activations_owner_insert on public.capability_activations;
create policy capability_activations_owner_insert on public.capability_activations
  for insert to authenticated
  with check (public.caller_has_permission(tenant_id, 'disconnect'));
drop policy if exists capability_activations_owner_update on public.capability_activations;
create policy capability_activations_owner_update on public.capability_activations
  for update to authenticated
  using (public.caller_has_permission(tenant_id, 'disconnect'))
  with check (public.caller_has_permission(tenant_id, 'disconnect'));
drop policy if exists capability_activations_owner_delete on public.capability_activations;
create policy capability_activations_owner_delete on public.capability_activations
  for delete to authenticated
  using (public.caller_has_permission(tenant_id, 'disconnect'));

drop policy if exists partner_tenants_owner_select on public.partner_tenants;
drop policy if exists partner_tenants_partner_select on public.partner_tenants;
drop policy if exists partner_tenants_owner_or_partner_select on public.partner_tenants;
create policy partner_tenants_owner_or_partner_select on public.partner_tenants
  for select to authenticated
  using (
    public.is_workspace_owner(tenant_id)
    or partner_id in (select p.id from public.partners p where p.user_id = (select auth.uid()))
  );

drop policy if exists policies_acting_member_update on public.policies;
drop policy if exists policies_owner_update on public.policies;
drop policy if exists policies_member_update on public.policies;
create policy policies_member_update on public.policies
  for update to authenticated
  using (
    (public.is_acting_member(tenant_id) and subject_type is null)
    or tenant_id in (
      select m.tenant_id from public.memberships m where m.user_id = (select auth.uid()) and m.role = 'owner'
    )
  )
  with check (
    (public.is_acting_member(tenant_id) and subject_type is null)
    or tenant_id in (
      select m.tenant_id from public.memberships m where m.user_id = (select auth.uid()) and m.role = 'owner'
    )
  );

drop function if exists public.sweep_recent_responses(integer);

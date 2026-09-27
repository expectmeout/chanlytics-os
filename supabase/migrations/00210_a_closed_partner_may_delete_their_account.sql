-- 00210 · A closed partner may delete their account.
--
-- 00208 refuses the delete of anyone whose partner record holds workspaces brought or money earned (partner_records),
-- and its words send them to the platform to close the record first. The check did not read the record's status, so a
-- partner the platform had closed was refused all the same, for ever. Closing is the answer 00208 asks for, and 00207
-- already makes the record outlive the account: partners.user_id is set null when the person goes, the record closes
-- itself, and the ledger (partner_tenants, partner_earnings, partner_payouts) stays as it is. So the refusal now holds
-- only while the record is not closed. Nothing else in delete_my_account changes.
-- Forward-only; re-runnable.

create or replace function public.delete_my_account()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_headless integer;
  v_orphaned integer;
  v_partner integer;
begin
  if v_user is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  -- Every membership of every workspace the caller is in, locked: two owners deleting at once take turns.
  perform 1 from memberships
   where tenant_id in (select tenant_id from memberships where user_id = v_user)
   for update;
  -- A partner record that holds workspaces brought or money earned: the platform closes it first. Closed, it outlives
  -- the account (00207: user_id set null, the ledger kept), so a closed partner may go.
  select count(*) into v_partner
  from partners p
  where p.user_id = v_user
    and p.status <> 'closed'
    and (exists (select 1 from partner_tenants pt where pt.partner_id = p.id)
      or exists (select 1 from partner_earnings pe where pe.partner_id = p.id));
  if v_partner > 0 then
    raise exception 'partner_records' using errcode = 'P0001',
      hint = 'Your partner record holds workspaces you brought or money you earned. Write to us to close it first.';
  end if;
  -- A workspace with other members whose only owner is the caller.
  select count(*) into v_headless
  from memberships m
  where m.user_id = v_user
    and m.role = 'owner'
    and exists (select 1 from memberships o where o.tenant_id = m.tenant_id and o.user_id <> v_user)
    and not exists (select 1 from memberships o where o.tenant_id = m.tenant_id and o.user_id <> v_user and o.role = 'owner');
  if v_headless > 0 then
    raise exception 'sole_owner' using errcode = 'P0001',
      hint = 'You are the only owner of a workspace with other members. Make someone else an owner first.';
  end if;
  -- Workspaces that will have nobody left: kept, for the platform to erase.
  select count(*) into v_orphaned
  from memberships m
  where m.user_id = v_user
    and not exists (select 1 from memberships o where o.tenant_id = m.tenant_id and o.user_id <> v_user);
  delete from push_devices where user_id = v_user;
  delete from notification_marks where user_id = v_user;
  delete from notification_reads where user_id = v_user;
  delete from memberships where user_id = v_user;
  delete from auth.users where id = v_user;
  return jsonb_build_object('deleted', true, 'workspaces_left_empty', v_orphaned);
end $$;
revoke execute on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

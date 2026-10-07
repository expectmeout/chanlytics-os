-- 00190 · A person deletes their own account.
--
-- App Store 5.1.1(v): an app that lets a person create an account must let
-- them delete it, in the app. The data-deletion page said "write to us"; this
-- is the door. One definer function, the caller's own account only:
--
--   1. The only owner of a workspace that has other members may not leave it
--      headless: they make someone else an owner first (memberships PUT), and
--      the door says so. A workspace whose only member is the caller is left
--      with no members; its data stays for the business until the platform
--      erases it (the phone app's PRD, M8: Ruben's rule), so a deleted account
--      never takes a business's conversations with it by accident.
--   2. Their phones, their bell marks and their memberships go, then the
--      auth user. Everything that references auth.users cascades (00001).
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
begin
  if v_user is null then
    raise exception 'Sign in required.' using errcode = '28000';
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

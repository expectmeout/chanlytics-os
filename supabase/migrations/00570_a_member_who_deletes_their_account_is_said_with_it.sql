-- 00570 · A member who deletes their account is said with it (layer 10, decision 0115).
--
-- member.left is what tells a workspace a teammate has gone (team_notice, 00437). When a person deleted their account, the
-- route wrote it after the deletion had committed, in a second statement whose failure was only logged, so the team could
-- lose the notice for good. It is written here now, in the deletion's own transaction, as team_leave has always written it.
--
--   delete_my_account   member.left for each workspace the person sat in, before their seats go.
--
-- Deploy order: either. With this first, a deletion in the minutes before the dashboard deploys is said twice; with the
-- dashboard first, one in those minutes is not said. Re-runnable.

set local lock_timeout = '3s';

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
  v_emptied uuid[];
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
  -- Workspaces that will have nobody left: kept, for the platform to erase, and ended now (00262): the receptionist
  -- stops (paused, as billing pauses one) and the mark tells billing never to resume it; the edge ends its plan.
  select coalesce(array_agg(m.tenant_id), '{}'), count(*) into v_emptied, v_orphaned
  from memberships m
  where m.user_id = v_user
    and not exists (select 1 from memberships o where o.tenant_id = m.tenant_id and o.user_id <> v_user);
  update tenants set status = 'paused', left_empty_at = now()
   where id = any(v_emptied) and left_empty_at is null;
  -- Nobody joins an ended workspace: the invitations still open for it go with it (a team invite seats an operator
  -- or a viewer, never an owner, so one accepted now would seat someone who could not even pay for it).
  update invitations set revoked_at = now()
   where tenant_id = any(v_emptied) and accepted_at is null and revoked_at is null;
  delete from partner_invitations where tenant_id = any(v_emptied);
  delete from push_devices where user_id = v_user;
  delete from notification_marks where user_id = v_user;
  delete from notification_reads where user_id = v_user;
  -- Each workspace they sat in hears of it (team_notice, 00437), in this transaction, so the news cannot be lost to a write
  -- that fails after the seat has gone (00570).
  insert into events (tenant_id, kind, category, subject_type, subject_id, data)
  select m.tenant_id, 'member.left', 'system', 'workspace', m.tenant_id,
         jsonb_build_object('by', v_user, 'how', 'account_deleted')
    from memberships m
   where m.user_id = v_user;
  delete from memberships where user_id = v_user;
  delete from auth.users where id = v_user;
  return jsonb_build_object('deleted', true, 'workspaces_left_empty', v_orphaned, 'workspaces_emptied', to_jsonb(v_emptied));
end $$;

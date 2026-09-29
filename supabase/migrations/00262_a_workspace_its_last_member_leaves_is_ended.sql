-- 00262 · A workspace its last member leaves is ended, not left running.
--
-- delete_my_account (00190, 00208, 00210) removes a person's sign-in and memberships and keeps a workspace they alone
-- were in, for the platform to erase (the phone app's PR 5 design). Nothing else changed for that workspace: its
-- receptionist kept answering customers with nobody to hand a conversation to, its number stayed live, and its Stripe
-- subscription kept charging a card whose holder could no longer sign in to cancel it (the re-score of 28 September).
--
-- The rule, written with this change (no decision note or runbook section had one): a workspace its last member
-- leaves is ENDED and kept. Ended means: paused at once (tenants.status, as billing pauses a workspace whose plan
-- stopped, so the receptionist, the playbooks and the broadcasts stop), marked with when (tenants.left_empty_at, new),
-- closed to joiners (its open team and partner invitations revoked),
-- and its plan canceled at once by the edge (the dashboard's DELETE /me asks the billing door's "end"; a subscription
-- event that still finds the plan live cancels it then). Billing never resumes a workspace with the mark, and no plan is
-- bought for one (checkout, resume and start-now refuse it). Kept means:
-- nothing is erased here; the platform erases it on its own rule, later, as before. A line whose plan ended is
-- released by the lines sweep's existing grace (A2).
--
-- Additive: one nullable column, the door replaced whole with the three lines that end what it empties; its answer
-- gains workspaces_emptied (the ids) beside the count, which an older dashboard ignores. Re-runnable.

alter table public.tenants add column if not exists left_empty_at timestamptz;
comment on column public.tenants.left_empty_at is
  'When the workspace''s last member left it (delete_my_account, 00262): it is paused, its plan is ended, and billing never resumes it. Null while anyone is in it.';

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
  delete from memberships where user_id = v_user;
  delete from auth.users where id = v_user;
  return jsonb_build_object('deleted', true, 'workspaces_left_empty', v_orphaned, 'workspaces_emptied', to_jsonb(v_emptied));
end $$;

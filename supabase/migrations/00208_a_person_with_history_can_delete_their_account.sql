-- 00208 · A person with history can delete their account.
--
-- 00190's door said everything that references auth.users cascades. Five columns did not: a message a person sent
-- (messages.sent_by), a handover they resolved (escalations.resolved_by_user_id), a decision they made
-- (decisions.actor_user_id), an invitation they sent (invitations.invited_by) and a thread assigned to them
-- (conversations.assignee_user_id) all pointed at auth.users with no delete rule. So the delete of the auth user was
-- refused (23503) for anyone who had ever replied, resolved, decided or invited, the whole door rolled back, and
-- Settings showed Postgres's sentence. Only a brand-new account could go, which is what the test deleted. The button
-- is live on the web.
--
-- Now:
--   1. Those five columns are set null when the person goes. The row stays: the message was still sent, the handover
--      still resolved, the decision still made; only who did it is no longer a person on record. decisions' check
--      tied actor_type = 'user' to a present id; a departed person's decision keeps its actor_type and loses the id.
--      invitations.invited_by was not null for the same reason and is not any more. conversations.control_by keeps
--      its rule: a hold must name its holder (00132's check), and 00132's trigger releases every hold and assignment
--      of a member as their membership goes, which the door deletes before the user. A hold that survived that would
--      still refuse the delete, loudly, rather than leave a thread held by nobody.
--   2. A partner (00202) whose record holds workspaces they brought (partner_tenants) or money they earned
--      (partner_earnings) is refused by name, partner_records: both point at partners with on delete restrict, and
--      money owed or paid outlives an account. The platform closes the record first.
--   3. Every membership of every workspace the person is in is locked before the sole-owner check, so two owners of
--      one workspace deleting at the same moment take turns, and the second sees the first gone when it counts.
-- Forward-only; every statement re-runnable.

alter table public.messages drop constraint if exists messages_sent_by_fkey;
alter table public.messages
  add constraint messages_sent_by_fkey foreign key (sent_by) references auth.users (id) on delete set null;

alter table public.escalations drop constraint if exists escalations_resolved_by_user_id_fkey;
alter table public.escalations
  add constraint escalations_resolved_by_user_id_fkey
  foreign key (resolved_by_user_id) references auth.users (id) on delete set null;

alter table public.decisions drop constraint if exists decisions_actor_user_id_fkey;
alter table public.decisions
  add constraint decisions_actor_user_id_fkey foreign key (actor_user_id) references auth.users (id) on delete set null;
alter table public.decisions drop constraint if exists decisions_check;
alter table public.decisions drop constraint if exists decisions_actor_user_id_check;
alter table public.decisions
  add constraint decisions_actor_user_id_check check (actor_type = 'user' or actor_user_id is null);

alter table public.invitations alter column invited_by drop not null;
alter table public.invitations drop constraint if exists invitations_invited_by_fkey;
alter table public.invitations
  add constraint invitations_invited_by_fkey foreign key (invited_by) references auth.users (id) on delete set null;

alter table public.conversations drop constraint if exists conversations_assignee_user_id_fkey;
alter table public.conversations
  add constraint conversations_assignee_user_id_fkey
  foreign key (assignee_user_id) references auth.users (id) on delete set null;

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
  -- A partner record that holds workspaces brought or money earned: the platform closes it first.
  select count(*) into v_partner
  from partners p
  where p.user_id = v_user
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

-- 00371 · A member may leave, and an invitation is sent again (Settings › Team, 9 Oct 2026).
--
-- Three doors for the redesigned Team card, each the platform's (the service role), handed the session's verified user
-- as the actor by the dashboard's route, as 00277's team functions are; and one lookup that told the invite route the
-- wrong thing.
--
--   1. team_invite_renew: an owner sends an invitation again. The invitation keeps its row and its role and is open for
--      seven days from now (00012's default, said again here), and the ledger says it went again: an `invite` decision
--      with `resent`. The card said "revoke it and send a new one", which never sent anything (4, below).
--   2. team_invite_renew_withdraw: the mail could not go, so the renewal is taken back, its expiry and its one decision,
--      as team_invite_withdraw takes back an invitation whose first mail could not go: the ledger never says an email
--      went that did not.
--   3. team_leave: any member leaves a workspace, an owner too while another owner stays (last_owner otherwise). A
--      `remove_member` decision by their own hand, with `left`. team_remove refuses a removal of oneself, and only an
--      owner may call it, so an operator who left a business had to ask to be removed.
--   4. lookup_user_for_invite counts a CONFIRMED account alone. An invitation makes an account in Supabase Auth before it
--      is accepted, unconfirmed; a second invitation to that address (here after a revoke, or from another workspace)
--      found it, seated the person at once and emailed nothing, and the card said they "already had an account". Now
--      such an address is invited, and Auth's invite sends its email again to an account never confirmed.
--
-- The doors take the team's turn as 00277's do, in the same order: the row first, then the lock 00271's trigger takes,
-- so a leave and a removal of the same member cannot each hold what the other waits for.
-- Re-runnable: `create or replace`, and the grants said again.

-- ---------------------------------------------------------------- 1. an invitation sent again
create or replace function public.team_invite_renew(
  p_tenant_id uuid,
  p_actor uuid,
  p_invitation_id uuid,
  p_via text default null
)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_inv   public.invitations%rowtype;
  v_audit jsonb;
begin
  perform public.team_owner_or_refuse(p_tenant_id, p_actor);
  select * into v_inv from public.invitations i
   where i.tenant_id = p_tenant_id and i.id = p_invitation_id and i.accepted_at is null and i.revoked_at is null
   for update;
  if v_inv.id is null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  -- Seven days, as a new invitation has (00012's default).
  update public.invitations set expires_at = now() + interval '7 days' where id = v_inv.id;
  v_audit := public.team_decision(p_tenant_id, p_actor, 'invitation', v_inv.id, 'invite',
                                  jsonb_build_object('email', v_inv.email, 'role', v_inv.role, 'resent', true),
                                  p_via, null);
  return jsonb_build_object('invitation_id', v_inv.id, 'email', v_inv.email, 'role', v_inv.role,
                            'was', v_inv.expires_at) || v_audit;
end $$;
revoke all on function public.team_invite_renew(uuid, uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.team_invite_renew(uuid, uuid, uuid, text) to service_role;
comment on function public.team_invite_renew(uuid, uuid, uuid, text) is
  'An owner sends an open invitation again (00371): seven more days and an invite decision with resent, in one transaction, before the mail; team_invite_renew_withdraw takes both back when the mail cannot go. Service role, as team_invite.';

-- ---------------------------------------------------------------- 2. a renewal whose mail could not go
create or replace function public.team_invite_renew_withdraw(
  p_tenant_id uuid,
  p_invitation_id uuid,
  p_decision_id uuid,
  p_was timestamptz
)
returns void
language plpgsql
set search_path = public
as $$
begin
  -- Only an invitation still open is put back: one accepted or revoked meanwhile is somebody's. And only while it
  -- holds the expiry THIS renewal set: team_invite_renew sets now() + 7 days and its decision's created_at is that same
  -- now(), so a later renewal (another owner's, whose mail went) has moved the expiry on and its days stand.
  update public.invitations set expires_at = p_was
   where tenant_id = p_tenant_id and id = p_invitation_id and accepted_at is null and revoked_at is null
     and expires_at = (select d.created_at + interval '7 days' from public.decisions d
                        where d.id = p_decision_id and d.tenant_id = p_tenant_id);
  -- The renewal's own decision, and no other: the first invitation's stays. After the update, which reads it.
  delete from public.decisions
   where tenant_id = p_tenant_id and id = p_decision_id and subject_type = 'invitation'
     and subject_id = p_invitation_id and verb = 'invite' and payload ->> 'resent' = 'true';
end $$;
revoke all on function public.team_invite_renew_withdraw(uuid, uuid, uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.team_invite_renew_withdraw(uuid, uuid, uuid, timestamptz) to service_role;
comment on function public.team_invite_renew_withdraw(uuid, uuid, uuid, timestamptz) is
  'A renewal whose mail could not go, taken back (00371): the expiry it had and its resent decision, in one transaction. The expiry goes back only while the invitation still holds the one this renewal set: a later renewal''s expiry stands.';

-- ---------------------------------------------------------------- 3. a member leaves
create or replace function public.team_leave(p_tenant_id uuid, p_actor uuid, p_via text default null)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_member public.memberships%rowtype;
  v_owners integer;
  v_audit  jsonb;
begin
  select * into v_member from public.memberships m
   where m.tenant_id = p_tenant_id and m.user_id = p_actor
   for update;
  if v_member.id is null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  -- The team's turn (00277 team_take_turn's lock, without its owner check: any member may leave), then the count.
  perform pg_advisory_xact_lock(hashtextextended('memberships_keep_an_owner:' || p_tenant_id::text, 0));
  if v_member.role = 'owner' then
    select count(*) into v_owners from public.memberships m where m.tenant_id = p_tenant_id and m.role = 'owner';
    if v_owners <= 1 then
      raise exception 'last_owner' using errcode = 'P0001';
    end if;
  end if;
  delete from public.memberships where id = v_member.id;
  -- Carrying the role they held, as team_remove's does: the membership row is gone.
  v_audit := public.team_decision(p_tenant_id, p_actor, 'membership', v_member.id, 'remove_member',
                                  jsonb_build_object('removed_user_id', v_member.user_id, 'had_role', v_member.role,
                                                     'left', true),
                                  p_via, null);
  return jsonb_build_object('left', true) || v_audit;
end $$;
revoke all on function public.team_leave(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.team_leave(uuid, uuid, text) to service_role;
comment on function public.team_leave(uuid, uuid, text) is
  'A member leaves a workspace (00371): the membership and a remove_member decision with left, in one transaction; the last owner stays (last_owner). Service role: the route passes the session''s verified user as p_actor.';

-- ---------------------------------------------------------------- 4. an account is one that was confirmed
-- As 00121 left it, with the one clause.
create or replace function public.lookup_user_for_invite(p_tenant_id uuid, p_email text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  -- OWNER, not merely a member. This answers "does this address have an
  -- account", which is an enumeration oracle. Since 00121 only the service role
  -- may call it, asked by the invite route after the route's own owner check and
  -- rate bucket; a session that somehow held EXECUTE again would still have to
  -- own the workspace.
  if auth.uid() is not null and not exists (
    select 1 from public.memberships m
     where m.tenant_id = p_tenant_id and m.user_id = auth.uid() and m.role = 'owner'
  ) then
    raise exception 'Only an owner can invite people.' using errcode = '42501';
  end if;

  -- auth.users.email is stored lowercased, but the caller's input is not
  -- guaranteed to be, and a case mismatch here would re-create the bug this
  -- function exists to fix: a known account read as new.
  -- Confirmed (00371): an account an invitation made and nobody has opened is
  -- not one to seat without asking; that address is invited, and emailed.
  select u.id into v_id
    from auth.users u
   where lower(u.email) = lower(btrim(p_email))
     and (u.email_confirmed_at is not null or u.phone_confirmed_at is not null)
   limit 1;

  return v_id;
end
$$;

revoke execute on function public.lookup_user_for_invite(uuid, text) from public, anon, authenticated;
grant execute on function public.lookup_user_for_invite(uuid, text) to service_role;

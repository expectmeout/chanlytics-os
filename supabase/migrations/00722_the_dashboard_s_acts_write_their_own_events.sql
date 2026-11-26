-- 00722 · The dashboard's acts write their own events (lanes 9 and 2 of the code refinement plan, finished together,
-- 26 Nov 2026: layer 10's invariant 2, a change and its event in one transaction, written by its door; and layer 11, a
-- member's own act reaches its door as the member, off the dashboard's all-access key).
--
--   invitation_accept         New: a person's open invitation taken up, the seat, member.joined and the stamp in one
--                             transaction, where the dashboard wrote three rows it ordered by hand.
--
-- Nothing a customer sees changes: the same kinds, with the same words, in the same places.
--
-- Deploy order: either. An old dashboard keeps writing its rows and its events as before: nothing here changes what it
-- calls. The new dashboard calls the new doors, which a database from before this does not have: it deploys after this
-- is applied, as the house applies a migration before its merge.
set local lock_timeout = '3s';

/* -- invitation_accept: the seat, its news and the stamp, in one transaction -- */

-- A person's open invitation taken up: the seat at the invited role, member.joined (which the owner's bell line
-- follows, core SUBSCRIBERS.team_notice), and the invitation stamped accepted, where the dashboard wrote three rows
-- that could not share a transaction and ordered them so the next read would finish a half-made one. A seat held
-- already (another door, an earlier try) is accepted and said once: the news is written only where the ledger does
-- not hold it for this invitation, and the stamp only while the invitation is open. The service role's: the person is
-- not a member until this runs (the dashboard's team route, after it reads the person's own verified address).
create or replace function public.invitation_accept(p_invitation_id uuid, p_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_inv public.invitations;
begin
  select * into v_inv from public.invitations i
   where i.id = p_invitation_id and i.accepted_at is null and i.revoked_at is null and i.expires_at > now()
   for update;
  if not found then
    return false;
  end if;
  insert into public.memberships (user_id, tenant_id, role)
  values (p_user_id, v_inv.tenant_id, v_inv.role)
  on conflict do nothing;
  if not exists (select 1 from public.events e
                  where e.tenant_id = v_inv.tenant_id and e.kind = 'member.joined'
                    and e.subject_type = 'invitation' and e.subject_id = v_inv.id) then
    insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
    values (v_inv.tenant_id, 'member.joined', 'system', 'invitation', v_inv.id,
            jsonb_build_object('by', p_user_id, 'role', v_inv.role));
  end if;
  update public.invitations i set accepted_at = now() where i.id = v_inv.id and i.accepted_at is null;
  return true;
end $$;

revoke all on function public.invitation_accept(uuid, uuid) from public, anon, authenticated;
grant execute on function public.invitation_accept(uuid, uuid) to service_role;

comment on function public.invitation_accept(uuid, uuid) is
  'A person''s open invitation taken up, in one transaction (00722): the seat at the invited role (one held already is kept), member.joined where the ledger does not hold it for this invitation, and the invitation stamped accepted. False where the invitation is not open (taken, revoked or expired). The service role''s: the dashboard''s team route, after it reads the person''s verified address.';

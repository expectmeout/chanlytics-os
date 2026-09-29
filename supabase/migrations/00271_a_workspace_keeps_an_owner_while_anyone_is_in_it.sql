-- 00271 · A workspace keeps an owner while anyone is in it.
--
-- The team's door (apps/dashboard/src/server/workspace/team.ts) counted the owners and then removed or demoted one:
-- two owners removing each other at once, or one demoting the other while being demoted, each counted two and each
-- wrote, and the workspace was left with members and nobody who could manage its team or its billing (the scorecard,
-- defect 27). The count stays in the door for its words; the database now keeps the rule.
--
-- A deferred constraint trigger on memberships, so a transaction that hands ownership over (promote one, then demote
-- the other) is judged once, at its end. It takes a lock per workspace before it counts, so two changes to one
-- workspace's owners take turns and the second counts what the first did. It refuses, as last_owner, a change that
-- leaves a workspace with members and no owner. It lets go:
--   - a workspace being deleted (its memberships go with it);
--   - a workspace its last member left (delete_my_account, 00262: ended, with nobody in it), and that door's own
--     refusal of a sole owner who leaves others behind stands before it (sole_owner);
--   - a workspace a partner set up and is handing over (00214), whose partner's seat waits for the owner they asked.
--
-- Re-runnable.

set local lock_timeout = '3s';

create or replace function public.memberships_keep_an_owner()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant uuid := old.tenant_id;
begin
  -- One change to this workspace's owners at a time; the counts below are read after the lock, so a change that
  -- committed while this one waited is counted.
  perform pg_advisory_xact_lock(hashtextextended('memberships_keep_an_owner:' || v_tenant::text, 0));
  if not exists (select 1 from tenants t where t.id = v_tenant) then
    return null;
  end if;
  if exists (select 1 from memberships m where m.tenant_id = v_tenant and m.role = 'owner') then
    return null;
  end if;
  if not exists (select 1 from memberships m where m.tenant_id = v_tenant) then
    return null;
  end if;
  if exists (select 1 from partner_tenants pt
              where pt.tenant_id = v_tenant and pt.origin = 'handover' and pt.handover_accepted_at is null) then
    return null;
  end if;
  raise exception 'last_owner' using errcode = 'P0001',
    hint = 'This is the only owner. Promote someone else first.';
end;
$$;

comment on function public.memberships_keep_an_owner() is
  'A workspace keeps an owner while anyone is in it (00271): refuses, as last_owner, a removal or demotion that leaves members and no owner, judged at the end of the transaction under a per-workspace lock. A deleted workspace, one its last member left (00262) and one a partner is handing over (00214) are let go.';

revoke execute on function public.memberships_keep_an_owner() from public, anon, authenticated;

drop trigger if exists memberships_keep_an_owner on public.memberships;
create constraint trigger memberships_keep_an_owner
  after update of role, tenant_id or delete on public.memberships
  deferrable initially deferred
  for each row
  when (old.role = 'owner')
  execute function public.memberships_keep_an_owner();

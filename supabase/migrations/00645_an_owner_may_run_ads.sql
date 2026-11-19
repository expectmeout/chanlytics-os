-- 00645 · An owner may run ads (decision 0050, call 2; decision 0049, step P0b; the Ads build plan's step 1).
--
-- Spending on an ad account is the owner's alone: connecting the account, turning an ad on, pausing one, changing what it
-- may spend. The platform bills the owner and nobody else, so a partner, who sets a workspace up, does not hold it, and
-- neither does an operator. A permission of its own, `ads`, says so: contracts' ROLE_PERMS, restated once in SQL, as
-- every permission is.
--
--   has_permission   Knows ads: the owner's, and no other role's.
--
-- Nothing checks it yet. The doors that will (connect, turn on, pause, the amount) arrive with the steps that build them,
-- and each asks it again on the edge before any call to a platform.
--
-- Deploy order: either. Before this file the database answers false for `ads` to everyone, which no door asks; after it,
-- true for an owner. Re-runnable.

set local lock_timeout = '3s';

create or replace function public.has_permission(p_user uuid, p_tenant_id uuid, p_permission text)
returns boolean
language sql
stable
security definer
set search_path to 'public'
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
         when 'add_files'  then array['owner', 'operator', 'partner']
         when 'ads'        then array['owner']
         else array[]::text[] end)
       -- A partner's seat, asked about the calling session, counts only once it showed its second factor (0013).
       and (m.role <> 'partner' or p_user is distinct from (select auth.uid()) or public.session_shows_second_factor())
  )
$$;

comment on function public.has_permission(uuid, uuid, text) is
  'Whether this user may do this in this workspace, by role: contracts'' ROLE_PERMS, restated once in SQL. A partner (0012) sets the workspace up: settings, disconnect and find beside what an operator has; billing, team and export stay the owner''s. add_files (00596) is every role''s but a viewer''s. ads (00645) is the owner''s alone: spending on their own ad account.';

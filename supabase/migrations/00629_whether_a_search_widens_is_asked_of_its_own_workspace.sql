-- Whether a search widens is asked only about a workspace the caller reads (decision 0133; #2324's database rules).
--
-- 00628's lead_search_widens answered any signed-in person about any workspace's id. A member now reads their own
-- workspace's (may_read_workspace, the one member check for a definer read); the platform's own calls, lead_round_end
-- in the service role's transaction, have no person signed in and read any, as before. Nothing else changes: the
-- plan card reads its own workspace's, and lead_round_end its round's. Deploy order: either. Re-runnable.

set local lock_timeout = '3s';

create or replace function public.lead_search_widens(p_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select p.widen_on or p_tenant_id = any (p.widen_tenants) from public.lead_platform p where p.id), false)
     and (auth.uid() is null or public.may_read_workspace(p_tenant_id))
$$;

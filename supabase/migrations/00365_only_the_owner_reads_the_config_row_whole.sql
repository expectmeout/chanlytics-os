-- 00365 · Only the owner reads the configuration row whole.
--
-- tenant_config holds the calendar feed's address, and the address grants read access to the owner's calendar. The
-- dashboard shows it to the owner alone, but tenant_config_member_read let every member's session read the row, so an
-- operator, a viewer or a partner could read the address from a browser through the Data API. The row is now the
-- owner's to read; every other member reads it through tenant_config_read (00364), which masks the address, and writes
-- it through tenant_config_write (00364), since an update reads the row it changes. The dashboard's server reads the
-- row whole for the work it does on a member's behalf (the Calendar reads the feed, a save writes the whole column) with
-- the service role, once that member's session has been answered by tenant_config_read (server/workspace/config-row.ts).
-- The service role, every SQL door that reads the row, and the update policy (the settings permission) are unchanged.
--
-- ORDER: apply this AFTER the dashboard that reads through tenant_config_read is deployed. A dashboard from before it
-- reads the table on every member's session, and after this a non-owner's read finds no row: their settings read is a
-- 404, their Calendar has no feed, and a partner's save finds nothing to update. The edge and the jobs read with the
-- service role and are untouched. Re-runnable.

set local lock_timeout = '3s';

drop policy if exists tenant_config_member_read on public.tenant_config;
drop policy if exists tenant_config_owner_read on public.tenant_config;
create policy tenant_config_owner_read on public.tenant_config
  for select to authenticated
  using (tenant_id in (
    select m.tenant_id from public.memberships m where m.user_id = (select auth.uid()) and m.role = 'owner'));

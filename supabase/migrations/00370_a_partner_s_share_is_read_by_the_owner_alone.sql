-- 00370 · A partner's share of an invoice is read by the workspace's owner alone.
--
-- partner_earn and partner_reverse (0012) write what the partner who brought a workspace earns from its invoices, and
-- what a refund takes back, into the workspace's own events: the invoice, its amount, the partner and their share. The
-- events policy lets every member read every event of their workspace, so an operator or a viewer could read the
-- partner's cut of what the business pays. Billing is the owner's (caller_has_permission 'billing'); these three kinds now
-- are too. Every other event reads as before: the person page, Setup, Broadcasts and the definer readers that run as
-- the member all read kinds this leaves alone, and the owner-only Activity page still sees them.
--
-- Either deploy order works: no app reads these kinds on a member's session. Re-runnable.

set local lock_timeout = '3s';

drop policy if exists events_member_select on public.events;
create policy events_member_select on public.events for select to authenticated using (
  tenant_id in (select m.tenant_id from public.memberships m where m.user_id = (select auth.uid()))
  and (
    kind not in ('partner.earned', 'partner.reversed', 'partner.paid')
    or public.caller_has_permission(tenant_id, 'billing')
  )
);

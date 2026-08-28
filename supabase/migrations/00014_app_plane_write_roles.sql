-- The app-plane write policies checked membership but not ROLE.
--
-- 00004 scoped every verb write to "you belong to this tenant", which is the
-- right floor for cross-tenant safety and says nothing about which MEMBER may
-- act. 00012 introduced the role-scoped form for the control plane
-- (`and m.role = 'owner'`); these five policies never got the equivalent, so a
-- viewer's session could write conversations, messages, escalations and
-- decisions directly with the browser's anon key.
--
-- The real send path was closed in the route layer (requireOperator on all
-- seven verb routes), because the job that delivers a message is scheduled
-- with the service role and RLS was never in that path. This migration closes
-- the OTHER half: a viewer holding the anon key could still insert an outbound
-- 'human' message row that nobody sent, or flip a conversation's state, and
-- the transcript would show it as real.
--
-- viewer  — reads everything, writes nothing (unchanged for select policies)
-- operator/owner — may act
--
-- Membership-only scoping is kept for idempotency_keys (a request-dedupe
-- detail, not a decision) and for every select policy: viewers are meant to
-- see everything.

create or replace function public.is_acting_member(p_tenant uuid)
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select exists (
    select 1 from public.memberships m
     where m.user_id = (select auth.uid())
       and m.tenant_id = p_tenant
       and m.role in ('owner', 'operator')
  );
$$;

comment on function public.is_acting_member(uuid) is
  'True when the caller may COMMIT changes in this tenant (owner or operator). Viewers read only.';

drop policy if exists conversations_member_update on public.conversations;
create policy conversations_acting_member_update on public.conversations
  for update to authenticated
  using (public.is_acting_member(tenant_id))
  with check (public.is_acting_member(tenant_id));

drop policy if exists messages_member_insert on public.messages;
create policy messages_acting_member_insert on public.messages
  for insert to authenticated
  with check (
    public.is_acting_member(tenant_id)
    and direction = 'outbound' and sender = 'human'
  );

drop policy if exists messages_member_update on public.messages;
create policy messages_acting_member_update on public.messages
  for update to authenticated
  using (public.is_acting_member(tenant_id))
  with check (public.is_acting_member(tenant_id));

drop policy if exists escalations_member_update on public.escalations;
create policy escalations_acting_member_update on public.escalations
  for update to authenticated
  using (public.is_acting_member(tenant_id))
  with check (public.is_acting_member(tenant_id));

-- The decisions ledger keeps its self-as-actor check: a session may only ever
-- write ITSELF as the actor, and now only if it may act at all.
drop policy if exists decisions_member_insert on public.decisions;
create policy decisions_acting_member_insert on public.decisions
  for insert to authenticated
  with check (
    public.is_acting_member(tenant_id)
    and actor_type = 'user' and actor_user_id = (select auth.uid())
  );

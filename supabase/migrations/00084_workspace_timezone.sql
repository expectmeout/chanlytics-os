-- 00084 · The workspace's timezone, settable by the owner who lives in it.
--
-- tenants.timezone has defaulted to 'America/New_York' since 00001 and has had
-- no write path anywhere in the product. Every workspace on this database is
-- still sitting on that default because nobody was ever asked -- verified
-- before writing this: four tenants, four 'America/New_York'.
--
-- It is not a cosmetic field. metrics_day (00009) reads it to decide what
-- "today" means, the settings pane reads it to decide which closures are still
-- upcoming, and the composed prompt states the hours in it. A salon two time
-- zones away is quoted the wrong opening hours by its own receptionist, has its
-- day roll over at the wrong hour in Reports, and has no way to find out why.
--
-- The floor is RLS and the door is a column grant, the same shape 00037 used
-- for the conversation verbs: an owner may update their own tenant row, and the
-- only column they may touch is this one. Name, slug and status stay concierge
-- operations -- a slug is a URL and a status is a billing state, and neither is
-- a settings toggle.

create or replace function public.is_workspace_owner(p_tenant uuid)
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
       and m.role = 'owner'
  );
$$;

comment on function public.is_workspace_owner(uuid) is
  'True when the caller owns this tenant. Narrower than is_acting_member (00014), which admits operators.';

drop policy if exists tenants_owner_update on public.tenants;
create policy tenants_owner_update on public.tenants
  for update to authenticated
  using (public.is_workspace_owner(id))
  with check (public.is_workspace_owner(id));

-- The column door. Without the revoke, a policy alone would let an owner
-- rename their workspace or flip its status through PostgREST; without the
-- grant, the policy would pass and the UPDATE would still write nothing --
-- and a forbidden UPDATE in this stack returns success with zero rows, so the
-- route counts them rather than trusting the absence of an error.
revoke update on public.tenants from authenticated, anon;
grant update (timezone) on public.tenants to authenticated;

comment on column public.tenants.timezone is
  'IANA zone. Decides what "today" means in metrics (00009), which closures are upcoming, and the hours the receptionist states. Owner-settable since 00084; validated as a real zone by the contracts layer, which is the only place that can ask Intl.';

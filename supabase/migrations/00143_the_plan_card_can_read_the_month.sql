-- 00143 · The plan card can read the month.
--
-- One door, and the bug it closes. The plan card says what a search would
-- skip, what the month has left and what past searches for this kind of
-- business measured (PRD v3 §8.3; `planFacts` in apps/dashboard/src/server/
-- leads.ts). Two of its three reads already had doors -- lead_list_counts
-- (00142) and lead_niche_prior (00140). The third read lead_counters as a
-- table, with the member's own client.
--
-- lead_counters has row-level security on, no member policy, and execute and
-- select revoked from authenticated (00140:363, 00140:412), because nothing
-- but the engine's own SECURITY DEFINER doors were ever meant to touch it.
-- So that read raised for every member, every time; planFacts raised with it;
-- Ask's propose_lead_search caught it and answered "that could not be
-- checked; say so and suggest the page". No owner has ever been shown a plan
-- card, and so nothing has ever been searched.
--
-- The door follows 00140's: SECURITY DEFINER with search_path pinned,
-- auth.uid() read inside rather than taken as a parameter (00021's rule),
-- the role checked with has_permission, execute revoked from public and anon
-- and granted to authenticated. It answers the two ceilings a month has and
-- nothing else -- never a row id, never another workspace, never the
-- platform's own day counter, whose tenant_id is null and which no member
-- has any business reading.
--
-- What it does NOT do: the whole of each ceiling (500 leads, $25) stays in
-- contracts (LEAD_MONTHLY_ALLOWANCE, LEAD_MONTHLY_BUDGET_USD), so the door
-- answers what has been used and reserved and the card subtracts. One
-- derivation per fact: the numbers a person reads are spelled in one place.

create or replace function public.lead_month_used(p_tenant_id uuid, p_period text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  -- Finding is the owner's alone (ROLE_PERMS.find), so what finding has left
  -- this month is the owner's to read too: the card is the only reader.
  if not public.has_permission(v_user, p_tenant_id, 'find') then
    raise exception 'Only an owner can find businesses for you.' using errcode = '42501';
  end if;
  return (
    select jsonb_object_agg(k.kind, jsonb_build_object(
             'used',     coalesce(c.used, 0),
             'reserved', coalesce(c.reserved, 0)
           ))
      from (values ('allowance'), ('budget')) as k(kind)
      left join public.lead_counters c
        on c.tenant_id = p_tenant_id and c.kind = k.kind and c.period = p_period
  );
end;
$$;

comment on function public.lead_month_used(uuid, text) is
  'What this workspace has used and reserved of the month''s two ceilings, as {allowance: {used, reserved}, budget: {used, reserved}} -- leads for the allowance, US dollars for the budget. A month nothing has spent in answers zeros rather than nothing, so the plan card never guesses at a missing row. The whole of each ceiling is contracts'' (LEAD_MONTHLY_ALLOWANCE, LEAD_MONTHLY_BUDGET_USD) and the card subtracts. The owner''s alone, like finding itself; the platform''s own day counter (tenant_id null) is never reachable through it.';

revoke execute on function public.lead_month_used(uuid, text) from public, anon;
grant execute on function public.lead_month_used(uuid, text) to authenticated, service_role;

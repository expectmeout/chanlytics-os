-- 00533 · A lead on a list says why no batch takes it (3 Nov 2026).
--
-- A lead added to a sequence's list stands there until the sequence's next batch plans it (sequence_places: queued), and
-- Leads, the lead's sheet and the person page said "In its next batch" of every one. A batch plans only the leads the
-- door's one predicate lets go (reach_out_audience over reach_out_why_not), so a lead it never could take said the same
-- for good: three plumbers whose addresses could not be checked read "In its next batch" of a sequence that would never
-- write to them (the phone walk of 3 Nov 2026).
--
--   sequence_queued_why_not   For leads on sequences' lists, each with the sequence whose list it is: why its next batch
--                             would not take it, by reach_out_why_not at the list's own setting (its first step's
--                             include_unconfirmed), or null where it would. reach_out_why_not is the service role's; this
--                             asks it for a member of the workspace alone, and for a sequence of that workspace, so a
--                             caller learns of nothing of another's. Read by the places' reads (packages/db
--                             sequencePlacesOf, sequencePlaceOf), which keep the place as it was read when it cannot.
--
-- Deploy order: either. A dashboard before it reads no why and says "In its next batch", as before. Re-runnable.

create or replace function public.sequence_queued_why_not(p_tenant_id uuid, p_lead_ids uuid[], p_sequence_ids uuid[])
returns table(lead_id uuid, sequence_id uuid, why text)
language sql stable security definer
set search_path to 'public'
as $$
  select x.lead_id, x.sequence_id, w.why
    from unnest(coalesce(p_lead_ids, '{}'::uuid[]), coalesce(p_sequence_ids, '{}'::uuid[])) as x(lead_id, sequence_id)
    join public.sequence_steps st
      on st.tenant_id = p_tenant_id and st.sequence_id = x.sequence_id and st.place = 1
    cross join lateral public.reach_out_why_not(p_tenant_id, array[x.lead_id], st.include_unconfirmed) as w(wl, why)
   where x.lead_id is not null
     and exists (select 1 from public.memberships m
                  where m.user_id = (select auth.uid()) and m.tenant_id = p_tenant_id)
$$;

comment on function public.sequence_queued_why_not(p_tenant_id uuid, p_lead_ids uuid[], p_sequence_ids uuid[]) is
  'Why each lead on a sequence''s list would not be planned by its next batch (00533): reach_out_why_not at the list''s own setting (its first step''s include_unconfirmed), or null where it would be. For a member of the workspace alone, and a sequence of it; the places'' reads ask it so a lead no batch can take says why instead of "In its next batch".';

revoke all on function public.sequence_queued_why_not(p_tenant_id uuid, p_lead_ids uuid[], p_sequence_ids uuid[]) from public, anon;
grant execute on function public.sequence_queued_why_not(p_tenant_id uuid, p_lead_ids uuid[], p_sequence_ids uuid[]) to authenticated, service_role;

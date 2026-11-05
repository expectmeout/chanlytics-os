-- 00542 · A partner's password alone learns no lead's why (4 Nov 2026).
--
-- 00533's door asked its caller for a seat in the workspace and never for the second factor, so a partner's password alone
-- read why each of a workspace's leads would not be planned. A partner's seat counts for a session only once that session
-- has shown its code (00218, 00261, 00280), and the walk of the definer doors found this one
-- (partners/second-factor-catalog.db.test.mjs). It now reads the seat as every door reads it. A member who holds no
-- partner's seat asks as before.
--
-- Deploy order: after 00533, which makes the door and would put the old body back if it ran second. Either app, before or
-- after: a page told nothing keeps the place as it was read. Re-runnable.

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
                  where m.user_id = (select auth.uid()) and m.tenant_id = p_tenant_id
                    and (m.role <> 'partner' or public.session_shows_second_factor()))
$$;

comment on function public.sequence_queued_why_not(p_tenant_id uuid, p_lead_ids uuid[], p_sequence_ids uuid[]) is
  'Why each lead on a sequence''s list would not be planned by its next batch (00533): reach_out_why_not at the list''s own setting (its first step''s include_unconfirmed), or null where it would be. For a member of the workspace alone, a partner''s seat once its session has shown the code (00542), and a sequence of it; the places'' reads ask it so a lead no batch can take says why instead of "In its next batch".';

revoke all on function public.sequence_queued_why_not(p_tenant_id uuid, p_lead_ids uuid[], p_sequence_ids uuid[]) from public, anon;
grant execute on function public.sequence_queued_why_not(p_tenant_id uuid, p_lead_ids uuid[], p_sequence_ids uuid[]) to authenticated, service_role;

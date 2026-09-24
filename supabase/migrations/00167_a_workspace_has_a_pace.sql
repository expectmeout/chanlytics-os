-- 00167 · A workspace has a pace.
--
-- docs/decisions/0008-a-proposal-is-part-of-the-deal.md, amended ("Your
-- pace"), and the Pipeline, worked (plan 2026-09-23, PR 5). How long this
-- workspace's proposals usually take to be decided, from its own yeses of the
-- last year: the whole days from each proposal to its yes, their median and
-- how many there were. The pages say "usually decided in N days" once five are
-- decided, and a proposal waits (Today, the Pipeline, the deal card) once it is
-- past that pace by a fifth, seven days until then (contracts dealPaceOf,
-- waitAfterDays).
--
-- A yes is a deal that became a client: one standing won, or one that ended
-- after it was won (its decided_at is the yes, kept through the end; an
-- engagement ended without a yes has no deal.won event and is not one).
-- Security invoker: row security decides whose deals and events a caller
-- reads, so a member counts only their own workspace's. No table changes.

create or replace function public.deal_pace(p_tenant_id uuid)
returns table (median_days integer, decided integer)
language sql
stable
security invoker
set search_path = public
as $$
  with yeses as (
    select greatest(0, floor(extract(epoch from (d.decided_at - d.proposed_at)) / 86400))::integer as days
      from public.deals d
     where d.tenant_id = p_tenant_id
       and d.decided_at is not null
       and d.decided_at >= now() - interval '365 days'
       and (
         d.stage = 'won'
         or (d.stage = 'ended' and exists (
           select 1 from public.events e
            where e.tenant_id = d.tenant_id and e.subject_type = 'deal' and e.subject_id = d.id and e.kind = 'deal.won'
         ))
       )
  )
  -- As numeric, so a median between two days rounds half up everywhere (a float's tie is the platform's to break).
  select round((percentile_cont(0.5) within group (order by y.days))::numeric)::integer as median_days,
         count(*)::integer as decided
    from yeses y;
$$;

comment on function public.deal_pace(uuid) is
  'A workspace''s pace (0008, amended): over its yeses of the last 365 days (a deal standing won, or ended after a deal.won), the median whole days from the proposal to the yes, and how many. Null median with none. Under the caller''s row security. The pages use it once five are decided (contracts dealPaceOf).';
revoke execute on function public.deal_pace(uuid) from public, anon;
grant execute on function public.deal_pace(uuid) to authenticated, service_role;

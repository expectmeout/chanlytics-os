-- 00213 · A claim takes no more than the domain's room.
--
-- reach_out_claim (00184, 00197) counts the room a domain has left today and claims that many due sends:
-- `update ... where s.id in (select ... limit v_room for update of s2 skip locked)`. The limit held only while the
-- planner ran the sub-select once. The database suite caught a claim with room for one taking three (reach-out-doors,
-- C7): a plan that evaluates the pick again finds the rows this statement already claimed skipped, and takes the next
-- due ones, so a domain could send past its day. The pick is now a materialized CTE, run once, and the update joins
-- it. Nothing else in the function changes. Forward-only; re-runnable.

create or replace function public.reach_out_claim(p_domain_id uuid, p_cap int, p_at timestamptz, p_limit int)
returns setof public.reach_out_sends
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room int;
begin
  -- No share, no limit, no moment: nothing is claimed (least() would read a null cap as none at all).
  if p_domain_id is null or p_cap is null or p_limit is null or p_at is null or p_cap <= 0 or p_limit <= 0 then
    return;
  end if;
  -- One claimer per domain at a time: the count below and the claim after it are one step (C7).
  perform pg_advisory_xact_lock(hashtext('reach_out_claim:' || p_domain_id::text));
  if not exists (select 1 from public.sending_domains where id = p_domain_id and state = 'verified') then return; end if;
  v_room := least(p_limit, p_cap - (public.sending_domain_capacity(p_domain_id, p_at)->>'used')::int);
  if v_room is null or v_room <= 0 then return; end if;
  -- Picked once, then claimed: the pick is a materialized CTE, so it runs exactly once and the claim is at most
  -- v_room rows (00213). Inside `where s.id in (...)`, a plan that evaluated the pick again after rows were claimed
  -- skipped them (FOR UPDATE ... SKIP LOCKED) and took the next due ones, past the domain's day.
  return query
  with picked as materialized (
     select s2.id from public.reach_out_sends s2
       join public.playbooks p on p.id = s2.playbook_id
       join public.playbooks r on r.id = s2.root_id
       join public.broadcasts b on b.id = s2.broadcast_id
      where s2.domain_id = p_domain_id and s2.state = 'planned' and s2.send_at <= p_at
        -- Checked before it goes (F1): the check clock reads what the send says first.
        and s2.checked_at is not null
        -- The step running, and its chain: a paused root pauses every step of it.
        and p.state = 'running' and r.state = 'running' and b.state in ('scheduled', 'sending')
      order by s2.send_at
      limit v_room
      for update of s2 skip locked)
  update public.reach_out_sends s
     set state = 'claimed', claimed_at = p_at
    from picked
   where s.id = picked.id
  returning s.*;
end $$;
revoke execute on function public.reach_out_claim(uuid, int, timestamptz, int) from public, anon, authenticated;
grant execute on function public.reach_out_claim(uuid, int, timestamptz, int) to service_role;

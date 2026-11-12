-- 00618 · "Couldn't check" is checked again (decision 0131).
--
-- An address whose mailbox check did not answer stood so for good. Nothing tried again by itself (core's check takes
-- addresses in `checking` alone), and Check again took only a lead in Needs review, so a lead the search judged a fit
-- and kept, whose address could not be checked, could never be checked again by anyone and no sequence could write to it
-- (Brooklyn's three plumbers, found 25 Oct 2026, stood on a running sequence's list for two weeks).
--
--   leads.email_rechecks   How many times the clock asked again by itself; at most twice. A press of Check again is
--                          the owner's and is not counted.
--   lead_check_again       Takes a kept lead as well as one in Needs review; never one left out.
--   lead_check_retry       The leads clock's door: each address a day after its last check, at most twice, inside the
--                          workspace's searching budget and only while its searching is on. Service role only.
--   leads_unknown_due      The addresses that did not answer, by when they were checked: what the clock reads.
--
-- A check costs $0.00089 an address (contracts LEAD_CHECK_CENTS_EACH) and counts against the day's and the month's
-- searching as a search does, so the clock can never spend past them.
--
-- Deploy order: either. The door keeps its arguments and its answer; an edge before this one does not ask the new door,
-- and one after it, on a database before it, logs a failed read and goes on. Re-runnable.

set local lock_timeout = '3s';

alter table public.leads add column if not exists email_rechecks smallint default 0 not null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'leads_email_rechecks_check') then
    alter table public.leads add constraint leads_email_rechecks_check check (email_rechecks >= 0);
  end if;
end $$;

create index if not exists leads_unknown_due on public.leads using btree (email_checked_at) where (email_state = 'unknown'::text);

create or replace function public.lead_check_again(p_tenant_id uuid, p_lead_ids uuid[])
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_ids  uuid[] := '{}';
  v_r    record;
  v_err  jsonb;
  v_held integer := 0;
begin
  if v_user is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  if p_tenant_id is null or not public.has_permission(v_user, p_tenant_id, 'find') then
    raise exception 'Only an owner can check a lead again.' using errcode = '42501';
  end if;
  -- The switch, read before anything is scheduled (§0.5): the mailbox check is money too.
  if not public.lead_searches_on(p_tenant_id) then
    return jsonb_build_object('error', 'paused');
  end if;
  -- And whether the workspace may spend at all (00364): this door is the session's, so the route's question is asked here too.
  v_err := public.lead_spend_refusal(p_tenant_id);
  if v_err is not null then
    return v_err;
  end if;
  -- One job per round the leads were found in: the re-check runs under the round, as the round's own checks
  -- did, and commits through lead_check_commit. Only an address whose last check did not answer is asked
  -- again, of a lead kept or in Needs review (00618: a kept one was refused, so it could never be checked
  -- again); a lead left out is not; a lead whose search is still running is left to that search's own checks;
  -- a lead with no address has nothing to check; and a lead of another workspace is not this owner's to ask about.
  for v_r in
    select m.round_id, array_agg(m.lead_id) as lead_ids
      from (
        select distinct on (m.lead_id) m.lead_id, m.round_id
          from unnest(p_lead_ids) as x(id)
          join public.leads l on l.id = x.id and l.tenant_id = p_tenant_id and l.erased_at is null and l.blanked_at is null
          join public.lead_search_members m on m.lead_id = l.id and m.tenant_id = p_tenant_id and m.class in ('review', 'qualified') and m.blanked_at is null
          join public.lead_rounds r on r.id = m.round_id and r.state = 'ended'
         where l.email is not null and l.email_state = 'unknown'
         order by m.lead_id, r.created_at desc
      ) m
     group by m.round_id
  loop
    -- Asked only with room in this month's and today's searching (00506): a check is money, as a search is.
    if public.lead_check_ask(p_tenant_id, v_r.round_id, v_r.lead_ids) then
      v_ids := v_ids || v_r.lead_ids;
    else
      v_held := v_held + cardinality(v_r.lead_ids);
    end if;
  end loop;
  -- Nothing asked because there was no room: the owner reads why, in the words a search is refused in.
  if cardinality(v_ids) = 0 and v_held > 0 then
    return coalesce(public.lead_spend_room(p_tenant_id, public.lead_check_estimate(v_held)),
      jsonb_build_object('error', 'day_cap', 'sentence', 'Today''s searching is used up. Try again tomorrow.'));
  end if;
  return jsonb_build_object('scheduled', cardinality(v_ids), 'skipped', cardinality(p_lead_ids) - cardinality(v_ids));
end $$;

create or replace function public.lead_check_retry(p_limit integer, p_tenant_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_r     record;
  v_asked integer := 0;
  v_held  integer := 0;
begin
  -- The workspaces that may be asked for: their searching on and their spending allowed, read once each, never
  -- once a lead. One whose switch is off is asked nothing, and no try of its leads is counted.
  for v_r in
    with open_ as (
      select t.id from public.tenants t
       where (p_tenant_id is null or t.id = p_tenant_id)
         and public.lead_searches_on(t.id)
         and public.lead_spend_refusal(t.id) is null
    ),
    due as (
      -- Each address whose last check did not answer a day ago or more, tried by the clock fewer than twice, of a lead
      -- kept or in Needs review, under the newest finished round it was found in: the longest waiting first.
      select l.id as lead_id, l.tenant_id, rr.round_id
        from public.leads l
        join open_ o on o.id = l.tenant_id
        cross join lateral (
          select m.round_id
            from public.lead_search_members m
            join public.lead_rounds r on r.id = m.round_id and r.state = 'ended'
           where m.lead_id = l.id and m.tenant_id = l.tenant_id
             and m.class in ('review', 'qualified') and m.blanked_at is null
           order by r.created_at desc
           limit 1) rr
       where l.email_state = 'unknown' and nullif(btrim(l.email), '') is not null
         and l.erased_at is null and l.blanked_at is null
         and l.email_checked_at <= now() - interval '1 day'
         and l.email_rechecks < 2
       order by l.email_checked_at, l.id
       limit greatest(coalesce(p_limit, 0), 0)
    )
    select d.tenant_id, d.round_id, array_agg(d.lead_id order by d.lead_id) as lead_ids
      from due d
     group by d.tenant_id, d.round_id
  loop
    -- Asked as Check again asks (lead_check_ask): with room in the month's and the day's searching, or not at all.
    -- A try is counted only once it is asked, so a day with no room costs none of an address's two.
    if public.lead_check_ask(v_r.tenant_id, v_r.round_id, v_r.lead_ids) then
      update public.leads set email_rechecks = email_rechecks + 1 where id = any (v_r.lead_ids);
      v_asked := v_asked + cardinality(v_r.lead_ids);
    else
      v_held := v_held + cardinality(v_r.lead_ids);
    end if;
  end loop;
  return jsonb_build_object('asked', v_asked, 'held', v_held);
end $$;

comment on function public.lead_check_retry(integer, uuid) is
  'The leads clock (00618, decision 0131). Asks the mailbox check again, by itself, for each address whose last check did not answer a day ago or more, at most twice (leads.email_rechecks), of a lead kept or in Needs review, under the newest finished round it was found in, the longest waiting first, up to p_limit, in the workspace named or every one, and only where its searching is on and it may spend; through lead_check_ask, so with room in the day''s and month''s searching or not at all. Answers {asked, held}. Service role only.';

revoke all on function public.lead_check_retry(integer, uuid) from public, anon, authenticated;
grant all on function public.lead_check_retry(integer, uuid) to service_role;

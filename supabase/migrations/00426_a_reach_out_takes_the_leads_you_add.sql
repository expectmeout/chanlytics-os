-- 00426 · A reach-out takes the leads you add.
--
-- The lead workbench (docs/superpowers/plans/2026-10-13-the-lead-workbench.md, canvas B v2, Ruben 13 Oct 2026). A
-- reach-out fed by a list (a search of via chosen or import, Part 7 J1) takes more leads one at a time; one fed by a
-- finder search keeps writing to that search's ready leads, and never gains a lead it did not find (amends Part 7 J7's
-- last sentence, and spec 4.2). One predicate says why a lead would not be written to, and the audience is built on it.
--
--   lead_search_members.later_at   Later: put off in this pass, nothing written (the pile's soft word; Skip stays the
--                                  run page's)
--   lead_operations.kind           + add, later, leave
--   reach_out_why_not              the one predicate: why a lead would not be written to, or null
--   reach_out_audience             rebuilt on reach_out_why_not
--   reach_out_add                  appends leads to a list-fed reach-out, or answers why each would not go (dry)
--   lead_member_later              Later, with its undo
--   lead_undo                      add, later and leave branches; an acting member undoes their own add, later,
--                                  leave, stage, bulk
--   lead_search_choose             a chosen lead carries its reason and its share marks
--   lead_chain_of                  the reach-out a lead goes with: the one that wrote it last, else the one whose search
--                                  holds it (Leads' rows, the pile and its counts read it)
--   leads_page                     the pile sort, and each row's later_at and chain_id (dropped and made again)
--   lead_pile_counts               the progress line's numbers
--   reach_out_lead_timeline        a lead on a list, before any send, has its chain; the chain's steps and next run;
--                                  won_at, from a won deal that names it
--   reach_out_search_lines         a list-fed chain's leads not yet written, with when each was added
--   reach_out_record               the listing's review spread and claim mark; what was asked where it was found
--   reach_out_unchecked            the record's two new fields (dropped and made again with it)
--   reach_out_plan_run             a send the run may not write (any unique rule) is left out, never the run's failure
--   reach_out_people_of            who is in a reach-out, one rule: each lead waiting, writing or done
--   reach_out_root_lines           + won_at on each line: a won deal that names the lead (a count, never an amount)
--   reach_out_chain_people         the drawer's People, from it
--   reach_out_people_counts        the ledger's People cell: each reach-out's waiting, writing and done, from it
--   reach_out_sources              New message's Write to leads: the searches and lists with no reach-out yet, and who each reaches
--   reach_out_leave_out            the drawer's Leave out: one lead off a list-fed reach-out's list before anything left
--   appointments_lead_stamp        a visit names the lead its person was found as, so its origin can be said
--   reach_out_day_due              the 6 PM line counts the visits a reach-out's leads booked today
--   reach_out_report               won: each business written to whose deal naming its lead was won (on 00424's body)
--   leads_back_today               Leads' Back today: the leads who asked to hear back by now (decision 9)
--
-- Every function is replaced whole, its body copied from schema.sql with the change; the grants and comments are made
-- again with each.

/* ------------------------------------------------------------------------------------------- 1. Later, stored -- */

alter table public.lead_search_members add column if not exists later_at timestamptz;

comment on column public.lead_search_members.later_at is
  'Later (the pile, 00426): when a member put this lead off in a pass, nothing written. Cleared by its undo, by an add, and by a decision.';

/* ----------------------------------------------------------------------------- 2. The operations an undo knows -- */

alter table public.lead_operations drop constraint if exists lead_operations_kind_check;
alter table public.lead_operations add constraint lead_operations_kind_check check (kind = any (array[
  'undo_search', 'keep', 'exclude', 'put_back', 'include', 'stop', 'stage', 'bulk', 'add', 'later', 'leave']));

/* ---------------------------------------------------------------------------------- 3. The one predicate: why not -- */

create or replace function public.reach_out_why_not(p_tenant_id uuid, p_lead_ids uuid[], p_include_unconfirmed boolean default false)
returns table(lead_id uuid, why text)
language sql
stable
security definer
set search_path = public
as $$
  select x.id,
    case
      when l.id is null or l.erased_at is not null or l.blanked_at is not null then 'gone'
      when l.stage <> 'ready' or l.closed_reason is not null then 'closed'
      -- Never a customer's: nobody in People shares the address (as theirs, or one they wrote from) or the number.
      when exists (select 1 from public.contacts c
                    where c.tenant_id = l.tenant_id and c.erased_at is null
                      and ((nullif(btrim(l.email), '') is not null and c.email = lower(btrim(l.email)))
                           or (l.phone_e164 is not null and c.phone_e164 = l.phone_e164)))
        or (nullif(btrim(l.email), '') is not null and exists (
              select 1 from public.contact_identities i
                join public.contacts c on c.id = i.contact_id and c.erased_at is null
               where i.tenant_id = l.tenant_id and i.channel = 'email' and i.external_id = lower(btrim(l.email))))
        then 'customer'
      -- Never the never-again list: the address (an opt-out, a customer, an erasure, a no, its business's domain), and
      -- the place or the number (a customer's or an erased person's).
      when (nullif(btrim(l.email), '') is not null and public.lead_address_suppressed(l.tenant_id, lower(btrim(l.email))))
        or exists (select 1 from public.lead_suppressions s where s.tenant_id = l.tenant_id and (
                     (s.kind = 'place' and l.place_id is not null
                      and s.hash = public.lead_suppression_hash(l.tenant_id, l.place_id))
                  or (s.kind = 'phone' and l.phone_e164 is not null
                      and s.hash = public.lead_suppression_hash(l.tenant_id, l.phone_e164))))
        then 'suppressed'
      -- Never twice by the workspace: a send of any reach-out, bar one in a run its owner skipped or one taken back.
      when exists (select 1 from public.reach_out_sends ro
                    where ro.tenant_id = l.tenant_id and ro.lead_id = l.id
                      and not (ro.state = 'skipped' and ro.reason in ('run_canceled', 'owner_took_back')))
        then 'written'
      -- One business written to once: the finder saw it share a number, an own-domain address or a site with another.
      when exists (select 1 from public.lead_search_members m
                    where m.tenant_id = l.tenant_id and m.lead_id = l.id and m.blanked_at is null
                      and coalesce(jsonb_array_length(m.judgment->'shares'), 0) <> 0)
        then 'shared'
      when nullif(btrim(l.email), '') is null then 'no_email'
      when l.email_state = 'ok' then null
      when l.email_state = 'checking' then 'checking'
      when l.email_state = 'catch_all' then case when coalesce(p_include_unconfirmed, false) then null else 'unconfirmed' end
      when l.email_state = 'invalid' then 'invalid'
      else 'unchecked'
    end
    from unnest(coalesce(p_lead_ids, '{}'::uuid[])) as x(id)
    left join public.leads l on l.id = x.id and l.tenant_id = p_tenant_id
$$;

revoke execute on function public.reach_out_why_not(uuid, uuid[], boolean) from public, anon, authenticated;
grant execute on function public.reach_out_why_not(uuid, uuid[], boolean) to service_role;

comment on function public.reach_out_why_not(uuid, uuid[], boolean) is
  'The one predicate (00426): for each lead, why a reach-out would not write to it, or null when it would. In this order: gone, closed (not Ready), customer (People holds its address or number), suppressed (the never-again list), written (a send of any reach-out, bar a canceled run''s or one taken back), shared (the finder saw it share with another lead), no_email, checking, unconfirmed (a catch-all address, unless the reach-out includes them), invalid, unchecked. reach_out_audience and reach_out_add both ask it. Service role only; the doors that ask it check the caller.';

/* ------------------------------------------------------------------------------ 4. The audience, built on it -- */

create or replace function public.reach_out_audience(
  p_tenant_id uuid,
  p_search_id uuid,
  p_limit int,
  p_include_unconfirmed boolean default false)
returns table(lead_id uuid, email text, business_name text, city text, region text, hours jsonb)
language sql
stable
security definer
set search_path = public
as $$
  with members as (
    select sm.lead_id, sm.fit
      from public.lead_search_members sm
      join public.lead_searches s on s.id = sm.search_id and s.tenant_id = sm.tenant_id and s.removed_at is null
     where sm.tenant_id = p_tenant_id and sm.search_id = p_search_id
       and sm.class = 'qualified' and sm.counted and sm.blanked_at is null
  )
  select l.id, lower(btrim(l.email)), l.business_name, l.city, l.region, l.hours
    from members m
    join public.reach_out_why_not(p_tenant_id, array(select lead_id from members), p_include_unconfirmed) w
      on w.lead_id = m.lead_id and w.why is null
    join public.leads l on l.id = m.lead_id and l.tenant_id = p_tenant_id
   -- The finder's fit, strongest first, then the longest found.
   order by case m.fit when 'strong' then 0 when 'look' then 1 when 'long' then 2 else 3 end, l.found_at
   limit greatest(p_limit, 0)
$$;

revoke execute on function public.reach_out_audience(uuid, uuid, integer, boolean) from public, anon, authenticated;
grant execute on function public.reach_out_audience(uuid, uuid, integer, boolean) to service_role;

comment on function public.reach_out_audience(uuid, uuid, integer, boolean) is
  'Who a reach-out''s first step may write to (Part 3, rebuilt on reach_out_why_not in 00426): the qualified, counted, unblanked members of its one search that reach_out_why_not lets go, strongest fit first, then the longest found. Service role only.';

/* ------------------------------------------------------------------------------------------- 5. The add door -- */

create or replace function public.reach_out_add(p_root_id uuid, p_lead_ids uuid[], p_dry boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user      uuid := auth.uid();
  r           public.playbooks;
  s           public.lead_searches;
  v_ids       uuid[];
  v_join      uuid[] := '{}';
  v_back      uuid[] := '{}';
  v_out       jsonb := '[]'::jsonb;
  v_counts    jsonb := '{}'::jsonb;
  v_month     text;
  v_op        uuid;
  v_waiting   integer;
begin
  if v_user is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  select * into r from public.playbooks where id = p_root_id and kind = 'reach_out' and trigger = 'lead_first';
  if not found or not public.has_permission(v_user, r.tenant_id, 'approve') then
    raise exception 'Reach-out not found.' using errcode = 'P0002';
  end if;
  select * into s from public.lead_searches where id = r.lead_search_id and tenant_id = r.tenant_id;
  if not found or s.removed_at is not null then
    return jsonb_build_object('error', 'list_gone');
  end if;
  -- A finder search never gains a lead it did not find: its reach-out already writes to every ready lead it holds.
  if s.via not in ('chosen', 'import') then
    return jsonb_build_object('error', 'fed_by_search', 'search_id', s.id);
  end if;
  select coalesce(array_agg(distinct x), '{}') into v_ids from unnest(coalesce(p_lead_ids, '{}'::uuid[])) as x;
  if cardinality(v_ids) = 0 or cardinality(v_ids) > public.lead_cap('list_rows') then
    raise exception 'leads: 1 to %', public.lead_cap('list_rows') using errcode = '22023';
  end if;
  -- One lead at a time: two adds of one lead, from two piles or two people, meet here, never both.
  if not p_dry then
    perform pg_advisory_xact_lock(hashtext('reach_out_add:' || r.tenant_id::text || ':' || x::text))
       from unnest(v_ids) as x order by x;
  end if;

  -- Why each would not go: the one predicate, then what only a list can say (already on it, never counted, with another
  -- reach-out). A lead whose address is being checked joins: it goes once the check says ok.
  with w as (
    select * from public.reach_out_why_not(r.tenant_id, v_ids, r.include_unconfirmed)
  ), facts as (
    select w.lead_id,
           case
             when w.why is not null and w.why <> 'checking' then w.why
             when exists (select 1 from public.lead_search_members m
                           where m.search_id = s.id and m.lead_id = w.lead_id and m.blanked_at is null) then 'already'
             when not exists (select 1 from public.lead_search_members m
                                join public.lead_searches q on q.id = m.search_id and q.removed_at is null
                               where m.tenant_id = r.tenant_id and m.lead_id = w.lead_id and m.counted
                                 and m.blanked_at is null) then 'not_counted'
             when o.id is not null then 'elsewhere'
             else null
           end as why,
           o.id as other_id, o.name as other_name
      from w
      -- Another reach-out whose search holds the lead: one reach-out per lead, whichever way it came in.
      left join lateral (
        select p.id, p.name from public.playbooks p
          join public.lead_search_members m on m.search_id = p.lead_search_id and m.lead_id = w.lead_id
         where p.tenant_id = r.tenant_id and p.kind = 'reach_out' and p.trigger = 'lead_first' and p.id <> r.id
           and m.blanked_at is null and m.class = 'qualified' and m.counted
         order by m.created_at desc
         limit 1) o on true
  )
  select coalesce(jsonb_agg(jsonb_build_object('lead_id', f.lead_id, 'why', f.why, 'chain_id', f.other_id,
                                               'chain_name', f.other_name)
                            order by f.lead_id) filter (where f.why is not null), '[]'::jsonb),
         coalesce(array_agg(f.lead_id) filter (where f.why is null), '{}'::uuid[])
    into v_out, v_join
    from facts f;
  select coalesce(jsonb_object_agg(k, n), '{}'::jsonb) into v_counts
    from (select x->>'why' as k, count(*) as n from jsonb_array_elements(v_out) x group by 1) c;

  if p_dry or cardinality(v_join) = 0 then
    return jsonb_build_object('dry', p_dry, 'added', 0, 'would_add', cardinality(v_join), 'left_out', v_counts,
                              'leads', v_out, 'cap', r.cap_per_run);
  end if;

  v_month := public.lead_month(r.tenant_id, now());
  -- A lead taken back from this list comes back on its own row; the others are added outside any round, counted
  -- without drawing the month again (they were found and paid for once), with the fit, the reason and the share marks
  -- of where each was found, so the check reads why it fits and one business is still written to once.
  with back as (
    update public.lead_search_members m
       set blanked_at = null, later_at = null, version = m.version + 1
     where m.search_id = s.id and m.lead_id = any (v_join) and m.blanked_at is not null
    returning m.lead_id
  )
  select coalesce(array_agg(lead_id), '{}'::uuid[]) into v_back from back;
  insert into public.lead_search_members (search_id, lead_id, round_id, tenant_id, class, fit, reason, judgment, counted,
                                          counted_month)
  select s.id, x, null, r.tenant_id, 'qualified', o.fit, coalesce(o.reason, ''), coalesce(o.judgment, '{}'::jsonb), true,
         v_month
    from unnest(v_join) as x
    left join lateral (
      select m.fit, m.reason,
             jsonb_strip_nulls(jsonb_build_object('answer', m.judgment->'answer', 'shares', m.judgment->'shares')) as judgment
        from public.lead_search_members m
        join public.lead_searches q on q.id = m.search_id and q.removed_at is null
       where m.tenant_id = r.tenant_id and m.lead_id = x and m.counted and m.blanked_at is null and m.search_id <> s.id
       order by case m.fit when 'strong' then 0 when 'look' then 1 when 'long' then 2 else 3 end, m.created_at desc
       limit 1) o on true
   where not (x = any (v_back))
  on conflict (search_id, lead_id) do nothing;
  -- Decided: a lead put off in another pass is no longer for later.
  update public.lead_search_members m set later_at = null
   where m.tenant_id = r.tenant_id and m.lead_id = any (v_join) and m.later_at is not null;

  insert into public.lead_operations (tenant_id, kind, search_id, lead_ids, before, after, version, by)
  values (r.tenant_id, 'add', s.id, v_join, jsonb_build_object('back', to_jsonb(v_back)),
          jsonb_build_object('root_id', r.id), 1, v_user)
  returning id into v_op;
  insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
  values (r.tenant_id, 'reach_out.lead_added', 'lead', 'playbook', r.id,
          jsonb_build_object('search_id', s.id, 'n', cardinality(v_join), 'by', v_user));
  select count(*) into v_waiting from public.reach_out_audience(r.tenant_id, s.id, 5000, r.include_unconfirmed);
  return jsonb_build_object('dry', false, 'added', cardinality(v_join), 'op_id', v_op, 'version', 1,
                            'left_out', v_counts, 'leads', v_out, 'waiting', v_waiting, 'cap', r.cap_per_run);
end $$;

revoke execute on function public.reach_out_add(uuid, uuid[], boolean) from public, anon;
grant execute on function public.reach_out_add(uuid, uuid[], boolean) to authenticated, service_role;

comment on function public.reach_out_add(uuid, uuid[], boolean) is
  'An acting member adds leads (1 to lead_cap(''list_rows'')) to a list-fed reach-out (00426): its search is a list (via chosen or import); a finder-fed one answers {error: fed_by_search}. Each lead that reach_out_why_not lets go (or whose address is still being checked), that is counted in a kept search, is not on the list already and is with no other reach-out joins its list outside any round, with the fit, reason and share marks of where it was found; one lead_operations row of kind add and the event reach_out.lead_added. With p_dry nothing is written. Answers {dry, added, would_add, op_id, version, left_out: {why: n}, leads: [{lead_id, why, chain_id, chain_name}], waiting, cap}.';

/* --------------------------------------------------------------------------------------------------- 6. Later -- */

create or replace function public.lead_member_later(p_search_id uuid, p_lead_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  s      public.lead_searches;
  m      public.lead_search_members;
  v_op   uuid;
begin
  if v_user is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  select * into s from public.lead_searches where id = p_search_id;
  if not found or not public.has_permission(v_user, s.tenant_id, 'approve') then
    raise exception 'Search not found.' using errcode = 'P0002';
  end if;
  if s.removed_at is not null then
    return jsonb_build_object('error', 'removed');
  end if;
  select * into m from public.lead_search_members where search_id = p_search_id and lead_id = p_lead_id for update;
  if not found or m.blanked_at is not null then
    return jsonb_build_object('error', 'not_found');
  end if;
  update public.lead_search_members set later_at = now(), version = version + 1 where id = m.id
  returning * into m;
  insert into public.lead_operations (tenant_id, kind, search_id, lead_ids, before, after, version, by)
  values (s.tenant_id, 'later', p_search_id, array[p_lead_id], jsonb_build_object('later_at', null),
          jsonb_build_object('later_at', m.later_at), m.version, v_user)
  returning id into v_op;
  insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
  values (s.tenant_id, 'lead.later', 'lead', 'lead', p_lead_id, jsonb_build_object('search_id', p_search_id, 'by', v_user));
  return jsonb_build_object('op_id', v_op, 'version', m.version);
end $$;

revoke execute on function public.lead_member_later(uuid, uuid) from public, anon;
grant execute on function public.lead_member_later(uuid, uuid) to authenticated, service_role;

comment on function public.lead_member_later(uuid, uuid) is
  'Later (the pile, 00426): an acting member puts a lead of a search off in this pass. Nothing is written to it and its stage does not move; the pile brings it back at the end. One lead_operations row of kind later and the event lead.later. Returns {op_id, version}.';

/* ------------------------------------------------------------------------------- 7. Undo: by the act's own right -- */

create or replace function public.lead_undo(p_op_id uuid, p_version integer)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user    uuid := auth.uid();
  op        public.lead_operations;
  m         public.lead_search_members;
  l         public.leads;
  v_counter public.lead_counters;
  v_restored integer := 0;
  v_kept     integer := 0;
  v_recharged integer := 0;
  v_taken    integer := 0;
  v_leaving  integer := 0;
  v_sent     integer := 0;
  v_root     uuid;
  v_lead     uuid;
  r          record;
begin
  if v_user is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  select * into op from public.lead_operations where id = p_op_id for update;
  if not found then
    raise exception 'Operation not found.' using errcode = 'P0002';
  end if;
  -- The act's own right: an add, a later, a leave, a stage or a bulk act is any acting member's to make, so its maker
  -- may take it back; keep, exclude, put back and a search's undo spend or credit the month, and stay with find (00426).
  if op.kind in ('add', 'later', 'leave', 'stage', 'bulk') then
    if not (public.is_acting_member(op.tenant_id)
            and (op."by" = v_user or public.has_permission(v_user, op.tenant_id, 'find'))) then
      raise exception 'Operation not found.' using errcode = 'P0002';
    end if;
  elsif not public.has_permission(v_user, op.tenant_id, 'find') then
    raise exception 'Operation not found.' using errcode = 'P0002';
  end if;
  if op.undone_at is not null then
    return jsonb_build_object('error', 'undone');
  end if;
  if op.version <> p_version then
    return jsonb_build_object('error', 'changed');
  end if;
  if op.kind in ('keep', 'exclude', 'put_back', 'include') then
    select * into m from public.lead_search_members where search_id = op.search_id and lead_id = op.lead_ids[1] for update;
    if not found or m.version <> op.version then
      return jsonb_build_object('error', 'changed');
    end if;
    update public.lead_search_members
       set class = op.before->>'class', excluded_by = op.before->>'excluded_by',
           counted = (op.before->>'counted')::boolean, counted_month = op.before->>'counted_month',
           kept_at = (op.before->>'kept_at')::timestamptz, kept_by = (op.before->>'kept_by')::uuid,
           version = version + 1
     where id = m.id
    returning * into m;
    -- The lead goes back to the allowance of the month it counted in, never
    -- to the budget (S11); a refund after that month credits that month.
    if (op.after->>'counted')::boolean and not (op.before->>'counted')::boolean then
      v_counter := public.lead_counter_take(op.tenant_id, 'allowance', op.after->>'counted_month');
      update public.lead_counters set used = greatest(used - 1, 0), updated_at = now() where id = v_counter.id;
    end if;
    update public.lead_operations set undone_at = now() where id = p_op_id;
    return jsonb_build_object('ok', true, 'version', m.version);
  end if;
  if op.kind = 'later' then
    select * into m from public.lead_search_members where search_id = op.search_id and lead_id = op.lead_ids[1] for update;
    if not found or m.version <> op.version then
      return jsonb_build_object('error', 'changed');
    end if;
    update public.lead_search_members set later_at = (op.before->>'later_at')::timestamptz, version = version + 1
     where id = m.id
    returning * into m;
    update public.lead_operations set undone_at = now() where id = p_op_id;
    return jsonb_build_object('ok', true, 'version', m.version);
  end if;
  if op.kind = 'leave' then
    -- Back on the list it was left off: its email, skipped as taken back, is planned again by the next run.
    select * into m from public.lead_search_members where search_id = op.search_id and lead_id = op.lead_ids[1] for update;
    if not found or m.version <> op.version or m.blanked_at is null then
      return jsonb_build_object('error', 'changed');
    end if;
    update public.lead_search_members set blanked_at = null, version = version + 1
     where id = m.id
    returning * into m;
    update public.lead_operations set undone_at = now() where id = p_op_id;
    return jsonb_build_object('ok', true, 'version', m.version);
  end if;
  if op.kind = 'add' then
    -- Taken back by what became of each lead's email: before its run planned it, off the list; planned or held in a
    -- run still live, that send skipped as taken back (the audience lets it in again) and off the list; on its way
    -- (claimed or queued) or gone, it stays, and the answer says so: Stop writing is the true correction there.
    v_root := (op.after->>'root_id')::uuid;
    foreach v_lead in array op.lead_ids loop
      if exists (select 1 from public.reach_out_sends s
                  where s.tenant_id = op.tenant_id and s.root_id = v_root and s.lead_id = v_lead
                    and s.state in ('claimed', 'queued')) then
        v_leaving := v_leaving + 1;
        continue;
      end if;
      if exists (select 1 from public.reach_out_sends s
                  where s.tenant_id = op.tenant_id and s.root_id = v_root and s.lead_id = v_lead
                    and s.state in ('sent', 'handed', 'failed')) then
        v_sent := v_sent + 1;
        continue;
      end if;
      update public.reach_out_sends s
         set state = 'skipped', reason = 'owner_took_back'
        from public.broadcasts b
       where b.id = s.broadcast_id and b.state in ('pending_approval', 'scheduled', 'sending')
         and s.tenant_id = op.tenant_id and s.root_id = v_root and s.lead_id = v_lead and s.state in ('planned', 'held');
      if coalesce(op.before->'back', '[]'::jsonb) ? v_lead::text then
        update public.lead_search_members set blanked_at = now(), version = version + 1
         where search_id = op.search_id and lead_id = v_lead and blanked_at is null;
      else
        delete from public.lead_search_members where search_id = op.search_id and lead_id = v_lead and round_id is null;
      end if;
      v_taken := v_taken + 1;
    end loop;
    if v_taken = 0 then
      return jsonb_build_object('error', case when v_leaving > 0 then 'on_its_way' else 'sent' end,
                                'leaving', v_leaving, 'sent', v_sent);
    end if;
    update public.lead_operations set undone_at = now() where id = p_op_id;
    insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
    values (op.tenant_id, 'reach_out.lead_taken_back', 'lead', 'playbook', v_root,
            jsonb_build_object('search_id', op.search_id, 'n', v_taken, 'by', v_user));
    return jsonb_build_object('ok', true, 'taken', v_taken, 'leaving', v_leaving, 'sent', v_sent);
  end if;
  if op.kind = 'undo_search' then
    -- Two acts write this kind and one branch puts both back: a search that was
    -- removed (lead_search_remove) and a finished round the owner took back
    -- (lead_search_undo). The search comes back with the memberships the act
    -- blanked, except a lead exported or copied since: those are kept as they
    -- are and stay charged (E9).
    update public.lead_searches set removed_at = null where id = op.search_id;
    -- version is qualified on the right: since release B the LEAD has one too,
    -- and an UPDATE ... FROM leads leaves a bare `version` ambiguous (A's line
    -- read `version + 1` and stopped compiling the moment leads.version
    -- existed).
    update public.lead_search_members m2
       set blanked_at = null, version = m2.version + 1
      from public.leads l2
     where m2.search_id = op.search_id and m2.lead_id = l2.id and m2.lead_id = any (op.lead_ids)
       and l2.exported_at is null and l2.blanked_at is null and l2.erased_at is null;
    get diagnostics v_restored = row_count;
    v_kept := coalesce(array_length(op.lead_ids, 1), 0) - v_restored;
    -- And what the act gave back to the month is taken again, lead by lead, in
    -- the month each counted in (S11), and only for the memberships that came
    -- back: one left blanked is exported or was never credited, and either way
    -- it is not charged twice.
    for r in select key, value from jsonb_each_text(coalesce(op.before->'credited', '{}'::jsonb)) loop
      update public.lead_search_members
         set counted = true, counted_month = r.value
       where search_id = op.search_id and lead_id = r.key::uuid and blanked_at is null and not counted;
      if found then
        v_counter := public.lead_counter_take(op.tenant_id, 'allowance', r.value);
        update public.lead_counters set used = used + 1, updated_at = now() where id = v_counter.id;
        v_recharged := v_recharged + 1;
      end if;
    end loop;
    update public.lead_operations set undone_at = now() where id = p_op_id;
    return jsonb_build_object('ok', true, 'restored', v_restored, 'kept', v_kept, 'recharged', v_recharged);
  end if;
  if op.kind = 'stage' then
    -- A person who was made is never unmade from a toast: the route offers no
    -- Undo after a conversion, and the door refuses one if it is asked.
    if coalesce((op.after->>'converted')::boolean, false) then
      return jsonb_build_object('error', 'person');
    end if;
    select * into l from public.leads where id = op.lead_ids[1] for update;
    if not found or l.erased_at is not null or l.blanked_at is not null or l.version <> op.version then
      return jsonb_build_object('error', 'changed');
    end if;
    update public.leads
       set stage = op.before->>'stage', closed_reason = op.before->>'closed_reason',
           phone_wrong = coalesce((op.before->>'phone_wrong')::boolean, false),
           contact_id = (op.before->>'contact_id')::uuid,
           version = version + 1
     where id = l.id
    returning * into l;
    -- "Already a customer" wrote a suppression; taking the act back takes it
    -- back too. Only the one this act wrote, and only a customer's: an email
    -- opt-out and an erasure are nobody's to lift.
    if coalesce((op.after->>'suppressed')::boolean, false) and op.after->>'place_hash' is not null then
      delete from public.lead_suppressions
       where tenant_id = op.tenant_id and kind = 'place' and what = 'customer' and hash = op.after->>'place_hash';
    end if;
    update public.lead_operations set undone_at = now() where id = p_op_id;
    return jsonb_build_object('ok', true, 'version', l.version);
  end if;
  if op.kind = 'bulk' then
    for r in select key as lead_id, value as was from jsonb_each(op.before) loop
      update public.leads
         set stage = r.was->>'stage', closed_reason = r.was->>'closed_reason', version = version + 1
       where id = r.lead_id::uuid and version = (r.was->>'seen')::integer
         and erased_at is null and blanked_at is null;
      if found then v_restored := v_restored + 1; else v_kept := v_kept + 1; end if;
    end loop;
    update public.lead_operations set undone_at = now() where id = p_op_id;
    return jsonb_build_object('ok', true, 'restored', v_restored, 'kept', v_kept);
  end if;
  return jsonb_build_object('error', 'kind');
end $$;

revoke execute on function public.lead_undo(uuid, integer) from public, anon;
grant execute on function public.lead_undo(uuid, integer) to authenticated, service_role;

comment on function public.lead_undo(uuid, integer) is
  'Undoes one operation by its id and the version the client saw: {error: changed} when the operation or any touched row moved since; restores `before`. Who: an add, a later, a stage or a bulk act is undone by an acting member who made it (or one with find); keep, exclude, put back and a search''s undo need find (00426). A counted lead goes back to the allowance of the month it counted in, never the budget; a removed search, or a finished round the owner took back, comes back without the leads exported since and takes its credit again; a stage change goes back and takes its "Already a customer" suppression with it, unless it made a person, which is never unmade here; a bulk act restores every row nobody has touched and says how many it kept; a later is cleared; an add takes each lead back by what became of its email (off the list before a run planned it; a planned or held send of a live run skipped as owner_took_back and off the list; on its way or gone it stays, {error: on_its_way | sent} when none could be taken), with reach_out.lead_taken_back.';

/* ------------------------------------------------- 8. A chosen lead carries its reason and its share marks -- */

create or replace function public.lead_search_choose(p_tenant_id uuid, p_name text, p_lead_ids uuid[])
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user    uuid := auth.uid();
  v_name    text := left(btrim(coalesce(p_name, '')), 120);
  v_ids     uuid[];
  v_join    uuid[];
  v_gone    integer;
  v_nomail  integer;
  v_uncount integer;
  v_month   text;
  v_plan    jsonb;
  v_search  uuid;
  v_round   uuid;
begin
  if v_user is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  if not public.has_permission(v_user, p_tenant_id, 'approve') then
    raise exception 'Only an owner or an operator can write to leads.' using errcode = '42501';
  end if;
  select coalesce(array_agg(distinct x), '{}') into v_ids from unnest(coalesce(p_lead_ids, '{}')) as x;
  if cardinality(v_ids) = 0 or cardinality(v_ids) > public.lead_cap('list_rows') then
    raise exception 'leads: 1 to %', public.lead_cap('list_rows') using errcode = '22023';
  end if;
  if char_length(v_name) = 0 then
    raise exception 'a list is named' using errcode = '22023';
  end if;

  -- Only a lead already counted in one of the workspace's kept searches joins (J7): it was found and paid for once,
  -- so it is counted in the new search without drawing the month again. The rest are said, never written.
  select coalesce(array_agg(l.id), '{}') into v_join
    from public.leads l
   where l.tenant_id = p_tenant_id and l.id = any (v_ids) and l.erased_at is null and l.blanked_at is null
     and nullif(btrim(l.email), '') is not null
     and exists (select 1 from public.lead_search_members m
                   join public.lead_searches s on s.id = m.search_id and s.removed_at is null
                  where m.lead_id = l.id and m.counted and m.blanked_at is null);
  select count(*) filter (where l.id is null or l.erased_at is not null or l.blanked_at is not null),
         count(*) filter (where l.id is not null and l.erased_at is null and l.blanked_at is null and nullif(btrim(l.email), '') is null)
    into v_gone, v_nomail
    from unnest(v_ids) as x
    left join public.leads l on l.id = x and l.tenant_id = p_tenant_id;
  v_uncount := cardinality(v_ids) - cardinality(v_join) - v_gone - v_nomail;
  if cardinality(v_join) = 0 then
    return jsonb_build_object('error', 'nothing',
      'sentence', 'None of these can be written to yet: a reach-out writes to counted leads with an address. Keep the ones in Needs review first.',
      'left_out', jsonb_build_object('not_counted', v_uncount, 'no_email', v_nomail, 'gone', v_gone));
  end if;

  v_month := public.lead_month(p_tenant_id, now());
  v_plan  := jsonb_build_object('version', 1, 'card', 'local_businesses', 'list', 'chosen', 'name', v_name, 'asked', '',
    'terms', '[]'::jsonb, 'count', cardinality(v_join), 'contact', 'email', 'criteria', '[]'::jsonb, 'exclusions', '[]'::jsonb);
  insert into public.lead_searches (tenant_id, created_by, via, card, name, asked, plan)
  values (p_tenant_id, v_user, 'chosen', 'local_businesses', v_name, '', v_plan)
  returning id into v_search;
  -- Its round is made and ended at once (queued -> ended), so the view carries its counts and nothing is checked.
  insert into public.lead_rounds (tenant_id, search_id, seq, purpose, plan, plan_version, target, state, month, day, platform_day)
  values (p_tenant_id, v_search, 1, 'main', v_plan, 1, cardinality(v_join), 'queued', v_month,
          public.lead_day(p_tenant_id, now()), to_char(now() at time zone 'UTC', 'YYYY-MM-DD'))
  returning id into v_round;
  -- Outside the round, as a file's joined leads are: Remove the ones you haven't touched gives back nothing here. Each
  -- carries the fit, the reason and the share marks of where it was found (00426): the check reads why it fits, and a
  -- business the finder saw share with another is still written to once.
  insert into public.lead_search_members (search_id, lead_id, round_id, tenant_id, class, fit, reason, judgment, counted,
                                          counted_month)
  select v_search, x, null, p_tenant_id, 'qualified', o.fit, coalesce(o.reason, ''), coalesce(o.judgment, '{}'::jsonb),
         true, v_month
    from unnest(v_join) as x
    left join lateral (
      select m.fit, m.reason,
             jsonb_strip_nulls(jsonb_build_object('answer', m.judgment->'answer', 'shares', m.judgment->'shares')) as judgment
        from public.lead_search_members m
       where m.lead_id = x and m.counted and m.blanked_at is null
       order by case m.fit when 'strong' then 0 when 'look' then 1 when 'long' then 2 else 3 end, m.created_at desc
       limit 1) o on true
  on conflict (search_id, lead_id) do nothing;
  update public.lead_rounds set state = 'ended', ending = 'target_reached', ended_at = now() where id = v_round;
  insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
  values (p_tenant_id, 'lead.round', 'lead', 'lead_round', v_round,
          jsonb_build_object('search_id', v_search, 'seq', 1, 'state', 'ended', 'purpose', 'main', 'via', 'chosen',
                             'target', cardinality(v_join), 'by', v_user));
  return jsonb_build_object('search_id', v_search, 'round_id', v_round, 'counted', cardinality(v_join),
    'left_out', jsonb_build_object('not_counted', v_uncount, 'no_email', v_nomail, 'gone', v_gone));
end $$;

revoke execute on function public.lead_search_choose(uuid, text, uuid[]) from public, anon;
grant execute on function public.lead_search_choose(uuid, text, uuid[]) to authenticated, service_role;

comment on function public.lead_search_choose(uuid, text, uuid[]) is
  'An acting member''s choice of leads (1 to lead_cap(''list_rows'') ids) as a search of its own, via chosen, for a reach-out to write to (00242, J7). Only a lead of this workspace with an address and counted in one of its kept searches joins, Qualified and counted without drawing the month again, with the fit, the reason and the share marks of where it was found (00426); the rest are counted as not_counted, no_email or gone. Its round is made and ended at once (target_reached), so nothing is checked and nothing rings. Refuses {error: nothing, sentence} when none joins. Returns {search_id, round_id, counted, left_out: {not_counted, no_email, gone}}.';

/* ---------------------------------------------------------------- 9. The pile: a sort of the Leads page's read -- */

-- The reach-out a lead goes with, said once (00426): the one that wrote it last (a send its owner's run skipped whole,
-- or one taken back, aside), else the one whose search holds it. Under the caller's row security, as leads_page reads.
create or replace function public.lead_chain_of(p_tenant_id uuid, p_lead_id uuid)
returns uuid
language sql
stable
set search_path = public
as $$
  select coalesce(
    (select s.root_id from public.reach_out_sends s
      where s.tenant_id = p_tenant_id and s.lead_id = p_lead_id
        and not (s.state = 'skipped' and s.reason in ('run_canceled', 'owner_took_back'))
      order by s.created_at desc
      limit 1),
    (select p.id from public.playbooks p
       join public.lead_search_members x on x.search_id = p.lead_search_id and x.lead_id = p_lead_id
      where p.tenant_id = p_tenant_id and p.kind = 'reach_out' and p.trigger = 'lead_first'
        and x.blanked_at is null and x.class = 'qualified' and x.counted
      order by x.created_at desc
      limit 1))
$$;

revoke execute on function public.lead_chain_of(uuid, uuid) from public, anon;
grant execute on function public.lead_chain_of(uuid, uuid) to authenticated, service_role;

comment on function public.lead_chain_of(uuid, uuid) is
  'The reach-out a lead goes with (00426): the one that wrote it last (a canceled run''s send and one taken back aside), else the one whose search holds it; null for a lead in none. leads_page''s chain_id and its pile, and lead_pile_counts, read it. Under the caller''s row security.';

drop function if exists public.leads_page(uuid, uuid, text, text, text, integer, text, text, uuid);

create or replace function public.leads_page(p_tenant_id uuid, p_search_id uuid default null, p_class text default 'qualified',
  p_sort text default 'found', p_after_key text default null, p_limit integer default 200, p_list text default 'all',
  p_dir text default 'asc', p_after_id uuid default null, p_list_id uuid default null)
returns table(member_id uuid, lead_id uuid, place_id text, search_id uuid, round_id uuid, class text, excluded_by text,
  fit text, reason text, distance_m integer, counted boolean, counted_month text, judgment jsonb, shares jsonb,
  business_name text, category text, street text, city text, region text, postal_code text, lat double precision,
  lng double precision, website_host text, instagram_url text, phone_e164 text, phone_sources smallint,
  phone_wrong boolean, email text, email_alternates jsonb, email_state text, email_checked_at timestamp with time zone,
  rating numeric, reviews integer, stage text, closed_reason text, last_outcome text, last_note text, contact_id uuid,
  contacted_at timestamp with time zone, converted_at timestamp with time zone, exported_at timestamp with time zone,
  found_at timestamp with time zone, places integer, version integer, page_key text, sort_key text, about text,
  hours jsonb, image_url text, price text, reviews_dist jsonb, facebook_url text, linkedin_url text, tiktok_url text,
  claimed boolean, maps_url text, rank integer, neighborhood text, mark_path text, later_at timestamp with time zone,
  chain_id uuid)
language sql
stable
set search_path = public
as $$
  with args as (
    select coalesce(p_dir, 'asc') = 'desc' as descending,
           case when p_after_id is not null then p_after_key else split_part(coalesce(p_after_key, ''), '|', 1) end as after_k,
           coalesce(p_after_id::text, nullif(split_part(coalesce(p_after_key, ''), '|', 2), '')) as after_id
  ),
  base as (
    select m.id as member_id, m.lead_id, l.place_id, m.search_id, m.round_id, m.class, m.excluded_by, m.fit, m.reason, m.distance_m,
           m.counted, m.counted_month, m.judgment, coalesce(m.judgment->'shares', '[]'::jsonb) as shares,
           l.business_name, l.category, l.street, l.city, l.region, l.postal_code, l.lat, l.lng, l.website_host, l.instagram_url,
           l.phone_e164, l.phone_sources, l.phone_wrong, l.email, l.email_alternates, l.email_state, l.email_checked_at, l.rating, l.reviews,
           l.stage, l.closed_reason, l.last_outcome, l.last_note, l.contact_id, l.contacted_at, l.converted_at, l.exported_at, l.found_at,
           (select count(*)::integer from public.lead_places p where p.lead_id = l.id) as places, l.version,
           l.about, l.hours, l.image_url, l.price, l.reviews_dist, l.facebook_url, l.linkedin_url, l.tiktok_url, l.claimed, l.maps_url, l.rank, l.neighborhood, l.mark_path,
           m.later_at,
           -- The reach-out the lead goes with (lead_chain_of, the one rule).
           public.lead_chain_of(l.tenant_id, l.id) as chain_id,
           case coalesce(p_sort, 'found')
             when 'fit' then (case m.fit when 'strong' then '0' when 'look' then '1' when 'long' then '2' else '3' end)
                             || lpad((9999999999 - floor(extract(epoch from l.found_at)))::bigint::text, 10, '0')
             when 'distance' then lpad(coalesce(m.distance_m, 999999999)::text, 9, '0')
                             || lpad((9999999999 - floor(extract(epoch from l.found_at)))::bigint::text, 10, '0')
             -- The three column sorts B adds. A key is text and never holds
             -- the "|" the packed key splits on.
             when 'business' then left(replace(lower(coalesce(nullif(l.business_name, ''), 'zzzz')), '|', ' '), 60)
                             || lpad((9999999999 - floor(extract(epoch from l.found_at)))::bigint::text, 10, '0')
             when 'rating' then lpad(coalesce((l.rating * 10)::integer, 0)::text, 3, '0')
                             || lpad((9999999999 - floor(extract(epoch from l.found_at)))::bigint::text, 10, '0')
             when 'stage' then (case l.stage when 'ready' then '0' when 'nurture' then '1' when 'converted' then '2' else '3' end)
                             || lpad((9999999999 - floor(extract(epoch from l.found_at)))::bigint::text, 10, '0')
             -- The pile (00426): undecided first, then put off for later (the oldest first), then the decided: on the list
             -- it adds to, or with a reach-out already (lead_chain_of: one lead, one reach-out), or no longer Ready; within
             -- each, the strongest fit, then a checked address before a number alone, then the newest.
             when 'pile' then
               (case when l.stage <> 'ready'
                       or (p_list_id is not null and exists (select 1 from public.lead_search_members x
                                                             where x.search_id = p_list_id and x.lead_id = l.id and x.blanked_at is null))
                       or public.lead_chain_of(l.tenant_id, l.id) is not null
                       then '2' || lpad('0', 10, '0')
                     when m.later_at is not null then '1' || lpad(floor(extract(epoch from m.later_at))::bigint::text, 10, '0')
                     else '0' || lpad('0', 10, '0') end)
               || (case m.fit when 'strong' then '0' when 'look' then '1' when 'long' then '2' else '3' end)
               || (case when l.email_state = 'ok' then '0' when l.phone_e164 is not null then '1' else '2' end)
               || lpad((9999999999 - floor(extract(epoch from l.found_at)))::bigint::text, 10, '0')
             else lpad((9999999999 - floor(extract(epoch from l.found_at)))::bigint::text, 10, '0')
           end as k
      from public.lead_search_members m
      join public.leads l on l.id = m.lead_id
     where m.tenant_id = p_tenant_id
       and (p_search_id is null or m.search_id = p_search_id)
       and m.class = coalesce(p_class, 'qualified')
       and public.lead_member_shown(m.class, m.counted)
       and public.lead_in_list(l.stage, l.closed_reason, coalesce(p_list, 'all'))
       and m.blanked_at is null and l.blanked_at is null and l.erased_at is null
  )
  select b.member_id, b.lead_id, b.place_id, b.search_id, b.round_id, b.class, b.excluded_by, b.fit, b.reason, b.distance_m,
         b.counted, b.counted_month, b.judgment, b.shares,
         b.business_name, b.category, b.street, b.city, b.region, b.postal_code, b.lat, b.lng, b.website_host, b.instagram_url,
         b.phone_e164, b.phone_sources, b.phone_wrong, b.email, b.email_alternates, b.email_state, b.email_checked_at, b.rating, b.reviews,
         b.stage, b.closed_reason, b.last_outcome, b.last_note, b.contact_id, b.contacted_at, b.converted_at, b.exported_at, b.found_at,
         b.places, b.version,
         b.k as page_key,
         b.k || '|' || b.member_id::text as sort_key,
         b.about, b.hours, b.image_url, b.price, b.reviews_dist, b.facebook_url, b.linkedin_url, b.tiktok_url, b.claimed, b.maps_url, b.rank, b.neighborhood, b.mark_path,
         b.later_at, b.chain_id
    from base b, args a
   where p_after_key is null
      or (a.descending and (b.k, b.member_id::text) < (a.after_k, a.after_id))
      or (not a.descending and (b.k, b.member_id::text) > (a.after_k, a.after_id))
   -- One query, two directions: the pair that is not this call's is a constant
   -- null for every row and sorts nothing.
   order by (case when a.descending then b.k end) desc, (case when a.descending then b.member_id::text end) desc,
            (case when not a.descending then b.k end) asc, (case when not a.descending then b.member_id::text end) asc
   limit least(greatest(coalesce(p_limit, 200), 1), 500)
$$;

revoke execute on function public.leads_page(uuid, uuid, text, text, text, integer, text, text, uuid, uuid) from public, anon;
grant execute on function public.leads_page(uuid, uuid, text, text, text, integer, text, text, uuid, uuid) to authenticated, service_role;

comment on function public.leads_page(uuid, uuid, text, text, text, integer, text, text, uuid, uuid) is
  'A page of members of one class (qualified: the counted ones; review; excluded) joined to their leads, narrowed to one of the rail''s lists (lead_in_list), keyset-paged on the sort key in either direction, under the caller''s row security. Seven sorts: found, fit, distance, business, rating, stage, and pile (00426: undecided first, then put off for later, oldest first, then the decided: on the list p_list_id, with a reach-out already, or no longer Ready; within each, the strongest fit, a checked address before a number alone, the newest). Each row says when it was put off (later_at) and the reach-out it goes with (chain_id, lead_chain_of). Hand the last row''s page_key and member_id back as p_after_key and p_after_id; A''s packed sort_key still works on its own, split here. Which memberships show is lead_member_shown (00212).';

/* ---------------------------------------------------------------------------- 10. The progress line's numbers -- */

create or replace function public.lead_pile_counts(p_tenant_id uuid, p_search_id uuid, p_class text default 'qualified',
  p_list_id uuid default null)
returns jsonb
language sql
stable
set search_path = public
as $$
  with m as (
    select sm.lead_id, sm.later_at, l.stage,
           (p_list_id is not null and exists (select 1 from public.lead_search_members x
                                               where x.search_id = p_list_id and x.lead_id = sm.lead_id and x.blanked_at is null)) as added,
           public.lead_chain_of(sm.tenant_id, sm.lead_id) is not null as chained
      from public.lead_search_members sm
      join public.leads l on l.id = sm.lead_id
     where sm.tenant_id = p_tenant_id and sm.search_id = p_search_id and sm.class = coalesce(p_class, 'qualified')
       and public.lead_member_shown(sm.class, sm.counted)
       and sm.blanked_at is null and l.blanked_at is null and l.erased_at is null
  )
  select jsonb_build_object(
    'total', count(*),
    'added', count(*) filter (where added),
    'elsewhere', count(*) filter (where not added and chained and stage = 'ready'),
    'closed', count(*) filter (where not added and stage <> 'ready'),
    'later', count(*) filter (where not added and not chained and stage = 'ready' and later_at is not null),
    'left', count(*) filter (where not added and not chained and stage = 'ready' and later_at is null))
  from m
$$;

revoke execute on function public.lead_pile_counts(uuid, uuid, text, uuid) from public, anon;
grant execute on function public.lead_pile_counts(uuid, uuid, text, uuid) to authenticated, service_role;

comment on function public.lead_pile_counts(uuid, uuid, text, uuid) is
  'The pile''s progress line (00426), under the caller''s row security: of a search''s shown members of one class, how many are on the list p_list_id (added), with another reach-out already (elsewhere), no longer Ready (closed: worked or set aside), put off for later, and left. Decided is added + elsewhere + closed: the pile sort''s last bucket.';

/* ------------------------------------------------- 11. One reach-out's lines, said once: Leads and Campaigns read them -- */

create or replace function public.reach_out_root_lines(p_tenant_id uuid, p_root_id uuid)
returns table(lead_id uuid, line jsonb, ord timestamptz, done boolean)
language sql
stable
security definer
set search_path = public
as $$
  with sends as (
    -- left_at: when an email left (sent, or failed by a receipt after it left: email_left), else null.
    select s.id, s.lead_id, s.state, s.reason, s.send_at,
           case when s.state = 'sent' then s.sent_at
                when s.state = 'failed' and public.email_left(m.status, m.error)
                  then public.email_sent_at(m.meta, m.status_updated_at, m.created_at) end as left_at,
           coalesce(m.status = 'failed' and m.error->>'provider' = 'bounced', false) as bounced,
           b.state in ('pending_approval', 'scheduled', 'sending') as live
      from public.reach_out_sends s
      join public.broadcasts b on b.id = s.broadcast_id
      left join public.messages m on m.id = s.message_id
     where s.tenant_id = p_tenant_id and s.root_id = p_root_id
       -- A send of a run its owner skipped, or one taken back, never happened as far as the lead's line is concerned.
       and not (s.state = 'skipped' and s.reason in ('run_canceled', 'owner_took_back'))
  ),
  per as (
    select x.lead_id,
           count(*) filter (where x.left_at is not null) as sent,
           min(x.left_at) as first_sent_at,
           max(x.left_at) as last_sent_at,
           min(x.send_at) filter (where x.state = 'planned' and x.live) as next_at,
           bool_or(x.state = 'held' and x.live) as held,
           bool_or(x.state = 'handed') as handed,
           bool_or(x.bounced and x.left_at is not null) as bounced,
           max(x.left_at) filter (where x.bounced) as bounced_at,
           max(x.left_at) as ord
      from sends x
     group by x.lead_id
  ),
  per_lead as (
    select p.lead_id, p.sent, p.first_sent_at, p.last_sent_at, p.next_at, p.held, p.handed, p.bounced, p.bounced_at,
           p.ord, null::timestamptz as added_at
      from per p
    union all
    -- A list-fed reach-out's leads not written yet: on its list, with when each was added (00426).
    select m.lead_id, 0, null, null, null, false, false, false, null, null, m.created_at
      from public.playbooks r
      join public.lead_searches q on q.id = r.lead_search_id and q.via in ('chosen', 'import') and q.removed_at is null
      join public.lead_search_members m on m.search_id = q.id and m.blanked_at is null and m.class = 'qualified' and m.counted
     where r.id = p_root_id and r.tenant_id = p_tenant_id
       and not exists (select 1 from per p where p.lead_id = m.lead_id)
  ),
  facts as (
    select x.*, l.business_name, l.stage, l.closed_reason, l.email_state, l.resume_at, l.booked_at, l.reach_out_stopped_at,
           -- Won: a deal that names the lead, won (decided); the first such, a count and never an amount.
           (select min(coalesce(d.decided_at, d.updated_at)) from public.deals d
             where d.tenant_id = p_tenant_id and d.lead_id = x.lead_id and d.stage = 'won') as won_at,
           (select jsonb_build_object('intent', r.intent, 'claim', r.claim, 'read_at', r.read_at, 'undone', r.undone_at is not null)
              from public.reach_out_replies r
             where r.tenant_id = p_tenant_id and r.lead_id = x.lead_id
             order by r.read_at desc
             limit 1) as reply,
           (select max(r.until_at) from public.reach_out_replies r
             where r.tenant_id = p_tenant_id and r.lead_id = x.lead_id and r.intent = 'away'
               and r.claim = 'auto_reply' and r.until_at > now() and r.undone_at is null) as away_until
      from per_lead x
      join public.leads l on l.id = x.lead_id and l.tenant_id = p_tenant_id and l.erased_at is null and l.blanked_at is null
  )
  select f.lead_id,
         jsonb_build_object(
           'lead_id', f.lead_id,
           'business_name', f.business_name,
           'stage', f.stage,
           'closed_reason', f.closed_reason,
           'sent', f.sent,
           'first_sent_at', f.first_sent_at,
           'last_sent_at', f.last_sent_at,
           'next_at', f.next_at,
           'held', coalesce(f.held, false),
           'handed', coalesce(f.handed, false),
           'bounced', coalesce(f.bounced, false),
           'bounced_at', f.bounced_at,
           'email_state', f.email_state,
           'reply', f.reply,
           'away_until', f.away_until,
           'resume_at', f.resume_at,
           'booked_at', f.booked_at,
           'won_at', f.won_at,
           'stopped_at', f.reach_out_stopped_at,
           'added_at', f.added_at),
         coalesce(f.ord, f.added_at),
         -- Done: booked, stopped, bounced, said no, closed, or a person answered (an automatic reply only pauses). Each
         -- test is said so it is never null: a lead with no closed reason and no reply is not done, never unknown.
         (f.booked_at is not null or f.reach_out_stopped_at is not null or coalesce(f.bounced, false)
          or f.closed_reason is not distinct from 'said_no' or f.stage not in ('ready', 'nurture')
          or (f.reply is not null and not coalesce((f.reply->>'undone')::boolean, false)
              and f.reply->>'claim' is distinct from 'auto_reply'))
    from facts f
$$;

revoke execute on function public.reach_out_root_lines(uuid, uuid) from public, anon, authenticated;
grant execute on function public.reach_out_root_lines(uuid, uuid) to service_role;

comment on function public.reach_out_root_lines(uuid, uuid) is
  'One reach-out''s lines, one per lead (00426): every lead it has a send for (a canceled run''s and a taken-back send aside) and, for a list-fed one, each lead on its list not written yet with added_at. The line''s facts are 00241''s plus business_name and added_at; ord is when it last left (else when it was added); done is booked, stopped, bounced, said no, no longer Ready or Contacted, or a person answered. reach_out_search_lines and reach_out_chain_people read it. Service role only.';

/* ------------------------------------------------------------- 12. Leads while it writes: the lines, from the one read -- */

create or replace function public.reach_out_search_lines(p_tenant_id uuid, p_search_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_root     public.playbooks%rowtype;
  v_via      text;
  v_tz       text;
  v_midnight timestamptz;
begin
  if auth.uid() is null or not exists (
       select 1 from public.memberships m where m.tenant_id = p_tenant_id and m.user_id = auth.uid()
          and (m.role <> 'partner' or public.session_shows_second_factor())) then
    raise exception 'Workspace not found.' using errcode = 'P0002';
  end if;
  select * into v_root from public.playbooks p
   where p.tenant_id = p_tenant_id and p.kind = 'reach_out' and p.trigger = 'lead_first'
     and p.lead_search_id = p_search_id
   order by p.created_at desc
   limit 1;
  if not found then
    return null;
  end if;
  select q.via into v_via from public.lead_searches q where q.id = p_search_id;
  select coalesce(nullif(t.timezone, ''), 'America/New_York') into v_tz from public.tenants t where t.id = p_tenant_id;
  v_tz := coalesce(v_tz, 'America/New_York');
  v_midnight := date_trunc('day', now() at time zone v_tz) at time zone v_tz;
  return (
    with sends as (
      select s.id, s.lead_id, s.state, s.send_at, s.checked_at, s.mailbox_id,
             case when s.state = 'sent' then s.sent_at
                  when s.state = 'failed' and public.email_left(m.status, m.error)
                    then public.email_sent_at(m.meta, m.status_updated_at, m.created_at) end as left_at,
             b.state in ('pending_approval', 'scheduled', 'sending') as live
        from public.reach_out_sends s
        join public.broadcasts b on b.id = s.broadcast_id
        left join public.messages m on m.id = s.message_id
       where s.tenant_id = p_tenant_id and s.root_id = v_root.id
    ),
    rl as (
      select * from public.reach_out_root_lines(p_tenant_id, v_root.id)
    )
    select jsonb_build_object(
      'chain', jsonb_build_object('root_id', v_root.id, 'name', v_root.name, 'state', v_root.state),
      'fed_by', case when v_via in ('chosen', 'import') then 'list' else 'search' end,
      'written_to', (select count(*) from rl where (rl.line->>'sent')::int > 0),
      'today', (select count(*) from sends where left_at >= v_midnight),
      'next', (select jsonb_build_object('at', x.send_at, 'business', l.business_name, 'host', b.host, 'from', b.address)
                 from sends x
                 join public.leads l on l.id = x.lead_id
                 left join public.mailbox_connections b on b.id = x.mailbox_id
                where x.state = 'planned' and x.live and x.checked_at is not null
                order by x.send_at
                limit 1),
      'held', (select count(*) from sends where state = 'held' and live),
      'waiting_run_id', (select b.id from public.broadcasts b
                          where b.tenant_id = p_tenant_id and b.audience->>'kind' = 'reach_out'
                            and b.audience->>'root_id' = v_root.id::text and b.state = 'pending_approval'
                          order by b.created_at desc
                          limit 1),
      'leads', coalesce((
        select jsonb_agg(x.line order by x.ord desc nulls first, x.lead_id)
          from (select * from rl order by rl.ord desc nulls first, rl.lead_id limit 2000) x), '[]'::jsonb)
    )
  );
end $$;

revoke execute on function public.reach_out_search_lines(uuid, uuid) from public, anon;
grant execute on function public.reach_out_search_lines(uuid, uuid) to authenticated, service_role;

comment on function public.reach_out_search_lines(uuid, uuid) is
  'Leads while it writes (Reach out Part 6, H8), for a member: an open search''s chain, or null when it has none. chain {root_id, name, state}, fed_by (list or search, 00426), written_to, today (emails that left since the workspace''s midnight), next {at, business, host} (the earliest planned and checked email of a live run), held, waiting_run_id, and leads: at most 2,000 lines from reach_out_root_lines, one per lead the chain has a send for and, for a list-fed one, each lead on its list not written yet.';

/* ---------------------------------------------- 13. A lead's story: on a list before any send, and its chain's steps -- */

create or replace function public.reach_out_lead_timeline(p_tenant_id uuid, p_lead_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_lead  public.leads%rowtype;
  v_root  uuid;
  v_sent  boolean := false;
  v_added timestamptz;
  v_via   text;
begin
  -- A partner's seat counts for the calling session only once it showed its second factor (0013, 00261).
  if auth.uid() is null or not exists (
       select 1 from public.memberships m where m.tenant_id = p_tenant_id and m.user_id = auth.uid()
          and (m.role <> 'partner' or public.session_shows_second_factor())) then
    raise exception 'Workspace not found.' using errcode = 'P0002';
  end if;
  select * into v_lead from public.leads l
   where l.id = p_lead_id and l.tenant_id = p_tenant_id and l.erased_at is null and l.blanked_at is null;
  if not found then
    return null;
  end if;
  select s.root_id into v_root from public.reach_out_sends s
   where s.tenant_id = p_tenant_id and s.lead_id = p_lead_id
     and not (s.state = 'skipped' and s.reason in ('run_canceled', 'owner_took_back'))
   order by s.created_at desc
   limit 1;
  v_sent := v_root is not null;
  -- Not written yet: the reach-out whose search holds it (a list it was added to, or the search that found it), 00426.
  if v_root is null then
    select p.id, m.created_at into v_root, v_added
      from public.playbooks p
      join public.lead_search_members m on m.search_id = p.lead_search_id and m.lead_id = v_lead.id
     where p.tenant_id = p_tenant_id and p.kind = 'reach_out' and p.trigger = 'lead_first'
       and m.blanked_at is null and m.class = 'qualified' and m.counted
     order by m.created_at desc
     limit 1;
  end if;
  select q.via into v_via from public.playbooks p join public.lead_searches q on q.id = p.lead_search_id
   where p.id = v_root;
  return jsonb_build_object(
    'lead_id', v_lead.id,
    'business_name', v_lead.business_name,
    'stage', v_lead.stage,
    'closed_reason', v_lead.closed_reason,
    'found_at', v_lead.found_at,
    'email_state', v_lead.email_state,
    'resume_at', v_lead.resume_at,
    'booked_at', v_lead.booked_at,
    'won_at', (select min(coalesce(d.decided_at, d.updated_at)) from public.deals d
                where d.tenant_id = p_tenant_id and d.lead_id = v_lead.id and d.stage = 'won'),
    'stopped_at', v_lead.reach_out_stopped_at,
    -- Found on a listing (the finder's), or brought on a list of the owner's own with no place (00242).
    'found_on_listing', v_lead.place_id is not null,
    -- When it was put on its reach-out's list, while nothing has been written to it (00426).
    'added_at', case when not v_sent and v_via in ('chosen', 'import') then v_added end,
    'chain', (select jsonb_build_object(
                'root_id', p.id, 'name', p.name, 'state', p.state,
                'fed_by', case when v_via in ('chosen', 'import') then 'list' else 'search' end,
                'run_hour', p.run_hour, 'last_run_for', p.last_run_for,
                'waiting_run_id', (select b.id from public.broadcasts b
                                    where b.tenant_id = p_tenant_id and b.audience->>'kind' = 'reach_out'
                                      and b.audience->>'root_id' = p.id::text and b.state = 'pending_approval'
                                    order by b.created_at desc limit 1),
                'steps', (with recursive c as (
                            select x.id, x.after_days, x.hand, 0 as n from public.playbooks x where x.id = p.id
                            union all
                            select x.id, x.after_days, x.hand, c.n + 1
                              from public.playbooks x join c on x.after_playbook_id = c.id
                          )
                          select coalesce(jsonb_agg(jsonb_build_object('n', c.n, 'after_days', c.after_days,
                                                                       'hand', c.hand->>'kind') order by c.n), '[]'::jsonb)
                            from c))
                from public.playbooks p where p.id = v_root and p.tenant_id = p_tenant_id),
    -- The chain's search when there is one, else the newest search that found the lead.
    'search', coalesce(
      (select jsonb_build_object('id', q.id, 'name', q.name, 'asked', q.asked, 'fit', sm.fit)
         from public.playbooks p
         join public.lead_searches q on q.id = p.lead_search_id and q.tenant_id = p_tenant_id
         left join public.lead_search_members sm on sm.search_id = q.id and sm.lead_id = v_lead.id
        where p.id = v_root),
      (select jsonb_build_object('id', q.id, 'name', q.name, 'asked', q.asked, 'fit', sm.fit)
         from public.lead_search_members sm
         join public.lead_searches q on q.id = sm.search_id and q.removed_at is null
        where sm.tenant_id = p_tenant_id and sm.lead_id = v_lead.id and sm.blanked_at is null
        order by sm.created_at desc
        limit 1)),
    -- The person's email thread: where the reach-out's emails, and the answers to them, are.
    'conversation_id', (select m.conversation_id from public.reach_out_sends s join public.messages m on m.id = s.message_id
                         where s.tenant_id = p_tenant_id and s.lead_id = v_lead.id and s.state = 'sent'
                         order by s.sent_at desc
                         limit 1),
    'sends', coalesce((
      with recursive c as (
        select p.id, 0 as n from public.playbooks p where p.id = v_root
        union all
        select p.id, c.n + 1 from public.playbooks p join c on p.after_playbook_id = c.id
      )
      select jsonb_agg(jsonb_build_object(
               'id', s.id,
               'n', c.n,
               'hand', p.hand->>'kind',
               'state', s.state,
               'reason', s.reason,
               'send_at', s.send_at,
               'sent_at', coalesce(s.sent_at, case when s.state = 'failed' and public.email_left(m.status, m.error)
                                                  then public.email_sent_at(m.meta, m.status_updated_at, m.created_at) end),
               'left', s.state = 'sent' or (s.state = 'failed' and coalesce(public.email_left(m.status, m.error), false)),
               'angle', s.angle,
               'host', b.host,
               'from', b.address,
               'message_id', s.message_id,
               'email_status', m.status,
               'bounced', coalesce(m.status = 'failed' and m.error->>'provider' = 'bounced', false))
             order by coalesce(s.sent_at, s.send_at, s.created_at), s.id)
        from (select * from public.reach_out_sends x
               where x.tenant_id = p_tenant_id and x.lead_id = v_lead.id and x.root_id = v_root
               order by x.created_at desc
               limit 20) s
        left join c on c.id = s.playbook_id
        left join public.playbooks p on p.id = s.playbook_id
        left join public.mailbox_connections b on b.id = s.mailbox_id
        left join public.messages m on m.id = s.message_id), '[]'::jsonb),
    'readings', coalesce((
      select jsonb_agg(jsonb_build_object(
               'message_id', r.message_id,
               'read_at', r.read_at,
               'intent', r.intent,
               'claim', r.claim,
               'summary', r.summary,
               'undone', r.undone_at is not null,
               'until_at', r.until_at,
               -- What the reading did, as its door recorded it (contracts readingPlan): the page says it, never re-derives it.
               'stops', coalesce((r.plan->>'stops')::boolean, false),
               'convert', coalesce((r.plan->>'convert')::boolean, false),
               'said_no', coalesce((r.plan->>'saidNo')::boolean, false),
               'can_undo', public.reach_out_reply_undoable(r.message_id) is null)
             order by r.read_at desc)
        from (select * from public.reach_out_replies x
               where x.tenant_id = p_tenant_id and x.lead_id = v_lead.id
               order by x.read_at desc
               limit 10) r), '[]'::jsonb),
    -- Stop writing to them asks of a lead something was written to (reach_out_lead_stop refuses the others).
    'can_stop', v_sent and v_lead.reach_out_stopped_at is null
  );
end $$;

revoke execute on function public.reach_out_lead_timeline(uuid, uuid) from public, anon;
grant execute on function public.reach_out_lead_timeline(uuid, uuid) to authenticated, service_role;

comment on function public.reach_out_lead_timeline(uuid, uuid) is
  'One lead''s reach-out (Reach out Part 6, H9, H11), for a member: the lead''s stage, dates and search, whether it was found on a listing, its chain (with fed_by, its steps, run_hour, last_run_for and a waiting run: what the standing line needs, 00426), added_at while it waits on a list, its person''s email thread, its sends (at most 20), its readings (at most 10) and can_stop. A lead nothing was written to yet has the reach-out whose search holds it (00426). Null for a lead the workspace does not hold.';

/* ------------------------------------------- 14. The record: the listing's signals, and what was asked where it was found -- */

drop function if exists public.reach_out_unchecked(integer, integer, integer, uuid);
drop function if exists public.reach_out_record(uuid, uuid, uuid);

create function public.reach_out_record(p_tenant_id uuid, p_search_id uuid, p_lead_id uuid)
returns table(business_name text, category text, city text, region text, rating numeric, reviews integer,
  website_host text, hours jsonb, about text, email text, why_it_fits text, what_you_asked text, site_listings integer,
  name_listings integer, email_domain_shared boolean, reviews_dist jsonb, claimed boolean)
language sql
stable
security definer
set search_path = public
as $$
  select l.business_name, l.category, l.city, l.region, l.rating, l.reviews, l.website_host, l.hours, l.about,
         lower(btrim(l.email)),
         -- Why it fits: the chain's search's member, else where the lead was found (a list made before 00426 kept none).
         coalesce(nullif(sm.reason, ''),
                  (select o.reason from public.lead_search_members o
                    where o.tenant_id = l.tenant_id and o.lead_id = l.id and o.counted and o.blanked_at is null
                      and o.reason <> ''
                    order by case o.fit when 'strong' then 0 when 'look' then 1 when 'long' then 2 else 3 end, o.created_at desc
                    limit 1)),
         -- What was asked: the chain's search's own words, else the search that found the lead (a list asks nothing).
         coalesce(nullif(q.asked, ''),
                  (select o.asked from public.lead_search_members m
                     join public.lead_searches o on o.id = m.search_id and o.removed_at is null
                    where m.tenant_id = l.tenant_id and m.lead_id = l.id and m.counted and m.blanked_at is null
                      and o.asked <> ''
                    order by m.created_at desc
                    limit 1)),
         (select count(*)::int from public.leads o
           where o.tenant_id = l.tenant_id and o.erased_at is null and o.blanked_at is null
             and public.lead_site_key(o.website_host) = public.lead_site_key(l.website_host)),
         (select count(*)::int from public.leads o
           where o.tenant_id = l.tenant_id and o.erased_at is null and o.blanked_at is null
             and public.lead_name_key(o.business_name) = public.lead_name_key(l.business_name)),
         -- The lead's own person (made by its first send, 00184 reach_out_person) is not another: its address is the
         -- lead's, and a chain's later step writes to it.
         split_part(lower(btrim(coalesce(l.email, ''))), '@', 2) <> '' and exists (
           select 1 from public.contacts c
            where c.tenant_id = l.tenant_id and c.email is not null and c.erased_at is null
              and c.id is distinct from l.contact_id and c.email <> lower(btrim(l.email))
              and split_part(c.email, '@', 2) = split_part(lower(btrim(l.email)), '@', 2)),
         -- The listing's review spread and claim mark: the signals the card leads with, so the opening can cite them.
         l.reviews_dist, l.claimed
    from public.leads l
    left join public.lead_search_members sm
      on sm.tenant_id = l.tenant_id and sm.search_id = p_search_id and sm.lead_id = l.id
    left join public.lead_searches q on q.id = p_search_id and q.tenant_id = l.tenant_id
   where l.tenant_id = p_tenant_id and l.id = p_lead_id
$$;

revoke execute on function public.reach_out_record(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.reach_out_record(uuid, uuid, uuid) to service_role;

comment on function public.reach_out_record(uuid, uuid, uuid) is
  'One business''s record as the check reads it (00197; 00426): its listing''s fields, why it fits (the chain''s search''s member, else where it was found), what was asked (the chain''s search, else the search that found it), how many leads share its site or name, whether another person in People shares its address''s domain, and its review spread and claim mark (the signals). Service role only.';

create function public.reach_out_unchecked(p_limit integer, p_per_workspace integer, p_ahead_minutes integer, p_tenant_id uuid default null)
returns table(send jsonb, check_gen integer, template_id uuid, template_language text, signed_by text, included_for text[],
  business_name text, category text, city text, region text, rating numeric, reviews integer, website_host text,
  hours jsonb, about text, email text, why_it_fits text, what_you_asked text, site_listings integer, name_listings integer,
  email_domain_shared boolean, reviews_dist jsonb, claimed boolean)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_ids uuid[];
begin
  if coalesce(p_limit, 0) <= 0 or coalesce(p_per_workspace, 0) <= 0 then
    return;
  end if;
  with candidates as (
    select s.id,
           row_number() over (partition by s.tenant_id
                              order by coalesce(s.check_after, s.created_at), s.send_at, s.id) as turn,
           coalesce(s.check_after, s.created_at) as waiting_since
      from public.reach_out_sends s
      join public.broadcasts b on b.id = s.broadcast_id
      join public.playbooks p on p.id = s.playbook_id
      join public.playbooks r on r.id = s.root_id
     where s.state = 'planned' and s.checked_at is null
       and b.state in ('pending_approval', 'scheduled', 'sending') and p.state = 'running' and r.state = 'running'
       and (s.check_after is null or s.check_after <= now())
       and (s.check_started_at is null or s.check_started_at < now() - interval '2 minutes')
       and (b.state = 'pending_approval'
            or s.send_at <= now() + make_interval(mins => greatest(coalesce(p_ahead_minutes, 0), 0)))
       and (p_tenant_id is null or s.tenant_id = p_tenant_id)
  ), picked as (
    select c.id from candidates c
     where c.turn <= p_per_workspace
     order by c.turn, c.waiting_since, c.id
     limit p_limit
  ), locked as (
    select s.id from public.reach_out_sends s
     where s.id in (select id from picked)
     for update of s skip locked
  ), leased as (
    update public.reach_out_sends s
       set check_started_at = now()
      from locked
     where s.id = locked.id and s.state = 'planned' and s.checked_at is null
       and (s.check_started_at is null or s.check_started_at < now() - interval '2 minutes')
    returning s.id
  )
  select coalesce(array_agg(id), '{}') into v_ids from leased;

  return query
  select to_jsonb(s), s.check_gen, p.template_id, p.template_language, r.signed_by,
         array(select distinct x
                 from public.reach_out_sends o, unnest(o.included_for) as x
                where o.tenant_id = s.tenant_id and o.root_id = s.root_id and o.lead_id = s.lead_id
                order by x),
         rec.business_name, rec.category, rec.city, rec.region, rec.rating, rec.reviews, rec.website_host,
         rec.hours, rec.about, rec.email, rec.why_it_fits, rec.what_you_asked,
         rec.site_listings, rec.name_listings, rec.email_domain_shared, rec.reviews_dist, rec.claimed
    from public.reach_out_sends s
    join public.playbooks p on p.id = s.playbook_id
    join public.playbooks r on r.id = s.root_id
    cross join lateral public.reach_out_record(s.tenant_id, r.lead_search_id, s.lead_id) rec
   where s.id = any (v_ids)
   order by s.send_at, s.id;
end $$;

revoke execute on function public.reach_out_unchecked(integer, integer, integer, uuid) from public, anon, authenticated;
grant execute on function public.reach_out_unchecked(integer, integer, integer, uuid) to service_role;

comment on function public.reach_out_unchecked(integer, integer, integer, uuid) is
  'The sends the check clock takes this tick (Reach out, Part 4), leased under their row locks, round-robin by workspace, each with its words'' step, the name its chain signs with, the holds its owner included it past and its business''s record (00197; the record''s signals, 00426). Service role only.';

/* ------------------------------------------- 15. A run's sends: one a unique rule refuses is left out, never the run -- */

create or replace function public.reach_out_plan_run(p_run jsonb, p_sends jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_run uuid := (p_run->>'id')::uuid;
  v_tenant uuid := (p_run->>'tenant_id')::uuid;
  v_step uuid := (p_run->>'playbook_id')::uuid;
  v_root uuid := (p_run->'audience'->>'root_id')::uuid;
begin
  if p_run->'audience'->>'kind' is distinct from 'reach_out' then
    raise exception 'reach_out_plan_run: a run of a reach-out says so in its audience';
  end if;
  if not exists (select 1 from public.playbooks where id = v_step and tenant_id = v_tenant and kind = 'reach_out')
     or not exists (select 1 from public.playbooks where id = v_root and tenant_id = v_tenant and kind = 'reach_out') then
    raise exception 'reach_out_plan_run: step % or root % is no reach-out of workspace %', v_step, v_root, v_tenant;
  end if;
  begin
    insert into public.broadcasts (id, tenant_id, playbook_id, run_for, name, template_id, template_name,
                                   template_language, state, scheduled_for, recipient_count, audience)
    values (v_run, v_tenant, v_step, (p_run->>'run_for')::date, p_run->>'name', (p_run->>'template_id')::uuid,
            p_run->>'template_name', p_run->>'template_language', p_run->>'state',
            (p_run->>'scheduled_for')::timestamptz, (p_run->>'recipient_count')::int, p_run->'audience');
  exception when unique_violation then
    return jsonb_build_object('exists', true);
  end;
  insert into public.reach_out_sends (id, tenant_id, broadcast_id, playbook_id, root_id, lead_id, contact_id, mailbox_id,
                                      send_at, state, reason)
  select x.id, v_tenant, v_run, v_step, v_root, x.lead_id, x.contact_id, x.mailbox_id, x.send_at,
         coalesce(x.state, 'planned'), x.reason
    from jsonb_to_recordset(coalesce(p_sends, '[]'::jsonb))
         as x(id uuid, lead_id uuid, contact_id uuid, mailbox_id uuid, send_at timestamptz, state text, reason text)
   where exists (select 1 from public.leads l where l.id = x.lead_id and l.tenant_id = v_tenant)
     and (x.mailbox_id is null
          or exists (select 1 from public.mailbox_connections b where b.id = x.mailbox_id and b.tenant_id = v_tenant))
  -- A send any unique rule refuses (a replay's, or a lead another reach-out planned first: one first send per lead,
  -- 00427) is left out of this run, never the run's failure.
  on conflict do nothing;
  return jsonb_build_object('id', v_run);
end $$;

revoke execute on function public.reach_out_plan_run(jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.reach_out_plan_run(jsonb, jsonb) to service_role;

comment on function public.reach_out_plan_run(jsonb, jsonb) is
  'A reach-out step''s run and its sends, written whole (core runReachOut): {id}, or {exists} when the step already has its run for the day. A send any unique rule refuses (a replay''s, or a lead another reach-out planned first, 00427) is left out, never the run. Service role only.';

/* ------------------------------------------- 16. Who is in a reach-out: one rule, the drawer's People, the ledger's -- */

-- Every lead a reach-out has: waiting (nothing has left for it and it is not done: on its list, in a run that waits, or
-- in its search's audience), writing (written to, not done) or done (booked, stopped, bounced, said no, closed, or a
-- person answered). The drawer's lists and the ledger's counts are both read from here, so the two never disagree.
create or replace function public.reach_out_people_of(p_tenant_id uuid, p_root_id uuid)
returns table(lead_id uuid, grp text, line jsonb, ord timestamp with time zone, pos bigint)
language sql
stable
security definer
set search_path = public
as $$
  with root as (
    select r.lead_search_id, r.include_unconfirmed from public.playbooks r
     where r.id = p_root_id and r.tenant_id = p_tenant_id and r.kind = 'reach_out' and r.trigger = 'lead_first'
  ),
  rl as (
    select * from public.reach_out_root_lines(p_tenant_id, p_root_id)
  ),
  aud as (
    select a.lead_id, a.business_name, row_number() over () as pos
      from root
     cross join lateral public.reach_out_audience(p_tenant_id, root.lead_search_id, 5000, root.include_unconfirmed) a
  )
  select r.lead_id,
         case when r.done then 'done' when (r.line->>'sent')::int > 0 then 'writing' else 'waiting' end,
         r.line, r.ord, coalesce((select a.pos from aud a where a.lead_id = r.lead_id), 0)
    from rl r
  union all
  select a.lead_id, 'waiting',
         jsonb_build_object('lead_id', a.lead_id, 'business_name', a.business_name, 'sent', 0, 'added_at', null),
         null::timestamptz, a.pos
    from aud a
   where not exists (select 1 from rl r where r.lead_id = a.lead_id)
$$;

revoke execute on function public.reach_out_people_of(uuid, uuid) from public, anon, authenticated;
grant execute on function public.reach_out_people_of(uuid, uuid) to service_role;

comment on function public.reach_out_people_of(uuid, uuid) is
  'Who is in a reach-out (00426), one rule: each lead with its group (waiting: nothing left for it and not done, on its list, in a run that waits or in its search''s audience; writing: written to, not done; done: booked, stopped, bounced, said no, closed, or a person answered), its line of reach_out_root_lines, when it last moved and its place in the audience. reach_out_chain_people and reach_out_people_counts read it. Service role only.';

create or replace function public.reach_out_chain_people(p_tenant_id uuid, p_root_id uuid, p_limit integer default 50)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_root public.playbooks%rowtype;
  v_q    public.lead_searches%rowtype;
  v_lim  integer := least(greatest(coalesce(p_limit, 50), 1), 200);
begin
  if auth.uid() is null or not exists (
       select 1 from public.memberships m where m.tenant_id = p_tenant_id and m.user_id = auth.uid()
          and (m.role <> 'partner' or public.session_shows_second_factor())) then
    raise exception 'Workspace not found.' using errcode = 'P0002';
  end if;
  select * into v_root from public.playbooks
   where id = p_root_id and tenant_id = p_tenant_id and kind = 'reach_out' and trigger = 'lead_first';
  if not found then
    return null;
  end if;
  select * into v_q from public.lead_searches where id = v_root.lead_search_id and tenant_id = p_tenant_id;
  return (
    with p as (
      select * from public.reach_out_people_of(p_tenant_id, p_root_id)
    )
    select jsonb_build_object(
      'root_id', v_root.id,
      'fed_by', case when v_q.via in ('chosen', 'import') then 'list' else 'search' end,
      'search', case when v_q.id is not null then jsonb_build_object('id', v_q.id, 'name', v_q.name) end,
      'counts', jsonb_build_object(
        'waiting', (select count(*) from p where p.grp = 'waiting'),
        'writing', (select count(*) from p where p.grp = 'writing'),
        'done', (select count(*) from p where p.grp = 'done'),
        'of', (select count(*) from public.lead_search_members m
                where m.tenant_id = p_tenant_id and m.search_id = v_root.lead_search_id
                  and m.class = 'qualified' and m.counted and m.blanked_at is null)),
      -- What came of it (canvas B's loop): of everyone it has, how many it wrote to, who wrote back (a person, an
      -- automatic reply aside, not undone), who booked and whose deal was won. Each lead once.
      'came', jsonb_build_object(
        'written', (select count(*) from p where (p.line->>'sent')::int > 0),
        'wrote_back', (select count(*) from p
                        where p.line->'reply' is not null and jsonb_typeof(p.line->'reply') = 'object'
                          and not coalesce((p.line->'reply'->>'undone')::boolean, false)
                          and p.line->'reply'->>'claim' is distinct from 'auto_reply'),
        'booked', (select count(*) from p where p.line->>'booked_at' is not null),
        'won', (select count(*) from p where p.line->>'won_at' is not null)),
      'waiting', coalesce((select jsonb_agg(x.line order by x.ord desc nulls last, x.pos)
                             from (select * from p where p.grp = 'waiting'
                                    order by p.ord desc nulls last, p.pos limit v_lim) x), '[]'::jsonb),
      'writing', coalesce((select jsonb_agg(x.line order by x.ord desc nulls last)
                             from (select * from p where p.grp = 'writing'
                                    order by p.ord desc nulls last limit v_lim) x), '[]'::jsonb),
      'done', coalesce((select jsonb_agg(x.line order by x.ord desc nulls last)
                          from (select * from p where p.grp = 'done'
                                 order by p.ord desc nulls last limit v_lim) x), '[]'::jsonb)
    )
  );
end $$;

revoke execute on function public.reach_out_chain_people(uuid, uuid, integer) from public, anon;
grant execute on function public.reach_out_chain_people(uuid, uuid, integer) to authenticated, service_role;

comment on function public.reach_out_chain_people(uuid, uuid, integer) is
  'Who is in a reach-out (00426), for a member: the leads waiting, writing and done (reach_out_people_of, the one rule), each a line of reach_out_root_lines, at most p_limit (1 to 200) of each, with their counts and how many are on its search. fed_by says whether more can be added (a list) or its search keeps it current. Null for a reach-out the workspace does not hold.';

create or replace function public.reach_out_people_counts(p_tenant_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not exists (
       select 1 from public.memberships m where m.tenant_id = p_tenant_id and m.user_id = auth.uid()
          and (m.role <> 'partner' or public.session_shows_second_factor())) then
    raise exception 'Workspace not found.' using errcode = 'P0002';
  end if;
  return coalesce((
    select jsonb_object_agg(r.id, c.counts)
      from public.playbooks r
     cross join lateral (
       select jsonb_build_object(
                'waiting', count(*) filter (where p.grp = 'waiting'),
                'writing', count(*) filter (where p.grp = 'writing'),
                'done', count(*) filter (where p.grp = 'done')) as counts
         from public.reach_out_people_of(p_tenant_id, r.id) p) c
     where r.tenant_id = p_tenant_id and r.kind = 'reach_out' and r.trigger = 'lead_first'), '{}'::jsonb);
end $$;

revoke execute on function public.reach_out_people_counts(uuid) from public, anon;
grant execute on function public.reach_out_people_counts(uuid) to authenticated, service_role;

comment on function public.reach_out_people_counts(uuid) is
  'Who is in each reach-out now (00426), for a member: by root, how many leads are waiting, writing and done (reach_out_people_of, the one rule the drawer reads too). Campaigns'' ledger says it in its People cell, apart from the last 30 days.';

/* ------------------------------------------------- 17. What a reach-out could start from: New message's Write to leads -- */

create or replace function public.reach_out_sources(p_tenant_id uuid, p_limit integer default 12)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_lim integer := least(greatest(coalesce(p_limit, 12), 1), 50);
begin
  if auth.uid() is null or not exists (
       select 1 from public.memberships m where m.tenant_id = p_tenant_id and m.user_id = auth.uid()
          and (m.role <> 'partner' or public.session_shows_second_factor())) then
    raise exception 'Workspace not found.' using errcode = 'P0002';
  end if;
  return coalesce((
    select jsonb_agg(x.src order by x.created_at desc)
      from (
        select s.created_at,
               jsonb_build_object(
                 'id', s.id,
                 'name', s.name,
                 'via', s.via,
                 'asked_on', s.created_at,
                 'ready', (select count(*) from public.reach_out_audience(p_tenant_id, s.id, 5000, false)),
                 'with_unconfirmed', (select count(*) from public.reach_out_audience(p_tenant_id, s.id, 5000, true))) as src
          from public.lead_searches s
         where s.tenant_id = p_tenant_id and s.removed_at is null
           and not exists (select 1 from public.playbooks p
                            where p.tenant_id = p_tenant_id and p.lead_search_id = s.id and p.kind = 'reach_out')
         order by s.created_at desc
         limit v_lim) x
     where (x.src->>'with_unconfirmed')::int > 0), '[]'::jsonb);
end $$;

revoke execute on function public.reach_out_sources(uuid, integer) from public, anon;
grant execute on function public.reach_out_sources(uuid, integer) to authenticated, service_role;

comment on function public.reach_out_sources(uuid, integer) is
  'What a reach-out could start from (00426), for a member: the newest p_limit (1 to 50) searches and lists with no reach-out yet that have someone it would write to, each with its name, how it was made (via), when, and how many it would write to (ready, and with the unconfirmed). Campaigns'' New message, Write to leads, lists them.';

/* ------------------------------------- 18. Leave out: one lead off a list-fed reach-out's list, before anything left -- */

create or replace function public.reach_out_leave_out(p_root_id uuid, p_lead_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user    uuid := auth.uid();
  r         public.playbooks;
  q         public.lead_searches;
  m         public.lead_search_members;
  v_skipped integer;
  v_op      uuid;
begin
  if v_user is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  select * into r from public.playbooks where id = p_root_id and kind = 'reach_out' and trigger = 'lead_first';
  if not found or not public.has_permission(v_user, r.tenant_id, 'approve') then
    raise exception 'Reach-out not found.' using errcode = 'P0002';
  end if;
  select * into q from public.lead_searches where id = r.lead_search_id and tenant_id = r.tenant_id;
  if not found or q.removed_at is not null then
    return jsonb_build_object('error', 'list_gone');
  end if;
  -- A search's reach-out writes to what its search holds: a lead is left out of it on Leads, never here.
  if q.via not in ('chosen', 'import') then
    return jsonb_build_object('error', 'fed_by_search', 'search_id', q.id);
  end if;
  -- The add's own lock: an add and a leave of one lead meet here, never both at once.
  perform pg_advisory_xact_lock(hashtext('reach_out_add:' || r.tenant_id::text || ':' || p_lead_id::text));
  select * into m from public.lead_search_members
   where search_id = q.id and lead_id = p_lead_id and blanked_at is null
     for update;
  if not found then
    return jsonb_build_object('error', 'not_on_it');
  end if;
  -- What left, or is leaving, stays: Stop writing is the true correction there.
  if exists (select 1 from public.reach_out_sends s
              where s.tenant_id = r.tenant_id and s.root_id = r.id and s.lead_id = p_lead_id
                and s.state in ('claimed', 'queued')) then
    return jsonb_build_object('error', 'on_its_way');
  end if;
  if exists (select 1 from public.reach_out_sends s
              where s.tenant_id = r.tenant_id and s.root_id = r.id and s.lead_id = p_lead_id
                and s.state in ('sent', 'handed', 'failed')) then
    return jsonb_build_object('error', 'sent');
  end if;
  -- Planned or held in a run still live: skipped as taken back, which its undo's next run plans again.
  update public.reach_out_sends s
     set state = 'skipped', reason = 'owner_took_back'
    from public.broadcasts b
   where b.id = s.broadcast_id and b.state in ('pending_approval', 'scheduled', 'sending')
     and s.tenant_id = r.tenant_id and s.root_id = r.id and s.lead_id = p_lead_id and s.state in ('planned', 'held');
  get diagnostics v_skipped = row_count;
  update public.lead_search_members set blanked_at = now(), version = version + 1
   where id = m.id
  returning * into m;
  insert into public.lead_operations (tenant_id, kind, search_id, lead_ids, before, after, version, by)
  values (r.tenant_id, 'leave', q.id, array[p_lead_id], jsonb_build_object('skipped', v_skipped),
          jsonb_build_object('root_id', r.id), m.version, v_user)
  returning id into v_op;
  insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
  values (r.tenant_id, 'reach_out.lead_taken_back', 'lead', 'playbook', r.id,
          jsonb_build_object('search_id', q.id, 'n', 1, 'by', v_user, 'left_out', true));
  return jsonb_build_object('ok', true, 'op_id', v_op, 'version', m.version, 'skipped', v_skipped);
end $$;

revoke execute on function public.reach_out_leave_out(uuid, uuid) from public, anon;
grant execute on function public.reach_out_leave_out(uuid, uuid) to authenticated, service_role;

comment on function public.reach_out_leave_out(uuid, uuid) is
  'Leave out (00426), the drawer''s door on a lead waiting in a reach-out fed by a list: off its list (blanked), a send planned or held for it in a live run skipped as taken back, with an operation of kind leave whose undo (lead_undo, its maker''s or find''s) puts it back; one on its way or sent stays (on_its_way, sent: Stop writing is the correction there). An operator''s, as the add is.';

/* ------------------------------------------------------------- 19. What came of it: booked and won, said everywhere -- */

-- A visit names the lead its person was found as: the booking's origin, which the 6 PM line counts and the visit can
-- say ("from your reach-out, after email 2"). Filled once, where the visit names a person and no lead; a lead the
-- person was made from (leads.contact_id), the newest converted first.
create or replace function public.appointments_lead_stamp()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if NEW.lead_id is null and NEW.contact_id is not null then
    NEW.lead_id := (select l.id from public.leads l
                     where l.tenant_id = NEW.tenant_id and l.contact_id = NEW.contact_id
                       and l.erased_at is null and l.blanked_at is null
                     order by l.converted_at desc nulls last, l.id
                     limit 1);
  end if;
  return NEW;
end $$;

revoke execute on function public.appointments_lead_stamp() from public, anon, authenticated;

comment on function public.appointments_lead_stamp() is
  'A visit names the lead its person was made from (00426): appointments.lead_id, filled before a visit is written or its person changes, where it names a person and no lead; the newest converted lead first. The 6 PM line counts a reach-out''s bookings by it.';

drop trigger if exists appointments_lead_stamp on public.appointments;
create trigger appointments_lead_stamp
  before insert or update of contact_id on public.appointments
  for each row execute function public.appointments_lead_stamp();

-- The visits written before: each one naming a person a lead was made from names that lead.
update public.appointments a
   set lead_id = (select l.id from public.leads l
                   where l.tenant_id = a.tenant_id and l.contact_id = a.contact_id
                     and l.erased_at is null and l.blanked_at is null
                   order by l.converted_at desc nulls last, l.id
                   limit 1)
 where a.lead_id is null and a.contact_id is not null
   and exists (select 1 from public.leads l
                where l.tenant_id = a.tenant_id and l.contact_id = a.contact_id
                  and l.erased_at is null and l.blanked_at is null);

-- The 6 PM line (00241, H12) gains booked: the visits made today whose lead a reach-out wrote to before the visit's
-- start, as reach_out_booked reads a booking.
create or replace function public.reach_out_day_due(p_now timestamp with time zone, p_limit integer)
returns table(tenant_id uuid, day date, numbers jsonb)
language sql
stable
security definer
set search_path = public
as $$
  with here as (
    select t.id, z.tz, (p_now at time zone z.tz)::date as day,
           date_trunc('day', p_now at time zone z.tz) at time zone z.tz as since
      from public.tenants t
     cross join lateral (select coalesce(nullif(t.timezone, ''), 'America/New_York') as tz) z
     where extract(hour from p_now at time zone z.tz) >= 18
       and exists (select 1 from public.playbooks p
                    where p.tenant_id = t.id and p.kind = 'reach_out' and p.trigger = 'lead_first')
  ), counted as (
    select h.id, h.day, jsonb_build_object(
      'written', (select count(*) from public.reach_out_sends s left join public.messages m on m.id = s.message_id
                   where s.tenant_id = h.id
                     and (s.state = 'sent' or (s.state = 'failed' and public.email_left(m.status, m.error)))
                     and coalesce(s.sent_at, public.email_sent_at(m.meta, m.status_updated_at, m.created_at))
                         between h.since and p_now),
      'wrote_back', (select count(*) from public.reach_out_replies r
                      where r.tenant_id = h.id and r.read_at >= h.since and r.read_at <= p_now
                        and r.claim <> 'auto_reply'),
      'interested', (select count(*) from public.reach_out_replies r
                      where r.tenant_id = h.id and r.read_at >= h.since and r.read_at <= p_now
                        and r.claim <> 'auto_reply' and r.undone_at is null
                        and r.intent in ('interested', 'question')),
      'said_no', (select count(*) from public.reach_out_replies r
                   where r.tenant_id = h.id and r.read_at >= h.since and r.read_at <= p_now
                     and r.undone_at is null and r.intent = 'no'),
      'booked', (select count(*) from public.appointments a
                  where a.tenant_id = h.id and a.created_at >= h.since and a.created_at <= p_now
                    and a.lead_id is not null and a.status <> 'cancelled'
                    and exists (select 1 from public.reach_out_sends s
                                 where s.tenant_id = h.id and s.lead_id = a.lead_id and s.state = 'sent'
                                   and s.sent_at < a.starts_at)),
      'bounced', (select count(*) from public.reach_out_sends s join public.messages m on m.id = s.message_id
                   where s.tenant_id = h.id and s.state in ('sent', 'failed')
                     and m.status = 'failed' and m.error->>'provider' = 'bounced'
                     and coalesce(s.sent_at, public.email_sent_at(m.meta, m.status_updated_at, m.created_at))
                         between h.since and p_now),
      'held', (select count(*) from public.reach_out_sends s join public.broadcasts b on b.id = s.broadcast_id
                where s.tenant_id = h.id and s.state = 'held'
                  and b.state in ('pending_approval', 'scheduled', 'sending'))) as numbers
      from here h
     where not exists (select 1 from public.notifications n
                        where n.tenant_id = h.id and n.created_at >= h.since - interval '1 day'
                          and n.kind = 'reach_out_day' and n.subject_type = 'reach_out_day'
                          and n.subject_id = h.day::text)
  )
  select c.id, c.day, c.numbers
    from counted c
   where (c.numbers->>'written')::int + (c.numbers->>'wrote_back')::int + (c.numbers->>'said_no')::int
         + (c.numbers->>'held')::int + (c.numbers->>'booked')::int > 0
   order by c.id
   limit greatest(coalesce(p_limit, 0), 0)
$$;

revoke execute on function public.reach_out_day_due(timestamp with time zone, integer) from public, anon, authenticated;
grant execute on function public.reach_out_day_due(timestamp with time zone, integer) to service_role;

comment on function public.reach_out_day_due(timestamp with time zone, integer) is
  'The 6 PM line (Reach out Part 6, H12): each workspace with a reach-out, past 6 PM in its zone and not told today, with today''s numbers: written, wrote back, interested, said no, bounced, held, and booked (00426: the visits made today whose lead a reach-out wrote to before the visit''s start). A day with none of written, wrote back, said no, held or booked is not told. Service role only.';

CREATE OR REPLACE FUNCTION public.reach_out_report(p_tenant_id uuid, p_days integer, p_end date DEFAULT NULL::date) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_tz    text;
  v_today date;
  v_end   date;
  v_since timestamptz;
  v_stop  timestamptz;
  v_prior timestamptz;
begin
  if auth.uid() is null or not exists (
       select 1 from public.memberships m where m.tenant_id = p_tenant_id and m.user_id = auth.uid()
          and (m.role <> 'partner' or public.session_shows_second_factor())) then
    raise exception 'Workspace not found.' using errcode = 'P0002';
  end if;
  -- Any count of days Reports reads, as its other functions take them (00360): a month so far and a window a member
  -- picked are neither 7, 30 nor 90, and this refused both.
  if p_days is null or p_days < 1 or p_days > 90 then
    raise exception 'A period is 1 to 90 days.' using errcode = '22023';
  end if;
  select coalesce(nullif(t.timezone, ''), 'America/New_York') into v_tz from public.tenants t where t.id = p_tenant_id;
  v_tz := coalesce(v_tz, 'America/New_York');
  v_today := (now() at time zone v_tz)::date;
  -- The window's last day and where it stops, as report_series reads them (00360).
  v_end   := least(coalesce(p_end, v_today), v_today);
  v_since := (v_end - (p_days - 1))::timestamp at time zone v_tz;
  v_stop  := ((v_end + 1)::timestamp) at time zone v_tz;
  -- Where the period before begins (00404): the same count of days, ending where the window begins.
  v_prior := (v_end - (p_days * 2 - 1))::timestamp at time zone v_tz;
  return (
    -- An email that left (00179's one spelling, email_left): sent, or failed by a receipt after it left, which is how
    -- the clock settles a send whose email bounced before it was read sent. Dated by when it left. Read twice now (the
    -- window's `sent` and the period before), so not materialized (00404): each read takes the rows it needs, and the
    -- tenant's whole history of emails is never held for the second.
    with left_ as not materialized (
      select s.id, s.root_id, s.playbook_id, s.lead_id, s.contact_id, s.mailbox_id,
             coalesce(s.sent_at, public.email_sent_at(m.meta, m.status_updated_at, m.created_at)) as sent_at,
             lower(nullif(btrim(s.angle), '')) as angle, m.status, m.error, m.meta
        from public.reach_out_sends s
        left join public.messages m on m.id = s.message_id
       where s.tenant_id = p_tenant_id
         and (s.state = 'sent' or (s.state = 'failed' and public.email_left(m.status, m.error)))
    ),
    sent as (
      select * from left_ x where x.sent_at >= v_since and x.sent_at < v_stop
    ),
    handed as (
      select s.root_id, s.playbook_id, count(*) as n
        from public.reach_out_sends s
       where s.tenant_id = p_tenant_id and s.state = 'handed' and s.sent_at >= v_since and s.sent_at < v_stop
       group by s.root_id, s.playbook_id
    ),
    last_sent as (
      select distinct on (x.root_id, x.lead_id) x.root_id, x.playbook_id, x.lead_id, x.contact_id, x.angle,
             l.closed_reason, l.booked_at,
             -- Won (00426): a deal that names the lead, won. A count of businesses, never an amount.
             exists (select 1 from public.deals d
                      where d.tenant_id = p_tenant_id and d.lead_id = x.lead_id and d.stage = 'won') as won
        from sent x
        join public.leads l on l.id = x.lead_id and l.tenant_id = p_tenant_id
       order by x.root_id, x.lead_id, x.sent_at desc
    ),
    wrote as (
      select w.contact_id from public.outreach_wrote_back(p_tenant_id, array(
        select distinct ls.contact_id from last_sent ls where ls.contact_id is not null)) w(contact_id)
    ),
    answers as (
      select ls.root_id, ls.playbook_id, ls.lead_id, ls.angle,
             coalesce(ls.contact_id in (select contact_id from wrote), false) as wrote_back,
             exists (select 1 from public.reach_out_replies r
                      where r.tenant_id = p_tenant_id and r.lead_id = ls.lead_id and r.undone_at is null
                        and r.claim <> 'auto_reply' and r.intent in ('interested', 'question')) as interested,
             ls.booked_at is not null as booked,
             ls.won,
             coalesce(ls.closed_reason = 'said_no', false) as said_no
        from last_sent ls
    ),
    angles as (
      select x.angle, count(*) as written,
             (select count(*) from answers a where a.angle = x.angle) as businesses,
             (select count(*) from answers a where a.angle = x.angle and a.wrote_back) as wrote_back,
             row_number() over (order by count(*) desc, x.angle) as rank
        from sent x
       where x.angle is not null
       group by x.angle
    ),
    mailboxes as (
      select x.mailbox_id, b.address, b.state, b.held_why, b.held_at, count(*) as sent,
             count(*) filter (where x.status in ('sent', 'delivered', 'read')) as delivered,
             count(*) filter (where x.status = 'failed' and x.error->>'provider' = 'bounced'
                                and lower(coalesce(x.error->>'kind', '')) = 'permanent') as bounced,
             count(*) filter (where x.meta->'email'->>'complained_at' is not null) as complained
        from sent x
        left join public.mailbox_connections b on b.id = x.mailbox_id and b.tenant_id = p_tenant_id
       group by x.mailbox_id, b.address, b.state, b.held_why, b.held_at
    )
    select jsonb_build_object(
      'timezone', v_tz,
      'days', p_days,
      'today', v_today,
      'end', v_end,
      'since', v_end - (p_days - 1),
      'has_reach_out', exists (select 1 from public.playbooks p
                               where p.tenant_id = p_tenant_id and p.kind = 'reach_out' and p.trigger = 'lead_first'),
      'totals', jsonb_build_object(
        'written', (select count(*) from sent),
        'businesses', (select count(*) from last_sent),
        'delivered', (select count(*) from sent where status in ('sent', 'delivered', 'read')),
        'bounced', (select count(*) from sent where status = 'failed' and error->>'provider' = 'bounced'),
        'wrote_back', (select count(*) from answers where wrote_back),
        'interested', (select count(*) from answers where interested),
        'booked', (select count(*) from answers where booked),
        'won', (select count(*) from answers where won),
        'said_no', (select count(*) from answers where said_no),
        'handed', coalesce((select sum(n) from handed), 0)),
      -- What the period before wrote, counted as the totals count it: emails only (00404).
      'before', (
        select jsonb_build_object(
                 'written', count(*),
                 'delivered', count(*) filter (where x.status in ('sent', 'delivered', 'read')),
                 'bounced', count(*) filter (where x.status = 'failed' and x.error->>'provider' = 'bounced'))
          from left_ x where x.sent_at >= v_prior and x.sent_at < v_since),
      'series', (
        select coalesce(jsonb_agg(jsonb_build_object('day', g.day, 'written', coalesce(c.n, 0)) order by g.day), '[]'::jsonb)
          from (select (v_end - k) as day from generate_series(0, p_days - 1) k) g
          left join (select (x.sent_at at time zone v_tz)::date as day, count(*) as n from sent x group by 1) c
            on c.day = g.day),
      'chains', coalesce((
        select jsonb_agg(ch.body order by ch.last_at desc nulls last)
          from (
            select r.id,
                   (select max(x.sent_at) from sent x where x.root_id = r.id) as last_at,
                   jsonb_build_object(
                     'root_id', r.id,
                     'name', r.name,
                     'state', r.state,
                     'search', (select jsonb_build_object('id', q.id, 'name', q.name)
                                  from public.lead_searches q where q.id = r.lead_search_id),
                     'last_at', (select max(x.sent_at) from sent x where x.root_id = r.id),
                     'runs', (select count(*) from public.broadcasts b
                               where b.tenant_id = p_tenant_id and b.audience->>'kind' = 'reach_out'
                                 and b.audience->>'root_id' = r.id::text and b.run_for >= v_end - (p_days - 1)
                                 and b.run_for <= v_end),
                     'steps', (
                       with recursive c as (
                         select p.id, 0 as n from public.playbooks p where p.id = r.id
                         union all
                         select p.id, c.n + 1 from public.playbooks p join c on p.after_playbook_id = c.id
                       )
                       select coalesce(jsonb_agg(jsonb_build_object(
                         'id', c.id,
                         'n', c.n,
                         'hand', p.hand->>'kind',
                         'written', (select count(*) from sent x where x.playbook_id = c.id),
                         'delivered', (select count(*) from sent x where x.playbook_id = c.id
                                         and x.status in ('sent', 'delivered', 'read')),
                         'bounced', (select count(*) from sent x where x.playbook_id = c.id
                                       and x.status = 'failed' and x.error->>'provider' = 'bounced'),
                         'businesses', (select count(*) from answers a where a.playbook_id = c.id),
                         'wrote_back', (select count(*) from answers a where a.playbook_id = c.id and a.wrote_back),
                         'interested', (select count(*) from answers a where a.playbook_id = c.id and a.interested),
                         'booked', (select count(*) from answers a where a.playbook_id = c.id and a.booked),
                         'won', (select count(*) from answers a where a.playbook_id = c.id and a.won),
                         'said_no', (select count(*) from answers a where a.playbook_id = c.id and a.said_no),
                         'handed', coalesce((select h.n from handed h where h.playbook_id = c.id), 0))
                         order by c.n), '[]'::jsonb)
                         from c join public.playbooks p on p.id = c.id)) as body
              from public.playbooks r
             where r.tenant_id = p_tenant_id and r.kind = 'reach_out' and r.trigger = 'lead_first'
               and (exists (select 1 from sent x where x.root_id = r.id)
                    or exists (select 1 from handed h where h.root_id = r.id))
             order by 2 desc nulls last
             limit 20
          ) ch), '[]'::jsonb),
      'angles', coalesce((
        select jsonb_agg(jsonb_build_object('angle', a.angle, 'written', a.written, 'businesses', a.businesses,
                                            'wrote_back', a.wrote_back)
                         order by a.rank)
          from angles a where a.rank <= 8), '[]'::jsonb),
      'other_angles', jsonb_build_object(
        'written', coalesce((select sum(a.written) from angles a where a.rank > 8), 0),
        'businesses', coalesce((select sum(a.businesses) from angles a where a.rank > 8), 0),
        'wrote_back', coalesce((select sum(a.wrote_back) from angles a where a.rank > 8), 0)),
      'no_angle', (select count(*) from sent where angle is null),
      -- An edge or a page from before mailboxes reads `domains`: none now (decision 0056).
      'domains', '[]'::jsonb,
      'mailboxes', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'address', d.address, 'state', d.state, 'held_why', d.held_why, 'held_at', d.held_at,
                 'sent', d.sent, 'delivered', d.delivered, 'bounced', d.bounced, 'complained', d.complained)
               order by d.sent desc, d.address)
          from (select * from mailboxes order by sent desc, address limit 10) d), '[]'::jsonb))
  );
end $$;

revoke execute on function public.reach_out_report(uuid, integer, date) from public, anon;
grant execute on function public.reach_out_report(uuid, integer, date) to authenticated, service_role;

comment on function public.reach_out_report(uuid, integer, date) is
  'Reports'' Reach-outs section (Reach out Part 6, H1, H3-H6), for a member: over p_days days (1 to 90; any other is refused) to the window''s last day in the workspace''s zone, the emails that left and what came of them. has_reach_out, totals, before (written, delivered and bounced over the same count of days before the window, 00404: outcomes are state now, so they have no period before), series (written per day), chains (at most 20, each with its steps; reach_out_chain_totals counts every chain over the same window, 00375), angles (the top 8, other_angles, no_angle) and domains (at most 10; a removed domain''s host is null). Emails are written, delivered and bounced; businesses are the leads written to, each once per chain at its last email of the period, and every outcome (wrote back, interested, booked, won, said no) is a count of them, so it is never more than `businesses`, on the totals, on a step (the businesses whose last email was that step), on an angle (the ones whose last email had it) and past the top 8 (00404); wrote back is outreach_wrote_back; won (00426) is a deal naming the lead, won, a count and never an amount. `p_end` (00360) is the window''s last day, in the workspace''s zone: null is today, and a day that has not come is read as today.';

/* ------------------------------------------------------------------------- 20. Back today: the day a lead asked for -- */

-- No lead is written to twice by a reach-out (decision 9 of the workbench): a lead who asked to hear back on a day
-- ("not now") comes back on that day as one to write to by hand. Its day has come, within the week after it, and the
-- lead is still neither closed nor booked nor won.
create or replace function public.leads_back_today(p_tenant_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_tz   text;
  v_stop timestamptz;
begin
  if auth.uid() is null or not exists (
       select 1 from public.memberships m where m.tenant_id = p_tenant_id and m.user_id = auth.uid()
          and (m.role <> 'partner' or public.session_shows_second_factor())) then
    raise exception 'Workspace not found.' using errcode = 'P0002';
  end if;
  select coalesce(nullif(t.timezone, ''), 'America/New_York') into v_tz from public.tenants t where t.id = p_tenant_id;
  v_tz := coalesce(v_tz, 'America/New_York');
  -- The end of today in the business's zone: a day asked for is back from its first minute.
  v_stop := (((now() at time zone v_tz)::date + 1)::timestamp) at time zone v_tz;
  return coalesce((
    select jsonb_agg(jsonb_build_object('lead_id', l.id, 'business_name', l.business_name, 'resume_at', l.resume_at,
                                        'contact_id', l.contact_id)
                     order by l.resume_at, l.business_name)
      from (select * from public.leads l
             where l.tenant_id = p_tenant_id and l.erased_at is null and l.blanked_at is null
               and l.resume_at is not null and l.resume_at < v_stop and l.resume_at >= v_stop - interval '8 days'
               and l.stage <> 'archived' and l.booked_at is null and l.reach_out_stopped_at is null
               and not exists (select 1 from public.deals d
                                where d.tenant_id = p_tenant_id and d.lead_id = l.id and d.stage = 'won')
             order by l.resume_at, l.business_name
             limit 50) l), '[]'::jsonb);
end $$;

revoke execute on function public.leads_back_today(uuid) from public, anon;
grant execute on function public.leads_back_today(uuid) to authenticated, service_role;

comment on function public.leads_back_today(uuid) is
  'Leads'' Back today (00426, decision 9 of the lead workbench), for a member: the leads who asked to hear back on a day that has come, within the week after it (the business''s zone), still not closed, booked, stopped or won, the earliest first, at most 50, each with its business, the day it asked for and its person. Nothing writes to them by itself: the owner writes by hand.';

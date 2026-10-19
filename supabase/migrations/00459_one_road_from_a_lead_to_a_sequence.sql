-- One road from a lead to a sequence (the canvas "Lead to sequence, redesigned", rounds one to five, 18 Oct 2026).
--
-- A lead joins a sequence one way: Add, to the sequence its search picked, or to one made by name and collected as a
-- draft. Where a lead stands is worked out once (sequence_places), so the lead sheet, a sequence's Leads tab and Leads'
-- rows say the same. In order:
--   1. lead_searches.adds_to and lead_search_aim: the pick is kept on the search, not in a browser.
--   2. sequence_steps.source_search_id: a sequence holds its own list and may draw from one search (auto-add); a finder
--      search no longer is a sequence's list, so every sequence takes the leads you add.
--   3. sequence_create takes leads: one creator; a draft until Start (sequences.state 'draft', its first step paused).
--   4. sequence_move: out of one sequence and into another, for a lead nothing was sent to; a first send skipped as
--      'moved' frees the lead as one taken back does.
--   5. Skip this email, from step 2: the lead goes on to the next step instead of leaving.
--   6. sequence_places, read by sequence_people (unchanged answer), sequence_place (one lead) and sequence_places_of
--      (many leads).
--   7. sequence_overview counts who is in it from sequence_places, and says each sequence's span, its emails still to
--      write and the search it adds from.

/* ---------------------------------------------------------------------------------------------- 1. the pick -- */

alter table public.lead_searches add column if not exists adds_to uuid;
-- Its sequence is one of its own workspace's (00279): the key names the workspace with it, and a discarded sequence
-- leaves the search's pick empty, never its workspace.
alter table public.lead_searches drop constraint if exists lead_searches_adds_to_fkey;
alter table public.lead_searches add constraint lead_searches_adds_to_fkey
  foreign key (tenant_id, adds_to) references public.sequences (tenant_id, id) on delete set null (adds_to);
comment on column public.lead_searches.adds_to is
  'The sequence to leads this search''s Add goes to (00459: the lead sheet''s pick, kept on the search so a desk, a phone and a teammate agree); null until one is chosen, and again once that sequence is discarded.';

create or replace view public.lead_searches_view with (security_invoker = true) as
select s.id, s.tenant_id, s.created_by, s.via, s.card, s.name, s.asked, s.plan, s.removed_at, s.created_at,
       r.id as round_id, r.seq, r.purpose, r.state, r.ending, r.ending_pending, r.question, r.answered, r.target,
       r.plan_version, r.judge_tokens, r.cost_usd, r.waiting_since, r.ended_at,
       coalesce(c.qualified, 0) as qualified, coalesce(c.review, 0) as review, coalesce(c.excluded, 0) as excluded,
       coalesce(c.counted, 0) as counted, coalesce(c.emails_checked, 0) as emails_checked, coalesce(c.with_phone, 0) as with_phone,
       u.id as undo_op_id, u.version as undo_version,
       coalesce(r.nearby, '[]'::jsonb) as nearby,
       coalesce(c.strong, 0) as strong, coalesce(c.look, 0) as look, coalesce(c.long, 0) as long,
       s.thread_id, s.adds_to
  from public.lead_searches s
  left join lateral (
    select r.id, r.seq, r.purpose, r.state, r.ending, r.ending_pending, r.question, r.answered, r.target,
           r.plan_version, r.judge_tokens, r.cost_usd, r.waiting_since, r.ended_at, r.nearby
      from public.lead_rounds r where r.search_id = s.id order by r.seq desc limit 1
  ) r on true
  left join lateral (
    select count(*) filter (where m.class = 'qualified' and m.blanked_at is null) as qualified,
           count(*) filter (where m.class = 'review' and m.blanked_at is null)    as review,
           count(*) filter (where m.class = 'excluded')                           as excluded,
           count(*) filter (where m.counted)                                      as counted,
           count(*) filter (where m.class = 'qualified' and m.blanked_at is null and l.email_state = 'ok')  as emails_checked,
           count(*) filter (where m.class = 'qualified' and m.blanked_at is null and l.phone_e164 is not null and not l.phone_wrong) as with_phone,
           count(*) filter (where m.class = 'qualified' and m.blanked_at is null and m.fit = 'strong') as strong,
           count(*) filter (where m.class = 'qualified' and m.blanked_at is null and m.fit = 'look')   as look,
           count(*) filter (where m.class = 'qualified' and m.blanked_at is null and m.fit = 'long')   as long
      from public.lead_search_members m join public.leads l on l.id = m.lead_id where m.search_id = s.id
  ) c on true
  left join lateral (
    select o.id, o.version from public.lead_operations o
     where o.search_id = s.id and o.kind = 'undo_search' and o.undone_at is null and o.at > now() - interval '24 hours'
     order by o.at desc limit 1
  ) u on true;
comment on view public.lead_searches_view is
  'Every column of lead_searches with its latest round (round_id, seq, purpose, state, ending, ending_pending, question, answered, target, plan_version, judge_tokens, cost_usd -- what that round has spent, so cost per Qualified lead is read from here -- waiting_since and ended_at) and its counts over the members: qualified, review, excluded, counted, emails_checked (a qualified lead whose address was checked and answered) and with_phone (a qualified lead with a number nobody has marked wrong). Excluded members stay counted after their details are blanked, so "40 left out" stays 40. undo_op_id and undo_version name the operation this search''s Undo takes while its twenty-four hours run, and are null once it is undone or the day is out. nearby (00145): where to look next when the round ran dry, the nearest ZIP centres past its area, nearest first; [] otherwise. strong, look and long (00146): the qualified members by fit band, for the band bar over the table. thread_id (00172): the Ask thread the search was planned in, or null. adds_to (00459): the sequence this search''s Add goes to.';

create or replace function public.lead_search_aim(p_tenant_id uuid, p_search_id uuid, p_sequence_id uuid default null)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  if p_tenant_id is null or not public.is_acting_member(p_tenant_id) then
    raise exception 'Workspace not found.' using errcode = 'P0002';
  end if;
  if not exists (select 1 from public.lead_searches s
                  where s.id = p_search_id and s.tenant_id = p_tenant_id and s.removed_at is null) then
    raise exception 'Search not found.' using errcode = 'P0002';
  end if;
  -- A sequence to leads of this workspace that has not ended (a draft collects, a paused one waits), or none.
  if p_sequence_id is not null and not exists (
       select 1 from public.sequences q
        where q.id = p_sequence_id and q.tenant_id = p_tenant_id and q.starts = 'leads' and q.state <> 'ended') then
    raise exception 'Sequence not found.' using errcode = 'P0002';
  end if;
  update public.lead_searches set adds_to = p_sequence_id where id = p_search_id and tenant_id = p_tenant_id;
  return jsonb_build_object('search_id', p_search_id, 'adds_to', p_sequence_id);
end $$;
comment on function public.lead_search_aim(uuid, uuid, uuid) is
  'The sequence a search''s Add goes to (00459), or none: a member''s, for a search and a sequence to leads of their workspace that has not ended.';

/* ---------------------------------------------------------------------------- 2. a list, and the search it draws from -- */

alter table public.sequence_steps add column if not exists source_search_id uuid;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'sequence_steps_source_same_workspace') then
    alter table public.sequence_steps add constraint sequence_steps_source_same_workspace
      foreign key (tenant_id, source_search_id) references public.lead_searches(tenant_id, id) on delete restrict;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'sequence_steps_source_is_a_lead_first_step') then
    alter table public.sequence_steps add constraint sequence_steps_source_is_a_lead_first_step
      check (source_search_id is null or (kind = 'reach_out' and trigger = 'lead_first'));
  end if;
end $$;
-- One sequence draws from a search: two would race for every lead it finds.
create unique index if not exists sequence_steps_one_source on public.sequence_steps (source_search_id)
  where source_search_id is not null;
comment on column public.sequence_steps.source_search_id is
  'A sequence to leads'' first step only (00459): the search whose ready leads join its list without a press (auto-add). Its own list (lead_search_id) holds the leads added by hand; a lead taken out stays on that list, blanked, so it never comes back from here.';

-- An empty list named for a sequence: its round made and ended at once, as lead_search_choose makes one.
create or replace function public.reach_out_list_for(p_tenant_id uuid, p_name text, p_by uuid)
returns uuid
language plpgsql security definer
set search_path = public
as $$
declare
  v_name   text := left(coalesce(nullif(btrim(p_name), ''), 'Leads you add'), 120);
  v_plan   jsonb;
  v_search uuid;
  v_round  uuid;
begin
  v_plan := jsonb_build_object('version', 1, 'card', 'local_businesses', 'list', 'chosen', 'name', v_name, 'asked', '',
    'terms', '[]'::jsonb, 'count', 0, 'contact', 'email', 'criteria', '[]'::jsonb, 'exclusions', '[]'::jsonb);
  insert into public.lead_searches (tenant_id, created_by, via, card, name, asked, plan)
  values (p_tenant_id, p_by, 'chosen', 'local_businesses', v_name, '', v_plan)
  returning id into v_search;
  insert into public.lead_rounds (tenant_id, search_id, seq, purpose, plan, plan_version, target, state, month, day, platform_day)
  values (p_tenant_id, v_search, 1, 'main', v_plan, 1, 0, 'queued', public.lead_month(p_tenant_id, now()),
          public.lead_day(p_tenant_id, now()), to_char(now() at time zone 'UTC', 'YYYY-MM-DD'))
  returning id into v_round;
  update public.lead_rounds set state = 'ended', ending = 'target_reached', ended_at = now() where id = v_round;
  return v_search;
end $$;

-- Every sequence fed by a finder search today gets a list of its own and draws from that search: nothing changes for
-- whom it writes to, and it takes the leads you add from now on.
do $$
declare
  r record;
  v_list uuid;
begin
  for r in
    select st.id, st.tenant_id, st.name, st.lead_search_id, st.created_by
      from public.sequence_steps st
      join public.lead_searches q on q.id = st.lead_search_id
     where st.kind = 'reach_out' and st.trigger = 'lead_first' and q.via not in ('chosen', 'import')
       and st.source_search_id is null
  loop
    v_list := public.reach_out_list_for(r.tenant_id, r.name, r.created_by);
    update public.sequence_steps set lead_search_id = v_list, source_search_id = r.lead_search_id where id = r.id;
  end loop;
end $$;

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
  -- The search's leads, and (00459) where it is a sequence's list that draws from a search, that search's ready leads:
  -- each joins without a press, unless it is put off for later there or was taken out of the list (blanked on it).
  with src as (
    select r.source_search_id as id from public.sequence_steps r
     where r.tenant_id = p_tenant_id and r.kind = 'reach_out' and r.trigger = 'lead_first'
       and r.lead_search_id = p_search_id and r.source_search_id is not null
  ),
  members as (
    select distinct on (sm.lead_id) sm.lead_id, sm.fit
      from public.lead_search_members sm
      join public.lead_searches s on s.id = sm.search_id and s.tenant_id = sm.tenant_id and s.removed_at is null
     where sm.tenant_id = p_tenant_id
       and sm.class = 'qualified' and sm.counted and sm.blanked_at is null
       and (sm.search_id = p_search_id
            or (sm.search_id in (select src.id from src) and sm.later_at is null
                and not exists (select 1 from public.lead_search_members x
                                 where x.search_id = p_search_id and x.lead_id = sm.lead_id and x.blanked_at is not null)))
     order by sm.lead_id, case sm.fit when 'strong' then 0 when 'look' then 1 when 'long' then 2 else 3 end
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

-- reach_out_add, as 00451_every_sequence_function_reads_the_sequence_tables.sql wrote it, with a sequence's search counted as holding its leads (00459).
create or replace function public.reach_out_add(p_root_id uuid, p_lead_ids uuid[], p_dry boolean DEFAULT false)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $$
declare
  v_user      uuid := auth.uid();
  r           public.sequence_steps;
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
  select * into r from public.sequence_steps where id = p_root_id and kind = 'reach_out' and trigger = 'lead_first';
  if not found or not public.has_permission(v_user, r.tenant_id, 'approve') then
    raise exception 'Reach-out not found.' using errcode = 'P0002';
  end if;
  select * into s from public.lead_searches where id = r.lead_search_id and tenant_id = r.tenant_id;
  if not found or s.removed_at is not null then
    return jsonb_build_object('error', 'list_gone');
  end if;
  -- Every sequence's list is a list since 00459; one left on a finder search would gain leads it did not find.
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
             -- Drawn from its search already (00459 auto-add), and not taken out of the list.
             when r.source_search_id is not null
                  and exists (select 1 from public.lead_search_members m
                               where m.search_id = r.source_search_id and m.lead_id = w.lead_id and m.class = 'qualified'
                                 and m.counted and m.blanked_at is null and m.later_at is null)
                  and not exists (select 1 from public.lead_search_members m
                                   where m.search_id = s.id and m.lead_id = w.lead_id and m.blanked_at is not null)
               then 'already'
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
        select p.id, p.name from public.sequence_steps p
          join public.lead_search_members m
            on m.search_id in (p.lead_search_id, p.source_search_id) and m.lead_id = w.lead_id
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

-- reach_out_save, as 00451_every_sequence_function_reads_the_sequence_tables.sql wrote it; a chain made on a finder search draws from it (00459).
create or replace function public.reach_out_save(p_tenant_id uuid, p_user_id uuid, p_chain jsonb)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $$
declare
  v_root     uuid := nullif(p_chain->>'root_id', '')::uuid;
  v_search   uuid := nullif(p_chain->>'search_id', '')::uuid;
  v_name     text := btrim(coalesce(p_chain->>'name', ''));
  v_gap      int := (p_chain->>'gap_minutes')::int;
  v_signed   text := nullif(btrim(coalesce(p_chain->>'signed_by', '')), '');
  v_unconf   boolean := coalesce((p_chain->>'include_unconfirmed')::boolean, false);
  v_owner    boolean := coalesce((p_chain->>'owner_sends')::boolean, false);
  v_mailboxes uuid[] := coalesce(
               array(select x::uuid from jsonb_array_elements_text(coalesce(p_chain->'mailbox_ids', '[]'::jsonb)) x), '{}');
  v_steps    jsonb := coalesce(p_chain->'steps', '[]'::jsonb);
  v_n        int := jsonb_array_length(coalesce(p_chain->'steps', '[]'::jsonb));
  v_existing uuid[] := '{}';
  v_dropped  uuid[] := '{}';
  v_signed_was text;
  v_step     jsonb;
  v_i        int;
  v_id       uuid;
  v_prev     uuid;
  v_template uuid;
  v_subject  text;
  v_body     text;
  v_parts    jsonb;
  v_label    text;
  v_hand     jsonb;
  v_was_hand jsonb;
  v_ids      uuid[] := '{}';
  v_changed  uuid[] := '{}';
  v_reset    int := 0;
  v_source   uuid;
begin
  -- Who may: the one table of permissions (00201 has_permission's approve, a playbook's own: owner, operator, partner).
  if p_tenant_id is null or p_user_id is null or not public.has_permission(p_user_id, p_tenant_id, 'approve') then
    raise exception 'Workspace not found.' using errcode = 'P0002';
  end if;
  if v_n < 1 then raise exception 'A reach-out has at least one email.' using errcode = '22023'; end if;
  -- A call or a note is the last step, and never the first: the chain writes before it hands anyone over.
  for v_i in 0 .. v_n - 1 loop
    if v_steps->v_i ? 'hand' and (v_i = 0 or v_i < v_n - 1) then
      raise exception 'A call or a note ends the chain.' using errcode = '22023';
    end if;
  end loop;
  -- The mailboxes it writes from are this workspace's, and not removed (00423).
  if exists (select 1 from unnest(v_mailboxes) b
              where not exists (select 1 from public.mailbox_connections c
                                 where c.id = b and c.tenant_id = p_tenant_id and c.state <> 'removed')) then
    raise exception 'Mailbox not found.' using errcode = 'P0002';
  end if;

  if v_root is null then
    if not exists (select 1 from public.lead_searches s
                    where s.id = v_search and s.tenant_id = p_tenant_id and s.removed_at is null) then
      raise exception 'Search not found.' using errcode = 'P0002';
    end if;
    -- Made on a finder search (00459): a list of its own, drawing from that search, so it takes the leads you add too.
    if exists (select 1 from public.lead_searches s where s.id = v_search and s.via not in ('chosen', 'import')) then
      if exists (select 1 from public.sequence_steps r where r.source_search_id = v_search) then
        raise exception 'This search has a reach-out already.' using errcode = '23505';
      end if;
      v_source := v_search;
      v_search := public.reach_out_list_for(p_tenant_id, v_name, p_user_id);
    end if;
  else
    select lead_search_id, signed_by into v_search, v_signed_was from public.sequence_steps
     where id = v_root and tenant_id = p_tenant_id and kind = 'reach_out' and trigger = 'lead_first'
       for update;
    if not found then raise exception 'Reach-out not found.' using errcode = 'P0002'; end if;
    -- The chain as it stands, root first.
    with recursive c as (
      select id, 0 as n from public.sequence_steps where id = v_root
      union all
      select p.id, c.n + 1 from public.sequence_steps p join c on p.after_step_id = c.id
    )
    select array_agg(id order by n) into v_existing from c;
  end if;

  -- An edit keeps the chain's steps in their places: the first k it names are the chain's first k, in order, and any
  -- after them are new.
  for v_i in 0 .. v_n - 1 loop
    v_id := nullif(v_steps->v_i->>'id', '')::uuid;
    if (v_i < coalesce(cardinality(v_existing), 0) and v_id is distinct from v_existing[v_i + 1])
       or (v_i >= coalesce(cardinality(v_existing), 0) and v_id is not null) then
      raise exception 'A step is out of its place. Open the reach-out again.' using errcode = '22023';
    end if;
  end loop;

  -- A step dropped from the end takes its work with it (R17): its live runs canceled, its planned, held and drafted
  -- sends skipped, step_removed, then its row. One that wrote, or handed anyone to the team, keeps its history: its
  -- owner pauses the chain instead.
  if coalesce(cardinality(v_existing), 0) > v_n then
    v_dropped := v_existing[v_n + 1:];
    -- Held against a claim while it is judged: a claim waits, or finds them skipped.
    perform 1 from public.sequence_sends s where s.lead_id is not null and ( s.step_id = any (v_dropped)) for update;
    if exists (select 1 from public.sequence_sends s
                where s.lead_id is not null and ( s.step_id = any (v_dropped) and s.state in ('claimed', 'queued', 'sent', 'failed', 'handed'))) then
      raise exception 'That step has written already. Pause the reach-out instead.' using errcode = '23503';
    end if;
    update public.sequence_batches set state = 'canceled'
     where tenant_id = p_tenant_id and step_id = any (v_dropped)
       and state in ('pending_approval', 'scheduled', 'sending');
    update public.sequence_sends set state = 'skipped', reason = 'step_removed'
     where sequence_sends.lead_id is not null and ( step_id = any (v_dropped) and state in ('planned', 'held', 'drafted'));
    -- Their words stay on file (a run of theirs names them: broadcasts.template_id), hidden from Templates.
    update public.templates set hidden_at = coalesce(hidden_at, now())
     where id in (select p.template_id from public.sequence_steps p where p.id = any (v_dropped));
    -- The first step dropped takes the ones after it (after_step_id cascades).
    delete from public.sequence_steps where id = v_dropped[1];
  end if;

  for v_i in 0 .. v_n - 1 loop
    v_step := v_steps->v_i;
    v_id := nullif(v_step->>'id', '')::uuid;
    v_hand := case when v_step ? 'hand'
                then jsonb_build_object('kind', v_step->'hand'->>'kind', 'words', btrim(coalesce(v_step->'hand'->>'words', '')))
              end;
    v_subject := case when v_i = 0 then btrim(coalesce(v_step->>'subject', '')) end;
    v_body := btrim(coalesce(v_step->>'body', ''));
    v_parts := case when v_i = 0
                 then jsonb_build_array(jsonb_build_object('type', 'HEADER', 'format', 'TEXT', 'text', v_subject),
                                        jsonb_build_object('type', 'BODY', 'text', v_body))
                 else jsonb_build_array(jsonb_build_object('type', 'BODY', 'text', v_body)) end;
    v_label := case
                 when v_hand is not null then case v_hand->>'kind' when 'call' then 'a call' else 'a note' end
                 when v_i = 0 then 'your email' when v_i = 1 then 'a nudge' else 'email ' || (v_i + 1) end;

    if v_id is null then
      v_id := gen_random_uuid();
      if v_hand is null then
        insert into public.templates (tenant_id, channel, source, name, language, category, meta_status, components,
                                      body_preview, title, created_by)
        values (p_tenant_id, 'email', 'chanlytics', 'reach_out_' || replace(v_id::text, '-', ''), 'en', 'marketing',
                'approved', v_parts, left(v_body, 1024),
                left(left(v_name, 60 - char_length(v_label) - 3) || ' · ' || v_label, 60), p_user_id)
        returning id into v_template;
      end if;
      insert into public.sequence_steps (id, tenant_id, kind, name, trigger, policy_class, lead_search_id, after_step_id,
                                    after_days, gap_minutes, mailbox_ids, owner_sends, signed_by, include_unconfirmed,
                                    template_id, template_name, template_language, hand, params, run_hour, cap_per_run,
                                    state, created_by)
      values (v_id, p_tenant_id, 'reach_out',
              case when v_i = 0 then v_name else left(v_name, 80 - char_length(v_label) - 3) || ' · ' || v_label end,
              case when v_i = 0 then 'lead_first' else 'after_step' end, 'outreach',
              case when v_i = 0 then v_search end, case when v_i > 0 then v_prev end,
              case when v_i > 0 then (v_step->>'after_days')::int end, v_gap, v_mailboxes, v_i = 0 and v_owner,
              case when v_i = 0 then v_signed end, v_i = 0 and v_unconf,
              case when v_hand is null then v_template end,
              case when v_hand is null then 'reach_out_' || replace(v_id::text, '-', '') end,
              case when v_hand is null then 'en' end,
              v_hand, '[]'::jsonb, 9, 200, 'running', p_user_id);
    else
      select template_id, hand into v_template, v_was_hand from public.sequence_steps where id = v_id;
      -- A step keeps what it is once it has run: an email that wrote, or a hand that handed, is itself for good.
      if (v_was_hand is null) <> (v_hand is null) then
        if exists (select 1 from public.sequence_sends s where s.lead_id is not null and ( s.step_id = v_id)) then
          raise exception 'That step has run already. Add a new step instead.' using errcode = '23503';
        end if;
        if v_hand is null then
          insert into public.templates (tenant_id, channel, source, name, language, category, meta_status, components,
                                        body_preview, title, created_by)
          values (p_tenant_id, 'email', 'chanlytics', 'reach_out_' || replace(v_id::text, '-', ''), 'en', 'marketing',
                  'approved', v_parts, left(v_body, 1024),
                  left(left(v_name, 60 - char_length(v_label) - 3) || ' · ' || v_label, 60), p_user_id)
          returning id into v_template;
          update public.sequence_steps
             set hand = null, template_id = v_template, template_name = 'reach_out_' || replace(v_id::text, '-', ''),
                 template_language = 'en'
           where id = v_id;
        else
          update public.templates set hidden_at = coalesce(hidden_at, now()) where id = v_template;
          update public.sequence_steps
             set template_id = null, template_name = null, template_language = null, hand = v_hand
           where id = v_id;
          v_template := null;
        end if;
      elsif v_hand is not null then
        update public.sequence_steps set hand = v_hand where id = v_id and hand is distinct from v_hand;
      -- New words: what is planned or held for this step is checked again against them (R5).
      elsif (select components from public.templates where id = v_template) is distinct from v_parts then
        update public.templates set components = v_parts, body_preview = left(v_body, 1024) where id = v_template;
        v_changed := v_changed || v_id;
      end if;
      -- A new name for the chain is its words' new title in Templates too.
      if v_template is not null then
        update public.templates set title = left(left(v_name, 60 - char_length(v_label) - 3) || ' · ' || v_label, 60)
         where id = v_template
           and title is distinct from left(left(v_name, 60 - char_length(v_label) - 3) || ' · ' || v_label, 60);
      end if;
      update public.sequence_steps
         set name = case when v_i = 0 then v_name else left(v_name, 80 - char_length(v_label) - 3) || ' · ' || v_label end,
             gap_minutes = v_gap, mailbox_ids = v_mailboxes, domain_ids = '{}',
             owner_sends = v_i = 0 and v_owner,
             after_days = case when v_i > 0 then (v_step->>'after_days')::int end,
             signed_by = case when v_i = 0 then v_signed end,
             include_unconfirmed = v_i = 0 and v_unconf
       where id = v_id;
    end if;
    v_prev := v_id;
    v_ids := v_ids || v_id;
  end loop;

  if v_source is not null then
    update public.sequence_steps set source_search_id = v_source where id = v_ids[1];
  end if;
  -- A new name to sign with changes every step's words as a business reads them.
  if v_root is not null and v_signed is distinct from v_signed_was then v_changed := v_ids; end if;
  if cardinality(v_changed) > 0 then
    v_reset := public.reach_out_recheck(array(
      select s.id from public.sequence_sends s
       where s.lead_id is not null and ( s.tenant_id = p_tenant_id and s.step_id = any (v_changed) and s.state in ('planned', 'held'))),
      p_tenant_id);
  end if;

  return jsonb_build_object('root_id', v_ids[1], 'step_ids', to_jsonb(v_ids), 'rechecked', v_reset);
exception
  when unique_violation then
    raise exception 'This search has a reach-out already.' using errcode = '23505';
end $$;

-- sequence_leave, as 00455_a_lead_s_place_in_its_sequence_stays_true.sql wrote it; a lead its search feeds stays out once taken out (00459).
create or replace function public.sequence_leave(p_tenant_id uuid, p_sequence_id uuid, p_enrollment_ids uuid[],
                                                p_why text default 'removed',
                                                p_decision jsonb default '{}'::jsonb, p_via text default null,
                                                p_undo_of uuid default null, p_lead_ids uuid[] default '{}')
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_why text := left(coalesce(nullif(btrim(p_why), ''), 'removed'), 60);
  v_ids uuid[];
  v_places jsonb;
  v_sends int;
  v_n int;
  v_root public.sequence_steps%rowtype;
  v_members jsonb := '[]'::jsonb;
  v_off int := 0;
begin
  if v_actor is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  if p_tenant_id is null or not public.is_acting_member(p_tenant_id) then
    raise exception 'Workspace not found.' using errcode = 'P0002';
  end if;
  -- Only their places in this sequence: an id of another sequence, or another workspace, is nobody here.
  select array_agg(e.id) into v_ids from public.sequence_enrollments e
   where e.tenant_id = p_tenant_id and e.sequence_id = p_sequence_id
     and (e.id = any (coalesce(p_enrollment_ids, '{}'))
          -- A lead named by its id (00455: the lead sheet's Take out) leaves by its place, while it stands.
          or (e.lead_id = any (coalesce(p_lead_ids, '{}')) and e.state = 'in'));
  -- A lead on the sequence's list that nothing has been planned for has no place to end (00455): it comes off the
  -- list, as reach_out_leave_out took it, and the leave keeps each membership for Put back. Only a list's: a
  -- sequence fed by its own search takes its leads out on Leads.
  if coalesce(cardinality(p_lead_ids), 0) > 0 then
    select st.* into v_root from public.sequence_steps st
      join public.lead_searches q on q.id = st.lead_search_id and q.tenant_id = st.tenant_id
     where st.tenant_id = p_tenant_id and st.sequence_id = p_sequence_id and st.kind = 'reach_out'
       and st.trigger = 'lead_first' and q.removed_at is null and q.via in ('chosen', 'import');
    if found then
      with off as (
        update public.lead_search_members m set blanked_at = now(), version = m.version + 1
         where m.tenant_id = p_tenant_id and m.search_id = v_root.lead_search_id and m.blanked_at is null
           and m.lead_id = any (p_lead_ids)
           and not exists (select 1 from public.sequence_enrollments e
                            where e.tenant_id = p_tenant_id and e.sequence_id = p_sequence_id
                              and e.lead_id = m.lead_id)
        returning m.id, m.lead_id)
      select coalesce(jsonb_agg(jsonb_build_object('id', o.id, 'lead_id', o.lead_id)), '[]'::jsonb), count(*)
        into v_members, v_off from off o;
      -- A lead its search feeds (00459 auto-add), not on the list and nothing planned for it, is kept out by a blanked
      -- row on the list, so the search does not bring it back; Put back unblanks it with the rest.
      if v_root.source_search_id is not null then
        with kept as (
          insert into public.lead_search_members (search_id, lead_id, round_id, tenant_id, class, reason, counted,
                                                  blanked_at)
          select v_root.lead_search_id, x, null, p_tenant_id, 'qualified', '', false, now()
            from unnest(p_lead_ids) as x
           where not exists (select 1 from public.lead_search_members m
                              where m.search_id = v_root.lead_search_id and m.lead_id = x)
             and exists (select 1 from public.lead_search_members m
                          where m.search_id = v_root.source_search_id and m.lead_id = x and m.blanked_at is null)
             and not exists (select 1 from public.sequence_enrollments e
                              where e.tenant_id = p_tenant_id and e.sequence_id = p_sequence_id and e.lead_id = x)
          on conflict (search_id, lead_id) do nothing
          returning id, lead_id)
        select v_members || coalesce(jsonb_agg(jsonb_build_object('id', k.id, 'lead_id', k.lead_id)), '[]'::jsonb),
               v_off + count(*)
          into v_members, v_off from kept k;
      end if;
      -- The list's own event, as Leave out writes it (reach_out_leave_out).
      if v_off > 0 then
        insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
        values (p_tenant_id, 'reach_out.lead_taken_back', 'lead', 'playbook', v_root.id,
                jsonb_build_object('search_id', v_root.lead_search_id, 'n', v_off, 'by', v_actor, 'left_out', true));
      end if;
    end if;
  end if;
  if v_ids is null and v_off = 0 then
    raise exception 'Nobody of that sequence is in it.' using errcode = 'P0002';
  end if;
  -- What the leave is about to change, as it stands now (sequence_enrollments_leave's own choice of rows), kept in the
  -- decision so its undo puts back exactly these places, and can say how many sends stay out.
  select coalesce(jsonb_agg(jsonb_build_object('id', e.id, 'next_at', e.next_at)), '[]'::jsonb) into v_places
    from public.sequence_enrollments e
   where e.tenant_id = p_tenant_id and e.id = any (v_ids) and e.state = 'in';
  select count(*) into v_sends
    from public.sequence_enrollments e
    join public.sequence_sends s
      on s.tenant_id = p_tenant_id and s.sequence_id = e.sequence_id
     and case when e.lead_id is null then s.lead_id is null and s.contact_id = e.contact_id
              else s.lead_id = e.lead_id end
   where e.tenant_id = p_tenant_id and e.id = any (v_ids) and e.state = 'in'
     and s.state in ('planned', 'held', 'queued', 'drafted');
  v_n := public.sequence_enrollments_leave(p_tenant_id, coalesce(v_ids, '{}'), v_why, v_actor) + v_off;
  return jsonb_build_object('left', v_n, 'sequence_id', p_sequence_id)
    || public.team_decision(p_tenant_id, v_actor, 'sequence', p_sequence_id, 'leave_sequence',
         coalesce(p_decision, '{}'::jsonb) || jsonb_build_object(
           'left', v_n, 'put_back', jsonb_build_object('why', v_why, 'places', v_places, 'sends', v_sends,
                                                      'members', v_members)),
         p_via, p_undo_of);
end $$;

-- reach_out_search_lines, as 00451_every_sequence_function_reads_the_sequence_tables.sql wrote it; a search a sequence draws from shows its lines too (00459).
create or replace function public.reach_out_search_lines(p_tenant_id uuid, p_search_id uuid)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public'
as $$
declare
  v_root     public.sequence_steps%rowtype;
  v_via      text;
  v_tz       text;
  v_midnight timestamptz;
begin
  if auth.uid() is null or not exists (
       select 1 from public.memberships m where m.tenant_id = p_tenant_id and m.user_id = auth.uid()
          and (m.role <> 'partner' or public.session_shows_second_factor())) then
    raise exception 'Workspace not found.' using errcode = 'P0002';
  end if;
  select * into v_root from public.sequence_steps p
   where p.tenant_id = p_tenant_id and p.kind = 'reach_out' and p.trigger = 'lead_first'
     and (p.lead_search_id = p_search_id or p.source_search_id = p_search_id)
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
        from public.sequence_sends s
        join public.sequence_batches b on b.id = s.batch_id
        left join public.messages m on m.id = s.message_id
       where s.lead_id is not null and ( s.tenant_id = p_tenant_id and s.sequence_id = v_root.id)
    ),
    rl as (
      select * from public.reach_out_root_lines(p_tenant_id, v_root.id)
    )
    select jsonb_build_object(
      'chain', jsonb_build_object('root_id', v_root.id, 'name', v_root.name, 'state', v_root.state),
      'fed_by', case when v_via in ('chosen', 'import') then 'list' else 'search' end,
      'owner_sends', v_root.owner_sends,
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
      'to_send', (select count(*) from sends where state = 'drafted' and live),
      'waiting_run_id', (select b.id from public.sequence_batches b
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

-- reach_out_lead_timeline, as 00457_a_held_email_says_what_its_check_flagged.sql wrote it; drawn from a search counts, a moved send is the old one (00459).
create or replace function public.reach_out_lead_timeline(p_tenant_id uuid, p_lead_id uuid)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public'
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
  select s.sequence_id as root_id into v_root from public.sequence_sends s
   where s.lead_id is not null and ( s.tenant_id = p_tenant_id and s.lead_id = p_lead_id
     and not (s.state = 'skipped' and s.reason in ('run_canceled', 'owner_took_back', 'moved')))
   order by s.created_at desc
   limit 1;
  v_sent := v_root is not null;
  -- Not written yet: the reach-out whose search holds it (a list it was added to, or the search that found it), 00426.
  if v_root is null then
    select p.id, m.created_at into v_root, v_added
      from public.sequence_steps p
      join public.lead_search_members m on m.search_id in (p.lead_search_id, p.source_search_id) and m.lead_id = v_lead.id
     where p.tenant_id = p_tenant_id and p.kind = 'reach_out' and p.trigger = 'lead_first'
       and m.blanked_at is null and m.class = 'qualified' and m.counted
     order by m.created_at desc
     limit 1;
  end if;
  select q.via into v_via from public.sequence_steps p
    join public.lead_searches q on q.id = case when p.source_search_id is null
                     or exists (select 1 from public.lead_search_members x
                                 where x.search_id = p.lead_search_id and x.lead_id = v_lead.id and x.blanked_at is null)
                   then p.lead_search_id else p.source_search_id end
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
    -- What the lead is and where it came from (00430): a company found by the people card was on no listing, and is not
    -- a list's either.
    'kind', v_lead.kind,
    'source', v_lead.source,
    -- When it was put on its reach-out's list, while nothing has been written to it (00426).
    'added_at', case when not v_sent and v_via in ('chosen', 'import') then v_added end,
    'chain', (select jsonb_build_object(
                'root_id', p.id, 'name', p.name, 'state', p.state,
                'fed_by', case when v_via in ('chosen', 'import') then 'list' else 'search' end,
                'run_hour', p.run_hour, 'last_run_for', p.last_run_for,
                'waiting_run_id', (select b.id from public.sequence_batches b
                                    where b.tenant_id = p_tenant_id and b.audience->>'kind' = 'reach_out'
                                      and b.audience->>'root_id' = p.id::text and b.state = 'pending_approval'
                                    order by b.created_at desc limit 1),
                'steps', (with recursive c as (
                            select x.id, x.after_days, x.hand, 0 as n from public.sequence_steps x where x.id = p.id
                            union all
                            select x.id, x.after_days, x.hand, c.n + 1
                              from public.sequence_steps x join c on x.after_step_id = c.id
                          )
                          select coalesce(jsonb_agg(jsonb_build_object('n', c.n, 'after_days', c.after_days,
                                                                       'hand', c.hand->>'kind') order by c.n), '[]'::jsonb)
                            from c))
                from public.sequence_steps p where p.id = v_root and p.tenant_id = p_tenant_id),
    -- The chain's search when there is one, else the newest search that found the lead.
    'search', coalesce(
      (select jsonb_build_object('id', q.id, 'name', q.name, 'asked', q.asked, 'fit', sm.fit)
         from public.sequence_steps p
         join public.lead_searches q on q.tenant_id = p_tenant_id and q.id = case when p.source_search_id is null
                     or exists (select 1 from public.lead_search_members x
                                 where x.search_id = p.lead_search_id and x.lead_id = v_lead.id and x.blanked_at is null)
                   then p.lead_search_id else p.source_search_id end
         left join public.lead_search_members sm on sm.search_id = q.id and sm.lead_id = v_lead.id
        where p.id = v_root),
      (select jsonb_build_object('id', q.id, 'name', q.name, 'asked', q.asked, 'fit', sm.fit)
         from public.lead_search_members sm
         join public.lead_searches q on q.id = sm.search_id and q.removed_at is null
        where sm.tenant_id = p_tenant_id and sm.lead_id = v_lead.id and sm.blanked_at is null
        order by sm.created_at desc
        limit 1)),
    -- The person's email thread: where the reach-out's emails, and the answers to them, are.
    'conversation_id', (select m.conversation_id from public.sequence_sends s join public.messages m on m.id = s.message_id
                         where s.lead_id is not null and ( s.tenant_id = p_tenant_id and s.lead_id = v_lead.id and s.state = 'sent')
                         order by s.sent_at desc
                         limit 1),
    'sends', coalesce((
      with recursive c as (
        select p.id, 0 as n from public.sequence_steps p where p.id = v_root
        union all
        select p.id, c.n + 1 from public.sequence_steps p join c on p.after_step_id = c.id
      )
      select jsonb_agg(jsonb_build_object(
               'id', s.id,
               'n', c.n,
               'hand', p.hand->>'kind',
               'state', s.state,
               'reason', s.reason,
               'hold_detail', s.hold_detail,
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
        from (select * from public.sequence_sends x
               where x.lead_id is not null and ( x.tenant_id = p_tenant_id and x.lead_id = v_lead.id and x.sequence_id = v_root)
               order by x.created_at desc
               limit 20) s
        left join c on c.id = s.step_id
        left join public.sequence_steps p on p.id = s.step_id
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
        from (select * from public.sequence_replies x
               where x.tenant_id = p_tenant_id and x.lead_id = v_lead.id
               order by x.read_at desc
               limit 10) r), '[]'::jsonb),
    -- Stop writing to them asks of a lead something was written to (reach_out_lead_stop refuses the others).
    'can_stop', v_sent and v_lead.reach_out_stopped_at is null,
    -- Their place in it (00455), the one record of where they stand: a leave between steps moves no send of theirs.
    'place', (select jsonb_build_object('id', e.id, 'state', e.state, 'why', e.why, 'next_at', e.next_at)
                from public.sequence_enrollments e
               where e.tenant_id = p_tenant_id and e.sequence_id = v_root and e.lead_id = v_lead.id
               order by e.entered_at desc limit 1)
  );
end $$;

-- reach_out_chain_people, as 00451_every_sequence_function_reads_the_sequence_tables.sql wrote it; fed by the search it draws from (00459).
create or replace function public.reach_out_chain_people(p_tenant_id uuid, p_root_id uuid, p_limit integer DEFAULT 50)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public'
as $$
declare
  v_root public.sequence_steps%rowtype;
  v_q    public.lead_searches%rowtype;
  v_lim  integer := least(greatest(coalesce(p_limit, 50), 1), 200);
begin
  if auth.uid() is null or not exists (
       select 1 from public.memberships m where m.tenant_id = p_tenant_id and m.user_id = auth.uid()
          and (m.role <> 'partner' or public.session_shows_second_factor())) then
    raise exception 'Workspace not found.' using errcode = 'P0002';
  end if;
  select * into v_root from public.sequence_steps
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
      'fed_by', case when v_root.source_search_id is not null or v_q.via not in ('chosen', 'import')
                     then 'search' else 'list' end,
      'search', coalesce((select jsonb_build_object('id', q.id, 'name', q.name) from public.lead_searches q
                           where q.id = v_root.source_search_id),
                         case when v_q.id is not null then jsonb_build_object('id', v_q.id, 'name', v_q.name) end),
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

/* -------------------------------------------------------------------------------------------- 3. one creator -- */

-- A sequence to leads as it stands, for a copy: each step's words (the first's subject too), its wait and its hand, and
-- the first step's sending (its mailboxes, its gap, who sends and who signs).
create or replace function public.reach_out_chain_of(p_tenant_id uuid, p_root_id uuid)
returns jsonb
language sql stable security definer
set search_path = public
as $$
  with recursive c as (
    select st.id, st.template_id, st.hand, st.after_days, st.gap_minutes, st.mailbox_ids, st.owner_sends, st.signed_by,
           st.include_unconfirmed, 0 as n
      from public.sequence_steps st
     where st.id = p_root_id and st.tenant_id = p_tenant_id and st.kind = 'reach_out' and st.trigger = 'lead_first'
    union all
    select st.id, st.template_id, st.hand, st.after_days, st.gap_minutes, st.mailbox_ids, st.owner_sends, st.signed_by,
           st.include_unconfirmed, c.n + 1
      from public.sequence_steps st join c on st.after_step_id = c.id
  ),
  steps as (
    select c.n,
           case when c.hand is not null
                then jsonb_build_object('hand', c.hand, 'after_days', c.after_days)
                else jsonb_strip_nulls(jsonb_build_object(
                       'subject', case when c.n = 0 then coalesce((select x->>'text' from jsonb_array_elements(t.components) x
                                                                    where x->>'type' = 'HEADER' limit 1), '') end,
                       'body', coalesce((select x->>'text' from jsonb_array_elements(t.components) x
                                          where x->>'type' = 'BODY' limit 1), ''),
                       'after_days', c.after_days))
           end as step
      from c left join public.templates t on t.id = c.template_id
  )
  select case when exists (select 1 from c) then
    jsonb_build_object(
      'gap_minutes', (select c.gap_minutes from c where c.n = 0),
      'mailbox_ids', (select to_jsonb(c.mailbox_ids) from c where c.n = 0),
      'owner_sends', (select c.owner_sends from c where c.n = 0),
      'signed_by', (select c.signed_by from c where c.n = 0),
      'include_unconfirmed', (select c.include_unconfirmed from c where c.n = 0),
      'steps', (select jsonb_agg(s.step order by s.n) from steps s))
  end
$$;

-- A sequence to leads made by name (00459): a copy of one, the words given (Ask's draft), or one email still to write;
-- on a list named for it that holds the leads chosen, on a list there is, or on an empty one; drawing from a search
-- where one is named; a draft until Start. The search a pile works through takes it as its pick.
create or replace function public.sequence_create_leads(p_tenant_id uuid, p_first jsonb, p_start boolean,
                                                       p_decision jsonb, p_via text, p_undo_of uuid)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_actor   uuid := auth.uid();
  v_name    text := left(btrim(coalesce(p_first->>'name', '')), 80);
  v_from    uuid := nullif(p_first->>'from', '')::uuid;
  v_list    uuid := nullif(p_first->>'list_id', '')::uuid;
  v_source  uuid := nullif(p_first->>'source_search_id', '')::uuid;
  v_aim     uuid := nullif(p_first->>'aim_search_id', '')::uuid;
  v_leads   uuid[] := coalesce(array(select x::uuid from jsonb_array_elements_text(coalesce(p_first->'lead_ids', '[]'::jsonb)) x), '{}');
  v_boxes   uuid[];
  v_chain   jsonb;
  v_made    jsonb;
  v_saved   jsonb;
  v_root    uuid;
  v_n       int;
  v_counted int := 0;
  v_left    jsonb := '{}'::jsonb;
begin
  if v_actor is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  if p_tenant_id is null or not public.has_permission(v_actor, p_tenant_id, 'approve') then
    raise exception 'Workspace not found.' using errcode = 'P0002';
  end if;
  if char_length(v_name) = 0 then
    raise exception 'A sequence is named.' using errcode = '22023';
  end if;
  if v_source is not null and exists (select 1 from public.sequence_steps r where r.source_search_id = v_source) then
    raise exception 'Another sequence adds from that search already.' using errcode = '23505';
  end if;
  if v_from is not null then
    v_chain := public.reach_out_chain_of(p_tenant_id, v_from);
    if v_chain is null then
      raise exception 'Sequence not found.' using errcode = 'P0002';
    end if;
  else
    -- Sent from the workspace's connected mailboxes; with none, handed to the owner to send from their own inbox.
    select coalesce(array_agg(c.id order by c.created_at), '{}') into v_boxes
      from public.mailbox_connections c where c.tenant_id = p_tenant_id and c.state = 'connected';
    v_chain := jsonb_build_object(
      'gap_minutes', 12,
      'mailbox_ids', to_jsonb(v_boxes),
      'owner_sends', cardinality(v_boxes) = 0,
      'steps', case when jsonb_typeof(p_first->'steps') = 'array' and jsonb_array_length(p_first->'steps') > 0
                    then p_first->'steps'
                    else jsonb_build_array(jsonb_build_object('subject', '', 'body', '')) end);
  end if;
  if v_list is null then
    if cardinality(v_leads) > 0 then
      v_made := public.lead_search_choose(p_tenant_id, v_name, v_leads);
      if v_made ? 'error' then
        raise exception '%', v_made->>'sentence' using errcode = '22023';
      end if;
      v_list := (v_made->>'search_id')::uuid;
      v_counted := coalesce((v_made->>'counted')::int, 0);
      v_left := coalesce(v_made->'left_out', '{}'::jsonb);
    else
      v_list := public.reach_out_list_for(p_tenant_id, v_name, v_actor);
    end if;
  elsif not exists (select 1 from public.lead_searches s where s.id = v_list and s.tenant_id = p_tenant_id
                       and s.removed_at is null and s.via in ('chosen', 'import')) then
    raise exception 'List not found.' using errcode = 'P0002';
  end if;
  v_saved := public.reach_out_save(p_tenant_id, v_actor,
               v_chain || jsonb_build_object('search_id', v_list, 'name', v_name));
  v_root := (v_saved->>'root_id')::uuid;
  v_n := jsonb_array_length(v_saved->'step_ids');
  update public.sequence_steps
     set state = case when p_start then 'running' else 'paused' end, source_search_id = v_source
   where id = v_root;
  if not p_start then
    update public.sequences set state = 'draft' where id = v_root;
  end if;
  if v_aim is not null then
    update public.lead_searches set adds_to = v_root
     where id = v_aim and tenant_id = p_tenant_id and removed_at is null;
  end if;
  return jsonb_build_object('id', v_root, 'steps', v_n, 'state', case when p_start then 'on' else 'draft' end,
                            'list_id', v_list, 'added', v_counted, 'left_out', v_left)
    || public.team_decision(p_tenant_id, v_actor, 'sequence', v_root, 'make_sequence',
         coalesce(p_decision, '{}'::jsonb) || jsonb_build_object('steps', v_n, 'started', p_start, 'starts', 'leads'),
         p_via, p_undo_of);
end $$;

-- sequence_create, as 00442_a_sequence_is_read_and_changed_through_its_doors.sql wrote it, making a sequence to leads too (00459).
create or replace function public.sequence_create(p_tenant_id uuid, p_first jsonb, p_then jsonb default '[]'::jsonb,
                                                 p_start boolean default false,
                                                 p_decision jsonb default '{}'::jsonb, p_via text default null,
                                                 p_undo_of uuid default null)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_then jsonb := coalesce(p_then, '[]'::jsonb);
  v_asked public.sequence_steps%rowtype;
  v_first public.sequence_steps%rowtype;
  v_t public.templates%rowtype;
  v_step jsonb;
  v_prev uuid;
  v_n int := 1;
begin
  if v_actor is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  if p_tenant_id is null or not public.is_acting_member(p_tenant_id) then
    raise exception 'Workspace not found.' using errcode = 'P0002';
  end if;
  if jsonb_typeof(p_first) is distinct from 'object' or jsonb_typeof(v_then) <> 'array'
     or jsonb_array_length(v_then) > 5 then
    raise exception 'sequence_create: a sequence is named whole, with five steps after its first at most'
      using errcode = '22004';
  end if;
  -- A sequence to leads (00459): the one creator makes it too, on its list, a draft until Start.
  if p_first->>'starts' = 'leads' then
    return public.sequence_create_leads(p_tenant_id, p_first, p_start, p_decision, p_via, p_undo_of);
  end if;
  if p_first->>'trigger' in ('lead_first', 'after_step') then
    raise exception 'A sequence to leads is made with starts ''leads''.' using errcode = '23514';
  end if;
  -- Each message is the workspace's own, named as its row names it, never as the body says.
  select * into v_t from public.templates
   where tenant_id = p_tenant_id and id = nullif(p_first->>'template_id', '')::uuid;
  if v_t.id is null then
    raise exception 'Message not found.' using errcode = 'P0002';
  end if;
  v_asked := jsonb_populate_record(null::public.sequence_steps, p_first);
  -- A customer's moment, made as the member: the steps' own checks, keys (a list and a message of this workspace) and
  -- unique indexes judge the rest, as the insert policy's would on the member's session. What the body leaves out is
  -- the table's own default.
  insert into public.sequence_steps (tenant_id, kind, name, trigger, list_id, list_key, template_id, template_name,
                                     template_language, params, policy_class, state, run_hour, cap_per_run, gap_days,
                                     cadence_days, channels, created_by)
  values (p_tenant_id, 'moment', v_asked.name, v_asked.trigger, v_asked.list_id, v_asked.list_key, v_t.id, v_t.name,
          v_t.language, coalesce(v_asked.params, '[]'::jsonb), v_asked.policy_class,
          case when p_start then 'running' else 'paused' end, coalesce(v_asked.run_hour, 10),
          coalesce(v_asked.cap_per_run, 25), coalesce(v_asked.gap_days, 90), coalesce(v_asked.cadence_days, 30),
          coalesce(nullif(v_asked.channels, '{}'), '{whatsapp}'), v_actor)
  returning * into v_first;
  if not p_start then
    update public.sequences set state = 'draft' where id = v_first.sequence_id;
  end if;
  v_prev := v_first.id;
  for v_step in select value from jsonb_array_elements(v_then) loop
    select * into v_t from public.templates
     where tenant_id = p_tenant_id and id = nullif(v_step->>'template_id', '')::uuid;
    if v_t.id is null then
      raise exception 'Message not found.' using errcode = 'P0002';
    end if;
    insert into public.sequence_steps (tenant_id, kind, name, trigger, after_step_id, after_days, only_if, template_id,
                                       template_name, template_language, params, policy_class, state, run_hour,
                                       cap_per_run, channels, created_by)
    values (p_tenant_id, 'moment', coalesce(nullif(btrim(v_step->>'name'), ''), v_first.name), 'after_step', v_prev,
            (v_step->>'after_days')::int,
            coalesce(array(select jsonb_array_elements_text(v_step->'only_if')), '{}'),
            v_t.id, v_t.name, v_t.language, coalesce(v_step->'params', '[]'::jsonb), v_first.policy_class, 'running',
            v_first.run_hour, v_first.cap_per_run,
            coalesce(nullif(array(select jsonb_array_elements_text(v_step->'channels')), '{}'), v_first.channels),
            v_actor)
    returning id into v_prev;
    v_n := v_n + 1;
  end loop;
  return jsonb_build_object('id', v_first.sequence_id, 'steps', v_n,
                            'state', case when p_start then 'on' else 'draft' end)
    || public.team_decision(p_tenant_id, v_actor, 'sequence', v_first.sequence_id, 'make_sequence',
         coalesce(p_decision, '{}'::jsonb) || jsonb_build_object('steps', v_n, 'started', p_start), p_via, p_undo_of);
end $$;

/* --------------------------------------------------------------------------------------------------- 4. move -- */

-- A first send skipped as 'moved' frees its lead for the sequence it moved to, as one taken back does.
drop index if exists public.sequence_sends_one_first;
create unique index if not exists sequence_sends_one_first on public.sequence_sends (tenant_id, lead_id)
  where lead_id is not null and step_id = sequence_id
    and not (state = 'skipped' and reason in ('run_canceled', 'owner_took_back', 'moved'));

-- reach_out_why_not, as 00451_every_sequence_function_reads_the_sequence_tables.sql wrote it; a send skipped as moved is not written (00459).
create or replace function public.reach_out_why_not(p_tenant_id uuid, p_lead_ids uuid[], p_include_unconfirmed boolean DEFAULT false)
 returns TABLE(lead_id uuid, why text)
 language sql
 stable security definer
 set search_path to 'public'
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
      when exists (select 1 from public.sequence_sends ro
                    where ro.lead_id is not null and ( ro.tenant_id = l.tenant_id and ro.lead_id = l.id
                      and not (ro.state = 'skipped' and ro.reason in ('run_canceled', 'owner_took_back', 'moved'))))
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

-- Out of the sequence a lead stands in and into another, for a lead nothing was sent to: its place leaves as 'moved'
-- (its first send skipped so, which frees it), then the add door takes it. Undone as a leave is (Put back) and a take
-- out of the new one.
create or replace function public.sequence_move(p_tenant_id uuid, p_lead_id uuid, p_to_root uuid,
                                               p_decision jsonb default '{}'::jsonb, p_via text default null)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_from  uuid;
  v_left  jsonb;
  v_added jsonb;
begin
  if v_actor is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  if p_tenant_id is null or not public.has_permission(v_actor, p_tenant_id, 'approve') then
    raise exception 'Workspace not found.' using errcode = 'P0002';
  end if;
  if not exists (select 1 from public.sequence_steps r where r.id = p_to_root and r.tenant_id = p_tenant_id
                    and r.kind = 'reach_out' and r.trigger = 'lead_first') then
    raise exception 'Sequence not found.' using errcode = 'P0002';
  end if;
  -- One business gets one sequence: a lead written to, or handed an email to send, stays where it is.
  if exists (select 1 from public.sequence_sends s
              where s.tenant_id = p_tenant_id and s.lead_id = p_lead_id
                and s.state in ('claimed', 'queued', 'sent', 'handed', 'drafted')) then
    raise exception 'They were written to already: a business gets one sequence.' using errcode = '23505';
  end if;
  select e.sequence_id into v_from from public.sequence_enrollments e
   where e.tenant_id = p_tenant_id and e.lead_id = p_lead_id and e.state = 'in' and e.sequence_id <> p_to_root
   order by e.entered_at desc limit 1;
  if v_from is null then
    select r.sequence_id into v_from from public.sequence_steps r
      join public.lead_search_members m on m.search_id = r.lead_search_id and m.lead_id = p_lead_id and m.blanked_at is null
     where r.tenant_id = p_tenant_id and r.kind = 'reach_out' and r.trigger = 'lead_first' and r.id <> p_to_root
     order by m.created_at desc limit 1;
  end if;
  if v_from is null then
    raise exception 'They are in no other sequence.' using errcode = 'P0002';
  end if;
  v_left := public.sequence_leave(p_tenant_id, v_from, '{}'::uuid[], 'moved',
                                  coalesce(p_decision, '{}'::jsonb) || jsonb_build_object('moved_to', p_to_root),
                                  p_via, null, array[p_lead_id]);
  -- Off the old list too, so no sequence holds them but the new one (a place that stood stays on its list otherwise).
  update public.lead_search_members m set blanked_at = now(), version = m.version + 1
    from public.sequence_steps r
   where r.id = v_from and m.search_id = r.lead_search_id and m.lead_id = p_lead_id and m.blanked_at is null;
  v_added := public.reach_out_add(p_to_root, array[p_lead_id], false);
  if coalesce((v_added->>'added')::int, 0) = 0 then
    raise exception 'They can''t join that sequence.' using errcode = '22023';
  end if;
  return jsonb_build_object('from', v_from, 'to', p_to_root, 'decision_id', v_left->>'decision_id',
                            'op_id', v_added->>'op_id');
end $$;

-- sequence_sends_move_enrollment, as 00444_a_sequence_s_people_are_found_by_an_index.sql wrote it; a step skipped by its owner moves on (00459).
create or replace function public.sequence_sends_move_enrollment() returns trigger
language plpgsql security definer
set search_path = public
set jit = off
as $$
declare
  v_place int;
  v_e public.sequence_enrollments%rowtype;
  v_next_days int;
  v_has_next boolean;
  v_seen record;
begin
  -- Sends made, once a statement (sequence_sends_enrol, below): set-based, so a batch of thousands is one pass.
  if TG_LEVEL = 'STATEMENT' then
    -- Each person the batch wrote who already has a place, driven by the batch: their place is updated by its key.
    for v_seen in
      with asked as (
        select distinct on (n.sequence_id, n.lead_id, n.contact_id) n.sequence_id, n.contact_id, n.lead_id, st.place
          from new_sends n join public.sequence_steps st on st.id = n.step_id
         order by n.sequence_id, n.lead_id, n.contact_id, st.place desc
      )
      select a.lead_id, a.place, e.id as e_id, e.state as e_state, e.place as e_place
        from asked a
        join lateral (
          (select e.id, e.state, e.place from public.sequence_enrollments e
            where a.lead_id is null and e.sequence_id = a.sequence_id and e.lead_id is null and e.contact_id = a.contact_id
            order by e.entered_at desc, e.id desc
            limit 1)
          union all
          (select e.id, e.state, e.place from public.sequence_enrollments e
            where a.lead_id is not null and e.sequence_id = a.sequence_id and e.lead_id = a.lead_id
            order by e.entered_at desc, e.id desc
            limit 1)) e on true
    loop
      if v_seen.e_state = 'in' and v_seen.lead_id is null and v_seen.place = 1 and v_seen.e_place > 1 then
        -- 1. Someone still in the sequence whose first step comes again leaves first: one place is in at a time.
        update public.sequence_enrollments
           set state = 'left', why = 'started_again', ended_at = now(), next_at = null
         where id = v_seen.e_id;
      elsif not (v_seen.lead_id is null and v_seen.place = 1 and (v_seen.e_state <> 'in' or v_seen.e_place > 1)) then
        -- 2. A place that stands is in again, at the later step.
        update public.sequence_enrollments
           set state = 'in', why = null, ended_at = null, next_at = null, left_by = null,
               place = greatest(case when state = 'in' then place else 0 end, v_seen.place)
         where id = v_seen.e_id;
      end if;
    end loop;

    -- 3. Everyone else takes a new place: none before, or a customer's first step again.
    with asked as (
      select distinct on (n.sequence_id, n.lead_id, n.contact_id)
             n.tenant_id, n.sequence_id, n.contact_id, n.lead_id, st.place
        from new_sends n join public.sequence_steps st on st.id = n.step_id
       order by n.sequence_id, n.lead_id, n.contact_id, st.place desc
    )
    insert into public.sequence_enrollments (tenant_id, sequence_id, contact_id, lead_id, place)
    select a.tenant_id, a.sequence_id, a.contact_id, a.lead_id, a.place
      from asked a
      left join lateral (
        (select e.state, e.place from public.sequence_enrollments e
          where a.lead_id is null and e.sequence_id = a.sequence_id and e.lead_id is null and e.contact_id = a.contact_id
          order by e.entered_at desc, e.id desc
          limit 1)
        union all
        (select e.state, e.place from public.sequence_enrollments e
          where a.lead_id is not null and e.sequence_id = a.sequence_id and e.lead_id = a.lead_id
          order by e.entered_at desc, e.id desc
          limit 1)) e on true
     where e.state is null
        or (a.lead_id is null and a.place = 1 and e.state <> 'in');
    return null;
  end if;

  select st.place into v_place from public.sequence_steps st where st.id = NEW.step_id;
  if v_place is null then
    return null;
  end if;
  if NEW.lead_id is null then
    select e.* into v_e from public.sequence_enrollments e
     where e.sequence_id = NEW.sequence_id and e.lead_id is null and e.contact_id = NEW.contact_id
     order by e.entered_at desc, e.id desc
     limit 1
     for update;
  else
    select e.* into v_e from public.sequence_enrollments e
     where e.sequence_id = NEW.sequence_id and e.lead_id = NEW.lead_id
     order by e.entered_at desc, e.id desc
     limit 1
     for update;
  end if;

  if v_e.id is null or NEW.state is not distinct from OLD.state then
    return null;
  end if;
  if NEW.state in ('sent', 'handed') then
    select true, n.after_days into v_has_next, v_next_days
      from public.sequence_steps n
     where n.sequence_id = NEW.sequence_id and n.place = v_place + 1;
    if coalesce(v_has_next, false) then
      update public.sequence_enrollments
         set state = 'in', why = null, ended_at = null, place = greatest(place, v_place),
             sent_at = coalesce(NEW.sent_at, now()),
             next_at = coalesce(NEW.sent_at, now()) + make_interval(days => coalesce(v_next_days, 0))
       where id = v_e.id;
    else
      update public.sequence_enrollments
         set state = 'done', why = null, ended_at = coalesce(ended_at, now()), place = greatest(place, v_place),
             sent_at = coalesce(NEW.sent_at, now()), next_at = null
       where id = v_e.id;
    end if;
  elsif NEW.state = 'skipped' and NEW.reason = 'owner_skipped' and NEW.lead_id is not null and v_place > 1 then
    -- Skip this email, from step 2 (00459): their place goes on to the next step after its wait, as a send would have
    -- moved it, or is done after the last.
    if v_e.state = 'in' and v_e.place <= v_place then
      select true, n.after_days into v_has_next, v_next_days
        from public.sequence_steps n
       where n.sequence_id = NEW.sequence_id and n.place = v_place + 1;
      if coalesce(v_has_next, false) then
        update public.sequence_enrollments
           set place = greatest(place, v_place), next_at = now() + make_interval(days => coalesce(v_next_days, 0))
         where id = v_e.id;
      else
        update public.sequence_enrollments
           set state = 'done', why = null, ended_at = coalesce(ended_at, now()), place = greatest(place, v_place),
               next_at = null
         where id = v_e.id;
      end if;
    end if;
  elsif NEW.state in ('skipped', 'failed')
        and not (NEW.lead_id is null and NEW.state = 'failed' and NEW.reason = 'outcome_unknown') then
    if v_e.state = 'in' and v_e.place <= v_place
       and not exists (select 1 from public.sequence_sends o
                        where NEW.lead_id is null and o.tenant_id = NEW.tenant_id and o.contact_id = NEW.contact_id
                          and o.sequence_id = NEW.sequence_id and o.lead_id is null and o.id <> NEW.id
                          and o.state in ('planned', 'held', 'claimed', 'queued', 'drafted')
                       union all
                       select 1 from public.sequence_sends o
                        where NEW.lead_id is not null and o.sequence_id = NEW.sequence_id and o.lead_id = NEW.lead_id
                          and o.id <> NEW.id
                          and o.state in ('planned', 'held', 'claimed', 'queued', 'drafted')) then
      update public.sequence_enrollments
         set state = 'left', why = left(coalesce(NEW.reason, NEW.state), 60), ended_at = now(), next_at = null
       where id = v_e.id;
    end if;
  end if;
  return null;
end $$;

-- reach_out_followers, as 00455_a_lead_s_place_in_its_sequence_stays_true.sql wrote it; a step skipped by its owner is followed after its wait (00459).
create or replace function public.reach_out_followers(p_tenant_id uuid, p_step_id uuid, p_parent_id uuid, p_after_days integer, p_limit integer)
 returns TABLE(lead_id uuid, contact_id uuid, email text, region text, hours jsonb, parent_message_id uuid, facts jsonb, bounced boolean, mailbox_id uuid, country text)
 language sql
 stable security definer
 set search_path to 'public'
as $$
  -- A page holds as many it may write to as the limit, and as many refused beside them (00455): the planner passes over
  -- whom it refuses (sequence_leads_leave), so their place ends with why instead of standing for good, and those passed
  -- over never crowd out a day's emails. Only someone away waits: the step takes them back after the day named.
  select g.lead_id, g.contact_id, g.email, g.region, g.hours, g.parent_message_id, g.facts, g.bounced, g.mailbox_id,
         g.country
    from (
      select f.*, row_number() over (partition by f.writes order by f.sent_at) as n
        from (
          select d.*,
                 coalesce(d.facts->>'lead_stage' in ('ready', 'nurture'), false)
                   and not coalesce((d.facts->>'suppressed')::boolean, true)
                   and not coalesce((d.facts->>'wrote_back')::boolean, true)
                   and not coalesce((d.facts->>'stopped')::boolean, false)
                   and not d.bounced as writes
            from (
      select l.id as lead_id, s.contact_id, lower(btrim(l.email)) as email, l.region, l.hours,
             coalesce(s.message_id, w.message_id) as parent_message_id, coalesce(s.sent_at, w.sent_at) as sent_at,
             coalesce(s.mailbox_id, w.mailbox_id) as mailbox_id, l.country,
             public.outreach_lead_facts(p_tenant_id, s.contact_id, lower(btrim(l.email)), l.id) as facts,
             exists (select 1 from public.sequence_sends b join public.messages bm on bm.id = b.message_id
                      where b.lead_id is not null and ( b.sequence_id = s.sequence_id and b.lead_id = l.id
                        and bm.status = 'failed' and bm.error->>'provider' in ('bounced', 'failed'))) as bounced
        from public.sequence_sends s
        join public.leads l on l.id = s.lead_id and l.tenant_id = s.tenant_id
        -- A step its owner skipped (00459) is followed as the email before it was: its thread, its mailbox.
        left join lateral (
          select x.message_id, x.sent_at, x.mailbox_id from public.sequence_sends x
           where x.sequence_id = s.sequence_id and x.lead_id = s.lead_id and x.state = 'sent'
           order by x.sent_at desc limit 1) w on s.state = 'skipped'
        join public.messages m on m.id = coalesce(s.message_id, w.message_id)
       where s.lead_id is not null and ( s.tenant_id = p_tenant_id and s.step_id = p_parent_id
         and ((s.state = 'sent' and s.sent_at <= now() - make_interval(days => p_after_days))
              or (s.state = 'skipped' and s.reason = 'owner_skipped'
                  and exists (select 1 from public.sequence_enrollments e2
                               where e2.tenant_id = p_tenant_id and e2.sequence_id = s.sequence_id and e2.lead_id = l.id
                                 and e2.state = 'in' and e2.next_at <= now())))
         and s.contact_id is not null
         -- Only someone whose place in the sequence still stands (00455): taken out, stopped or passed over is not
         -- followed up, even with nothing of theirs pending when they left.
         and exists (select 1 from public.sequence_enrollments e
                      where e.tenant_id = p_tenant_id and e.sequence_id = s.sequence_id and e.lead_id = l.id
                        and e.state = 'in')
         and not exists (select 1 from public.sequence_sends x
                          where x.lead_id is not null and ( x.step_id = p_step_id and x.lead_id = l.id
                            and not (x.state = 'skipped' and x.reason = 'outreach_away'))))
            ) d
           where not coalesce((d.facts->>'away')::boolean, false)
        ) f
    ) g
   where g.n <= greatest(p_limit, 0)
   order by g.writes desc, g.sent_at
$$;

/* ----------------------------------------------------------------------------------------------- 6. one reader -- */

-- Where each person stands in a sequence, worked out once (00459): the groups sequence_people has said since 00455 --
-- waiting (a batch waits for an OK), held, to_send (handed to its owner), next (planned or on its way), in (between
-- steps), done, left, replied (wrote back and waits for an answer) -- and queued: a lead on the sequence's list that
-- nothing has been planned for yet (every lead of a draft), for one sequence, for some leads in any, or both.
-- On the caller's session: row security reads it.
create or replace function public.sequence_places(p_tenant_id uuid, p_sequence_id uuid default null,
                                                  p_lead_ids uuid[] default null)
returns table (grp text, sequence_id uuid, contact_id uuid, lead_id uuid, enrollment_id uuid, send_id uuid,
               batch_id uuid, place int, at timestamptz, why text, hold_detail text, draft jsonb, reply jsonb)
language sql stable
set search_path = ''
as $$
  with latest as (
    select distinct on (s.sequence_id, coalesce(s.lead_id, s.contact_id))
           s.sequence_id, s.id as send_id, s.batch_id, s.step_id, s.contact_id, s.lead_id, s.state, s.reason,
           s.hold_detail, s.send_at, s.sent_at, s.drafted_at, s.created_at, s.draft, s.angle, b.state as batch_state,
           b.scheduled_for
      from public.sequence_sends s
      join public.sequence_batches b on b.id = s.batch_id
     where s.tenant_id = p_tenant_id
       and (p_sequence_id is null or s.sequence_id = p_sequence_id)
       and (p_lead_ids is null or s.lead_id = any (p_lead_ids))
     order by s.sequence_id, coalesce(s.lead_id, s.contact_id), s.created_at desc, s.id desc
  ),
  placed as (
    select l.*, st.place,
           case
             when l.state = 'held' then 'held'
             when l.state = 'drafted' then 'to_send'
             when l.batch_state = 'pending_approval' and l.state in ('queued', 'planned') then 'waiting'
             when l.state in ('queued', 'planned', 'claimed') and l.batch_state not in ('canceled', 'failed') then 'next'
             else null
           end as grp,
           coalesce(l.drafted_at, l.send_at, l.scheduled_for, l.created_at) as at
      from latest l
      left join public.sequence_steps st on st.id = l.step_id
  ),
  -- Each one's latest place in each sequence: someone who came back (started again, moved back) is where they are now.
  enrolled as (
    select distinct on (e.sequence_id, coalesce(e.lead_id, e.contact_id))
           e.id as enrollment_id, e.sequence_id, e.contact_id, e.lead_id, e.state, e.place, e.why, e.next_at,
           e.sent_at, coalesce(e.ended_at, e.moved_at) as at
      from public.sequence_enrollments e
     where e.tenant_id = p_tenant_id
       and (p_sequence_id is null or e.sequence_id = p_sequence_id)
       and (p_lead_ids is null or e.lead_id = any (p_lead_ids))
     order by e.sequence_id, coalesce(e.lead_id, e.contact_id), e.entered_at desc, e.id desc
  ),
  between as (
    select e.* from enrolled e
     where e.state = 'in'
       and not exists (select 1 from placed p where p.grp is not null and p.sequence_id = e.sequence_id
                         and coalesce(p.lead_id, p.contact_id) = coalesce(e.lead_id, e.contact_id))
  ),
  replied as (
    select distinct on (s.sequence_id, coalesce(r.lead_id, r.contact_id))
           s.sequence_id, r.contact_id, r.lead_id, r.conversation_id, r.intent, r.summary, r.read_at, st.place
      from public.sequence_replies r
      join public.sequence_sends s on s.id = r.send_id and s.tenant_id = p_tenant_id
                                  and (p_sequence_id is null or s.sequence_id = p_sequence_id)
      left join public.sequence_steps st on st.id = s.step_id
     where r.tenant_id = p_tenant_id and r.undone_at is null and r.answered_message_id is null
       and r.claim in ('person', 'owner') and r.intent in ('interested', 'question')
       and r.read_at > now() - interval '14 days'
       and (p_lead_ids is null or r.lead_id = any (p_lead_ids))
     order by s.sequence_id, coalesce(r.lead_id, r.contact_id), r.read_at desc
  ),
  listed as (
    select r.sequence_id, m.lead_id, m.created_at
      from public.sequence_steps r
      join public.lead_search_members m on m.search_id = r.lead_search_id and m.tenant_id = r.tenant_id
     where r.tenant_id = p_tenant_id and r.kind = 'reach_out' and r.trigger = 'lead_first'
       and (p_sequence_id is null or r.sequence_id = p_sequence_id)
       and (p_lead_ids is null or m.lead_id = any (p_lead_ids))
       and m.blanked_at is null and m.class = 'qualified' and m.counted
       and not exists (select 1 from placed p where p.grp is not null and p.sequence_id = r.sequence_id
                         and p.lead_id = m.lead_id)
       -- Never planned here, or moved out and back since (its place there left as moved, the list holding it again).
       and not exists (select 1 from enrolled e where e.sequence_id = r.sequence_id and e.lead_id = m.lead_id
                         and not (e.state = 'left' and e.why = 'moved'))
  ),
  rows_of as (
    select p.grp, p.sequence_id, p.contact_id, p.lead_id, null::uuid as enrollment_id, p.send_id, p.batch_id, p.place,
           p.at, p.reason as why, p.hold_detail,
           case when p.grp = 'to_send' and jsonb_typeof(p.draft) = 'object'
                     and jsonb_typeof(p.draft -> 'to') = 'string' and jsonb_typeof(p.draft -> 'subject') = 'string'
                     and jsonb_typeof(p.draft -> 'text') = 'string'
                then jsonb_build_object(
                       'to', p.draft ->> 'to',
                       'subject', p.draft ->> 'subject',
                       'text', p.draft ->> 'text',
                       'follow_up', coalesce(jsonb_typeof(p.draft -> 'parent_id') = 'string', false),
                       'angle', p.angle,
                       'drafted_at', coalesce(p.drafted_at, p.created_at))
           end as draft,
           null::jsonb as reply
      from placed p where p.grp is not null
    union all
    select 'in', b.sequence_id, b.contact_id, b.lead_id, b.enrollment_id, null, null, b.place, coalesce(b.next_at, b.at),
           null, null, null::jsonb, null::jsonb
      from between b
    union all
    select case when e.state = 'done' then 'done' else 'left' end, e.sequence_id, e.contact_id, e.lead_id,
           e.enrollment_id, null, null, e.place, e.at, e.why, null, null::jsonb, null::jsonb
      from enrolled e where e.state in ('done', 'left')
       and not exists (select 1 from listed l where l.sequence_id = e.sequence_id and l.lead_id = e.lead_id)
    union all
    select 'queued', l.sequence_id, null, l.lead_id, null, null, null, 1, l.created_at, null, null, null::jsonb,
           null::jsonb
      from listed l
    union all
    select 'replied', rp.sequence_id, rp.contact_id, rp.lead_id,
           (select e.enrollment_id from enrolled e
             where e.state = 'in' and e.sequence_id = rp.sequence_id
               and coalesce(e.lead_id, e.contact_id) = coalesce(rp.lead_id, rp.contact_id)
             limit 1),
           null, null, rp.place, rp.read_at, rp.intent, null, null::jsonb,
           jsonb_build_object('intent', rp.intent, 'summary', rp.summary, 'conversation_id', rp.conversation_id)
      from replied rp
  )
  -- Who wrote back shows there alone, not again where their place stands.
  select r.grp, r.sequence_id, r.contact_id, r.lead_id, r.enrollment_id, r.send_id, r.batch_id, r.place, r.at, r.why,
         r.hold_detail, r.draft, r.reply
    from rows_of r
   where r.grp = 'replied'
      or not exists (select 1 from replied rp where rp.sequence_id = r.sequence_id
                       and coalesce(rp.lead_id, rp.contact_id) = coalesce(r.lead_id, r.contact_id))
$$;

-- A sequence's people, by group, from sequence_places: the same answer as 00455's.
create or replace function public.sequence_people(p_tenant_id uuid, p_sequence_id uuid, p_limit integer default 50)
returns jsonb
language sql stable
set search_path = ''
as $$
  with lim as (select least(greatest(coalesce(p_limit, 50), 1), 200) as n),
  named as (
    select r.*,
           coalesce(c.display_name, c.wa_profile_name, ld.business_name) as name,
           row_number() over (partition by r.grp
                              order by case when r.grp in ('done', 'left') then r.at end desc nulls last, r.at,
                                       r.contact_id, r.lead_id) as pos
      from public.sequence_places(p_tenant_id, p_sequence_id, null) r
      left join public.contacts c on c.id = r.contact_id and c.erased_at is null
      left join public.leads ld on ld.id = r.lead_id
  )
  select jsonb_build_object(
    'counts', coalesce((select jsonb_object_agg(g.grp, g.n) from (select grp, count(*) as n from named group by grp) g),
                       '{}'::jsonb),
    'rows', coalesce((select jsonb_agg(jsonb_build_object(
                        'group', n.grp,
                        'contact_id', n.contact_id,
                        'lead_id', n.lead_id,
                        'enrollment_id', n.enrollment_id,
                        'send_id', n.send_id,
                        'batch_id', n.batch_id,
                        'name', n.name,
                        'place', n.place,
                        'at', n.at,
                        'why', n.why,
                        'hold_detail', n.hold_detail,
                        'draft', n.draft,
                        'reply', n.reply) order by n.grp, n.pos)
                        from named n where n.pos <= (select l.n from lim l)), '[]'::jsonb))
$$;

-- One lead's place (00459, the lead sheet's "Their place"): the sequence it stands in (where its place stands, else
-- the last it was in), its row as sequence_people files it, each send of its in that sequence (for the record's rail
-- drawn for one lead), whether replies there are read (a connected mailbox) or told (They wrote back...), and when it
-- joined, by hand or from the search the sequence adds from. Null for a lead in no sequence.
create or replace function public.sequence_place(p_tenant_id uuid, p_lead_id uuid)
returns jsonb
language sql stable
set search_path = ''
as $$
  with p as (
    select r.*, q.name as sequence_name, q.state as sequence_state
      from public.sequence_places(p_tenant_id, null, array[p_lead_id]) r
      join public.sequences q on q.id = r.sequence_id
     order by case when r.grp in ('done', 'left') then 1 else 0 end, r.at desc nulls last
     limit 1
  ),
  root as (
    select st.owner_sends, st.mailbox_ids, st.lead_search_id, st.source_search_id
      from public.sequence_steps st join p on st.id = p.sequence_id
  )
  select case when p.sequence_id is null then null else jsonb_build_object(
    'sequence', jsonb_build_object('id', p.sequence_id, 'name', p.sequence_name, 'state', p.sequence_state),
    'place', jsonb_build_object('group', p.grp, 'enrollment_id', p.enrollment_id, 'send_id', p.send_id,
                                'batch_id', p.batch_id, 'place', p.place, 'at', p.at, 'why', p.why,
                                'hold_detail', p.hold_detail, 'draft', p.draft, 'reply', p.reply),
    'sends', coalesce((select jsonb_agg(jsonb_build_object(
                         'id', s.id, 'step_id', s.step_id, 'place', st.place, 'state', s.state, 'reason', s.reason,
                         'hold_detail', s.hold_detail, 'send_at', s.send_at, 'sent_at', s.sent_at,
                         'drafted_at', s.drafted_at, 'batch_id', s.batch_id) order by st.place, s.created_at)
                         from public.sequence_sends s
                         join public.sequence_steps st on st.id = s.step_id
                        where s.tenant_id = p_tenant_id and s.sequence_id = p.sequence_id and s.lead_id = p_lead_id),
                       '[]'::jsonb),
    'reads_replies', coalesce((select exists (select 1 from public.mailbox_connections c
                                               where c.tenant_id = p_tenant_id and c.state = 'connected'
                                                 and c.id = any (root.mailbox_ids)) from root), false),
    'owner_sends', coalesce((select root.owner_sends from root), false),
    -- When they joined its list, by hand, or from the search it adds from (auto-add): the rail's Start says which.
    'joined', (select jsonb_build_object('at', coalesce(lm.created_at, sm.created_at),
                                         'auto', lm.created_at is null and sm.created_at is not null)
                 from root
                 left join public.lead_search_members lm on lm.search_id = root.lead_search_id and lm.lead_id = p_lead_id
                 left join public.lead_search_members sm on sm.search_id = root.source_search_id and sm.lead_id = p_lead_id
                limit 1)) end
    from (select 1) one
    left join p on true
$$;

-- Many leads' places at once (00459, Leads' Stage cell and the person page): one row a lead, the place that stands
-- first, each with its sequence's name and state.
create or replace function public.sequence_places_of(p_tenant_id uuid, p_lead_ids uuid[])
returns jsonb
language sql stable
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'lead_id', b.lead_id, 'sequence_id', b.sequence_id, 'name', b.name, 'state', b.state, 'group', b.grp,
           'place', b.place, 'at', b.at, 'why', b.why) order by b.lead_id), '[]'::jsonb)
    from (
      select distinct on (r.lead_id) r.lead_id, r.sequence_id, q.name, q.state, r.grp, r.place, r.at, r.why
        from public.sequence_places(p_tenant_id, null, coalesce(p_lead_ids, '{}'::uuid[])) r
        join public.sequences q on q.id = r.sequence_id
       where r.lead_id is not null
       order by r.lead_id, case when r.grp in ('done', 'left') then 1 else 0 end, r.at desc nulls last
    ) b
$$;

-- Auto-add, switched on the draft's record (00459, How it runs: "Add new ready leads from the search"): the search a
-- sequence to leads draws from, or none. A member who may approve; one sequence draws from a search at most.
create or replace function public.reach_out_source_set(p_tenant_id uuid, p_root_id uuid, p_search_id uuid default null)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  if p_tenant_id is null or not public.has_permission(auth.uid(), p_tenant_id, 'approve') then
    raise exception 'Workspace not found.' using errcode = 'P0002';
  end if;
  if not exists (select 1 from public.sequence_steps r where r.id = p_root_id and r.tenant_id = p_tenant_id
                    and r.kind = 'reach_out' and r.trigger = 'lead_first') then
    raise exception 'Sequence not found.' using errcode = 'P0002';
  end if;
  if p_search_id is not null and not exists (
       select 1 from public.lead_searches s where s.id = p_search_id and s.tenant_id = p_tenant_id
          and s.removed_at is null and s.via not in ('chosen', 'import')) then
    raise exception 'Search not found.' using errcode = 'P0002';
  end if;
  if p_search_id is not null and exists (select 1 from public.sequence_steps r
                                          where r.source_search_id = p_search_id and r.id <> p_root_id) then
    raise exception 'Another sequence adds from that search already.' using errcode = '23505';
  end if;
  update public.sequence_steps set source_search_id = p_search_id where id = p_root_id;
  insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
  values (p_tenant_id, 'reach_out.source_set', 'lead', 'playbook', p_root_id,
          jsonb_build_object('search_id', p_search_id, 'by', auth.uid()));
  return jsonb_build_object('root_id', p_root_id, 'source_search_id', p_search_id);
end $$;
comment on function public.reach_out_source_set(uuid, uuid, uuid) is
  'Auto-add (00459): the search whose new ready leads join a sequence to leads by themselves, or none. A member who may approve; one sequence a search.';

/* ------------------------------------------------------------------------------------------- 7. the overview -- */

-- sequence_overview, as 00442_a_sequence_is_read_and_changed_through_its_doors.sql wrote it; who is in it is everyone whose place
-- stands (sequence_places), and a sequence says the days its steps span, its emails still to write and the search it adds
-- from (00459).
create or replace function public.sequence_overview(p_tenant_id uuid, p_sequence_id uuid default null)
returns jsonb
language sql stable
set search_path = ''
as $$
  with q as (
    select * from public.sequences
     where tenant_id = p_tenant_id and (p_sequence_id is null or id = p_sequence_id)
  ),
  steps as (
    select s.sequence_id, count(*) as n,
           array(select distinct c from public.sequence_steps x, unnest(x.channels) c
                  where x.sequence_id = s.sequence_id order by c) as channels,
           -- The days its steps span (00459): each wait after the first, as the record's rail adds them.
           coalesce(sum(s.after_days) filter (where s.after_step_id is not null), 0) as days,
           -- A sequence to leads' emails still to write (00459): a step's body left empty, as a new draft's is.
           count(*) filter (where s.kind = 'reach_out' and s.hand is null
                              and coalesce(btrim((select x->>'text' from jsonb_array_elements(t.components) x
                                                   where x->>'type' = 'BODY' limit 1)), '') = '') as unwritten
      from public.sequence_steps s
      join q on q.id = s.sequence_id
      left join public.templates t on t.id = s.template_id
     group by s.sequence_id
  ),
  -- Each batch waiting for an OK, as the badge judges one (contracts runWaitsOnYou, by the business's day): its step,
  -- the day it was made for and its moment, which the server's reader asks of each (readers/sequences.ts).
  waiting as (
    select b.sequence_id, count(*) as n, sum(b.recipient_count) as people, min(b.created_at) as oldest,
           jsonb_agg(jsonb_build_object(
             'id', b.id, 'step_id', b.step_id, 'run_for', b.run_for, 'at', b.scheduled_for,
             'people', b.recipient_count,
             'audience', jsonb_build_object('kind', b.audience->>'kind', 'trigger', b.audience->>'trigger'))
             order by b.scheduled_for, b.id) as batches
      from public.sequence_batches b
      join q on q.id = b.sequence_id
     where b.state = 'pending_approval'
     group by b.sequence_id
  ),
  held as (
    select s.sequence_id,
           count(*) filter (where s.state = 'held')    as held,
           count(*) filter (where s.state = 'drafted') as to_send,
           min(coalesce(s.drafted_at, s.created_at))   as oldest
      from public.sequence_sends s
      join q on q.id = s.sequence_id
     where s.lead_id is not null and s.state in ('held', 'drafted')
     group by s.sequence_id
  ),
  -- A reply that asks for an answer: a person interested or asking, read in the last 14 days, not answered or undone.
  replies as (
    select s.sequence_id, count(*) as n, min(r.read_at) as oldest
      from public.sequence_replies r
      join public.sequence_sends s on s.id = r.send_id
      join q on q.id = s.sequence_id
     where r.undone_at is null and r.answered_message_id is null and r.claim in ('person', 'owner')
       and r.intent in ('interested', 'question') and r.read_at > now() - interval '14 days'
     group by s.sequence_id
  ),
  next as (
    select distinct on (b.sequence_id) b.sequence_id, b.id, b.scheduled_for, b.recipient_count, b.state, b.step_id
      from public.sequence_batches b
      join q on q.id = b.sequence_id
     where b.state in ('pending_approval', 'scheduled', 'sending')
     order by b.sequence_id, b.scheduled_for, b.id
  ),
  last as (
    select distinct on (b.sequence_id) b.sequence_id, b.id,
           coalesce(b.finished_at, b.started_at, b.scheduled_for) as at
      from public.sequence_batches b
      join q on q.id = b.sequence_id
     where b.state = 'sent'
     order by b.sequence_id, coalesce(b.finished_at, b.started_at, b.scheduled_for) desc, b.id
  ),
  last_counts as (
    select public.sequence_batch_counts(p_tenant_id, coalesce(array_agg(l.id), '{}')) as counts from last l
  ),
  -- Who is in it (00459): everyone whose place stands, as its People tab files them (sequence_places): a lead added and
  -- not yet planned, waiting for an OK, held, for you to send, up next or between steps. Not who left, finished, or wrote
  -- back and waits for an answer.
  in_it as (
    select p.sequence_id, count(*) as n
      from public.sequence_places(p_tenant_id, p_sequence_id, null) p
     where p.grp not in ('done', 'left', 'replied')
     group by p.sequence_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', q.id,
           'name', q.name,
           'starts', q.starts,
           'state', q.state,
           'created_at', q.created_at,
           'first', case when f.id is null then null else jsonb_build_object(
             'id', f.id,
             'kind', f.kind,
             'trigger', f.trigger,
             'state', f.state,
             'policy_class', f.policy_class,
             'run_hour', f.run_hour,
             'list_id', f.list_id,
             'list_key', f.list_key,
             'list_name', (select g.name from public.segments g where g.id = f.list_id),
             'search_id', f.lead_search_id,
             'search_name', (select ls.name from public.lead_searches ls where ls.id = f.lead_search_id),
             'source_search_id', f.source_search_id,
             'source_name', (select ls.name from public.lead_searches ls where ls.id = f.source_search_id),
             -- The search it could add from, while it adds from none (How it runs' auto-add switch): the live finder
             -- search that found most of its list's leads, and that no other sequence adds from already.
             'source_could', case when f.lead_search_id is null or f.source_search_id is not null then null else (
               select jsonb_build_object('id', ls.id, 'name', ls.name)
                 from public.lead_search_members m
                 join public.lead_search_members o
                   on o.tenant_id = m.tenant_id and o.lead_id = m.lead_id and o.search_id <> m.search_id
                 join public.lead_searches ls on ls.id = o.search_id
                where m.search_id = f.lead_search_id and m.tenant_id = q.tenant_id
                  and ls.removed_at is null and ls.via not in ('chosen', 'import')
                  and not exists (select 1 from public.sequence_steps r where r.source_search_id = ls.id)
                group by ls.id, ls.name
                order by count(*) desc, ls.name
                limit 1) end,
             'owner_sends', f.owner_sends,
             'until', f.until,
             'trial_until', f.trial_until,
             'template_name', f.template_name,
             'template_language', f.template_language) end,
           'date', case when q.starts = 'date' then (
             select jsonb_build_object('batch_id', d.id, 'state', d.state, 'at', d.scheduled_for,
                                       'people', d.recipient_count)
               from public.sequence_batches d where d.id = q.id) end,
           'steps', coalesce(st.n, 0),
           'days', coalesce(st.days, 0),
           'unwritten', coalesce(st.unwritten, 0),
           'channels', coalesce(to_jsonb(st.channels), '[]'::jsonb),
           'needs', jsonb_build_object(
             'waiting', coalesce(w.n, 0),
             'waiting_people', coalesce(w.people, 0),
             'held', coalesce(h.held, 0),
             'to_send', coalesce(h.to_send, 0),
             'replies', coalesce(rp.n, 0),
             'oldest_at', least(w.oldest, h.oldest, rp.oldest),
             'batches', coalesce(w.batches, '[]'::jsonb)),
           'next', case when nx.id is null then null else jsonb_build_object(
             'id', nx.id, 'at', nx.scheduled_for, 'people', nx.recipient_count, 'state', nx.state,
             'place', (select ps.place from public.sequence_steps ps where ps.id = nx.step_id)) end,
           'last', case when ls.id is null then null else jsonb_build_object(
             'id', ls.id, 'at', ls.at,
             'sent', coalesce(((select counts from last_counts) -> ls.id::text ->> 'sent')::int, 0),
             'replied', coalesce(((select counts from last_counts) -> ls.id::text ->> 'replied')::int, 0)) end,
           'in_it', coalesce(ii.n, 0)
         ) order by q.created_at desc, q.id), '[]'::jsonb)
    from q
    left join public.sequence_steps f on f.id = q.id
    left join steps st on st.sequence_id = q.id
    left join waiting w on w.sequence_id = q.id
    left join held h on h.sequence_id = q.id
    left join replies rp on rp.sequence_id = q.id
    left join next nx on nx.sequence_id = q.id
    left join last ls on ls.sequence_id = q.id
    left join in_it ii on ii.sequence_id = q.id
$$;
comment on function public.sequence_overview(uuid, uuid) is
  'The workspace''s sequences (0060), or the one named: how each starts (its first step, with the search it adds from: 00459, or a one-off''s date), where it stands, its steps, the days they span and the emails still to write (00459), its channels, what needs you (batches waiting for an OK and their people, emails held by the check, emails for you to send, replies to answer, the oldest of them), the batch to come, the last that went with its sent and replied, and who is in it (everyone whose place stands, sequence_places: 00459). Newest first. Under the caller''s row security.';

/* ------------------------------------------------------------------------------------------------- who may -- */

revoke all on function public.lead_search_aim(uuid, uuid, uuid) from public, anon;
grant execute on function public.lead_search_aim(uuid, uuid, uuid) to authenticated;
revoke all on function public.reach_out_list_for(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.reach_out_list_for(uuid, text, uuid) to service_role;
revoke all on function public.reach_out_chain_of(uuid, uuid) from public, anon, authenticated;
grant execute on function public.reach_out_chain_of(uuid, uuid) to service_role;
revoke all on function public.sequence_create_leads(uuid, jsonb, boolean, jsonb, text, uuid) from public, anon, authenticated;
grant execute on function public.sequence_create_leads(uuid, jsonb, boolean, jsonb, text, uuid) to service_role;
revoke all on function public.sequence_move(uuid, uuid, uuid, jsonb, text) from public, anon;
grant execute on function public.sequence_move(uuid, uuid, uuid, jsonb, text) to authenticated;
revoke all on function public.sequence_places(uuid, uuid, uuid[]) from public, anon;
grant execute on function public.sequence_places(uuid, uuid, uuid[]) to authenticated, service_role;
revoke all on function public.sequence_place(uuid, uuid) from public, anon;
grant execute on function public.sequence_place(uuid, uuid) to authenticated, service_role;
revoke all on function public.sequence_places_of(uuid, uuid[]) from public, anon;
grant execute on function public.sequence_places_of(uuid, uuid[]) to authenticated, service_role;
revoke all on function public.reach_out_source_set(uuid, uuid, uuid) from public, anon;
grant execute on function public.reach_out_source_set(uuid, uuid, uuid) to authenticated;

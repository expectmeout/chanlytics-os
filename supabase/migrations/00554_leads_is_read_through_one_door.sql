-- 00554 · Leads is read through one door, and what needs you comes first at any size (the table review, 6 Nov 2026).
--
-- A workspace's Leads is read in one place, and a read costs what it asks, not what the workspace holds.
--
--   sequence_places     planned with the values each call hands it, so a list of leads is an index condition. It walked every
--                       send of the workspace whatever it was asked, and the page reads it for each page. p_leads_only leaves
--                       the workspace's customers out of a read of all its leads. Its answer does not change.
--   lead_status_groups  says each lead's rank among what needs the member and its place's date, and takes null for every lead.
--                       Why a lead is not planned is asked of the hundred longest on a list: about 0.4 ms a lead.
--   lead_view_rows      new, the one door: which leads a view holds, one row a lead, with what a sort, a filter or a count
--                       reads of it. The box's words are each found on their own, in more of the lead.
--   leads_page          builds its key over the door's narrow rows and reads the whole row for the page alone. An empty value
--                       sorts last either way, rating is weighed by how many reviewed, the queue walks what needs you by what
--                       it needs and how long, and reviews, contacted, category, city and region sort.
--   lead_view_counts    one pass over the door.
--   lead_bulk           "all that match" reads the door.
--   lead_matches        goes: per row it cost more than the rest of the read.
--
-- Decision 0103. Either deploy order: a server before this asks nothing new, and a server after it on a database before this
-- has a new sort fall through to Found's key.

drop function if exists public.sequence_places(uuid, uuid, uuid[], boolean);
drop function if exists public.sequence_places(uuid, uuid, uuid[]);

create function public.sequence_places(
  p_tenant_id uuid, p_sequence_id uuid default null, p_lead_ids uuid[] default null, p_leads_only boolean default false
)
returns table (grp text, sequence_id uuid, contact_id uuid, lead_id uuid, enrollment_id uuid, send_id uuid, batch_id uuid,
               place integer, at timestamptz, why text, hold_detail text, draft jsonb, reply jsonb)
language plpgsql
stable
set search_path = ''
set work_mem = '64MB'
as $fn$
begin
  -- One text, planned with the values each call hands it, so a list of leads or a sequence is an index condition. A SQL
  -- function is planned without them: "p_lead_ids is null or ..." read every send of the workspace, whatever it was asked.
  return query execute $q$
  with latest as (
    select distinct on (s.sequence_id, coalesce(s.lead_id, s.contact_id))
           s.sequence_id, s.id as send_id, s.batch_id, s.step_id, s.contact_id, s.lead_id, s.state, s.reason,
           s.hold_detail, s.send_at, s.sent_at, s.drafted_at, s.created_at, b.state as batch_state,
           b.scheduled_for
      from public.sequence_sends s
      join public.sequence_batches b on b.id = s.batch_id
     where s.tenant_id = $1
       and ($2 is null or s.sequence_id = $2)
       and ($3 is null or (s.lead_id is not null and s.lead_id = any ($3)))
       and (not $4 or s.lead_id is not null)
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
     where e.tenant_id = $1
       and ($2 is null or e.sequence_id = $2)
       and ($3 is null or (e.lead_id is not null and e.lead_id = any ($3)))
       and (not $4 or e.lead_id is not null)
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
      join public.sequence_sends s on s.id = r.send_id and s.tenant_id = $1
                                  and ($2 is null or s.sequence_id = $2)
      left join public.sequence_steps st on st.id = s.step_id
     where r.tenant_id = $1 and r.undone_at is null and r.answered_message_id is null
       and r.claim in ('person', 'owner') and r.intent in ('interested', 'question')
       and r.read_at > now() - interval '14 days'
       and ($3 is null or (r.lead_id is not null and r.lead_id = any ($3)))
       and (not $4 or r.lead_id is not null)
     order by s.sequence_id, coalesce(r.lead_id, r.contact_id), r.read_at desc
  ),
  listed as (
    select r.sequence_id, m.lead_id, m.created_at
      from public.sequence_steps r
      join public.lead_search_members m on m.search_id = r.lead_search_id and m.tenant_id = r.tenant_id
     where r.tenant_id = $1 and r.kind = 'reach_out' and r.trigger = 'lead_first'
       and ($2 is null or r.sequence_id = $2)
       and ($3 is null or m.lead_id = any ($3))
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
           -- An email theirs to send says its words: read for those alone, so the walk above carries no draft.
           case when p.grp = 'to_send' then (
             select case when jsonb_typeof(d.draft) = 'object'
                              and jsonb_typeof(d.draft -> 'to') = 'string' and jsonb_typeof(d.draft -> 'subject') = 'string'
                              and jsonb_typeof(d.draft -> 'text') = 'string'
                         then jsonb_build_object(
                                'to', d.draft ->> 'to',
                                'subject', d.draft ->> 'subject',
                                'text', d.draft ->> 'text',
                                'follow_up', coalesce(jsonb_typeof(d.draft -> 'parent_id') = 'string', false),
                                'angle', d.angle,
                                'drafted_at', coalesce(p.drafted_at, p.created_at))
                    end
               from public.sequence_sends d where d.id = p.send_id)
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
  $q$ using p_tenant_id, p_sequence_id, p_lead_ids, coalesce(p_leads_only, false);
end
$fn$;

revoke all on function public.sequence_places(uuid, uuid, uuid[], boolean) from public, anon;
grant execute on function public.sequence_places(uuid, uuid, uuid[], boolean) to authenticated, service_role;

comment on function public.sequence_places(uuid, uuid, uuid[], boolean) is
  'Where each person or lead stands in each sequence, the one reader of a place (00459). Planned with the values each call hands it (00554), so p_lead_ids and p_sequence_id are index conditions; p_leads_only leaves a workspace''s customers out of a read of all its leads. An email theirs to send says its words, read for those rows alone.';

-- What it returns grows, so it is made again.
drop function if exists public.lead_status_groups(uuid, uuid[]);

create function public.lead_status_groups(p_tenant_id uuid, p_lead_ids uuid[])
returns table (lead_id uuid, status_group text, status_rank smallint, status_at timestamptz)
language sql
stable
set search_path = ''
set work_mem = '64MB'
as $$
  with placed as materialized (
    -- The place a lead's row says (sequence_places_of's rule): what stands first, then the latest.
    select distinct on (r.lead_id) r.lead_id, r.sequence_id, r.grp, r.at
      from public.sequence_places(p_tenant_id, null, p_lead_ids, true) r
     where r.lead_id is not null
     order by r.lead_id, case when r.grp in ('done', 'left') then 1 else 0 end, r.at desc nulls last
  ),
  -- On a list and no batch can take it: the row says Not planned. An address still being checked is no reason (contracts
  -- placeNotPlannedOf): it joins the batch after that. Asking why costs about 0.4 ms a lead, so a read asks it of the hundred
  -- longest on a list, which is where a lead no batch can take gathers. The rest stand as in a sequence, and a row on the
  -- page still says its own why.
  not_planned as materialized (
    select w.lead_id
      from (select array_agg(q.lead_id) as leads, array_agg(q.sequence_id) as sequences
              from (select p.lead_id, p.sequence_id from placed p where p.grp = 'queued'
                     order by p.at, p.lead_id limit 100) q
            having count(*) > 0) x
     cross join lateral public.sequence_queued_why_not(p_tenant_id, x.leads, x.sequences) w
     where w.why is not null and w.why <> 'checking'
  )
  select p.lead_id,
         case when p.grp in ('waiting', 'held', 'to_send', 'replied') or n.lead_id is not null then 'needs' else 'in' end,
         -- Among what needs the member: who wrote back cools fastest, then an email theirs to send, an OK, a hold, a list.
         (case p.grp when 'replied' then 0 when 'to_send' then 1 when 'waiting' then 2 when 'held' then 3
                     else case when n.lead_id is not null then 4 else 0 end end)::smallint,
         p.at
    from placed p
    left join not_planned n on n.lead_id = p.lead_id
   where p.grp not in ('done', 'left')
$$;

revoke all on function public.lead_status_groups(uuid, uuid[]) from public, anon;
grant execute on function public.lead_status_groups(uuid, uuid[]) to authenticated, service_role;

comment on function public.lead_status_groups(uuid, uuid[]) is
  'Where each lead stands in the queue Leads works from (00552, 00554): needs (its place waits on the member: an OK, a hold, an email theirs to send, a reply, or on a list no batch can take it), in (any other place that stands), with its rank among what needs the member and its place''s date. A lead it leaves out stands in neither: never in a sequence, or only done or left. A null list of leads reads every lead of the workspace. The place is the one the row says (sequence_places_of''s rule). Why a lead is not planned is asked of the hundred longest on a list. Under the caller''s row security; why is sequence_queued_why_not''s to say, so a partner with no second factor is never told it. The one rule lead_view_rows asks.';

drop function if exists public.lead_view_rows(uuid, uuid, text, text, jsonb, boolean, boolean);

create function public.lead_view_rows(
  p_tenant_id uuid, p_search_id uuid default null, p_class text default 'qualified', p_list text default 'all',
  p_filters jsonb default null, p_status boolean default false, p_hits boolean default false
)
returns table (
    member_id uuid, lead_id uuid, search_id uuid, fit text, excluded_by text, distance_m integer,
    later_at timestamp with time zone, business_name text, category text, city text, region text,
    found_at timestamp with time zone, rating numeric, reviews integer, stage text,
    stage_at timestamp with time zone, contacted_at timestamp with time zone, email_ok boolean, phone_ok boolean,
    email_any boolean, phone_any boolean, status_group text, status_rank smallint,
    status_at timestamp with time zone, kept boolean, hit boolean
)
language plpgsql
stable
set search_path = public
set work_mem = '64MB'
as $fn$
declare
  v_class  text := coalesce(p_class, 'qualified');
  v_list   text := coalesce(p_list, 'all');
  v_groups text[] := case when jsonb_typeof(p_filters->'status_group') = 'array'
                          then array(select jsonb_array_elements_text(p_filters->'status_group')) else '{}'::text[] end;
  v_plain  text[] := '{}';
  v_dial   text[] := '{}';
  v_word   text;
  v_digits text;
begin
  -- The box's words, the first six, each on its own. A word that is a number (three digits or more, its punctuation aside)
  -- is also looked for in the phone; any other is found as it was typed, % and _ and \ among it.
  foreach v_word in array (regexp_split_to_array(lower(btrim(coalesce(p_filters->>'q', ''))), '[\s,·]+'))[1:6] loop
    continue when v_word = '';
    v_digits := regexp_replace(v_word, '\D', '', 'g');
    if v_word ~ '^[\d()+.\-]+$' and length(v_digits) >= 3 then
      v_dial := v_dial || ('%' || v_digits || '%');
    else
      v_plain := v_plain || ('%' || replace(replace(replace(v_word, '\', '\\'), '%', '\%'), '_', '\_') || '%');
    end if;
  end loop;

  -- One text, planned with the values this call hands it: what a call does not ask is gone from the plan, and a rule asked of
  -- those values (lead_member_shown, lead_in_list) is asked once, never once a row.
  return query execute $q$
  with members as (
    -- One row a lead: with no search named a lead two searches hold stands for the membership the filters keep, then its
    -- strongest fit, then its newest.
    select distinct on (m.lead_id) m.id, m.lead_id, m.search_id, m.fit, m.excluded_by, m.distance_m, m.later_at
      from public.lead_search_members m
     where m.tenant_id = $1
       and ($2 is null or m.search_id = $2)
       and m.class = $3
       and case when m.counted then public.lead_member_shown($3, true) else public.lead_member_shown($3, false) end
       and m.blanked_at is null
     order by m.lead_id,
              (m.excluded_by is not distinct from coalesce($9, m.excluded_by) and m.fit is not distinct from coalesce($10, m.fit)) desc,
              case m.fit when 'strong' then 0 when 'look' then 1 when 'long' then 2 else 3 end,
              m.created_at desc, m.id desc
  ),
  grouped as (
    -- A search's own leads by their ids; every lead of the workspace for a read of them all. Not read unless asked.
    select g.lead_id, g.status_group, g.status_rank, g.status_at
      from public.lead_status_groups($1, case when $2 is null then null
                                              else (select array_agg(x.lead_id) from public.lead_search_members x
                                                     where x.search_id = $2 and x.tenant_id = $1) end) g
     where $5
  ),
  shown as (
    select m.id as member_id, m.lead_id, m.search_id, m.fit, m.excluded_by, m.distance_m, m.later_at,
           l.business_name, l.category, l.city, l.region, l.found_at, l.rating, l.reviews, l.stage, l.stage_at, l.contacted_at,
           r.email_ok, r.phone_ok, r.email_any, r.phone_any,
           g.status_group, g.status_rank, g.status_at,
           k.kept,
           k.kept and (cardinality($13) = 0 or coalesce(g.status_group, 'none') = any ($13)) as hit
      from members m
      join public.leads l on l.id = m.lead_id and l.tenant_id = $1
      left join grouped g on g.lead_id = m.lead_id
      -- What a checked slot is (contracts leadSlots), and any way to reach them at all.
      cross join lateral (
        select nullif(l.email, '') is not null and l.email_state = 'ok' as email_ok,
               nullif(l.phone_e164, '') is not null and not coalesce(l.phone_wrong, false)
                 and coalesce(l.phone_sources, 1) >= 2 as phone_ok,
               nullif(l.email, '') is not null and l.email_state not in ('none', 'invalid') as email_any,
               nullif(l.phone_e164, '') is not null and not coalesce(l.phone_wrong, false) as phone_any
      ) r
      cross join lateral (
        select lower(concat_ws(' ', l.business_name, l.category, l.neighborhood, l.postal_code, l.city, l.region, l.street,
                               l.email, l.website_host)) as hay
      ) h
      -- Every filter but the status filter: a heading's menu counts each group while one of them is picked.
      cross join lateral (
        select ($9 is null or m.excluded_by = $9) is true
               and ($10 is null or m.fit = $10) is true
               and (not $11 or r.email_ok)
               and (not $12 or r.phone_ok)
               and (cardinality($7) = 0 or h.hay like all ($7))
               and (cardinality($8) = 0 or (h.hay || ' ' || coalesce(ltrim(l.phone_e164, '+'), '')) like all ($8)) as kept
      ) k
     where l.blanked_at is null and l.erased_at is null
       and (public.lead_in_list('', null, $4)
            or (l.stage, coalesce(l.closed_reason, '')) in (
                 select s.stage, coalesce(s.closed_reason, '')
                   from (select distinct x.stage, x.closed_reason from public.leads x where x.tenant_id = $1) s
                  where public.lead_in_list(s.stage, s.closed_reason, $4)))
  )
  select s.* from shown s where not $6 or s.hit
  $q$ using p_tenant_id, p_search_id, v_class, v_list,
            coalesce(p_status, false) or cardinality(v_groups) > 0, coalesce(p_hits, false),
            v_plain, v_dial,
            nullif(p_filters->>'excluded_by', ''), nullif(p_filters->>'fit', ''),
            coalesce(jsonb_typeof(p_filters->'reach') = 'array' and p_filters->'reach' ? 'email', false),
            coalesce(jsonb_typeof(p_filters->'reach') = 'array' and p_filters->'reach' ? 'phone', false),
            v_groups;
end
$fn$;

revoke execute on function public.lead_view_rows(uuid, uuid, text, text, jsonb, boolean, boolean) from public, anon;
grant execute on function public.lead_view_rows(uuid, uuid, text, text, jsonb, boolean, boolean) to authenticated, service_role;

comment on function public.lead_view_rows(uuid, uuid, text, text, jsonb, boolean, boolean) is
  'Which leads a view of Leads holds, the one door leads_page, lead_view_counts and lead_bulk read it through (00554): one row a lead, under the caller''s row security, by lead_member_shown, lead_in_list and nothing blanked or erased, with what a sort, a filter or a count reads of it and no more. kept: it meets every filter but the status filter ({q, excluded_by, fit, reach}). hit: and the status filter ({status_group}). The words of q are each found on their own, in the name, kind, neighbourhood, area, street, email or website; a word that is a number is also looked for in the phone. Each lead''s place in the queue is read only where p_status or a status filter asks it. p_hits leaves out what the filters do not keep.';

create or replace function public.leads_page(
  p_tenant_id uuid, p_search_id uuid default null, p_class text default 'qualified', p_sort text default 'found',
  p_after_key text default null, p_limit integer default 200, p_list text default 'all', p_dir text default 'asc',
  p_after_id uuid default null, p_list_id uuid default null, p_filters jsonb default null
)
returns table (
    member_id uuid, lead_id uuid, place_id text, search_id uuid, round_id uuid, class text, excluded_by text,
    fit text, reason text, distance_m integer, counted boolean, counted_month text, judgment jsonb, shares jsonb,
    business_name text, category text, street text, city text, region text, postal_code text, lat double precision,
    lng double precision, website_host text, instagram_url text, phone_e164 text, phone_sources smallint,
    phone_wrong boolean, email text, email_alternates jsonb, email_state text,
    email_checked_at timestamp with time zone, rating numeric, reviews integer, stage text, closed_reason text,
    last_outcome text, last_note text, contact_id uuid, contacted_at timestamp with time zone,
    converted_at timestamp with time zone, exported_at timestamp with time zone, found_at timestamp with time zone,
    places integer, version integer, page_key text, sort_key text, about text, hours jsonb, image_url text,
    price text, reviews_dist jsonb, facebook_url text, linkedin_url text, tiktok_url text, claimed boolean,
    maps_url text, rank integer, neighborhood text, mark_path text, later_at timestamp with time zone, chain_id uuid,
    kind text, facts jsonb, status_group text
)
language plpgsql
stable
set search_path = public
set work_mem = '64MB'
as $fn$
declare
  v_desc boolean := coalesce(p_dir, 'asc') = 'desc';
  v_sort text := coalesce(p_sort, 'found');
  v_after_key text := case when p_after_id is not null then p_after_key else split_part(coalesce(p_after_key, ''), '|', 1) end;
  v_after_id uuid := coalesce(p_after_id, nullif(split_part(coalesce(p_after_key, ''), '|', 2), '')::uuid);
begin
  -- One text, planned with the values this call hands it: the sort's own key is all that is built, over the door's narrow
  -- rows, and the whole row is read for the page alone. A name sorts as a reader's alphabet does; every other key is digits
  -- and letters a byte's order says, which is the cheaper to compare by far.
  return query execute format($q$
  with keyed as (
    select v.member_id, v.lead_id, v.status_group,
           case $1
             when 'fit' then
               (case when (v.fit is null) = $8 then '1' else '0' end)
               || (case v.fit when 'strong' then '0' when 'look' then '1' when 'long' then '2' else '3' end) || t.found
             when 'distance' then
               (case when (v.distance_m is null) = $8 then '1' else '0' end)
               || lpad(coalesce(v.distance_m, 0)::text, 9, '0') || t.found
             when 'business' then
               (case when (coalesce(v.business_name, '') = '') = $8 then '1' else '0' end)
               || left(replace(lower(coalesce(v.business_name, '')), '|', ' '), 60) || t.found
             when 'rating' then
               (case when (v.rating is null) = $8 then '1' else '0' end)
               || lpad(coalesce(t.weighed, 0)::text, 3, '0') || t.found
             when 'reviews' then
               (case when (v.reviews is null) = $8 then '1' else '0' end)
               || lpad(coalesce(v.reviews, 0)::text, 9, '0') || t.found
             when 'contacted' then
               (case when (v.contacted_at is null) = $8 then '1' else '0' end)
               || lpad(coalesce(date_part('epoch', v.contacted_at)::bigint, 0)::text, 10, '0') || t.found
             when 'category' then
               (case when (coalesce(v.category, '') = '') = $8 then '1' else '0' end)
               || left(replace(lower(coalesce(v.category, '')), '|', ' '), 40) || t.found
             when 'city' then
               (case when (coalesce(v.city, '') = '') = $8 then '1' else '0' end)
               || left(replace(lower(coalesce(v.city, '')), '|', ' '), 40) || t.found
             when 'region' then
               (case when (coalesce(v.region, '') = '') = $8 then '1' else '0' end)
               || left(replace(lower(coalesce(v.region, '')), '|', ' '), 40) || t.found
             -- The queue: what needs you, by what it needs and how long; what is in a sequence, the next send soonest; then
             -- the stages: who to start with, the longest since contact, the most recently moved.
             when 'stage' then
               (case
                  when v.status_group = 'needs' then
                    '0' || v.status_rank::text || lpad(coalesce(date_part('epoch', v.status_at)::bigint, 9999999999)::text, 10, '0')
                  when v.status_group = 'in' then
                    '1' || lpad(coalesce(date_part('epoch', v.status_at)::bigint, 9999999999)::text, 10, '0')
                  when v.stage = 'ready' then
                    '2' || (case v.fit when 'strong' then '0' when 'look' then '1' when 'long' then '2' else '3' end)
                    || (case when v.email_ok and v.phone_ok then '0' when v.email_ok then '1' when v.phone_ok then '2'
                             when v.email_any or v.phone_any then '3' else '4' end)
                    || lpad((999 - coalesce(t.weighed, 0))::text, 3, '0')
                  when v.stage = 'nurture' then
                    '3' || lpad(coalesce(date_part('epoch', v.contacted_at)::bigint, 0)::text, 10, '0')
                  when v.stage = 'converted' then
                    '4' || lpad((9999999999 - date_part('epoch', coalesce(v.stage_at, v.found_at))::bigint)::text, 10, '0')
                  else
                    '5' || lpad((9999999999 - date_part('epoch', coalesce(v.stage_at, v.found_at))::bigint)::text, 10, '0')
                end) || t.found
             -- The pile (00426): undecided first, then put off for later (the oldest first), then the decided: on the list
             -- it adds to, or with a reach-out already (lead_chain_of: one lead, one reach-out), or no longer Ready; within
             -- each, the strongest fit, then a checked address before a number alone, then the newest.
             when 'pile' then
               (case when v.stage <> 'ready'
                       or ($13 is not null and exists (select 1 from public.lead_search_members x
                                                        where x.search_id = $13 and x.lead_id = v.lead_id and x.blanked_at is null))
                       or public.lead_chain_of($2, v.lead_id) is not null
                       then '2' || lpad('0', 10, '0')
                     when v.later_at is not null then '1' || lpad(date_part('epoch', v.later_at)::bigint::text, 10, '0')
                     else '0' || lpad('0', 10, '0') end)
               || (case v.fit when 'strong' then '0' when 'look' then '1' when 'long' then '2' else '3' end)
               || (case when v.email_ok then '0' when v.phone_any then '1' else '2' end)
               || t.found
             else t.found
           end as k
      from public.lead_view_rows($2, $3, $4, $5, $6, $7, true) v
      cross join lateral (
        select lpad((9999999999 - date_part('epoch', v.found_at)::bigint)::text, 10, '0') as found,
               -- The rating, weighed by how many reviewed: 5.0 from one review is not 4.8 from nine hundred.
               round(100 * (coalesce(v.reviews, 0) * v.rating + 40) / (coalesce(v.reviews, 0) + 10))::integer as weighed
      ) t
  ),
  page as (
    select k.member_id, k.lead_id, k.status_group, k.k
      from keyed k
     where $9 is null or (k.k collate %1$I, k.member_id) %3$s ($10, $11)
     order by k.k collate %1$I %2$s, k.member_id %2$s
     limit $12
  )
  select m.id, m.lead_id, l.place_id, m.search_id, m.round_id, m.class, m.excluded_by, m.fit, m.reason, m.distance_m,
         m.counted, m.counted_month, m.judgment, coalesce(m.judgment->'shares', '[]'::jsonb),
         l.business_name, l.category, l.street, l.city, l.region, l.postal_code, l.lat, l.lng, l.website_host, l.instagram_url,
         l.phone_e164, l.phone_sources, l.phone_wrong, l.email, l.email_alternates, l.email_state, l.email_checked_at, l.rating, l.reviews,
         l.stage, l.closed_reason, l.last_outcome, l.last_note, l.contact_id, l.contacted_at, l.converted_at, l.exported_at, l.found_at,
         (select count(*)::integer from public.lead_places pl where pl.lead_id = l.id), l.version,
         p.k, p.k || '|' || p.member_id::text,
         l.about, l.hours, l.image_url, l.price, l.reviews_dist, l.facebook_url, l.linkedin_url, l.tiktok_url, l.claimed, l.maps_url, l.rank, l.neighborhood, l.mark_path,
         m.later_at, public.lead_chain_of(l.tenant_id, l.id), l.kind, l.facts, p.status_group
    from page p
    join public.lead_search_members m on m.id = p.member_id
    join public.leads l on l.id = p.lead_id
   order by p.k collate %1$I %2$s, p.member_id %2$s
  $q$,
    case when v_sort in ('business', 'category', 'city', 'region') then 'default' else 'C' end,
    case when v_desc then 'desc' else 'asc' end,
    case when v_desc then '<' else '>' end)
  using v_sort, p_tenant_id, p_search_id, p_class, p_list, p_filters, v_sort = 'stage', not v_desc,
        p_after_key, v_after_key, v_after_id, least(greatest(coalesce(p_limit, 200), 1), 500), p_list_id;
end
$fn$;

revoke execute on function public.leads_page(uuid, uuid, text, text, text, integer, text, text, uuid, uuid, jsonb) from public, anon;
grant execute on function public.leads_page(uuid, uuid, text, text, text, integer, text, text, uuid, uuid, jsonb) to authenticated, service_role;

comment on function public.leads_page(uuid, uuid, text, text, text, integer, text, text, uuid, uuid, jsonb) is
  'A page of a view of Leads (lead_view_rows: which leads it holds, under the caller''s row security, one row a lead), keyset-paged on the sort key in either direction, its whole row read for the page alone. An empty value sorts last whichever way. The sorts: found (newest first), fit, distance, business, rating (weighed by how many reviewed), reviews, contacted, category, city, region; stage, the queue (00552, 00554: what needs you, by what it needs and how long; what is in a sequence, the next send soonest; then who to start with, the longest since contact, the most recently moved); and pile (00426: undecided first, then put off for later, oldest first, then the decided: on the list p_list_id, with a reach-out already, or no longer Ready; within each, the strongest fit, a checked address before a number alone, the newest). Each row says when it was put off (later_at), the reach-out it goes with (chain_id, lead_chain_of), what the lead is with a company''s people (kind, facts: 00430), and, only where the sort or a filter asks, its status group (status_group, lead_status_groups; null being none). Hand the last row''s page_key and member_id back as p_after_key and p_after_id; A''s packed sort_key still works on its own, split here.';

create or replace function public.lead_view_counts(
  p_tenant_id uuid, p_search_id uuid default null, p_class text default 'qualified', p_list text default 'all',
  p_filters jsonb default null
)
returns jsonb
language sql
stable
set search_path = public
set work_mem = '64MB'
as $$
  with r as materialized (
    select v.excluded_by, v.status_group, v.kept, v.hit, v.email_ok, v.phone_ok
      from public.lead_view_rows(p_tenant_id, p_search_id, p_class, p_list, p_filters, true, false) v
  )
  select jsonb_build_object(
           'view', a.view,
           'matching', a.matching,
           'excluded_by', coalesce((select jsonb_object_agg(x.excluded_by, x.n)
                                      from (select r.excluded_by, count(*) as n from r
                                             where r.excluded_by is not null group by r.excluded_by) x), '{}'::jsonb),
           'status_groups', jsonb_build_object('needs', a.needs, 'in', a.placed, 'none', a.none),
           -- How many of the rows every filter keeps can be reached each way, by the rule the Reach filter asks.
           'with_email', a.with_email,
           'with_phone', a.with_phone)
    from (select count(*) as view,
                 count(*) filter (where r.hit) as matching,
                 -- Every filter but the status filter: a heading's menu says each group's count while one of them is picked.
                 count(*) filter (where r.kept and r.status_group = 'needs') as needs,
                 count(*) filter (where r.kept and r.status_group = 'in') as placed,
                 count(*) filter (where r.kept and r.status_group is null) as none,
                 count(*) filter (where r.hit and r.email_ok) as with_email,
                 count(*) filter (where r.hit and r.phone_ok) as with_phone
            from r) a
$$;

revoke execute on function public.lead_view_counts(uuid, uuid, text, text, jsonb) from public, anon;
grant execute on function public.lead_view_counts(uuid, uuid, text, text, jsonb) to authenticated, service_role;

comment on function public.lead_view_counts(uuid, uuid, text, text, jsonb) is
  'What a view of Leads holds (lead_view_rows, each lead once as the page draws it and lead_bulk acts on it): {view: its leads, matching: those meeting p_filters ("Select all N that match"), excluded_by: {criterion: n} over the view without the filters (the Excluded view''s chips), status_groups: {needs, in, none} under every filter but the status filter itself (a heading''s menu), with_email and with_phone: of those meeting p_filters, how many can be reached each way (the foot)}. 00500, decision 0083 Phase B; 00552; 00554.';

create or replace function public.lead_bulk(
  p_tenant_id uuid, p_action text, p_ids uuid[] default null, p_view jsonb default null, p_search_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user   uuid := auth.uid();
  v_ids    uuid[];
  v_stage  text;
  v_reason text;
  v_before jsonb := '{}'::jsonb;
  v_done   integer := 0;
  v_op     uuid;
  v_m      record;
  v_a      jsonb;
  v_stop   jsonb;
begin
  if v_user is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  if p_tenant_id is null or not public.is_acting_member(p_tenant_id) then
    raise exception 'Workspace not found.' using errcode = 'P0002';
  end if;
  if p_action not in ('contacted', 'not_a_fit', 'keep', 'exclude') then
    raise exception 'action must be contacted, not_a_fit, keep or exclude' using errcode = '22023';
  end if;
  if (p_ids is null) = (p_view is null) then
    raise exception 'name the leads, or the view, and not both' using errcode = '22023';
  end if;

  -- Keep and Exclude over a selection of Needs review (D3, 00145): the owner's, through the member's own
  -- door (lead_member_move) once per lead, so each counts or is refused exactly as the row's own Keep is.
  -- The search named is the one the pile is read in; without it, the lead's newest membership in review.
  -- One lead_operations row per member, as the row's act writes, and no bulk row: the acts undo one by one.
  -- The month running out stops the run and is said with what was done before it.
  if p_action in ('keep', 'exclude') then
    if p_ids is null then
      raise exception 'keep and exclude take the leads by id' using errcode = '22023';
    end if;
    if not public.has_permission(v_user, p_tenant_id, 'find') then
      raise exception 'Only an owner can keep or exclude a lead.' using errcode = '42501';
    end if;
    for v_m in
      select distinct on (m.lead_id) m.search_id, m.lead_id
        from unnest(p_ids) as x(id)
        join public.lead_search_members m on m.lead_id = x.id and m.tenant_id = p_tenant_id and m.class = 'review' and m.blanked_at is null
        join public.lead_rounds r on r.id = m.round_id
       order by m.lead_id, (m.search_id is not distinct from p_search_id) desc, r.created_at desc
    loop
      v_a := public.lead_member_move(v_m.search_id, v_m.lead_id, p_action);
      if v_a ? 'error' then
        if v_a->>'error' = 'month_leads_used' then
          v_stop := v_a;
          exit;
        end if;
      else
        v_done := v_done + 1;
      end if;
    end loop;
    return jsonb_build_object('done', v_done, 'skipped', cardinality(p_ids) - v_done, 'op_id', null, 'version', 1)
        || coalesce(v_stop, '{}'::jsonb);
  end if;
  v_stage  := case p_action when 'contacted' then 'nurture' else 'archived' end;
  v_reason := case p_action when 'not_a_fit' then 'not_a_fit' else null end;

  -- The same rows the page would show: the selection, or the view with its filters and no paging (lead_view_rows, the one
  -- door, which holds what a view is and what its filters keep).
  if p_ids is not null then
    select coalesce(array_agg(l.id), '{}') into v_ids
      from public.leads l
     where l.tenant_id = p_tenant_id and l.id = any (p_ids)
       and l.erased_at is null and l.blanked_at is null;
  else
    select coalesce(array_agg(v.lead_id), '{}') into v_ids
      from public.lead_view_rows(p_tenant_id, (p_view->>'search')::uuid, p_view->>'class', p_view->>'list', p_view, false, true) v;
  end if;
  if coalesce(array_length(v_ids, 1), 0) = 0 then
    return jsonb_build_object('done', 0, 'op_id', null, 'version', 1);
  end if;

  -- What each row was, read before anything is written, with the version this
  -- act will leave it at: Undo restores only the rows nobody touched since.
  select coalesce(jsonb_object_agg(l.id::text, jsonb_build_object(
           'stage', l.stage, 'closed_reason', l.closed_reason, 'seen', l.version + 1)), '{}'::jsonb)
    into v_before
    from public.leads l
   where l.tenant_id = p_tenant_id and l.id = any (v_ids);

  update public.leads l
     set stage         = v_stage,
         closed_reason = case when v_stage = 'archived' then v_reason else null end,
         contacted_at  = case when v_stage = 'nurture' then coalesce(l.contacted_at, now()) else l.contacted_at end,
         version       = l.version + 1
   where l.tenant_id = p_tenant_id and l.id = any (v_ids);
  get diagnostics v_done = row_count;

  -- One event for the act, not one per lead: the operation row holds the ids,
  -- and an activity log with 1,240 rows in it says nothing.
  if p_action = 'not_a_fit' then
    insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
    values (p_tenant_id, 'lead.not_a_fit', 'lead', 'lead', null,
            jsonb_build_object('why', null, 'count', v_done, 'bulk', true, 'by', v_user));
  else
    insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
    values (p_tenant_id, 'lead.stage', 'lead', 'lead', null,
            jsonb_build_object('stage', v_stage, 'reason', v_reason, 'count', v_done, 'bulk', true, 'by', v_user));
  end if;

  -- version 1: a bulk row names no single lead, so the operation is guarded by
  -- undone_at and each lead by the version in `before`.
  insert into public.lead_operations (tenant_id, kind, search_id, lead_ids, before, after, version, by)
  values (p_tenant_id, 'bulk', null, v_ids, v_before,
          jsonb_build_object('action', p_action, 'done', v_done), 1, v_user)
  returning id into v_op;
  return jsonb_build_object('done', v_done, 'op_id', v_op, 'version', 1);
end $$;

revoke execute on function public.lead_bulk(uuid, text, uuid[], jsonb, uuid) from public, anon;
grant execute on function public.lead_bulk(uuid, text, uuid[], jsonb, uuid) to authenticated;

comment on function public.lead_bulk(uuid, text, uuid[], jsonb, uuid) is
  'Operator for contacted and not_a_fit; owner (permission find) for keep and exclude, which go through lead_member_move once per lead in review -- in the search named, else the lead''s newest -- and stop when the month''s leads run out ({error: month_leads_used} beside what was done). Marks many leads contacted, or not a fit: the ids the owner selected, or every lead the view matches (lead_view_rows with the view''s own filters, 00554, and no paging), never both. One lead_operations row (kind bulk) holds every id with what it was and the version this act leaves it at, so lead_undo restores the rows nobody touched since and says how many it kept. Returns {done, op_id, version}.';

drop function if exists public.lead_matches(jsonb, text, text, text, text, text, text, text, text, text, text, smallint, boolean, text);

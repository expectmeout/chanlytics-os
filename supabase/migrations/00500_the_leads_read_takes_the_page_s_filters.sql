-- 00500 · The Leads read takes the page's filters (decision 0083, Phase B; the spec's §21).
--
-- The table narrowed the rows it had loaded (at most 500): a view of 800 with Checked email on showed the checked ones of
-- the first 500, "Select all N that match" was hidden while anything narrowed, and the export applied the reach alone.
-- The read now narrows: one rule, asked by the page's read, its counts and the bulk act by view alike.
--
--   lead_matches       the one rule: the box's words (in the business's name, its kind or its area, as contracts
--                      lead-row.ts writes the area: "postal · city, state"), the criterion that left a lead out, a fit,
--                      and each reach the Filter asks, checked as contracts leadSlots draws a checked slot (an address
--                      whose mailbox exists; a number not marked wrong that two sources agree on). Null asks nothing.
--   leads_page         takes p_filters (00430's form otherwise): made again, since its arguments grow.
--   lead_view_counts   how many leads the view holds, how many of them match, and how many each criterion left
--                      out (the Excluded view's chips, over the view without the filters, as the chips counted the rows
--                      loaded before): each lead once, as the page draws them and lead_bulk acts on them. Read as the
--                      caller, as leads_page is.
--   lead_bulk          the act by view asks lead_matches of the view's own filters, and lead_member_shown for the rule it
--                      copied (00145's form otherwise; its arguments do not change).

/* ------------------------------------------------------------------ 1. the one rule -- */

create or replace function public.lead_matches(p_filters jsonb, p_business text, p_category text, p_postal text,
  p_city text, p_region text, p_excluded_by text, p_fit text, p_email text, p_email_state text, p_phone text,
  p_phone_sources smallint, p_phone_wrong boolean)
returns boolean
language sql
stable
parallel safe
set search_path = public
as $$
  with f as (
    select lower(btrim(coalesce(p_filters->>'q', ''))) as q,
           nullif(p_filters->>'excluded_by', '') as excluded_by,
           nullif(p_filters->>'fit', '') as fit,
           coalesce(jsonb_typeof(p_filters->'reach') = 'array' and p_filters->'reach' ? 'email', false) as email,
           coalesce(jsonb_typeof(p_filters->'reach') = 'array' and p_filters->'reach' ? 'phone', false) as phone
  )
  select p_filters is null or (
           (f.q = ''
             or strpos(lower(coalesce(p_business, '')), f.q) > 0
             or strpos(lower(coalesce(p_category, '')), f.q) > 0
             or strpos(lower(concat_ws(' · ', nullif(p_postal, ''),
                                       nullif(concat_ws(', ', nullif(p_city, ''), nullif(p_region, '')), ''))), f.q) > 0)
           and (f.excluded_by is null or p_excluded_by is not distinct from f.excluded_by)
           and (f.fit is null or p_fit is not distinct from f.fit)
           and (not f.email or (nullif(p_email, '') is not null and p_email_state = 'ok'))
           and (not f.phone or (nullif(p_phone, '') is not null and not coalesce(p_phone_wrong, false)
                                and coalesce(p_phone_sources, 1) >= 2)))
    from f
$$;

revoke execute on function public.lead_matches(jsonb, text, text, text, text, text, text, text, text, text, text, smallint, boolean) from public, anon;
grant execute on function public.lead_matches(jsonb, text, text, text, text, text, text, text, text, text, text, smallint, boolean) to authenticated, service_role;

comment on function public.lead_matches(jsonb, text, text, text, text, text, text, text, text, text, text, smallint, boolean) is
  'Whether a lead''s membership meets the Leads page''s filters ({q, excluded_by, fit, reach: [email|phone]}; null asks nothing): the words, lower-cased and trimmed, in the business''s name, its kind or its area (postal · city, state, as contracts lead-row.ts writes it); the criterion that left it out; its fit; and each reach asked, checked as contracts leadSlots draws a checked slot (an address whose mailbox exists, email_state ok; a number not marked wrong on two sources). The one rule leads_page, lead_view_counts and lead_bulk ask (decision 0083, Phase B).';

/* ------------------------------------------------------- 2. a page of leads, narrowed -- */

-- 00430's leads_page with p_filters: its arguments grow, so it is made again.
drop function if exists public.leads_page(uuid, uuid, text, text, text, integer, text, text, uuid, uuid);
create or replace function public.leads_page(p_tenant_id uuid, p_search_id uuid default null, p_class text default 'qualified',
  p_sort text default 'found', p_after_key text default null, p_limit integer default 200, p_list text default 'all',
  p_dir text default 'asc', p_after_id uuid default null, p_list_id uuid default null, p_filters jsonb default null)
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
  chain_id uuid, kind text, facts jsonb)
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
           -- A place or a company, and a company's people (00430).
           l.kind, l.facts,
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
       -- The page's filters (lead_matches, the one rule).
       and public.lead_matches(p_filters, l.business_name, l.category, l.postal_code, l.city, l.region, m.excluded_by, m.fit,
                               l.email, l.email_state, l.phone_e164, l.phone_sources, l.phone_wrong)
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
         b.later_at, b.chain_id, b.kind, b.facts
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

revoke execute on function public.leads_page(uuid, uuid, text, text, text, integer, text, text, uuid, uuid, jsonb) from public, anon;
grant execute on function public.leads_page(uuid, uuid, text, text, text, integer, text, text, uuid, uuid, jsonb) to authenticated, service_role;

comment on function public.leads_page(uuid, uuid, text, text, text, integer, text, text, uuid, uuid, jsonb) is
  'A page of members of one class (qualified: the counted ones; review; excluded) joined to their leads, narrowed to one of the rail''s lists (lead_in_list) and to the page''s filters (p_filters, lead_matches: the words, the criterion, the fit, the reaches; 00500), keyset-paged on the sort key in either direction, under the caller''s row security. Seven sorts: found, fit, distance, business, rating, stage, and pile (00426: undecided first, then put off for later, oldest first, then the decided: on the list p_list_id, with a reach-out already, or no longer Ready; within each, the strongest fit, a checked address before a number alone, the newest). Each row says when it was put off (later_at), the reach-out it goes with (chain_id, lead_chain_of), and what the lead is with a company''s people (kind, facts: 00430). Hand the last row''s page_key and member_id back as p_after_key and p_after_id; A''s packed sort_key still works on its own, split here. Which memberships show is lead_member_shown (00212).';

/* ------------------------------------------------------------- 3. what a view holds -- */

create or replace function public.lead_view_counts(p_tenant_id uuid, p_search_id uuid default null,
  p_class text default 'qualified', p_list text default 'all', p_filters jsonb default null)
returns jsonb
language sql
stable
set search_path = public
as $$
  with v as (
    select m.lead_id, m.excluded_by,
           public.lead_matches(p_filters, l.business_name, l.category, l.postal_code, l.city, l.region, m.excluded_by, m.fit,
                               l.email, l.email_state, l.phone_e164, l.phone_sources, l.phone_wrong) as hit
      from public.lead_search_members m
      join public.leads l on l.id = m.lead_id
     where m.tenant_id = p_tenant_id
       and (p_search_id is null or m.search_id = p_search_id)
       and m.class = coalesce(p_class, 'qualified')
       and public.lead_member_shown(m.class, m.counted)
       and public.lead_in_list(l.stage, l.closed_reason, coalesce(p_list, 'all'))
       and m.blanked_at is null and l.blanked_at is null and l.erased_at is null
  )
  select jsonb_build_object(
           'view', (select count(distinct v.lead_id) from v),
           'matching', (select count(distinct v.lead_id) from v where v.hit),
           'excluded_by', coalesce((select jsonb_object_agg(x.excluded_by, x.n)
                                      from (select v.excluded_by, count(distinct v.lead_id) as n from v
                                             where v.excluded_by is not null group by v.excluded_by) x), '{}'::jsonb))
$$;

revoke execute on function public.lead_view_counts(uuid, uuid, text, text, jsonb) from public, anon;
grant execute on function public.lead_view_counts(uuid, uuid, text, text, jsonb) to authenticated, service_role;

comment on function public.lead_view_counts(uuid, uuid, text, text, jsonb) is
  'What a view of Leads holds, under the caller''s row security, by the rules leads_page reads (lead_member_shown, lead_in_list, nothing blanked or erased), each lead once as the page draws it and lead_bulk acts on it: {view: its leads, matching: those meeting p_filters (lead_matches; "Select all N that match"), excluded_by: {criterion: n} over the view without the filters (the Excluded view''s chips)}. 00500, decision 0083 Phase B.';

/* ----------------------------------------------------- 4. lead_bulk, from 00145 -- */

create or replace function public.lead_bulk(
  p_tenant_id uuid,
  p_action    text,
  p_ids       uuid[] default null,
  p_view      jsonb  default null,
  p_search_id uuid   default null
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

  -- The same rows the page would show: the selection, or the view with its
  -- filters (lead_matches over the view's own q, excluded_by, fit and reach,
  -- 00500) and no paging. lead_member_shown and lead_in_list hold the rest.
  if p_ids is not null then
    select coalesce(array_agg(l.id), '{}') into v_ids
      from public.leads l
     where l.tenant_id = p_tenant_id and l.id = any (p_ids)
       and l.erased_at is null and l.blanked_at is null;
  else
    select coalesce(array_agg(distinct m.lead_id), '{}') into v_ids
      from public.lead_search_members m
      join public.leads l on l.id = m.lead_id
     where m.tenant_id = p_tenant_id
       and (p_view->>'search' is null or m.search_id = (p_view->>'search')::uuid)
       and m.class = coalesce(p_view->>'class', 'qualified')
       and public.lead_member_shown(m.class, m.counted)
       and public.lead_in_list(l.stage, l.closed_reason, coalesce(p_view->>'list', 'all'))
       and m.blanked_at is null and l.blanked_at is null and l.erased_at is null
       and public.lead_matches(p_view, l.business_name, l.category, l.postal_code, l.city, l.region, m.excluded_by, m.fit,
                               l.email, l.email_state, l.phone_e164, l.phone_sources, l.phone_wrong);
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
comment on function public.lead_bulk(uuid, text, uuid[], jsonb, uuid) is
  'Operator for contacted and not_a_fit; owner (permission find) for keep and exclude, which go through lead_member_move once per lead in review -- in the search named, else the lead''s newest -- and stop when the month''s leads run out ({error: month_leads_used} beside what was done). Marks many leads contacted, or not a fit: the ids the owner selected, or every lead the view matches (the rules leads_page reads with the view''s own filters, lead_matches, 00500, and no paging), never both. One lead_operations row (kind bulk) holds every id with what it was and the version this act leaves it at, so lead_undo restores the rows nobody touched since and says how many it kept. Returns {done, op_id, version}.';
revoke execute on function public.lead_bulk(uuid, text, uuid[], jsonb, uuid) from public, anon;
grant  execute on function public.lead_bulk(uuid, text, uuid[], jsonb, uuid) to authenticated;

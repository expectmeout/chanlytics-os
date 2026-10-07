-- 00212 · A search's changes arrive live.
--
-- Reach out, Part 4 (PR 9; carried from Part 1). The Leads page subscribes to lead_searches
-- (legacy-bridge/leads.ts, refreshOnTables; packages/db realtime.ts watches it), but 00140 put only its rounds, members
-- and leads in the publication, so a search's own row -- a new one, a rename, a changed plan, a removal -- reached
-- another tab only on a reload. Published now, the way 00117 published tenant_channels; RLS still decides who receives a change (00140's
-- lead_searches_member_select: a member of the workspace, nobody else). Re-runnable: a second run finds it there.
--
-- And the peek reads one lead as the page does (PR 9, GET leads/[id]). Which of a lead's memberships the page shows --
-- not blanked, and a qualified one only once counted -- was written inline in leads_page; it is one rule now,
-- lead_member_shown, which leads_page (00161's body, that one line changed) and lead_member_of both ask. lead_member_of
-- answers the membership the peek draws: the view's search's when it names one, else the newest.

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'lead_searches'
  ) then
    alter publication supabase_realtime add table public.lead_searches;
  end if;
end $$;

/* ------------------------------------------ which membership the page shows -- */

create or replace function public.lead_member_shown(p_class text, p_counted boolean)
returns boolean
language sql
immutable
set search_path = public
as $$
  select p_class <> 'qualified' or p_counted
$$;
comment on function public.lead_member_shown(text, boolean) is
  'Whether the Leads page shows a membership of this class: every review and excluded one, and a qualified one once it is counted. leads_page and lead_member_of both ask it, so the list and the peek cannot disagree (00212).';
revoke execute on function public.lead_member_shown(text, boolean) from public, anon;
grant execute on function public.lead_member_shown(text, boolean) to authenticated, service_role;

create or replace function public.leads_page(
  p_tenant_id uuid,
  p_search_id uuid    default null,
  p_class     text    default 'qualified',
  p_sort      text    default 'found',
  p_after_key text    default null,
  p_limit     integer default 200,
  p_list      text    default 'all',
  p_dir       text    default 'asc',
  p_after_id  uuid    default null
)
returns table (
  member_id uuid, lead_id uuid, place_id text, search_id uuid, round_id uuid, class text, excluded_by text, fit text, reason text, distance_m integer,
  counted boolean, counted_month text, judgment jsonb, shares jsonb,
  business_name text, category text, street text, city text, region text, postal_code text, lat double precision, lng double precision,
  website_host text, instagram_url text, phone_e164 text, phone_sources smallint, phone_wrong boolean, email text, email_alternates jsonb,
  email_state text, email_checked_at timestamptz, rating numeric, reviews integer, stage text, closed_reason text, last_outcome text, last_note text,
  contact_id uuid, contacted_at timestamptz, converted_at timestamptz, exported_at timestamptz, found_at timestamptz,
  places integer, version integer, page_key text, sort_key text,
  about text, hours jsonb, image_url text, price text, reviews_dist jsonb, facebook_url text, linkedin_url text, tiktok_url text, claimed boolean, maps_url text, rank integer, neighborhood text, mark_path text
)
language sql
stable
security invoker
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
         b.about, b.hours, b.image_url, b.price, b.reviews_dist, b.facebook_url, b.linkedin_url, b.tiktok_url, b.claimed, b.maps_url, b.rank, b.neighborhood, b.mark_path
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
comment on function public.leads_page(uuid, uuid, text, text, text, integer, text, text, uuid) is
  'A page of members of one class (qualified: the counted ones; review; excluded) joined to their leads, narrowed to one of the rail''s lists (lead_in_list), keyset-paged on the sort key in either direction, under the caller''s row security. Six sorts: found, fit, distance, business, rating, stage. Hand the last row''s page_key and member_id back as p_after_key and p_after_id; A''s packed sort_key still works on its own, split here, so a caller that names only A''s six arguments pages exactly as it did. Which memberships show is lead_member_shown (00212).';
revoke execute on function public.leads_page(uuid, uuid, text, text, text, integer, text, text, uuid) from public, anon;
grant execute on function public.leads_page(uuid, uuid, text, text, text, integer, text, text, uuid) to authenticated, service_role;

/* ------------------------------------------------- the membership the peek draws -- */

create or replace function public.lead_member_of(p_tenant_id uuid, p_lead_id uuid, p_search_id uuid default null)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select to_jsonb(x)
    from (
      select m.id, m.lead_id, m.search_id, m.class, m.excluded_by, m.fit, m.reason, m.distance_m, m.counted, m.judgment
        from public.lead_search_members m
       where m.tenant_id = p_tenant_id
         and m.lead_id = p_lead_id
         and (p_search_id is null or m.search_id = p_search_id)
         and m.blanked_at is null
         and public.lead_member_shown(m.class, m.counted)
       order by m.created_at desc, m.id desc
       limit 1
    ) x
$$;
comment on function public.lead_member_of(uuid, uuid, uuid) is
  'The membership of one lead the Leads page would show (lead_member_shown, not blanked): the one in p_search_id when it names one, else the newest; null when there is none. Under the caller''s row security. GET leads/[id] reads it (00212).';
revoke execute on function public.lead_member_of(uuid, uuid, uuid) from public, anon;
grant execute on function public.lead_member_of(uuid, uuid, uuid) to authenticated, service_role;

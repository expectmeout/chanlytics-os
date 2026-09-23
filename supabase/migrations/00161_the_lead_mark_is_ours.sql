-- 00161 · The lead's mark is ours.
--
-- D6 (00147) read each lead's logo off its own site and stored the address.
-- Not one of them ever drew: the dashboard's content policy lets images in
-- from the app, Supabase and Google's photos, and a hundred shops' sites are a
-- hundred other hosts. Opening the policy to every https host would let any
-- page we render reach anywhere, and every row would ask a stranger's server
-- for a file each time it was drawn.
--
-- So the collect keeps a copy. It asks for the logo's bytes once, core judges
-- them (core/leads/mark-image.ts: a PNG, JPEG, WebP, GIF or ICO read from the
-- bytes, 64px or more on its short side, no longer than twice that on its
-- long one, 512KB at most), and the edge stores them under their own hash in
-- a public bucket on the Supabase origin the policy already allows. The column
-- holds that name and nothing else, and its CHECK is the promise that nothing
-- a site wrote reaches an <img> through it.
--
-- The bucket is public to read and written only by the service role (no
-- policy on storage.objects names it): a logo is what a business shows the
-- world on its own home page, and a copy named by its hash is one file for
-- every workspace that finds the same business. Blanking a lead lets go of
-- its name; the file stays, because another lead may be wearing it.
--
-- Three doors are re-declared from 00147 with one delta each -- copied by a
-- script, not retyped -- and keep their security, their comment and their
-- grants: the commit writes the name where the lead had none, the page reads
-- it in place of the site's address, and blanking clears it.

alter table public.leads add column if not exists mark_path text;
alter table public.leads drop constraint if exists leads_mark_path_shape;
alter table public.leads add constraint leads_mark_path_shape
  check (mark_path is null or mark_path ~ '^[0-9a-f]{64}\.(png|jpg|webp|gif|ico)$');
comment on column public.leads.mark_path is
  'The copy of the business''s mark we keep (00161): <sha256>.<png|jpg|webp|gif|ico> in the public lead-marks bucket, stored by the collect once the bytes at logo_url passed core''s check. What every tile draws; null when there is no copy yet.';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('lead-marks', 'lead-marks', true, 524288, array['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/x-icon'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

/* ------------------------------------------ lead_collect_commit, from 00147 -- */

create or replace function public.lead_collect_commit(p_run_id uuid, p_owner text, p_gen integer, p_from_offset integer, p_to_offset integer, p_page jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_run       public.lead_runs;
  v_round     public.lead_rounds;
  v_room      integer;
  v_counted   integer := 0;
  v_qualified integer := 0;
  v_review    integer := 0;
  v_excluded  integer := 0;
  v_month     text;
  v_usage     numeric;
  v_delta     numeric;
  v_n         integer;
  v_j         jsonb;
  v_el        jsonb;
  v_pl        jsonb;
  v_m         jsonb;
  v_dup       text;
  v_lead      uuid;
  v_class     text;
  v_next      jsonb;
  v_r         jsonb;
  v_state     text;
  v_counter   public.lead_counters;
begin
  -- One lock order everywhere: the ROUND first, then its runs, as
  -- lead_round_stop and lead_search_remove take them. So the run is read
  -- without a lock, only to learn which round it belongs to (a run never
  -- moves), and read again under lock once the round is held; a Stop arriving
  -- mid-page then waits instead of deadlocking (40P01). The lease and the
  -- offset are judged on the locked copy, so the compare-and-set still holds.
  select * into v_run from public.lead_runs where id = p_run_id;
  if not found then
    return jsonb_build_object('ok', false, 'why', 'run');
  end if;
  select * into v_round from public.lead_rounds where id = v_run.round_id for update;
  select * into v_run from public.lead_runs where id = p_run_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'why', 'run');
  end if;
  if v_run.lease_owner is distinct from p_owner or v_run.lease_gen <> p_gen then
    return jsonb_build_object('ok', false, 'why', 'lease');
  end if;
  if v_run.read_offset <> p_from_offset then
    return jsonb_build_object('ok', false, 'why', 'offset');
  end if;
  -- A check run may commit after its round ended (Check again, 00145): it decides nothing, its answers
  -- reach the leads through lead_check_commit, and its usage settles below against nothing outstanding.
  if v_round.state = 'ended' and v_run.purpose <> 'check' then
    return jsonb_build_object('ok', false, 'why', 'ended');
  end if;
  v_month := v_round.month;
  v_room  := greatest(v_round.allowance_reserved - v_round.allowance_used, 0);

  -- The judge's answers for the page's batches, kept once each by op_id.
  for v_j in select * from jsonb_array_elements(
      case jsonb_typeof(p_page->'judgment') when 'array' then p_page->'judgment'
           when 'object' then jsonb_build_array(p_page->'judgment') else '[]'::jsonb end) loop
    insert into public.lead_judgments (tenant_id, round_id, batch, op_id, request_hash, answer, model, tokens)
    values (v_round.tenant_id, v_round.id, coalesce((v_j->>'batch')::integer, 0), v_j->>'op_id', v_j->>'request_hash',
            coalesce(v_j->'answer', '{}'::jsonb), v_j->>'model', coalesce((v_j->>'tokens')::integer, 0))
    on conflict (op_id) do nothing;
    get diagnostics v_n = row_count;
    if v_n = 1 then
      update public.lead_rounds
         set judge_tokens = judge_tokens + coalesce((v_j->>'tokens')::integer, 0),
             judge_model  = coalesce(v_j->>'model', judge_model)
       where id = v_round.id;
    end if;
  end loop;

  -- The places: a lead by place id (once), a duplicate listing folded into
  -- the lead it belongs to, a membership (once), the count.
  for v_el in select * from jsonb_array_elements(coalesce(p_page->'places', '[]'::jsonb)) loop
    v_pl  := v_el->'place';
    v_m   := v_el->'member';
    v_dup := v_el->>'duplicate_of_place_id';
    if v_pl->>'place_id' is null then continue; end if;
    -- Never a place, number or address on the never-again list: a customer
    -- is hidden from every search, an erased person from everything (S8).
    if exists (select 1 from public.lead_suppressions s where s.tenant_id = v_round.tenant_id and (
           (s.kind = 'place' and s.what in ('customer', 'erased') and s.hash = public.lead_suppression_hash(v_round.tenant_id, v_pl->>'place_id'))
        or (s.kind = 'phone' and s.what = 'erased' and v_pl->>'phone_e164' is not null and s.hash = public.lead_suppression_hash(v_round.tenant_id, v_pl->>'phone_e164'))
        or (s.kind = 'email' and s.what = 'erased' and v_pl->>'email' is not null and s.hash = public.lead_suppression_hash(v_round.tenant_id, v_pl->>'email')))) then
      continue;
    end if;
    v_lead := null;
    if v_dup is not null then
      select l.id into v_lead from public.leads l
       where l.tenant_id = v_round.tenant_id and l.blanked_at is null and l.erased_at is null
         and (l.place_id = v_dup or exists (select 1 from public.lead_places p where p.tenant_id = l.tenant_id and p.lead_id = l.id and p.place_id = v_dup))
       limit 1;
      if v_lead is not null then
        insert into public.lead_places (lead_id, tenant_id, place_id, title, street)
        values (v_lead, v_round.tenant_id, v_pl->>'place_id', left(v_pl->>'business_name', 200), left(v_pl->>'street', 200))
        on conflict (tenant_id, place_id) do nothing;
      end if;
    end if;
    if v_lead is null then
      insert into public.leads (tenant_id, place_id, business_name, category, street, city, region, postal_code, country, lat, lng,
                                website_host, instagram_url, phone_e164, phone_sources, phone_wrong, email, email_alternates, email_state, rating, reviews,
                                about, hours, image_url, price, reviews_dist, facebook_url, linkedin_url, tiktok_url, claimed, maps_url, rank, neighborhood, logo_url, mark_path)
      values (v_round.tenant_id, v_pl->>'place_id', coalesce(left(v_pl->>'business_name', 200), ''), left(v_pl->>'category', 120),
              left(v_pl->>'street', 200), left(v_pl->>'city', 120), left(v_pl->>'region', 40), left(v_pl->>'postal_code', 20),
              coalesce(v_pl->>'country', 'US'), (v_pl->>'lat')::double precision, (v_pl->>'lng')::double precision,
              left(v_pl->>'website_host', 120), left(v_pl->>'instagram_url', 200), v_pl->>'phone_e164',
              coalesce((v_pl->>'phone_sources')::smallint, 0), coalesce((v_pl->>'phone_wrong')::boolean, false),
              v_pl->>'email', coalesce(v_pl->'email_alternates', '[]'::jsonb), coalesce(v_pl->>'email_state', 'none'),
              (v_pl->>'rating')::numeric, (v_pl->>'reviews')::integer,
              left(v_pl->>'about', 600), coalesce(v_pl->'hours', '[]'::jsonb), left(v_pl->>'image_url', 500), left(v_pl->>'price', 8),
              v_pl->'reviews_dist', left(v_pl->>'facebook_url', 300), left(v_pl->>'linkedin_url', 300), left(v_pl->>'tiktok_url', 300),
              (v_pl->>'claimed')::boolean, left(v_pl->>'maps_url', 500), (v_pl->>'rank')::integer, left(v_pl->>'neighborhood', 120), left(v_pl->>'logo_url', 500),
              -- The copy we keep (00161): its name, when it is one of ours; anything else is no copy at all.
              case when v_pl->>'mark_path' ~ '^[0-9a-f]{64}\.(png|jpg|webp|gif|ico)$' then v_pl->>'mark_path' end)
      -- A place already here keeps its worked state and gains what this listing shows where it had none (D2):
      -- these eleven columns and nothing else, so a lead's stage, its email state and its version are untouched.
      on conflict (tenant_id, place_id) where place_id is not null do update set
        about        = coalesce(public.leads.about, excluded.about),
        hours        = case when public.leads.hours = '[]'::jsonb then excluded.hours else public.leads.hours end,
        image_url    = coalesce(public.leads.image_url, excluded.image_url),
        price        = coalesce(public.leads.price, excluded.price),
        reviews_dist = coalesce(public.leads.reviews_dist, excluded.reviews_dist),
        facebook_url = coalesce(public.leads.facebook_url, excluded.facebook_url),
        linkedin_url = coalesce(public.leads.linkedin_url, excluded.linkedin_url),
        tiktok_url   = coalesce(public.leads.tiktok_url, excluded.tiktok_url),
        claimed      = coalesce(public.leads.claimed, excluded.claimed),
        maps_url     = coalesce(public.leads.maps_url, excluded.maps_url),
        rank         = coalesce(public.leads.rank, excluded.rank),
        neighborhood = coalesce(public.leads.neighborhood, excluded.neighborhood),
        logo_url     = coalesce(public.leads.logo_url, excluded.logo_url),
        mark_path    = coalesce(public.leads.mark_path, excluded.mark_path);
      select l.id into v_lead from public.leads l where l.tenant_id = v_round.tenant_id and l.place_id = v_pl->>'place_id';
    end if;
    if v_lead is null then continue; end if;
    v_class := coalesce(v_m->>'class', 'review');
    insert into public.lead_search_members (search_id, lead_id, round_id, tenant_id, judgment, class, excluded_by, fit, reason, distance_m)
    values (v_round.search_id, v_lead, v_round.id, v_round.tenant_id,
            coalesce(v_m->'judgment', '{}'::jsonb) || jsonb_build_object('shares', coalesce(v_el->'shares', '[]'::jsonb)),
            v_class, v_m->>'excluded_by', v_m->>'fit', coalesce(left(v_m->>'reason', 120), ''), (v_m->>'distance_m')::integer)
    on conflict (search_id, lead_id) do nothing;
    get diagnostics v_n = row_count;
    if v_n = 0 then continue; end if;
    if v_class = 'qualified' then
      v_qualified := v_qualified + 1;
      if v_room > 0 then
        update public.lead_search_members set counted = true, counted_month = v_month
         where search_id = v_round.search_id and lead_id = v_lead;
        v_room := v_room - 1;
        v_counted := v_counted + 1;
      end if;
    elsif v_class = 'review' then
      v_review := v_review + 1;
    else
      v_excluded := v_excluded + 1;
    end if;
  end loop;

  -- Delivery settles against the reservation (E2): the round's used grows,
  -- the month's reserved becomes used.
  if v_counted > 0 then
    update public.lead_rounds set allowance_used = allowance_used + v_counted where id = v_round.id;
    v_counter := public.lead_counter_take(v_round.tenant_id, 'allowance', v_month);
    update public.lead_counters set used = used + v_counted, reserved = greatest(reserved - v_counted, 0), updated_at = now() where id = v_counter.id;
  end if;

  -- The run's usage so far, as the provider reports it; only what is new
  -- settles.
  v_usage := (p_page->>'usage_usd')::numeric;
  if v_usage is not null and v_usage > v_run.usage_usd then
    v_delta := v_usage - v_run.usage_usd;
    perform public.lead_settle_usage(v_round.tenant_id, v_month, v_round.day, v_round.platform_day, v_delta,
      case when v_round.state = 'ended' then 0 else v_round.cost_reserved_usd - v_round.cost_usd end);
    -- An ended round is final (its trigger refuses a change): the month's counters carry a re-check's cents, the round's own cost stays what it ended at.
    if v_round.state <> 'ended' then
      update public.lead_rounds set cost_usd = cost_usd + v_delta where id = v_round.id;
    end if;
    update public.lead_runs set usage_usd = v_usage where id = p_run_id;
  end if;

  -- The offset moves (compare-and-set held above), the run's state follows
  -- the provider's, and the next collect is written once.
  update public.lead_runs
     set read_offset = p_to_offset,
         items_seen  = coalesce((p_page->>'items_seen')::integer, items_seen),
         state       = coalesce(p_page->>'run_state', state),
         finished_at = case when coalesce(p_page->>'run_state', state) in ('succeeded', 'failed', 'aborted', 'timed_out') then coalesce(finished_at, now()) else finished_at end
   where id = p_run_id;
  v_next := p_page->'next';
  if v_next is not null and jsonb_typeof(v_next) = 'object' then
    if v_next->>'kind' = 'lead_check' then
      insert into public.jobs (tenant_id, kind, due_at, payload)
      values (v_round.tenant_id, 'lead_check', now() + make_interval(secs => coalesce((v_next->>'run_after_seconds')::integer, 0)),
              jsonb_build_object('round_id', v_round.id, 'batch', coalesce((v_next->>'batch')::integer, 1)));
    else
      insert into public.jobs (tenant_id, kind, due_at, payload)
      values (v_round.tenant_id, 'lead_collect', now() + make_interval(secs => coalesce((v_next->>'run_after_seconds')::integer, 0)),
              jsonb_build_object('run_id', p_run_id, 'seq', coalesce(v_next->>'seq', 'p' || p_to_offset)))
      on conflict ((payload->>'run_id'), (payload->>'seq')) where kind = 'lead_collect' and state <> 'failed' do nothing;
    end if;
  end if;

  -- The round: a bigger target once the probe passed, the question, the
  -- pending ending, a state, or its ending (which releases and records).
  v_r := coalesce(p_page->'round', '{}'::jsonb);
  if v_r->>'target' is not null then
    update public.lead_rounds set target = greatest((v_r->>'target')::integer, target) where id = v_round.id;
  end if;
  if v_r->>'ending_pending' is not null then
    update public.lead_rounds set ending_pending = v_r->>'ending_pending' where id = v_round.id;
  end if;
  -- Where to look next, when the area ran dry (D3, 00145): written with the ending it belongs to, before the
  -- round is final.
  if v_r->'nearby' is not null and jsonb_typeof(v_r->'nearby') = 'array' then
    update public.lead_rounds set nearby = v_r->'nearby' where id = v_round.id;
  end if;
  if v_r->'question' is not null and jsonb_typeof(v_r->'question') = 'object' then
    update public.lead_rounds set question = v_r->'question', waiting_since = now() where id = v_round.id;
  end if;
  if v_r->>'ending' is not null then
    perform public.lead_round_end(v_round.id, v_r->>'ending');
  elsif v_r->>'state' is not null and v_r->>'state' <> v_round.state then
    update public.lead_rounds
       set state = v_r->>'state', started_at = coalesce(started_at, now())
     where id = v_round.id;
    insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
    values (v_round.tenant_id, 'lead.round', 'lead', 'lead_round', v_round.id,
            jsonb_build_object('search_id', v_round.search_id, 'seq', v_round.seq, 'state', v_r->>'state'));
  end if;
  select state into v_state from public.lead_rounds where id = v_round.id;
  return jsonb_build_object('ok', true, 'counted', v_counted, 'qualified', v_qualified, 'review', v_review, 'excluded', v_excluded, 'round_state', v_state);
end $$;
comment on function public.lead_collect_commit(uuid, text, integer, integer, integer, jsonb) is
  'One page of one run, in one transaction (E4). Refuses {ok:false, why} on a stale lease, a wrong offset or an ended round (a check run, which decides nothing, may still commit after the round ended: Check again, 00145). Keeps judgments by op_id, inserts leads (once per place id) and members (once per search), counts Qualified members up to the round''s reservation, settles usage, advances the offset, writes the next job once, moves the round, appends the events. Replayed with the same offset it does nothing twice; replayed after the offset moved it is refused.';

/* --------------------------------------------------- leads_page, from 00147 -- */

drop function if exists public.leads_page(uuid, uuid, text, text, text, integer, text, text, uuid);
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
       and (m.class <> 'qualified' or m.counted)
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
  'A page of members of one class (qualified: the counted ones; review; excluded) joined to their leads, narrowed to one of the rail''s lists (lead_in_list), keyset-paged on the sort key in either direction, under the caller''s row security. Six sorts: found, fit, distance, business, rating, stage. Hand the last row''s page_key and member_id back as p_after_key and p_after_id; A''s packed sort_key still works on its own, split here, so a caller that names only A''s six arguments pages exactly as it did.';
revoke execute on function public.leads_page(uuid, uuid, text, text, text, integer, text, text, uuid) from public, anon;
grant execute on function public.leads_page(uuid, uuid, text, text, text, integer, text, text, uuid) to authenticated, service_role;

/* --------------------------------------------------- lead_blank, from 00147 -- */

create or replace function public.lead_blank(p_lead_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_n integer;
begin
  -- Kept: id, tenant_id, stage, closed_reason, contact_id, converted_at,
  -- contacted_at, exported_at, found_at, erased_at, the counts on its
  -- memberships. Everything that names the place, reaches it or came off its
  -- site goes, and its place id with it, so the place found again is new.
  update public.leads
     set place_id = null, business_name = '', category = null, street = null, city = null, region = null, postal_code = null,
         lat = null, lng = null, website_host = null, instagram_url = null, phone_e164 = null, phone_sources = 0,
         email = null, email_alternates = '[]'::jsonb, email_state = 'none', email_checked_at = null, rating = null, reviews = null,
         last_outcome = null, last_note = null, blanked_at = coalesce(blanked_at, now()),
         -- What the listing showed about the business goes with the rest (D2).
         about = null, hours = '[]'::jsonb, image_url = null, price = null, reviews_dist = null,
         facebook_url = null, linkedin_url = null, tiktok_url = null, claimed = null, maps_url = null, rank = null, neighborhood = null, logo_url = null, mark_path = null
   where id = p_lead_id;
  get diagnostics v_n = row_count;
  delete from public.lead_places where lead_id = p_lead_id;
  update public.lead_search_members
     set judgment = '{}'::jsonb, reason = '', blanked_at = coalesce(blanked_at, now())
   where lead_id = p_lead_id;
  return v_n;
end $$;
comment on function public.lead_blank(uuid) is
  'Removes everything that names or reaches a place, and its memberships'' judgments, keeping the stage, the link to a person and the counts. The one function retention and erasure blank through.';
revoke execute on function public.lead_blank(uuid) from public, anon, authenticated;

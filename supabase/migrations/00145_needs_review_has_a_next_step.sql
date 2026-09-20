-- 00145 · Needs review has a next step.
--
-- D3 (docs/plans/2026-09-20-lead-finder-D3-review-queue.md). Needs review is a
-- queue: each pile in it names what would resolve it, and the bar over a
-- selection offers exactly that. Two of those acts need doors.
--
-- Check again (lead_check_again, new): an address whose mailbox check did not
-- answer is asked again. The re-check runs under the round the lead was found
-- in, with a run id of its own (the job carries a nonce), so the engine's claim,
-- lease, webhook and sweep all work as they do for the round's own checks. Two
-- commits learn that a round can be ended by then, each re-declared from its
-- last text with one delta: lead_collect_commit (00144) lets a check run commit
-- its page after the round ended (it decides nothing, and nothing of the round
-- is outstanding to settle against); lead_check_commit (00140) counts a member
-- that qualifies after the round ended through the month's allowance the way
-- Keep does, since the round gave its reservation back when it ended.
--
-- Keep and Exclude over a selection (lead_bulk, 00142, re-declared with one
-- more argument): the owner's, through the member's own door once per lead, so
-- each counts or is refused exactly as the row's own act would be.
--
-- And a search that ran dry says where to look next: lead_rounds.nearby, the
-- nearest ZIP centres past its area, written by lead_collect_commit with the
-- ending and carried by lead_searches_view (00142, re-declared in place with
-- the one column appended).

-- Where to look next when a round ran dry (D3): the nearest ZCTA centres past the area it searched, as
-- LeadArea rows, nearest first, written by lead_collect_commit with the ending they belong to. [] when the
-- round found what it asked for, and for every round from before this migration.
alter table public.lead_rounds add column if not exists nearby jsonb not null default '[]'::jsonb;
comment on column public.lead_rounds.nearby is
  'Where to look next when the round ran dry (00145): the nearest ZIP centres past its area, as the plan''s area rows, nearest first; [] when it found what it asked for.';

/* ------------------------------------------ lead_collect_commit, from 00144 -- */

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
                                about, hours, image_url, price, reviews_dist, facebook_url, linkedin_url, tiktok_url, claimed, maps_url, rank)
      values (v_round.tenant_id, v_pl->>'place_id', coalesce(left(v_pl->>'business_name', 200), ''), left(v_pl->>'category', 120),
              left(v_pl->>'street', 200), left(v_pl->>'city', 120), left(v_pl->>'region', 40), left(v_pl->>'postal_code', 20),
              coalesce(v_pl->>'country', 'US'), (v_pl->>'lat')::double precision, (v_pl->>'lng')::double precision,
              left(v_pl->>'website_host', 120), left(v_pl->>'instagram_url', 200), v_pl->>'phone_e164',
              coalesce((v_pl->>'phone_sources')::smallint, 0), coalesce((v_pl->>'phone_wrong')::boolean, false),
              v_pl->>'email', coalesce(v_pl->'email_alternates', '[]'::jsonb), coalesce(v_pl->>'email_state', 'none'),
              (v_pl->>'rating')::numeric, (v_pl->>'reviews')::integer,
              left(v_pl->>'about', 600), coalesce(v_pl->'hours', '[]'::jsonb), left(v_pl->>'image_url', 500), left(v_pl->>'price', 8),
              v_pl->'reviews_dist', left(v_pl->>'facebook_url', 300), left(v_pl->>'linkedin_url', 300), left(v_pl->>'tiktok_url', 300),
              (v_pl->>'claimed')::boolean, left(v_pl->>'maps_url', 500), (v_pl->>'rank')::integer)
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
        rank         = coalesce(public.leads.rank, excluded.rank);
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

/* -------------------------------------------- lead_check_commit, from 00140 -- */

create or replace function public.lead_check_commit(p_round_id uuid, p_run_id uuid, p_results jsonb, p_usage_usd numeric, p_last boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_round   public.lead_rounds;
  v_r       jsonb;
  v_m       record;
  v_newly   integer := 0;
  v_counted integer := 0;
  v_room    integer;
  v_counter public.lead_counters;
  v_prev    numeric;
  v_delta   numeric;
  v_ended   boolean := false;
  v_month   text;
  v_later   integer := 0;
begin
  select * into v_round from public.lead_rounds where id = p_round_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'why', 'round');
  end if;
  -- A round that ended gave its unused reservation back (lead_round_end), so no room is left on it: a member
  -- that qualifies now, from a Check again (00145), counts through the month's allowance the way Keep does.
  v_room := case when v_round.state = 'ended' then 0 else greatest(v_round.allowance_reserved - v_round.allowance_used, 0) end;
  for v_r in select * from jsonb_array_elements(coalesce(p_results, '[]'::jsonb)) loop
    update public.leads
       set email_state = v_r->>'email_state', email_checked_at = coalesce((v_r->>'checked_at')::timestamptz, now())
     where id = (v_r->>'lead_id')::uuid and tenant_id = v_round.tenant_id
       and blanked_at is null and erased_at is null
       and (v_r->>'email_state') in ('ok', 'catch_all', 'unknown', 'invalid');
  end loop;
  -- A member the email standard alone held back, whose address now checks
  -- out, qualifies. It counts only through the round's reservation, the way
  -- lead_collect_commit counts a page's Qualified places: past the room the
  -- member is Qualified and uncounted, and no counter moves.
  for v_m in
    select m.search_id, m.lead_id, m.judgment
      from public.lead_search_members m
      join public.leads l on l.id = m.lead_id
     where m.round_id = p_round_id and m.class = 'review' and m.blanked_at is null and l.email_state = 'ok'
       and jsonb_typeof(m.judgment->'reasons') = 'array'
       and jsonb_array_length(m.judgment->'reasons') > 0
       and not exists (select 1 from jsonb_array_elements_text(m.judgment->'reasons') x where x not like 'email:%')
  loop
    if v_round.state = 'ended' then
      v_month   := public.lead_month(v_round.tenant_id, now());
      v_counter := public.lead_counter_take(v_round.tenant_id, 'allowance', v_month);
      -- The month is full: the member stays Needs review with its address now known good, for Keep to count later.
      if v_counter.used + v_counter.reserved + 1 > 500 then
        continue;
      end if;
      update public.lead_counters set used = used + 1, updated_at = now() where id = v_counter.id;
      update public.lead_search_members
         set class = 'qualified', counted = true, counted_month = v_month, version = version + 1,
             judgment = judgment || jsonb_build_object('reasons', '[]'::jsonb)
       where search_id = v_m.search_id and lead_id = v_m.lead_id;
      v_newly := v_newly + 1;
      v_later := v_later + 1;
      continue;
    end if;
    update public.lead_search_members
       set class = 'qualified', counted = (v_room > 0),
           counted_month = case when v_room > 0 then v_round.month else counted_month end,
           version = version + 1,
           judgment = judgment || jsonb_build_object('reasons', '[]'::jsonb)
     where search_id = v_m.search_id and lead_id = v_m.lead_id;
    v_newly := v_newly + 1;
    if v_room > 0 then
      v_room    := v_room - 1;
      v_counted := v_counted + 1;
    end if;
  end loop;
  -- Delivery settles inside the reservation, as lead_collect_commit's does:
  -- nothing counted past the room, so the month's reserved becomes used.
  if v_counted > 0 then
    update public.lead_rounds set allowance_used = allowance_used + v_counted where id = p_round_id;
    v_counter := public.lead_counter_take(v_round.tenant_id, 'allowance', v_round.month);
    update public.lead_counters set used = used + v_counted, reserved = greatest(reserved - v_counted, 0), updated_at = now() where id = v_counter.id;
  end if;
  -- The checker run's total so far, not this batch's delta: only what is new
  -- settles, so a check job tried again charges the batch once (E4, the rule
  -- lead_collect_commit takes). The run is locked after the round, never
  -- before it.
  if p_run_id is not null and coalesce(p_usage_usd, 0) > 0 then
    select r.usage_usd into v_prev from public.lead_runs r where r.id = p_run_id and r.round_id = p_round_id for update;
    if found and p_usage_usd > v_prev then
      v_delta := p_usage_usd - v_prev;
      perform public.lead_settle_usage(v_round.tenant_id, v_round.month, v_round.day, v_round.platform_day, v_delta,
        case when v_round.state = 'ended' then 0 else v_round.cost_reserved_usd - v_round.cost_usd end);
      -- An ended round is final (its trigger refuses a change): the month's counters carry the cents, the round's own cost stays what it ended at.
      if v_round.state <> 'ended' then
        update public.lead_rounds set cost_usd = cost_usd + v_delta where id = p_round_id;
      end if;
      update public.lead_runs set usage_usd = p_usage_usd where id = p_run_id;
    end if;
  end if;
  if p_last then
    select * into v_round from public.lead_rounds where id = p_round_id;
    v_ended := public.lead_round_end(p_round_id, coalesce(v_round.ending_pending,
      case when v_round.allowance_used >= v_round.target then 'target_reached' else 'searched_everything' end));
  end if;
  return jsonb_build_object('ok', true, 'qualified', v_newly, 'counted', v_counted + v_later, 'ended', v_ended);
end $$;
comment on function public.lead_check_commit(uuid, uuid, jsonb, numeric, boolean) is
  'A batch of mailbox answers ([{lead_id, email_state, checked_at}]) from the check run p_run_id: each lead''s state is set (never a blanked or erased one); a member of the round held in review by the email standard alone, whose address now checks out, is Qualified -- counted through the round''s reservation while the round runs, and through the month''s allowance the way Keep is once the round has ended (Check again, 00145; it stays in review when the month is full). The run''s usage settles by its total so far (E4). p_last ends the round with the ending left pending, or by its target. Returns {ok, qualified, counted, ended}.';

/* ----------------------------------------------------- lead_bulk, from 00142 -- */

-- The four-argument lead_bulk goes: with both declared, a call naming the four would be ambiguous.
drop function if exists public.lead_bulk(uuid, text, uuid[], jsonb);
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

  -- The same rows the page would show: the selection, or the view's filters
  -- with no paging. lead_in_list holds the list rule for both.
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
       and (m.class <> 'qualified' or m.counted)
       and public.lead_in_list(l.stage, l.closed_reason, coalesce(p_view->>'list', 'all'))
       and m.blanked_at is null and l.blanked_at is null and l.erased_at is null;
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
  'Operator for contacted and not_a_fit; owner (permission find) for keep and exclude, which go through lead_member_move once per lead in review -- in the search named, else the lead''s newest -- and stop when the month''s leads run out ({error: month_leads_used} beside what was done). Marks many leads contacted, or not a fit: the ids the owner selected, or every lead the view matches (the same filters leads_page reads, with no paging), never both. One lead_operations row (kind bulk) holds every id with what it was and the version this act leaves it at, so lead_undo restores the rows nobody touched since and says how many it kept. Returns {done, op_id, version}.';
revoke execute on function public.lead_bulk(uuid, text, uuid[], jsonb, uuid) from public, anon;
grant  execute on function public.lead_bulk(uuid, text, uuid[], jsonb, uuid) to authenticated;

/* --------------------------------------------------------- lead_check_again -- */

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
  -- One job per round the leads were found in: the re-check runs under the round, as the round's own checks
  -- did, and commits through lead_check_commit. Only an address whose last check did not answer is asked
  -- again; a lead whose search is still running is left to that search's own checks; a lead with no address
  -- has nothing to check; and a lead of another workspace is not this owner's to ask about.
  for v_r in
    select m.round_id, array_agg(m.lead_id) as lead_ids
      from (
        select distinct on (m.lead_id) m.lead_id, m.round_id
          from unnest(p_lead_ids) as x(id)
          join public.leads l on l.id = x.id and l.tenant_id = p_tenant_id and l.erased_at is null and l.blanked_at is null
          join public.lead_search_members m on m.lead_id = l.id and m.tenant_id = p_tenant_id and m.class = 'review' and m.blanked_at is null
          join public.lead_rounds r on r.id = m.round_id and r.state = 'ended'
         where l.email is not null and l.email_state = 'unknown'
         order by m.lead_id, r.created_at desc
      ) m
     group by m.round_id
  loop
    update public.leads set email_state = 'checking' where id = any (v_r.lead_ids);
    insert into public.jobs (tenant_id, kind, due_at, payload)
    values (p_tenant_id, 'lead_check', now(),
            jsonb_build_object('round_id', v_r.round_id, 'batch', 0, 'again', gen_random_uuid()::text, 'lead_ids', to_jsonb(v_r.lead_ids)));
    v_ids := v_ids || v_r.lead_ids;
  end loop;
  return jsonb_build_object('scheduled', cardinality(v_ids), 'skipped', cardinality(p_lead_ids) - cardinality(v_ids));
end $$;
comment on function public.lead_check_again(uuid, uuid[]) is
  'Owner (permission find). Asks the mailbox check again for the named leads whose last check did not answer (email_state unknown), once their search has finished: each goes to checking and one lead_check job per round is written with {round_id, batch 0, again <nonce>, lead_ids}, so the engine runs it under the round with a run id of its own and commits through lead_check_commit. {error: paused} while searching is off. Returns {scheduled, skipped}.';
revoke execute on function public.lead_check_again(uuid, uuid[]) from public, anon;
grant  execute on function public.lead_check_again(uuid, uuid[]) to authenticated;

/* ------------------------------------------- lead_searches_view, from 00142 -- */

create or replace view public.lead_searches_view with (security_invoker = true) as
select s.id, s.tenant_id, s.created_by, s.via, s.card, s.name, s.asked, s.plan, s.removed_at, s.created_at,
       r.id as round_id, r.seq, r.purpose, r.state, r.ending, r.ending_pending, r.question, r.answered, r.target,
       r.plan_version, r.judge_tokens, r.cost_usd, r.waiting_since, r.ended_at,
       coalesce(c.qualified, 0) as qualified, coalesce(c.review, 0) as review, coalesce(c.excluded, 0) as excluded,
       coalesce(c.counted, 0) as counted, coalesce(c.emails_checked, 0) as emails_checked, coalesce(c.with_phone, 0) as with_phone,
       u.id as undo_op_id, u.version as undo_version,
       coalesce(r.nearby, '[]'::jsonb) as nearby
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
           count(*) filter (where m.class = 'qualified' and m.blanked_at is null and l.phone_e164 is not null and not l.phone_wrong) as with_phone
      from public.lead_search_members m join public.leads l on l.id = m.lead_id where m.search_id = s.id
  ) c on true
  left join lateral (
    select o.id, o.version from public.lead_operations o
     where o.search_id = s.id and o.kind = 'undo_search' and o.undone_at is null and o.at > now() - interval '24 hours'
     order by o.at desc limit 1
  ) u on true;
comment on view public.lead_searches_view is
  'Every column of lead_searches with its latest round (round_id, seq, purpose, state, ending, ending_pending, question, answered, target, plan_version, judge_tokens, cost_usd -- what that round has spent, so cost per Qualified lead is read from here -- waiting_since and ended_at) and its counts over the members: qualified, review, excluded, counted, emails_checked (a qualified lead whose address was checked and answered) and with_phone (a qualified lead with a number nobody has marked wrong). Excluded members stay counted after their details are blanked, so "40 left out" stays 40. undo_op_id and undo_version name the operation this search''s Undo takes while its twenty-four hours run, and are null once it is undone or the day is out. nearby (00145): where to look next when the round ran dry, the nearest ZIP centres past its area, nearest first; [] otherwise.';
revoke all on public.lead_searches_view from public, anon;
grant select on public.lead_searches_view to authenticated, service_role;

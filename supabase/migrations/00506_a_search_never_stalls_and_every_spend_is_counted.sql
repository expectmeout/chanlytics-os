-- 00506: A search never stalls or says what is not true, and every spend is counted where it happens (the lead finder's
-- end-to-end refinement, lanes 1 and 2: Claude Video/docs/2026-11-03-lead-finder-prd.md).
--
--   lead_rounds.state_since    when the round last moved, set by lead_rounds_guard; the lead sweep measures a quiet
--                              round from it (00140 measured from created_at, so a round an hour old was ended in the
--                              seconds between two of its steps)
--   lead_rounds.judge_usd      what judging the round cost, settled by lead_round_end from the usage ledger
--   lead_runs.already_yours    the places a run read and paid for that the workspace already held
--   lead_collect_commit        its next job may be the round's checks (batch 0 unless named; 00237 defaulted a missing
--                              batch to 1) or the main phase's start, each under the dedupe key packages/jobs writes;
--                              a re-check's usage after its round ended settles in the month and day it ran
--   lead_round_end             settles the judge's dollars, and leaves no address of the round 'checking'
--   lead_round_end_stuck       the sweep's ending of a round nothing can carry on, proved under the round's lock
--   lead_spend_room            whether this month's and today's searching has room for an amount, reserving nothing
--   lead_check_estimate        what checking n addresses may cost: contracts' price with its room
--   lead_check_ask             asks a check only with room (now boolean); lead_check_again and lead_addressee_choose
--                              say so
--   lead_check_commit          a re-check after its round ended settles in the month and day it ran
--   lead_rounds_notify         a search that ended waiting a day on its question rings, and says so
--   lead_platform.prices       what each lead source charged when the daily price watch last read it
--
-- Every statement is re-runnable. Apply it before the edge that writes the new `next` kinds deploys: 00237's commit
-- takes a `lead_round_start` next for a collect. The edge already deployed works over it unchanged: it schedules its
-- own follow-ups after the commit, as before, and the new columns have defaults it never reads.

-- ------------------------------------------------------------------ the columns

-- A default rather than a backfill: lead_rounds_guard refuses a change to an ended round, and an open round only needs
-- a moment it stood since; the sweep first carries one on ten minutes after this ran.
alter table public.lead_rounds add column if not exists state_since timestamptz not null default now();
comment on column public.lead_rounds.state_since is
  'When the round last moved (00506): set by lead_rounds_guard on every change of state. The lead sweep carries a round quiet since then on (core nextStepOf), and ends one nothing can carry on through lead_round_end_stuck.';

alter table public.lead_rounds add column if not exists judge_usd numeric(10,4) not null default 0;
comment on column public.lead_rounds.judge_usd is
  'What judging the round cost (00506): the usage ledger''s lead_judge rows under the round (its judge, and the second model that screens or shadows it), settled by lead_round_end against the month''s budget and both days.';

alter table public.lead_runs add column if not exists already_yours integer not null default 0;
comment on column public.lead_runs.already_yours is
  'Places the run read and paid for that the workspace already held, skipped as yours (00506): what a main phase pays again for its probe''s places, measured before anything is changed for it.';

-- What each lead source charged when the price watch last read it (apps/edge/lib/leads/lead-sources.ts
-- watchLeadPrices, once a day from the health sweep), beside 00140's prices_checked_at, which nothing wrote until now.
alter table public.lead_platform add column if not exists prices jsonb not null default '{}'::jsonb;
comment on column public.lead_platform.prices is
  'Each lead source''s event prices by actor and event, as the price watch last read them (00506): the baseline the next daily read is compared with, a rise past a tenth or a new charge paged to the platform, since the cards'' prices (contracts LEAD_CARDS) and the SQL ceiling are written by hand.';

-- The judge's rows of one round, summed once when it ends.
create index if not exists ai_usage_lead_judge_subject on public.ai_usage (subject_id) where purpose = 'lead_judge';

-- ------------------------------------------------------------------ the guard

create or replace function public.lead_rounds_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if TG_OP = 'INSERT' then
    if NEW.state <> 'queued' then
      raise exception 'a round starts queued (% refused)', NEW.state;
    end if;
    if exists (select 1 from public.lead_rounds r where r.search_id = NEW.search_id and r.state <> 'ended') then
      raise exception 'one live round per search';
    end if;
    -- Carry on, Try again, a top-up and Find new ones make a NEW round from an
    -- ended one, and only a signed-in person may: the edge and the sweep hold
    -- the service key, and they never revive a search (§12.3).
    if NEW.seq > 1 and auth.uid() is null then
      raise exception 'only a signed-in person may start a round after an ended one';
    end if;
    return NEW;
  end if;
  if OLD.state = 'ended' then
    raise exception 'a round is final once ended (% refused)', case when NEW.state is distinct from OLD.state then NEW.state else 'a change' end;
  end if;
  if NEW.state is distinct from OLD.state then
    if not (
         (OLD.state = 'queued'           and NEW.state in ('probing', 'running', 'ended'))
      or (OLD.state = 'probing'          and NEW.state in ('waiting_on_owner', 'running', 'checking', 'ended'))
      or (OLD.state = 'waiting_on_owner' and NEW.state in ('running', 'ended'))
      or (OLD.state = 'running'          and NEW.state in ('checking', 'ended'))
      or (OLD.state = 'checking'         and NEW.state in ('ended'))
    ) then
      raise exception 'lead_rounds.state % -> % refused', OLD.state, NEW.state;
    end if;
    -- When the round last moved (00506): what the lead sweep measures a quiet round from.
    NEW.state_since := now();
  end if;
  -- The plan a round runs is the plan it ran, except the one amendment
  -- Include makes while the round waits (§0.5 the only in-place change).
  if NEW.plan is distinct from OLD.plan or NEW.plan_version is distinct from OLD.plan_version then
    if OLD.state <> 'waiting_on_owner' or NEW.plan_version <> OLD.plan_version + 1 then
      raise exception 'a round''s plan changes only while it waits on the owner, as the next version';
    end if;
  end if;
  return NEW;
end $$;

-- ------------------------------------------------------------------ the room a spend needs

create or replace function public.lead_spend_room(p_tenant_id uuid, p_usd numeric)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.lead_counters;
begin
  -- lead_reserve's three dollar caps, in its lock order, in this month and today, reserving nothing: for a spend of
  -- cents that settles as it runs (a mailbox check asked again), which a search's reservation does not hold.
  v := public.lead_counter_take(p_tenant_id, 'budget', public.lead_month(p_tenant_id, now()));
  if v.used + v.reserved + p_usd > public.lead_cap('month_usd') then
    return jsonb_build_object('error', 'budget_used',
      'sentence', 'This month''s searching is used up. It renews on ' || public.lead_renews_on(p_tenant_id) || '.');
  end if;
  v := public.lead_counter_take(p_tenant_id, 'day', public.lead_day(p_tenant_id, now()));
  if v.used + v.reserved + p_usd > public.lead_cap('day_usd') then
    return jsonb_build_object('error', 'day_cap', 'sentence', 'Today''s searching is used up. Try again tomorrow.');
  end if;
  v := public.lead_counter_take(null, 'day', to_char(now() at time zone 'UTC', 'YYYY-MM-DD'));
  if v.used + v.reserved + p_usd > public.lead_cap('platform_day_usd') then
    return jsonb_build_object('error', 'day_cap', 'sentence', 'Searching is busy today. Try again tomorrow.');
  end if;
  return null;
end $$;

revoke all on function public.lead_spend_room(uuid, numeric) from public, anon, authenticated;
grant execute on function public.lead_spend_room(uuid, numeric) to service_role;
comment on function public.lead_spend_room(uuid, numeric) is
  'Whether this month''s budget, the workspace''s day and the platform''s day each have room for p_usd (00506), in lead_reserve''s lock order and with its caps (lead_cap), reserving nothing: null when they do, else {error: budget_used | day_cap, sentence}. For a spend of cents that settles as it runs, a mailbox check asked again (lead_check_ask). Service role and definer doors only.';

create or replace function public.lead_check_estimate(p_addresses integer)
returns numeric
language sql
immutable
set search_path = public
as $$
  -- Contracts' checkPerEmailUsd (0.00089) with LEAD_ESTIMATE_MARGIN (1.3), as the checker's cap reads them
  -- (core check.ts checkerCapOf); lead-check-price.test.mjs holds the two to each other.
  select round(greatest(coalesce(p_addresses, 0), 0) * 0.00089 * 1.3, 4)
$$;

revoke all on function public.lead_check_estimate(integer) from public, anon, authenticated;
grant execute on function public.lead_check_estimate(integer) to service_role;
comment on function public.lead_check_estimate(integer) is
  'What checking p_addresses addresses may cost (00506): contracts'' price an address with the estimate''s room, held to them by lead-check-price.test.mjs.';

-- 00430 answered nothing; a check now goes only where there is room, and its callers say so.
drop function if exists public.lead_check_ask(uuid, uuid, uuid[]);
create function public.lead_check_ask(p_tenant_id uuid, p_round_id uuid, p_lead_ids uuid[])
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if cardinality(coalesce(p_lead_ids, '{}'::uuid[])) = 0 then
    return false;
  end if;
  -- The check is money (00506): asked only with room in this month's and today's searching, as a search is.
  if public.lead_spend_room(p_tenant_id, public.lead_check_estimate(cardinality(p_lead_ids))) is not null then
    return false;
  end if;
  update public.leads set email_state = 'checking'
   where tenant_id = p_tenant_id and id = any (p_lead_ids) and email_state <> 'checking';
  insert into public.jobs (tenant_id, kind, due_at, payload)
  values (p_tenant_id, 'lead_check', now(),
          jsonb_build_object('round_id', p_round_id, 'batch', 0, 'again', gen_random_uuid()::text,
                             'lead_ids', to_jsonb(p_lead_ids)));
  return true;
end $$;

revoke all on function public.lead_check_ask(uuid, uuid, uuid[]) from public, anon, authenticated;
grant execute on function public.lead_check_ask(uuid, uuid, uuid[]) to service_role;
comment on function public.lead_check_ask(uuid, uuid, uuid[]) is
  'The mailbox check of the named leads under one of their rounds (00430): each goes to checking and one lead_check job is written with {round_id, batch 0, again <nonce>, lead_ids}, run by the engine under the round with a run id of its own and committed through lead_check_commit. Asked only with room in this month''s and today''s searching (00506, lead_spend_room for lead_check_estimate): true when asked, false when there is none, and then nothing is written. The one writer of such a job: Check again (lead_check_again) and the addressee chosen (lead_addressee_choose) call it, having read the caller, the switch and the spend. Service role only.';

-- ------------------------------------------------------------------ the sweep's ending

create or replace function public.lead_round_end_stuck(p_round_id uuid, p_since timestamptz, p_ending text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.lead_rounds;
begin
  -- The sweep read the round, its runs and their jobs in three reads: under the round's own lock, look again.
  select * into r from public.lead_rounds where id = p_round_id for update;
  if not found or r.state in ('ended', 'waiting_on_owner') or r.state_since is distinct from p_since then
    return false;
  end if;
  if exists (select 1 from public.lead_runs x
              where x.round_id = p_round_id and x.state in ('claimed', 'starting', 'running', 'unknown')) then
    return false;
  end if;
  if exists (select 1 from public.jobs j
              where j.tenant_id = r.tenant_id and j.state in ('scheduled', 'fired')
                and ((j.kind in ('lead_round_start', 'lead_check') and j.payload->>'round_id' = p_round_id::text
                      and j.payload->>'again' is null)
                  or (j.kind = 'lead_collect'
                      and j.payload->>'run_id' in (select x.id::text from public.lead_runs x where x.round_id = p_round_id)))) then
    return false;
  end if;
  -- The ending it had pending is the true one; the sweep's is only for a round that had none.
  return public.lead_round_end(p_round_id, coalesce(r.ending_pending, p_ending));
end $$;

revoke all on function public.lead_round_end_stuck(uuid, timestamptz, text) from public, anon, authenticated;
grant execute on function public.lead_round_end_stuck(uuid, timestamptz, text) to service_role;
comment on function public.lead_round_end_stuck(uuid, timestamptz, text) is
  'The lead sweep''s ending of a round nothing can carry on (00506, core nextStepOf): under the round''s lock it ends it only while it has not moved since p_since, waits on no question, has no run at the provider and no job of its own on its way, and then with the ending it had pending, else p_ending. True when it ended it. Service role only.';

-- ------------------------------------------------------------------ the doors made again

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
                                website_host, website_root, instagram_url, phone_e164, phone_sources, phone_wrong, email, email_alternates, email_state, rating, reviews,
                                about, hours, image_url, price, reviews_dist, facebook_url, linkedin_url, tiktok_url, claimed, maps_url, rank, neighborhood, logo_url, mark_path)
      values (v_round.tenant_id, v_pl->>'place_id', coalesce(left(v_pl->>'business_name', 200), ''), left(v_pl->>'category', 120),
              left(v_pl->>'street', 200), left(v_pl->>'city', 120), left(v_pl->>'region', 40), left(v_pl->>'postal_code', 20),
              coalesce(v_pl->>'country', 'US'), (v_pl->>'lat')::double precision, (v_pl->>'lng')::double precision,
              left(v_pl->>'website_host', 120), (v_pl->>'website_root')::boolean, left(v_pl->>'instagram_url', 200), v_pl->>'phone_e164',
              coalesce((v_pl->>'phone_sources')::smallint, 0), coalesce((v_pl->>'phone_wrong')::boolean, false),
              v_pl->>'email', coalesce(v_pl->'email_alternates', '[]'::jsonb), coalesce(v_pl->>'email_state', 'none'),
              (v_pl->>'rating')::numeric, (v_pl->>'reviews')::integer,
              left(v_pl->>'about', 600), coalesce(v_pl->'hours', '[]'::jsonb), left(v_pl->>'image_url', 500), left(v_pl->>'price', 8),
              v_pl->'reviews_dist', left(v_pl->>'facebook_url', 300), left(v_pl->>'linkedin_url', 300), left(v_pl->>'tiktok_url', 300),
              (v_pl->>'claimed')::boolean, left(v_pl->>'maps_url', 500), (v_pl->>'rank')::integer, left(v_pl->>'neighborhood', 120), left(v_pl->>'logo_url', 500),
              -- The copy we keep (00161): its name, when it is one of ours; anything else is no copy at all.
              case when v_pl->>'mark_path' ~ '^[0-9a-f]{64}\.(png|jpg|webp|gif|ico)$' then v_pl->>'mark_path' end)
      -- A place already here keeps its worked state and gains what this listing shows where it had none (D2):
      -- these columns and nothing else, so a lead's stage, its email state and its version are untouched. Whether its
      -- website is its host's root (00237) is one of them: a lead found before it was kept learns it when found again.
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
        mark_path    = coalesce(public.leads.mark_path, excluded.mark_path),
        website_root = coalesce(public.leads.website_root, excluded.website_root);
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
    if v_round.state = 'ended' then
      -- A re-check after its round ended is spent when it runs (00506): this month's budget and today's two days,
      -- which its door asked for room in (lead_check_ask), never the round's own, long given back.
      perform public.lead_settle_usage(v_round.tenant_id, public.lead_month(v_round.tenant_id, now()),
        public.lead_day(v_round.tenant_id, now()), to_char(now() at time zone 'UTC', 'YYYY-MM-DD'), v_delta, 0);
    else
      perform public.lead_settle_usage(v_round.tenant_id, v_month, v_round.day, v_round.platform_day, v_delta,
        v_round.cost_reserved_usd - v_round.cost_usd);
    end if;
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
         -- The places it read and paid for that the workspace already held (00506), so what a main phase pays twice
         -- for its probe's places can be measured.
         already_yours = already_yours + greatest(coalesce((p_page->>'already_yours')::integer, 0), 0),
         state       = coalesce(p_page->>'run_state', state),
         finished_at = case when coalesce(p_page->>'run_state', state) in ('succeeded', 'failed', 'aborted', 'timed_out') then coalesce(finished_at, now()) else finished_at end
   where id = p_run_id;
  v_next := p_page->'next';
  if v_next is not null and jsonb_typeof(v_next) = 'object' then
    if v_next->>'kind' = 'lead_check' then
      -- The round's checks, written with the move that sends it to them (00506, PRD §0.5): batch 0 unless one is named,
      -- under the key packages/jobs writes, so the sweep carrying the round on beside this job checks the batch once.
      insert into public.jobs (tenant_id, kind, due_at, payload, dedupe_key)
      values (v_round.tenant_id, 'lead_check', now() + make_interval(secs => coalesce((v_next->>'run_after_seconds')::integer, 0)),
              jsonb_build_object('round_id', v_round.id, 'batch', coalesce((v_next->>'batch')::integer, 0)),
              'lead_check:' || v_round.id || ':round:' || coalesce((v_next->>'batch')::integer, 0))
      on conflict do nothing;
    elsif v_next->>'kind' = 'lead_round_start' then
      -- The main phase, written with the probe's pass (00506), as lead_round_answer writes it with an answer.
      insert into public.jobs (tenant_id, kind, due_at, payload, dedupe_key)
      values (v_round.tenant_id, 'lead_round_start', now() + make_interval(secs => coalesce((v_next->>'run_after_seconds')::integer, 0)),
              jsonb_build_object('round_id', v_round.id, 'resume', true),
              'lead_round_start:' || v_round.id)
      on conflict do nothing;
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

create or replace function public.lead_round_end(p_round_id uuid, p_ending text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  r       public.lead_rounds;
  v_judge numeric := 0;
  v_out   numeric;
  v_take  numeric;
begin
  if p_ending not in ('target_reached', 'searched_everything', 'month_leads_used', 'budget_used', 'few_new_matches', 'stopped', 'source_failed', 'question_unanswered', 'paused') then
    raise exception 'not one of the nine endings: %', p_ending using errcode = '22023';
  end if;
  select * into r from public.lead_rounds where id = p_round_id for update;
  if not found or r.state = 'ended' then
    return false;
  end if;
  -- What judging the round cost (00506, PRD §0.2: the budget bounds judging too): every call of its judge and of the
  -- second model that screens or shadows it, as the usage ledger keeps them under the round. It is settled as used in
  -- the round's month and days, out of what the round still had reserved, and only the rest goes back.
  select coalesce(sum(u.usd), 0) into v_judge
    from public.ai_usage u
   where u.purpose = 'lead_judge' and u.subject_id = p_round_id and u.tenant_id = r.tenant_id;
  v_out  := greatest(r.cost_reserved_usd - r.cost_usd, 0);
  v_take := least(v_judge, v_out);
  update public.lead_rounds
     set state = 'ended', ending = p_ending, ended_at = now(), waiting_since = null, judge_usd = v_judge
   where id = p_round_id;
  if v_judge > 0 then
    perform public.lead_settle_usage(r.tenant_id, r.month, r.day, r.platform_day, v_judge, v_take);
  end if;
  perform public.lead_release(r.tenant_id, r.month, r.day, r.platform_day,
    greatest(r.allowance_reserved - r.allowance_used, 0), v_out - v_take);
  -- No address of the round is left waiting for a check that will never come (00506): one still 'checking' when its
  -- round ends (a question unanswered, a stop, a round the sweep had to end) did not answer, so Check again can take
  -- it. One another live round of its is still checking is left to that round.
  update public.leads l
     set email_state = 'unknown', email_checked_at = coalesce(l.email_checked_at, now())
   where l.tenant_id = r.tenant_id and l.email_state = 'checking'
     and exists (select 1 from public.lead_search_members m where m.round_id = p_round_id and m.lead_id = l.id)
     and not exists (select 1 from public.lead_search_members o
                       join public.lead_rounds x on x.id = o.round_id
                      where o.lead_id = l.id and x.id <> p_round_id and x.state <> 'ended');
  insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
  values (r.tenant_id, 'lead.round', 'lead', 'lead_round', p_round_id,
          jsonb_build_object('search_id', r.search_id, 'seq', r.seq, 'state', 'ended', 'ending', p_ending,
                             'counted', r.allowance_used, 'cost_usd', r.cost_usd, 'judge_usd', v_judge));
  return true;
end $$;

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
      if v_counter.used + v_counter.reserved + 1 > public.lead_cap('month_leads') then
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
      if v_round.state = 'ended' then
        -- A re-check after its round ended is spent when it runs (00506), as lead_collect_commit settles it.
        perform public.lead_settle_usage(v_round.tenant_id, public.lead_month(v_round.tenant_id, now()),
          public.lead_day(v_round.tenant_id, now()), to_char(now() at time zone 'UTC', 'YYYY-MM-DD'), v_delta, 0);
      else
        perform public.lead_settle_usage(v_round.tenant_id, v_round.month, v_round.day, v_round.platform_day, v_delta,
          v_round.cost_reserved_usd - v_round.cost_usd);
      end if;
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

create or replace function public.lead_addressee_choose(p_lead_id uuid, p_person integer)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $$
declare
  v_user   uuid := auth.uid();
  v_lead   public.leads%rowtype;
  v_people jsonb;
  v_was    integer;
  v_to     jsonb;
  v_email  text;
  v_kept   jsonb;
  v_state  text;
  v_at     timestamptz;
  v_round  uuid;
  v_ended  boolean;
  v_err    jsonb;
begin
  if v_user is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  -- Whose it is, then the lead locked: a lead of a workspace the caller may not find leads in is never held.
  select * into v_lead from public.leads where id = p_lead_id;
  if not found or not public.has_permission(v_user, v_lead.tenant_id, 'find') then
    raise exception 'Lead not found.' using errcode = 'P0002';
  end if;
  select * into v_lead from public.leads where id = p_lead_id for update;
  if v_lead.erased_at is not null or v_lead.blanked_at is not null then
    return jsonb_build_object('error', 'gone');
  end if;
  if v_lead.kind <> 'company' then
    return jsonb_build_object('error', 'not_a_company');
  end if;
  v_people := case when jsonb_typeof(v_lead.facts->'people') = 'array' then v_lead.facts->'people' else '[]'::jsonb end;
  v_was := case when jsonb_typeof(v_lead.facts->'addressee') = 'number' then (v_lead.facts->>'addressee')::integer end;
  if p_person is null or p_person < 0 or p_person >= jsonb_array_length(v_people)
     or jsonb_typeof(v_people->p_person) is distinct from 'object' then
    return jsonb_build_object('error', 'no_person');
  end if;
  if p_person = v_was then
    return jsonb_build_object('error', 'already');
  end if;
  if v_lead.stage not in ('ready', 'nurture') or v_lead.closed_reason is not null or v_lead.contact_id is not null then
    return jsonb_build_object('error', 'closed');
  end if;
  if v_lead.contacted_at is not null then
    return jsonb_build_object('error', 'written');
  end if;
  if exists (select 1 from public.sequence_sends s
              where s.lead_id is not null and ( s.tenant_id = v_lead.tenant_id and s.lead_id = v_lead.id
                and not (s.state = 'skipped' and s.reason in ('run_canceled', 'owner_took_back')))) then
    return jsonb_build_object('error', 'in_reach_out');
  end if;
  if v_lead.email_state = 'checking' then
    return jsonb_build_object('error', 'checking');
  end if;

  v_to := v_people->p_person;
  v_email := lower(btrim(coalesce(v_to->>'email', '')));
  if v_email = '' or char_length(v_email) > 254 or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    return jsonb_build_object('error', 'no_address');
  end if;
  if public.lead_address_suppressed(v_lead.tenant_id, v_email) then
    return jsonb_build_object('error', 'suppressed');
  end if;
  if public.lead_address_in_people(v_lead.tenant_id, v_email) then
    return jsonb_build_object('error', 'in_people');
  end if;
  -- One business written to once: an address another lead holds is that lead's.
  if exists (select 1 from public.leads l
              where l.tenant_id = v_lead.tenant_id and l.id <> v_lead.id and l.email = v_email
                and l.erased_at is null and l.blanked_at is null) then
    return jsonb_build_object('error', 'address_taken');
  end if;

  -- The check their address had while they were its addressee before, if it was this address and is under thirty days.
  v_kept := v_to->'check';
  if jsonb_typeof(v_kept) = 'object' and v_kept->>'email' = v_email
     and v_kept->>'state' in ('ok', 'catch_all', 'invalid')
     and coalesce(v_kept->>'at', '') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}' then
    v_at := (v_kept->>'at')::timestamptz;
    if v_at > now() - interval '30 days' then
      v_state := v_kept->>'state';
    else
      v_at := null;
    end if;
  end if;
  if v_state = 'invalid' then
    return jsonb_build_object('error', 'invalid');
  end if;

  if v_state is null then
    -- The switch and the spend, read before anything is asked of the provider (§0.5): the mailbox check is money too.
    if not public.lead_searches_on(v_lead.tenant_id) then
      return jsonb_build_object('error', 'paused');
    end if;
    v_err := public.lead_spend_refusal(v_lead.tenant_id);
    if v_err is not null then
      return v_err;
    end if;
    -- A check runs under a round: the lead's last, once it has ended (a search still running checks its own).
    select r.id, r.state = 'ended' into v_round, v_ended
      from public.lead_search_members m
      join public.lead_rounds r on r.id = m.round_id
     where m.tenant_id = v_lead.tenant_id and m.lead_id = v_lead.id and m.blanked_at is null
     order by r.created_at desc
     limit 1;
    if v_round is null then
      return jsonb_build_object('error', 'no_round');
    end if;
    if not v_ended then
      return jsonb_build_object('error', 'searching');
    end if;
  end if;

  -- The person it leaves keeps the check their address had, for a choice back.
  if v_was is not null and v_was < jsonb_array_length(v_people) and jsonb_typeof(v_people->v_was) = 'object'
     and v_lead.email is not null and v_lead.email_state in ('ok', 'catch_all', 'invalid')
     and v_lead.email_checked_at is not null then
    v_people := jsonb_set(v_people, array[v_was::text, 'check'],
                          jsonb_build_object('email', v_lead.email, 'state', v_lead.email_state,
                                             'at', v_lead.email_checked_at));
  end if;
  update public.leads
     set email = v_email,
         email_state = coalesce(v_state, 'checking'),
         email_checked_at = v_at,
         facts = jsonb_set(jsonb_set(facts, '{people}', v_people), '{addressee}', to_jsonb(p_person)),
         version = version + 1
   where id = v_lead.id;
  -- Its check, asked only with room in this month's and today's searching (00506); without it the address waits as not
  -- checked, for Check again once there is.
  if v_state is null and not public.lead_check_ask(v_lead.tenant_id, v_round, array[v_lead.id]) then
    v_state := 'unknown';
    update public.leads set email_state = 'unknown' where id = v_lead.id;
  end if;
  insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
  values (v_lead.tenant_id, 'lead.addressee_chosen', 'lead', 'lead', v_lead.id,
          jsonb_build_object('person', p_person, 'checking', v_state is null, 'by', v_user));
  return jsonb_build_object('ok', true, 'addressee', p_person, 'email_state', coalesce(v_state, 'checking'),
                            'version', v_lead.version + 1);
end $$;

create or replace function public.lead_rounds_notify() returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
  v_via  text;
  v_n    integer;
  v_seen boolean;
  v_id   uuid;
begin
  -- A round that leaves waiting_on_owner has settled its question for good (a round waits on its owner once): its row
  -- closes, for a list and a chosen search too, so this comes before the returns below (00421).
  if OLD.state = 'waiting_on_owner' and NEW.state is distinct from 'waiting_on_owner' then
    perform public.notifications_close_about(NEW.tenant_id, array['leads_question'], 'lead_round', NEW.id::text);
  end if;
  select s.name, s.via into v_name, v_via from public.lead_searches s where s.id = NEW.search_id;
  if v_name is null then return null; end if;
  -- A list: a file rings once its check ran; a choice never rings (00242).
  if v_via = 'chosen' or (v_via = 'import' and coalesce(OLD.state, '') <> 'checking') then return null; end if;
  if NEW.state = 'waiting_on_owner' and coalesce(OLD.state, '') <> 'waiting_on_owner' then
    insert into public.notifications (tenant_id, kind, title, body, route, subject_type, subject_id)
    select NEW.tenant_id, 'leads_question', left('Your search for ' || v_name || ' is waiting for your answer', 200),
           coalesce(NEW.question->>'sentence', ''), 'clients/leads:s-' || NEW.search_id::text || ':c-excluded', 'lead_round', NEW.id::text
     where not exists (select 1 from public.notifications n
                        where n.tenant_id = NEW.tenant_id and n.kind = 'leads_question' and n.subject_id = NEW.id::text)
    returning id into v_id;
  elsif NEW.state = 'ended' and coalesce(OLD.state, '') <> 'ended' and coalesce(NEW.ending, '') <> 'stopped' then
    select count(*)::integer into v_n from public.lead_search_members m
     where m.round_id = NEW.id and m.class = 'qualified' and m.blanked_at is null;
    -- Whether the source returned anything at all, in any class: the strip's "seen" (00491).
    select exists (select 1 from public.lead_search_members m where m.round_id = NEW.id) into v_seen;
    insert into public.notifications (tenant_id, kind, title, body, route, subject_type, subject_id)
    select NEW.tenant_id, 'leads_ready',
           case when v_via = 'import' then
                  case when NEW.ending in ('target_reached', 'searched_everything') then left('Your list ' || v_name || ' is checked', 200)
                       else left('Your list ' || v_name || ' could not be checked', 200) end
                when NEW.ending = 'source_failed' and not v_seen then
                  left('Your search for ' || v_name || ' didn''t run: the source couldn''t start it', 200)
                when NEW.ending = 'question_unanswered' then
                  left('Your search for ' || v_name || ' ended: it waited a day for your answer', 200)
                when NEW.ending = 'source_failed' then
                  left('Your search for ' || v_name || ' stopped: the source stopped answering', 200)
                else left('Your search for ' || v_name || ' is done', 200) end,
           case when v_via <> 'import' then case when v_n > 0 then v_n || ' found.' else 'Nothing new was counted.' end
                when NEW.ending not in ('target_reached', 'searched_everything') then 'Its addresses wait in Needs review.'
                when v_n > 0 then v_n || ' have a checked address.' else 'None of the addresses checked out.' end,
           'clients/leads:s-' || NEW.search_id::text, 'lead_round', NEW.id::text
     where not exists (select 1 from public.notifications n
                        where n.tenant_id = NEW.tenant_id and n.kind = 'leads_ready' and n.subject_id = NEW.id::text)
    returning id into v_id;
  end if;
  -- The phone hears what the bell hears (00162's push_send, payload { notification_id }).
  if v_id is not null then
    insert into public.jobs (tenant_id, kind, due_at, payload)
    values (NEW.tenant_id, 'push_send', now(), jsonb_build_object('notification_id', v_id));
  end if;
  return null;
end $$;

comment on function public.lead_round_end(uuid, text) is
  'Ends a round with one of the nine endings: state ended, ended_at, the judge''s dollars settled (00506: the usage ledger''s lead_judge rows under the round, as used, out of what it still had reserved), what it reserved and did not use back to the counters, and every address of the round still checking set unknown, so Check again can take it. True once; false when already ended.';
comment on function public.lead_rounds_guard() is
  'queued -> probing | running | ended; probing -> waiting_on_owner | running | checking | ended; waiting_on_owner -> running | ended; running -> checking | ended; checking -> ended; ended is final. One live round per search; a later round needs a signed-in person; the plan changes only while waiting, as version + 1. Every change of state stamps state_since (00506).';

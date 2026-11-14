-- A search widens until its count (decision 0133, step 3; Ruben, 14 Nov 2026: "Yes, all five").
--
-- A search for 300 that runs dry in its area ended there, and its nearby areas were a button the owner pressed. Now,
-- where the platform widens for the workspace, the round's end opens the search's next leg by itself: a round of
-- purpose 'widen' on the first area the round named (lead_rounds.nearby, which the runner now fills from the distance
-- ladder: the nearest ZIP areas past every area read, inside the reach on the card), for what the count still wants,
-- reserved through lead_reserve as any round, and started by lead_round_start. It stops on nothing more within reach
-- (no rung left, eight legs, or the last two legs adding fewer than three leads: reach_searched, never a claim that no
-- more exist), the month's leads, the month's
-- searching, or the day's (a new ending, day_used, with Carry on).
--
--   lead_rounds          purpose takes 'widen'; ending and ending_pending take 'reach_searched' and 'day_used';
--                        carries_on: the round opened the next leg, so its end rings nothing
--   lead_platform        widen_on, the switch for everyone, and widen_tenants, the workspaces it is on for while off
--   lead_search_widens   whether a workspace's searches widen: the round's end and the plan card read the one rule
--   lead_round_end       settles and releases first, then opens the next leg or names why the search stops
--   lead_rounds_guard    a leg is the one later round made without a signed-in person
--   lead_search_more     a top-up of a search that read everything within its reach, with a wider reach, carries on
--                        from the first area its last round found past it, as a leg
--   lead_search_on_renewal  a search the month's leads stopped carries on when they renew, reserved from that month
--                        now (lead_rounds.starts_at says when)
--   lead_rounds_notify   a round that carries on rings nothing; the one that ends a widened search counts every leg's
--                        finished leads, and an ending short of its count says why in its title
--
-- Each function is re-created whole from its newest body (00506's lead_round_end and lead_rounds_guard, 00491's
-- lead_rounds_notify) with only that changed; grants and comments stand but lead_round_end's, which said nine endings.
-- Ships off for everyone: nothing changes until lead_platform says so. Deploy order: either; a runner without the
-- ladder writes the three nearest areas as before, which a leg reads the same. Re-runnable.

set local lock_timeout = '3s';

alter table public.lead_rounds add column if not exists carries_on boolean not null default false;
comment on column public.lead_rounds.carries_on is
  'The round opened the search''s next leg when it ended (decision 0133): its end rings nothing, the leg''s does.';

alter table public.lead_rounds drop constraint if exists lead_rounds_purpose_check;
alter table public.lead_rounds add constraint lead_rounds_purpose_check
  check (purpose in ('probe', 'main', 'topup', 'renew', 'widen'));
alter table public.lead_rounds drop constraint if exists lead_rounds_ending_check;
alter table public.lead_rounds add constraint lead_rounds_ending_check
  check (ending in ('target_reached', 'searched_everything', 'month_leads_used', 'budget_used', 'few_new_matches', 'stopped', 'source_failed', 'question_unanswered', 'paused', 'reach_searched', 'day_used'));
alter table public.lead_rounds drop constraint if exists lead_rounds_ending_pending_check;
alter table public.lead_rounds add constraint lead_rounds_ending_pending_check
  check (ending_pending in ('target_reached', 'searched_everything', 'month_leads_used', 'budget_used', 'few_new_matches', 'stopped', 'source_failed', 'question_unanswered', 'paused', 'reach_searched', 'day_used'));

alter table public.lead_platform add column if not exists widen_on boolean not null default false;
alter table public.lead_platform add column if not exists widen_tenants uuid[] not null default '{}'::uuid[];
comment on column public.lead_platform.widen_on is
  'Whether every workspace''s search widens until its count (decision 0133, 00627): a round that runs dry opens the next leg on the nearest area left within the reach on its card. Off by default.';
comment on column public.lead_platform.widen_tenants is
  'The workspaces a search widens for while widen_on is off (decision 0133): the first real run, one workspace at a time. Switched by hand.';

create or replace function public.lead_search_widens(p_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select p.widen_on or p_tenant_id = any (p.widen_tenants) from public.lead_platform p where p.id), false)
$$;
revoke execute on function public.lead_search_widens(uuid) from public, anon;
grant execute on function public.lead_search_widens(uuid) to authenticated, service_role;
comment on function public.lead_search_widens(uuid) is
  'Whether this workspace''s searches widen until their count (decision 0133): lead_platform.widen_on, or the workspace named in widen_tenants. lead_round_end reads it before it opens a leg, and the plan card before it says how far a search looks.';

create or replace function public.lead_round_end(p_round_id uuid, p_ending text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  r        public.lead_rounds;
  s        public.lead_searches;
  v_judge  numeric := 0;
  v_out    numeric;
  v_take   numeric;
  v_ending text := p_ending;
  v_area   jsonb;
  v_left   integer;
  v_legs   integer;
  v_last   integer;
  v_two    boolean;
  v_month  text;
  v_day    text;
  v_pday   text;
  v_usd    numeric;
  v_err    jsonb;
  v_next   uuid;
begin
  if p_ending not in ('target_reached', 'searched_everything', 'month_leads_used', 'budget_used', 'few_new_matches', 'stopped', 'source_failed', 'question_unanswered', 'paused', 'reach_searched', 'day_used') then
    raise exception 'not one of the endings: %', p_ending using errcode = '22023';
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
  -- What the round spent is settled, and what it kept back given back, before anything is reserved: a leg opened below
  -- reserves from the counters as they stand once this round is done with them (decision 0133).
  if v_judge > 0 then
    perform public.lead_settle_usage(r.tenant_id, r.month, r.day, r.platform_day, v_judge, v_take);
  end if;
  perform public.lead_release(r.tenant_id, r.month, r.day, r.platform_day,
    greatest(r.allowance_reserved - r.allowance_used, 0), v_out - v_take);
  -- A count is delivered (decision 0133): a search short of its count when a round runs dry opens its next leg here, on
  -- the first area its round named (nearby, the distance ladder's next rung inside the reach on its card), where the
  -- platform widens for this workspace. Not for a list, a people search, a removed search or a round with a later one.
  -- It stops once everything within reach is searched: no rung left, eight legs, or the last two legs adding fewer than three leads
  -- between them. A month with fewer leads left than the count still wants gives the leg what is left; the day's or the
  -- month's searching used ends the search in its own words.
  if p_ending in ('few_new_matches', 'searched_everything')
     and public.lead_search_widens(r.tenant_id) then
    select * into s from public.lead_searches where id = r.search_id;
    if s.removed_at is null and s.via in ('ask', 'people') and coalesce(s.plan->>'card', '') = 'local_businesses'
       and not exists (select 1 from public.lead_rounds x where x.search_id = r.search_id and x.seq > r.seq) then
      select (s.plan->>'count')::integer - count(*)::integer into v_left
        from public.lead_search_members m where m.search_id = r.search_id and m.counted;
      select count(*)::integer into v_legs from public.lead_rounds x where x.search_id = r.search_id and x.purpose = 'widen';
      select count(*) = 2 and bool_and(x.purpose = 'widen'), coalesce(sum(x.allowance_used), 0)::integer into v_two, v_last
        from (select y.purpose, y.allowance_used from public.lead_rounds y
               where y.search_id = r.search_id order by y.seq desc limit 2) x;
      select a into v_area from jsonb_array_elements(coalesce(r.nearby, '[]'::jsonb)) as x(a)
       where not (a ? 'beyond_m') limit 1;
      if v_left > 0 and (v_area is null or v_legs >= 8 or (v_two and v_last < 3)) then
        v_ending := 'reach_searched';
      elsif v_left > 0 and public.lead_searches_on(r.tenant_id) and public.lead_spend_refusal(r.tenant_id) is null then
        v_month := public.lead_month(r.tenant_id, now());
        v_day   := public.lead_day(r.tenant_id, now());
        v_pday  := to_char(now() at time zone 'UTC', 'YYYY-MM-DD');
        v_usd   := public.lead_estimate_ceiling('search', v_left, jsonb_array_length(s.plan->'terms'));
        v_err   := public.lead_reserve(r.tenant_id, v_month, v_day, v_pday, v_left, v_usd);
        if v_err->>'error' = 'month_leads_used' and coalesce((v_err->>'left')::integer, 0) > 0 then
          v_left := (v_err->>'left')::integer;
          v_usd  := public.lead_estimate_ceiling('search', v_left, jsonb_array_length(s.plan->'terms'));
          v_err  := public.lead_reserve(r.tenant_id, v_month, v_day, v_pday, v_left, v_usd);
        end if;
        if v_err is null then
          v_next := gen_random_uuid();
        else
          v_ending := case v_err->>'error'
                        when 'month_leads_used' then 'month_leads_used'
                        when 'budget_used' then 'budget_used'
                        when 'day_cap' then 'day_used'
                        else p_ending end;
        end if;
      end if;
    end if;
  end if;
  update public.lead_rounds
     set state = 'ended', ending = v_ending, ended_at = now(), waiting_since = null, judge_usd = v_judge,
         carries_on = v_next is not null
   where id = p_round_id;
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
          jsonb_build_object('search_id', r.search_id, 'seq', r.seq, 'state', 'ended', 'ending', v_ending,
                             'counted', r.allowance_used, 'cost_usd', r.cost_usd, 'judge_usd', v_judge,
                             'carries_on', v_next is not null));
  -- The next leg: the search's own plan on the rung's first area, for what its count still wants, started as any round.
  if v_next is not null then
    insert into public.lead_rounds (id, tenant_id, search_id, seq, purpose, plan, plan_version, target, state, allowance_reserved, cost_reserved_usd, month, day, platform_day)
    values (v_next, r.tenant_id, r.search_id, r.seq + 1, 'widen', jsonb_set(s.plan, '{area}', v_area), (s.plan->>'version')::integer,
            v_left, 'queued', v_left, v_usd, v_month, v_day, v_pday);
    insert into public.jobs (tenant_id, kind, due_at, payload)
    values (r.tenant_id, 'lead_round_start', now(), jsonb_build_object('round_id', v_next));
    insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
    values (r.tenant_id, 'lead.round', 'lead', 'lead_round', v_next,
            jsonb_build_object('search_id', r.search_id, 'seq', r.seq + 1, 'state', 'queued', 'purpose', 'widen',
                               'target', v_left, 'area', v_area->>'label'));
  end if;
  return true;
end $$;

comment on function public.lead_round_end(uuid, text) is
  'Ends a round with one of the endings: state ended, ended_at, the judge''s dollars settled (00506: the usage ledger''s lead_judge rows under the round, as used, out of what it still had reserved), what it reserved and did not use back to the counters, and every address of the round still checking set unknown, so Check again can take it. Where the platform widens for the workspace (decision 0133, 00627), a search short of its count whose round ran dry opens its next leg here (purpose widen, on the first area of nearby), or ends on reach_searched, day_used, month_leads_used or budget_used. True once; false when already ended.';

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
    -- the service key, and they never revive a search (§12.3). The one round
    -- made without a person is a search's next leg (decision 0133), which only
    -- lead_round_end opens, in the transaction that ends the round before it.
    if NEW.seq > 1 and auth.uid() is null and NEW.purpose is distinct from 'widen' then
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

create or replace function public.lead_rounds_notify()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
  v_via  text;
  v_want integer;
  v_n    integer;
  v_seen boolean;
  v_wide boolean;
  v_id   uuid;
begin
  -- A round that leaves waiting_on_owner has settled its question for good (a round waits on its owner once): its row
  -- closes, for a list and a chosen search too, so this comes before the returns below (00421).
  if OLD.state = 'waiting_on_owner' and NEW.state is distinct from 'waiting_on_owner' then
    perform public.notifications_close_about(NEW.tenant_id, array['leads_question'], 'lead_round', NEW.id::text);
  end if;
  select s.name, s.via, (s.plan->>'count')::integer into v_name, v_via, v_want
    from public.lead_searches s where s.id = NEW.search_id;
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
  elsif NEW.state = 'ended' and coalesce(OLD.state, '') <> 'ended' and coalesce(NEW.ending, '') <> 'stopped'
        and not NEW.carries_on then
    -- A round that opened the search's next leg says nothing yet; the leg that ends the search says what all of them
    -- found (decision 0133).
    select exists (select 1 from public.lead_rounds x where x.search_id = NEW.search_id and x.purpose = 'widen') into v_wide;
    select count(*)::integer into v_n from public.lead_search_members m
     where (m.round_id = NEW.id or (v_wide and m.search_id = NEW.search_id)) and m.class = 'qualified' and m.blanked_at is null
       and (v_via = 'import' or public.lead_member_shown(m.class, m.counted));
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
                when NEW.ending = 'day_used' then
                  left('Your search for ' || v_name || ' stopped: today''s searching is used up', 200)
                when NEW.ending = 'month_leads_used' then
                  left('Your search for ' || v_name || ' stopped: this month''s leads are used', 200)
                when NEW.ending = 'budget_used' then
                  left('Your search for ' || v_name || ' stopped: this month''s searching is used up', 200)
                when NEW.ending = 'reach_searched' and v_want is not null then
                  left('Your search for ' || v_name || ' found ' || v_n || ' of ' || v_want, 200)
                else left('Your search for ' || v_name || ' is done', 200) end,
           case when v_via <> 'import' and NEW.ending = 'reach_searched' then
                  'Every area within reach was searched, and no more that fit were found.'
                when v_via <> 'import' then case when v_n > 0 then v_n || ' found.' else 'Nothing new was counted.' end
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

-- Look further out (decision 0133, step 4): a search that ended reach_searched is topped up past its reach from the
-- first area its last round found beyond it, as a leg; every other top-up is as it was (00364).
create or replace function public.lead_search_more(p_search_id uuid, p_purpose text, p_plan jsonb, p_estimate_usd numeric)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user    uuid := auth.uid();
  s         public.lead_searches;
  last      public.lead_rounds;
  v_count   integer;
  v_counted integer;
  v_target  integer;
  v_version integer;
  v_month   text;
  v_day     text;
  v_pday    text;
  v_err     jsonb;
  v_round   uuid;
  v_beyond  jsonb;
  v_purpose text := p_purpose;
begin
  if v_user is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  if p_purpose not in ('topup', 'renew') then
    raise exception 'purpose is topup or renew' using errcode = '22023';
  end if;
  if p_estimate_usd is null or p_estimate_usd < 0 or p_estimate_usd > public.lead_cap('month_usd') then
    raise exception 'estimate: 0 to % usd', public.lead_cap('month_usd') using errcode = '22023';
  end if;
  select * into s from public.lead_searches where id = p_search_id for update;
  if not found or not public.has_permission(v_user, s.tenant_id, 'find') then
    raise exception 'Search not found.' using errcode = 'P0002';
  end if;
  if s.removed_at is not null then
    return jsonb_build_object('error', 'removed');
  end if;
  perform public.lead_plan_check(p_plan);
  select * into last from public.lead_rounds where search_id = p_search_id order by seq desc limit 1;
  if last.state <> 'ended' then
    return jsonb_build_object('error', 'live', 'state', last.state);
  end if;
  v_version := coalesce((p_plan->>'version')::integer, 0);
  if v_version not in ((s.plan->>'version')::integer, (s.plan->>'version')::integer + 1) then
    raise exception 'the plan is the current version or the next' using errcode = '22023';
  end if;
  v_count := (p_plan->>'count')::integer;
  -- The estimate is the route's to compute (estimateForRound) and never more than this plan can cost (00364). Held to
  -- the plan's whole count, not the round's target: the route prices a top-up from the counted it read a moment before.
  if p_estimate_usd > public.lead_estimate_ceiling('search', v_count, jsonb_array_length(p_plan->'terms')) then
    raise exception 'estimate: 0 to % usd for this plan', public.lead_estimate_ceiling('search', v_count, jsonb_array_length(p_plan->'terms'))
      using errcode = '22023';
  end if;
  if p_purpose = 'topup' then
    select count(*) into v_counted from public.lead_search_members m where m.search_id = p_search_id and m.counted;
    v_target := v_count - v_counted;
    if v_target <= 0 then
      return jsonb_build_object('error', 'nothing_to_add', 'counted', v_counted);
    end if;
  else
    v_target := v_count;
  end if;
  -- Look further out (decision 0133): a search that searched every area within its reach, asked for more with a reach as
  -- far as an area its last round found past it, carries on from that area as a leg, and reads none of its own again.
  if p_purpose = 'topup' and last.ending = 'reach_searched' then
    select a into v_beyond from jsonb_array_elements(coalesce(last.nearby, '[]'::jsonb)) as x(a)
     where a ? 'beyond_m' and (a->>'beyond_m')::integer <= coalesce((p_plan->>'reach_m')::integer, 0) limit 1;
    if v_beyond is not null then
      v_purpose := 'widen';
    end if;
  end if;
  if not public.lead_searches_on(s.tenant_id) then
    return jsonb_build_object('error', 'paused', 'sentence', 'Lead searches are paused for now. Your leads are all here, and nothing is being counted.');
  end if;
  -- A workspace that may not spend is refused before anything is reserved (00364), as the route refuses it.
  v_err := public.lead_spend_refusal(s.tenant_id);
  if v_err is not null then
    return v_err;
  end if;
  v_month := public.lead_month(s.tenant_id, now());
  v_day   := public.lead_day(s.tenant_id, now());
  v_pday  := to_char(now() at time zone 'UTC', 'YYYY-MM-DD');
  v_err   := public.lead_reserve(s.tenant_id, v_month, v_day, v_pday, v_target, p_estimate_usd);
  if v_err is not null then
    return v_err;
  end if;
  if v_version <> (s.plan->>'version')::integer then
    update public.lead_searches set plan = p_plan where id = p_search_id;
  end if;
  insert into public.lead_rounds (tenant_id, search_id, seq, purpose, plan, plan_version, target, state, allowance_reserved, cost_reserved_usd, month, day, platform_day)
  values (s.tenant_id, p_search_id, last.seq + 1, v_purpose,
          case when v_beyond is null then p_plan else jsonb_set(p_plan, '{area}', v_beyond - 'beyond_m') end,
          v_version, v_target, 'queued', v_target, p_estimate_usd, v_month, v_day, v_pday)
  returning id into v_round;
  insert into public.jobs (tenant_id, kind, due_at, payload)
  values (s.tenant_id, 'lead_round_start', now(), jsonb_build_object('round_id', v_round));
  insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
  values (s.tenant_id, 'lead.round', 'lead', 'lead_round', v_round,
          jsonb_build_object('search_id', p_search_id, 'seq', last.seq + 1, 'state', 'queued', 'purpose', v_purpose, 'target', v_target, 'by', v_user));
  return jsonb_build_object('search_id', p_search_id, 'round_id', v_round, 'seq', last.seq + 1, 'target', v_target);
end $$;
comment on function public.lead_search_more(uuid, text, jsonb, numeric) is
  'Owner. A new round on an ended search: topup reserves the count minus what already counted, renew the whole count, through the same reservation as create; the plan is the current version or the next (stored on the search); the estimate at most lead_estimate_ceiling for the plan''s count and terms (00364). {error: live} while a round is open; {error: nothing_to_add} when the count is already met; {error: payment_required, sentence} for a workspace that may not spend (lead_spend_refusal, 00364). A top-up of a search that ended reach_searched, with a reach as far as an area its last round found past its own (nearby, marked beyond_m), opens a widen round on that area instead (decision 0133).';

-- Find them when the leads renew (decision 0133, step 4): a search the month's leads stopped carries on from the
-- next month, reserved now and started at midnight on its first day.
alter table public.lead_rounds add column if not exists starts_at timestamptz;
comment on column public.lead_rounds.starts_at is
  'When a round the owner put off starts (decision 0133): a search its month''s leads stopped, carried on when they renew (lead_search_on_renewal). Null for a round that starts at once.';

create or replace function public.lead_search_on_renewal(p_search_id uuid, p_estimate_usd numeric)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user   uuid := auth.uid();
  s        public.lead_searches;
  last     public.lead_rounds;
  v_tz     text;
  v_at     timestamptz;
  v_target integer;
  v_month  text;
  v_day    text;
  v_pday   text;
  v_err    jsonb;
  v_round  uuid;
begin
  if v_user is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  if p_estimate_usd is null or p_estimate_usd < 0 or p_estimate_usd > public.lead_cap('month_usd') then
    raise exception 'estimate: 0 to % usd', public.lead_cap('month_usd') using errcode = '22023';
  end if;
  select * into s from public.lead_searches where id = p_search_id for update;
  if not found or not public.has_permission(v_user, s.tenant_id, 'find') then
    raise exception 'Search not found.' using errcode = 'P0002';
  end if;
  if s.removed_at is not null then
    return jsonb_build_object('error', 'removed');
  end if;
  select * into last from public.lead_rounds where search_id = p_search_id order by seq desc limit 1;
  if last.state <> 'ended' then
    return jsonb_build_object('error', 'live', 'state', last.state);
  end if;
  if last.ending is distinct from 'month_leads_used' then
    return jsonb_build_object('error', 'not_month_used');
  end if;
  select (s.plan->>'count')::integer - count(*)::integer into v_target
    from public.lead_search_members m where m.search_id = p_search_id and m.counted;
  if v_target <= 0 then
    return jsonb_build_object('error', 'nothing_to_add');
  end if;
  if p_estimate_usd > public.lead_estimate_ceiling('search', v_target, jsonb_array_length(s.plan->'terms')) then
    raise exception 'estimate: 0 to % usd for this plan', public.lead_estimate_ceiling('search', v_target, jsonb_array_length(s.plan->'terms'))
      using errcode = '22023';
  end if;
  if not public.lead_searches_on(s.tenant_id) then
    return jsonb_build_object('error', 'paused', 'sentence', 'Lead searches are paused for now. Your leads are all here, and nothing is being counted.');
  end if;
  v_err := public.lead_spend_refusal(s.tenant_id);
  if v_err is not null then
    return v_err;
  end if;
  -- The workspace's next month begins at midnight on its first day, in the workspace's own zone (lead_month's months):
  -- the leads are reserved from that month now, and the round starts then.
  select coalesce(t.timezone, 'UTC') into v_tz from public.tenants t where t.id = s.tenant_id;
  v_at    := (date_trunc('month', now() at time zone v_tz) + interval '1 month') at time zone v_tz;
  v_month := public.lead_month(s.tenant_id, v_at);
  v_day   := public.lead_day(s.tenant_id, v_at);
  v_pday  := to_char(v_at at time zone 'UTC', 'YYYY-MM-DD');
  v_err   := public.lead_reserve(s.tenant_id, v_month, v_day, v_pday, v_target, p_estimate_usd);
  if v_err is not null then
    return v_err;
  end if;
  insert into public.lead_rounds (tenant_id, search_id, seq, purpose, plan, plan_version, target, state, allowance_reserved, cost_reserved_usd, month, day, platform_day, starts_at)
  values (s.tenant_id, p_search_id, last.seq + 1, 'topup', s.plan, (s.plan->>'version')::integer, v_target, 'queued', v_target, p_estimate_usd, v_month, v_day, v_pday, v_at)
  returning id into v_round;
  insert into public.jobs (tenant_id, kind, due_at, payload)
  values (s.tenant_id, 'lead_round_start', v_at, jsonb_build_object('round_id', v_round));
  insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
  values (s.tenant_id, 'lead.round', 'lead', 'lead_round', v_round,
          jsonb_build_object('search_id', p_search_id, 'seq', last.seq + 1, 'state', 'queued', 'purpose', 'topup', 'target', v_target, 'starts_at', v_at, 'by', v_user));
  return jsonb_build_object('search_id', p_search_id, 'round_id', v_round, 'seq', last.seq + 1, 'target', v_target, 'starts_at', v_at);
end $$;
revoke execute on function public.lead_search_on_renewal(uuid, numeric) from public, anon;
grant execute on function public.lead_search_on_renewal(uuid, numeric) to authenticated, service_role;
comment on function public.lead_search_on_renewal(uuid, numeric) is
  'Owner (permission find). Find them when the leads renew (decision 0133): a search its month''s leads stopped (its last round ended month_leads_used) is topped up for the rest of its count from the workspace''s next month, reserved now through lead_reserve against that month and its first day, as a topup round that waits queued until midnight on that day in the workspace''s zone (starts_at), with its lead_round_start due then. {error: live | not_month_used | nothing_to_add | removed | paused} and lead_reserve''s and lead_spend_refusal''s refusals as they are.';

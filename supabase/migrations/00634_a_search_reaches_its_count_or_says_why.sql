-- A search reaches its count where it can, and says why where it cannot (decision 0133; the second real search, 15 Nov 2026).
--
-- The second real search (100 med spas in Queens) found 99. Three things in lead_round_end, each changed here:
--   - a search read at most eight legs, whatever its count: about 75 leads past its first area in a dense niche, so a
--     search of 300 could not be met. The legs a search may read now grow with its count (lead_leg_cap: one for every
--     ten leads, eight at least, forty at most), and the money caps bound it as before;
--   - stopped by those guards with areas still within reach, it said every area within reach was searched. It now ends
--     on what its last area did, its nearby kept, so the owner is offered the next area; reach_searched is said only
--     when the ladder has no area left, and the bell says how many of how many it found;
--   - a leg the day's searching could not hold stopped the search until the owner pressed Carry on. It is now reserved
--     from tomorrow's day and starts at midnight in the workspace's zone (starts_at, as lead_search_on_renewal does),
--     within the month; and a leg the count's estimate cannot be reserved for asks for a page's first (legs set aside
--     $3.47 to $6.01 and spent $0.02 to $1.39).
-- Deploy order: either. Old code reads a waiting leg's starts_at already (the renewal's), and nothing new is required
-- of it. Re-runnable.

set local lock_timeout = '3s';

create or replace function public.lead_leg_cap(p_count integer)
returns integer
language sql
immutable
set search_path = public
as $$
  select least(40, greatest(8, ceil(greatest(coalesce(p_count, 0), 0) / 10.0)::integer))
$$;

comment on function public.lead_leg_cap(p_count integer) is
  'How many legs a search of p_count may read (decision 0133, 00634): one for every ten leads, eight at least, forty at most. A leg of a dense niche adds about nine (15 Nov 2026); the month''s and the day''s caps bound the spend.';

revoke all on function public.lead_leg_cap(p_count integer) from public;
grant all on function public.lead_leg_cap(p_count integer) to service_role;

create or replace function public.lead_round_end(p_round_id uuid, p_ending text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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
  v_short  boolean;
  v_cap    integer;
  v_page   numeric;
  v_tz     text;
  v_at     timestamptz;
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
      v_cap := public.lead_leg_cap((s.plan->>'count')::integer);
      if v_left > 0 and v_area is null then
        v_ending := 'reach_searched';
      elsif v_left > 0 and (v_legs >= v_cap or (v_two and v_last < 3)) then
        -- Its own guards stop it with areas still within reach: the round ends on what its area did, its nearby kept,
        -- so the owner is offered the next area. "Every area within reach was searched" is the ladder's alone.
        v_ending := p_ending;
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
        -- A leg spends about a page a term (15 Nov 2026: $0.02 to $1.39 of $3.47 to $6.01 set aside): where the month's or
        -- the day's money cannot hold the count's estimate, a page's is asked for instead.
        if v_err->>'error' in ('budget_used', 'day_cap') then
          v_page := public.lead_estimate_ceiling('search', 48, 1);
          if v_page < v_usd then
            v_usd := v_page;
            v_err := public.lead_reserve(r.tenant_id, v_month, v_day, v_pday, v_left, v_usd);
          end if;
        end if;
        -- The day's searching used, the leg waits for the next: it is reserved from tomorrow's day now and starts at
        -- midnight in the workspace's zone, as the rest when the leads renew does. Never into the next month, whose leads
        -- the owner has not given: that stops on day_used, with Carry on.
        if v_err->>'error' = 'day_cap' then
          select coalesce(t.timezone, 'UTC') into v_tz from public.tenants t where t.id = r.tenant_id;
          v_at := (date_trunc('day', now() at time zone v_tz) + interval '1 day') at time zone v_tz;
          if public.lead_month(r.tenant_id, v_at) = v_month then
            v_err := public.lead_reserve(r.tenant_id, v_month, public.lead_day(r.tenant_id, v_at),
                                         to_char(v_at at time zone 'UTC', 'YYYY-MM-DD'), v_left, v_usd);
            if v_err is null then
              v_day  := public.lead_day(r.tenant_id, v_at);
              v_pday := to_char(v_at at time zone 'UTC', 'YYYY-MM-DD');
            end if;
          end if;
          if v_err is not null then
            v_at := null;
          end if;
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
  -- A leg the month's leads held short (decision 0133) met the count it was given and not the search's: the search
  -- stops on the month's leads, with the day they renew, never as found.
  if p_ending = 'target_reached' and r.purpose = 'widen' then
    select (x.plan->>'count')::integer > (select count(*) from public.lead_search_members m
                                           where m.search_id = r.search_id and m.counted)
      into v_short from public.lead_searches x where x.id = r.search_id;
    if v_short then
      v_ending := 'month_leads_used';
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
    insert into public.lead_rounds (id, tenant_id, search_id, seq, purpose, plan, plan_version, target, state, allowance_reserved, cost_reserved_usd, month, day, platform_day, starts_at)
    values (v_next, r.tenant_id, r.search_id, r.seq + 1, 'widen', jsonb_set(s.plan, '{area}', v_area), (s.plan->>'version')::integer,
            v_left, 'queued', v_left, v_usd, v_month, v_day, v_pday, v_at);
    insert into public.jobs (tenant_id, kind, due_at, payload)
    values (r.tenant_id, 'lead_round_start', coalesce(v_at, now()), jsonb_build_object('round_id', v_next));
    insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
    values (r.tenant_id, 'lead.round', 'lead', 'lead_round', v_next,
            jsonb_build_object('search_id', r.search_id, 'seq', r.seq + 1, 'state', 'queued', 'purpose', 'widen',
                               'target', v_left, 'area', v_area->>'label')
            || case when v_at is null then '{}'::jsonb else jsonb_build_object('starts_at', v_at) end);
  end if;
  return true;
end $$;

comment on function public.lead_round_end(p_round_id uuid, p_ending text) is
  'Ends a round with one of the endings: state ended, ended_at, the judge''s dollars settled (00506: the usage ledger''s lead_judge rows under the round, as used, out of what it still had reserved), what it reserved and did not use back to the counters, and every address of the round still checking set unknown, so Check again can take it. Where the platform widens for the workspace (decision 0133, 00628), a search short of its count whose round ran dry opens its next leg here (purpose widen, on the first area of nearby), or ends on reach_searched (no area left within reach), on the ending it was given with its nearby kept (its legs reached lead_leg_cap for its count, or its last two added fewer than three, 00634), or on day_used, month_leads_used or budget_used. A leg the count''s estimate cannot be reserved for asks for a page''s; one the day''s searching cannot hold is reserved from tomorrow''s day and starts then (starts_at), within the month. True once; false when already ended.';

create or replace function public.lead_rounds_notify() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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
                when v_wide and v_want is not null and v_n < v_want and NEW.ending in ('few_new_matches', 'searched_everything') then
                  left('Your search for ' || v_name || ' found ' || v_n || ' of ' || v_want, 200)
                else left('Your search for ' || v_name || ' is done', 200) end,
           case when v_via <> 'import' and NEW.ending = 'reach_searched' then
                  'Every area within reach was searched, and no more that fit were found.'
                when v_via <> 'import' and v_wide and v_want is not null and v_n < v_want
                     and NEW.ending in ('few_new_matches', 'searched_everything') then
                  'It stopped after the nearby areas it reads on its own. Open it to look further.'
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

comment on function public.lead_rounds_notify() is
  'The bell''s two lead kinds: one leads_question row when a round stops to ask, pointing at the search''s left-out pile (the places the question is about), and one leads_ready row when it ends with anything but "stopped" or "question_unanswered", pointing at the search; each once per round, each with a push_send job so a phone hears it too. A search whose source failed says so (00491): "didn''t run: the source couldn''t start it" when nothing came back, "stopped: the source stopped answering" when places did, a warning in contracts'' notice-tones; a widened search short of its count says how many of how many it found, with every area searched only where the ladder ran out (00634); every other ending "is done". A file of the owner''s own (via import, 00242) rings "Your list … is checked" with how many have a checked address once its check ran, or "could not be checked" when the check ended any other way; a chosen search rings nothing. A round that leaves waiting_on_owner closes its question row for everyone (00421, notifications_close_about). A member''s own read mark is notification_marks'', as for every other kind.';

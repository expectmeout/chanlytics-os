-- 00268 · The lead caps are written once in SQL.
--
-- The finder's caps (a workspace's 500 leads and $25 a month and $10 a day, the platform's $50 a day, and a list's 500
-- rows) were literals in seven functions: lead_reserve (00140), the allowance's two other gates (lead_check_commit and
-- lead_member_move, 00145), the estimate's ceiling in lead_search_create and lead_search_more (00172, 00145), and 00242's
-- list doors, which wrote them a third time, a refusal sentence among them (the scorecard of 29 September 2026, review
-- B2). A change to a plan's allowance would have left a sentence saying the old number.
--
-- One home in SQL now, lead_cap(name), beside contracts' caps.ts (LEAD_MONTHLY_ALLOWANCE, LEAD_MONTHLY_BUDGET_USD,
-- LEAD_DAY_CAP_USD, LEAD_PLATFORM_DAY_CAP_USD, LEAD_LIST_MAX), which the pages read; leads/lead-caps.db.test.mjs holds
-- the two to the same numbers. The caps stay constants: a cap per plan is the pricing decision's (0010, #1039), and
-- its table is written with it. Each function is replaced whole, as the database holds it, with only its literals
-- read from lead_cap; its grants and comment stand (create or replace keeps them), but for the three comments that
-- repeated a number. Re-runnable.

set local lock_timeout = '3s';

create or replace function public.lead_cap(p_name text)
returns numeric
language plpgsql
immutable
set search_path = public
as $$
declare
  v numeric;
begin
  v := case p_name
    when 'month_leads'      then 500   -- Qualified leads a workspace finds in its month (LEAD_MONTHLY_ALLOWANCE)
    when 'month_usd'        then 25    -- what searching may cost a workspace in its month (LEAD_MONTHLY_BUDGET_USD)
    when 'day_usd'          then 10    -- ... in its day (LEAD_DAY_CAP_USD)
    when 'platform_day_usd' then 50    -- ... what it may cost the platform in a UTC day (LEAD_PLATFORM_DAY_CAP_USD)
    when 'list_rows'        then 500   -- rows a file brings, leads one press chooses (LEAD_LIST_MAX)
  end;
  -- A name it does not know is a mistake in the caller, never "no cap": a comparison with null would let anything by.
  if v is null then
    raise exception 'lead_cap: no cap is named %', coalesce(p_name, 'null') using errcode = '22023';
  end if;
  return v;
end;
$$;
comment on function public.lead_cap(text) is
  'The lead finder''s caps, the one place SQL writes them (00268): month_leads, month_usd, day_usd, platform_day_usd, list_rows. contracts'' caps.ts and lead-import.ts say the same, and lead-caps.db.test.mjs holds the two together. A name it does not know raises.';
revoke execute on function public.lead_cap(text) from public, anon, authenticated;
grant execute on function public.lead_cap(text) to service_role;

create or replace function public.lead_reserve(p_tenant_id uuid, p_month text, p_day text, p_platform_day text, p_leads integer, p_usd numeric)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_allowance public.lead_counters;
  v_budget    public.lead_counters;
  v_day       public.lead_counters;
  v_platform  public.lead_counters;
  v_left      numeric;
begin
  v_allowance := public.lead_counter_take(p_tenant_id, 'allowance', p_month);
  if v_allowance.used + v_allowance.reserved + p_leads > public.lead_cap('month_leads') then
    v_left := greatest(public.lead_cap('month_leads') - v_allowance.used - v_allowance.reserved, 0);
    return jsonb_build_object('error', 'month_leads_used', 'left', v_left::integer,
      'sentence', case when v_left <= 0
        then 'You have found this month''s ' || public.lead_cap('month_leads') || ' leads. Your leads renew on ' || public.lead_renews_on(p_tenant_id) || '.'
        else 'You have ' || v_left::integer || ' leads left this month. Find ' || v_left::integer || ' now, or all ' || p_leads || ' when your leads renew on ' || public.lead_renews_on(p_tenant_id) || '?' end);
  end if;
  v_budget := public.lead_counter_take(p_tenant_id, 'budget', p_month);
  if v_budget.used + v_budget.reserved + p_usd > public.lead_cap('month_usd') then
    v_left := greatest(public.lead_cap('month_usd') - v_budget.used - v_budget.reserved, 0);
    return jsonb_build_object('error', 'budget_used', 'left_usd', v_left,
      'sentence', 'This month''s searching is nearly used up. Try a smaller search, or a phone standard; it renews on ' || public.lead_renews_on(p_tenant_id) || '.');
  end if;
  v_day := public.lead_counter_take(p_tenant_id, 'day', p_day);
  if v_day.used + v_day.reserved + p_usd > public.lead_cap('day_usd') then
    return jsonb_build_object('error', 'day_cap', 'sentence', 'Today''s searching is used up. Try again tomorrow.');
  end if;
  v_platform := public.lead_counter_take(null, 'day', p_platform_day);
  if v_platform.used + v_platform.reserved + p_usd > public.lead_cap('platform_day_usd') then
    return jsonb_build_object('error', 'day_cap', 'sentence', 'Searching is busy today. Try again tomorrow.');
  end if;
  update public.lead_counters set reserved = reserved + p_leads, updated_at = now() where id = v_allowance.id;
  update public.lead_counters set reserved = reserved + p_usd,   updated_at = now() where id = v_budget.id;
  update public.lead_counters set reserved = reserved + p_usd,   updated_at = now() where id = v_day.id;
  update public.lead_counters set reserved = reserved + p_usd,   updated_at = now() where id = v_platform.id;
  return null;
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


create or replace function public.lead_member_move(p_search_id uuid, p_lead_id uuid, p_kind text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user    uuid := auth.uid();
  s         public.lead_searches;
  m         public.lead_search_members;
  l         public.leads;
  v_month   text;
  v_counter public.lead_counters;
  v_before  jsonb;
  v_after   jsonb;
  v_op      uuid;
  v_counts  boolean := false;
begin
  if v_user is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  select * into s from public.lead_searches where id = p_search_id;
  if not found or not public.has_permission(v_user, s.tenant_id, 'find') then
    raise exception 'Search not found.' using errcode = 'P0002';
  end if;
  -- A removed search charges nobody: Keep and Put back each spend a lead of
  -- the month's allowance, and its members are blanked. lead_search_more says
  -- the same word.
  if s.removed_at is not null then
    return jsonb_build_object('error', 'removed');
  end if;
  select * into m from public.lead_search_members where search_id = p_search_id and lead_id = p_lead_id for update;
  if not found then
    return jsonb_build_object('error', 'not_found');
  end if;
  select * into l from public.leads where id = p_lead_id;
  if m.blanked_at is not null or l.blanked_at is not null or l.erased_at is not null then
    return jsonb_build_object('error', 'hidden');
  end if;
  v_before := jsonb_build_object('class', m.class, 'excluded_by', m.excluded_by, 'counted', m.counted, 'counted_month', m.counted_month, 'kept_at', m.kept_at, 'kept_by', m.kept_by);

  if p_kind = 'exclude' then
    if m.class <> 'review' then
      return jsonb_build_object('error', 'state', 'class', m.class);
    end if;
    update public.lead_search_members
       set class = 'excluded', excluded_by = 'owner', kept_at = null, kept_by = null, version = version + 1
     where id = m.id
    returning * into m;
  else
    if p_kind = 'put_back' then
      if m.class <> 'excluded' then
        return jsonb_build_object('error', 'state', 'class', m.class);
      end if;
      -- Neither Put back nor Keep revives a suppression or an out-of-area place (§0.1).
      if l.place_id is null or exists (select 1 from public.lead_suppressions x where x.tenant_id = s.tenant_id and x.kind = 'place'
                    and x.what in ('customer', 'erased') and x.hash = public.lead_suppression_hash(s.tenant_id, l.place_id)) then
        return jsonb_build_object('error', 'hidden');
      end if;
      if m.judgment->'reasons' ? 'out_of_area' then
        return jsonb_build_object('error', 'out_of_area');
      end if;
    elsif not (m.class = 'review' or (m.class = 'qualified' and not m.counted)) then
      return jsonb_build_object('error', 'state', 'class', m.class);
    end if;
    -- Keep and Put back count, through the month's allowance (§0.2).
    if not m.counted then
      v_month := public.lead_month(s.tenant_id, now());
      v_counter := public.lead_counter_take(s.tenant_id, 'allowance', v_month);
      if v_counter.used + v_counter.reserved + 1 > public.lead_cap('month_leads') then
        return jsonb_build_object('error', 'month_leads_used', 'left', 0,
          'sentence', 'You have found this month''s ' || public.lead_cap('month_leads') || ' leads. Your leads renew on ' || public.lead_renews_on(s.tenant_id) || '.');
      end if;
      update public.lead_counters set used = used + 1, updated_at = now() where id = v_counter.id;
      v_counts := true;
    end if;
    update public.lead_search_members
       set class = 'qualified', excluded_by = null,
           counted = true, counted_month = coalesce(counted_month, v_month),
           kept_at = now(), kept_by = v_user, version = version + 1
     where id = m.id
    returning * into m;
  end if;

  v_after := jsonb_build_object('class', m.class, 'excluded_by', m.excluded_by, 'counted', m.counted, 'counted_month', m.counted_month, 'kept_at', m.kept_at, 'kept_by', m.kept_by);
  insert into public.lead_operations (tenant_id, kind, search_id, lead_ids, before, after, version, by)
  values (s.tenant_id, p_kind, p_search_id, array[p_lead_id], v_before, v_after, m.version, v_user)
  returning id into v_op;
  return jsonb_build_object('op_id', v_op, 'version', m.version, 'counted', v_counts);
end $$;


create or replace function public.lead_search_create(p_tenant_id uuid, p_plan jsonb, p_via text, p_estimate_usd numeric, p_thread_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user   uuid := auth.uid();
  v_count  integer;
  v_month  text;
  v_day    text;
  v_pday   text;
  v_err    jsonb;
  v_search uuid;
  v_round  uuid;
  v_thread uuid;
begin
  if v_user is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  if not public.has_permission(v_user, p_tenant_id, 'find') then
    raise exception 'Only an owner can find businesses for you.' using errcode = '42501';
  end if;
  if p_via not in ('people', 'ask') then
    raise exception 'via is people or ask' using errcode = '22023';
  end if;
  if p_estimate_usd is null or p_estimate_usd < 0 or p_estimate_usd > public.lead_cap('month_usd') then
    raise exception 'estimate: 0 to % usd', public.lead_cap('month_usd') using errcode = '22023';
  end if;
  perform public.lead_plan_check(p_plan);
  if coalesce((p_plan->>'version')::integer, 0) <> 1 then
    raise exception 'a new search starts at plan version 1' using errcode = '22023';
  end if;
  v_count := (p_plan->>'count')::integer;

  if not public.lead_searches_on(p_tenant_id) then
    return jsonb_build_object('error', 'paused', 'sentence', 'Lead searches are paused for now. Your leads are all here, and nothing is being counted.');
  end if;
  -- An unapproved card never runs for an owner (28). The ask is logged as
  -- demand: the words, never a place.
  if p_plan->>'card' <> 'local_businesses' then
    insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
    values (p_tenant_id, 'lead.no_card', 'lead', 'lead_search', null,
            jsonb_build_object('card', left(p_plan->>'card', 40), 'asked', left(p_plan->>'asked', 400), 'by', v_user));
    return jsonb_build_object('error', 'no_card', 'sentence', 'I can find local businesses for now.');
  end if;

  -- The thread it was planned in, only when it is the caller's own in this
  -- workspace (00040: a thread is one person's). Anything else is null.
  if p_thread_id is not null then
    select t.id into v_thread from public.ask_threads t
     where t.id = p_thread_id and t.user_id = v_user and t.tenant_id = p_tenant_id;
  end if;

  v_month := public.lead_month(p_tenant_id, now());
  v_day   := public.lead_day(p_tenant_id, now());
  v_pday  := to_char(now() at time zone 'UTC', 'YYYY-MM-DD');
  v_err   := public.lead_reserve(p_tenant_id, v_month, v_day, v_pday, v_count, p_estimate_usd);
  if v_err is not null then
    return v_err;
  end if;

  insert into public.lead_searches (tenant_id, created_by, via, card, name, asked, plan, thread_id)
  values (p_tenant_id, v_user, p_via, p_plan->>'card', left(p_plan->>'name', 120), p_plan->>'asked', p_plan, v_thread)
  returning id into v_search;
  insert into public.lead_rounds (tenant_id, search_id, seq, purpose, plan, plan_version, target, state, allowance_reserved, cost_reserved_usd, month, day, platform_day)
  values (p_tenant_id, v_search, 1, 'probe', p_plan, 1, least(25, v_count), 'queued', v_count, p_estimate_usd, v_month, v_day, v_pday)
  returning id into v_round;
  insert into public.jobs (tenant_id, kind, due_at, payload)
  values (p_tenant_id, 'lead_round_start', now(), jsonb_build_object('round_id', v_round));
  insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
  values (p_tenant_id, 'lead.round', 'lead', 'lead_round', v_round,
          jsonb_build_object('search_id', v_search, 'seq', 1, 'state', 'queued', 'purpose', 'probe', 'target', least(25, v_count), 'by', v_user));
  return jsonb_build_object('search_id', v_search, 'round_id', v_round);
end $$;


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
  if p_purpose = 'topup' then
    select count(*) into v_counted from public.lead_search_members m where m.search_id = p_search_id and m.counted;
    v_target := v_count - v_counted;
    if v_target <= 0 then
      return jsonb_build_object('error', 'nothing_to_add', 'counted', v_counted);
    end if;
  else
    v_target := v_count;
  end if;
  if not public.lead_searches_on(s.tenant_id) then
    return jsonb_build_object('error', 'paused', 'sentence', 'Lead searches are paused for now. Your leads are all here, and nothing is being counted.');
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
  values (s.tenant_id, p_search_id, last.seq + 1, p_purpose, p_plan, v_version, v_target, 'queued', v_target, p_estimate_usd, v_month, v_day, v_pday)
  returning id into v_round;
  insert into public.jobs (tenant_id, kind, due_at, payload)
  values (s.tenant_id, 'lead_round_start', now(), jsonb_build_object('round_id', v_round));
  insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
  values (s.tenant_id, 'lead.round', 'lead', 'lead_round', v_round,
          jsonb_build_object('search_id', p_search_id, 'seq', last.seq + 1, 'state', 'queued', 'purpose', p_purpose, 'target', v_target, 'by', v_user));
  return jsonb_build_object('search_id', p_search_id, 'round_id', v_round, 'seq', last.seq + 1, 'target', v_target);
end $$;


create or replace function public.lead_search_import(p_tenant_id uuid, p_name text, p_asked text, p_rows jsonb, p_estimate_usd numeric)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user     uuid := auth.uid();
  v_name     text := left(btrim(coalesce(p_name, '')), 120);
  v_asked    text := left(btrim(coalesce(p_asked, '')), 400);
  v_x        jsonb;
  v_email    text;
  v_phone    text;
  v_host     text;
  v_region   text;
  v_lead     uuid;
  v_seen     text[] := '{}';
  v_new      jsonb := '[]'::jsonb;
  v_check    uuid[] := '{}';
  v_counted  uuid[] := '{}';
  v_unread   integer := 0;
  v_twice    integer := 0;
  v_customer integer := 0;
  v_never    integer := 0;
  v_busy     integer := 0;
  v_n        integer;
  v_estimate numeric := greatest(coalesce(p_estimate_usd, 0), 0.5);
  v_shares   jsonb;
  v_month    text;
  v_day      text;
  v_pday     text;
  v_err      jsonb;
  v_left     integer;
  v_plan     jsonb;
  v_search   uuid;
  v_round    uuid;
  v_id       uuid;
begin
  if v_user is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  if not public.has_permission(v_user, p_tenant_id, 'find') then
    raise exception 'Only an owner or a partner can import leads.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows) = 0 or jsonb_array_length(p_rows) > public.lead_cap('list_rows') then
    raise exception 'rows: 1 to %', public.lead_cap('list_rows') using errcode = '22023';
  end if;
  if char_length(v_name) = 0 then
    raise exception 'a list is named' using errcode = '22023';
  end if;
  if p_estimate_usd is null or p_estimate_usd < 0 or p_estimate_usd > public.lead_cap('month_usd') then
    raise exception 'estimate: 0 to % usd', public.lead_cap('month_usd') using errcode = '22023';
  end if;
  if not public.lead_searches_on(p_tenant_id) then
    return jsonb_build_object('error', 'paused', 'sentence', 'Lead searches are paused for now, and a list is checked the way a search is. Nothing was imported.');
  end if;

  -- Each row once, read as the page read it (contracts leadImportRowsOf) and read again here: a business name and an
  -- address, the rest only when it is well formed. Nothing is written until every row is placed.
  for v_x in select value from jsonb_array_elements(p_rows) loop
    v_email := lower(btrim(coalesce(v_x->>'email', '')));
    if char_length(v_email) > 254 or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'
       or char_length(btrim(coalesce(v_x->>'name', ''))) = 0 then
      v_unread := v_unread + 1;
      continue;
    end if;
    if v_email = any (v_seen) then
      v_twice := v_twice + 1;
      continue;
    end if;
    v_seen  := v_seen || v_email;
    v_phone := case when v_x->>'phone' ~ '^\+[1-9][0-9]{6,14}$' then v_x->>'phone' end;
    -- Never a customer's: a person in People holds the address (as theirs, or as one they wrote from) or the number.
    if exists (select 1 from public.contacts c where c.tenant_id = p_tenant_id and c.erased_at is null
                 and (c.email = v_email or (v_phone is not null and c.phone_e164 = v_phone)))
       or exists (select 1 from public.contact_identities i
                    join public.contacts c on c.id = i.contact_id and c.erased_at is null
                   where i.tenant_id = p_tenant_id and i.channel = 'email' and i.external_id = v_email) then
      v_customer := v_customer + 1;
      continue;
    end if;
    -- Never the never-again list: the address (the one predicate, 00220) or the number.
    if public.lead_address_suppressed(p_tenant_id, v_email)
       or (v_phone is not null and exists (select 1 from public.lead_suppressions x
             where x.tenant_id = p_tenant_id and x.kind = 'phone' and x.hash = public.lead_suppression_hash(p_tenant_id, v_phone))) then
      v_never := v_never + 1;
      continue;
    end if;
    -- An address already a lead joins as that lead, never a copy, and the row changes nothing of what it holds (J4).
    -- One counted in a kept search joins counted; any other is checked with the rest, but for one another round is
    -- checking now, which is left for that round to answer (its check waits for exactly the addresses it asked).
    select l.id into v_lead from public.leads l
     where l.tenant_id = p_tenant_id and l.email = v_email and l.erased_at is null and l.blanked_at is null
     order by l.found_at
     limit 1;
    if v_lead is not null then
      if exists (select 1 from public.lead_search_members m
                   join public.lead_searches s on s.id = m.search_id and s.removed_at is null
                  where m.lead_id = v_lead and m.counted and m.blanked_at is null) then
        v_counted := v_counted || v_lead;
      elsif exists (select 1 from public.lead_search_members m join public.lead_rounds r on r.id = m.round_id
                     where m.lead_id = v_lead and r.state <> 'ended') then
        v_busy := v_busy + 1;
      else
        v_check := v_check || v_lead;
      end if;
      continue;
    end if;
    v_host   := case when lower(v_x->>'website_host') ~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$'
                     and char_length(v_x->>'website_host') <= 120 then lower(v_x->>'website_host') end;
    v_region := case when v_x->>'region' ~ '^[A-Z]{2}$' then v_x->>'region' end;
    v_new := v_new || jsonb_build_object(
      'name', left(btrim(v_x->>'name'), 200), 'email', v_email, 'phone', v_phone, 'host', v_host,
      'city', nullif(left(btrim(coalesce(v_x->>'city', '')), 120), ''), 'region', v_region,
      'category', nullif(left(btrim(coalesce(v_x->>'category', '')), 120), ''));
  end loop;

  v_n := jsonb_array_length(v_new) + coalesce(array_length(v_check, 1), 0);
  if v_n + coalesce(array_length(v_counted, 1), 0) = 0 then
    return jsonb_build_object('error', 'nothing', 'sentence', 'None of these rows can be written to: each is already in People, on your never-again list, being checked in another search, or missing a name or an address.',
      'left_out', jsonb_build_object('unreadable', v_unread, 'twice', v_twice, 'customer', v_customer, 'never_again', v_never, 'elsewhere', v_busy));
  end if;

  -- What a list costs (J3): a lead of the month for each address it checks, and the check's cents, reserved as a
  -- search reserves, never under the checker run's own floor ($0.50, core check.ts); what does not check out goes back
  -- when the round ends.
  v_month := public.lead_month(p_tenant_id, now());
  v_day   := public.lead_day(p_tenant_id, now());
  v_pday  := to_char(now() at time zone 'UTC', 'YYYY-MM-DD');
  if v_n > 0 then
    v_err := public.lead_reserve(p_tenant_id, v_month, v_day, v_pday, v_n, v_estimate);
    if v_err is not null then
      if v_err->>'error' = 'month_leads_used' then
        v_left := coalesce((v_err->>'left')::integer, 0);
        return jsonb_build_object('error', 'month_leads_used', 'left', v_left,
          'sentence', case when v_left <= 0
            then 'This month''s ' || public.lead_cap('month_leads') || ' leads are used, and a list counts each address that checks out. Your leads renew on ' || public.lead_renews_on(p_tenant_id) || '.'
            else 'This list has ' || v_n || ' addresses to check and you have ' || v_left || case when v_left = 1 then ' lead' else ' leads' end
              || ' left this month; a list counts each address that checks out. Import at most ' || v_left || ' now, or the rest when your leads renew on ' || public.lead_renews_on(p_tenant_id) || '.' end);
      end if;
      return v_err;
    end if;
  end if;

  -- The search, with the plan's shape and no area (J8): nothing searches it again.
  v_plan := jsonb_build_object('version', 1, 'card', 'local_businesses', 'list', 'import', 'name', v_name,
    'asked', coalesce(nullif(v_asked, ''), v_name), 'terms', '[]'::jsonb, 'count', v_n, 'contact', 'email',
    'criteria', '[]'::jsonb, 'exclusions', '[]'::jsonb);
  insert into public.lead_searches (tenant_id, created_by, via, card, name, asked, plan)
  values (p_tenant_id, v_user, 'import', 'local_businesses', v_name, coalesce(nullif(v_asked, ''), v_name), v_plan)
  returning id into v_search;
  insert into public.lead_rounds (tenant_id, search_id, seq, purpose, plan, plan_version, target, state, allowance_reserved,
                                  cost_reserved_usd, month, day, platform_day)
  values (p_tenant_id, v_search, 1, 'main', v_plan, 1, v_n, 'queued', v_n, case when v_n > 0 then v_estimate else 0 end,
          v_month, v_day, v_pday)
  returning id into v_round;

  -- The new leads and the ones to check again wait in Needs review for their address alone (J2): the one reason
  -- lead_check_commit (00145) promotes on once the address checks out. A new lead that shares a number or a website
  -- with another of the workspace's leads (one found, or an earlier row of this file) carries the share, as the finder
  -- marks one (00237): the audience never writes to it, so one business is never written to twice.
  for v_x in select value from jsonb_array_elements(v_new) loop
    insert into public.leads (tenant_id, business_name, category, city, region, website_host, phone_e164, email, email_state)
    values (p_tenant_id, v_x->>'name', v_x->>'category', v_x->>'city', v_x->>'region', v_x->>'host', v_x->>'phone',
            v_x->>'email', 'checking')
    returning id into v_id;
    select coalesce(jsonb_agg(jsonb_build_object('kind', x.kind, 'lead_id', x.id)), '[]'::jsonb) into v_shares
      from (select l.id, case when v_x->>'phone' is not null and l.phone_e164 = v_x->>'phone' then 'phone' else 'host' end as kind
              from public.leads l
             where l.tenant_id = p_tenant_id and l.id <> v_id and l.erased_at is null and l.blanked_at is null
               and ((v_x->>'phone' is not null and l.phone_e164 = v_x->>'phone')
                 or (v_x->>'host' is not null and l.website_host = v_x->>'host'))
             limit 5) x;
    insert into public.lead_search_members (search_id, lead_id, round_id, tenant_id, judgment, class, reason)
    values (v_search, v_id, v_round, p_tenant_id,
            jsonb_build_object('reasons', jsonb_build_array('email:checking'), 'shares', v_shares), 'review', '');
  end loop;
  update public.leads set email_state = 'checking'
   where tenant_id = p_tenant_id and id = any (v_check) and email_state <> 'checking';
  insert into public.lead_search_members (search_id, lead_id, round_id, tenant_id, judgment, class, reason)
  select v_search, x, v_round, p_tenant_id, jsonb_build_object('reasons', jsonb_build_array('email:checking')), 'review', ''
    from unnest(v_check) as x
  on conflict (search_id, lead_id) do nothing;
  -- A lead already counted joins counted, and draws nothing again (one lead, one charge). It joins outside the round:
  -- the round is the check's, so its bell counts what the check answered, and Remove the ones you haven't touched
  -- (lead_search_undo, 00142, which gives back the round's untouched counted members) never gives back what never drew.
  insert into public.lead_search_members (search_id, lead_id, round_id, tenant_id, class, fit, counted, counted_month)
  select v_search, x, null, p_tenant_id, 'qualified',
         (select m.fit from public.lead_search_members m where m.lead_id = x and m.counted and m.blanked_at is null
           order by case m.fit when 'strong' then 0 when 'look' then 1 when 'long' then 2 else 3 end limit 1),
         true, v_month
    from unnest(v_counted) as x
  on conflict (search_id, lead_id) do nothing;

  if v_n > 0 then
    update public.lead_rounds set state = 'running', started_at = now() where id = v_round;
    update public.lead_rounds set state = 'checking' where id = v_round;
    insert into public.jobs (tenant_id, kind, due_at, payload)
    values (p_tenant_id, 'lead_check', now(), jsonb_build_object('round_id', v_round, 'batch', 0));
  else
    update public.lead_rounds set state = 'ended', ending = 'target_reached', ended_at = now() where id = v_round;
  end if;
  insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
  values (p_tenant_id, 'lead.round', 'lead', 'lead_round', v_round,
          jsonb_build_object('search_id', v_search, 'seq', 1, 'state', case when v_n > 0 then 'checking' else 'ended' end,
                             'purpose', 'main', 'via', 'import', 'target', v_n, 'by', v_user));
  return jsonb_build_object('search_id', v_search, 'round_id', v_round,
    'added', jsonb_array_length(v_new), 'checking', v_n, 'counted', coalesce(array_length(v_counted, 1), 0),
    'left_out', jsonb_build_object('unreadable', v_unread, 'twice', v_twice, 'customer', v_customer, 'never_again', v_never,
                                   'elsewhere', v_busy));
end $$;


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
  -- Outside the round, as a file's joined leads are: Remove the ones you haven't touched gives back nothing here.
  insert into public.lead_search_members (search_id, lead_id, round_id, tenant_id, class, fit, counted, counted_month)
  select v_search, x, null, p_tenant_id, 'qualified',
         (select m.fit from public.lead_search_members m where m.lead_id = x and m.counted and m.blanked_at is null
           order by case m.fit when 'strong' then 0 when 'look' then 1 when 'long' then 2 else 3 end limit 1),
         true, v_month
    from unnest(v_join) as x
  on conflict (search_id, lead_id) do nothing;
  update public.lead_rounds set state = 'ended', ending = 'target_reached', ended_at = now() where id = v_round;
  insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
  values (p_tenant_id, 'lead.round', 'lead', 'lead_round', v_round,
          jsonb_build_object('search_id', v_search, 'seq', 1, 'state', 'ended', 'purpose', 'main', 'via', 'chosen',
                             'target', cardinality(v_join), 'by', v_user));
  return jsonb_build_object('search_id', v_search, 'round_id', v_round, 'counted', cardinality(v_join),
    'left_out', jsonb_build_object('not_counted', v_uncount, 'no_email', v_nomail, 'gone', v_gone));
end $$;


comment on function public.lead_reserve(uuid, text, text, text, integer, numeric) is
  'Reserves p_leads from the month''s allowance and p_usd from the month''s budget, the workspace''s day and the platform''s day (the UTC day p_platform_day, which the round stores), each cap lead_cap''s (00268), in that lock order; null when reserved, else {error, sentence} naming the cap that binds (§0.2, §13.3).';

comment on function public.lead_search_import(uuid, text, text, jsonb, numeric) is
  'An owner''s or a partner''s file of leads (1 to lead_cap(''list_rows'') rows of {name, email, phone?, website_host?, city?, region?, category?}) as a search of its own, via import (00242, J2-J6). A row without a name or an address, a second row of one address, an address or number a person in People holds and one on the never-again list are left out and counted. An address already a lead joins as that lead: counted in a kept search, it joins counted, outside the round, and draws nothing; one another round is checking is left out (elsewhere); otherwise it is checked. Every other address is a new lead in Needs review for its address alone, marked with any lead it shares a number or a website with, checked by the finder''s own round (queued, running, checking; a lead_check job), which lead_check_commit settles. One lead of the month is reserved per address checked, with the check''s estimate, never under $0.50 ({error: month_leads_used | budget_used | day_cap, sentence}); paused searching refuses ({error: paused}); nothing to add refuses ({error: nothing}). Returns {search_id, round_id, added, checking, counted, left_out: {unreadable, twice, customer, never_again, elsewhere}}.';

comment on function public.lead_search_choose(uuid, text, uuid[]) is
  'An acting member''s choice of leads (1 to lead_cap(''list_rows'') ids) as a search of its own, via chosen, for a reach-out to write to (00242, J7). Only a lead of this workspace with an address and counted in one of its kept searches joins, Qualified and counted without drawing the month again; the rest are counted as not_counted, no_email or gone. Its round is made and ended at once (target_reached), so nothing is checked and nothing rings. Refuses {error: nothing, sentence} when none joins. Returns {search_id, round_id, counted, left_out: {not_counted, no_email, gone}}.';

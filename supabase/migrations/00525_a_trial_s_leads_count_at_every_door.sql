-- A trial's leads count at every door (decision 0090's follow-up, named when #2069 landed).
--
-- 00512 made lead_allowance the cap a workspace counts its leads against: lead_cap('trial_leads'), 50, while its
-- billing says trialing, else lead_cap('month_leads'), 500. lead_reserve asks it, so a search, a search's more and a
-- list are held to a trial's 50 where they reserve. Two doors count a lead without a reservation and still held the
-- month's counter to the month's 500, so a trial counted past its 50 through them; and the list's refusal named the
-- month's 500 and its renewal to a trial that had neither:
--
--   lead_member_move     Keep and Put back (lead_member_keep, lead_member_put_back, and lead_bulk's keep, which goes
--                        through it): held to lead_allowance, a trial refused in lead_reserve's words for a trial
--                        whose leads are found
--   lead_check_commit    a member in Needs review on its address alone, whose address checks out after its round
--                        ended (Check again, the addressee chosen): counted within lead_allowance, else left in
--                        review as a full month leaves it
--   lead_search_import   its month_leads_used refusal says the allowance lead_reserve counted against, and the
--                        trial's words on a trial
--
-- Each is re-created whole from its newest body (00506's lead_check_commit, 00364's lead_member_move and
-- lead_search_import) with only that changed; grants and comments as they were. lead_reserve's comment stops saying
-- the other doors keep the month's. Deploy order: either; no route changes, since a route says a door's sentence as
-- the door wrote it (refusalOf). Re-runnable.

set local lock_timeout = '3s';

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
      -- The allowance is full (lead_allowance: a trial's own while on a trial, 00525): the member stays Needs review
      -- with its address now known good, for Keep to count later.
      if v_counter.used + v_counter.reserved + 1 > public.lead_allowance(v_round.tenant_id) then
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
revoke all on function public.lead_check_commit(uuid, uuid, jsonb, numeric, boolean) from public, anon, authenticated;
grant execute on function public.lead_check_commit(uuid, uuid, jsonb, numeric, boolean) to service_role;
comment on function public.lead_check_commit(uuid, uuid, jsonb, numeric, boolean) is
  'A batch of mailbox answers ([{lead_id, email_state, checked_at}]) from the check run p_run_id: each lead''s state is set (never a blanked or erased one); a member of the round held in review by the email standard alone, whose address now checks out, is Qualified -- counted through the round''s reservation while the round runs, and through the month''s allowance the way Keep is once the round has ended (Check again, 00145; it stays in review when the month is full). The run''s usage settles by its total so far (E4). p_last ends the round with the ending left pending, or by its target. Returns {ok, qualified, counted, ended}.';

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
  v_cap     numeric;
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
      -- Neither Put back nor Keep revives a suppression or an out-of-area place (§0.1). A place's suppression is asked
      -- of a lead that has a place: one a list of the owner's own brought has none (00242), and a lead blanked or
      -- erased, which loses or keeps its place, was refused above (00364).
      if l.place_id is not null and exists (select 1 from public.lead_suppressions x where x.tenant_id = s.tenant_id and x.kind = 'place'
                    and x.what in ('customer', 'erased') and x.hash = public.lead_suppression_hash(s.tenant_id, l.place_id)) then
        return jsonb_build_object('error', 'hidden');
      end if;
      if m.judgment->'reasons' ? 'out_of_area' then
        return jsonb_build_object('error', 'out_of_area');
      end if;
    elsif not (m.class = 'review' or (m.class = 'qualified' and not m.counted)) then
      return jsonb_build_object('error', 'state', 'class', m.class);
    end if;
    -- Keep and Put back count, through the month's allowance (§0.2): a trial's own while on a trial (lead_allowance,
    -- 00525), refused in lead_reserve's words for it.
    if not m.counted then
      v_month := public.lead_month(s.tenant_id, now());
      v_counter := public.lead_counter_take(s.tenant_id, 'allowance', v_month);
      v_cap := public.lead_allowance(s.tenant_id);
      if v_counter.used + v_counter.reserved + 1 > v_cap then
        return jsonb_build_object('error', 'month_leads_used', 'left', 0,
          'sentence', case when v_cap = public.lead_cap('trial_leads') and v_cap <> public.lead_cap('month_leads')
            then 'Your free trial includes ' || v_cap || ' leads, and they are found. Start your plan from Billing to find more.'
            else 'You have found this month''s ' || v_cap || ' leads. Your leads renew on ' || public.lead_renews_on(s.tenant_id) || '.' end);
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
revoke all on function public.lead_member_move(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.lead_member_move(uuid, uuid, text) to service_role;
comment on function public.lead_member_move(uuid, uuid, text) is
  'The body of lead_member_keep, lead_member_exclude and lead_member_put_back: the state each expects, the change, the allowance when it counts, and one lead_operations row with the member''s new version. {error: removed} on a search that was removed, as lead_search_more says it. Put back refuses a blanked or erased lead and a place a customer or an erasure suppressed ({error: hidden}); a lead with no place, as a list of the owner''s own brings (00242), is put back like any other (00364).';

create or replace function public.lead_search_import(p_tenant_id uuid, p_name text, p_asked text, p_rows jsonb, p_estimate_usd numeric)
returns jsonb
language plpgsql
security definer
set search_path = public
as $_$
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
  v_cap      numeric;
  v_trial    boolean;
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
  -- The estimate is the route's to compute (leadImportEstimateUsd) and never more than checking these rows can cost (00364).
  if p_estimate_usd > public.lead_estimate_ceiling('list', jsonb_array_length(p_rows)) then
    raise exception 'estimate: 0 to % usd for this list', public.lead_estimate_ceiling('list', jsonb_array_length(p_rows))
      using errcode = '22023';
  end if;
  if not public.lead_searches_on(p_tenant_id) then
    return jsonb_build_object('error', 'paused', 'sentence', 'Lead searches are paused for now, and a list is checked the way a search is. Nothing was imported.');
  end if;
  -- A list is checked at the provider, on the platform's account: a workspace that may not spend is refused before a
  -- row is read (00364), as the route refuses it.
  v_err := public.lead_spend_refusal(p_tenant_id);
  if v_err is not null then
    return v_err;
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
        -- The allowance lead_reserve counted against (00525): a trial's own is said in the trial's words, as lead_reserve says it.
        v_cap := public.lead_allowance(p_tenant_id);
        v_trial := v_cap = public.lead_cap('trial_leads') and v_cap <> public.lead_cap('month_leads');
        return jsonb_build_object('error', 'month_leads_used', 'left', v_left,
          'sentence', case
            when v_trial and v_left <= 0
              then 'Your free trial includes ' || v_cap || ' leads, and they are used: a list counts each address that checks out. Start your plan from Billing to import more.'
            when v_trial
              then 'This list has ' || v_n || ' addresses to check and your free trial has ' || v_left || case when v_left = 1 then ' lead' else ' leads' end
                || ' left; a list counts each address that checks out. Import at most ' || v_left || ' now, or start your plan from Billing to import them all.'
            when v_left <= 0
              then 'This month''s ' || v_cap || ' leads are used, and a list counts each address that checks out. Your leads renew on ' || public.lead_renews_on(p_tenant_id) || '.'
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
end $_$;
revoke all on function public.lead_search_import(uuid, text, text, jsonb, numeric) from public, anon;
grant execute on function public.lead_search_import(uuid, text, text, jsonb, numeric) to authenticated, service_role;
comment on function public.lead_search_import(uuid, text, text, jsonb, numeric) is
  'An owner''s or a partner''s file of leads (1 to lead_cap(''list_rows'') rows of {name, email, phone?, website_host?, city?, region?, category?}) as a search of its own, via import (00242, J2-J6). A row without a name or an address, a second row of one address, an address or number a person in People holds and one on the never-again list are left out and counted. An address already a lead joins as that lead: counted in a kept search, it joins counted, outside the round, and draws nothing; one another round is checking is left out (elsewhere); otherwise it is checked. Every other address is a new lead in Needs review for its address alone, marked with any lead it shares a number or a website with, checked by the finder''s own round (queued, running, checking; a lead_check job), which lead_check_commit settles. One lead of the month is reserved per address checked, with the check''s estimate, never under $0.50 and never over lead_estimate_ceiling(''list'', rows) (00364) ({error: month_leads_used | budget_used | day_cap, sentence}); paused searching refuses ({error: paused}); a workspace that may not spend refuses ({error: payment_required, sentence}: lead_spend_refusal, 00364); nothing to add refuses ({error: nothing}). Returns {search_id, round_id, added, checking, counted, left_out: {unreadable, twice, customer, never_again, elsewhere}}.';

comment on function public.lead_reserve(uuid, text, text, text, integer, numeric) is
  'Reserves p_leads from the workspace''s allowance (lead_allowance: the trial''s while on a trial, else the month''s; 00512) and p_usd from the month''s budget, the workspace''s day and the platform''s day (the UTC day p_platform_day, which the round stores), each cap lead_cap''s (00272), in that lock order; null when reserved, else {error, sentence} naming the cap that binds (§0.2, §13.3). The trial''s cap is held here, where a search''s money leaves, and where a lead counts without a reservation (00525): a Keep or a Put back (lead_member_move) and a check''s commit after its round ended (lead_check_commit).';

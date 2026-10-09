-- 00363 · A search is paid for, a lead from a list can be put back, and a token refreshed never undoes a reconnect.
--
-- Three doors a member's session reaches, each closed where it decides.
--
-- The finder's four spending doors (lead_search_create, lead_search_import, lead_search_more, lead_check_again) are
-- granted to `authenticated`, and asked only the role, the switch and the counters. Whether the workspace may spend on
-- the platform's account at all was asked by the dashboard's route alone (requireSpend, `spend: true`), so an owner
-- whose plan was a trial, past due, canceled or unpaid could call a door from the browser's own Supabase client and
-- start paid runs at the provider. And the estimate each door reserves was the caller's to name, up to the month's $25,
-- against the platform's $50 for the UTC day, so a few workspaces could hold every other workspace's searching.
--
--   billing_may_spend     contracts' maySpend, restated once in SQL as has_permission restates ROLE_PERMS: a workspace
--                         invoiced by hand (mode direct) may; one on Stripe may only while its plan is active (not
--                         trialing, past_due, incomplete, none, paused, canceled, unpaid or incomplete_expired); one
--                         with no billing row may not. A partner's seat spends the business's plan: the row asked is
--                         the workspace's, whoever asks.
--   lead_spend_refusal    null when the workspace may spend, else {error: payment_required, sentence}: the sentence
--                         whyCannotSpend writes for finding leads (SPEND_LEADS), and requireSpend's for a workspace with
--                         no billing record. Each of the four doors returns it before it reserves or schedules
--                         anything, as it returns paused. lead-spend.db.test.mjs holds the words to contracts'.
--   lead_estimate_ceiling The most a door takes as an estimate: what the route computes for the plan (estimateForRound,
--                         or leadImportEstimateUsd for a list) can never pass it, and a caller's own number may not.
--                         'search': the probe's 25 places and the main phase's places at the yield assumed before a
--                         probe (two places a lead, never past LEAD_MAX_PLACES), each at the card's dearest price
--                         (discovery, contacts, the judge and the mailbox check), a start for each term in each phase,
--                         with the estimate's margin, rounded up to the cent; and the actor's $0.50 floor on a run's cap
--                         for each term in each phase, which a round's runs need to start at all. 'list': the mailbox
--                         check a row, with the margin, rounded up, and one checker run's floor. A count of 1 with five
--                         terms is $5.29; 1,000 is $15.92; a list of 500 is $1.08. lead-spend.db.test.mjs compares the
--                         route's own estimates against it, count by count. An estimate over it raises 22023, as one
--                         over the month's budget already did; that check stays first, with its words.
--
-- lead_member_move refused Put back for every lead with no place (`l.place_id is null`), which is every lead a list of
-- the owner's own brought (00242): an imported lead once excluded could never come back. A blanked or erased lead is
-- refused just above it; the suppression asked below it is a place's, so it is asked of a lead that has a place.
--
-- put_google_credentials gains p_if_refresh_token (default null, so every caller that names two arguments keeps its
-- meaning). Named, the token is written only while the one stored still carries that refresh token, under a lock on
-- the connection's row that every write of the token takes; otherwise it raises 40001 and writes nothing. The edge's
-- refresh (tokenFor) names the token it read, so a reconnect stored between its read and its write is never undone by
-- the old grant's token. The function is dropped and made again with its third argument: two of one name would leave
-- a two-argument call ambiguous.
--
-- Either deploy order works. An edge that names p_if_refresh_token to a database before this migration is answered as
-- a function PostgREST cannot find (PGRST202), and writes the refresh as it always did; one before the edge's change
-- names two arguments, which the default keeps. The dashboard on main works with it: its route asks requireSpend first
-- and its estimates sit under the ceiling. Run in one transaction, so no call meets the token's door half made.
-- Re-runnable throughout.

set local lock_timeout = '3s';

create or replace function public.billing_may_spend(p_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  -- contracts maySpend: a workspace invoiced by hand may; on Stripe only an active plan; no billing row, never.
  select coalesce((select b.mode <> 'stripe' or b.status = 'active'
                     from public.billing_accounts b
                    where b.tenant_id = p_tenant_id), false)
$$;
revoke all on function public.billing_may_spend(uuid) from public, anon, authenticated;
grant execute on function public.billing_may_spend(uuid) to service_role;
comment on function public.billing_may_spend(uuid) is
  'Whether this workspace may incur a cost on the platform''s account: contracts'' maySpend, restated once in SQL (00363). mode direct may; mode stripe only with status active; no billing row may not. The finder''s spending doors ask it through lead_spend_refusal.';

create or replace function public.lead_spend_refusal(p_tenant_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  b public.billing_accounts;
begin
  if public.billing_may_spend(p_tenant_id) then
    return null;
  end if;
  select * into b from public.billing_accounts where tenant_id = p_tenant_id;
  -- whyCannotSpend(mode, status, SPEND_LEADS), word for word; requireSpend's own words for no row.
  return jsonb_build_object('error', 'payment_required', 'sentence', case
    when b.tenant_id is null then 'This workspace has no billing record. Open Billing to set one up.'
    when b.status = 'none' then 'Start your plan from Billing before finding leads.'
    when b.status = 'trialing' then 'Your free trial doesn''t cover finding leads. Start your plan from Billing, then find leads.'
    when b.status = 'incomplete' then 'Your card is not confirmed yet. Finish checkout in Billing, then try again.'
    when b.status = 'past_due' then 'Your last payment did not go through. Update the card in Billing, then try again.'
    when b.status in ('paused', 'canceled', 'incomplete_expired') then 'This workspace is not subscribed. Start it again from Billing before finding leads.'
    else 'Billing needs attention before this workspace can find leads. Open Billing to sort it out.' end);
end $$;
revoke all on function public.lead_spend_refusal(uuid) from public, anon, authenticated;
grant execute on function public.lead_spend_refusal(uuid) to service_role;
comment on function public.lead_spend_refusal(uuid) is
  'Null when the workspace may spend (billing_may_spend), else {error: payment_required, sentence}: whyCannotSpend''s sentence for finding leads, or requireSpend''s for no billing record (00363). lead_search_create, lead_search_import, lead_search_more and lead_check_again return it before they reserve or schedule anything.';

create or replace function public.lead_estimate_ceiling(p_kind text, p_count integer, p_terms integer default 5)
returns numeric
language plpgsql
immutable
set search_path = public
as $$
declare
  -- The card's prices a place (contracts LEAD_CARDS, local_businesses): discovery, contacts, the judge and the mailbox
  -- check, the dearest standard's whole; a run's start; the estimate's room (LEAD_ESTIMATE_MARGIN); the actor's floor on
  -- a run's cap (core MAPS_CAP_FLOOR_USD).
  v_place  numeric := 0.003 + 0.002 + 0.0023 + 0.00089;
  v_check  numeric := 0.00089;
  v_start  numeric := 0.00005;
  v_margin numeric := 1.3;
  v_floor  numeric := 0.5;
  v_count  integer := least(greatest(coalesce(p_count, 1), 1), 1000);
  v_terms  integer := least(greatest(coalesce(p_terms, 5), 1), 5);
begin
  if p_kind = 'search' then
    -- The probe's 25 places and the main phase's at the assumed yield (LEAD_ASSUMED_YIELD, a half: two places a lead,
    -- never past LEAD_MAX_PLACES), a start a term in each phase, with the room; and a run's floor a term in each phase.
    return round(ceil(((25 + least(1000, 2 * v_count)) * v_place + 2 * v_terms * v_start) * v_margin * 100) / 100
                 + 2 * v_terms * v_floor, 2);
  elsif p_kind = 'list' then
    -- The mailbox check a row, with the room, and one checker run's floor (a list is one batch: CHECK_BATCH, list_rows).
    return round(ceil(v_count * v_check * v_margin * 100) / 100 + v_floor, 2);
  end if;
  -- A kind it does not know is a mistake in the caller, never "no ceiling".
  raise exception 'lead_estimate_ceiling: no kind is named %', coalesce(p_kind, 'null') using errcode = '22023';
end $$;
revoke all on function public.lead_estimate_ceiling(text, integer, integer) from public, anon, authenticated;
grant execute on function public.lead_estimate_ceiling(text, integer, integer) to service_role;
comment on function public.lead_estimate_ceiling(text, integer, integer) is
  'The most a finder door takes as its estimate (00363). search: ceil(((25 + least(1000, 2 x count)) x $0.00819 + 2 x terms x $0.00005) x 1.3, to the cent) + 2 x terms x $0.50, the probe and the main phase at the assumed yield at the card''s dearest place, and a run''s floor a term in each phase; list: ceil(rows x $0.00089 x 1.3, to the cent) + $0.50. What the route computes (estimateForRound, leadImportEstimateUsd) never passes it; lead-spend.db.test.mjs compares them.';

-- The four spending doors, each copied from its latest definition with the ceiling and lead_spend_refusal added.

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
  -- The estimate is the route's to compute (estimateForRound) and never more than this plan can cost (00363).
  if p_estimate_usd > public.lead_estimate_ceiling('search', v_count, jsonb_array_length(p_plan->'terms')) then
    raise exception 'estimate: 0 to % usd for this plan', public.lead_estimate_ceiling('search', v_count, jsonb_array_length(p_plan->'terms'))
      using errcode = '22023';
  end if;

  if not public.lead_searches_on(p_tenant_id) then
    return jsonb_build_object('error', 'paused', 'sentence', 'Lead searches are paused for now. Your leads are all here, and nothing is being counted.');
  end if;
  -- A workspace that may not spend is refused before anything is written (00363): the route asks requireSpend, and this
  -- door is the session's, so it asks too.
  v_err := public.lead_spend_refusal(p_tenant_id);
  if v_err is not null then
    return v_err;
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
revoke all on function public.lead_search_create(uuid, jsonb, text, numeric, uuid) from public, anon;
grant execute on function public.lead_search_create(uuid, jsonb, text, numeric, uuid) to authenticated, service_role;
comment on function public.lead_search_create(uuid, jsonb, text, numeric, uuid) is
  'Owner. Checks the plan (version 1, the shape) and the estimate (at most lead_estimate_ceiling for its count and terms, 00363), the switch ({error: paused}), whether the workspace may spend ({error: payment_required, sentence}: lead_spend_refusal, 00363), the card ({error: no_card}, logged as demand), then in one transaction reserves the count from the month''s allowance and the estimate from the budget and both day caps ({error: month_leads_used | budget_used | day_cap}, each with a sentence), inserts the search, its probe round (seq 1, target least(25, count)), the start job and the event. p_thread_id (00172) is the Ask thread the search was planned in, kept only when it is the caller''s own in this workspace, else null. Returns {search_id, round_id}.';

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
  -- The estimate is the route's to compute (leadImportEstimateUsd) and never more than checking these rows can cost (00363).
  if p_estimate_usd > public.lead_estimate_ceiling('list', jsonb_array_length(p_rows)) then
    raise exception 'estimate: 0 to % usd for this list', public.lead_estimate_ceiling('list', jsonb_array_length(p_rows))
      using errcode = '22023';
  end if;
  if not public.lead_searches_on(p_tenant_id) then
    return jsonb_build_object('error', 'paused', 'sentence', 'Lead searches are paused for now, and a list is checked the way a search is. Nothing was imported.');
  end if;
  -- A list is checked at the provider, on the platform's account: a workspace that may not spend is refused before a
  -- row is read (00363), as the route refuses it.
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
end $_$;
revoke all on function public.lead_search_import(uuid, text, text, jsonb, numeric) from public, anon;
grant execute on function public.lead_search_import(uuid, text, text, jsonb, numeric) to authenticated, service_role;
comment on function public.lead_search_import(uuid, text, text, jsonb, numeric) is
  'An owner''s or a partner''s file of leads (1 to lead_cap(''list_rows'') rows of {name, email, phone?, website_host?, city?, region?, category?}) as a search of its own, via import (00242, J2-J6). A row without a name or an address, a second row of one address, an address or number a person in People holds and one on the never-again list are left out and counted. An address already a lead joins as that lead: counted in a kept search, it joins counted, outside the round, and draws nothing; one another round is checking is left out (elsewhere); otherwise it is checked. Every other address is a new lead in Needs review for its address alone, marked with any lead it shares a number or a website with, checked by the finder''s own round (queued, running, checking; a lead_check job), which lead_check_commit settles. One lead of the month is reserved per address checked, with the check''s estimate, never under $0.50 and never over lead_estimate_ceiling(''list'', rows) (00363) ({error: month_leads_used | budget_used | day_cap, sentence}); paused searching refuses ({error: paused}); a workspace that may not spend refuses ({error: payment_required, sentence}: lead_spend_refusal, 00363); nothing to add refuses ({error: nothing}). Returns {search_id, round_id, added, checking, counted, left_out: {unreadable, twice, customer, never_again, elsewhere}}.';

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
  -- The estimate is the route's to compute (estimateForRound) and never more than this plan can cost (00363). Held to
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
  if not public.lead_searches_on(s.tenant_id) then
    return jsonb_build_object('error', 'paused', 'sentence', 'Lead searches are paused for now. Your leads are all here, and nothing is being counted.');
  end if;
  -- A workspace that may not spend is refused before anything is reserved (00363), as the route refuses it.
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
  values (s.tenant_id, p_search_id, last.seq + 1, p_purpose, p_plan, v_version, v_target, 'queued', v_target, p_estimate_usd, v_month, v_day, v_pday)
  returning id into v_round;
  insert into public.jobs (tenant_id, kind, due_at, payload)
  values (s.tenant_id, 'lead_round_start', now(), jsonb_build_object('round_id', v_round));
  insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
  values (s.tenant_id, 'lead.round', 'lead', 'lead_round', v_round,
          jsonb_build_object('search_id', p_search_id, 'seq', last.seq + 1, 'state', 'queued', 'purpose', p_purpose, 'target', v_target, 'by', v_user));
  return jsonb_build_object('search_id', p_search_id, 'round_id', v_round, 'seq', last.seq + 1, 'target', v_target);
end $$;
revoke all on function public.lead_search_more(uuid, text, jsonb, numeric) from public, anon;
grant execute on function public.lead_search_more(uuid, text, jsonb, numeric) to authenticated, service_role;
comment on function public.lead_search_more(uuid, text, jsonb, numeric) is
  'Owner. A new round on an ended search: topup reserves the count minus what already counted, renew the whole count, through the same reservation as create; the plan is the current version or the next (stored on the search); the estimate at most lead_estimate_ceiling for the plan''s count and terms (00363). {error: live} while a round is open; {error: nothing_to_add} when the count is already met; {error: payment_required, sentence} for a workspace that may not spend (lead_spend_refusal, 00363).';

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
  -- And whether the workspace may spend at all (00363): this door is the session's, so the route's question is asked here too.
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
    update public.leads set email_state = 'checking' where id = any (v_r.lead_ids);
    insert into public.jobs (tenant_id, kind, due_at, payload)
    values (p_tenant_id, 'lead_check', now(),
            jsonb_build_object('round_id', v_r.round_id, 'batch', 0, 'again', gen_random_uuid()::text, 'lead_ids', to_jsonb(v_r.lead_ids)));
    v_ids := v_ids || v_r.lead_ids;
  end loop;
  return jsonb_build_object('scheduled', cardinality(v_ids), 'skipped', cardinality(p_lead_ids) - cardinality(v_ids));
end $$;
revoke all on function public.lead_check_again(uuid, uuid[]) from public, anon;
grant execute on function public.lead_check_again(uuid, uuid[]) to authenticated, service_role;
comment on function public.lead_check_again(uuid, uuid[]) is
  'Owner (permission find). Asks the mailbox check again for the named leads whose last check did not answer (email_state unknown), once their search has finished: each goes to checking and one lead_check job per round is written with {round_id, batch 0, again <nonce>, lead_ids}, so the engine runs it under the round with a run id of its own and commits through lead_check_commit. {error: paused} while searching is off; {error: payment_required, sentence} for a workspace that may not spend (lead_spend_refusal, 00363). Returns {scheduled, skipped}.';

-- Put back, copied from its latest definition (00272) with the place's suppression asked only of a lead with a place.

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
      -- Neither Put back nor Keep revives a suppression or an out-of-area place (§0.1). A place's suppression is asked
      -- of a lead that has a place: one a list of the owner's own brought has none (00242), and a lead blanked or
      -- erased, which loses or keeps its place, was refused above (00363).
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
revoke all on function public.lead_member_move(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.lead_member_move(uuid, uuid, text) to service_role;
comment on function public.lead_member_move(uuid, uuid, text) is
  'The body of lead_member_keep, lead_member_exclude and lead_member_put_back: the state each expects, the change, the allowance when it counts, and one lead_operations row with the member''s new version. {error: removed} on a search that was removed, as lead_search_more says it. Put back refuses a blanked or erased lead and a place a customer or an erasure suppressed ({error: hidden}); a lead with no place, as a list of the owner''s own brings (00242), is put back like any other (00363).';

-- The token's one write path, with the refresh's compare-and-set beside the reconnect's plain write. The two-argument
-- function goes first: kept beside the three-argument one, a call naming two arguments would match both.
drop function if exists public.put_google_credentials(uuid, jsonb);
create or replace function public.put_google_credentials(p_tenant_id uuid, p_secret jsonb, p_if_refresh_token text default null)
returns text
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  v_name text := 'google-creds-' || p_tenant_id::text;
  v_id   uuid;
  v_now  text;
begin
  -- The connection's row, held for the write: every write of this workspace's token takes it first, so a refresh's
  -- compare and its write are one step against a reconnect's.
  perform 1 from public.google_connections where tenant_id = p_tenant_id for update;
  if not found then
    raise exception 'put_google_credentials: no such connection';
  end if;
  -- A refresh writes only over the grant it refreshed: a reconnect stored since it read the token is kept.
  if p_if_refresh_token is not null then
    select (decrypted_secret::jsonb)->>'refresh_token' into v_now from vault.decrypted_secrets where name = v_name;
    if v_now is distinct from p_if_refresh_token then
      raise exception 'put_google_credentials: the token changed since it was read' using errcode = '40001';
    end if;
  end if;
  select id into v_id from vault.secrets where name = v_name;
  if v_id is null then
    perform vault.create_secret(p_secret::text, v_name, 'Google Business Profile token for workspace ' || p_tenant_id::text);
  else
    perform vault.update_secret(v_id, p_secret::text);
  end if;
  update public.google_connections set credentials_ref = v_name where tenant_id = p_tenant_id;
  return v_name;
end $$;
revoke all on function public.put_google_credentials(uuid, jsonb, text) from public, anon, authenticated;
grant execute on function public.put_google_credentials(uuid, jsonb, text) to service_role;
comment on function public.put_google_credentials(uuid, jsonb, text) is
  'Service-role only: stores a workspace''s Google token in Vault under google-creds-<workspace> and points credentials_ref at it. The only write path for the token. With p_if_refresh_token (00363), only while the token stored still carries that refresh token, under a lock on the connection''s row every write takes; otherwise it raises 40001 and writes nothing: a refresh never undoes a reconnect stored since it read.';

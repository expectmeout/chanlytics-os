-- The trial covers everything (decision 0090, Ruben, 3 Nov 2026: "all should be part of the trial ... lead generation is
-- kept separate besides what is included in the tier/trial").
--
-- contracts maySpend now judges a spend by its kind (SPEND_STATUSES): a number, a texting registration and a lead search
-- may each spend on a trial as on a plan. SQL restates the one row it asks, the finder's: billing_may_spend admits
-- trialing beside active, and lead_spend_refusal's sentences are whyCannotSpend's again (a trial is no refusal any more;
-- none is "Start your free trial"). A trial's leads are its own, fewer than a month's: lead_cap('trial_leads') is
-- contracts' LEAD_TRIAL_ALLOWANCE, and lead_allowance says which a workspace counts against, which lead_reserve asks
-- where it asked the month's. Deploy order: either. A dashboard before this one refuses a trial's search at its own door
-- (requireSpend) as it always did; one after it, over a database before this, is refused here in the old words.
-- Re-runnable.

set local lock_timeout = '3s';

create or replace function public.billing_may_spend(p_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  -- contracts maySpend for the finder's kind (SPEND_STATUSES.leads): a workspace invoiced by hand may; on Stripe a trial
  -- or a plan; no billing row, never.
  select coalesce((select b.mode <> 'stripe' or b.status in ('trialing', 'active')
                     from public.billing_accounts b
                    where b.tenant_id = p_tenant_id), false)
$$;
revoke all on function public.billing_may_spend(uuid) from public, anon, authenticated;
grant execute on function public.billing_may_spend(uuid) to service_role;
comment on function public.billing_may_spend(uuid) is
  'Whether this workspace may spend on the finder: contracts'' maySpend(mode, status, "leads"), restated once in SQL (00364, 00512). mode direct may; mode stripe with status trialing or active (decision 0090: the trial covers everything); no billing row may not. The finder''s spending doors ask it through lead_spend_refusal.';

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
    when b.status = 'none' then 'Start your free trial from Billing before finding leads.'
    when b.status = 'incomplete' then 'Your card is not confirmed yet. Finish checkout in Billing, then try again.'
    when b.status = 'past_due' then 'Your last payment did not go through. Update the card in Billing, then try again.'
    when b.status in ('paused', 'canceled', 'incomplete_expired') then 'This workspace is not subscribed. Start it again from Billing before finding leads.'
    else 'Billing needs attention before this workspace can find leads. Open Billing to sort it out.' end);
end $$;
revoke all on function public.lead_spend_refusal(uuid) from public, anon, authenticated;
grant execute on function public.lead_spend_refusal(uuid) to service_role;
comment on function public.lead_spend_refusal(uuid) is
  'Null when the workspace may spend (billing_may_spend), else {error: payment_required, sentence}: whyCannotSpend''s sentence for finding leads, or requireSpend''s for no billing record (00364, 00512). lead_search_create, lead_search_import, lead_search_more and lead_check_again return it before they reserve or schedule anything.';

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
    when 'trial_leads'      then 50    -- ... while its billing says trialing (LEAD_TRIAL_ALLOWANCE, decision 0090)
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

create or replace function public.lead_allowance(p_tenant_id uuid)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  -- contracts leadAllowanceFor: the trial's leads while the workspace is on a trial, else the month's.
  select case when exists (select 1 from public.billing_accounts b
                            where b.tenant_id = p_tenant_id and b.mode = 'stripe' and b.status = 'trialing')
              then public.lead_cap('trial_leads') else public.lead_cap('month_leads') end
$$;
revoke all on function public.lead_allowance(uuid) from public, anon;
grant execute on function public.lead_allowance(uuid) to authenticated, service_role;
comment on function public.lead_allowance(uuid) is
  'The leads a workspace may count this month (00512, decision 0090): lead_cap(''trial_leads'') while its billing says trialing, else lead_cap(''month_leads''). contracts'' leadAllowanceFor; lead_reserve asks it, and the Leads page reads the same number. Readable by a member: it says a cap, never a row.';

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
  v_cap       numeric := public.lead_allowance(p_tenant_id);
  v_trial     boolean := v_cap = public.lead_cap('trial_leads') and v_cap <> public.lead_cap('month_leads');
begin
  v_allowance := public.lead_counter_take(p_tenant_id, 'allowance', p_month);
  if v_allowance.used + v_allowance.reserved + p_leads > v_cap then
    v_left := greatest(v_cap - v_allowance.used - v_allowance.reserved, 0);
    return jsonb_build_object('error', 'month_leads_used', 'left', v_left::integer,
      'sentence', case
        when v_trial and v_left <= 0
          then 'Your free trial includes ' || v_cap || ' leads, and they are found. Start your plan from Billing to find more.'
        when v_trial
          then 'Your free trial has ' || v_left::integer || ' leads left. Find ' || v_left::integer || ' now, or start your plan from Billing to find all ' || p_leads || '?'
        when v_left <= 0
          then 'You have found this month''s ' || v_cap || ' leads. Your leads renew on ' || public.lead_renews_on(p_tenant_id) || '.'
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

-- The trial's use, read by the edge's trial sweep (trialSpentOf): the call seconds and the receptionist's replies since
-- the workspace was made. A workspace on a trial is in its first subscription (a trial applies once), so what it used
-- since it was made is what its trial used, and the free days before it too, which cost the platform the same.
create or replace function public.trial_use(p_tenant_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'call_seconds', coalesce((select sum(greatest(c.duration_ms, 0)) / 1000
                                from public.calls c
                                join public.tenants t on t.id = c.tenant_id
                               where c.tenant_id = p_tenant_id and c.created_at >= t.created_at), 0)::bigint,
    'replies', (select count(*) from public.messages m
                 where m.tenant_id = p_tenant_id and m.direction = 'outbound' and m.sender = 'ai'))
$$;
revoke all on function public.trial_use(uuid) from public, anon, authenticated;
grant execute on function public.trial_use(uuid) to service_role;
comment on function public.trial_use(uuid) is
  'What a workspace has used of what a trial includes (00512, decision 0090): {call_seconds, replies}, the calls'' spoken seconds and the receptionist''s own outbound messages since the workspace was made. The edge''s trial sweep reads it for the workspaces on a trial and starts the plan when contracts'' trialSpentOf says spent. The service role''s.';

comment on function public.lead_reserve(uuid, text, text, text, integer, numeric) is
  'Reserves p_leads from the workspace''s allowance (lead_allowance: the trial''s while on a trial, else the month''s; 00512) and p_usd from the month''s budget, the workspace''s day and the platform''s day (the UTC day p_platform_day, which the round stores), each cap lead_cap''s (00272), in that lock order; null when reserved, else {error, sentence} naming the cap that binds (§0.2, §13.3). The trial''s cap is held here, where a search''s money leaves; a Keep, a check''s commit and an imported list keep the month''s.';

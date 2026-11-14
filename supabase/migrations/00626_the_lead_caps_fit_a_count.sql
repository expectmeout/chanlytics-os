-- The lead caps fit a count (decision 0133, step 1; Ruben's D1, 14 Nov 2026: search cost stays inside the plan's price).
--
-- A search for 300 checked-email leads costs about $12 at the 4¢ a lead the plan budgets, and up to $24 in a dear niche
-- (8¢). The day's $10 stopped it near 250, the month's $25 stopped a dear niche's 500 near 310, and the platform's $50
-- was about 1,250 leads a day for every workspace together. Three caps move, each written as a count it must carry:
--
--   month_usd         25 -> 40    the month's 500 leads at 8¢
--   day_usd           10 -> 25    a search of 300 in a day at 8¢
--   platform_day_usd  50 -> 400   every workspace's day together; a search past it waits for the next day
--
-- The leads a month, a trial's leads and a list's rows are as they were. lead_cap is re-created whole from 00512's body
-- with only those three values changed; create or replace keeps its grants and its comment. contracts' caps.ts says
-- the same numbers, and lead-caps.db.test.mjs holds the two together. Deploy order: either; a cap that rose lets
-- through what the lower one refused, and nothing reads the old values. Re-runnable.

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
    when 'trial_leads'      then 50    -- ... while its billing says trialing (LEAD_TRIAL_ALLOWANCE, decision 0090)
    when 'month_usd'        then 40    -- what searching may cost a workspace in its month (LEAD_MONTHLY_BUDGET_USD)
    when 'day_usd'          then 25    -- ... in its day (LEAD_DAY_CAP_USD)
    when 'platform_day_usd' then 400   -- ... what it may cost the platform in a UTC day (LEAD_PLATFORM_DAY_CAP_USD)
    when 'list_rows'        then 500   -- rows a file brings, leads one press chooses (LEAD_LIST_MAX)
  end;
  -- A name it does not know is a mistake in the caller, never "no cap": a comparison with null would let anything by.
  if v is null then
    raise exception 'lead_cap: no cap is named %', coalesce(p_name, 'null') using errcode = '22023';
  end if;
  return v;
end;
$$;

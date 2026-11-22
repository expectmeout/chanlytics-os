-- 00683 · A visit is worth its service's amount on the day it was booked, and the Ads page says what an ad's bookings
-- are worth beside what the ad cost (the Ads tracking plan's T6, 22 Nov 2026; its call 5, taken as recommended).
--
-- A service's amount lives with the service, in the workspace's settings (tenant_config.config, brain.profile.services:
-- amount_minor, a whole number of minor units, beside currency, ISO 4217; contracts ServiceSchema). The owner sets it
-- by approving AI's proposal or by typing it; a price note is never read for a number, here or anywhere.
--
--   service_key               A service's name as the owner reads it, case and spacing aside: how a visit finds its
--                             service (contracts settings-change.ts finds one the same way).
--   service_amounts           The services of a workspace that have an amount, each by its key.
--   appointments.worth_*      What a visit is worth: its service's amount when the visit was written, stamped by the
--                             trigger below and never moved by a later change of the amount. Null where its service
--                             has had none.
--   appointments_worth_stamp  The stamp: before a visit is written, and again only when its service changes.
--   tenant_config_worth_stamp The day a service is first given an amount, the visits already written for it that have
--                             no worth take it (the last ninety days of them: the longest window a page counts), so an
--                             owner who has just set their amounts sees the bookings they already had. A visit that
--                             has a worth is never touched.
--   appointments_set_updated_at  That stamp alone is no change to the visit, so it does not move updated_at (as
--                             00647's arrived_at does not): reminders and the calendar read updated_at.
--   ads_page_counts           Gains `worth`: for each ad, the visits that make its people booked (decision 0049, call
--                             6), each at its own stamp, summed a currency and never across (call 9), with how many
--                             are in the sums and how many were left out for having none. Only the visits' own rows
--                             are read, so every member who reads the page reads the same sums: the settings row is
--                             its owner's alone to read (tenant_config_owner_read). The rule that says them is
--                             contracts' adWorthRule.
--
-- Deploy order: either. A dashboard ahead of this reads no `worth` and says no line; a database ahead of the dashboard
-- answers a key nothing reads yet, and stamps visits no page sums yet. Re-runnable.

set local lock_timeout = '3s';

/* ------------------------------------------------------------------------------ 1. a service, by its name -- */

create or replace function public.service_key(p_name text)
returns text
language sql
immutable
set search_path = public
as $$
  select lower(regexp_replace(btrim(coalesce(p_name, '')), '\s+', ' ', 'g'))
$$;

revoke all on function public.service_key(text) from public, anon, authenticated;
grant execute on function public.service_key(text) to service_role;
comment on function public.service_key(text) is
  'A service''s name as the owner reads it (00683): trimmed, its runs of space made one, lower case. How a visit finds its service among the workspace''s (service_amounts), as a settings change finds one by name (contracts settings-change.ts). Empty for no name. The stamps'' alone (appointments_worth_stamp, tenant_config_worth_stamp): no session calls it.';

create or replace function public.service_amounts(p_tenant_id uuid)
returns table (key text, amount_minor bigint, currency text)
language sql
stable
set search_path = public
as $$
  -- The first service of a name wins, as the list is read in its stored order.
  select distinct on (public.service_key(s.item ->> 'name'))
         public.service_key(s.item ->> 'name'), (s.item ->> 'amount_minor')::bigint, s.item ->> 'currency'
    from tenant_config tc
   cross join lateral jsonb_array_elements(
           case when jsonb_typeof(tc.config -> 'brain' -> 'profile' -> 'services') = 'array'
                then tc.config -> 'brain' -> 'profile' -> 'services' else '[]'::jsonb end
         ) with ordinality as s(item, at)
   where tc.tenant_id = p_tenant_id
     and public.service_key(s.item ->> 'name') <> ''
     -- An amount is the pair, each well formed (contracts serviceAmountOf): one alone is none.
     and jsonb_typeof(s.item -> 'amount_minor') = 'number'
     and (s.item ->> 'amount_minor') ~ '^[0-9]{1,15}$'
     and (s.item ->> 'currency') ~ '^[A-Z]{3}$'
   order by public.service_key(s.item ->> 'name'), s.at
$$;

revoke all on function public.service_amounts(uuid) from public, anon, authenticated;
grant execute on function public.service_amounts(uuid) to service_role;
comment on function public.service_amounts(uuid) is
  'The services of a workspace that have an amount (00683; the Ads tracking plan''s T6), read from its settings (tenant_config.config, brain.profile.services): each by its key (service_key), with amount_minor, a whole number of the currency''s minor units, and currency, ISO 4217. The pair alone is an amount: a service with a number and no currency, or a price note and no amount, is not here, and a note is never read for a number. The first of a name where two share one. The stamps'' alone (appointments_worth_stamp, tenant_config_worth_stamp): no session calls it, and the settings row is its owner''s alone to read.';

/* ------------------------------------------------------------------------------ 2. what a visit is worth -- */

alter table public.appointments add column if not exists worth_minor bigint;
alter table public.appointments add column if not exists worth_currency text;
alter table public.appointments drop constraint if exists appointments_worth_check;
alter table public.appointments add constraint appointments_worth_check
  check ((worth_minor is null) = (worth_currency is null)
         and (worth_minor is null or (worth_minor >= 0 and worth_currency ~ '^[A-Z]{3}$')));

comment on column public.appointments.worth_minor is
  'What the visit is worth (00683; the Ads tracking plan''s T6): its service''s amount when the visit was written, a whole number of worth_currency''s minor units, stamped by appointments_worth_stamp and never moved by a later change of the amount; stamped again only when the visit''s service changes. A visit written before its service had an amount takes the first one the service is given (tenant_config_worth_stamp). Null where its service has had none, or it names none: a sum then leaves it out and counts it (ads_page_counts).';
comment on column public.appointments.worth_currency is
  'The currency worth_minor is in, ISO 4217 (00683). Null exactly where worth_minor is.';

create or replace function public.appointments_worth_stamp()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- A visit keeps the worth it was booked at: only a change of its service stamps it again.
  if tg_op = 'UPDATE' and NEW.service is not distinct from OLD.service then
    return NEW;
  end if;
  NEW.worth_minor := null;
  NEW.worth_currency := null;
  select a.amount_minor, a.currency into NEW.worth_minor, NEW.worth_currency
    from public.service_amounts(NEW.tenant_id) a
   where a.key = public.service_key(NEW.service);
  return NEW;
end $$;

revoke all on function public.appointments_worth_stamp() from public, anon, authenticated;
grant execute on function public.appointments_worth_stamp() to service_role;
comment on function public.appointments_worth_stamp() is
  'A visit is worth its service''s amount on the day it was booked (00683; the Ads tracking plan''s T6): appointments.worth_minor and worth_currency, filled before a visit is written from the amount its service has in the workspace''s settings then (service_amounts, found by service_key), and again only when the visit''s service changes. A request AI opens is written when it is asked for, so it is stamped then. Null where the service has no amount or the visit names none.';

drop trigger if exists appointments_worth_stamp on public.appointments;
create trigger appointments_worth_stamp
  before insert or update of service on public.appointments
  for each row execute function public.appointments_worth_stamp();

/* ------------------------------------------------------------------------------ 3. an amount first given -- */

create or replace function public.tenant_config_worth_stamp()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Only a save that changed the services reaches the visits.
  if (NEW.config #> '{brain,profile,services}') is not distinct from (OLD.config #> '{brain,profile,services}') then
    return null;
  end if;
  update public.appointments v
     set worth_minor = a.amount_minor, worth_currency = a.currency
    from public.service_amounts(NEW.tenant_id) a
   where v.tenant_id = NEW.tenant_id
     and v.worth_minor is null
     and v.service is not null
     and v.starts_at > now() - interval '90 days'
     and public.service_key(v.service) = a.key;
  return null;
end $$;

revoke all on function public.tenant_config_worth_stamp() from public, anon, authenticated;
grant execute on function public.tenant_config_worth_stamp() to service_role;
comment on function public.tenant_config_worth_stamp() is
  'The day a service is first given an amount, the visits already written for it take it (00683; the Ads tracking plan''s T6): after a save of the settings that changed the services, each visit of the workspace that has no worth, names a service that now has an amount (service_amounts, by service_key) and starts within the last ninety days, the longest window a page counts, is stamped with it. A visit that has a worth is never touched, so a changed amount moves no visit. SECURITY DEFINER, since a member writes no visit: it reads and writes the one workspace whose settings were saved, and no session may call it.';

drop trigger if exists tenant_config_worth_stamp on public.tenant_config;
create trigger tenant_config_worth_stamp
  after update of config on public.tenant_config
  for each row execute function public.tenant_config_worth_stamp();

-- A worth stamped on a visit whose service did not change is no change to the visit: updated_at stays, as it does for
-- arrived_at (00647). A change of the service moves it as before: its own stamp runs after this trigger.
drop trigger if exists appointments_set_updated_at on public.appointments;
create trigger appointments_set_updated_at
  before update on public.appointments
  for each row
  when (not (new.arrived_at is distinct from old.arrived_at)
        and not ((new.worth_minor is distinct from old.worth_minor
                  or new.worth_currency is distinct from old.worth_currency)
                 and not (new.service is distinct from old.service)))
  execute function extensions.moddatetime('updated_at');

/* ------------------------------------------------------------------------------ 4. the page's counts -- */

create or replace function public.ads_page_counts(p_tenant_id uuid, p_days integer default 30, p_end date default null)
returns jsonb
language sql
stable
set search_path = public
as $$
  with win as (
    select e.day - (e.days - 1) as from_day, e.day as to_day
      from (select least(greatest(coalesce(p_days, 30), 1), 90) as days,
                   least(coalesce(p_end, (now() at time zone t.timezone)::date),
                         (now() at time zone t.timezone)::date) as day
              from tenants t
             where t.id = p_tenant_id) e
  ),
  -- The people an ad brought, read once: the counts and the worth below are of the same people.
  brought as materialized (
    select p.contact_id, p.first_at, p.ad_id, p.booked
      from public.ad_people_in(p_tenant_id, p_days, p_end) p
  ),
  by_ad as (
    select p.ad_id, count(*) as people, count(*) filter (where p.booked) as booked
      from brought p
     group by p.ad_id
  ),
  -- What each ad's platform says it spent in the same days: the platform's half, in the account's own days.
  spent as (
    select d.ad_id, sum(d.spend_minor)::bigint as spend_minor, sum(d.impressions)::bigint as impressions,
           sum(d.clicks)::bigint as clicks, sum(d.platform_results)::bigint as platform_results,
           bool_or(not d.settled) as settling
      from ad_days d, win w
     where d.tenant_id = p_tenant_id and d.day >= w.from_day and d.day <= w.to_day
     group by d.ad_id
  ),
  -- The visits that make an ad's people booked (ad_people_in's own rule, decision 0049, call 6), each with what it is
  -- worth: its own stamp, or nothing, and it is left out.
  visits as (
    select p.ad_id, v.worth_minor as minor, v.worth_currency as currency
      from brought p
      join contacts c on c.id = p.contact_id and c.tenant_id = p_tenant_id
      join appointments v
        on v.tenant_id = p_tenant_id
       and v.starts_at > p.first_at
       and v.status not in ('cancelled', 'proposed')
       and (v.contact_id = p.contact_id
            or (v.contact_id is null
                and ((v.client_phone is not null and v.client_phone = c.phone_e164)
                     or (v.client_email is not null and lower(v.client_email) = lower(c.email)))))
     where p.booked and p.ad_id is not null
  ),
  worth as (
    select x.ad_id,
           count(*) filter (where x.minor is not null) as visits,
           count(*) filter (where x.minor is null) as left_out,
           coalesce((select jsonb_agg(jsonb_build_object('currency', s.currency, 'minor', s.minor) order by s.currency)
                       from (select y.currency, sum(y.minor)::bigint as minor
                               from visits y
                              where y.ad_id = x.ad_id and y.minor is not null
                              group by y.currency) s), '[]'::jsonb) as sums
      from visits x
     group by x.ad_id
  )
  select jsonb_build_object(
           'from', w.from_day,
           'to', w.to_day,
           'ads', coalesce((select jsonb_agg(jsonb_build_object('ad_id', b.ad_id, 'people', b.people,
                                                                'booked', b.booked))
                              from by_ad b where b.ad_id is not null), '[]'::jsonb),
           'unnamed', jsonb_build_object(
                        'people', coalesce((select b.people from by_ad b where b.ad_id is null), 0),
                        'booked', coalesce((select b.booked from by_ad b where b.ad_id is null), 0)),
           'spend', coalesce((select jsonb_agg(jsonb_build_object(
                                       'ad_id', s.ad_id, 'spend_minor', s.spend_minor,
                                       'impressions', s.impressions, 'clicks', s.clicks,
                                       'platform_results', s.platform_results, 'settling', s.settling))
                                from spent s), '[]'::jsonb),
           'worth', coalesce((select jsonb_agg(jsonb_build_object(
                                       'ad_id', x.ad_id, 'sums', x.sums,
                                       'visits', x.visits, 'left_out', x.left_out) order by x.ad_id)
                                from worth x), '[]'::jsonb))
    from win w
$$;

revoke all on function public.ads_page_counts(uuid, integer, date) from public, anon;
grant execute on function public.ads_page_counts(uuid, integer, date) to authenticated, service_role;
comment on function public.ads_page_counts(uuid, integer, date) is
  'The Ads page''s totals for a window, counted whole (00651; decision 0049, calls 3, 5 and 6): ads, a row an ad Chanlytics holds that brought someone (ad_id, people, booked); unnamed, the people from an ad it cannot name, as one count; spend, what each ad''s platform says it spent, was shown and was tapped in the same days, with whether any of them is still moving (settling); and worth (00683; the Ads tracking plan''s T6), for each ad whose people booked, what their visits are worth: sums, one a currency and never across (call 9), visits, how many are in them, and left_out, how many have no amount. The visits are the ones that make its people booked (call 6), each at the worth stamped on it (appointments.worth_minor); one with none is left out, and counted. The people are ad_people_in''s, so ads plus unnamed is the count people_series says under "An ad". Null for a workspace nobody can read. SECURITY INVOKER.';

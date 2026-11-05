-- 00541 · What a search reads of a business's own site it pays for where it reads it (4 Nov 2026).
--
-- A business's home page is read by the page reader (decision 0054), one credit a read whatever it answers. A search's
-- mark step has read one for each lead since 31 Oct, and now a plan may ask what only a website shows (decision 0095), which
-- reads one for each place its judge asks about. Nothing counted either: a budget "bounds scraping, judging, checks and
-- retries" (PRD §16.32), and this was none of those.
--
--   lead_rounds.site_reads    How many sites a round read: the one number that says what its reading cost.
--   lead_site_reads_spent     The spend, when it is spent: against the round while it lives (its count, its cost, the
--                             counters out of its reservation), else this month's and today's, as a re-check's is. The
--                             leads sweep's second try at a mark names no round.
--   lead_estimate_ceiling     The most a door takes as an estimate, with the site's price in a place's: a plan that reads
--                             sites reserves it (contracts estimateRoundUsd). Its shape is 00474's.

set local lock_timeout = '3s';

alter table public.lead_rounds add column if not exists site_reads integer default 0 not null;
comment on column public.lead_rounds.site_reads is
  'The businesses'' own sites this round read (00541), each one credit with the page''s reader: for the judge, where its plan asks what only a website shows, and for a mark. Its cost is in cost_usd.';

create or replace function public.lead_site_reads_spent(p_tenant_id uuid, p_reads integer, p_usd numeric, p_round_id uuid default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  r public.lead_rounds;
begin
  if coalesce(p_reads, 0) <= 0 or coalesce(p_usd, 0) <= 0 then return; end if;
  if p_round_id is not null then
    select * into r from public.lead_rounds where id = p_round_id and tenant_id = p_tenant_id for update;
  end if;
  if r.id is not null and r.state <> 'ended' then
    perform public.lead_settle_usage(r.tenant_id, r.month, r.day, r.platform_day, p_usd, r.cost_reserved_usd - r.cost_usd);
    update public.lead_rounds set site_reads = site_reads + p_reads, cost_usd = cost_usd + p_usd where id = r.id;
    return;
  end if;
  -- No round, or one that ended (its trigger refuses a change): this month's budget and today's two days, reserved from
  -- nothing, as a re-check after its round is settled (lead_collect_commit).
  perform public.lead_settle_usage(p_tenant_id, public.lead_month(p_tenant_id, now()), public.lead_day(p_tenant_id, now()),
    to_char(now() at time zone 'UTC', 'YYYY-MM-DD'), p_usd, 0);
end $$;
revoke all on function public.lead_site_reads_spent(uuid, integer, numeric, uuid) from public, anon, authenticated;
grant execute on function public.lead_site_reads_spent(uuid, integer, numeric, uuid) to service_role;
comment on function public.lead_site_reads_spent(uuid, integer, numeric, uuid) is
  'What reading businesses'' own sites cost, spent when read (00541): p_reads credits at the card''s price p_usd, whatever each read answered. Against a round that still lives: its count, its cost, and the month''s and both days'' counters out of what it has reserved. With no round, or one ended: this month''s and today''s, reserved from nothing, as a re-check after its round is. The service role''s: the collect, the re-judge and the leads sweep''s second try at a mark.';

create or replace function public.lead_estimate_ceiling(p_kind text, p_count integer, p_terms integer default 5)
returns numeric
language plpgsql
immutable
set search_path = public
as $$
declare
  -- The card's prices a place (contracts LEAD_CARDS, local_businesses): discovery, contacts, the judge, the mailbox check
  -- and reading its own site (00541), the dearest plan's whole; a run's start; the estimate's room (LEAD_ESTIMATE_MARGIN);
  -- the actor's floor on a run's cap (core MAPS_CAP_FLOOR_USD).
  v_place  numeric := 0.003 + 0.002 + 0.0023 + 0.00089 + 0.005;
  v_check  numeric := 0.00089;
  v_start  numeric := 0.00005;
  v_margin numeric := 1.3;
  v_floor  numeric := 0.5;
  -- The people card's (00430): a person found, and the run's start, at the provider's dearest tier.
  v_person numeric := 0.002;
  v_pstart numeric := 0.01;
  -- Its company read by the judge against what was asked (00474), at the places judge's price, a person asked.
  v_pjudge numeric := 0.0023;
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
  elsif p_kind = 'people' then
    -- Twice the people asked for (two found a lead, as a search assumes), each found, judged and checked, one start, the room;
    -- and a run's floor for the provider and for the checker.
    return round(ceil((least(1000, 2 * v_count) * (v_person + v_pjudge + v_check) + v_pstart) * v_margin * 100) / 100
                 + 2 * v_floor, 2);
  end if;
  -- A kind it does not know is a mistake in the caller, never "no ceiling".
  raise exception 'lead_estimate_ceiling: no kind is named %', coalesce(p_kind, 'null') using errcode = '22023';
end $$;
revoke all on function public.lead_estimate_ceiling(text, integer, integer) from public, anon, authenticated;
grant execute on function public.lead_estimate_ceiling(text, integer, integer) to service_role;
comment on function public.lead_estimate_ceiling(text, integer, integer) is
  'The most a finder door takes as its estimate (00364, 00430, 00474, 00541). search: ceil(((25 + least(1000, 2 x count)) x $0.01319 + 2 x terms x $0.00005) x 1.3, to the cent) + 2 x terms x $0.50; list: ceil(rows x $0.00089 x 1.3, to the cent) + $0.50; people: ceil((least(1000, 2 x count) x $0.00519 + $0.01) x 1.3, to the cent) + 2 x $0.50. What the route computes (estimateForRound, leadImportEstimateUsd, peopleEstimateUsd) never passes it.';

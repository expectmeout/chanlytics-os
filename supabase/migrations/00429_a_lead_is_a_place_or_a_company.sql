-- 00429 · A lead is a place or a company (the lead workbench's call 8, lane 5; decision 0057; canvas B's Model board).
--
-- A lead was a place a listing names. It may now be a company with the people its source named on it, one of whom is
-- the addressee a reach-out writes to: the people card's (contracts LEAD_CARDS people_at_companies, core CARDS), the
-- first card after the Maps one, approved with its source-rights note (docs/plans/2026-09-18-lead-finder-source-rights.md).
-- Amends the every-business plan's W5, where a person was to be a lead of its own: the canvas makes the company the lead
-- and its people its facts, so one company is written to once (0057's call 9), whoever works there.
--
--   leads.kind                 place | company.
--   leads.source               the card that found it (local_businesses, people_at_companies) or a file of the owner's
--                              own (import); the foot's first line says where (contracts whyFrom).
--   leads.source_key           its own key at its source (a company's domain): one lead per workspace, source and key, so
--                              a company found twice is the same lead. A place keeps its place_id.
--   leads.facts                {people, addressee, size}: the people its source named (five at most), which one the
--                              lead's address is, and the company's size as its source gave it.
--   leads_source_of_a_list     a lead a file brings (no place, no key) says so.
--   lead_estimate_ceiling      a people search's most: the card's price a person, the mailbox check, a checker's floor.
--   lead_people_search_create  the owner's door to a people search, as lead_search_create is to a places one.
--   lead_company_upsert        the people card's commit of a page's companies (service role): a lead per company, a
--                              company already a lead keeps its place and gains the people it lacked, each new one
--                              waiting in Needs review on its address, as a list's do (00242's J2).
--   reach_out_person           the person a company's email makes is its addressee, by name.
--   lead_blank                 a blanked lead keeps none of its people, nor its key.
--   leads_page                 each row says what its lead is, with a company's people.
--
-- Either deploy order works: a column nobody asks for is not read, and the doors are new. Re-runnable throughout.

set local lock_timeout = '3s';

/* ---------------------------------------------------------------------------------- 1. what a lead is -- */

alter table public.leads add column if not exists kind text not null default 'place';
alter table public.leads add column if not exists source text not null default 'local_businesses';
alter table public.leads add column if not exists source_key text;
alter table public.leads add column if not exists facts jsonb not null default '{}'::jsonb;

alter table public.leads drop constraint if exists leads_kind_check;
alter table public.leads add constraint leads_kind_check check (kind in ('place', 'company')) not valid;
alter table public.leads validate constraint leads_kind_check;
alter table public.leads drop constraint if exists leads_source_check;
alter table public.leads add constraint leads_source_check
  check (source in ('local_businesses', 'people_at_companies', 'import')) not valid;
alter table public.leads validate constraint leads_source_check;
alter table public.leads drop constraint if exists leads_source_key_shape;
alter table public.leads add constraint leads_source_key_shape
  check (source_key is null or char_length(source_key) between 1 and 200) not valid;
alter table public.leads validate constraint leads_source_key_shape;
alter table public.leads drop constraint if exists leads_facts_is_an_object;
alter table public.leads add constraint leads_facts_is_an_object
  check (jsonb_typeof(facts) = 'object' and octet_length(facts::text) <= 8000) not valid;
alter table public.leads validate constraint leads_facts_is_an_object;
-- A company is found by its key, a place by its place id (leads_tenant_place_uq); a blanked one keeps neither.
alter table public.leads drop constraint if exists leads_company_has_a_key;
alter table public.leads add constraint leads_company_has_a_key
  check (kind <> 'company'
         or (place_id is null and (source_key is not null or blanked_at is not null or erased_at is not null))) not valid;
alter table public.leads validate constraint leads_company_has_a_key;

create unique index if not exists leads_tenant_source_key_uq
  on public.leads (tenant_id, source, source_key) where source_key is not null;

comment on column public.leads.kind is
  'What the lead is (00429): a place a listing names (the Maps card''s), or a company with the people its source named on it (the people card''s, facts.people), one of whom its reach-out writes to.';
comment on column public.leads.source is
  'Where the lead came from (00429): the card that found it (local_businesses, people_at_companies), or a file of the owner''s own (import). The foot of a cold email says it in its first line (contracts whyFrom).';
comment on column public.leads.source_key is
  'The lead''s own key at its source (00429): a company''s domain for the people card. One lead per workspace, source and key (leads_tenant_source_key_uq); a place keeps its place_id instead.';
comment on column public.leads.facts is
  'What the lead''s source named beyond its columns (00429): {people: [{name, first_name, title, role, email, profile_url}] at most five, addressee: the index of the one the lead''s address is, size: the company''s size as its source gave it}. Read through contracts leadFactsOf; blanked with the lead.';

-- What is there: a lead with no place came from a file of the owner's own (00242), the only other door that makes one.
update public.leads set source = 'import'
 where place_id is null and kind = 'place' and source = 'local_businesses';

-- A file's lead says so as it is made: lead_search_import (00364) names no source, and a place with no place id is one
-- only a file brings.
create or replace function public.leads_source_of_a_list()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.place_id is null and new.kind = 'place' and new.source = 'local_businesses' then
    new.source := 'import';
  end if;
  return new;
end $$;
revoke execute on function public.leads_source_of_a_list() from public, anon, authenticated;
comment on function public.leads_source_of_a_list() is
  'A lead made with no place id and no key is a file''s row (00242''s lead_search_import, the one door that makes one): its source is import (00429).';
drop trigger if exists leads_source_of_a_list on public.leads;
create trigger leads_source_of_a_list
  before insert on public.leads
  for each row execute function public.leads_source_of_a_list();

/* ------------------------------------------------------------------------ 2. a people search, started -- */

-- 00364's ceiling with the people card's: the card's price a person (contracts LEAD_CARDS people_at_companies), the
-- mailbox check a person, the room, one provider run's start and a checker run's floor.
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
  -- The people card's (00429): a person found, and the run's start, at the provider's dearest tier.
  v_person numeric := 0.002;
  v_pstart numeric := 0.01;
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
    -- Twice the people asked for (two found a lead, as a search assumes), each found and checked, one start, the room;
    -- and a run's floor for the provider and for the checker.
    return round(ceil((least(1000, 2 * v_count) * (v_person + v_check) + v_pstart) * v_margin * 100) / 100
                 + 2 * v_floor, 2);
  end if;
  -- A kind it does not know is a mistake in the caller, never "no ceiling".
  raise exception 'lead_estimate_ceiling: no kind is named %', coalesce(p_kind, 'null') using errcode = '22023';
end $$;
revoke all on function public.lead_estimate_ceiling(text, integer, integer) from public, anon, authenticated;
grant execute on function public.lead_estimate_ceiling(text, integer, integer) to service_role;
comment on function public.lead_estimate_ceiling(text, integer, integer) is
  'The most a finder door takes as its estimate (00364, 00429). search: ceil(((25 + least(1000, 2 x count)) x $0.00819 + 2 x terms x $0.00005) x 1.3, to the cent) + 2 x terms x $0.50; list: ceil(rows x $0.00089 x 1.3, to the cent) + $0.50; people: ceil((least(1000, 2 x count) x $0.00289 + $0.01) x 1.3, to the cent) + 2 x $0.50. What the route computes (estimateForRound, leadImportEstimateUsd, peopleEstimateUsd) never passes it.';

-- The owner's door to a people search (00429), as lead_search_create (00364) is to a places one: the plan's shape (the
-- people card's: titles, seniority, industries, sizes, states, a count), the estimate under its ceiling, the switch,
-- the spend, the reservation, then the search, its one round (main: nothing is probed, the provider's filters are the
-- criteria), its start and its event.
create or replace function public.lead_people_search_create(p_tenant_id uuid, p_plan jsonb, p_via text, p_estimate_usd numeric,
                                                            p_thread_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user   uuid := auth.uid();
  v_count  integer;
  v_titles integer;
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
  if jsonb_typeof(p_plan) is distinct from 'object' or p_plan->>'card' is distinct from 'people_at_companies'
     or coalesce((p_plan->>'version')::integer, 0) <> 1 then
    raise exception 'a people plan: version 1 of the people_at_companies card' using errcode = '22023';
  end if;
  v_count := (p_plan->>'count')::integer;
  if v_count is null or v_count < 1 or v_count > 500 then
    raise exception 'count: 1 to 500' using errcode = '22023';
  end if;
  v_titles := case when jsonb_typeof(p_plan->'titles') = 'array' then jsonb_array_length(p_plan->'titles') else 0 end;
  if v_titles < 1 or v_titles > 5 then
    raise exception 'titles: 1 to 5' using errcode = '22023';
  end if;
  if char_length(btrim(coalesce(p_plan->>'name', ''))) not between 1 and 120
     or char_length(coalesce(p_plan->>'asked', '')) > 400 then
    raise exception 'a plan is named, and asked in 400 characters at most' using errcode = '22023';
  end if;
  if p_estimate_usd is null or p_estimate_usd < 0
     or p_estimate_usd > least(public.lead_cap('month_usd'), public.lead_estimate_ceiling('people', v_count)) then
    raise exception 'estimate: 0 to % usd for this plan', public.lead_estimate_ceiling('people', v_count) using errcode = '22023';
  end if;
  if not public.lead_searches_on(p_tenant_id) then
    return jsonb_build_object('error', 'paused', 'sentence', 'Lead searches are paused for now. Your leads are all here, and nothing is being counted.');
  end if;
  v_err := public.lead_spend_refusal(p_tenant_id);
  if v_err is not null then
    return v_err;
  end if;
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
  values (p_tenant_id, v_user, p_via, 'people_at_companies', left(btrim(p_plan->>'name'), 120), coalesce(p_plan->>'asked', ''),
          p_plan, v_thread)
  returning id into v_search;
  insert into public.lead_rounds (tenant_id, search_id, seq, purpose, plan, plan_version, target, state, allowance_reserved,
                                  cost_reserved_usd, month, day, platform_day)
  values (p_tenant_id, v_search, 1, 'main', p_plan, 1, v_count, 'queued', v_count, p_estimate_usd, v_month, v_day, v_pday)
  returning id into v_round;
  insert into public.jobs (tenant_id, kind, due_at, payload)
  values (p_tenant_id, 'lead_round_start', now(), jsonb_build_object('round_id', v_round));
  insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
  values (p_tenant_id, 'lead.round', 'lead', 'lead_round', v_round,
          jsonb_build_object('search_id', v_search, 'seq', 1, 'state', 'queued', 'purpose', 'main', 'target', v_count,
                             'card', 'people_at_companies', 'by', v_user));
  return jsonb_build_object('search_id', v_search, 'round_id', v_round);
end $$;
revoke all on function public.lead_people_search_create(uuid, jsonb, text, numeric, uuid) from public, anon;
grant execute on function public.lead_people_search_create(uuid, jsonb, text, numeric, uuid) to authenticated, service_role;
comment on function public.lead_people_search_create(uuid, jsonb, text, numeric, uuid) is
  'Owner (find). A people search (00429), as lead_search_create is a places one: checks the plan (version 1 of the people_at_companies card, a count of 1 to 500, one to five titles, a name), the estimate (at most lead_estimate_ceiling(people, count)), the switch ({error: paused}) and the spend (lead_spend_refusal), reserves the count and the estimate (lead_reserve''s errors), then inserts the search, its one main round (target the count: the provider''s filters are its criteria, so nothing is probed), the start job and the event. Returns {search_id, round_id}.';

/* ------------------------------------------------------------------------ 3. a page of companies, kept -- */

-- The people card's commit of a page's companies (00429), the service role's, before the run's own commit
-- (lead_collect_commit, which moves the offset and the round): idempotent, so a page read twice keeps each company once.
-- Each company the rules a list's row keeps to let through (a name, a key, a well-formed address; never a customer's,
-- never the never-again list's) is a lead: a new one waits in Needs review on its address (00242's J2: the check
-- promotes it), and one the workspace holds already, by its key or its address, keeps its place in whatever it is in and
-- gains the people it lacked, as a place found again is never found twice.
create or replace function public.lead_company_upsert(p_round_id uuid, p_companies jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_round  public.lead_rounds%rowtype;
  v_c      jsonb;
  v_key    text;
  v_email  text;
  v_host   text;
  v_lead   uuid;
  v_facts  jsonb;
  v_people jsonb;
  v_p      jsonb;
  v_made   integer := 0;
  v_held   integer := 0;
  v_left   integer := 0;
begin
  select * into v_round from public.lead_rounds where id = p_round_id;
  if not found or v_round.state = 'ended' then
    return jsonb_build_object('ok', false, 'why', 'round');
  end if;
  if jsonb_typeof(p_companies) is distinct from 'array' or jsonb_array_length(p_companies) > 200 then
    raise exception 'companies: an array of at most 200' using errcode = '22023';
  end if;
  for v_c in select value from jsonb_array_elements(p_companies) loop
    v_key   := lower(btrim(coalesce(v_c->>'source_key', '')));
    v_email := lower(btrim(coalesce(v_c->>'email', '')));
    if char_length(v_key) not between 1 and 200 or char_length(btrim(coalesce(v_c->>'name', ''))) = 0
       or char_length(v_email) > 254 or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'
       or jsonb_typeof(v_c->'facts') is distinct from 'object' or octet_length((v_c->'facts')::text) > 8000 then
      v_left := v_left + 1;
      continue;
    end if;
    -- Never a customer's: a person in People holds the address, as theirs or as one they wrote from.
    if exists (select 1 from public.contacts c where c.tenant_id = v_round.tenant_id and c.erased_at is null and c.email = v_email)
       or exists (select 1 from public.contact_identities i
                    join public.contacts c on c.id = i.contact_id and c.erased_at is null
                   where i.tenant_id = v_round.tenant_id and i.channel = 'email' and i.external_id = v_email)
       or public.lead_address_suppressed(v_round.tenant_id, v_email) then
      v_left := v_left + 1;
      continue;
    end if;

    -- Held already: the same company (its key), or its address on another lead (a place, a file's row).
    v_lead := null;
    select l.id, l.facts into v_lead, v_facts from public.leads l
     where l.tenant_id = v_round.tenant_id and l.source = 'people_at_companies' and l.source_key = v_key;
    if v_lead is null then
      select l.id, l.facts into v_lead, v_facts from public.leads l
       where l.tenant_id = v_round.tenant_id and l.email = v_email
       order by l.found_at
       limit 1;
    end if;
    if v_lead is not null then
      -- A company keeps the people it lacked, five at most, by their address; its addressee stays who it was.
      update public.leads l
         set facts = jsonb_set(l.facts, '{people}', (
               select coalesce(jsonb_agg(x.p order by x.n), '[]'::jsonb)
                 from (select p, n from jsonb_array_elements(coalesce(l.facts->'people', '[]'::jsonb)) with ordinality as a(p, n)
                       union all
                       select p, 100 + n from jsonb_array_elements(coalesce(v_c->'facts'->'people', '[]'::jsonb)) with ordinality as b(p, n)
                        where not exists (select 1 from jsonb_array_elements(coalesce(l.facts->'people', '[]'::jsonb)) o
                                           where lower(o->>'email') = lower(b.p->>'email')
                                              or (o->>'email' is null and lower(o->>'name') = lower(b.p->>'name')))
                       order by n
                       limit 5) x)),
             version = version + 1
       where l.id = v_lead and l.kind = 'company' and l.erased_at is null and l.blanked_at is null;
      v_held := v_held + 1;
      continue;
    end if;

    v_host := case when lower(v_key) ~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$' then v_key end;
    insert into public.leads (tenant_id, kind, source, source_key, business_name, category, city, region, country,
                              website_host, website_root, linkedin_url, about, email, email_state, facts)
    values (v_round.tenant_id, 'company', 'people_at_companies', v_key, left(btrim(v_c->>'name'), 200),
            nullif(left(btrim(coalesce(v_c->>'category', '')), 120), ''),
            nullif(left(btrim(coalesce(v_c->>'city', '')), 120), ''),
            case when v_c->>'region' ~ '^[A-Z]{2}$' then v_c->>'region' end,
            case when v_c->>'country' ~ '^[A-Z]{2}$' then v_c->>'country' else 'US' end,
            v_host, case when v_host is not null then true end,
            nullif(left(btrim(coalesce(v_c->>'linkedin_url', '')), 300), ''),
            nullif(left(btrim(coalesce(v_c->>'about', '')), 600), ''),
            v_email, 'checking', v_c->'facts')
    on conflict (tenant_id, source, source_key) where source_key is not null do nothing
    returning id into v_lead;
    if v_lead is null then
      v_held := v_held + 1;
      continue;
    end if;
    insert into public.lead_search_members (search_id, lead_id, round_id, tenant_id, judgment, class, reason)
    values (v_round.search_id, v_lead, v_round.id, v_round.tenant_id,
            jsonb_build_object('reasons', jsonb_build_array('email:checking'), 'shares', '[]'::jsonb), 'review',
            left(coalesce(v_c->>'reason', ''), 120))
    on conflict (search_id, lead_id) do nothing;
    v_made := v_made + 1;
  end loop;
  return jsonb_build_object('ok', true, 'made', v_made, 'held', v_held, 'left_out', v_left);
end $$;
revoke all on function public.lead_company_upsert(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.lead_company_upsert(uuid, jsonb) to service_role;
comment on function public.lead_company_upsert(uuid, jsonb) is
  'The people card''s page of companies (00429), the service role''s, before lead_collect_commit moves the run: each company with a name, a key and a well-formed address that is neither a customer''s nor on the never-again list becomes a company lead (source people_at_companies, its people in facts, its address checking) and a member of the round in Needs review on its address, which the check promotes (00242''s J2). One the workspace holds already (by its key, or its address on any lead) keeps its place and gains the people it lacked, five at most. Idempotent. Returns {ok, made, held, left_out}.';

/* --------------------------------------------------------------------- 4. the addressee is the person -- */

-- 00344's reach_out_person: a company's email makes its addressee, by the name their source gave (name_source import, as
-- a client list's: a real person's name, ranked over a stand-in's); a place's makes a stand-in named for the business.
create or replace function public.reach_out_person(p_tenant_id uuid, p_lead_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lead public.leads%rowtype;
  v_email text;
  v_contact uuid;
  v_conv uuid;
  v_made boolean := false;
  v_person jsonb;
  v_name   text;
  v_source text;
begin
  select * into v_lead from public.leads
   where id = p_lead_id and tenant_id = p_tenant_id and erased_at is null and blanked_at is null
   for update;
  if not found then return jsonb_build_object('refused', 'lead_gone'); end if;
  -- A lead no longer being written to: it said no, was set aside, or became a customer since it was planned (a person
  -- with its address came into People, and the insert trigger linked and converted it). Its person is theirs, never a
  -- cold email's: the send is skipped before a row is written into a customer's thread.
  if v_lead.stage not in ('ready', 'nurture') then return jsonb_build_object('refused', 'lead_closed'); end if;
  v_email := nullif(lower(btrim(coalesce(v_lead.email, ''))), '');
  if v_email is null then return jsonb_build_object('refused', 'no_address'); end if;
  if v_lead.contact_id is not null then
    v_contact := v_lead.contact_id;
  else
    -- Somebody in People already has this address, as theirs or as one they wrote from: a customer, never written to
    -- cold (§4.8).
    if exists (select 1 from public.contacts c where c.tenant_id = p_tenant_id and c.email = v_email and c.erased_at is null)
       or exists (select 1 from public.contact_identities i
                    join public.contacts c on c.id = i.contact_id and c.erased_at is null
                   where i.tenant_id = p_tenant_id and i.channel = 'email' and i.external_id = v_email) then
      return jsonb_build_object('refused', 'already_yours');
    end if;
    -- The person, through the one door (00342, 00344), with the lead-link trigger told this is not a lead converting:
    -- the address as the identity, the finder's word (found), the lead on the added event, `by` the sender. A person
    -- the door finds instead of making (another lead's claim, an email in, between the look above and here) is
    -- somebody's already; an address People cannot hold is none; a person who asked to be forgotten is left alone.
    -- Each refuses, and the door's writes go back with the refusal (the block is its own transaction).
    -- A company's email goes to its addressee (00429): the person is them, by the name their source gave; a place's is
    -- a stand-in named for the business (0052).
    v_name := null;
    if v_lead.kind = 'company' then
      select nullif(btrim(p->>'name'), '') into v_name
        from jsonb_array_elements(coalesce(v_lead.facts->'people', '[]'::jsonb)) with ordinality as x(p, n)
       where lower(btrim(coalesce(p->>'email', ''))) = v_email
       order by n
       limit 1;
    end if;
    v_source := case when v_name is not null then 'import' else 'lead' end;
    v_name   := coalesce(left(v_name, 80), left(nullif(v_lead.business_name, ''), 80));
    begin
      perform set_config('chanlytics.link_lead', 'off', true);
      v_person := public.resolve_person(p_tenant_id, 'email', v_email, null, v_email,
                                        v_name, 'found', v_source,
                                        jsonb_build_object('lead_id', p_lead_id, 'by', 'reach_out'));
      perform set_config('chanlytics.link_lead', 'on', true);
      if coalesce((v_person->>'existed')::boolean, false) then
        raise exception 'already_yours' using errcode = 'P0003';
      end if;
      v_contact := (v_person->>'contact_id')::uuid;
    exception
      when sqlstate 'P0003' then return jsonb_build_object('refused', 'already_yours');
      when sqlstate 'PE001' then return jsonb_build_object('refused', 'erased');
      when unique_violation then return jsonb_build_object('refused', 'already_yours');
      when check_violation or sqlstate '22023' then return jsonb_build_object('refused', 'no_address');
    end;
    update public.leads set contact_id = v_contact, version = version + 1 where id = p_lead_id;
    v_made := true;
  end if;
  insert into public.conversations (tenant_id, contact_id) values (p_tenant_id, v_contact)
  on conflict (tenant_id, contact_id) do nothing;
  select id into v_conv from public.conversations where tenant_id = p_tenant_id and contact_id = v_contact;
  return jsonb_build_object('contact_id', v_contact, 'conversation_id', v_conv, 'made', v_made);
end $$;

/* ------------------------------------------------------------------------ 5. a blanked lead's people -- */

-- 00428's lead_blank: a company's people and its key go with the rest of the lead.
create or replace function public.lead_blank(p_lead_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_n      integer;
  v_tenant uuid;
begin
  -- Kept: id, tenant_id, stage, closed_reason, contact_id, converted_at,
  -- contacted_at, exported_at, found_at, erased_at, the counts on its
  -- memberships. Everything that names the place, reaches it or came off its
  -- site goes, and its place id with it, so the place found again is new.
  update public.leads
     set place_id = null, business_name = '', category = null, street = null, city = null, region = null, postal_code = null,
         lat = null, lng = null, website_host = null, instagram_url = null, phone_e164 = null, phone_sources = 0,
         email = null, email_alternates = '[]'::jsonb, email_state = 'none', email_checked_at = null, rating = null, reviews = null,
         last_outcome = null, last_note = null, blanked_at = coalesce(blanked_at, now()),
         -- What the listing showed about the business goes with the rest (D2).
         about = null, hours = '[]'::jsonb, image_url = null, price = null, reviews_dist = null,
         facebook_url = null, linkedin_url = null, tiktok_url = null, claimed = null, maps_url = null, rank = null, neighborhood = null, logo_url = null, mark_path = null,
         -- A company's people and its key go with the rest (00429), so the company found again is new, as a place is.
         facts = '{}'::jsonb, source_key = null
   where id = p_lead_id
  returning tenant_id into v_tenant;
  get diagnostics v_n = row_count;
  delete from public.lead_places where lead_id = p_lead_id;
  update public.lead_search_members
     set judgment = '{}'::jsonb, reason = '', blanked_at = coalesce(blanked_at, now())
   where lead_id = p_lead_id;
  -- What a reach-out wrote from the lead's record, and the checker's note on it (00391). The send keeps its state, its
  -- reason and the digest of the words it checked.
  update public.reach_out_sends
     set opening = null, angle = null, hold_detail = null
   where tenant_id = v_tenant and lead_id = p_lead_id
     and (opening is not null or angle is not null or hold_detail is not null);
  -- A draft handed to its owner names them and their address (00428): one still waiting to be sent is skipped as its
  -- lead gone, and every draft of theirs is cleared. The email they sent is a message, and goes as messages go.
  update public.reach_out_sends
     set state = case when state = 'drafted' then 'skipped' else state end,
         reason = case when state = 'drafted' then 'lead_gone' else reason end,
         draft = null
   where tenant_id = v_tenant and lead_id = p_lead_id and draft is not null;
  -- A person still named for the business (a stand-in, 0052) keeps nothing of it: the name goes with the place, and
  -- their address or number is what names them again.
  update public.contacts
     set display_name = null, name_source = null, updated_at = now()
   where tenant_id = v_tenant and lead_id = p_lead_id and name_source = 'lead';
  -- A preference's example copied from this lead (00391).
  update public.lead_preferences
     set example = null
   where tenant_id = v_tenant and from_lead_id = p_lead_id and example is not null;
  return v_n;
end $$;

revoke execute on function public.lead_blank(uuid) from public, anon, authenticated;
comment on function public.lead_blank(uuid) is
  'Removes everything that names or reaches a place, and its memberships'' judgments, a reach-out''s opening, angle and note written from it, and a preference''s example copied from it (00391), a reach-out''s drafts, one still waiting skipped as its lead gone (00428), and a company''s people and key (00429), keeping the stage, the link to a person and the counts. The one function retention and erasure blank through.';

/* ------------------------------------------------------------------- 6. a page of leads says what each is -- */

-- 00426's leads_page with each row's kind and a company's people (facts): its return type grows, so it is made again.
drop function if exists public.leads_page(uuid, uuid, text, text, text, integer, text, text, uuid, uuid);
create or replace function public.leads_page(p_tenant_id uuid, p_search_id uuid default null, p_class text default 'qualified',
  p_sort text default 'found', p_after_key text default null, p_limit integer default 200, p_list text default 'all',
  p_dir text default 'asc', p_after_id uuid default null, p_list_id uuid default null)
returns table(member_id uuid, lead_id uuid, place_id text, search_id uuid, round_id uuid, class text, excluded_by text,
  fit text, reason text, distance_m integer, counted boolean, counted_month text, judgment jsonb, shares jsonb,
  business_name text, category text, street text, city text, region text, postal_code text, lat double precision,
  lng double precision, website_host text, instagram_url text, phone_e164 text, phone_sources smallint,
  phone_wrong boolean, email text, email_alternates jsonb, email_state text, email_checked_at timestamp with time zone,
  rating numeric, reviews integer, stage text, closed_reason text, last_outcome text, last_note text, contact_id uuid,
  contacted_at timestamp with time zone, converted_at timestamp with time zone, exported_at timestamp with time zone,
  found_at timestamp with time zone, places integer, version integer, page_key text, sort_key text, about text,
  hours jsonb, image_url text, price text, reviews_dist jsonb, facebook_url text, linkedin_url text, tiktok_url text,
  claimed boolean, maps_url text, rank integer, neighborhood text, mark_path text, later_at timestamp with time zone,
  chain_id uuid, kind text, facts jsonb)
language sql
stable
set search_path = public
as $$
  with args as (
    select coalesce(p_dir, 'asc') = 'desc' as descending,
           case when p_after_id is not null then p_after_key else split_part(coalesce(p_after_key, ''), '|', 1) end as after_k,
           coalesce(p_after_id::text, nullif(split_part(coalesce(p_after_key, ''), '|', 2), '')) as after_id
  ),
  base as (
    select m.id as member_id, m.lead_id, l.place_id, m.search_id, m.round_id, m.class, m.excluded_by, m.fit, m.reason, m.distance_m,
           m.counted, m.counted_month, m.judgment, coalesce(m.judgment->'shares', '[]'::jsonb) as shares,
           l.business_name, l.category, l.street, l.city, l.region, l.postal_code, l.lat, l.lng, l.website_host, l.instagram_url,
           l.phone_e164, l.phone_sources, l.phone_wrong, l.email, l.email_alternates, l.email_state, l.email_checked_at, l.rating, l.reviews,
           l.stage, l.closed_reason, l.last_outcome, l.last_note, l.contact_id, l.contacted_at, l.converted_at, l.exported_at, l.found_at,
           (select count(*)::integer from public.lead_places p where p.lead_id = l.id) as places, l.version,
           l.about, l.hours, l.image_url, l.price, l.reviews_dist, l.facebook_url, l.linkedin_url, l.tiktok_url, l.claimed, l.maps_url, l.rank, l.neighborhood, l.mark_path,
           m.later_at,
           -- The reach-out the lead goes with (lead_chain_of, the one rule).
           public.lead_chain_of(l.tenant_id, l.id) as chain_id,
           -- A place or a company, and a company's people (00429).
           l.kind, l.facts,
           case coalesce(p_sort, 'found')
             when 'fit' then (case m.fit when 'strong' then '0' when 'look' then '1' when 'long' then '2' else '3' end)
                             || lpad((9999999999 - floor(extract(epoch from l.found_at)))::bigint::text, 10, '0')
             when 'distance' then lpad(coalesce(m.distance_m, 999999999)::text, 9, '0')
                             || lpad((9999999999 - floor(extract(epoch from l.found_at)))::bigint::text, 10, '0')
             -- The three column sorts B adds. A key is text and never holds
             -- the "|" the packed key splits on.
             when 'business' then left(replace(lower(coalesce(nullif(l.business_name, ''), 'zzzz')), '|', ' '), 60)
                             || lpad((9999999999 - floor(extract(epoch from l.found_at)))::bigint::text, 10, '0')
             when 'rating' then lpad(coalesce((l.rating * 10)::integer, 0)::text, 3, '0')
                             || lpad((9999999999 - floor(extract(epoch from l.found_at)))::bigint::text, 10, '0')
             when 'stage' then (case l.stage when 'ready' then '0' when 'nurture' then '1' when 'converted' then '2' else '3' end)
                             || lpad((9999999999 - floor(extract(epoch from l.found_at)))::bigint::text, 10, '0')
             -- The pile (00426): undecided first, then put off for later (the oldest first), then the decided: on the list
             -- it adds to, or with a reach-out already (lead_chain_of: one lead, one reach-out), or no longer Ready; within
             -- each, the strongest fit, then a checked address before a number alone, then the newest.
             when 'pile' then
               (case when l.stage <> 'ready'
                       or (p_list_id is not null and exists (select 1 from public.lead_search_members x
                                                             where x.search_id = p_list_id and x.lead_id = l.id and x.blanked_at is null))
                       or public.lead_chain_of(l.tenant_id, l.id) is not null
                       then '2' || lpad('0', 10, '0')
                     when m.later_at is not null then '1' || lpad(floor(extract(epoch from m.later_at))::bigint::text, 10, '0')
                     else '0' || lpad('0', 10, '0') end)
               || (case m.fit when 'strong' then '0' when 'look' then '1' when 'long' then '2' else '3' end)
               || (case when l.email_state = 'ok' then '0' when l.phone_e164 is not null then '1' else '2' end)
               || lpad((9999999999 - floor(extract(epoch from l.found_at)))::bigint::text, 10, '0')
             else lpad((9999999999 - floor(extract(epoch from l.found_at)))::bigint::text, 10, '0')
           end as k
      from public.lead_search_members m
      join public.leads l on l.id = m.lead_id
     where m.tenant_id = p_tenant_id
       and (p_search_id is null or m.search_id = p_search_id)
       and m.class = coalesce(p_class, 'qualified')
       and public.lead_member_shown(m.class, m.counted)
       and public.lead_in_list(l.stage, l.closed_reason, coalesce(p_list, 'all'))
       and m.blanked_at is null and l.blanked_at is null and l.erased_at is null
  )
  select b.member_id, b.lead_id, b.place_id, b.search_id, b.round_id, b.class, b.excluded_by, b.fit, b.reason, b.distance_m,
         b.counted, b.counted_month, b.judgment, b.shares,
         b.business_name, b.category, b.street, b.city, b.region, b.postal_code, b.lat, b.lng, b.website_host, b.instagram_url,
         b.phone_e164, b.phone_sources, b.phone_wrong, b.email, b.email_alternates, b.email_state, b.email_checked_at, b.rating, b.reviews,
         b.stage, b.closed_reason, b.last_outcome, b.last_note, b.contact_id, b.contacted_at, b.converted_at, b.exported_at, b.found_at,
         b.places, b.version,
         b.k as page_key,
         b.k || '|' || b.member_id::text as sort_key,
         b.about, b.hours, b.image_url, b.price, b.reviews_dist, b.facebook_url, b.linkedin_url, b.tiktok_url, b.claimed, b.maps_url, b.rank, b.neighborhood, b.mark_path,
         b.later_at, b.chain_id, b.kind, b.facts
    from base b, args a
   where p_after_key is null
      or (a.descending and (b.k, b.member_id::text) < (a.after_k, a.after_id))
      or (not a.descending and (b.k, b.member_id::text) > (a.after_k, a.after_id))
   -- One query, two directions: the pair that is not this call's is a constant
   -- null for every row and sorts nothing.
   order by (case when a.descending then b.k end) desc, (case when a.descending then b.member_id::text end) desc,
            (case when not a.descending then b.k end) asc, (case when not a.descending then b.member_id::text end) asc
   limit least(greatest(coalesce(p_limit, 200), 1), 500)
$$;

revoke execute on function public.leads_page(uuid, uuid, text, text, text, integer, text, text, uuid, uuid) from public, anon;
grant execute on function public.leads_page(uuid, uuid, text, text, text, integer, text, text, uuid, uuid) to authenticated, service_role;

comment on function public.leads_page(uuid, uuid, text, text, text, integer, text, text, uuid, uuid) is
  'A page of members of one class (qualified: the counted ones; review; excluded) joined to their leads, narrowed to one of the rail''s lists (lead_in_list), keyset-paged on the sort key in either direction, under the caller''s row security. Seven sorts: found, fit, distance, business, rating, stage, and pile (00426: undecided first, then put off for later, oldest first, then the decided: on the list p_list_id, with a reach-out already, or no longer Ready; within each, the strongest fit, a checked address before a number alone, the newest). Each row says when it was put off (later_at), the reach-out it goes with (chain_id, lead_chain_of), and what the lead is with a company''s people (kind, facts: 00429). Hand the last row''s page_key and member_id back as p_after_key and p_after_id; A''s packed sort_key still works on its own, split here. Which memberships show is lead_member_shown (00212).';

-- 00474 · A people search's companies are judged (Ruben, 22 Oct 2026: "check each company's fit from its description, as
-- Maps searches do, before it counts as a lead").
--
-- A people search kept every company its directory named with a work address, and counted each once the address
-- checked out: the provider's filters were its only criteria. Now core reads each company against what the search
-- asked for before it is kept (contracts company-judge.ts, core runner/people.ts): one that is no fit is never kept
-- (none of its people, no check, no count); one whose facts do not settle it waits in Needs review for the owner; one
-- that fits waits only on its address, as before.
--
--   lead_company_upsert     00430's, taking each company's fit, the reasons the judge left (beyond its address) and
--                           its answer, kept on the member as a place's are.
--   lead_estimate_ceiling   00430's, with the judge's price a person in a people search's ceiling, as the route's
--                           estimate now has it (contracts peopleEstimateUsd, the card's judgePerPlaceUsd).

-- 00430's ceiling with the judge's price in a people search's.
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
  'The most a finder door takes as its estimate (00364, 00430, 00474). search: ceil(((25 + least(1000, 2 x count)) x $0.00819 + 2 x terms x $0.00005) x 1.3, to the cent) + 2 x terms x $0.50; list: ceil(rows x $0.00089 x 1.3, to the cent) + $0.50; people: ceil((least(1000, 2 x count) x $0.00519 + $0.01) x 1.3, to the cent) + 2 x $0.50. What the route computes (estimateForRound, leadImportEstimateUsd, peopleEstimateUsd) never passes it.';

-- 00430's door, with each company's fit, its judge's reasons and its answer on the member.
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
  v_want   text;
  v_email  text;
  v_addr   integer;
  v_host   text;
  v_lead   uuid;
  v_people jsonb;
  v_shares jsonb;
  v_fit    text;
  v_reasons jsonb;
  v_judgment jsonb;
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
    v_key  := lower(btrim(coalesce(v_c->>'source_key', '')));
    v_want := lower(btrim(coalesce(v_c->>'email', '')));
    if char_length(v_key) not between 1 and 200 or char_length(btrim(coalesce(v_c->>'name', ''))) = 0
       or jsonb_typeof(v_c->'facts') is distinct from 'object' or octet_length((v_c->'facts')::text) > 8000
       or octet_length(coalesce(v_c->'judgment', 'null'::jsonb)::text) > 4000
       or exists (select 1 from public.lead_suppressions x
                   where x.tenant_id = v_round.tenant_id and x.kind = 'domain'
                     and x.hash = public.lead_suppression_hash(v_round.tenant_id, v_key)) then
      v_left := v_left + 1;
      continue;
    end if;
    select coalesce(jsonb_agg(x.p order by x.n), '[]'::jsonb) into v_people
      from (select a.p, a.n
              from jsonb_array_elements(case when jsonb_typeof(v_c->'facts'->'people') = 'array'
                                             then v_c->'facts'->'people' else '[]'::jsonb end) with ordinality as a(p, n)
             where jsonb_typeof(a.p) = 'object' and nullif(btrim(coalesce(a.p->>'name', '')), '') is not null
               and (nullif(btrim(coalesce(a.p->>'email', '')), '') is null
                    or not (public.lead_address_suppressed(v_round.tenant_id, lower(btrim(a.p->>'email')))
                            or public.lead_address_in_people(v_round.tenant_id, a.p->>'email')))
             order by a.n
             limit 5) x;
    v_addr := null;
    v_email := null;
    select (x.n - 1)::integer, lower(btrim(x.p->>'email')) into v_addr, v_email
      from jsonb_array_elements(v_people) with ordinality as x(p, n)
     where nullif(btrim(coalesce(x.p->>'email', '')), '') is not null
     order by (lower(btrim(x.p->>'email')) = v_want) desc, x.n
     limit 1;
    if v_email is null or char_length(v_email) > 254 or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
      v_left := v_left + 1;
      continue;
    end if;

    -- Held already: the same company (its key), or its address on another lead (a place, a file's row).
    v_lead := null;
    select l.id into v_lead from public.leads l
     where l.tenant_id = v_round.tenant_id and l.source = 'people_at_companies' and l.source_key = v_key;
    if v_lead is null then
      select l.id into v_lead from public.leads l
       where l.tenant_id = v_round.tenant_id and l.email = v_email
       order by l.found_at
       limit 1;
    end if;
    if v_lead is not null then
      -- A company keeps the people it lacked, five at most, by their address (one with none never joins: who was erased is
      -- known by their address alone); its addressee stays who it was.
      update public.leads l
         set facts = jsonb_set(l.facts, '{people}', (
               select coalesce(jsonb_agg(x.p order by x.n), '[]'::jsonb)
                 from (select p, n from jsonb_array_elements(coalesce(l.facts->'people', '[]'::jsonb)) with ordinality as a(p, n)
                       union all
                       select p, 100 + n from jsonb_array_elements(v_people) with ordinality as b(p, n)
                        where nullif(btrim(coalesce(b.p->>'email', '')), '') is not null
                          and not exists (select 1 from jsonb_array_elements(coalesce(l.facts->'people', '[]'::jsonb)) o
                                           where lower(o->>'email') = lower(b.p->>'email')
                                              or (o->>'email' is null and lower(o->>'name') = lower(b.p->>'name')))
                       order by n
                       limit 5) x)),
             version = version + 1
       where l.id = v_lead and l.kind = 'company' and l.erased_at is null and l.blanked_at is null;
      v_held := v_held + 1;
      continue;
    end if;

    v_host := case when v_key ~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$' then v_key end;
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
            v_email, 'checking',
            jsonb_build_object('people', v_people, 'addressee', v_addr, 'size', v_c->'facts'->'size'))
    on conflict (tenant_id, source, source_key) where source_key is not null do nothing
    returning id into v_lead;
    if v_lead is null then
      v_held := v_held + 1;
      continue;
    end if;
    -- The leads it shares a website or an address's domain with (a place Maps found, a file's row), as a list's row is
    -- marked (00364): one business is written to once.
    select coalesce(jsonb_agg(jsonb_build_object('kind', 'host', 'lead_id', x.id)), '[]'::jsonb) into v_shares
      from (select l.id from public.leads l
             where v_host is not null and l.tenant_id = v_round.tenant_id and l.id <> v_lead
               and l.erased_at is null and l.blanked_at is null
               and (public.lead_site_key(l.website_host) = public.lead_site_key(v_host)
                    or lower(split_part(coalesce(l.email, ''), '@', 2)) = v_host)
             limit 5) x;
    -- What its judge made of it (00474): its fit, the reasons that hold it in Needs review beyond its address (a kind its
    -- facts did not settle, a batch the judge refused), and its answer, kept as a place's are. One with none is as it was:
    -- it waits on its address alone, and the check promotes it (00272: only `email:` reasons are the check's to clear).
    v_fit := case when v_c->>'fit' in ('strong', 'look', 'long') then v_c->>'fit' end;
    select coalesce(jsonb_agg(x.r), '[]'::jsonb) into v_reasons
      from jsonb_array_elements_text(case when jsonb_typeof(v_c->'reasons') = 'array' then v_c->'reasons'
                                          else '[]'::jsonb end) as x(r)
     where x.r ~ '^[a-z_]+:[a-z_]+$' and x.r not like 'email:%';
    v_judgment := case when jsonb_typeof(v_c->'judgment') = 'object'
                       then (v_c->'judgment') - 'reasons' - 'shares' else '{}'::jsonb end;
    insert into public.lead_search_members (search_id, lead_id, round_id, tenant_id, judgment, class, fit, reason)
    values (v_round.search_id, v_lead, v_round.id, v_round.tenant_id,
            v_judgment || jsonb_build_object('reasons', v_reasons || jsonb_build_array('email:checking'), 'shares', v_shares),
            'review', v_fit, left(coalesce(v_c->>'reason', ''), 120))
    on conflict (search_id, lead_id) do nothing;
    v_made := v_made + 1;
  end loop;
  return jsonb_build_object('ok', true, 'made', v_made, 'held', v_held, 'left_out', v_left);
end $$;
revoke all on function public.lead_company_upsert(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.lead_company_upsert(uuid, jsonb) to service_role;
comment on function public.lead_company_upsert(uuid, jsonb) is
  'The people card''s page of companies (00430), the service role''s, before lead_collect_commit moves the run: a company with a name and a key whose domain is not on the never-again list keeps its people (five at most) but anyone on that list or in People (lead_address_suppressed, lead_address_in_people), and its addressee is the one its source chose while still kept, else the first kept with an address; with one, it becomes a company lead (source people_at_companies, its people in facts, its address checking) and a member of the round in Needs review on its address and on anything its judge did not settle, with its fit and the judge''s answer (00474), marked with the leads it shares a website with (judgment.shares), which the check promotes (00242''s J2). One the workspace holds already (by its key, or its address on any lead) keeps its place and gains the people it lacked, five at most. Idempotent. Returns {ok, made, held, left_out}.';

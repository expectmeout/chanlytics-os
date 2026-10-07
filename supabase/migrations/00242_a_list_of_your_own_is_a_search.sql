-- 00242 · A list of your own is a search.
--
-- Reach out, Part 7 (docs/superpowers/plans/2026-09-28-reach-out-part-7-bring-your-own-list.md, J1-J12). A reach-out
-- writes to a search, so the leads a business brings (a file of its own) or picks on Leads (Write to them) become a
-- search of their own, and every rule a reach-out keeps holds for them as it is:
--
--   lead_searches.via    gains import (a file) and chosen (a selection) (J1).
--   lead_search_import   a file's rows as a search, every address checked first by the finder's own check round (J2-J6).
--   lead_search_choose   leads already counted, as a search, with nothing checked or charged again (J6, J7).
--   lead_rounds_notify   00163's, whole: a file's check ends with a line in its own words, a choice rings nothing (J11).
--   reach_out_lead_timeline  00241's, whole, with found_on_listing: a lead a list brought was found on no listing.
--
-- Every statement re-runs. The CHECK takes ACCESS EXCLUSIVE on a table a live workspace reads, so the lock guard 00241
-- and the finder's migrations carry.
set local lock_timeout = '3s';
do $$
begin
  raise notice 'lock_timeout for this migration: %', current_setting('lock_timeout');
  if current_setting('lock_timeout') <> '3s' then
    raise warning 'this file was applied outside a transaction, so SET LOCAL did nothing: run it inside begin/commit, or set lock_timeout yourself before it';
  end if;
end $$;

/* ------------------------------------------------------------ 1. how a search was made -- */

alter table public.lead_searches drop constraint if exists lead_searches_via_check;
alter table public.lead_searches add constraint lead_searches_via_check
  check (via in ('people', 'ask', 'import', 'chosen'));
comment on column public.lead_searches.via is
  'How the search was made: people (the finder on the page), ask (the finder through Ask), import (a file of the owner''s own, 00242) or chosen (leads picked on Leads for a reach-out, 00242). An import or a chosen search has no finder plan: its plan carries `list` and no area, and it is never searched again.';

/* ------------------------------------------------------------ 2. a file of your own -- */

create or replace function public.lead_search_import(
  p_tenant_id    uuid,
  p_name         text,
  p_asked        text,
  p_rows         jsonb,
  p_estimate_usd numeric
)
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
  if jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows) = 0 or jsonb_array_length(p_rows) > 500 then
    raise exception 'rows: 1 to 500' using errcode = '22023';
  end if;
  if char_length(v_name) = 0 then
    raise exception 'a list is named' using errcode = '22023';
  end if;
  if p_estimate_usd is null or p_estimate_usd < 0 or p_estimate_usd > 25 then
    raise exception 'estimate: 0 to 25 usd' using errcode = '22023';
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
            then 'This month''s 500 leads are used, and a list counts each address that checks out. Your leads renew on ' || public.lead_renews_on(p_tenant_id) || '.'
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
comment on function public.lead_search_import(uuid, text, text, jsonb, numeric) is
  'An owner''s or a partner''s file of leads (1 to 500 rows of {name, email, phone?, website_host?, city?, region?, category?}) as a search of its own, via import (00242, J2-J6). A row without a name or an address, a second row of one address, an address or number a person in People holds and one on the never-again list are left out and counted. An address already a lead joins as that lead: counted in a kept search, it joins counted, outside the round, and draws nothing; one another round is checking is left out (elsewhere); otherwise it is checked. Every other address is a new lead in Needs review for its address alone, marked with any lead it shares a number or a website with, checked by the finder''s own round (queued, running, checking; a lead_check job), which lead_check_commit settles. One lead of the month is reserved per address checked, with the check''s estimate, never under $0.50 ({error: month_leads_used | budget_used | day_cap, sentence}); paused searching refuses ({error: paused}); nothing to add refuses ({error: nothing}). Returns {search_id, round_id, added, checking, counted, left_out: {unreadable, twice, customer, never_again, elsewhere}}.';
revoke execute on function public.lead_search_import(uuid, text, text, jsonb, numeric) from public, anon;
grant execute on function public.lead_search_import(uuid, text, text, jsonb, numeric) to authenticated;

/* ------------------------------------------------------------ 3. leads you chose -- */

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
  if cardinality(v_ids) = 0 or cardinality(v_ids) > 500 then
    raise exception 'leads: 1 to 500' using errcode = '22023';
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
comment on function public.lead_search_choose(uuid, text, uuid[]) is
  'An acting member''s choice of leads (1 to 500 ids) as a search of its own, via chosen, for a reach-out to write to (00242, J7). Only a lead of this workspace with an address and counted in one of its kept searches joins, Qualified and counted without drawing the month again; the rest are counted as not_counted, no_email or gone. Its round is made and ended at once (target_reached), so nothing is checked and nothing rings. Refuses {error: nothing, sentence} when none joins. Returns {search_id, round_id, counted, left_out: {not_counted, no_email, gone}}.';
revoke execute on function public.lead_search_choose(uuid, text, uuid[]) from public, anon;
grant execute on function public.lead_search_choose(uuid, text, uuid[]) to authenticated;

/* ------------------------------------------------------------ 4. the bell, from 00163 -- */

-- 00163's body word for word but the list's lines: a file's check ends with "Your list … is checked" in its own words,
-- once the check ran, or "could not be checked" when it ended any other way (searching paused, the checker failed);
-- and a chosen search, whose round is made and ended in one door, rings nothing (J11).
create or replace function public.lead_rounds_notify()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
  v_via  text;
  v_n    integer;
  v_id   uuid;
begin
  select s.name, s.via into v_name, v_via from public.lead_searches s where s.id = NEW.search_id;
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
  elsif NEW.state = 'ended' and coalesce(OLD.state, '') <> 'ended' and coalesce(NEW.ending, '') not in ('stopped', 'question_unanswered') then
    select count(*)::integer into v_n from public.lead_search_members m
     where m.round_id = NEW.id and m.class = 'qualified' and m.blanked_at is null;
    insert into public.notifications (tenant_id, kind, title, body, route, subject_type, subject_id)
    select NEW.tenant_id, 'leads_ready',
           case when v_via <> 'import' then left('Your search for ' || v_name || ' is done', 200)
                when NEW.ending in ('target_reached', 'searched_everything') then left('Your list ' || v_name || ' is checked', 200)
                else left('Your list ' || v_name || ' could not be checked', 200) end,
           case when v_via <> 'import' then case when v_n > 0 then v_n || ' found.' else 'Nothing new was counted.' end
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
  'The bell''s two lead kinds: one leads_question row when a round stops to ask, pointing at the search''s left-out pile (the places the question is about), and one leads_ready row when it ends with anything but "stopped" or "question_unanswered", pointing at the search; each once per round, each with a push_send job so a phone hears it too. A file of the owner''s own (via import, 00242) rings "Your list … is checked" with how many have a checked address once its check ran, or "could not be checked" when the check ended any other way; a chosen search rings nothing. A member''s own read mark is notification_marks'', as for every other kind.';
revoke execute on function public.lead_rounds_notify() from public, anon, authenticated;

/* ------------------------------------------------------------ 5. one lead's story, from 00241 -- */

-- 00241's reach_out_lead_timeline word for word but one key, found_on_listing: a lead a list of the owner's own brought
-- was found on no listing, and its story says so rather than "Found on Google Maps".
create or replace function public.reach_out_lead_timeline(p_tenant_id uuid, p_lead_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_lead public.leads%rowtype;
  v_root uuid;
begin
  if auth.uid() is null or not exists (
       select 1 from public.memberships m where m.tenant_id = p_tenant_id and m.user_id = auth.uid()) then
    raise exception 'Workspace not found.' using errcode = 'P0002';
  end if;
  select * into v_lead from public.leads l
   where l.id = p_lead_id and l.tenant_id = p_tenant_id and l.erased_at is null and l.blanked_at is null;
  if not found then
    return null;
  end if;
  select s.root_id into v_root from public.reach_out_sends s
   where s.tenant_id = p_tenant_id and s.lead_id = p_lead_id
   order by s.created_at desc
   limit 1;
  return jsonb_build_object(
    'lead_id', v_lead.id,
    'business_name', v_lead.business_name,
    'stage', v_lead.stage,
    'closed_reason', v_lead.closed_reason,
    'found_at', v_lead.found_at,
    'email_state', v_lead.email_state,
    'resume_at', v_lead.resume_at,
    'booked_at', v_lead.booked_at,
    'stopped_at', v_lead.reach_out_stopped_at,
    -- Found on a listing (the finder's), or brought on a list of the owner's own with no place (00242).
    'found_on_listing', v_lead.place_id is not null,
    'chain', (select jsonb_build_object('root_id', p.id, 'name', p.name, 'state', p.state)
                from public.playbooks p where p.id = v_root and p.tenant_id = p_tenant_id),
    -- The chain's search when there is one, else the newest search that found the lead.
    'search', coalesce(
      (select jsonb_build_object('id', q.id, 'name', q.name, 'asked', q.asked, 'fit', sm.fit)
         from public.playbooks p
         join public.lead_searches q on q.id = p.lead_search_id and q.tenant_id = p_tenant_id
         left join public.lead_search_members sm on sm.search_id = q.id and sm.lead_id = v_lead.id
        where p.id = v_root),
      (select jsonb_build_object('id', q.id, 'name', q.name, 'asked', q.asked, 'fit', sm.fit)
         from public.lead_search_members sm
         join public.lead_searches q on q.id = sm.search_id and q.removed_at is null
        where sm.tenant_id = p_tenant_id and sm.lead_id = v_lead.id and sm.blanked_at is null
        order by sm.created_at desc
        limit 1)),
    -- The person's email thread: where the reach-out's emails, and the answers to them, are.
    'conversation_id', (select m.conversation_id from public.reach_out_sends s join public.messages m on m.id = s.message_id
                         where s.tenant_id = p_tenant_id and s.lead_id = v_lead.id and s.state = 'sent'
                         order by s.sent_at desc
                         limit 1),
    'sends', coalesce((
      with recursive c as (
        select p.id, 0 as n from public.playbooks p where p.id = v_root
        union all
        select p.id, c.n + 1 from public.playbooks p join c on p.after_playbook_id = c.id
      )
      select jsonb_agg(jsonb_build_object(
               'id', s.id,
               'n', c.n,
               'hand', p.hand->>'kind',
               'state', s.state,
               'reason', s.reason,
               'send_at', s.send_at,
               'sent_at', coalesce(s.sent_at, case when s.state = 'failed' and public.email_left(m.status, m.error)
                                                  then public.email_sent_at(m.meta, m.status_updated_at, m.created_at) end),
               'left', s.state = 'sent' or (s.state = 'failed' and coalesce(public.email_left(m.status, m.error), false)),
               'angle', s.angle,
               'host', d.host,
               'message_id', s.message_id,
               'email_status', m.status,
               'bounced', coalesce(m.status = 'failed' and m.error->>'provider' = 'bounced', false))
             order by coalesce(s.sent_at, s.send_at, s.created_at), s.id)
        from (select * from public.reach_out_sends x
               where x.tenant_id = p_tenant_id and x.lead_id = v_lead.id and x.root_id = v_root
               order by x.created_at desc
               limit 20) s
        left join c on c.id = s.playbook_id
        left join public.playbooks p on p.id = s.playbook_id
        left join public.sending_domains d on d.id = s.domain_id
        left join public.messages m on m.id = s.message_id), '[]'::jsonb),
    'readings', coalesce((
      select jsonb_agg(jsonb_build_object(
               'message_id', r.message_id,
               'read_at', r.read_at,
               'intent', r.intent,
               'claim', r.claim,
               'summary', r.summary,
               'undone', r.undone_at is not null,
               'until_at', r.until_at,
               -- What the reading did, as its door recorded it (contracts readingPlan): the page says it, never re-derives it.
               'stops', coalesce((r.plan->>'stops')::boolean, false),
               'convert', coalesce((r.plan->>'convert')::boolean, false),
               'said_no', coalesce((r.plan->>'saidNo')::boolean, false),
               'can_undo', public.reach_out_reply_undoable(r.message_id) is null)
             order by r.read_at desc)
        from (select * from public.reach_out_replies x
               where x.tenant_id = p_tenant_id and x.lead_id = v_lead.id
               order by x.read_at desc
               limit 10) r), '[]'::jsonb),
    'can_stop', v_root is not null and v_lead.reach_out_stopped_at is null
  );
end $$;
comment on function public.reach_out_lead_timeline(uuid, uuid) is
  'One lead''s reach-out (Reach out Part 6, H9, H11), for a member: the lead''s stage, dates and search, whether it was found on a listing (found_on_listing, 00242), its chain, its person''s email thread, its sends (at most 20, in time order), its readings (at most 10, newest first, with can_undo from reach_out_reply_undoable) and can_stop. Null for a lead the workspace does not hold.';

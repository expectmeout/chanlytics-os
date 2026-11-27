-- 00724 · A member's own fields and reads through their doors (lanes 9 and 2 of the code refinement plan, their last
-- piece, 27 Nov 2026: the dashboard's events ledger leaves, decision 0150's open reads get their doors).
--
-- The dashboard wrote three events after the fact from TypeScript, on the service role, the last callers of its events
-- ledger (apps/dashboard/src/server/shared/ledgers/events.ts, decision 0150 step 3): the workspace's name, zone and word
-- for a booking each wrote settings.changed after a session's update of the tenant's row, and a first search wrote the
-- funnel's milestone after its door answered. Each is written now in the change's own transaction (decision 0031,
-- invariant 2), and the ledger has no caller. And two reads a member's session was refused though the answer is theirs
-- (0150's open question): what the team's mornings offered lately, and what Anthropic has said of the workspace.
--
--   workspace_own_fields_write   New: the workspace's name, zone and word for a booking, as the member who may change
--                                its settings (caller_has_permission 'settings', the floor tenants_owner_update was),
--                                with settings.changed (which fields, who, and a name's from and to) in one write. The
--                                kind is the one the dashboard wrote, for the same act: "Settings changed".
--   lead_search_create, lead_people_search_create
--                                Re-made from the snapshot's own text: a search that is made notes the workspace's first
--                                (workspace_activation_note, 00721: once, under its lock), as the dashboard did after it.
--   ask_mornings_seen            New: each morning of the team's since a day, whether it is the caller's, and its cards'
--                                titles, kinds and outcomes, never their words: what a morning reads so it does not offer
--                                again what a teammate has (decision 0087). For a member who may read the workspace.
--   workspace_model_standing     New: what Anthropic has said of the workspace's profile (decision 0097), for a member
--                                who may read the workspace: the one word the shell's line is said from.
--
-- Each new door asks who is calling in the house's form (decision 0150): a member is asked; the service role and a
-- session of the database itself pass as before; an API session with no person in it is refused (28000).
--
-- Deploy order: apply first, then either. The re-made doors keep their signatures; an old dashboard still writes the two
-- events itself (a first search's milestone is once, so a second write is none, and an old save of the zone, the word or
-- the name writes its own settings.changed), and the new one calls the new doors.
set local lock_timeout = '3s';

/* -- the workspace's own fields: its name, its zone, its word for a booking, each with settings.changed -- */

create or replace function public.workspace_own_fields_write(p_tenant_id uuid, p_set jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  -- A signed-in member is asked who they are; the service role and a session of the database itself are let through.
  v_by     uuid := auth.uid();
  v_was    public.tenants;
  v_row    public.tenants;
  v_bad    text;
  v_fields jsonb;
begin
  if v_by is not null then
    if p_tenant_id is null or not public.caller_has_permission(p_tenant_id, 'settings') then
      raise exception 'Not yours to change.' using errcode = '42501';
    end if;
  elsif coalesce((select auth.role()), '') in ('anon', 'authenticated') then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  if p_set is null or jsonb_typeof(p_set) <> 'object' or p_set = '{}'::jsonb then
    raise exception 'workspace_own_fields_write: the change names the fields it sets' using errcode = '22023';
  end if;
  select k into v_bad from jsonb_object_keys(p_set) k where k not in ('name', 'timezone', 'appointment_word') limit 1;
  if v_bad is not null then
    raise exception 'workspace_own_fields_write: % is not one of the workspace''s own fields', v_bad using errcode = '22023';
  end if;
  -- The row as it stood, held while it changes: what a name's event says it changed from.
  select * into v_was from public.tenants t where t.id = p_tenant_id for update;
  if not found then
    return null;
  end if;
  update public.tenants t
     set name = case when p_set ? 'name' then p_set ->> 'name' else t.name end,
         timezone = case when p_set ? 'timezone' then p_set ->> 'timezone' else t.timezone end,
         appointment_word = case when p_set ? 'appointment_word' then p_set ->> 'appointment_word'
                                 else t.appointment_word end
   where t.id = p_tenant_id
  returning * into v_row;
  -- On the ledger as every other setting is: which fields moved and who by, never the value but a name's, which the
  -- ledger keeps from and to.
  select jsonb_agg(k order by k) into v_fields from jsonb_object_keys(p_set) k;
  insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
  values (p_tenant_id, 'settings.changed', 'system', 'workspace', p_tenant_id,
          jsonb_build_object('fields', v_fields, 'by', v_by, 'version', null)
            || case when p_set ? 'name' then jsonb_build_object('from', v_was.name, 'to', v_row.name)
                    else '{}'::jsonb end);
  return jsonb_build_object('id', v_row.id, 'slug', v_row.slug, 'name', v_row.name, 'status', v_row.status,
                            'timezone', v_row.timezone, 'appointment_word', v_row.appointment_word);
end $$;

revoke all on function public.workspace_own_fields_write(uuid, jsonb) from public, anon;
grant execute on function public.workspace_own_fields_write(uuid, jsonb) to authenticated, service_role;

comment on function public.workspace_own_fields_write(uuid, jsonb) is
  'The workspace''s own fields, its name, its zone and its word for a booking (p_set names those it sets), as a member who may change its settings (caller_has_permission ''settings''), with settings.changed (the fields, who, and a name''s from and to) in the same transaction (00724). Answers the row as it now stands (id, slug, name, status, timezone, appointment_word); null where there is no such workspace. A zone the database does not know is refused as the table refuses it (22023).';

/* -- a search made notes the workspace's first: the funnel's milestone in the search's own write -- */

-- The dashboard noted a first search after the door answered, as the service role (workspace_activation_note, 00721).
-- The door notes it now, once, under the milestone's own lock: a search that is refused notes nothing.

-- lead_search_create
CREATE OR REPLACE FUNCTION public.lead_search_create(p_tenant_id uuid, p_plan jsonb, p_via text, p_estimate_usd numeric, p_thread_id uuid DEFAULT NULL::uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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
  -- The estimate is the route's to compute (estimateForRound) and never more than this plan can cost (00364).
  if p_estimate_usd > public.lead_estimate_ceiling('search', v_count, jsonb_array_length(p_plan->'terms')) then
    raise exception 'estimate: 0 to % usd for this plan', public.lead_estimate_ceiling('search', v_count, jsonb_array_length(p_plan->'terms'))
      using errcode = '22023';
  end if;

  if not public.lead_searches_on(p_tenant_id) then
    return jsonb_build_object('error', 'paused', 'sentence', 'Lead searches are paused for now. Your leads are all here, and nothing is being counted.');
  end if;
  -- A workspace that may not spend is refused before anything is written (00364): the route asks requireSpend, and this
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
  -- The workspace's first search: the funnel's third milestone, once (00721), in the search's own write (00724).
  perform public.workspace_activation_note(p_tenant_id, 'first_lead_search',
                                           case when p_via = 'ask' then 'ask' else 'people' end);
  return jsonb_build_object('search_id', v_search, 'round_id', v_round);
end $$;

-- lead_people_search_create
CREATE OR REPLACE FUNCTION public.lead_people_search_create(p_tenant_id uuid, p_plan jsonb, p_via text, p_estimate_usd numeric, p_thread_id uuid DEFAULT NULL::uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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
  if not public.lead_card_live('people_at_companies') then
    return jsonb_build_object('error', 'no_card', 'sentence', 'Finding people at companies opens once it has been checked. Nothing was started.');
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
  -- The workspace's first search: the funnel's third milestone, once (00721), in the search's own write (00724).
  perform public.workspace_activation_note(p_tenant_id, 'first_lead_search',
                                           case when p_via = 'ask' then 'ask' else 'people' end);
  return jsonb_build_object('search_id', v_search, 'round_id', v_round);
end $$;

/* -- two reads a member's session was refused, though the answer is theirs -- */

-- What the team's mornings offered lately (decision 0087): RLS keeps a morning's rows to its member, and a morning's
-- look back reads the team's, so it does not offer again what a teammate has. Each morning's cards are answered by their
-- title, kind and outcome alone, never their words, which stay the member's own.
create or replace function public.ask_mornings_seen(p_tenant_id uuid, p_since date)
returns table(day date, mine boolean, proposals jsonb)
language plpgsql
stable
security definer
set search_path to 'public'
as $$
begin
  if auth.uid() is not null then
    if p_tenant_id is null or not coalesce(public.may_read_workspace(p_tenant_id), false) then
      raise exception 'Not a member of this workspace.' using errcode = '42501';
    end if;
  elsif coalesce((select auth.role()), '') in ('anon', 'authenticated') then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  return query
    select m.day,
           m.user_id is not distinct from auth.uid(),
           -- The first answer of the morning's thread: a question asked after it, in its thread, is not the morning.
           (select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
                      'title', c ->> 'title', 'kind', c ->> 'kind', 'outcome', c -> 'outcome'))), '[]'::jsonb)
              from jsonb_array_elements(case when jsonb_typeof(first.proposals) = 'array'
                                             then first.proposals else '[]'::jsonb end) c
             where jsonb_typeof(c) = 'object')
      from public.ask_mornings m
      left join lateral (
        select a.content -> 'proposals' as proposals
          from public.ask_messages a
         where a.thread_id = m.thread_id and a.role = 'assistant'
         order by a.created_at, a.id
         limit 1
      ) first on true
     where m.tenant_id = p_tenant_id and m.day >= p_since and m.thread_id is not null
     order by m.day desc
     limit 120;
end $$;

revoke all on function public.ask_mornings_seen(uuid, date) from public, anon;
grant execute on function public.ask_mornings_seen(uuid, date) to authenticated, service_role;

comment on function public.ask_mornings_seen(uuid, date) is
  'What the team''s mornings offered since a day, newest first, at most 120 (decision 0087, 00724): each morning''s day, whether it is the caller''s, and the cards of its thread''s first answer by their title, kind and outcome, never their words. For a member who may read the workspace (may_read_workspace); the service role and a session of the database itself name their workspace themselves.';

-- What Anthropic has said of the workspace's profile (decision 0097): the service role's table, read for the shell's
-- line, which says it to every member.
create or replace function public.workspace_model_standing(p_tenant_id uuid)
returns text
language plpgsql
stable
security definer
set search_path to 'public'
as $$
begin
  if auth.uid() is not null then
    if p_tenant_id is null or not coalesce(public.may_read_workspace(p_tenant_id), false) then
      raise exception 'Not a member of this workspace.' using errcode = '42501';
    end if;
  elsif coalesce((select auth.role()), '') in ('anon', 'authenticated') then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  return (select p.enforcement_status from public.anthropic_profiles p where p.tenant_id = p_tenant_id limit 1);
end $$;

revoke all on function public.workspace_model_standing(uuid) from public, anon;
grant execute on function public.workspace_model_standing(uuid) to authenticated, service_role;

comment on function public.workspace_model_standing(uuid) is
  'What Anthropic has said of the workspace''s profile (decision 0097, 00724): its enforcement status, the one word the shell''s line is said from; null where it has no profile. For a member who may read the workspace (may_read_workspace); the service role and a session of the database itself name their workspace themselves.';

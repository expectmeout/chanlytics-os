-- 00172 · A search keeps its thread.
--
-- docs/superpowers/specs/2026-09-25-a-search-keeps-its-thread-design.md. A
-- search planned in Ask keeps the Ask thread it was planned in, so the answer
-- to its question lands in that thread instead of opening a new one each time.
-- One nullable column on lead_searches, pointing at ask_threads and set null
-- when the thread goes (purge_ask drops threads after ninety days), with a
-- partial index so that set null finds its rows.
--
-- lead_search_create takes the thread as p_thread_id, default null, and keeps
-- it only when it is the caller's own thread in the same workspace: Ask threads
-- are per person (00040), and a definer door that stored any id it was handed
-- would let a search point at a teammate's thread. Anything else is null, not
-- a refusal: the search still starts. Every search made any other way, and
-- every search already on record, keeps null. The four-argument door is
-- dropped and made again with the fifth argument defaulted, so a call that
-- names four still lands; the body is 00140's but for the thread.
--
-- lead_searches_view appends thread_id last, so the view is replaced in place;
-- the rest is 00146's text. The id is only an id: the thread itself stays
-- behind its owner's RLS.
--
-- Apply BEFORE the dashboard deploys: the new route names p_thread_id when an
-- Ask card starts a search, and the four-argument door does not take it.
-- Re-runnable. The ALTER TABLE takes ACCESS EXCLUSIVE on lead_searches, which
-- the Leads page reads, so the same lock guard as 00166.
set local lock_timeout = '3s';
do $$
begin
  raise notice 'lock_timeout for this migration: %', current_setting('lock_timeout');
  if current_setting('lock_timeout') <> '3s' then
    raise warning 'this file was applied outside a transaction, so SET LOCAL did nothing: run it inside begin/commit, or set lock_timeout yourself before it';
  end if;
end $$;

/* ------------------------------------------------------------ 1. the column -- */

alter table public.lead_searches
  add column if not exists thread_id uuid references public.ask_threads (id) on delete set null;
create index if not exists lead_searches_thread on public.lead_searches (thread_id) where thread_id is not null;
comment on column public.lead_searches.thread_id is
  'The Ask thread the search was planned in (00172), so an answer to its question lands there. Only ever the planner''s own thread; null for a search made on the page, for every search before 00172, and once the thread is gone.';

/* ---------------------------------------------- 2. lead_search_create, from 00140 -- */

drop function if exists public.lead_search_create(uuid, jsonb, text, numeric);
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
  if p_estimate_usd is null or p_estimate_usd < 0 or p_estimate_usd > 25 then
    raise exception 'estimate: 0 to 25 usd' using errcode = '22023';
  end if;
  perform public.lead_plan_check(p_plan);
  if coalesce((p_plan->>'version')::integer, 0) <> 1 then
    raise exception 'a new search starts at plan version 1' using errcode = '22023';
  end if;
  v_count := (p_plan->>'count')::integer;

  if not public.lead_searches_on(p_tenant_id) then
    return jsonb_build_object('error', 'paused', 'sentence', 'Lead searches are paused for now. Your leads are all here, and nothing is being counted.');
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
comment on function public.lead_search_create(uuid, jsonb, text, numeric, uuid) is
  'Owner. Checks the plan (version 1, the shape), the switch ({error: paused}), the card ({error: no_card}, logged as demand), then in one transaction reserves the count from the month''s allowance and the estimate from the budget and both day caps ({error: month_leads_used | budget_used | day_cap}, each with a sentence), inserts the search, its probe round (seq 1, target least(25, count)), the start job and the event. p_thread_id (00172) is the Ask thread the search was planned in, kept only when it is the caller''s own in this workspace, else null. Returns {search_id, round_id}.';
revoke execute on function public.lead_search_create(uuid, jsonb, text, numeric, uuid) from public, anon;
grant execute on function public.lead_search_create(uuid, jsonb, text, numeric, uuid) to authenticated;

/* ------------------------------------------- 3. lead_searches_view, from 00146 -- */

create or replace view public.lead_searches_view with (security_invoker = true) as
select s.id, s.tenant_id, s.created_by, s.via, s.card, s.name, s.asked, s.plan, s.removed_at, s.created_at,
       r.id as round_id, r.seq, r.purpose, r.state, r.ending, r.ending_pending, r.question, r.answered, r.target,
       r.plan_version, r.judge_tokens, r.cost_usd, r.waiting_since, r.ended_at,
       coalesce(c.qualified, 0) as qualified, coalesce(c.review, 0) as review, coalesce(c.excluded, 0) as excluded,
       coalesce(c.counted, 0) as counted, coalesce(c.emails_checked, 0) as emails_checked, coalesce(c.with_phone, 0) as with_phone,
       u.id as undo_op_id, u.version as undo_version,
       coalesce(r.nearby, '[]'::jsonb) as nearby,
       coalesce(c.strong, 0) as strong, coalesce(c.look, 0) as look, coalesce(c.long, 0) as long,
       s.thread_id
  from public.lead_searches s
  left join lateral (
    select r.id, r.seq, r.purpose, r.state, r.ending, r.ending_pending, r.question, r.answered, r.target,
           r.plan_version, r.judge_tokens, r.cost_usd, r.waiting_since, r.ended_at, r.nearby
      from public.lead_rounds r where r.search_id = s.id order by r.seq desc limit 1
  ) r on true
  left join lateral (
    select count(*) filter (where m.class = 'qualified' and m.blanked_at is null) as qualified,
           count(*) filter (where m.class = 'review' and m.blanked_at is null)    as review,
           count(*) filter (where m.class = 'excluded')                           as excluded,
           count(*) filter (where m.counted)                                      as counted,
           count(*) filter (where m.class = 'qualified' and m.blanked_at is null and l.email_state = 'ok')  as emails_checked,
           count(*) filter (where m.class = 'qualified' and m.blanked_at is null and l.phone_e164 is not null and not l.phone_wrong) as with_phone,
           count(*) filter (where m.class = 'qualified' and m.blanked_at is null and m.fit = 'strong') as strong,
           count(*) filter (where m.class = 'qualified' and m.blanked_at is null and m.fit = 'look')   as look,
           count(*) filter (where m.class = 'qualified' and m.blanked_at is null and m.fit = 'long')   as long
      from public.lead_search_members m join public.leads l on l.id = m.lead_id where m.search_id = s.id
  ) c on true
  left join lateral (
    select o.id, o.version from public.lead_operations o
     where o.search_id = s.id and o.kind = 'undo_search' and o.undone_at is null and o.at > now() - interval '24 hours'
     order by o.at desc limit 1
  ) u on true;
comment on view public.lead_searches_view is
  'Every column of lead_searches with its latest round (round_id, seq, purpose, state, ending, ending_pending, question, answered, target, plan_version, judge_tokens, cost_usd -- what that round has spent, so cost per Qualified lead is read from here -- waiting_since and ended_at) and its counts over the members: qualified, review, excluded, counted, emails_checked (a qualified lead whose address was checked and answered) and with_phone (a qualified lead with a number nobody has marked wrong). Excluded members stay counted after their details are blanked, so "40 left out" stays 40. undo_op_id and undo_version name the operation this search''s Undo takes while its twenty-four hours run, and are null once it is undone or the day is out. nearby (00145): where to look next when the round ran dry, the nearest ZIP centres past its area, nearest first; [] otherwise. strong, look and long (00146): the qualified members by fit band, for the band bar over the table. thread_id (00172): the Ask thread the search was planned in, or null.';
revoke all on public.lead_searches_view from public, anon;
grant select on public.lead_searches_view to authenticated, service_role;

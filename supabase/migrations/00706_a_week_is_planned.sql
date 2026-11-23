-- 00706 · A week is planned (the content loop PRD v3.5, pass 3, M5 and M6; sections 5.3, 6.1, 8.4, 10, 12.5 and 14.4).
--
-- Until now a post was made when someone asked for one. Now Chanlytics plans the week: on Sunday evening in the
-- business's own zone it reads why to post now (open time, a new review, fresh footage, an offer, a new service), what the
-- posts are for, how often the owner wants them, and the footage at hand, and drafts the week as one list, ready by Monday
-- 8:00. It makes fewer when the candidates are weak and says why, and asks for what to film when no clip can tell what
-- the week needs. The owner approves the week in one press; a slot a check held stays held with its one fix, and asks by
-- itself once mended.
--
--   owner_claims              What the owner claims: a price, an offer, a guarantee, or a fact they state ("Thursday still
--                             has openings"), where it was said, until when. The one claims rule reads the claims that
--                             stand today as what the owner said; a stated fact moves here from the approval's snapshot.
--   content_goals             What the posts are for (contracts CONTENT_GOALS), with its detail and weight. What the
--                             database holds, never rows a screen offers: said to AI, or the Settings line in words.
--   content_plans             One plan a workspace a week (week_of, its Monday): drafting, ready, approved, done; why it
--                             is smaller than the cadence asks; the week's one approval.
--   plan_slots                One creative at one place: when, what it shows, the reason it serves, its source footage,
--                             its intent, its score with every part's reason; blocked with why and the words, or asking
--                             for footage (`ask`: what to film, how long, the reason it serves).
--   file_moments              A clip's best moments, written when a plan wants them (from the look's moments and the
--                             hearing's words, no model asked); an owner's correction kept and preferred.
--   features.content_plan     The canary's switch (PRD 16.3), on the workspace's config: the weekly clock drafts a plan
--                             only where it is on. `content` on the config holds the cadence, quiet days and languages.
--   job_kinds                 content_plan, in the bulk lane, one a plan.
--   notifications             plan_ready and footage_ask (PRD 12.5): what leaves the app for this pass.
--
-- Doors: owner_claims_keep and owner_claim_withdraw, content_goals_keep (a member with the settings permission: the
-- business's own words, as Settings › Business is); content_plan_ask (a member's, or the clock's through the service);
-- content_plan_write (the job's); content_week_approve and plan_slot_set (a member with the settings permission, the
-- permission a post's approval asks); plan_slot_made (the same member's approval, as it makes what it approved: a
-- picture's post, a reel's video, or the one fix where it could not be made); file_moments_keep (the service's);
-- content_plans_hand_out (the clock's). A member's own start and end for a moment arrives with the part that uses it.
--
-- AI's words for a week, and its read of a Settings line (PRD 13's cost lines): ai_usage.purpose takes post_words and
-- content_line, each a line of the ledger of its own (its check re-made from the list it holds, as the notice kinds' is).
--
-- Erasure (decision 0036): every new column holds the business's own words or no person's (packages/db erasure
-- registry): claims, goals, plans and slots follow the workspace; a moment's words follow its file's heard words.
--
-- Locks: new tables, one row into job_kinds, and the notice kinds' check re-made from the list it holds (read in a `do`
-- block and appended to, so a kind another migration added ahead of this one stays). Three seconds each and no more.
-- Re-runnable. Deploy order: this file first, then the code (the job runner refuses a kind it does not hold).

set local lock_timeout = '3s';

/* --------------------------------------------------------------------------------------------- 1. owner_claims -- */

create table if not exists public.owner_claims (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants (id) on delete cascade,
  -- contracts CLAIM_KINDS.
  kind          text not null check (kind = any (array['price', 'offer', 'guarantee', 'fact'])),
  text          text not null check (char_length(btrim(text)) between 1 and 280),
  -- contracts CLAIM_SOURCES: to AI, in Settings, read from the business's own website.
  source        text not null check (source = any (array['said', 'settings', 'website'])),
  -- The last day it stands, in the business's own zone; null for one that stands until withdrawn.
  valid_until   date,
  withdrawn_at  timestamptz,
  created_by    uuid references auth.users (id) on delete set null,
  created_at    timestamptz not null default now(),
  constraint owner_claims_tenant_id_id_key unique (tenant_id, id),
  -- A stated fact stands until its day ends (PRD 6.1): it always has a last day.
  constraint owner_claims_fact_ends check (kind <> 'fact' or valid_until is not null)
);
create index if not exists owner_claims_standing on public.owner_claims (tenant_id, kind) where withdrawn_at is null;
create index if not exists owner_claims_created_by on public.owner_claims (created_by) where created_by is not null;

alter table public.owner_claims enable row level security;
drop policy if exists owner_claims_member_select on public.owner_claims;
create policy owner_claims_member_select on public.owner_claims
  for select to authenticated
  using (tenant_id in (select m.tenant_id from public.memberships m where m.user_id = (select auth.uid())));
revoke all on public.owner_claims from anon, authenticated;
grant select on public.owner_claims to authenticated;
grant all on public.owner_claims to service_role;

comment on table public.owner_claims is
  'What an owner claims (00706; the content loop PRD''s 5.3 and 6.1): a price, an offer, a guarantee, or a fact they state, where it was said, until when it stands, and when it was withdrawn. Read by the one claims rule (core evaluateClaimPolicy) as what the owner said, and by the plan as the offers that run. Members read; owner_claims_keep and owner_claim_withdraw write.';

/* --------------------------------------------------------------------------------------------- 2. content_goals -- */

create table if not exists public.content_goals (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants (id) on delete cascade,
  -- contracts CONTENT_GOALS.
  goal        text not null check (goal = any (array['fill_slow_days', 'introduce_service', 'repeat_visits', 'awareness', 'reviews'])),
  -- What it is about: {service}, {days: ["tue", "wed"]}, {words}: the owner's own words as they said them.
  detail      jsonb not null default '{}'::jsonb check (jsonb_typeof(detail) = 'object'),
  weight      real not null default 1 check (weight > 0 and weight <= 1),
  active      boolean not null default true,
  created_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  constraint content_goals_tenant_id_id_key unique (tenant_id, id)
);
create index if not exists content_goals_active on public.content_goals (tenant_id) where active;
create index if not exists content_goals_created_by on public.content_goals (created_by) where created_by is not null;

alter table public.content_goals enable row level security;
drop policy if exists content_goals_member_select on public.content_goals;
create policy content_goals_member_select on public.content_goals
  for select to authenticated
  using (tenant_id in (select m.tenant_id from public.memberships m where m.user_id = (select auth.uid())));
revoke all on public.content_goals from anon, authenticated;
grant select on public.content_goals to authenticated;
grant all on public.content_goals to service_role;

comment on table public.content_goals is
  'What a business''s posts are for (00706; the content loop PRD''s 5.3): a goal from a closed set, what it is about, how much it weighs, whether it stands. What the database holds, never rows a screen offers. Members read; content_goals_keep writes the whole set at once.';

/* ------------------------------------------------------------------------------------- 3. content_plans, slots -- */

create table if not exists public.content_plans (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenants (id) on delete cascade,
  -- The Monday the week starts on, in the business's own zone.
  week_of      date not null check (extract(isodow from week_of) = 1),
  -- contracts PLAN_STATUSES.
  status       text not null default 'drafting' check (status = any (array['drafting', 'ready', 'approved', 'done'])),
  -- contracts PLAN_ASKED_BY: the weekly clock, or the owner.
  asked_by     text not null check (asked_by = any (array['clock', 'owner'])),
  -- Why it is smaller than the cadence asks, in a sentence; null where it is not.
  fewer        text check (fewer is null or char_length(fewer) between 1 and 280),
  approval_id  uuid,
  asked_at     timestamptz not null default now(),
  ready_at     timestamptz,
  approved_at  timestamptz,
  approved_by  uuid references auth.users (id) on delete set null,
  done_at      timestamptz,
  constraint content_plans_one_a_week unique (tenant_id, week_of),
  constraint content_plans_tenant_id_id_key unique (tenant_id, id),
  constraint content_plans_approval_id_same_workspace foreign key (tenant_id, approval_id)
    references public.approvals (tenant_id, id) on delete set null (approval_id),
  constraint content_plans_approved_shape check ((status = 'approved') <= (approved_at is not null))
);
create index if not exists content_plans_approval on public.content_plans (tenant_id, approval_id) where approval_id is not null;
create index if not exists content_plans_approved_by on public.content_plans (approved_by) where approved_by is not null;

alter table public.content_plans enable row level security;
drop policy if exists content_plans_member_select on public.content_plans;
create policy content_plans_member_select on public.content_plans
  for select to authenticated
  using (tenant_id in (select m.tenant_id from public.memberships m where m.user_id = (select auth.uid())));
revoke all on public.content_plans from anon, authenticated;
grant select on public.content_plans to authenticated;
grant all on public.content_plans to service_role;

comment on table public.content_plans is
  'A week of posts (00706; the content loop PRD''s 5.3 and 8.4): one a workspace a week, drafted Sunday evening in its zone or when the owner asks, ready by Monday 8:00, approved in one press, done once the week has passed. Why it is smaller than the cadence asks, where it is. Members read; content_plan_ask, content_plan_write and content_week_approve write.';

create table if not exists public.plan_slots (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenants (id) on delete cascade,
  plan_id         uuid not null,
  -- The creative this slot is one place of: slots of one creative share it, and the Week draws them as one row.
  creative        uuid not null,
  place           text not null check (place = any (array['instagram', 'google'])),
  kind            text not null check (kind = any (array['picture', 'story', 'reel'])),
  at              timestamptz not null,
  -- What it shows, as a row says it ("The finish", "Thursday has openings").
  title           text not null check (char_length(btrim(title)) between 1 and 120),
  -- The reason it serves, in a sentence; null for one that serves only a goal.
  reason          text check (reason is null or char_length(reason) between 1 and 280),
  -- The clip or photo it is made from; null for a quote card, which is drawn from words, or a slot that needs footage.
  file_id         uuid,
  piece_id        uuid,
  post_id         uuid,
  -- Why it exists (contracts PieceIntent): the piece made from it carries it, and the send reads it again.
  intent          jsonb check (intent is null or jsonb_typeof(intent) = 'object'),
  -- The words AI wrote for it while drafting, as the Week shows them and the approval makes them: {line, over, under,
  -- caption, language}. Slots of one creative hold the same. Null for a slot asking for footage.
  words           jsonb check (words is null or jsonb_typeof(words) = 'object'),
  -- contracts SLOT_STATES.
  state           text not null default 'proposed'
                    check (state = any (array['proposed', 'blocked', 'needs_footage', 'approved', 'removed', 'posted'])),
  -- A blocked slot's check, as a held post keeps it (contracts POST_HELD_WHYS), or `unmade`: approved, and what it was
  -- to be made into could not be (contracts SLOT_HELD_WHYS); its words with the one fix.
  blocked_why     text check (blocked_why is null or blocked_why = any (array['approver', 'disconnected', 'line_off',
                    'removed', 'stopped', 'changed', 'rights', 'claim', 'place', 'money', 'reason_passed', 'late',
                    'unmade'])),
  blocked_reason  text check (blocked_reason is null or char_length(blocked_reason) between 1 and 400),
  -- What a slot that needs footage asks for: {what, seconds, opportunity_id}.
  ask             jsonb check (ask is null or jsonb_typeof(ask) = 'object'),
  -- Its score (contracts SlotScore): the total and each part, 0 to 1, with why.
  score           jsonb check (score is null or jsonb_typeof(score) = 'object'),
  -- The approval it went with: the week's, or its own once mended after the week was approved.
  approval_id     uuid,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint plan_slots_tenant_id_id_key unique (tenant_id, id),
  constraint plan_slots_plan_id_same_workspace foreign key (tenant_id, plan_id)
    references public.content_plans (tenant_id, id) on delete cascade,
  constraint plan_slots_file_id_same_workspace foreign key (tenant_id, file_id)
    references public.files (tenant_id, id) on delete set null (file_id),
  constraint plan_slots_piece_id_same_workspace foreign key (tenant_id, piece_id)
    references public.pieces (tenant_id, id) on delete set null (piece_id),
  constraint plan_slots_post_id_same_workspace foreign key (tenant_id, post_id)
    references public.posts (tenant_id, id) on delete set null (post_id),
  constraint plan_slots_approval_id_same_workspace foreign key (tenant_id, approval_id)
    references public.approvals (tenant_id, id) on delete set null (approval_id),
  constraint plan_slots_blocked_shape check ((state = 'blocked') = (blocked_why is not null and blocked_reason is not null)),
  constraint plan_slots_ask_shape check (state <> 'needs_footage' or ask is not null)
);
create index if not exists plan_slots_plan on public.plan_slots (tenant_id, plan_id, at);
create index if not exists plan_slots_file on public.plan_slots (tenant_id, file_id) where file_id is not null;
create index if not exists plan_slots_piece on public.plan_slots (tenant_id, piece_id) where piece_id is not null;
create index if not exists plan_slots_post on public.plan_slots (tenant_id, post_id) where post_id is not null;
create index if not exists plan_slots_approval on public.plan_slots (tenant_id, approval_id) where approval_id is not null;

alter table public.plan_slots enable row level security;
drop policy if exists plan_slots_member_select on public.plan_slots;
create policy plan_slots_member_select on public.plan_slots
  for select to authenticated
  using (tenant_id in (select m.tenant_id from public.memberships m where m.user_id = (select auth.uid())));
revoke all on public.plan_slots from anon, authenticated;
grant select on public.plan_slots to authenticated;
grant all on public.plan_slots to service_role;

comment on table public.plan_slots is
  'One creative at one place in a week''s plan (00706; the content loop PRD''s 5.3 and 10.2): when, what it shows, the reason it serves, the footage it is made from, why it exists, how it was scored and why; blocked with its check and its one fix, or asking for footage. Members read; content_plan_write, content_week_approve and plan_slot_set write.';

/* ---------------------------------------------------------------------------------------------- 4. file_moments -- */

create table if not exists public.file_moments (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references public.tenants (id) on delete cascade,
  file_id        uuid not null,
  start_s        real not null check (start_s >= 0),
  end_s          real not null,
  shows          text[] not null default '{}'::text[] check (cardinality(shows) <= 8),
  faces          integer check (faces is null or faces >= 0),
  sharp          real check (sharp is null or sharp between 0 and 1),
  -- What is said in it, from the hearing the file already has: the file's own heard words.
  words          text check (words is null or char_length(words) <= 2000),
  score          real not null check (score between 0 and 1),
  confidence     real not null check (confidence between 0 and 1),
  -- The look's edition it was read from (contracts VIDEO_LOOK_EDITION).
  model_edition  integer not null check (model_edition >= 1),
  -- A member's own start and end, kept and preferred over what was read.
  corrected_by   uuid references auth.users (id) on delete set null,
  corrected_at   timestamptz,
  created_at     timestamptz not null default now(),
  constraint file_moments_tenant_id_id_key unique (tenant_id, id),
  constraint file_moments_file_id_same_workspace foreign key (tenant_id, file_id)
    references public.files (tenant_id, id) on delete cascade,
  constraint file_moments_span check (end_s > start_s),
  constraint file_moments_corrected_shape check ((corrected_by is null) or (corrected_at is not null))
);
create index if not exists file_moments_file on public.file_moments (tenant_id, file_id, score desc);
create index if not exists file_moments_corrected_by on public.file_moments (corrected_by) where corrected_by is not null;

alter table public.file_moments enable row level security;
drop policy if exists file_moments_member_select on public.file_moments;
create policy file_moments_member_select on public.file_moments
  for select to authenticated
  using (tenant_id in (select m.tenant_id from public.memberships m where m.user_id = (select auth.uid())));
revoke all on public.file_moments from anon, authenticated;
grant select on public.file_moments to authenticated;
grant all on public.file_moments to service_role;

comment on table public.file_moments is
  'A clip''s best moments (00706; the content loop PRD''s 5.3 and 10.3), written when a plan wants them: from the look''s own moments and the hearing''s words, with their score, confidence and the look''s edition; a member''s correction (a new start and end) kept and preferred. Members read; file_moments_keep writes.';

/* ---------------------------------------------------------------------------------- 5. the job kind, the notices -- */

insert into public.job_kinds (kind, lane, once_parts, once_kept) values
  ('content_plan', 2, array['plan_id'], false)
on conflict (kind) do update
  set lane = excluded.lane, once_parts = excluded.once_parts, once_kept = excluded.once_kept;

do $$
declare
  v_kinds text[];
  v_kind  text;
begin
  select array_agg(found.m[1] order by found.at) into v_kinds
    from pg_constraint c
    cross join lateral regexp_matches(pg_get_constraintdef(c.oid), '''([a-z0-9_]+)''', 'g') with ordinality as found(m, at)
   where c.conrelid = 'public.notifications'::regclass and c.conname = 'notifications_kind_check';
  if coalesce(cardinality(v_kinds), 0) = 0 then
    raise exception 'notifications_kind_check: the kinds it holds could not be read';
  end if;
  foreach v_kind in array array['plan_ready', 'footage_ask'] loop
    if not v_kind = any (v_kinds) then
      v_kinds := v_kinds || v_kind;
    end if;
  end loop;
  alter table public.notifications drop constraint notifications_kind_check;
  execute 'alter table public.notifications add constraint notifications_kind_check check (kind = any (array['
    || (select string_agg(quote_literal(k.kind), ', ' order by k.at) from unnest(v_kinds) with ordinality as k(kind, at))
    || ']))';
end $$;

/* ---------------------------------------------------------------------------------------------- 6. claims' doors -- */

create or replace function public.owner_claims_keep(p_tenant_id uuid, p_claim jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor  uuid := auth.uid();
  v_row    public.owner_claims;
  v_until  date;
begin
  if v_actor is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  if p_tenant_id is null or not coalesce(public.caller_has_permission(p_tenant_id, 'settings'), false) then
    raise exception 'Not yours to change.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_claim) <> 'object' then
    raise exception 'A claim is an object.' using errcode = '22023';
  end if;
  v_until := nullif(p_claim ->> 'valid_until', '')::date;
  insert into public.owner_claims (tenant_id, kind, text, source, valid_until, created_by)
  values (p_tenant_id, p_claim ->> 'kind', btrim(p_claim ->> 'text'), p_claim ->> 'source', v_until, v_actor)
  returning * into v_row;
  return to_jsonb(v_row);
end $$;
revoke all on function public.owner_claims_keep(uuid, jsonb) from public, anon;
grant execute on function public.owner_claims_keep(uuid, jsonb) to authenticated;
comment on function public.owner_claims_keep(uuid, jsonb) is
  'A claim kept (00706): {kind, text, source, valid_until}, by a member with the settings permission (the business''s own words, as Settings › Business is). Answers the row. The table''s checks refuse a kind, a source or words out of shape, and a fact with no last day.';

create or replace function public.owner_claim_withdraw(p_tenant_id uuid, p_claim_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_done integer;
begin
  if auth.uid() is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  if p_tenant_id is null or not coalesce(public.caller_has_permission(p_tenant_id, 'settings'), false) then
    raise exception 'Not yours to change.' using errcode = '42501';
  end if;
  update public.owner_claims set withdrawn_at = now()
   where tenant_id = p_tenant_id and id = p_claim_id and withdrawn_at is null;
  get diagnostics v_done = row_count;
  return v_done > 0;
end $$;
revoke all on function public.owner_claim_withdraw(uuid, uuid) from public, anon;
grant execute on function public.owner_claim_withdraw(uuid, uuid) to authenticated;
comment on function public.owner_claim_withdraw(uuid, uuid) is
  'A claim withdrawn (00706), by a member with the settings permission. True where one standing was withdrawn. What carries it is held at its send by the claims rule, never taken down by itself (PRD 5.3, claim_withdrawn).';

create or replace function public.content_goals_keep(p_tenant_id uuid, p_goals jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_goal  jsonb;
begin
  if v_actor is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  if p_tenant_id is null or not coalesce(public.caller_has_permission(p_tenant_id, 'settings'), false) then
    raise exception 'Not yours to change.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_goals) <> 'array' or jsonb_array_length(p_goals) > 8 then
    raise exception 'Goals are a list of at most eight.' using errcode = '22023';
  end if;
  -- The whole set at once: what the owner said now stands, what they said before stops standing.
  update public.content_goals set active = false where tenant_id = p_tenant_id and active;
  for v_goal in select e from jsonb_array_elements(p_goals) e loop
    insert into public.content_goals (tenant_id, goal, detail, weight, created_by)
    values (p_tenant_id, v_goal ->> 'goal', coalesce(v_goal -> 'detail', '{}'::jsonb),
            coalesce((v_goal ->> 'weight')::real, 1), v_actor);
  end loop;
  return coalesce((select jsonb_agg(to_jsonb(g) order by g.created_at) from public.content_goals g
                    where g.tenant_id = p_tenant_id and g.active), '[]'::jsonb);
end $$;
revoke all on function public.content_goals_keep(uuid, jsonb) from public, anon;
grant execute on function public.content_goals_keep(uuid, jsonb) to authenticated;
comment on function public.content_goals_keep(uuid, jsonb) is
  'What the posts are for, the whole set at once (00706): [{goal, detail, weight}], by a member with the settings permission; the set before stops standing. Answers the goals that stand.';

/* ------------------------------------------------------------------------------------------------ 7. the plan -- */

-- The plan of a week asked for: a new one drafting with its job, or the one there is drafted again where it is not yet
-- approved (the owner's "make it again"). One approved stays: its slots are the owner's now.
create or replace function public.content_plan_begin(p_tenant_id uuid, p_week_of date, p_asked_by text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan public.content_plans;
begin
  select * into v_plan from public.content_plans p
   where p.tenant_id = p_tenant_id and p.week_of = p_week_of for update;
  if found and v_plan.status in ('approved', 'done') then
    return jsonb_build_object('fate', 'approved', 'plan_id', v_plan.id);
  end if;
  if found then
    delete from public.plan_slots s where s.tenant_id = p_tenant_id and s.plan_id = v_plan.id;
    update public.content_plans set status = 'drafting', fewer = null, ready_at = null, asked_by = p_asked_by,
                                    asked_at = now()
     where id = v_plan.id returning * into v_plan;
  else
    insert into public.content_plans (tenant_id, week_of, asked_by) values (p_tenant_id, p_week_of, p_asked_by)
    returning * into v_plan;
  end if;
  insert into public.jobs (tenant_id, kind, due_at, payload)
  values (p_tenant_id, 'content_plan', now(), jsonb_build_object('plan_id', v_plan.id))
  on conflict do nothing;
  return jsonb_build_object('fate', 'drafting', 'plan_id', v_plan.id);
end $$;
revoke all on function public.content_plan_begin(uuid, date, text) from public, anon, authenticated;
comment on function public.content_plan_begin(uuid, date, text) is
  'A week''s plan begun (00706), and its content_plan job: a new plan drafting, or one not yet approved drafted again with its slots let go. Answers {fate: drafting | approved, plan_id}. Called by content_plan_ask and content_plans_hand_out, never directly.';

create or replace function public.content_plan_ask(p_tenant_id uuid, p_week_of date)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  if p_tenant_id is null or not coalesce(public.caller_has_permission(p_tenant_id, 'settings'), false) then
    raise exception 'Not yours to change.' using errcode = '42501';
  end if;
  if p_week_of is null or extract(isodow from p_week_of) <> 1 then
    raise exception 'A week starts on a Monday.' using errcode = '22023';
  end if;
  return public.content_plan_begin(p_tenant_id, p_week_of, 'owner');
end $$;
revoke all on function public.content_plan_ask(uuid, date) from public, anon;
grant execute on function public.content_plan_ask(uuid, date) to authenticated;
comment on function public.content_plan_ask(uuid, date) is
  'The owner''s "plan the week" (00706; the content loop PRD''s 10.2: on the owner''s ask), by a member with the settings permission. Answers {fate: drafting | approved, plan_id}.';

-- The weekly clock (call 18): every workspace whose canary switch is on, at or after Sunday 18:00 in its own zone, gets
-- next week's plan drafting, once. Spread over the given seconds by a hash of the workspace.
create or replace function public.content_plans_hand_out(p_spread_seconds integer)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant  record;
  v_handed  integer := 0;
  v_answer  jsonb;
begin
  for v_tenant in
    select t.id, (((now() at time zone t.timezone)::date) + 1) as week_of
      from public.tenants t
      join public.tenant_config c on c.tenant_id = t.id
     where coalesce((c.config -> 'features' ->> 'content_plan')::boolean, false)
       and extract(isodow from (now() at time zone t.timezone)) = 7
       and extract(hour from (now() at time zone t.timezone)) >= 18
       and not exists (select 1 from public.content_plans p
                        where p.tenant_id = t.id and p.week_of = ((now() at time zone t.timezone)::date) + 1)
  loop
    v_answer := public.content_plan_begin(v_tenant.id, v_tenant.week_of, 'clock');
    if v_answer ->> 'fate' = 'drafting' then
      update public.jobs set due_at = now() + make_interval(secs => abs(hashtext(v_tenant.id::text)::bigint)
                                                             % greatest(p_spread_seconds, 1))
       where tenant_id = v_tenant.id and kind = 'content_plan' and payload ->> 'plan_id' = v_answer ->> 'plan_id'
         and state = 'scheduled';
      v_handed := v_handed + 1;
    end if;
  end loop;
  -- A week that has passed is done.
  update public.content_plans p set status = 'done', done_at = now()
    from public.tenants t
   where t.id = p.tenant_id and p.status in ('ready', 'approved')
     and p.week_of + 7 <= (now() at time zone t.timezone)::date;
  return v_handed;
end $$;
revoke all on function public.content_plans_hand_out(integer) from public, anon, authenticated;
grant execute on function public.content_plans_hand_out(integer) to service_role;
comment on function public.content_plans_hand_out(integer) is
  'The weekly clock (00706; the content loop PRD''s 10.2, call 18): next week''s plan begun for each workspace whose features.content_plan is on, from Sunday 18:00 in its own zone, once; and each week that has passed marked done. Answers how many it began. The service role''s.';

-- The job's write: the slots it drafted, why it is smaller than the cadence asks, and the plan ready.
create or replace function public.content_plan_write(p_tenant_id uuid, p_plan_id uuid, p_slots jsonb, p_fewer text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan  public.content_plans;
  v_slot  jsonb;
begin
  select * into v_plan from public.content_plans p where p.tenant_id = p_tenant_id and p.id = p_plan_id for update;
  if not found then
    return jsonb_build_object('fate', 'gone');
  end if;
  if v_plan.status <> 'drafting' then
    return jsonb_build_object('fate', v_plan.status);
  end if;
  if jsonb_typeof(p_slots) <> 'array' or jsonb_array_length(p_slots) > 40 then
    raise exception 'A plan''s slots are a list of at most forty.' using errcode = '22023';
  end if;
  delete from public.plan_slots s where s.tenant_id = p_tenant_id and s.plan_id = p_plan_id;
  for v_slot in select e from jsonb_array_elements(p_slots) e loop
    insert into public.plan_slots (tenant_id, plan_id, creative, place, kind, at, title, reason, file_id, intent, words,
                                   state, blocked_why, blocked_reason, ask, score)
    values (p_tenant_id, p_plan_id, (v_slot ->> 'creative')::uuid, v_slot ->> 'place', v_slot ->> 'kind',
            (v_slot ->> 'at')::timestamptz, v_slot ->> 'title', nullif(v_slot ->> 'reason', ''),
            nullif(v_slot ->> 'file_id', '')::uuid, nullif(v_slot -> 'intent', 'null'::jsonb),
            nullif(v_slot -> 'words', 'null'::jsonb), coalesce(v_slot ->> 'state', 'proposed'), nullif(v_slot ->> 'blocked_why', ''),
            nullif(v_slot ->> 'blocked_reason', ''), nullif(v_slot -> 'ask', 'null'::jsonb),
            nullif(v_slot -> 'score', 'null'::jsonb));
  end loop;
  update public.content_plans set status = 'ready', fewer = nullif(btrim(coalesce(p_fewer, '')), ''), ready_at = now()
   where id = p_plan_id;
  return jsonb_build_object('fate', 'ready', 'slots', jsonb_array_length(p_slots));
end $$;
revoke all on function public.content_plan_write(uuid, uuid, jsonb, text) from public, anon, authenticated;
grant execute on function public.content_plan_write(uuid, uuid, jsonb, text) to service_role;
comment on function public.content_plan_write(uuid, uuid, jsonb, text) is
  'The content_plan job''s write (00706): the slots it drafted ([{creative, place, kind, at, title, reason, file_id, intent, words, state, blocked_why, blocked_reason, ask, score}]), why the week is smaller than the cadence asks, and the plan ready. Only a plan still drafting takes it. Answers {fate: ready | gone | <status>, slots}. The service role''s.';

/* ------------------------------------------------------------------------------------------ 8. the approval -- */

-- The week approved in one press (PRD 8.4): the slots named, each still proposed and as the snapshot says it (place,
-- kind, time, footage), go under one approval of subject `plan`; a slot blocked or asking for footage stays as it is.
create or replace function public.content_week_approve(p_tenant_id uuid, p_plan_id uuid, p_snapshot jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor     uuid := auth.uid();
  v_plan      public.content_plans;
  v_wanted    jsonb := coalesce(p_snapshot -> 'slots', '[]'::jsonb);
  v_matching  integer;
  v_approval  uuid;
begin
  if v_actor is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  if p_tenant_id is null or not coalesce(public.caller_has_permission(p_tenant_id, 'settings'), false) then
    raise exception 'Not yours to change.' using errcode = '42501';
  end if;
  select * into v_plan from public.content_plans p where p.tenant_id = p_tenant_id and p.id = p_plan_id for update;
  if not found then
    return jsonb_build_object('fate', 'gone');
  end if;
  if v_plan.status <> 'ready' then
    return jsonb_build_object('fate', v_plan.status);
  end if;
  if jsonb_typeof(v_wanted) <> 'array' or jsonb_array_length(v_wanted) = 0 then
    return jsonb_build_object('fate', 'nothing');
  end if;
  -- Every slot the snapshot names is this plan's, still proposed, and as the snapshot says it.
  select count(*) into v_matching
    from jsonb_array_elements(v_wanted) w
    join public.plan_slots s on s.tenant_id = p_tenant_id and s.plan_id = p_plan_id and s.id = (w ->> 'id')::uuid
   where s.state = 'proposed' and s.place = w ->> 'place' and s.kind = w ->> 'kind'
     and s.at = (w ->> 'at')::timestamptz and s.file_id is not distinct from nullif(w ->> 'file_id', '')::uuid;
  if v_matching <> jsonb_array_length(v_wanted) then
    return jsonb_build_object('fate', 'changed');
  end if;
  insert into public.approvals (tenant_id, subject_type, subject_id, snapshot, snapshot_hash, approved_by)
  values (p_tenant_id, 'plan', p_plan_id, p_snapshot, public.approval_hash(p_snapshot), v_actor)
  returning id into v_approval;
  update public.plan_slots s set state = 'approved', approval_id = v_approval, updated_at = now()
    from jsonb_array_elements(v_wanted) w
   where s.tenant_id = p_tenant_id and s.plan_id = p_plan_id and s.id = (w ->> 'id')::uuid;
  update public.content_plans set status = 'approved', approval_id = v_approval, approved_at = now(),
                                  approved_by = v_actor
   where id = p_plan_id;
  return jsonb_build_object('fate', 'approved', 'approval_id', v_approval, 'slots', v_matching);
end $$;
revoke all on function public.content_week_approve(uuid, uuid, jsonb) from public, anon;
grant execute on function public.content_week_approve(uuid, uuid, jsonb) to authenticated;
comment on function public.content_week_approve(uuid, uuid, jsonb) is
  'Approve the week (00706; the content loop PRD''s 8.4, canvas call 10), by a member with the settings permission: the snapshot''s slots ({slots: [{id, place, kind, at, file_id, title, intent}]}), each this plan''s, still proposed and as named, go under one approval of subject plan with its hash; a blocked slot or one asking for footage stays. Answers {fate: approved, approval_id, slots} or {fate: gone | changed | nothing | <status>}.';

-- One slot, by a member: left out, put back, moved to another time, or approved by itself once mended after the week
-- was (PRD 8.4: a slot unblocked later asks its own approval).
create or replace function public.plan_slot_set(p_tenant_id uuid, p_slot_id uuid, p_change jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor     uuid := auth.uid();
  v_slot      public.plan_slots;
  v_to        text := p_change ->> 'to';
  v_approval  uuid;
  v_snapshot  jsonb;
begin
  if v_actor is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  if p_tenant_id is null or not coalesce(public.caller_has_permission(p_tenant_id, 'settings'), false) then
    raise exception 'Not yours to change.' using errcode = '42501';
  end if;
  select * into v_slot from public.plan_slots s where s.tenant_id = p_tenant_id and s.id = p_slot_id for update;
  if not found then
    return jsonb_build_object('fate', 'gone');
  end if;
  if v_slot.state = 'posted' or v_slot.post_id is not null then
    return jsonb_build_object('fate', 'posted');
  end if;
  if v_to = 'removed' then
    update public.plan_slots set state = 'removed', blocked_why = null, blocked_reason = null, updated_at = now()
     where id = v_slot.id;
  elsif v_to = 'proposed' then
    if v_slot.state not in ('removed', 'blocked', 'needs_footage') then
      return jsonb_build_object('fate', v_slot.state);
    end if;
    update public.plan_slots set state = 'proposed', blocked_why = null, blocked_reason = null,
                                 file_id = coalesce(nullif(p_change ->> 'file_id', '')::uuid, file_id),
                                 updated_at = now()
     where id = v_slot.id;
  elsif v_to = 'at' then
    if (p_change ->> 'at')::timestamptz <= now() then
      return jsonb_build_object('fate', 'past');
    end if;
    update public.plan_slots set at = (p_change ->> 'at')::timestamptz, updated_at = now() where id = v_slot.id;
  elsif v_to = 'approved' then
    -- A proposed slot, or an approved one that could not be made, or whose video was not (Try again): its own approval,
    -- and it is made anew.
    if not (v_slot.state = 'proposed' or (v_slot.state = 'blocked' and v_slot.blocked_why = 'unmade')
            or (v_slot.state = 'approved' and exists (select 1 from public.pieces p
                                                     where p.tenant_id = p_tenant_id and p.id = v_slot.piece_id
                                                       and p.status = 'failed'))) then
      return jsonb_build_object('fate', v_slot.state);
    end if;
    v_snapshot := jsonb_build_object('slots', jsonb_build_array(jsonb_build_object(
      'id', v_slot.id, 'place', v_slot.place, 'kind', v_slot.kind, 'at', v_slot.at, 'file_id', v_slot.file_id,
      'title', v_slot.title, 'intent', v_slot.intent)));
    insert into public.approvals (tenant_id, subject_type, subject_id, snapshot, snapshot_hash, approved_by)
    values (p_tenant_id, 'plan', v_slot.plan_id, v_snapshot, public.approval_hash(v_snapshot), v_actor)
    returning id into v_approval;
    update public.plan_slots set state = 'approved', approval_id = v_approval, blocked_why = null, blocked_reason = null,
                                 piece_id = null, updated_at = now()
     where id = v_slot.id;
  else
    raise exception 'A slot is left out, put back, moved or approved.' using errcode = '22023';
  end if;
  return jsonb_build_object('fate', 'done', 'slot_id', v_slot.id, 'approval_id', v_approval);
end $$;
revoke all on function public.plan_slot_set(uuid, uuid, jsonb) from public, anon;
grant execute on function public.plan_slot_set(uuid, uuid, jsonb) to authenticated;
comment on function public.plan_slot_set(uuid, uuid, jsonb) is
  'One slot of a week, by a member with the settings permission (00706): {to: removed} leaves it out, {to: proposed, file_id?} puts it back or returns a slot that asked for footage with the clip added, {to: at, at} moves it to a later time, {to: approved} approves one mended after the week was, or one that could not be made (its own approval of subject plan; it is made anew). A slot made into a post is the post''s. Answers {fate: done, slot_id, approval_id} or {fate: gone | posted | past | <state>}.';

/* --------------------------------------------------------------------------------------------- 9. moments -- */

create or replace function public.file_moments_keep(p_tenant_id uuid, p_file_id uuid, p_moments jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kept integer;
begin
  if jsonb_typeof(p_moments) <> 'array' or jsonb_array_length(p_moments) > 12 then
    raise exception 'A clip''s moments are a list of at most twelve.' using errcode = '22023';
  end if;
  -- What was read before goes; a member's correction stays and is preferred.
  delete from public.file_moments m where m.tenant_id = p_tenant_id and m.file_id = p_file_id and m.corrected_by is null;
  insert into public.file_moments (tenant_id, file_id, start_s, end_s, shows, faces, sharp, words, score, confidence,
                                   model_edition)
  select p_tenant_id, p_file_id, (e ->> 'start_s')::real, (e ->> 'end_s')::real,
         coalesce(array(select jsonb_array_elements_text(e -> 'shows')), '{}'::text[]),
         nullif(e ->> 'faces', '')::integer, nullif(e ->> 'sharp', '')::real, nullif(e ->> 'words', ''),
         (e ->> 'score')::real, (e ->> 'confidence')::real, (e ->> 'model_edition')::integer
    from jsonb_array_elements(p_moments) e;
  get diagnostics v_kept = row_count;
  return v_kept;
end $$;
revoke all on function public.file_moments_keep(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.file_moments_keep(uuid, uuid, jsonb) to service_role;
comment on function public.file_moments_keep(uuid, uuid, jsonb) is
  'A clip''s moments as read (00706; the content loop PRD''s 10.3): [{start_s, end_s, shows, faces, sharp, words, score, confidence, model_edition}] in place of those read before; a member''s correction stays. Answers how many it kept. The service role''s.';

/* --------------------------------------------------------------------------------------------- 10. the making -- */

-- What an approved slot was made into, as the approval makes it (PRD 8.4; Ruben, 23 Nov 2026: a week's posts are made
-- after its approval): a picture's post at its place ({post_id}), a reel's video begun ({piece_id}), or why it could not
-- be made, with its one fix ({held: why, reason}). By a member with the settings permission, as the approval that made
-- it; only a slot approved and not yet made takes it.
create or replace function public.plan_slot_made(p_tenant_id uuid, p_slot_id uuid, p_made jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor  uuid := auth.uid();
  v_slot   public.plan_slots;
  v_post   uuid := nullif(p_made ->> 'post_id', '')::uuid;
  v_piece  uuid := nullif(p_made ->> 'piece_id', '')::uuid;
  v_held   jsonb := p_made -> 'held';
begin
  if v_actor is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  if p_tenant_id is null or not coalesce(public.caller_has_permission(p_tenant_id, 'settings'), false) then
    raise exception 'Not yours to change.' using errcode = '42501';
  end if;
  select * into v_slot from public.plan_slots s where s.tenant_id = p_tenant_id and s.id = p_slot_id for update;
  if not found then
    return jsonb_build_object('fate', 'gone');
  end if;
  if v_slot.state <> 'approved' or v_slot.post_id is not null then
    return jsonb_build_object('fate', v_slot.state);
  end if;
  if v_post is not null then
    if not exists (select 1 from public.posts p where p.tenant_id = p_tenant_id and p.id = v_post) then
      return jsonb_build_object('fate', 'gone');
    end if;
    update public.plan_slots set post_id = v_post, updated_at = now() where id = v_slot.id;
  elsif v_piece is not null then
    if not exists (select 1 from public.pieces p where p.tenant_id = p_tenant_id and p.id = v_piece) then
      return jsonb_build_object('fate', 'gone');
    end if;
    update public.plan_slots set piece_id = v_piece, updated_at = now() where id = v_slot.id;
  elsif jsonb_typeof(v_held) = 'object' then
    update public.plan_slots set state = 'blocked', blocked_why = v_held ->> 'why',
                                 blocked_reason = left(btrim(v_held ->> 'reason'), 400), updated_at = now()
     where id = v_slot.id;
  else
    raise exception 'A slot is made into a post or a video, or held with why.' using errcode = '22023';
  end if;
  return jsonb_build_object('fate', 'made', 'slot_id', v_slot.id);
end $$;
revoke all on function public.plan_slot_made(uuid, uuid, jsonb) from public, anon;
grant execute on function public.plan_slot_made(uuid, uuid, jsonb) to authenticated;
comment on function public.plan_slot_made(uuid, uuid, jsonb) is
  'What an approved slot was made into (00706; the content loop PRD''s 8.4; made after the week''s approval), by a member with the settings permission: {post_id} its post at its place, {piece_id} its video begun, or {held: {why, reason}} why it could not be made, with its one fix. Only a slot approved and not yet posted takes it. Answers {fate: made, slot_id} or {fate: gone | <state>}.';

-- ai_usage.purpose takes post_words and content_line: what writing a week's posts costs, and reading a line of Settings ›
-- Content in the owner's words, each read apart (PRD 13). Re-made from the purposes it holds, so one another migration
-- added ahead of this one stays.
do $$
declare
  v_purposes text[];
begin
  select array_agg(found.m[1] order by found.at) into v_purposes
    from pg_constraint c
    cross join lateral regexp_matches(pg_get_constraintdef(c.oid), '''([a-z0-9_]+)''', 'g') with ordinality as found(m, at)
   where c.conrelid = 'public.ai_usage'::regclass and c.conname = 'ai_usage_purpose_check';
  if coalesce(cardinality(v_purposes), 0) = 0 then
    raise exception 'ai_usage_purpose_check: the purposes it holds could not be read';
  end if;
  if not 'post_words' = any (v_purposes) then
    v_purposes := array_append(v_purposes, 'post_words');
  end if;
  if not 'content_line' = any (v_purposes) then
    v_purposes := array_append(v_purposes, 'content_line');
  end if;
  alter table public.ai_usage drop constraint ai_usage_purpose_check;
  execute 'alter table public.ai_usage add constraint ai_usage_purpose_check check (purpose = any (array['
    || (select string_agg(quote_literal(k.p), ', ' order by k.at) from unnest(v_purposes) with ordinality as k(p, at))
    || ']))';
end $$;

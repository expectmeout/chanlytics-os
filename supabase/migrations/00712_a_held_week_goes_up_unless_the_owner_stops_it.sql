-- 00712 · A week AI may approve goes up at 8:00 unless the owner stops it (the content loop PRD v3.7, 12.4; pass 6, B5).
--
-- Until now a week of posts went up only by the owner's own press: Approve the week, then the week made right after it,
-- inside that press. The Autonomy pane now has a row for each thing AI could do with content, in the matrix's own modes,
-- and the owner may let AI approve the week: holding it, it goes up at 8:00 AM in the business's zone unless the owner
-- stops it first; sending it, as soon as it is ready. The time is kept by a job; the week is approved under the rung, and
-- made by the same code the owner's press runs, as AI, through the doors below.
--
--   policies.class            gains plan_approve, post, ad_change and comment_reply (the PRD's four acts), each asking the
--                             owner in every workspace and in the provisioner. Only plan_approve honours more for now
--                             (contracts POLICY_CLASS_MODES); the others ask until each has its own runtime.
--   content_plans             goes_at (when a held week goes, null when nothing will), stopped_at and stopped_by (the
--                             owner's Stop it), edited (the owner left out, moved or swapped a slot of it; null for a week
--                             from before this file, unknown): what AI's suggested rung reads as its record.
--   posts.via                 gains rung: a placement AI approved under the owner's rung, never by a press.
--                             make_queued_at, first_post_at, making_since, made_at, make_tries: a week AI approved,
--                             waiting in turn to be made (00712's making queue, below).
--   job_kinds                 content_week_go and content_week_make, in the bulk lane, one a plan each.
--
-- Doors: content_week_hold (the service's: a ready week held to a time, its job scheduled, or let go); content_week_stop (a
-- member with the settings permission: the hold let go, the week asks as before); content_week_approve re-made to take the
-- service role at a held week's time, under the rung read again in the same transaction, with the rung on its snapshot and
-- nobody as its approver; file_start, piece_words_keep, post_approve, plan_slot_made and piece_begin re-made to take the
-- service role (it can write their tables directly anyway; every check and hash of each stays), a version it writes made
-- by `ai`, a placement it approves only `via` rung. provision_tenant re-made with the four new rows.
--
-- The making queue, sized for every held week of a zone at one 8:00. A week is held from Sunday evening; from then it is
-- PREPARED in turn through the night (content_weeks_start: never more being made at once than a cap the caller derives
-- from what the database's front can take, the earliest first post first; content_week_made frees the place and begins
-- the next): its pictures drawn and each placement's approval readied on its slot (plan_slot_prepared), nothing approved,
-- nothing placed, no reel begun (a reel costs, and waits for the owner's look whatever the rung). At 8:00 the approval
-- places every prepared slot in its own transaction (content_week_approve), so 8:00 is one call a week, and those calls
-- are spread over the hour, each well before its week's first post (content_week_hold). What was not prepared is made in
-- turn after the approval, the earliest slot first. A making that never reports back frees its place when its lease ends
-- and is tried again, three times at most; the hourly playbooks sweep starts the queue too.
--
-- Locks: the two checks re-made from the lists they hold (read in a `do` block and appended to, so a value another
-- migration added ahead of this one stays), three columns and one row a workspace. Three seconds each and no more.
-- Re-runnable. Deploy order: this file first, then either app. The edge schedules the job, so an edge without this code
-- never meets the kind; a dashboard without it never offers the rung.

set local lock_timeout = '3s';

/* ---------------------------------------------------------------------- 1. Autonomy's content rows (policies.class) -- */

do $$
declare
  v_classes text[];
  v_one     text;
begin
  select array_agg(found.m[1] order by found.at) into v_classes
    from pg_constraint c
    cross join lateral regexp_matches(pg_get_constraintdef(c.oid), '''([a-z0-9_]+)''', 'g') with ordinality as found(m, at)
   where c.conrelid = 'public.policies'::regclass and c.conname = 'policies_class_check';
  if coalesce(cardinality(v_classes), 0) = 0 then
    raise exception 'policies_class_check: the values it holds could not be read';
  end if;
  foreach v_one in array array['plan_approve', 'post', 'ad_change', 'comment_reply'] loop
    if not v_one = any (v_classes) then
      v_classes := v_classes || v_one;
    end if;
  end loop;
  alter table public.policies drop constraint policies_class_check;
  execute 'alter table public.policies add constraint policies_class_check check (class = any (array['
    || (select string_agg(quote_literal(k.v), ', ' order by k.at) from unnest(v_classes) with ordinality as k(v, at))
    || ']))';
end $$;

insert into public.policies (tenant_id, class, mode, limits)
select t.id, c.class, 'ask', '{}'::jsonb
  from public.tenants t
 cross join (values ('plan_approve'), ('post'), ('ad_change'), ('comment_reply')) as c(class)
on conflict (tenant_id, class, subject_type, subject_id) do nothing;

create or replace function public.provision_tenant(p_tenant_id uuid) returns void
  language plpgsql security definer set search_path = public as $$
begin
  insert into public.policies (tenant_id, class, mode, limits)
  select p_tenant_id, c.class, c.mode,
         case when c.class = 'reply'
              then '{"max_replies_day": 20, "pause_hours": 24, "max_llm_tokens_day": 1000000}'::jsonb
              else '{}'::jsonb end
  from (values
    ('faq','auto'), ('booking','auto'), ('reply','auto'),
    ('reengage','veto'), ('campaign','veto'), ('reviews','ask'), ('money','never'), ('follow_up','veto'),
    ('outreach','veto'),
    -- 00712: what AI does with content asks the owner first, every row.
    ('plan_approve','ask'), ('post','ask'), ('ad_change','ask'), ('comment_reply','ask')
  ) as c(class, mode)
  on conflict (tenant_id, class, subject_type, subject_id) do nothing;

  insert into public.tenant_config (tenant_id) values (p_tenant_id)
  on conflict (tenant_id) do nothing;

  insert into public.billing_accounts (tenant_id, mode, status) values (p_tenant_id, 'stripe', 'none')
  on conflict (tenant_id) do nothing;
end $$;

/* -------------------------------------------------------------------------------------- 2. the hold, on the plan -- */

alter table public.content_plans add column if not exists goes_at timestamptz;
alter table public.content_plans add column if not exists stopped_at timestamptz;
alter table public.content_plans add column if not exists stopped_by uuid references auth.users (id) on delete set null;
-- The making queue (00712): queued when the week is held (prepared ahead) and again once AI approved it (what is left to
-- make), its earliest slot's time its turn, the making's start and end, and how often it was begun.
alter table public.content_plans add column if not exists make_queued_at timestamptz;
alter table public.content_plans add column if not exists first_post_at timestamptz;
alter table public.content_plans add column if not exists making_since timestamptz;
alter table public.content_plans add column if not exists made_at timestamptz;
alter table public.content_plans add column if not exists make_tries smallint not null default 0;
-- Null for a week from before this file (whether the owner changed it is not known), false for every week after it.
alter table public.content_plans add column if not exists edited boolean;
alter table public.content_plans alter column edited set default false;

create index if not exists content_plans_stopped_by on public.content_plans (stopped_by) where stopped_by is not null;
-- The queue, in its turn: only the weeks waiting to be made or being made.
create index if not exists content_plans_to_make on public.content_plans (first_post_at, make_queued_at)
  where make_queued_at is not null and made_at is null;
-- What is being made now, which the cap counts.
create index if not exists content_plans_making on public.content_plans (making_since)
  where making_since is not null and made_at is null;

-- A slot prepared ahead (00712): the made file its picture was drawn into, the time it was prepared for, and the approval
-- of that placement as post_approve takes it. Placed at 8:00 only as it still stands.
alter table public.plan_slots add column if not exists prepared jsonb;
comment on column public.plan_slots.prepared is
  'A slot of a held week prepared ahead (00712; plan_slot_prepared): {file_id, at, approval}, the made file its picture was drawn into, the time it was prepared for and the approval post_approve takes for it, via rung. The week''s approval under the rung places it in its own transaction while its time still stands. Never an approval itself.';

comment on column public.content_plans.goes_at is
  'When a week AI may approve goes (00712; the content loop PRD''s 12.4): 8:00 in the business''s zone for a week held, the moment it is ready for one AI sends. Null when nothing will go without the owner''s press. Written by content_week_hold, let go by content_week_stop.';
comment on column public.content_plans.stopped_at is
  'When a member stopped a held week (00712, Stop it): it then waits for the owner''s own press, as a week that asks does.';
comment on column public.content_plans.stopped_by is 'Who stopped a held week (00712).';
comment on column public.content_plans.make_queued_at is
  'When a week joined the making queue (00712): when it was held (to be prepared ahead) and again when AI approved it (what is left to make). Made in turn by content_weeks_start, never more at once than its cap. Null when nothing of it waits.';
comment on column public.content_plans.first_post_at is
  'The earliest slot of the week still to be made (00712): the making queue''s turn, earliest first.';
comment on column public.content_plans.making_since is
  'When the week''s current pass began (00712): it holds a place in the queue''s cap until made_at, or until its lease ends and it is tried again.';
comment on column public.content_plans.made_at is
  'When the dashboard said the week''s current pass was done (00712, content_week_made): prepared while held, made once approved. It leaves the queue.';
comment on column public.content_plans.make_tries is
  'How many times the week''s making was begun (00712): a week begun three times is left to the owner.';
comment on column public.content_plans.edited is
  'Whether the owner left out, moved or swapped a slot of the week (00712, plan_slots_mark_edited): AI''s suggested rung reads the weeks approved with none as its record. Null for a week from before 00712, where it is not known.';

/** A slot left out, moved or given other footage marks its week edited: what the owner changed of what AI planned. */
create or replace function public.plan_slots_mark_edited() returns trigger
  language plpgsql set search_path = public as $$
begin
  update public.content_plans p set edited = true
   where p.id = new.plan_id and p.tenant_id = new.tenant_id and p.edited is distinct from true;
  return null;
end $$;
revoke all on function public.plan_slots_mark_edited() from public, anon, authenticated;

comment on function public.plan_slots_mark_edited() is
  'After a slot of a week is left out, moved or given other footage (00712): its plan is marked edited, the record AI''s suggested rung reads. The trigger plan_slots_edited runs it.';

drop trigger if exists plan_slots_edited on public.plan_slots;
create trigger plan_slots_edited after update on public.plan_slots
  for each row
  when (old.at is distinct from new.at
        or (new.state = 'removed' and old.state is distinct from 'removed')
        or (old.file_id is not null and new.file_id is distinct from old.file_id))
  execute function public.plan_slots_mark_edited();

/* ------------------------------------------------------------------------------------------ 3. posts.via gains rung -- */

do $$
declare
  v_vias text[];
  v_one  text;
begin
  select array_agg(found.m[1] order by found.at) into v_vias
    from pg_constraint c
    cross join lateral regexp_matches(pg_get_constraintdef(c.oid), '''([a-z0-9_]+)''', 'g') with ordinality as found(m, at)
   where c.conrelid = 'public.posts'::regclass and c.conname = 'posts_via_check';
  if coalesce(cardinality(v_vias), 0) = 0 then
    raise exception 'posts_via_check: the values it holds could not be read';
  end if;
  foreach v_one in array array['rung'] loop
    if not v_one = any (v_vias) then
      v_vias := v_vias || v_one;
    end if;
  end loop;
  alter table public.posts drop constraint posts_via_check;
  execute 'alter table public.posts add constraint posts_via_check check (via = any (array['
    || (select string_agg(quote_literal(k.v), ', ' order by k.at) from unnest(v_vias) with ordinality as k(v, at))
    || ']))';
end $$;

/* ------------------------------------------------------------------------------------------------ 4. the job kind -- */

insert into public.job_kinds (kind, lane, once_parts, once_kept) values
  ('content_week_go', 2, array['plan_id'], false),
  ('content_week_make', 2, array['plan_id'], false)
on conflict (kind) do update
  set lane = excluded.lane, once_parts = excluded.once_parts, once_kept = excluded.once_kept;

/* ------------------------------------------------------------------------------------- 5. the hold and its stop -- */

create or replace function public.content_week_hold(p_tenant_id uuid, p_plan_id uuid, p_goes_at timestamptz default null)
returns jsonb
  language plpgsql security definer set search_path = public as $$
declare
  v_plan    public.content_plans;
  v_rung    text;
  v_first   timestamptz;
  v_spread  integer;
  v_due     timestamptz;
begin
  if coalesce((select auth.role()), '') <> 'service_role' then
    raise exception 'Only the service holds a week.' using errcode = '42501';
  end if;
  select * into v_plan from public.content_plans p where p.tenant_id = p_tenant_id and p.id = p_plan_id for update;
  if not found then
    return jsonb_build_object('fate', 'gone');
  end if;
  select p.mode into v_rung from public.policies p
   where p.tenant_id = p_tenant_id and p.class = 'plan_approve' and p.subject_type is null;
  -- Let go: asked to, or a week no longer ready, stopped, or under a rung that asks. Nothing on a screen says it goes up,
  -- and nothing of it is prepared.
  if p_goes_at is null or v_plan.status <> 'ready' or v_plan.stopped_at is not null
     or v_rung is null or v_rung not in ('veto', 'auto') then
    update public.content_plans set goes_at = null, make_queued_at = null
     where id = v_plan.id and status = 'ready' and (goes_at is not null or make_queued_at is not null);
    return jsonb_build_object('fate', case when p_goes_at is null then 'let_go'
                                           when v_plan.status <> 'ready' then v_plan.status
                                           when v_plan.stopped_at is not null then 'stopped'
                                           else 'asks' end);
  end if;
  if p_goes_at < now() - interval '1 minute' or p_goes_at > now() + interval '8 days' then
    raise exception 'A week is held to a time within the week ahead.' using errcode = '22023';
  end if;
  select min(s.at) into v_first from public.plan_slots s
   where s.tenant_id = p_tenant_id and s.plan_id = p_plan_id and s.state = 'proposed';
  -- Its approval is spread over the hour after its time, each well before its own first post, so a zone's 8:00 never
  -- arrives at once.
  v_spread := greatest(0, least(3600,
    floor(extract(epoch from (coalesce(v_first, p_goes_at) - p_goes_at - interval '20 minutes')))::integer));
  v_due := p_goes_at + make_interval(secs => (abs(hashtext(p_plan_id::text)::bigint) % (v_spread + 1))::integer);
  -- Prepared ahead, in turn, the earliest first post first: its pictures drawn and their approvals readied, nothing placed.
  update public.content_plans set goes_at = p_goes_at, make_queued_at = now(), first_post_at = v_first, made_at = null,
                                  make_tries = 0
   where id = v_plan.id;
  -- One a plan: held again (the week drafted again, or a later time), its job moves with it.
  update public.jobs j set due_at = v_due
   where j.tenant_id = p_tenant_id and j.kind = 'content_week_go' and j.payload ->> 'plan_id' = p_plan_id::text
     and j.state = 'scheduled';
  if not found then
    insert into public.jobs (tenant_id, kind, due_at, payload)
    values (p_tenant_id, 'content_week_go', v_due, jsonb_build_object('plan_id', p_plan_id::text))
    on conflict do nothing;
  end if;
  return jsonb_build_object('fate', 'held', 'goes_at', p_goes_at, 'due_at', v_due, 'mode', v_rung);
end $$;

revoke all on function public.content_week_hold(uuid, uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.content_week_hold(uuid, uuid, timestamptz) to service_role;

comment on function public.content_week_hold(uuid, uuid, timestamptz) is
  'A ready week held to its time (00712; the content loop PRD''s 12.4), by the service when the plan job writes it: under a plan_approve rung that holds (veto) or sends (auto) it, goes_at set, the week queued to be prepared ahead, and its content_week_go job scheduled within the hour after goes_at, before its first post (moved there when one waits). Null, or a week no longer ready, stopped, or under a rung that asks, lets it go (goes_at null, out of the queue). Answers {fate: held, goes_at, due_at, mode} or {fate: let_go | asks | stopped | gone | <status>}.';

create or replace function public.content_week_stop(p_tenant_id uuid, p_plan_id uuid) returns jsonb
  language plpgsql security definer set search_path = public as $$
declare
  v_actor  uuid := auth.uid();
  v_plan   public.content_plans;
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
  if v_plan.goes_at is null then
    return jsonb_build_object('fate', 'asks');
  end if;
  -- Nothing more of it is prepared: a making already begun still holds its place until it is said done.
  update public.content_plans set goes_at = null, stopped_at = now(), stopped_by = v_actor, make_queued_at = null
   where id = v_plan.id;
  return jsonb_build_object('fate', 'stopped', 'plan_id', v_plan.id);
end $$;

revoke all on function public.content_week_stop(uuid, uuid) from public, anon;
grant execute on function public.content_week_stop(uuid, uuid) to authenticated, service_role;

comment on function public.content_week_stop(uuid, uuid) is
  'Stop it (00712; the content loop PRD''s 12.4), by a member with the settings permission: a held week''s time let go and the stop kept, so it waits for the owner''s own press as a week that asks does; its job finds nothing to do. Answers {fate: stopped, plan_id} or {fate: asks | gone | <status>}.';

/* ------------------------------------------------------------------------------------------- 6. the making queue -- */

create or replace function public.content_weeks_start(p_cap integer, p_lease_seconds integer) returns integer
  language plpgsql security definer set search_path = public as $$
declare
  v_free     integer;
  v_started  integer := 0;
  v_plan     record;
begin
  if coalesce((select auth.role()), '') <> 'service_role' then
    raise exception 'Only the service starts the making queue.' using errcode = '42501';
  end if;
  if p_cap is null or p_cap not between 1 and 200 or p_lease_seconds is null or p_lease_seconds not between 60 and 3600 then
    raise exception 'A cap of 1 to 200 at once, and a lease of a minute to an hour.' using errcode = '22023';
  end if;
  -- One start at a time, platform-wide: the count below is of what is there.
  perform pg_advisory_xact_lock(hashtextextended('content_weeks_start', 42));
  -- Being made now: begun, not said done, within its lease. A week stopped or approved meanwhile still holds its place.
  select p_cap - count(*) into v_free from public.content_plans p
   where p.made_at is null and p.making_since > now() - make_interval(secs => p_lease_seconds);
  if v_free <= 0 then
    return 0;
  end if;
  for v_plan in
    select p.id, p.tenant_id from public.content_plans p
     where p.make_queued_at is not null and p.made_at is null and p.make_tries < 3
       and (p.making_since is null or p.making_since <= now() - make_interval(secs => p_lease_seconds))
       and ((p.status = 'ready' and p.goes_at is not null and p.stopped_at is null) or p.status = 'approved')
     order by p.first_post_at nulls last, p.make_queued_at, p.id
     limit v_free
     for update skip locked
  loop
    update public.content_plans set making_since = now(), make_tries = make_tries + 1 where id = v_plan.id;
    insert into public.jobs (tenant_id, kind, due_at, payload)
    values (v_plan.tenant_id, 'content_week_make', now(), jsonb_build_object('plan_id', v_plan.id::text))
    on conflict do nothing;
    v_started := v_started + 1;
  end loop;
  return v_started;
end $$;

revoke all on function public.content_weeks_start(integer, integer) from public, anon, authenticated;
grant execute on function public.content_weeks_start(integer, integer) to service_role;

comment on function public.content_weeks_start(integer, integer) is
  'The making queue (00712; the content loop PRD''s 12.4): weeks held (prepared ahead: their pictures drawn, their approvals readied) or approved by AI under the rung (what is left made), begun in turn, the earliest first post first, never more being made at once than p_cap (a making holds its place until said done, or for p_lease_seconds); each begun gets its content_week_make job. A week begun three times in a pass is left. One start at a time platform-wide. Answers how many it began. The service''s.';

drop function if exists public.content_week_made(uuid, uuid, integer, integer);

create or replace function public.content_week_made(p_tenant_id uuid, p_plan_id uuid, p_pass text, p_cap integer,
                                                    p_lease_seconds integer)
returns jsonb
  language plpgsql security definer set search_path = public as $$
declare
  v_found  boolean;
begin
  if coalesce((select auth.role()), '') <> 'service_role' then
    raise exception 'Only the service says a week was made.' using errcode = '42501';
  end if;
  if p_pass is null or p_pass not in ('prepare', 'make') then
    raise exception 'A week is prepared while held, or made once approved.' using errcode = '22023';
  end if;
  update public.content_plans set made_at = now()
   where tenant_id = p_tenant_id and id = p_plan_id and made_at is null
     and ((p_pass = 'prepare' and status = 'ready') or (p_pass = 'make' and status = 'approved'));
  v_found := found;
  if not v_found then
    -- A pass the week has moved past (approved while it was being prepared): its place is free for the next.
    update public.content_plans set making_since = null
     where tenant_id = p_tenant_id and id = p_plan_id and made_at is null;
  end if;
  return jsonb_build_object('fate', case when v_found then 'made' else 'moved_on' end,
                            'started', public.content_weeks_start(p_cap, p_lease_seconds));
end $$;

revoke all on function public.content_week_made(uuid, uuid, text, integer, integer) from public, anon, authenticated;
grant execute on function public.content_week_made(uuid, uuid, text, integer, integer) to service_role;

comment on function public.content_week_made(uuid, uuid, text, integer, integer) is
  'A week''s pass done (00712): p_pass prepare (a held week''s pictures drawn and approvals readied) or make (what was left after AI approved it). Its place is free and the next in turn begins (content_weeks_start); a pass the week has moved past only frees the place. Answers {fate: made | moved_on, started}. The service''s.';

create or replace function public.plan_slot_prepared(p_tenant_id uuid, p_slot_id uuid, p_prepared jsonb) returns boolean
  language plpgsql security definer set search_path = public as $$
begin
  if coalesce((select auth.role()), '') <> 'service_role' then
    raise exception 'Only the service prepares a slot.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_prepared) is distinct from 'object' or (p_prepared ->> 'file_id') is null
     or (p_prepared ->> 'at') is null or jsonb_typeof(p_prepared -> 'approval') is distinct from 'object' then
    raise exception 'A prepared slot names its made file, its time and its approval.' using errcode = '22023';
  end if;
  update public.plan_slots s set prepared = p_prepared, updated_at = now()
    from public.content_plans p
   where s.tenant_id = p_tenant_id and s.id = p_slot_id and s.state = 'proposed'
     and p.tenant_id = p_tenant_id and p.id = s.plan_id and p.status = 'ready';
  return found;
end $$;

revoke all on function public.plan_slot_prepared(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.plan_slot_prepared(uuid, uuid, jsonb) to service_role;

comment on function public.plan_slot_prepared(uuid, uuid, jsonb) is
  'A slot of a held week prepared ahead (00712), by the service: {file_id, at, approval}, the made file its picture was drawn into, the time it was prepared for and the approval post_approve takes. Only a proposed slot of a week still ready takes it. Answers whether it was kept. Approves and places nothing.';

/* ---------------------------------------------------------------- 7. the week approved under the rung, and made -- */

create or replace function public.content_week_approve(p_tenant_id uuid, p_plan_id uuid, p_snapshot jsonb) returns jsonb
  language plpgsql security definer set search_path = public as $$
declare
  v_actor     uuid := auth.uid();
  -- 00712: the service, making a week a rung let AI approve: no member, so no member's permission to ask.
  v_service  boolean := auth.uid() is null and coalesce((select auth.role()), '') = 'service_role';
  v_plan      public.content_plans;
  v_wanted    jsonb := coalesce(p_snapshot -> 'slots', '[]'::jsonb);
  v_matching  integer;
  v_approval  uuid;
  v_rung      text;
  v_slot      public.plan_slots;
  v_placed    jsonb;
  v_left      timestamptz;
  v_put       integer := 0;
  v_snapshot  jsonb := p_snapshot;
begin
  if v_actor is null and not v_service then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  if p_tenant_id is null
     or (not v_service and not coalesce(public.caller_has_permission(p_tenant_id, 'settings'), false)) then
    raise exception 'Not yours to change.' using errcode = '42501';
  end if;
  select * into v_plan from public.content_plans p where p.tenant_id = p_tenant_id and p.id = p_plan_id for update;
  if not found then
    return jsonb_build_object('fate', 'gone');
  end if;
  if v_plan.status <> 'ready' then
    return jsonb_build_object('fate', v_plan.status);
  end if;
  -- AI approves only a week held to a time that has come, not stopped, under a rung that still holds or sends it.
  if v_service then
    if v_plan.stopped_at is not null then
      return jsonb_build_object('fate', 'stopped');
    end if;
    if v_plan.goes_at is null or v_plan.goes_at > now() + interval '1 minute' then
      return jsonb_build_object('fate', 'held');
    end if;
    select p.mode into v_rung from public.policies p
     where p.tenant_id = p_tenant_id and p.class = 'plan_approve' and p.subject_type is null;
    if v_rung is null or v_rung not in ('veto', 'auto') then
      update public.content_plans set goes_at = null where id = v_plan.id;
      return jsonb_build_object('fate', 'asks');
    end if;
    v_snapshot := p_snapshot || jsonb_build_object('rung', jsonb_build_object('class', 'plan_approve', 'mode', v_rung));
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
  values (p_tenant_id, 'plan', p_plan_id, v_snapshot, public.approval_hash(v_snapshot), v_actor)
  returning id into v_approval;
  update public.plan_slots s set state = 'approved', approval_id = v_approval, updated_at = now()
    from jsonb_array_elements(v_wanted) w
   where s.tenant_id = p_tenant_id and s.plan_id = p_plan_id and s.id = (w ->> 'id')::uuid;
  update public.content_plans set status = 'approved', approval_id = v_approval, approved_at = now(),
                                  approved_by = v_actor
   where id = p_plan_id;
  -- 00712: under the rung, each slot prepared ahead is placed now, in this transaction, as its own approval of the
  -- bytes and words drawn for it, only while its time stands as it was prepared and is more than five minutes off.
  -- What is not placed is made in turn after, the week queued for it, its earliest slot first.
  if v_service then
    for v_slot in
      select s.* from public.plan_slots s
       where s.tenant_id = p_tenant_id and s.plan_id = p_plan_id and s.approval_id = v_approval
         and s.prepared is not null and s.post_id is null
         and (s.prepared ->> 'at')::timestamptz = s.at and s.at > now() + interval '5 minutes'
       order by s.at
    loop
      begin
        v_placed := public.post_approve(p_tenant_id, (v_slot.prepared ->> 'file_id')::uuid, v_slot.prepared -> 'approval');
      exception when others then
        v_placed := jsonb_build_object('fate', 'refused');
      end;
      if v_placed ->> 'fate' = 'approved' then
        update public.plan_slots set post_id = (v_placed -> 'posts' -> 0 ->> 'post_id')::uuid, updated_at = now()
         where id = v_slot.id;
        v_put := v_put + 1;
      end if;
    end loop;
    select min(s.at) into v_left from public.plan_slots s
     where s.tenant_id = p_tenant_id and s.plan_id = p_plan_id and s.approval_id = v_approval
       and s.post_id is null and s.piece_id is null;
    update public.content_plans
       set make_queued_at = case when v_left is null then null else now() end, first_post_at = v_left,
           made_at = case when v_left is null then now() end, make_tries = 0,
           -- A preparing still under way keeps its place until it is said done; a finished pass holds none.
           making_since = case when made_at is null then making_since end
     where id = p_plan_id;
  end if;
  return jsonb_build_object('fate', 'approved', 'approval_id', v_approval, 'slots', v_matching, 'placed', v_put);
end $$;

create or replace function public.file_start(p_tenant_id uuid, p_id uuid) returns void
  language plpgsql security definer set search_path = public as $$
declare
  v_actor uuid := auth.uid();
  -- 00712: the service, making a week a rung let AI approve: no member, so no member's permission to ask.
  v_service  boolean := auth.uid() is null and coalesce((select auth.role()), '') = 'service_role';
begin
  if v_actor is null and not v_service then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  if p_tenant_id is null
     or (not v_service and not coalesce(public.caller_has_permission(p_tenant_id, 'add_files'), false)) then
    raise exception 'Not yours to change.' using errcode = '42501';
  end if;
  -- contracts FILES_MAX: the fair word before anything travels. file_found holds it for certain.
  if public.files_toward_cap(p_tenant_id) >= 1000 then
    raise exception 'This workspace holds as many files as it can. Remove some first.' using errcode = '22023';
  end if;
  -- Bytes that never become a file hold nothing but their folder: this empties it a day on, and leaves a file alone.
  insert into public.jobs (tenant_id, kind, due_at, payload)
  values (p_tenant_id, 'file_purge', now() + interval '1 day', jsonb_build_object('file_id', p_id, 'why', 'start'));
end $$;

create or replace function public.piece_words_keep(p_tenant_id uuid, p_file_id uuid, p_caption text) returns jsonb
  language plpgsql security definer set search_path = public as $$
declare
  v_actor     uuid := auth.uid();
  -- 00712: the service, making a week a rung let AI approve: no member, so no member's permission to ask.
  v_service  boolean := auth.uid() is null and coalesce((select auth.role()), '') = 'service_role';
  v_words     text := nullif(btrim(p_caption), '');
  v_piece     public.pieces;
  v_rev       public.piece_revisions;
  v_n         integer;
  v_post      public.posts;
  v_old       public.approvals;
  v_snapshot  jsonb;
  v_approval  uuid;
  v_followed  integer := 0;
begin
  if v_actor is null and not v_service then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  if p_tenant_id is null
     or (not v_service and not coalesce(public.caller_has_permission(p_tenant_id, 'settings'), false)) then
    raise exception 'Not yours to change.' using errcode = '42501';
  end if;
  select * into v_piece from public.pieces p
   where p.tenant_id = p_tenant_id and p.file_id = p_file_id order by p.created_at desc limit 1 for update;
  if found then
    select * into v_rev from public.piece_revisions r where r.piece_id = v_piece.id and r.n = v_piece.revision;
    -- A piece no placement was ever approved of keeps no version yet: its first is written at its first approval.
    if found and (v_rev.captions ->> 'instagram' is distinct from coalesce(v_words, '')
                  or v_rev.captions ->> 'google' is distinct from coalesce(v_words, '')) then
      v_n := v_piece.revision + 1;
      insert into public.piece_revisions (tenant_id, piece_id, n, plan, captions, changed, made_by, created_by)
      values (p_tenant_id, v_piece.id, v_n, v_rev.plan,
              jsonb_build_object('instagram', coalesce(v_words, ''), 'google', coalesce(v_words, '')),
              array['caption'], case when v_service then 'ai' else 'owner' end, v_actor);
      update public.pieces p set revision = v_n, updated_at = now() where p.id = v_piece.id;
    end if;
  end if;
  for v_post in
    select * from public.posts p
     where p.tenant_id = p_tenant_id and p.file_id = p_file_id and p.status = 'queued' and p.kind <> 'story'
       and p.caption is distinct from v_words
     for update
  loop
    v_approval := v_post.approval_id;
    select * into v_old from public.approvals a where a.tenant_id = p_tenant_id and a.id = v_post.approval_id;
    if found and v_old.voided_at is null then
      -- The same bytes, this placement alone, with the new words and the version they are: a new approval, by this member.
      v_snapshot := v_old.snapshot
        || jsonb_build_object(
             'revision', jsonb_build_object('piece_id', v_post.piece_id, 'n', coalesce(v_n, v_post.revision)),
             'placements', (select coalesce(jsonb_agg(e || jsonb_build_object('caption', v_words)), '[]'::jsonb)
                              from jsonb_array_elements(v_old.snapshot -> 'placements') e
                             where e ->> 'place' = v_post.place and e ->> 'kind' = v_post.kind),
             'renditions', (select coalesce(jsonb_agg(e), '[]'::jsonb)
                              from jsonb_array_elements(v_old.snapshot -> 'renditions') e
                             where e ->> 'shape' = public.post_shape(v_post.place, v_post.kind)));
      insert into public.approvals (tenant_id, subject_type, subject_id, snapshot, snapshot_hash, approved_by, policy_edition)
      values (p_tenant_id, 'piece_revision',
              coalesce((select r.id from public.piece_revisions r
                         where r.piece_id = v_post.piece_id and r.n = coalesce(v_n, v_post.revision)), v_old.subject_id),
              v_snapshot, public.approval_hash(v_snapshot), v_actor, v_old.policy_edition)
      returning id into v_approval;
    end if;
    update public.posts p
       set caption = v_words, approval_id = v_approval, revision = coalesce(v_n, p.revision),
           approved_by = v_actor, approved_at = now(), updated_at = now()
     where p.id = v_post.id;
    v_followed := v_followed + 1;
  end loop;
  return jsonb_build_object('revision', coalesce(v_n, v_piece.revision), 'followed', v_followed);
end $$;

create or replace function public.post_approve(p_tenant_id uuid, p_file_id uuid, p_approval jsonb) returns jsonb
  language plpgsql security definer set search_path = public as $$
declare
  v_actor      uuid := auth.uid();
  -- 00712: the service, making a week a rung let AI approve: no member, so no member's permission to ask.
  v_service  boolean := auth.uid() is null and coalesce((select auth.role()), '') = 'service_role';
  v_file       public.files;
  v_piece      public.pieces;
  v_rev        public.piece_revisions;
  v_n          integer;
  v_captions   jsonb := '{}'::jsonb;
  v_place      jsonb;
  v_rendition  jsonb;
  v_kept       public.piece_renditions;
  v_busy       uuid;
  v_approval   uuid;
  v_id         uuid;
  v_when       timestamptz;
  v_later      boolean;
  v_posts      jsonb := '[]'::jsonb;
  v_snapshot   jsonb;
  v_places     jsonb := coalesce(p_approval -> 'placements', '[]'::jsonb);
  -- An older version's own file approved again (00708: "Post this one instead"): the version its shape was kept at.
  v_older      integer;
begin
  if v_actor is null and not v_service then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  if p_tenant_id is null
     or (not v_service and not coalesce(public.caller_has_permission(p_tenant_id, 'settings'), false)) then
    raise exception 'Not yours to change.' using errcode = '42501';
  end if;
  if v_service <> (coalesce(p_approval ->> 'via', '') = 'rung') then
    raise exception 'A placement goes via rung when AI approves it under the owner''s rung, and only then.' using errcode = '42501';
  end if;
  if jsonb_typeof(v_places) <> 'array' or jsonb_array_length(v_places) not between 1 and 4 then
    raise exception 'An approval names one to four placements.' using errcode = '22023';
  end if;
  if jsonb_typeof(p_approval -> 'snapshot') is distinct from 'object' then
    raise exception 'An approval carries its snapshot.' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_tenant_id::text || '|posts', 42));
  select * into v_file from public.files f where f.tenant_id = p_tenant_id and f.id = p_file_id;
  if not found or v_file.removed_at is not null then
    return jsonb_build_object('fate', 'gone', 'posts', '[]'::jsonb);
  end if;
  if v_file.source <> 'made' then
    return jsonb_build_object('fate', 'not_a_post', 'posts', '[]'::jsonb);
  end if;
  -- Each placement: a place, a kind the file can go as there, words within the place's own limit, a time within 30 days.
  for v_place in select * from jsonb_array_elements(v_places) loop
    if (v_place ->> 'place') is null or (v_place ->> 'place') <> all (array['instagram', 'google', 'facebook']) then
      raise exception 'No such place: %.', v_place ->> 'place' using errcode = '22023';
    end if;
    if (case when v_file.kind = 'video'
             then not (v_place ->> 'place' in ('instagram', 'facebook') and v_place ->> 'kind' = 'reel')
             else (v_place ->> 'kind') is null or (v_place ->> 'kind') <> all (array['picture', 'story'])
                  or (v_place ->> 'place' = 'google' and v_place ->> 'kind' <> 'picture') end) then
      return jsonb_build_object('fate', 'wrong_kind', 'posts', '[]'::jsonb);
    end if;
    if char_length(coalesce(v_place ->> 'caption', '')) > (case when v_place ->> 'place' = 'google' then 1500 else 2200 end) then
      raise exception 'Those words are longer than the place takes.' using errcode = '22023';
    end if;
    v_when := greatest(coalesce((v_place ->> 'at')::timestamptz, now()), now());
    if v_when > now() + interval '30 days' then
      raise exception 'A post goes within thirty days.' using errcode = '22023';
    end if;
    if (v_place ->> 'good_until') is not null and (v_place ->> 'good_until')::timestamptz < v_when then
      return jsonb_build_object('fate', 'late', 'posts', '[]'::jsonb);
    end if;
  end loop;
  -- A Google press that died between its placement and its answer stops holding the next one after ten minutes (00616).
  update public.posts p
     set status = 'failed', updated_at = now(),
         error = jsonb_build_object('code', null, 'subcode', null, 'words',
                                    'Google did not say whether this went up. Look on your profile before posting it again.')
   where p.file_id = p_file_id and p.place = 'google' and p.status = 'publishing'
     and p.updated_at < now() - interval '10 minutes';
  -- One of each kind on its way at a place (00620).
  for v_place in select * from jsonb_array_elements(v_places) loop
    select p.id into v_busy from public.posts p
     where p.file_id = p_file_id and p.place = v_place ->> 'place' and p.kind = v_place ->> 'kind'
       and p.status = any (array['queued', 'preparing', 'publishing', 'checking']);
    if found then
      return jsonb_build_object('fate', 'busy', 'post_id', v_busy, 'posts', '[]'::jsonb);
    end if;
  end loop;

  -- Its own statement: a row it writes is seen only by the next one.
  v_id := public.piece_of_made_file(p_tenant_id, p_file_id, v_actor);
  select * into v_piece from public.pieces p where p.id = v_id;
  if not found then
    return jsonb_build_object('fate', 'not_a_post', 'posts', '[]'::jsonb);
  end if;
  -- A video's file that is no longer its piece's own is an older version's (00708): it is approved at that version.
  if v_file.kind = 'video' and v_piece.file_id is distinct from p_file_id then
    select r.revision into v_older from public.piece_renditions r
     where r.piece_id = v_piece.id and r.file_id = p_file_id order by r.revision desc limit 1;
  end if;
  -- A shape already kept with other bytes is not what the owner saw: nothing is written past here.
  for v_rendition in select * from jsonb_array_elements(coalesce(p_approval -> 'renditions', '[]'::jsonb)) loop
    select * into v_kept from public.piece_renditions r
     where r.piece_id = v_piece.id and r.shape = v_rendition ->> 'shape' and r.revision <= coalesce(v_older, v_piece.revision)
     order by r.revision desc limit 1;
    if found and (v_kept.checksum <> v_rendition ->> 'checksum' or v_kept.path <> v_rendition ->> 'path') then
      return jsonb_build_object('fate', 'changed', 'posts', '[]'::jsonb);
    end if;
  end loop;
  if p_approval ? 'intent' then
    update public.pieces p set intent = nullif(p_approval -> 'intent', 'null'::jsonb), updated_at = now()
     where p.id = v_piece.id and p.intent is distinct from nullif(p_approval -> 'intent', 'null'::jsonb);
  end if;

  -- The version it stands at, written the first time; words that differ from it are a new version (no new shapes).
  for v_place in select * from jsonb_array_elements(v_places) loop
    if v_place ->> 'kind' <> 'story' then
      v_captions := v_captions || jsonb_build_object(v_place ->> 'place', coalesce(v_place ->> 'caption', ''));
    end if;
  end loop;
  v_n := coalesce(v_older, v_piece.revision);
  select * into v_rev from public.piece_revisions r where r.piece_id = v_piece.id and r.n = v_n;
  if not found then
    insert into public.piece_revisions (tenant_id, piece_id, n, plan, captions, changed, made_by, created_by)
    values (p_tenant_id, v_piece.id, v_n, v_piece.plan, v_captions, array['first'], case when v_service then 'ai' else 'owner' end, v_actor)
    returning * into v_rev;
  -- An older version keeps its own words: the placements carry what goes, and a later version is never written over.
  elsif v_older is null and exists (select 1 from jsonb_each_text(v_captions) c
                 where v_rev.captions ? c.key and (v_rev.captions ->> c.key) <> c.value) then
    v_n := v_n + 1;
    insert into public.piece_revisions (tenant_id, piece_id, n, plan, captions, changed, made_by, created_by)
    values (p_tenant_id, v_piece.id, v_n, v_rev.plan, v_rev.captions || v_captions, array['caption'], case when v_service then 'ai' else 'owner' end, v_actor)
    returning * into v_rev;
    update public.pieces p set revision = v_n, updated_at = now() where p.id = v_piece.id;
  end if;

  -- Its shapes as they are sent: kept the first time (checked above to be the same bytes every time after).
  for v_rendition in select * from jsonb_array_elements(coalesce(p_approval -> 'renditions', '[]'::jsonb)) loop
    if not exists (select 1 from public.piece_renditions r
                    where r.piece_id = v_piece.id and r.shape = v_rendition ->> 'shape' and r.revision <= v_n) then
      insert into public.piece_renditions (tenant_id, piece_id, revision, shape, file_id, path, checksum, bytes)
      values (p_tenant_id, v_piece.id, v_n, v_rendition ->> 'shape', p_file_id, v_rendition ->> 'path',
              v_rendition ->> 'checksum', nullif(v_rendition ->> 'bytes', '')::bigint);
    end if;
  end loop;

  -- The snapshot names the version it is of, and its hash is taken here, of its own text, as post_as_approved takes it.
  v_snapshot := jsonb_set(p_approval -> 'snapshot', '{revision}', jsonb_build_object('piece_id', v_piece.id, 'n', v_n));
  insert into public.approvals (tenant_id, subject_type, subject_id, snapshot, snapshot_hash, approved_by, policy_edition)
  values (p_tenant_id, 'piece_revision', v_rev.id, v_snapshot, public.approval_hash(v_snapshot), v_actor,
          coalesce((p_approval ->> 'policy_edition')::integer, 1))
  returning id into v_approval;

  for v_place in select * from jsonb_array_elements(v_places) loop
    v_when := greatest(coalesce((v_place ->> 'at')::timestamptz, now()), now());
    v_later := v_place ->> 'place' = 'google' and v_when > now() + interval '2 minutes';
    insert into public.posts (tenant_id, file_id, place, kind, caption, scheduled_for, approved_by, approved_at, via, status,
                              piece_id, revision, approval_id, capability_edition, good_until)
    values (p_tenant_id, p_file_id, v_place ->> 'place', v_place ->> 'kind',
            case when v_place ->> 'kind' = 'story' then null else nullif(btrim(v_place ->> 'caption'), '') end,
            v_when, v_actor, now(), coalesce(p_approval ->> 'via', 'press'),
            case when v_place ->> 'place' = 'google' and not v_later then 'publishing' else 'queued' end,
            v_piece.id, v_n, v_approval, nullif(v_place ->> 'capability_edition', '')::integer,
            nullif(v_place ->> 'good_until', '')::timestamptz)
    returning id into v_id;
    if v_place ->> 'place' in ('instagram', 'facebook') then
      -- Ten minutes ahead of its time, so the place has made it ready by then (a Page as Instagram, pass 5); as text, as a job's key is made of strings.
      insert into public.jobs (tenant_id, kind, due_at, payload)
      values (p_tenant_id, 'post_prepare', greatest(now(), v_when - interval '10 minutes'),
              jsonb_build_object('post_id', v_id, 'attempt', '1'));
    elsif v_later then
      insert into public.jobs (tenant_id, kind, due_at, payload)
      values (p_tenant_id, 'post_google', v_when, jsonb_build_object('post_id', v_id, 'attempt', '1'));
    end if;
    v_posts := v_posts || jsonb_build_object('place', v_place ->> 'place', 'kind', v_place ->> 'kind', 'post_id', v_id);
  end loop;
  return jsonb_build_object('fate', 'approved', 'approval_id', v_approval, 'piece_id', v_piece.id, 'revision', v_n,
                            'posts', v_posts);
end $$;

create or replace function public.plan_slot_made(p_tenant_id uuid, p_slot_id uuid, p_made jsonb) returns jsonb
  language plpgsql security definer set search_path = public as $$
declare
  v_actor  uuid := auth.uid();
  -- 00712: the service, making a week a rung let AI approve: no member, so no member's permission to ask.
  v_service  boolean := auth.uid() is null and coalesce((select auth.role()), '') = 'service_role';
  v_slot   public.plan_slots;
  v_post   uuid := nullif(p_made ->> 'post_id', '')::uuid;
  v_piece  uuid := nullif(p_made ->> 'piece_id', '')::uuid;
  v_held   jsonb := p_made -> 'held';
begin
  if v_actor is null and not v_service then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  if p_tenant_id is null
     or (not v_service and not coalesce(public.caller_has_permission(p_tenant_id, 'settings'), false)) then
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

create or replace function public.piece_begin(p_tenant_id uuid, p_plan jsonb, p_look jsonb, p_key text, p_edition integer) returns jsonb
  language plpgsql security definer set search_path = public as $$
declare
  v_actor  uuid := auth.uid();
  -- 00712: the service, making a week a rung let AI approve: no member, so no member's permission to ask.
  v_service  boolean := auth.uid() is null and coalesce((select auth.role()), '') = 'service_role';
  v_id     uuid;
  v_status text;
begin
  if v_actor is null and not v_service then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  if p_tenant_id is null
     or (not v_service and not coalesce(public.caller_has_permission(p_tenant_id, 'settings'), false)) then
    raise exception 'Not yours to change.' using errcode = '42501';
  end if;
  -- contracts PIECE_SHAPES: in blocks, as Ask arranges one, or as "Hook first", which a card made before blocks carries.
  if p_plan is null or jsonb_typeof(p_plan) <> 'object'
     or (p_plan ->> 'shape') is null or (p_plan ->> 'shape') not in ('hook_cut', 'blocks') then
    raise exception 'No such shape.' using errcode = '22023';
  end if;
  if p_look is null or jsonb_typeof(p_look) <> 'object' then
    raise exception 'A video is drawn in the business''s look.' using errcode = '22023';
  end if;
  -- A plan is a few moments and a few words, a look a name and an address: nothing larger is either.
  if length(p_plan::text) > 8000 or length(p_look::text) > 2000 then
    raise exception 'A plan is a few moments and a few words.' using errcode = '22023';
  end if;
  if p_key is null or char_length(p_key) not between 1 and 120 or p_edition is null or p_edition < 1 then
    raise exception 'A press names its card and the template it is drawn by.' using errcode = '22023';
  end if;
  -- One at a time a workspace, so the count below is of what is there.
  perform pg_advisory_xact_lock(hashtextextended(p_tenant_id::text || '|pieces', 42));
  select p.id, p.status into v_id, v_status from public.pieces p
   where p.tenant_id = p_tenant_id and p.card_key = p_key;
  -- Pressed before: the one video. One that was not made is tried anew by the same press, below.
  if found and v_status <> 'failed' then
    return jsonb_build_object('fate', 'here', 'piece_id', v_id);
  end if;
  -- contracts PIECES_MAKING_MAX: each is a machine that costs while it draws. One begun over an hour ago holds no machine
  -- (a start waits half an hour at most, a machine lives eight minutes), so a video left waiting on the platform's word
  -- never closes the door on the next.
  if (select count(*) from public.pieces p
       where p.tenant_id = p_tenant_id and p.status = 'making' and p.created_at > now() - interval '1 hour') >= 3 then
    return jsonb_build_object('fate', 'busy', 'piece_id', null);
  end if;
  if v_id is null then
    insert into public.pieces (tenant_id, shape, plan, look, edition, card_key, created_by)
    values (p_tenant_id, p_plan ->> 'shape', p_plan, p_look, p_edition, p_key, v_actor)
    returning id into v_id;
  else
    -- The same card's new try: its row begins again, by the plan and the look as they now stand. A file of the try before,
    -- where one was kept and could not be read, stays in Files as it stands, and is this video's no longer.
    update public.pieces p
       set status = 'making', stage = 'queued', failed_why = null, machine = null, file_id = null, made_at = null,
           shape = p_plan ->> 'shape', plan = p_plan, look = p_look, edition = p_edition, created_by = v_actor,
           created_at = now(), updated_at = now()
     where p.id = v_id;
  end if;
  -- As text: a job's once-only key is made of strings (job_dedupe_key_of).
  insert into public.jobs (tenant_id, kind, due_at, payload)
  values (p_tenant_id, 'piece_make', now(), jsonb_build_object('piece_id', v_id, 'step', 'start', 'tick', '1'));
  return jsonb_build_object('fate', 'begun', 'piece_id', v_id);
end $$;

-- Each re-made door's own words gain the service's part, once.
do $$
declare
  v_fn    text;
  v_said  text;
begin
  foreach v_fn in array array[
    'public.file_start(uuid, uuid)',
    'public.piece_words_keep(uuid, uuid, text)',
    'public.post_approve(uuid, uuid, jsonb)',
    'public.plan_slot_made(uuid, uuid, jsonb)',
    'public.piece_begin(uuid, jsonb, jsonb, text, integer)'
  ] loop
    v_said := coalesce(obj_description(v_fn::regprocedure, 'pg_proc'), '');
    if position('00712' in v_said) = 0 then
      execute format('comment on function %s is %L', v_fn, v_said
        || ' 00712: the service role too, as it makes a week a rung let AI approve; nobody is its actor, a version it writes is made by ai, a placement it approves goes via rung.');
    end if;
  end loop;
  v_said := coalesce(obj_description('public.content_week_approve(uuid, uuid, jsonb)'::regprocedure, 'pg_proc'), '');
  if position('00712' in v_said) = 0 then
    comment on function public.content_week_approve(uuid, uuid, jsonb) is
      'Approve the week (00706; the content loop PRD''s 8.4, canvas call 10), by a member with the settings permission: the snapshot''s slots ({slots: [{id, place, kind, at, file_id, title, intent}]}), each this plan''s, still proposed and as named, go under one approval of subject plan with its hash; a blocked slot or one asking for footage stays. 00712: or by the service at a held week''s time (goes_at reached, not stopped) under a plan_approve rung that still holds or sends it, read again here; nobody is its approver and the rung rides on its snapshot. Answers {fate: approved, approval_id, slots} or {fate: gone | changed | nothing | asks | held | stopped | <status>}.';
  end if;
end $$;

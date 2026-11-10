-- 00585 · An occasion enrols a person (decision 0119, stage 2 of "one timeline per person").
--
-- A moment ran once a day, at its hour, for whoever the day's look named. Three things a business owes a customer cannot be
-- said that way: a reminder two hours before a visit, a word after a visit marked missed, and a follow-up the day after
-- someone was sent the booking link and did not book. Each is owed to one person, for one thing that happened to them, at a
-- time of their own.
--
--   sequence_steps_trigger_check   takes visit_soon, visit_missed and asked_no_booking.
--   sequence_occasions             One row per sequence, person and occasion: what happened (`occasion`, a key the edge
--                                  makes: an appointment at one start, an appointment marked missed, the message that
--                                  carried the link), when its step is due (`due_at`, which never moves) and when it
--                                  is next tried (`try_at`: the same, or later where a run put it off), and what became
--                                  of it (waiting, ran with its batch, or left with why). Unique for good, whatever its state, so a second word about
--                                  the same thing makes no second message, and a message its owner stopped stays stopped.
--                                  It holds no person's words: ids, a key of ids, and closed codes.
--   sequence_occasion_enrol        The service role's: enrols a person for an occasion. A moved visit's older occasions
--                                  leave first (`p_replaces`, what they start with); a moment a person holds one of at a
--                                  time (`p_single`) takes no second while one waits or they are still in the sequence;
--                                  a moment that rests (`p_rest_days`) takes none while another of theirs began inside
--                                  the rest. Answers enrolled, already, busy or gone.
--   sequence_occasions_leave       The service role's: the workspace's waiting occasions that start with a key leave with
--                                  why (a visit cancelled, a Missed taken back), all of them or all but one (`p_except`).
--                                  Answers how many.
--   sequence_occasions_due         The service role's: a workspace's waiting occasions due at p_at, each with its
--                                  sequence's first step as the run reads one, and whether it runs now (`runs`: the
--                                  sequence on, its step running, the workspace not paused). One that does not run is
--                                  answered too, so the job settles it: a row never waits on a sequence that is off.
--   sequence_occasions_hand_out    The service role's: one job (sequence_occasions) for each workspace with one due
--                                  (jobs_hand_out, decision 0115). Nothing calls it until 00586 gives it to the clock.
--   job_kinds                      sequence_occasions, in the bulk lane, once per workspace while one waits or runs.
--   sequence_steps_due             never hands the hourly sweep a step on one of the three: each runs by its occasion
--                                  (00569's form otherwise).
--   contacts_erase_leaves_occasions  An erased person's occasions are deleted with the tombstone.
--
-- Deploy order: either. Nothing writes the table, hands out the job or delivers an event until the build that knows them
-- is live and 00586 is on. Re-runnable.

set local lock_timeout = '3s';

alter table public.sequence_steps drop constraint if exists sequence_steps_trigger_check;
alter table public.sequence_steps add constraint sequence_steps_trigger_check check (trigger in (
  'quiet_30', 'new_week', 'phoned_only', 'everyone_monthly', 'visit_tomorrow', 'visited', 'lapsed',
  'saved_list', 'proposal_waiting', 'lead_first', 'after_step', 'slot_opened',
  'visit_soon', 'visit_missed', 'asked_no_booking'));

create table if not exists public.sequence_occasions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  sequence_id uuid not null,
  contact_id uuid not null,
  occasion text not null,
  due_at timestamptz not null,
  try_at timestamptz not null,
  state text not null default 'waiting',
  why text,
  batch_id uuid,
  created_at timestamptz not null default now(),
  settled_at timestamptz,
  constraint sequence_occasions_state_check check (state in ('waiting', 'ran', 'left')),
  constraint sequence_occasions_occasion_check check (char_length(occasion) between 3 and 120),
  constraint sequence_occasions_why_check check (why is null or char_length(why) between 1 and 60),
  constraint sequence_occasions_left_says_why check (state <> 'left' or why is not null),
  constraint sequence_occasions_settled_is_dated check ((state = 'waiting') = (settled_at is null)),
  constraint sequence_occasions_tried_from_its_time check (try_at >= due_at),
  constraint sequence_occasions_once unique (sequence_id, contact_id, occasion),
  constraint sequence_occasions_tenant_id_id_key unique (tenant_id, id),
  constraint sequence_occasions_sequence_id_same_workspace foreign key (tenant_id, sequence_id)
    references public.sequences (tenant_id, id) on delete cascade,
  constraint sequence_occasions_contact_id_same_workspace foreign key (tenant_id, contact_id)
    references public.contacts (tenant_id, id) on delete cascade,
  constraint sequence_occasions_batch_id_same_workspace foreign key (tenant_id, batch_id)
    references public.sequence_batches (tenant_id, id) on delete set null (batch_id)
);
comment on table public.sequence_occasions is
  'Decision 0119: an occasion a sequence owes a person its first step for (a visit in two hours, a visit marked missed, the booking link sent and nothing booked), when that step is due and what became of it. One row per sequence, person and occasion, for good: served once. Ids, a key of ids and closed codes, never a person''s words.';

-- The clock's read, across workspaces: what waits and is to be tried. Then a workspace's own, soonest first, and each link.
create index if not exists sequence_occasions_due on public.sequence_occasions (try_at) where state = 'waiting';
create index if not exists sequence_occasions_waiting on public.sequence_occasions (tenant_id, due_at) where state = 'waiting';
create index if not exists sequence_occasions_person on public.sequence_occasions (tenant_id, contact_id);
create index if not exists sequence_occasions_batch on public.sequence_occasions (batch_id) where batch_id is not null;

alter table public.sequence_occasions enable row level security;
drop policy if exists sequence_occasions_member_select on public.sequence_occasions;
create policy sequence_occasions_member_select on public.sequence_occasions for select to authenticated
  using (tenant_id in (select m.tenant_id from public.memberships m where m.user_id = (select auth.uid())));
revoke all on public.sequence_occasions from anon, authenticated;
grant select on public.sequence_occasions to authenticated;
grant select, insert, update, delete on public.sequence_occasions to service_role;

create or replace function public.sequence_occasion_enrol(
  p_tenant_id uuid,
  p_sequence_id uuid,
  p_contact_id uuid,
  p_occasion text,
  p_due_at timestamptz,
  p_single boolean default false,
  p_replaces text default null,
  p_rest_days integer default 0
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_made integer;
begin
  if p_occasion is null or p_due_at is null then
    raise exception 'sequence_occasion_enrol: an occasion has a key and a time' using errcode = '22004';
  end if;
  -- Someone erased, or not this workspace's, is enrolled in nothing.
  if not exists (select 1 from public.contacts c
                  where c.id = p_contact_id and c.tenant_id = p_tenant_id and c.erased_at is null) then
    return 'gone';
  end if;
  -- A visit that moved: the occasions made for its other starts leave, so one reminder stands for it.
  if p_replaces is not null and char_length(p_replaces) > 0 then
    update public.sequence_occasions o
       set state = 'left', why = 'moved', settled_at = now()
     where o.sequence_id = p_sequence_id and o.contact_id = p_contact_id and o.state = 'waiting'
       and left(o.occasion, char_length(p_replaces)) = p_replaces and o.occasion <> p_occasion;
  end if;
  -- One at a time, where the moment keeps it so: another of theirs waits here, or they are still in the sequence.
  if p_single and (
       exists (select 1 from public.sequence_occasions o
                where o.sequence_id = p_sequence_id and o.contact_id = p_contact_id
                  and o.state = 'waiting' and o.occasion <> p_occasion)
       or exists (select 1 from public.sequence_enrollments e
                   where e.sequence_id = p_sequence_id and e.lead_id is null
                     and e.contact_id = p_contact_id and e.state = 'in')) then
    return 'busy';
  end if;
  -- A moment that rests between occasions: nothing new while another of theirs here began inside the rest, whatever
  -- became of it. A sequence's own message can be what starts its next occasion (a follow-up that carries the booking
  -- link); the rest is what keeps that from going round.
  if coalesce(p_rest_days, 0) > 0 and exists (
       select 1 from public.sequence_occasions o
        where o.sequence_id = p_sequence_id and o.contact_id = p_contact_id and o.occasion <> p_occasion
          and o.created_at > now() - make_interval(days => p_rest_days)) then
    return 'busy';
  end if;
  insert into public.sequence_occasions (tenant_id, sequence_id, contact_id, occasion, due_at, try_at)
  values (p_tenant_id, p_sequence_id, p_contact_id, p_occasion, p_due_at, p_due_at)
  on conflict (sequence_id, contact_id, occasion) do nothing;
  get diagnostics v_made = row_count;
  return case when v_made > 0 then 'enrolled' else 'already' end;
end $$;
revoke all on function public.sequence_occasion_enrol(uuid, uuid, uuid, text, timestamptz, boolean, text, integer)
  from public, anon, authenticated;
grant execute on function public.sequence_occasion_enrol(uuid, uuid, uuid, text, timestamptz, boolean, text, integer)
  to service_role;
comment on function public.sequence_occasion_enrol(uuid, uuid, uuid, text, timestamptz, boolean, text, integer) is
  'Enrols a person in a sequence for an occasion, due at its own time (decision 0119): once per sequence, person and occasion, for good. p_replaces: what a moved visit''s older occasions start with, which leave as moved. p_single: none while another of theirs waits here or they are still in the sequence. Answers enrolled, already, busy or gone. Service role only.';

create or replace function public.sequence_occasions_leave(
  p_tenant_id uuid, p_starts_with text, p_why text, p_except text default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_left integer;
begin
  if p_starts_with is null or char_length(p_starts_with) < 3 or p_why is null then
    return 0;
  end if;
  update public.sequence_occasions o
     set state = 'left', why = left(p_why, 60), settled_at = now()
   where o.tenant_id = p_tenant_id and o.state = 'waiting'
     and left(o.occasion, char_length(p_starts_with)) = p_starts_with
     -- All but one: a visit's occasions for its other starts, where the one for the start it has now stays.
     and (p_except is null or o.occasion <> p_except);
  get diagnostics v_left = row_count;
  return v_left;
end $$;
revoke all on function public.sequence_occasions_leave(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.sequence_occasions_leave(uuid, text, text, text) to service_role;
comment on function public.sequence_occasions_leave(uuid, text, text, text) is
  'A workspace''s waiting occasions whose key starts with p_starts_with leave with why (decision 0119): a visit cancelled, a Missed taken back. Answers how many. Service role only.';

create or replace function public.sequence_occasions_due(p_tenant_id uuid, p_at timestamptz, p_limit integer)
returns table (
  id uuid, sequence_id uuid, contact_id uuid, occasion text, due_at timestamptz, created_at timestamptz, step jsonb,
  runs boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select o.id, o.sequence_id, o.contact_id, o.occasion, o.due_at, o.created_at,
         to_jsonb(s) || jsonb_build_object('mode', q.mode),
         -- Whether its step runs now. One that does not is answered all the same: the job settles it, so no row waits on
         -- a sequence its owner turned off, or on a step that is gone.
         coalesce(q.state = 'on' and s.state = 'running' and t.status <> 'paused', false)
    from public.sequence_occasions o
    join public.sequences q on q.id = o.sequence_id
    join public.tenants t on t.id = o.tenant_id
    -- A sequence's first step is the row that shares its id (00440).
    left join public.sequence_steps s on s.id = o.sequence_id
   where o.tenant_id = p_tenant_id and o.state = 'waiting' and o.try_at <= p_at
   order by o.try_at, o.id
   limit greatest(coalesce(p_limit, 0), 0)
$$;
revoke all on function public.sequence_occasions_due(uuid, timestamptz, integer) from public, anon, authenticated;
grant execute on function public.sequence_occasions_due(uuid, timestamptz, integer) to service_role;
comment on function public.sequence_occasions_due(uuid, timestamptz, integer) is
  'A workspace''s waiting occasions due at p_at, soonest first, each with when it began, its sequence''s first step and mode as a run reads one, and whether that step runs now (the sequence on, the step running, the workspace not paused): the job settles one that does not (decision 0119). Service role only.';

create or replace function public.sequence_occasions_hand_out(p_at timestamptz, p_spread_seconds integer)
returns integer
language sql
security definer
set search_path = public
as $$
  select public.jobs_hand_out(
    'sequence_occasions',
    -- Every workspace with one due, whether or not its step runs now: the job settles what cannot run, so what is due
    -- here is only ever the last minute's (the partial index sequence_occasions_due).
    array(
      select distinct o.tenant_id
        from public.sequence_occasions o
       where o.state = 'waiting' and o.try_at <= p_at
    ),
    p_spread_seconds
  );
$$;
revoke all on function public.sequence_occasions_hand_out(timestamptz, integer) from public, anon, authenticated;
grant execute on function public.sequence_occasions_hand_out(timestamptz, integer) to service_role;
comment on function public.sequence_occasions_hand_out(timestamptz, integer) is
  'A sequence_occasions job for each workspace with an occasion due at p_at (decision 0119), through jobs_hand_out (0115): none where one already waits or runs. Answers how many it wrote. Service role only.';

insert into public.job_kinds (kind, lane, once_parts, once_kept) values
  ('sequence_occasions', 2, array['@tenant'], false)
on conflict (kind) do update
  set lane = excluded.lane, once_parts = excluded.once_parts, once_kept = excluded.once_kept;

-- 00569's form, but for the three moments an occasion starts: the hourly sweep never runs one.
create or replace function public.sequence_steps_due(
  p_kind text, p_at timestamp with time zone, p_last_hour integer, p_limit integer, p_tenant_id uuid default null::uuid
)
returns table (step jsonb, timezone text, due_total bigint)
language sql
stable
security definer
set search_path to 'public'
as $$
  select to_jsonb(s) || jsonb_build_object('mode', q.mode), z.tz, count(*) over ()
    from public.sequence_steps s
    join public.sequence_steps r on r.id = s.sequence_id
    join public.sequences q on q.id = s.sequence_id
    join public.tenants t on t.id = s.tenant_id
    cross join lateral (select public.safe_zone(coalesce(nullif(btrim(t.timezone), ''), 'America/New_York')) as tz) z
    cross join lateral (select p_at at time zone z.tz as clock) l
   where s.state = 'running' and s.kind = p_kind
     -- A freed time's step runs when an appointment frees a time (decision 0082, 00498), never by the hour; nor does a
     -- step an occasion starts (0119), which runs for each person at their own time.
     and s.trigger not in ('slot_opened', 'visit_soon', 'visit_missed', 'asked_no_booking')
     and (s.kind = 'reach_out' or (r.state = 'running' and q.state = 'on'))
     and t.status <> 'paused'
     and (p_tenant_id is null or s.tenant_id = p_tenant_id)
     and extract(hour from l.clock) between s.run_hour and p_last_hour
     and s.last_run_for is distinct from l.clock::date
   order by s.last_run_at nulls first, s.created_at, s.id
   limit greatest(coalesce(p_limit, 0), 0)
$$;

create or replace function public.sequence_occasions_on_erase()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if NEW.erased_at is not null and OLD.erased_at is null then
    delete from public.sequence_occasions o where o.tenant_id = NEW.tenant_id and o.contact_id = NEW.id;
  end if;
  return null;
end $$;
revoke all on function public.sequence_occasions_on_erase() from public, anon, authenticated;
grant execute on function public.sequence_occasions_on_erase() to service_role;
comment on function public.sequence_occasions_on_erase() is
  'When a person is erased, every occasion a sequence kept for them is deleted (decisions 0036, 0119): none of their steps is still to come, and no key names them.';

drop trigger if exists contacts_erase_leaves_occasions on public.contacts;
create trigger contacts_erase_leaves_occasions
  after update of erased_at on public.contacts
  for each row execute function public.sequence_occasions_on_erase();

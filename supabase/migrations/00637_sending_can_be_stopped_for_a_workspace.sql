-- 00637 · Sending can be stopped for a workspace (Stop everything, as one fact the send door reads).
--
-- Stop everything paused each running sequence through its own door and kept what it paused in the workspace's
-- settings. Nothing at the wire knew a stop stood: a pause that failed, or a campaign already going out, kept sending,
-- and the page said stopped.
--
--   tenants.sending_stopped_at   When the workspace's owner stopped all sending; null while nothing is stopped. Read
--                                where billing's pause (status) is read: at the one send door, in the same row (db
--                                findWireRow, core deliver.ts), at the head of a campaign's batch (db
--                                isSendingStopped), by a queued send, before a post goes up (the edge's recheck) and
--                                before a review is answered in public. A stopped workspace sends nothing by itself;
--                                a person's own reply and the words the rules require (a STOP's confirmation) still
--                                go, and what was going out by itself is held, to go once sending is resumed.
--   sequence_steps_due           A stopped workspace's steps are not due, as a paused one's are not: nothing new starts
--                                while sending is stopped, and its day is still open once it is resumed.
--   sequence_occasions_due       Nor is a stopped workspace's occasion handed: it waits as it is.
--
-- Stop everything writes it first and Resume lifts it last (the dashboard's server, on the service role: a stop may be
-- pressed below settings' own role). No session writes it: a member's update of tenants is by column (name, timezone,
-- appointment_word), and this is none of them. Deploy order: this first; the code that reads or writes the column goes
-- on without it where it is not there yet, so either may ship first. Re-runnable.

set local lock_timeout = '3s';

alter table public.tenants add column if not exists sending_stopped_at timestamptz;
comment on column public.tenants.sending_stopped_at is
  'When the workspace''s owner stopped all sending (Stop everything); null while nothing is stopped. Read beside status wherever a paused workspace is refused (core sendingHoldOf): nothing goes out by itself, a person''s own reply and the words the rules require still go, and what was going out is held for the day sending is resumed. Written by Stop everything and lifted by Resume, on the service role; no session writes it.';

/* ------------------------------------------------------------------------------ the clocks -- */

-- A stopped workspace starts nothing. Its steps are not due while sending is stopped, and are due again, their day
-- still open, once it is resumed: 00598's function with one clause more, beside the pause's.
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
     and t.sending_stopped_at is null
     and (p_tenant_id is null or s.tenant_id = p_tenant_id)
     and extract(hour from l.clock) between s.run_hour and p_last_hour
     and s.last_run_for is distinct from l.clock::date
   order by s.last_run_at nulls first, s.created_at, s.id
   limit greatest(coalesce(p_limit, 0), 0)
$$;
comment on function public.sequence_steps_due(text, timestamp with time zone, integer, integer, uuid) is
  'The running steps of one kind due at p_at by their workspace''s own clock, each with its sequence''s mode (00462), a paused workspace''s never, nor one whose owner stopped all sending (Stop everything), never run first, then least recently run, with due_total the count of all that were due: the hourly sweep''s pages (playbooks_due''s rule, 00245). A customer''s step after the first is due only while its sequence is on (0060).';

-- Nor is an occasion handed while its workspace's sending is stopped: it waits as it is, and is handed once sending is
-- resumed, when the job judges it as it judges any occasion it reaches late. 00598's function with one clause more.
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
     and t.sending_stopped_at is null
   order by o.try_at, o.id
   limit greatest(coalesce(p_limit, 0), 0)
$$;
comment on function public.sequence_occasions_due(uuid, timestamptz, integer) is
  'A workspace''s waiting occasions due at p_at, soonest first, each with when it began, its sequence''s first step and mode as a run reads one, and whether that step runs now (the sequence on, the step running, the workspace not paused): the job settles one that does not (decision 0119). None is handed while its workspace''s sending is stopped (Stop everything): they wait as they are. Service role only.';

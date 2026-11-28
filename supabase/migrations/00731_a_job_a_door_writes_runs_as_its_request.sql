-- 00731 · A job a door writes runs as its request (the outside review of 28 Nov 2026, R1.12 and M5: one id that follows
-- an act across every job and service it touched; lane 8 of the whole-system plan).
--
-- A job written from TypeScript carries the name of the request it was written in (packages/jobs schedule.ts stamps
-- `request_id` into its payload), and the runner runs it under that name, so an owner's press, the send it queued and
-- the send's own lines are one search. A job a SQL door writes did not: the press that approved a post, a webhook
-- whose door queued the reply, an event's delivery to its subscriber. Each such job ran as its own row id, and the act
-- that started it could not be followed past the door.
--
--   jobs_take_their_kind   re-made from 00526's body. New: a payload that names no request takes the one the insert
--                          serves (request_id_of_caller(), 00277: the header the database client sends on every call,
--                          the same name events.request_id takes), after the once-only key is written, so no key
--                          changes. A clock's own SQL (pg_cron) sends no header and its jobs run as themselves, as
--                          before. A payload that already names a request keeps it: a job a job schedules carries the
--                          request that started the chain.
--
-- No table, no column, no grant: jobs.payload carries it, as it does for a job TypeScript writes. Re-runnable. Deploy
-- order: either (the runner already reads payload.request_id).

set local lock_timeout = '3s';

create or replace function public.jobs_take_their_kind()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_kind public.job_kinds;
  v_request text;
begin
  select * into v_kind from public.job_kinds k where k.kind = NEW.kind;
  -- A kind with no row is refused by the foreign key, in its own words.
  if not found then
    return NEW;
  end if;
  NEW.lane := case
    when NEW.kind = 'event_deliver' and NEW.payload ->> 'lane' ~ '^[0-2]$' then (NEW.payload ->> 'lane')::smallint
    when v_kind.lane = 0 and coalesce(NEW.payload ->> 'purpose', '') = 'outreach' then 2
    else v_kind.lane
  end;
  if NEW.dedupe_key is null then
    NEW.dedupe_key := public.job_dedupe_key_of(NEW.kind, NEW.tenant_id, NEW.payload);
  end if;
  NEW.dedupe_kept := v_kind.once_kept and NEW.dedupe_key is not null and NEW.dedupe_key not like 'requeue:%';
  -- The request this insert serves, after the key: the job runs as the act that wrote it (00731).
  if jsonb_typeof(NEW.payload) = 'object' and not (NEW.payload ? 'request_id') then
    v_request := public.request_id_of_caller();
    if v_request is not null then
      NEW.payload := NEW.payload || jsonb_build_object('request_id', v_request);
    end if;
  end if;
  return NEW;
end $$;
revoke all on function public.jobs_take_their_kind() from public, anon, authenticated;
comment on function public.jobs_take_their_kind() is
  'Before every insert into jobs, whoever writes it: the lane and the once-only key from the kind''s job_kinds row (00526), and the request the insert serves stamped into a payload that names none (00731, request_id_of_caller), so a job a SQL door writes runs as the act that wrote it.';

-- 00333 · The claim counts capacity, and every lane takes turns.
--
-- Decision 0031, step 4. claim_due_jobs (00281) took the lowest lane first, then within bulk a workspace with no bulk
-- job running, then the earliest due. Lanes 0 and 1 had no turn-taking: a burst of one workspace's pushes queued ahead
-- of another workspace's reply. And nothing counted how many jobs of one provider, one domain or one workspace were in
-- flight: the runner is several overlapping serverless invocations with no shared memory, so a count can live only in
-- the claim. Now:
--
--   job_capacity     (scope, key, max_in_flight): how many jobs naming a key may be fired under a live lease at once. A
--                    job names the keys it spends in its payload (capacity: ["provider:meta", "domain:<id>"]); the claim
--                    skips a row whose key is full, and takes it on a later tick when a slot frees. A key no row names is
--                    no limit, so a key added to a payload before its row is a no-op, never a stall; an older edge's jobs
--                    carry no keys and are never skipped.
--   turns            within every lane, a workspace with nothing of that lane running goes first, then the earliest due:
--                    the clause 00281 wrote for bulk, for every lane. Fairness is not priority: a reply still goes before
--                    every bulk job; what changes is whose reply goes first when one workspace bursts.
--
-- The order stays 00281's otherwise, and the claim's cost is the gate: measured on the replayed stack with 30,000 due
-- rows (jobs/jobs-lanes.db.test.mjs says the cases; the pull request says the number). The reach-out sender's own
-- per-domain count (apps/edge/lib/reach-out/sender.ts) stays until its sends are jobs, which decision 0029's Phase 4
-- makes them; it is not a jobs row today, so no domain row replaces it yet.
--
-- Either deploy order: a table nobody fills, and clauses that change nothing for a row that names no key. Re-runnable.

set local lock_timeout = '3s';

/* -------------------------------------------------------------------------------- 1. capacity -- */

create table if not exists public.job_capacity (
  scope          text not null check (scope in ('workspace', 'provider', 'domain')),
  key            text not null,
  max_in_flight  integer not null check (max_in_flight > 0),
  created_at     timestamptz not null default now(),
  primary key (scope, key)
);
alter table public.job_capacity enable row level security;
revoke all on public.job_capacity from anon, authenticated;
grant all on public.job_capacity to service_role;
comment on table public.job_capacity is
  'How many jobs naming a capacity key (scope:key in payload.capacity) may be fired under a live lease at once (00333, decision 0031): counted in claim_due_jobs, nowhere else. A key with no row is no limit. The service role''s alone.';

/* --------------------------------------------------------------------------------- 2. the claim -- */

create or replace function public.claim_due_jobs(p_limit integer, p_lease_seconds integer)
returns setof public.jobs
language sql
security definer
set search_path = public
as $$
  with
  -- What is running: fired under a live lease, with the capacity keys each spends. Read once, not per row.
  running as (
    select r.tenant_id, r.lane, k.key
      from public.jobs r
      left join lateral jsonb_array_elements_text(
        case when jsonb_typeof(r.payload -> 'capacity') = 'array' then r.payload -> 'capacity' else '[]'::jsonb end
      ) as k(key) on true
     where r.state = 'fired'
       and r.fired_at > now() - make_interval(secs => p_lease_seconds)
       and r.lease_until >= now()
  ),
  -- The keys that are full: as many running as the row allows.
  full_keys as (
    select c.scope || ':' || c.key as key
      from public.job_capacity c
      join (select key, count(*) as n from running where key is not null group by key) u
        on u.key = c.scope || ':' || c.key
     where u.n >= c.max_in_flight
  ),
  -- The workspaces with work of each lane running: they wait their turn behind those with none.
  busy as (
    select distinct tenant_id, lane from running where lane is not null
  ),
  due as (
    select c.id
      from public.jobs c
     where ((c.state = 'scheduled' and c.due_at <= now())
         or (c.state = 'fired' and c.lease_until < now()))
       -- A row naming a full key waits. Judged cheaply: no key is full (read once), or the row names none, before its
       -- keys are unpacked.
       and (not exists (select 1 from full_keys)
            or not (c.payload ? 'capacity')
            or not exists (
              select 1
                from jsonb_array_elements_text(
                  case when jsonb_typeof(c.payload -> 'capacity') = 'array' then c.payload -> 'capacity' else '[]'::jsonb end
                ) as k(key)
               where k.key in (select f.key from full_keys f)
            ))
     order by c.lane nulls last,
              -- false before true: within the lane, a workspace with nothing of that lane running goes first. Read
              -- once and hashed, not per row (00281's clause, for every lane).
              (c.tenant_id, c.lane) in (select b.tenant_id, b.lane from busy b),
              c.due_at
     limit p_limit
       for update of c skip locked
  )
  update public.jobs j
     set state       = 'fired',
         fired_at    = now(),
         attempts    = j.attempts + 1,
         lease_until = now() + make_interval(secs => p_lease_seconds)
    from due
   where j.id = due.id
  returning j.*
$$;
revoke all on function public.claim_due_jobs(integer, integer) from public, anon, authenticated;
grant execute on function public.claim_due_jobs(integer, integer) to service_role;
comment on function public.claim_due_jobs(integer, integer) is
  'The only way a job becomes fired. Concurrent ticks take different rows (skip locked). Takes the lowest lane first (decision 0018: a reply, then someone waiting, then bulk); within a lane a workspace with nothing of that lane running goes first (00333), then the earliest due; a row naming a capacity key that is full is left for a later tick (job_capacity). Takes back a fired row whose lease ran out with attempts + 1.';

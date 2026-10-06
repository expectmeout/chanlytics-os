# 0033 · The ledger wakes when a due row is written, and the claim counts capacity

**Status:** Built, steps 1, 2 and 4 (6 October 2026, 00333 and 00335): the wake, the dedupe key, capacity and turns in
the claim. Decided on 6 October 2026 (Ruben: "all approved"), with 0031, and proposed the same day; step 3, the three
indexes retiring, waits on the dedupe key's index covering what they cover (found on 6 October 2026: they hold a
subject once in every state but failed, the key's index only while scheduled or fired), and the reach-out sender keeps its own count until its sends are jobs (0031, Phase
4). Written against commit `b9a4d5c` (main, 5 October 2026) and verified against the code at it, and read again at
`6a8e85f` (main, 6 October 2026), since which 0028's merge door (00326) and the message-status notice (00327) are in the
code. Nothing of it is built; the two changes the trace proposed in the ledger's neighbourhood that this note declines
are recorded under Decision. Where this note and the code disagree, the code wins.

## Context

### The runner is polled, and only lane 2 takes turns

pg_cron asks every ten seconds whether a job is due or a lease ran out, and calls `/api/jobs/tick` through pg_net
when one is (`trigger_jobs_tick`, 00098; `request_sweep`, 00086). Nothing wakes the runner when a job is written:
`scheduleJob` is a plain insert (`packages/jobs/src/schedule.ts`). A member's reply is due fifteen seconds after Send
(`SEND_GRACE_MS`, `packages/core/src/conversations/reply.ts`), then waits for the next poll, a cold start and the
claim: on the order of fifteen to twenty-seven seconds in all.

`claim_due_jobs` (00281) takes the lowest lane first, then within lane 2 a workspace with no bulk job running, then
the earliest due, under `SKIP LOCKED`. Lanes 0 and 1 have no fairness clause: a burst of `push_send` or `email_ingest`
from one workspace queues ahead of another workspace's reply. The runner claims one job at a time, for three slots,
only in its first twenty seconds, under a ninety-second lease (`packages/jobs/src/ledger.ts`), and nothing counts how
many jobs of one workspace, one provider or one sending domain are in flight; the reach-out sender keeps its own count
in code (`CLAIM_PER_DOMAIN_PER_TICK`, `apps/edge/lib/reach-out/sender.ts`).

### Three idempotency rules for ten kinds

Three partial unique indexes make three kinds once-only: `jobs_email_ingest_uq`, `jobs_lead_collect_once` and
`jobs_reply_read_once`, each over two payload fields and `where state <> 'failed'`, so a failed row never blocks a
replay (00135). `scheduleJobOnce` reads a 23505 as `already_scheduled`. The other seven kinds have no rule; a caller
that must not schedule twice (a reminder for one appointment, a step of one run) would add a fourth index.

### What 0018 already decided, and the trace got wrong

The wiring trace of 5 October 2026 proposed moving `push_send` out of lane 0 and adding a `(lane, due_at)` index.
Both are declined here. 0018 put a member's push in lane 0 because a handoff push is a customer waiting, which is the
lane's definition; the remedy for one workspace's burst is fairness, below. And 00281's header records why the index
was not built: the claim sorts the due set either way, measured at 2.2 ms with 3,000 due rows, so the index would not
change the plan.

## Decision

1. **Wake on insert.** A statement trigger on `jobs` calls `request_sweep('jobs', '/api/jobs/tick')` when a row due
   now, or within the two seconds the knock takes to arrive, is written, debounced by `sweep_status.woken_at` to at
   most one request a second and never waiting on another asker (the row is taken with `skip locked`). The ten-second
   poll stays as the backstop, and a tick that finds nothing costs what it costs today. Built as 00333, which narrowed
   the window from the poll's interval: the runner's claim loop ends on its first empty claim (`packages/jobs/src/tick.ts`),
   so a knock before a row is due is a knock wasted, and `requested_at` could not be the debounce, since the poll's
   own look moves it every ten seconds.
2. **One dedupe key.** `jobs.dedupe_key text`, with a partial unique index over scheduled and fired rows. The three
   bespoke indexes retire once the key's index covers what they cover, and every caller writes the key. A caller that
   must schedule once passes the key; `scheduleJobOnce` reads the one 23505.
3. **Capacity in the claim.** `job_capacity (scope, key, max_in_flight)`: a scope is `workspace`, `provider` or
   `domain`, counted in `claim_due_jobs` against fired rows under a live lease. A job names the keys it spends in its
   payload (`capacity: ["provider:meta", "domain:<id>"]`); the claim skips a row whose key is full. The runner is
   several overlapping serverless invocations with no shared memory, so the count lives in the claim and nowhere else.
4. **Fairness in every lane.** The clause 00281 wrote for lane 2 (a workspace with no bulk job running goes first)
   extends to lanes 0 and 1: within a lane, a workspace with nothing of that lane running goes first, then the
   earliest due.
5. **The lanes stay as 0018 set them,** and the poll stays; the claim's order stays what 00281 says.

## Shape

```sql
alter table public.jobs add column if not exists dedupe_key text;
create unique index if not exists jobs_dedupe_live on public.jobs (dedupe_key)
  where dedupe_key is not null and state in ('scheduled', 'fired');

create table public.job_capacity (
  scope          text not null check (scope in ('workspace', 'provider', 'domain')),
  key            text not null,
  max_in_flight  integer not null check (max_in_flight > 0),
  primary key (scope, key)
);

-- The wake, as 00333 built it: a row due within two seconds asks for a tick, at most once a second, never waiting.
-- (00334 moved the ask into ask_for_tick(), which the outbox's wake shares; jobs_wake keeps the two-second test.)
create or replace function public.jobs_wake() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from new_rows r where r.state = 'scheduled' and r.due_at <= now() + interval '2 seconds') then
    return null;
  end if;
  perform 1 from public.sweep_status s
    where s.sweep = 'jobs' and (s.woken_at is null or s.woken_at < now() - interval '1 second')
      for update skip locked;
  if not found then return null; end if;
  update public.sweep_status set woken_at = now() where sweep = 'jobs';
  perform public.request_sweep('jobs', '/api/jobs/tick');
  return null;
end $$;
create trigger jobs_wake after insert on public.jobs
  referencing new table as new_rows for each statement execute function public.jobs_wake();
```

The claim gains, in its `where`, "no capacity key of this row is full", and in its `order by`, the per-workspace
clause for every lane. 0018's own measurement is the gate: the claim with the new clauses must still answer in a few
milliseconds at 30,000 due rows on the replayed stack.

## Steps

**1 · The wake.** Built, 00333: the trigger and nothing else; `late_ms` in the tick's log line
(`packages/jobs/src/tick.ts`) and `job_lag_ms` on the day (00332) are the numbers that show it. _Both orders:_ SQL
alone; an edge that is not deployed answers the knock as it answers pg_cron's.

**2 · The dedupe key.** Built, 00333: the column and the index; `scheduleJobOnce` writes the key beside its payload
for the three kinds, and writes none to a database that has no column yet; the three indexes stay one release. _Both
orders:_ an older edge writes no key and trips the old index as today.

**3 · The three indexes retire.** Not yet: each holds its subject once in every state but `failed`, so an email
replayed after its intake is done, a lead batch after its collect, or a read after its reply, schedules nothing, while
`jobs_dedupe_live` holds a key only while the row is scheduled or fired. Dropped as they are, a replay after the job
finished would run it again. They retire when a key's index covers a finished row too, for the kinds that need it,
and every writer carries the key. _Both orders:_ every writer carries the key.

**4 · Capacity and fairness in the claim.** Built, 00335: the table, the clauses, `jobs/jobs-lanes.db.test.mjs`
grown by the cases below. The reach-out sender's per-domain count is not a jobs row today
(`apps/edge/lib/reach-out/sender.ts` claims `reach_out_sends` itself), so no `domain` row replaces it until its sends
are jobs (0031, Phase 4). _Both orders:_ an older edge's jobs carry no capacity keys and are never skipped.

## Tests

- **The wake** (`database/*.db.test.mjs`): a due row written requests one tick; two written within a second request
  one; a row due in a minute requests none.
- **The key**: two schedules with one key leave one row; a failed row with the key lets a third through.
- **Capacity and fairness** (`jobs/jobs-lanes.db.test.mjs`): a provider key at its cap leaves the next row of that key
  unclaimed and claims the next of another; two workspaces' replies alternate in lane 0 when one has a burst; the order
  0018's cases pin is unchanged.
- **The claim's cost**: the measurement 0018 made, repeated with the new clauses, in the pull request.

## Risks

- **A trigger that asks pg_net on every insert** is held to one request a second by `requested_at`; the poll covers a
  request that pg_net lost.
- **A capacity key nobody fills** is no limit: the claim treats a missing row as unlimited, so a key added to a payload
  before its row is a no-op, never a stall.
- **Fairness is not priority.** A reply still goes before every bulk job; what changes is which workspace's reply
  goes first.

## Open questions

1. Should capacity keys be declared by the kind (in contracts, beside its lane) or by the caller in the payload? This
   note says the payload, since a domain's key is the send's own.
2. Is one request a second the right debounce, or should the wake carry how many rows are due so a burst asks for
   more slots?

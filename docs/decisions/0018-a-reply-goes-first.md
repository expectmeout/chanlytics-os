# 0018 · A reply goes first, and each workspace takes its turn

**Status:** Accepted by Ruben, 28 Sep 2026. Decided, and step 1 built with the note; steps 2 and 3 follow, and step 4 only if step 1's numbers ask for
it. Written against commit `d1ae74ff` (main, 27 September 2026, after #1175 merged), and every file and line below was
read at it. Ruben left the three open questions to be settled by analysis; the answers close the note, and the third
turned Decision 4 from an exclusion into an order. Where this note and the code disagree, the code wins. It is the
design the plan `docs/plans/2026-09-27-frontend-performance-scale.md` asks for before any code (§2, 36 ·
Scalability: "Lanes and fairness … A design note first: it is the ledger every send goes through"). The next free
number was 0017, which #1197 took for a lead's reply, so this note takes 0018.

## Context

### One queue, first due first served

Every job, of every kind and every workspace, is claimed by one function in one order:
`claim_due_jobs` (`supabase/migrations/00098_time_lives_in_the_row.sql:63-86`) takes the rows that are due, or whose
lease ran out, `order by due_at limit p_limit for update skip locked` (`:74-76`). Nothing else decides what runs next.

The runner claims one job at a time, just before it runs it (`packages/jobs/src/tick.ts:71-87`; `claimNext` asks for
`p_limit: 1`, `packages/jobs/src/ledger.ts:169-170`), and only in its first twenty seconds (`CLAIM_FOR_MS`,
`ledger.ts:36`). Each job runs to its end before the next is claimed: a broadcast batch may run until 45 seconds into
the runner's minute (`YIELD_AT_MS`, `:43`) and a lead job until 52 (`LEAD_YIELD_AT_MS`, `:69`). pg_cron asks every ten
seconds whether
anything is due and calls the runner when it is (`trigger_jobs_tick`, 00098 `:132-158`), with no wait for the last
call to end (`request_sweep`, `supabase/migrations/00086_watch_every_sweep.sql:45-76`), so several runners overlap,
each working one job at a time. That is the whole of the ledger's concurrency, and it is shared by everyone.

The one-at-a-time claim is load-bearing and this note keeps it: "claimed" must mean "started", because a second claim
of a send is judged as a run that died mid-send (`verdictFor`, `ledger.ts`; the header of `tick.ts` says why).

### What waits in it

| Kind                                             | Scheduled by                                                                                                                                                                                                                                                                                            | Who is waiting                     |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| `outbound_send`                                  | A member's reply, 15 seconds after Send (`SEND_GRACE_MS`, `packages/core/src/conversations/reply.ts:23`, scheduled at `:510`)                                                                                                                                                                           | The customer                       |
| `outbound_send`                                  | The receptionist's held reply, when the hold window or the confidence dial holds it (`apps/edge/lib/receptionist/draft-queue.ts:65`, from `whatsapp/persist.ts:106`) or an owner steered it (`api/admin/steer.ts:168`)                                                                                  | The customer                       |
| `outbound_send`                                  | A reach-out email, `purpose: "outreach"` (`apps/edge/lib/reach-out/sender.ts:403`), at most five per sending domain per minute's clock (`CLAIM_PER_DOMAIN_PER_TICK`, `:70`)                                                                                                                             | Nobody in particular               |
| `email_ingest`                                   | An email arriving (`apps/edge/api/resend-webhook.ts:110`)                                                                                                                                                                                                                                               | A customer, until a person sees it |
| `push_send`                                      | A member's phone told something (`apps/edge/lib/ops/notify.ts:239`)                                                                                                                                                                                                                                     | A member                           |
| `line_provision`                                 | An owner setting up a texting line (`apps/edge/lib/lines/line-ops.ts:245`)                                                                                                                                                                                                                              | The owner                          |
| `broadcast_send`                                 | A broadcast approved or a playbook's run (`apps/dashboard/src/server/ports/campaign-ports.ts:87`, `:151`; `apps/edge/lib/playbooks.ts:301`), then each batch its own next one, due at once (`packages/core/src/messages/broadcast.ts:296`) or, when WhatsApp throttled it, after a wait (`:370`, 00216) | Nobody in particular               |
| `lead_round_start`, `lead_collect`, `lead_check` | The lead finder (`packages/core/src/leads/runner.ts`), each job scheduling the next                                                                                                                                                                                                                     | Nobody in particular               |
| `push_receipts`                                  | A push sent, to read its receipts later (`packages/jobs/src/handlers.ts:225`)                                                                                                                                                                                                                           | Nobody                             |

A broadcast holds one job at a time, 25 recipients with 300 ms between sends (`BROADCAST_CHUNK`, `BROADCAST_GAP_MS`,
`packages/contracts/src/broadcasts/broadcasts.ts:63-64`), and schedules the next batch due the moment it ends, unless
WhatsApp throttled it. So a broadcast that is sending is always one due job, queued behind whatever fell due before its
batch ended and ahead of whatever falls due after.

### What this allows

A member presses Send. Fifteen seconds later the reply is due, behind every job due before it, of every workspace.
When the ledger is quiet that costs nothing. When it is not, the reply waits for the work ahead of it:

- **Bulk work ahead of a reply.** Ten broadcasts sending at once are ten jobs always due, each re-queued due-now as its
  batch ends. A batch of 25 at 300 ms plus the wire's own time is on the order of fifteen seconds, and a runner claims
  for twenty, so each runner works about two batches and a new one starts every ten seconds: about one batch every
  five seconds, platform-wide. A reply due behind ten such jobs waits on the order of a minute past its fifteen
  seconds, and behind fifty, several. Lead jobs, at up to 52 seconds each, weigh more. These are estimates from the
  constants; nothing measures them today (below).
- **One workspace ahead of the others.** Nothing limits how many of the due jobs are one workspace's. Each sending
  broadcast is one job in every round of the queue, so a workspace with five broadcasts takes five turns for each one
  a workspace with one broadcast takes, and a lead round's jobs, at up to 52 seconds, take the longest turns of all.
- **Nothing measures it.** The runner logs its counts once per heartbeat (`jobs_tick`, `apps/edge/api/jobs/tick.ts`;
  `packages/jobs/src/tick.ts` `TickCounts`): claimed, done, failed, given up and deferred. How late a job was
  claimed, against when it was due, is logged nowhere, so a reply waiting a minute looks exactly like one that went at
  once.

The ledger's indexes follow the one order: `jobs_due_scheduled` on `due_at` where scheduled
(`supabase/migrations/00002_conversations.sql:209`), `jobs_lease_due` on `lease_until` where fired (00098 `:53`).

## Decision

1. **Measure first.** Every first claim knows how late it is: now, less the row's `due_at`. The runner keeps the worst
   per kind in its heartbeat's counts, so `jobs_tick` says how long replies waited before any claim order changes. A
   row's later claim is a retry or a lease that ran out, not a wait in the queue, and is not counted.
2. **Three lanes, decided in one place.** A job's lane follows from its kind and, for `outbound_send`, its purpose:
   - **reply**: `outbound_send` that is not outreach, `email_ingest`, `push_send`: someone is waiting on it;
   - **setup**: `line_provision`: an owner is waiting, but not a customer;
   - **bulk**: `broadcast_send`, `outbound_send` with `purpose: "outreach"`, the three lead kinds, `push_receipts`.

   The lane is a column of the row, generated from the kind and payload in SQL, so every writer keeps writing what it
   writes today and the rule has one home. A new kind names its lane in the same change as its handler, its caller and
   the `jobs.kind` CHECK (`CLAUDE.md`, the rules).

3. **The claim takes the earliest-due reply first**, then setup, then bulk: `order by lane, due_at`. A reply waits
   only for replies due before it, and for a runner to be free: when every running one is busy, the next heartbeat
   starts one within ten seconds, and its first claim is the reply.
4. **A workspace's second bulk job goes after everyone else's first.** Within bulk, the claim takes a row whose
   workspace has no bulk job running before one whose workspace has, and only then by due time. So a second
   workspace's broadcast is claimed before the first workspace's second batch, and when no other workspace's bulk work
   is due, a workspace's own jobs still run side by side: fairness is an order, never a wait. Running means claimed
   within the last lease and not finished. A job that threw and is kept for a later try (`deferJob`) counts until its
   claim's lease would have ended, at most 90 seconds (`LEASE_SECONDS`): it lowers its own workspace's place, and no
   other's.
5. **The runner keeps one job at a time.** More runners at once, or several jobs per runner, is a later step, taken
   only if step 1's numbers show replies still waiting once they go first.

## Shape

The column, generated and stored, so no writer changes:

```sql
alter table public.jobs add column if not exists lane smallint generated always as (
  case
    when kind in ('outbound_send', 'email_ingest', 'push_send')
         and coalesce(payload->>'purpose', '') <> 'outreach' then 0
    when kind = 'line_provision' then 1
    when kind in ('broadcast_send', 'outbound_send', 'lead_round_start', 'lead_collect', 'lead_check',
                  'push_receipts') then 2
  end
) stored;
```

A kind the `case` does not name has no lane (null). The claim orders nulls last (`order by lane nulls last, due_at`),
and a database test holds the `case` to the `jobs.kind` CHECK: every kind in the one is named in the other, so a new
kind without a lane fails the build, not the queue.

The claim, with the lane order and, within bulk, the fairness order (false sorts before true):

```sql
with due as (
  select c.id
    from public.jobs c
   where (c.state = 'scheduled' and c.due_at <= now())
      or (c.state = 'fired' and c.lease_until < now())
   order by c.lane nulls last,
            c.lane = 2 and exists (
              select 1 from public.jobs r
               where r.tenant_id = c.tenant_id
                 and r.lane = 2
                 and r.state = 'fired'
                 and r.fired_at > now() - make_interval(secs => p_lease_seconds)
                 and r.id <> c.id),
            c.due_at
   limit p_limit
   for update of c skip locked
)
update public.jobs j …   -- unchanged from 00098
```

`fired_at` within the lease is what "running" means: a claim stamps it (00098 `:80`), and `deferJob` moves the lease,
not `fired_at`, so a kept row stops counting as running once its claim's lease would have ended.

The indexes the new order reads: `(lane, due_at) where state = 'scheduled'` beside `jobs_due_scheduled`, and
`(tenant_id, fired_at) where state = 'fired' and lane = 2` for the fairness look-up. The table they index is small:
00215 deletes a finished job a week after it ends.

The runner's counts carry the worst lateness per kind (`TickCounts.lateMs`, step 1), and the heartbeat's line one
field per kind, `late_ms_<kind>`. Kinds, not lanes, so the TypeScript side never decides a lane: the lane stays SQL's
alone. `outbound_send` is both a reply and outreach, so its number is the worse of the two; the lane column lets the
line split it, if that ever matters.

## Steps

The two apps deploy independently, so each step is correct whichever goes first.

**1 · Measure (built with this note).** `runTick` records `now - due_at` for each first claim and keeps the worst per
kind in `TickCounts.lateMs`; the edge's `jobs_tick` line carries each as `late_ms_<kind>` (its event name does not
change), and its answer to pg_net keeps the counts alone. _Both orders:_ only the edge's runner changes; the database
is untouched.

**2 · Lanes.** A migration adds the column, its index, and `claim_due_jobs` ordered by lane. _Both orders:_ the
column is generated, so an old writer's row gets its lane; an old runner calls the same function and gets its rows in
the new order.

**3 · Fairness.** A migration replaces `claim_due_jobs` with the bulk order, and adds its index. _Both orders:_ SQL
alone.

**4 · Only if step 1 says so.** Several jobs per runner, or a runner for replies alone. A note of its own if taken.

## Tests

- **The runner** (built with step 1):
  - `jobs/jobs-tick.test.mjs`, fakes for the ports: a first claim ten seconds late is counted ten seconds late under
    its kind, the worst of a kind is kept, a claim before its due time waited none, a row's second claim is not
    counted, and a due time that cannot be read is no wait rather than NaN;
  - `jobs/jobs-tick-door.test.mjs`, the real door over the fake ledger: a reply due thirty seconds ago puts about
    thirty seconds on the heartbeat's line as `late_ms_outbound_send`, and the answer to pg_net keeps its counts
    alone.
- **The claim** (`jobs/jobs-lanes.db.test.mjs`, against the replayed stack):
  - a reply due now is claimed before a broadcast batch due a minute ago, and a setup job before a lead job;
  - outreach is bulk and a member's reply is a reply, both `outbound_send`;
  - every kind in the `jobs.kind` CHECK has a lane, read from the catalogue, not from a list in the test;
  - workspace A with three due bulk jobs and B with one due later: with A's first running, the next claim is B's,
    and the one after is A's second, since the order never leaves a runner idle;
  - a kept row (deferred, lease in the future) lowers its workspace's place until its claim's lease would have ended,
    and no longer;
  - a lease that ran out is still taken back, in its lane's order.
- **The contract** (`repo/ops-hygiene.test.mjs` already holds `LEASE_SECONDS` to the ceiling): the fairness window is
  the lease the runner passes, so the two cannot drift.

## Risks

- **Bulk waits while replies are due.** Replies are paced by people and each is one send; a flood of them is the case
  the lanes exist for. Step 1's numbers show whether bulk lateness grows, and an aging rule (bulk more than N minutes
  late ranks as setup) is the answer if it does.
- **Fairness is not serialized.** Two runners claiming at the same instant can each take a bulk job of the same
  workspace: the look-up is not locked. It softens the order for one claim and changes nothing else; every job is
  still claimed once.
- **The order costs a look-up per due bulk row.** The claim asks, for each bulk row that is due, whether its workspace
  has one running: one probe of the partial index each. With a week of rows (00215) and bulk work paced as it is, that
  is tens of probes a claim; a backlog of thousands would make it thousands, and step 1's numbers would show it
  first.
- **The column rewrites the table.** Adding a stored generated column rewrites `jobs` under an exclusive lock. After
  00215 the table holds about a week of finished rows, so the rewrite is short. The migration says to apply it
  off-peak, and sets a lock timeout: if a claim holds the table, the migration fails and is run again, rather than
  queueing every claim behind it.

## Answers (27 September)

Ruben left the note's open questions to be settled by analysis. They are:

1. **`push_send` is a reply.** It tells a member that a customer is waiting, and it is one quick call; a minute behind a
   broadcast is a minute more the customer waits for a person.
2. **Outreach is bulk.** Nobody waits on a cold email, and it is already paced per sending domain
   (`CLAIM_PER_DOMAIN_PER_TICK`). Put with replies, a burst of it could hold one up.
3. **Fairness holds only while another workspace's bulk work is due.** Written as an order rather than an exclusion
   (Decision 4), it is no harder to write or to test: a workspace's second bulk job sorts after every other
   workspace's first, and still runs when nothing else is due, so the rule never leaves a runner idle. The proposal's
   exclusion did, and its risk that one busy workspace's broadcast and lead round would alternate is gone with it.

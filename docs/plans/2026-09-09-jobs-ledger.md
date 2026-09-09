# The Jobs Ledger, End to End — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close every way a deferred action can be lost without anyone noticing, so that "scheduled" always ends in fired, canceled or failed — and never in silence.

**Architecture:** No new sweep and no new route. The stale-jobs sweep shipped in #256 already runs every quarter hour, already authenticates, already alerts through the tenant's own runtime. It gains a second query over the other half of the ledger, and one migration adds the counter that bounds recovery.

**Tech Stack:** Postgres + pg_cron, Upstash QStash, vanilla Vercel functions on `apps/edge`, `node:test` with `tsx`.

**Shell:** every command below is bash (Git Bash on Windows).

---

## 1. What was audited, and what is already sound

I read the whole subsystem before proposing anything: the table and its indexes, `scheduleJob` / `cancelJob` / `cancelJobsFor`, `api/jobs/fire.ts`, `claim_job` and `fail_job`, all five handlers, the sweep from #256, and QStash's published retry, deduplication and dead-letter behaviour.

Four things I expected to be loose are not, and are recorded here so nobody re-checks them:

- **The three lists of job kinds agree.** The SQL `CHECK`, `JOB_KINDS` in contracts and the `HANDLERS` map all hold the same five. `00058_job_kinds_truth.sql` narrowed the constraint from the original nine, and `enums-vs-checks.test.mjs` pins the two lists against each other. There are no dead kinds.
- **The index for the new query already exists.** `jobs_due_scheduled on public.jobs (due_at) where state = 'scheduled'` (`00002:209`) is exactly the partial index the overdue read needs. No index work.
- **`claim_job` is a real exactly-once gate.** `select … for update`, then `state <> 'scheduled'` refuses. A duplicate delivery cannot double-fire, which is what makes re-publishing safe below.
- **A lost `qstash_id` link is already understood.** `schedule.ts` documents it: the job fires either way; the column only lets `cancelJob` withdraw the message, so losing it costs a redundant fire, not a lost one.

## 2. Every way a job can be lost

| | Failure | Row ends in | Visible today? |
|---|---|---|---|
| A | `publishJSON` throws | `failed`, and the caller is thrown to | yes |
| B | publish ok, `qstash_id` link write fails | `scheduled`, fires anyway | logged, documented |
| C | **QStash exhausts its retries → dead-letter queue** | **`scheduled`, overdue** | **no** |
| D | **`fire.ts` answers 401 (bad signature)** | → C | **no** |
| E | **QStash signing keys rotated and not updated on the edge** | → C, **for every job in the system** | **no** |
| F | `claim_job` errors | 500, QStash retries; claim is idempotent | yes |
| G | already fired or canceled | 200 skipped | yes |
| H | handler throws | `fail_job` + alert | yes |
| I | lambda dies mid-handler | `fired`, for ever | **fixed in #256** |
| J | unknown kind | `fail_job` | yes |
| K | **a `broadcast_send` link in the self-scheduling chain is lost** | job per C or I; **the broadcast stays `sending`** | **no** |

C, D and E are one bug with three causes: **nothing reads `due_at`.** `grep due_at apps/edge` returns nothing. A job whose message never arrives stays `scheduled` past its time for ever, and #256's sweep filters `state = 'fired'` and walks straight past it.

**E is the one that should decide the priority.** If the QStash signing keys are rotated in Upstash and not updated on the edge, every job in the product answers 401, every message lands in the dead-letter queue, and **the entire deferred-work system stops with no signal at all** — no reply ever sends, no snooze ever wakes, no pause ever expires. Today that is indistinguishable from a quiet week.

## 3. The design, and the evidence behind each number

**Threshold: 45 minutes past `due_at`.** QStash retries 3 times by default with exponential backoff — 12s, 2m28s, then 30m8s — so a message is exhausted and in the dead-letter queue at **roughly 33 minutes**. A 30-minute threshold, which is what I proposed before reading their docs, would have re-published while QStash was still trying. 45 minutes is past the last retry with margin, and the sweep's quarter-hour tick makes the worst case about an hour.

**Action: re-publish, not mark-failed.** This is the opposite of #256's decision and deliberately so. A `fired` job may already have done its work, so retrying risks a second send to a real person. A `scheduled` job **provably never ran** — nothing claimed it — so the work still needs doing and re-publishing is the only outcome that serves the customer.

**Re-publishing is safe.** QStash's `Deduplication-Id` window is **10 minutes**, so a re-publish at 45 minutes is accepted rather than silently dropped — which is the fact that decides whether this plan works at all. And if the original message somehow does arrive later, `claim_job` refuses the second one. The dedup id was never the exactly-once guarantee; the ledger is, exactly as `schedule.ts` says.

**Bounded by a counter, not by age.** `jobs.attempts` exists and is incremented by `claim_job` — but only on a successful fire, so a never-delivered job sits at 0 for ever and cannot bound anything. Reusing it would conflate "times run" with "times published", which is the kind of conflation this codebase keeps paying for. A new column says what it means.

**Giving up is honest, not silent.** After the cap, the job is marked `failed` with a reason naming the ledger, and the tenant is alerted through `alertFor` — the same path a thrown handler uses. A re-publish alerts nobody: it is self-healing and an alert per tick would be noise.

**Staleness cap for work that goes to a person.** An `outbound_send` re-published six hours late delivers a reply the customer has stopped waiting for. Past that it is failed and alerted instead, so an operator decides whether to say it again rather than the system deciding for them. Other kinds — `snooze_wake`, `pause_expire`, `blob_thread_erase` — are internal and late is strictly better than never.

**The broadcast chain gets its own repair.** `broadcastSend` schedules its own next batch, so a lost link strands the broadcast in `sending` with half its recipients done. `broadcasts.state` already allows `failed`. When the sweep gives up on a `broadcast_send` job, it moves that broadcast off `sending` with a conditional update, exactly as #256 does for a stuck message.

## 4. What this plan deliberately does not do

- **It does not read QStash's dead-letter queue.** Upstash has a DLQ API and it is tempting. But our own ledger already knows every job that should have run and did not, without a provider call, without credentials for it, and without a second source of truth to reconcile. A job in the DLQ is a job still sitting `scheduled` and overdue, so the sweep catches it either way.
- **It does not change `claim_job`.** It is correct.
- **It does not touch the Retell `?key=`.** The signature still reports `sig:false`; removing the key first takes voice down silently. That is credential work, not code.
- **It does not add a second sweep.** One route, one clock, one alert path.

---

## File Structure

| File | Responsibility | Change |
|---|---|---|
| `supabase/migrations/00079_job_republishes.sql` | the counter that bounds recovery | **Create** |
| `apps/edge/api/cron/jobs.ts` | the whole ledger sweep: stuck and overdue | Modify: a second query, the re-publish, the give-up |
| `apps/edge/lib/jobs-recovery.ts` | the pure rule: what to do with an overdue job | **Create** |
| `tooling/scripts/tests/stale-jobs.test.mjs` | the sweep's guarantees | Modify: the new truth table and wiring |

---

## Task 1: The rule, as a pure function

**Files:** Create `apps/edge/lib/jobs-recovery.ts`; modify `tooling/scripts/tests/stale-jobs.test.mjs`

A truth table is the only part of this worth reading twice, so it lives apart from the transport and is tested directly.

- [ ] **Step 1: Write the failing test**

Add to `tooling/scripts/tests/stale-jobs.test.mjs`:

```javascript
import { recoveryFor, OVERDUE_AFTER_MS, MAX_REPUBLISHES, STALE_TO_A_PERSON_MS } from "../../../apps/edge/lib/jobs-recovery.js";

test("what to do with a job whose message never arrived", () => {
  const due = (minsAgo) => new Date(Date.now() - minsAgo * 60_000).toISOString();

  // QStash exhausts three retries at about 33 minutes. Anything sooner may
  // still be on its way, and re-publishing would race a delivery.
  assert.equal(recoveryFor({ kind: "snooze_wake", due_at: due(20), republishes: 0 }), "wait");
  assert.equal(recoveryFor({ kind: "snooze_wake", due_at: due(50), republishes: 0 }), "republish");

  // Bounded: a message that will never be delivered must not be published
  // every quarter hour for ever.
  assert.equal(recoveryFor({ kind: "snooze_wake", due_at: due(120), republishes: MAX_REPUBLISHES }), "give_up");

  // A reply the customer stopped waiting for is not worth sending late; an
  // operator decides whether to say it again.
  assert.equal(recoveryFor({ kind: "outbound_send", due_at: due(60), republishes: 0 }), "republish");
  assert.equal(recoveryFor({ kind: "outbound_send", due_at: due(7 * 60), republishes: 0 }), "give_up");

  // Internal work is late, never pointless.
  assert.equal(recoveryFor({ kind: "pause_expire", due_at: due(7 * 60), republishes: 0 }), "republish");
  assert.equal(recoveryFor({ kind: "blob_thread_erase", due_at: due(48 * 60), republishes: 0 }), "republish");

  assert.ok(OVERDUE_AFTER_MS > 33 * 60_000, "past QStash's last retry, or this races a delivery");
  assert.ok(STALE_TO_A_PERSON_MS > OVERDUE_AFTER_MS);
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
node --import tsx --test tooling/scripts/tests/stale-jobs.test.mjs
```

Expected: FAIL, `Cannot find module` for `jobs-recovery.js`.

- [ ] **Step 3: Write it**

Create `apps/edge/lib/jobs-recovery.ts`:

```typescript
/**
 * What to do with a job whose QStash message never arrived.
 *
 * A `scheduled` job past its time provably never ran — nothing claimed it —
 * so unlike a job stuck in `fired`, re-publishing cannot repeat work that was
 * already done. The ledger, not QStash's deduplication, is what stops it
 * firing twice: `claim_job` refuses anything that is not still `scheduled`.
 */

/**
 * QStash retries three times with exponential backoff — 12s, 2m28s, 30m8s —
 * so a message is exhausted and in the dead-letter queue at about 33 minutes.
 * Sooner than that and this races a delivery still in flight.
 */
export const OVERDUE_AFTER_MS = 45 * 60_000;

/** A message nobody will ever accept must not be published every tick for ever. */
export const MAX_REPUBLISHES = 3;

/**
 * A reply six hours late reaches someone who stopped waiting. Past this an
 * operator decides whether to say it again, rather than the system deciding
 * for them. Only kinds that speak to a person are held to it.
 */
export const STALE_TO_A_PERSON_MS = 6 * 60 * 60_000;
const SPEAKS_TO_A_PERSON = new Set(["outbound_send", "broadcast_send"]);

export type Recovery = "wait" | "republish" | "give_up";

export function recoveryFor(
  job: { kind: string; due_at: string; republishes: number },
  nowMs: number = Date.now(),
): Recovery {
  const overdueBy = nowMs - Date.parse(job.due_at);
  if (!(overdueBy >= OVERDUE_AFTER_MS)) return "wait";
  if (job.republishes >= MAX_REPUBLISHES) return "give_up";
  if (SPEAKS_TO_A_PERSON.has(job.kind) && overdueBy > STALE_TO_A_PERSON_MS) return "give_up";
  return "republish";
}
```

- [ ] **Step 4: Run it**

```bash
node --import tsx --test tooling/scripts/tests/stale-jobs.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/edge/lib/jobs-recovery.ts tooling/scripts/tests/stale-jobs.test.mjs && git -c core.safecrlf=false commit -m "The rule for a job whose message never arrived"
```

---

## Task 2: The counter

**Files:** Create `supabase/migrations/00079_job_republishes.sql`

`attempts` cannot serve: `claim_job` increments it only on a successful fire, so a never-delivered job sits at zero for ever.

- [ ] **Step 1: Write the migration**

```sql
-- 00079 · How many times we have asked QStash to deliver this job again.
--
-- `attempts` counts FIRES: claim_job increments it when a job is claimed, so a
-- job whose message never arrived sits at zero for ever and cannot bound
-- anything. Two different events in one counter is the conflation this
-- codebase keeps paying for, so recovery gets a column of its own.
--
-- No index: the sweep reads by (state, due_at), which jobs_due_scheduled
-- already covers, and this column is only read on the handful of rows that
-- query returns.
alter table public.jobs
  add column if not exists republishes int not null default 0;

comment on column public.jobs.republishes is
  'Times the stale-jobs sweep re-published this job to QStash. attempts counts fires; this counts deliveries asked for.';
```

- [ ] **Step 2: Apply it**

```bash
~/AppData/Local/npm-cache/_npx/*/node_modules/.bin/supabase db push --linked
```

Expected: `Applying migration 00079_job_republishes.sql...` then `Finished supabase db push.`

- [ ] **Step 3: Confirm remote and local agree**

```bash
~/AppData/Local/npm-cache/_npx/*/node_modules/.bin/supabase migration list --linked | grep -o '{"local":"00079"[^}]*}'
```

Expected: `{"local":"00079","remote":"00079","time":"00079"}`

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/00079_job_republishes.sql && git -c core.safecrlf=false commit -m "Recovery gets a counter of its own"
```

---

## Task 3: The sweep reads the other half of the ledger

**Files:** Modify `apps/edge/api/cron/jobs.ts`

- [ ] **Step 1: Write the failing test**

Add to `tooling/scripts/tests/stale-jobs.test.mjs`:

```javascript
test("the sweep reads BOTH halves of the ledger", () => {
  // #256 closed 'fired' and left 'scheduled' open, which is the larger hole:
  // a message that never arrives needs only QStash to fail once, and rotated
  // signing keys stop every job in the product with no signal at all.
  assert.ok(sweep.includes('.eq("state", "fired")'), "jobs whose handler never returned");
  assert.ok(sweep.includes('.eq("state", "scheduled")') && sweep.includes('.lt("due_at",'), "and jobs whose message never arrived");
  assert.ok(sweep.includes("recoveryFor("), "the rule decides, the sweep carries it out");
  assert.ok(sweep.includes("jobs_due_scheduled") === false, "no new index: 00002 already has the partial one");
});

test("a re-publish is bounded, recorded, and silent; giving up is loud", () => {
  assert.ok(sweep.includes("republishes: job.republishes + 1"), "the counter goes up with the publish");
  assert.ok(sweep.includes('.eq("state", "scheduled")'), "and only while the job is still unclaimed");
  // A re-publish alerts nobody: it is self-healing, and an alert every tick
  // would bury the one that matters.
  const republish = sweep.slice(sweep.indexOf('case "republish"'));
  assert.ok(!republish.slice(0, republish.indexOf('case "give_up"')).includes("alertFor"), "a re-publish is silent");
  assert.ok(sweep.includes("jobs_republished"), "but it is logged, so a pile-up is visible");
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
node --import tsx --test tooling/scripts/tests/stale-jobs.test.mjs
```

Expected: FAIL on `and jobs whose message never arrived`.

- [ ] **Step 3: Add the second pass to `apps/edge/api/cron/jobs.ts`**

After the existing `fired` loop and before the `return`:

```typescript
  // The other half of the ledger. A job whose QStash message never arrived
  // stays 'scheduled' past its time for ever: nothing reads due_at, and the
  // pass above filters on 'fired' and walks straight past it. Rotated signing
  // keys put EVERY job in the product here at once, which is why the count is
  // logged even when it is zero work.
  const overdueBefore = new Date(Date.now() - OVERDUE_AFTER_MS).toISOString();
  const { data: overdue, error: oErr } = await db
    .from("jobs")
    .select("id, tenant_id, kind, payload, due_at, republishes")
    .eq("state", "scheduled")
    .lt("due_at", overdueBefore)
    .order("due_at", { ascending: true })
    .limit(MAX_PER_TICK);
  if (oErr) return json(503, { ok: true, reaped, messages, overdue_error: oErr.message });

  let republished = 0;
  let gaveUp = 0;
  for (const job of overdue ?? []) {
    switch (recoveryFor(job)) {
      case "wait":
        continue;
      case "republish": {
        // The counter first, conditional on the job still being unclaimed: a
        // delivery that lands between the read and here has already claimed
        // it, and publishing again would be asking for work nobody needs.
        const { data: won } = await db
          .from("jobs")
          .update({ republishes: job.republishes + 1 })
          .eq("id", job.id)
          .eq("state", "scheduled")
          .select("id");
        if (!won?.length) continue;
        try {
          await republishJob(db, job);
          republished += 1;
          L.info("jobs_republished", { job_id: job.id, tenant_id: job.tenant_id, kind: job.kind, due_at: job.due_at, republishes: job.republishes + 1 });
        } catch (e) {
          L.error("jobs_republish_failed", { job_id: job.id, error: e instanceof Error ? e.message : String(e) });
        }
        continue;
      }
      case "give_up": {
        const { data: won } = await db
          .from("jobs")
          .update({ state: "failed", last_error: NEVER_DELIVERED })
          .eq("id", job.id)
          .eq("state", "scheduled")
          .select("id");
        if (!won?.length) continue;
        gaveUp += 1;
        await releaseBroadcast(db, job);
        try {
          await alertFor(db, job)(
            `A ${job.kind} job never ran`,
            `Job ${job.id} (${job.kind}) was due ${job.due_at} and its delivery never arrived, after ${job.republishes} attempt${job.republishes === 1 ? "" : "s"} to send it again. ${NEVER_DELIVERED}`,
          );
        } catch (e) {
          L.error("jobs_giveup_alert_failed", { job_id: job.id, error: e instanceof Error ? e.message : String(e) });
        }
        continue;
      }
    }
  }

  return json(200, { ok: true, reaped, messages, republished, gaveUp, seen: stale.length + (overdue?.length ?? 0) });
```

With, near the top of the file:

```typescript
import { recoveryFor, OVERDUE_AFTER_MS } from "../../lib/jobs-recovery.js";

export const NEVER_DELIVERED = "the job was scheduled but its delivery never arrived";
```

- [ ] **Step 4: Run and commit**

```bash
node --import tsx --test tooling/scripts/tests/stale-jobs.test.mjs && git add -A && git -c core.safecrlf=false commit -m "The sweep reads the other half of the ledger"
```

---

## Task 4: Re-publishing, and releasing a stranded broadcast

**Files:** Modify `apps/edge/api/cron/jobs.ts`

Two helpers the pass above calls. `scheduleJob` cannot be reused: it inserts a new row, and this job already has one.

- [ ] **Step 1: Write the failing test**

```javascript
test("a re-publish reuses the job's own id, and a stranded broadcast is released", () => {
  // deduplicationId is the job id, and QStash's window is ten minutes — long
  // closed at forty-five — so the message is accepted rather than dropped.
  // claim_job, not the dedup id, is what stops it firing twice.
  assert.ok(sweep.includes("deduplicationId: job.id"), "the job's own id");
  assert.ok(sweep.includes("notBefore:") === false, "due already: nothing to hold it back for");
  assert.ok(sweep.includes('.update({ qstash_id: res.messageId })'), "the new message id replaces the lost one");

  // broadcastSend schedules its own next batch, so a lost link strands the
  // broadcast in 'sending' with half its recipients done.
  assert.ok(sweep.includes('job.kind === "broadcast_send"'), "only a broadcast job releases a broadcast");
  assert.ok(sweep.includes('.eq("state", "sending")'), "conditional, so a broadcast that finished is left alone");
  const handlers = readCode("packages/jobs/src/handlers.ts");
  assert.ok(handlers.includes('ctx.schedule("broadcast_send", new Date(), { broadcast_id: b.id })'), "the chain this repairs");
});
```

- [ ] **Step 2: Write the helpers**

```typescript
/**
 * Ask QStash to deliver this job again, on the row it already has.
 *
 * Not scheduleJob: that inserts a new row, and this job's row is the thing we
 * are trying to rescue. `notBefore` is omitted because the job is already
 * overdue — there is nothing left to wait for. The deduplication id is the job
 * id, and QStash's window is ten minutes, so at forty-five this is accepted;
 * `claim_job` is what stops a late original and this one both firing.
 */
async function republishJob(db: NonNullable<ReturnType<typeof pg>>, job: { id: string }): Promise<void> {
  const token = process.env.QSTASH_TOKEN;
  if (!token) throw new Error("no QSTASH_TOKEN");
  const res = await new Client({ token }).publishJSON({
    url: FIRE_URL,
    body: { job_id: job.id },
    deduplicationId: job.id,
  });
  await db.from("jobs").update({ qstash_id: res.messageId }).eq("id", job.id);
}

/**
 * A broadcast whose chain broke sits in 'sending' with some recipients done
 * and nothing coming. Conditional on 'sending' so a broadcast that finished
 * between the read and here is left exactly as it finished.
 */
async function releaseBroadcast(db: NonNullable<ReturnType<typeof pg>>, job: { kind: string; tenant_id: string; payload: unknown }): Promise<void> {
  if (job.kind !== "broadcast_send") return;
  const id = typeof job.payload === "object" && job.payload !== null
    ? (job.payload as Record<string, unknown>).broadcast_id
    : null;
  if (typeof id !== "string") return;
  await db
    .from("broadcasts")
    .update({ state: "failed", finished_at: new Date().toISOString() })
    .eq("id", id)
    .eq("tenant_id", job.tenant_id)
    .eq("state", "sending");
}
```

`Client` and `FIRE_URL` come from `@upstash/qstash` and `../../lib/workspace/jobs.js`, both already imported by `api/jobs/fire.ts`.

- [ ] **Step 3: Run every gate, in CI's order**

```bash
corepack pnpm --filter "./packages/*" build && git diff --exit-code -- packages/*/dist && corepack pnpm -r --if-present typecheck && corepack pnpm lint && corepack pnpm test
```

Expected: dist clean, both apps `Done`, `0 errors` with 23 warnings, `# fail 0`.

- [ ] **Step 4: Commit**

```bash
git add -A && git -c core.safecrlf=false commit -m "A re-publish keeps the job's own row, and releases a stranded broadcast"
```

---

## Task 5: Prove it against a real job, then ship

The sweep from #256 has never fired on a stale job, because there have not been any. This one can be proven deliberately and safely, because a `scheduled` job that has not run is exactly what we want to create.

- [ ] **Step 1: Make one, by hand, in the smoke workspace**

With `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` from the CLI session (`supabase projects api-keys --output json`, piped to a file, never printed), insert a `snooze_wake` job for the `chanlytics-smoke-test` tenant with `due_at` two hours in the past, `state = 'scheduled'`, `qstash_id = null`. It has no QStash message at all, which is exactly case C.

- [ ] **Step 2: Watch one tick**

```bash
curl -s -X POST -H "x-cron-key: $KEY" https://chanlytics-messaging.vercel.app/api/cron/jobs
```

Expected: `{"ok":true,...,"republished":1,...}`, and the row's `republishes` is 1 with a fresh `qstash_id`.

- [ ] **Step 3: Confirm it actually ran**

Within a minute the job should be `fired` — QStash delivered, `claim_job` claimed it. That is the whole chain proven end to end on a real row.

- [ ] **Step 4: Clean up and open the pull request**

Delete the probe row if it did not complete, then open the PR. **This carries a migration, so it is not for auto-merge** — apply `00079` before it lands.

---

## Self-Review

**Coverage.** C, D and E are closed by Task 3 — all three are the same overdue read. K is closed by Task 4's `releaseBroadcast`. I is already closed by #256. A, B, F, G, H and J were already visible and are unchanged.

**The number that matters.** 45 minutes is derived from QStash's published backoff (12s, 2m28s, 30m8s → exhausted ~33 min), not chosen. My first instinct was 30 minutes, which would have raced a delivery still in flight. Worth re-deriving if QStash's defaults change or if `Upstash-Retries` is ever set on our publishes — it is not set today.

**The assumption that decides everything.** QStash's deduplication window is 10 minutes, so a re-publish at 45 is accepted. If that window were unbounded, this plan would silently do nothing, and the alternative would be publishing with a fresh deduplication id and relying on `claim_job` alone.

**Risk left standing.** `republishJob` publishes to QStash from a cron path that previously only read and wrote Postgres, so a QStash outage now surfaces as `jobs_republish_failed` in the sweep's log rather than as a thrown request. That is deliberate — a sweep that dies on the first bad publish rescues nothing — but it means a total QStash outage is visible only in logs until the give-up alerts start, three ticks later.

# The Jobs Ledger, Round Two — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Make the recovery path correct under concurrency and under QStash's own retry clock, and settle what a job leaves behind when it will not run — without inventing machinery this system does not need.

**Architecture:** No new sweep loop, no new RPCs, no state renames. One column for pacing, one predicate for reservation, one settlement module shared by both terminal paths, one sweeper for the timer that has no safety net, and a seam narrow enough that the sweep's control flow can be tested without restructuring it.

**Shell:** every command is bash (Git Bash on Windows).

---

## 1. Standing on the external review

An architecture review of PR #261 landed while that branch was being finished. It found three release blockers. **Two were already fixed by the time it arrived**, independently and for the same reasons it gives; the third is real, is mine, and is the core of this plan.

| Its finding | Status |
|---|---|
| The overdue pass is unreachable when no `fired` job exists | **Fixed** — #262. Its early-return diagnosis is exact |
| Successful jobs never leave `fired`, so the sweep reaps every success | **Fixed** — #263, migration `00080` adds `done` |
| Re-publishes are not reserved atomically and are paced from `due_at` | **Open. This plan.** |

Blast radius when the second was found, measured before changing anything: **10 jobs in the table, 1 in `fired`, 0 past the ten-minute cutoff.** Nothing real was ever reaped, which is why the review's first containment step — pause the cron — is no longer the right move. It was right when written.

### Corrections to my own first pass

Two numbers I gave were wrong, and one justification did not survive reading the code:

- `sweep_health()` watches **three of fourteen** sweeps (`deadman`, `health`, `calls`), not two of eight. The point stands — most sweeps are unwatched — but the figures were invented rather than counted.
- Registering a sweep is **not** adding a row to a `VALUES` list. It costs a constraint change (`sweep_status_sweep_check` hard-codes the three names), a seed row, a rewrite of the trigger function to record its `pg_net` request id, and a `create or replace` of the ~110-line `sweep_health()`. That changes the scope of Task 6 — see there.
- I justified Task 5's seam by calling it "the shape `pgSink` already uses." It isn't. `pgSink` is a closure that carries `db` into a group of methods; nothing injects a fake into it. The seam is justified on its own evidence instead, which is stronger: **99 of 136 test files read source text; exactly 2 import a module and call it.**

### Where this plan disagrees with the review

Four of its recommendations are more machinery than this system earns, and are declined with reasons rather than dropped quietly:

- **Renaming `fired` → `running`, adding `succeeded`.** `fired` plus `done` already draws that distinction, is shipped, applied and documented. A rename touches `claim_job`, the sweep, the check constraint, the tests and every historical row to make a comment redundant.
- **`complete_job` and `reserve_republish` RPCs.** A conditional `update … .eq(…)` is already one atomic statement. Wrapping it in a security-definer function adds a migration and a type regeneration and buys no atomicity that is not already there.
- **A delivery-attempt table** distinguishing attempted from accepted publications. Two columns answer the same question at this size. Revisit if the ledger ever carries thousands of jobs a day.
- **Pausing the production cron** as containment. Correct when written; both blockers it was containing are merged, and the measured blast radius was zero rows.

Its methodological point is accepted without reservation, and is the whole reason for Task 5: **all thirteen tests on that file read source, and both blockers shipped green through them.** Source shape is not control flow.

---

## 2. What is actually still wrong

**A. The re-publish reservation is not a compare-and-swap.** `apps/edge/api/cron/jobs.ts:212`

```typescript
.update({ republishes: job.republishes + 1 })
.eq("id", job.id)
.eq("state", "scheduled")
```

Two sweeps that read the same row both see `republishes: 0`, both write 1, and both match `state = 'scheduled'` — so both return a row and both publish. The condition guards the state, not the counter it is incrementing.

**B. Pacing from `due_at` burns the whole budget in forty-five minutes.** `recoveryFor` compares only `due_at`, so with a quarter-hour tick:

| | |
|---|---|
| T+45 | publish #1, QStash retries until ~T+78 |
| T+60 | publish #2, retries until ~T+93 |
| T+75 | publish #3, retries until ~T+108 |
| T+90 | `republishes >= 3` → **failed**, with two deliveries still in flight |

`claim_job` then refuses both, because the row is no longer `scheduled`. The 45-minute threshold was derived correctly from QStash's retry horizon and then applied only to the first publish.

**C. Each terminal path settles exactly the half the other doesn't.** The `fired` reap marks a stuck `outbound_send`'s message failed (`jobs.ts:160`) and ignores broadcasts. The overdue give-up releases the broadcast (`jobs.ts:240`) and ignores messages. So an `outbound_send` given up on says "Sending…" for ever, and a `broadcast_send` whose lambda died sits in `sending` with half its recipients reached. One shared settlement, called from both.

**D. `releaseBroadcast` ignores its own errors** (`jobs.ts:94` destructures `data` only) while the alert copy states flatly that the broadcast was marked failed.

**E. Both halves can fail and still answer 200.** The overdue read returns `json(200, …overdue_error)` at `jobs.ts:198`; the stuck read logs and continues at `:131`, so its failure is invisible in the response entirely. Anything watching HTTP status reads a half-broken sweep as healthy.

**F. `outboundSend` consumes its claim on an unreadable consent row.** `handlers.ts:127` returns rather than throws — fail closed, which is right. But that consumes the claim, and since #263 the job then moves to `done`. Before #263 it stayed `fired` and the sweep eventually reaped and alerted; my own change made this failure silent.

**G. A lost `snooze_wake` strands a conversation for ever — and this plan nearly shipped the pacing fix inert.** Two findings from reading around the above:

- The overdue `SELECT` at `jobs.ts:191` lists its columns explicitly. `last_republish_at` must be added to it or `recoveryFor` reads `undefined`, the pacing branch never runs, and the fix is inert exactly the way #261 was. This is the third time in this work that a correct rule was wired to a source that could not reach it.
- `pause_expire` already has a safety net: `expire_stale_pauses()` (00006) reopens any `needs_human` conversation whose `paused_until` has passed, every fifteen minutes, whoever set the pause. **`snooze_wake` has none.** `snooze_until` is cleared only by the job, by an inbound reply (00005), or by opt-out (00013) — so a snooze whose job was lost keeps a customer's conversation out of the inbox permanently.

---

## File Structure

| File | Change |
|---|---|
| `supabase/migrations/00081_job_republish_pacing.sql` | **Create** — `last_republish_at` |
| `apps/edge/lib/jobs-recovery.ts` | Modify — pace from the last publish, not the due time |
| `apps/edge/api/cron/jobs.ts` | Modify — fetch the column, true CAS, shared settlement, honest status, the seam |
| `apps/edge/lib/jobs-settle.ts` | **Create** — what a terminal job leaves behind |
| `supabase/migrations/00082_wake_stale_snoozes.sql` | **Create** — the sweeper `snooze_wake` never had |
| `tooling/scripts/tests/_fake-db.mjs` | **Create** — a Supabase query-builder double that throws on anything it does not know |
| `tooling/scripts/tests/jobs-sweep-behaviour.test.mjs` | **Create** — control flow, against that double |
| `supabase/migrations/00083_sweep_health_jobs.sql` | **Create** — the jobs sweep becomes watchable |
| `packages/jobs/src/handlers.ts` | Modify — an unreadable consent row fails loudly |

---

## Task 1: Pace from the last publish

**Files:** Create `supabase/migrations/00081_job_republish_pacing.sql`; modify `apps/edge/lib/jobs-recovery.ts`, `apps/edge/api/cron/jobs.ts`

- [ ] **Step 1: Write the failing test**

Add to `tooling/scripts/tests/stale-jobs.test.mjs`:

```javascript
test("a second publish waits for the first to exhaust itself", () => {
  const ago = (mins) => new Date(Date.now() - mins * 60_000).toISOString();

  // The budget used to burn in forty-five minutes: due_at was the only clock,
  // so every quarter-hour tick published again while the previous delivery
  // still had twenty minutes of QStash retries left, and the job was then
  // failed with two deliveries in flight — which claim_job would refuse.
  assert.equal(recoveryFor({ kind: "snooze_wake", due_at: ago(60), republishes: 1, last_republish_at: ago(15) }), "wait");
  assert.equal(recoveryFor({ kind: "snooze_wake", due_at: ago(120), republishes: 1, last_republish_at: ago(70) }), "republish");
  assert.ok(REPUBLISH_HORIZON_MS > 33 * 60_000, "past QStash's own retry horizon, or the two overlap");

  // A never-published job still keys off due_at; there is no last publish yet.
  assert.equal(recoveryFor({ kind: "snooze_wake", due_at: ago(50), republishes: 0, last_republish_at: null }), "republish");

  // Pacing outranks the budget: a job that has spent all three publishes is
  // still WAITING, not failed, while the last one can still land. This
  // ordering is the fix — give_up before the horizon is the original bug.
  assert.equal(recoveryFor({ kind: "snooze_wake", due_at: ago(120), republishes: 3, last_republish_at: ago(15) }), "wait");
  assert.equal(recoveryFor({ kind: "snooze_wake", due_at: ago(240), republishes: 3, last_republish_at: ago(70) }), "give_up");
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
node --import tsx --test tooling/scripts/tests/stale-jobs.test.mjs
```

Expected: FAIL — `wait` expected, `republish` returned.

- [ ] **Step 3: The migration**

```sql
-- 00081 · When we last asked QStash to deliver this job again.
--
-- recoveryFor paced from due_at alone, so every quarter-hour tick published
-- again while the previous delivery still had twenty minutes of QStash's own
-- retries left. Three publishes inside forty-five minutes exhausted the budget
-- and the job was marked failed with deliveries still in flight — which
-- claim_job then refused, because the row was no longer 'scheduled'.
--
-- updated_at would nearly serve: jobs_set_updated_at (00002) keeps it via
-- moddatetime and a scheduled job is otherwise written only at creation. But it
-- means "last written", not "last published", and the next writer of any other
-- column would silently become a pacing decision. Pacing is a correctness
-- property, so it gets a column that says what it means.
alter table public.jobs
  add column if not exists last_republish_at timestamptz;

comment on column public.jobs.last_republish_at is
  'When the stale-jobs sweep last re-published this job. Recovery is paced from here, not from due_at, because each publish gets its own QStash retry horizon.';
```

- [ ] **Step 4: Apply it and refresh the types**

```bash
~/AppData/Local/npm-cache/_npx/*/node_modules/.bin/supabase db push --linked
```

```bash
cd packages/db && ~/AppData/Local/npm-cache/_npx/*/node_modules/.bin/supabase gen types typescript --linked > src/database.types.ts && cd ../..
```

- [ ] **Step 5: The rule**

In `apps/edge/lib/jobs-recovery.ts`:

```typescript
/**
 * Each publish gets its own QStash retry horizon — three tries over about 33
 * minutes — so a second publish inside that window races the first rather than
 * replacing it. Sixty minutes clears that horizon with room for a missed tick.
 */
export const REPUBLISH_HORIZON_MS = 60 * 60_000;

export interface OverdueJob {
  kind: string;
  due_at: string;
  republishes: number;
  last_republish_at?: string | null;
}

export function recoveryFor(job: OverdueJob, nowMs: number = Date.now()): Recovery {
  const overdueBy = nowMs - Date.parse(job.due_at);
  if (!(overdueBy >= OVERDUE_AFTER_MS)) return "wait";
  // BEFORE the budget check, deliberately. due_at says when recovery may begin;
  // it must not also say how often it may repeat, and a job whose last delivery
  // is still being retried must not be declared dead underneath it.
  if (job.last_republish_at) {
    const since = nowMs - Date.parse(job.last_republish_at);
    if (!(since >= REPUBLISH_HORIZON_MS)) return "wait";
  }
  if (job.republishes >= MAX_REPUBLISHES) return "give_up";
  if (SPEAKS_TO_A_PERSON.has(job.kind) && overdueBy > STALE_TO_A_PERSON_MS) return "give_up";
  return "republish";
}
```

- [ ] **Step 6: Let the sweep actually read the column**

`apps/edge/api/cron/jobs.ts:191` names its columns, so the rule above is inert until this line changes. Pin it in the test file too — an unfetched column is how #261 shipped doing nothing.

```typescript
    .select("id, tenant_id, kind, payload, due_at, republishes, last_republish_at")
```

```javascript
assert.ok(sweep.includes("republishes, last_republish_at"), "the pacing column is fetched, or recoveryFor reads undefined and paces nothing");
```

- [ ] **Step 7: Run and commit**

```bash
node --import tsx --test tooling/scripts/tests/stale-jobs.test.mjs
```

---

## Task 2: The reservation becomes a compare-and-swap

**Files:** Modify `apps/edge/api/cron/jobs.ts`

- [ ] **Step 1: Make the counter the condition**

```typescript
      const { data: won, error: cErr } = await db
        .from("jobs")
        .update({ republishes: job.republishes + 1, last_republish_at: new Date().toISOString() })
        .eq("id", job.id)
        .eq("state", "scheduled")
        // The COUNTER, not only the state. Two sweeps reading the same row both
        // saw republishes 0, both wrote 1, both matched 'scheduled' — and both
        // published. Conditioning on the value being replaced is what makes
        // this a reservation rather than a race with extra steps.
        .eq("republishes", job.republishes)
        .select("id");
      if (cErr || !won?.length) continue;
```

- [ ] **Step 2: Pin the ordering**

```javascript
test("only one sweep can reserve a publish", () => {
  assert.ok(sweep.includes('.eq("republishes", job.republishes)'), "the counter is the condition, not only the state");
  assert.ok(sweep.includes("last_republish_at: new Date().toISOString()"), "and the reservation stamps when it happened");
  assert.ok(
    sweep.indexOf('.eq("republishes", job.republishes)') < sweep.indexOf("await republishJob("),
    "reserved before published, so a lost race publishes nothing",
  );
});
```

- [ ] **Step 3: Commit both tasks together**

```bash
corepack pnpm test && git add -A && git -c core.safecrlf=false commit -F <message file>
```

---

## Task 3: One settlement, both terminal paths

**Files:** Create `apps/edge/lib/jobs-settle.ts`; modify `apps/edge/api/cron/jobs.ts`

Each path settles the half the other ignores (finding C), `releaseBroadcast` swallows its errors (D), and the give-up alert asserts a broadcast was failed whether or not it was. One module, two kinds, one honest report.

Only `outbound_send` and `broadcast_send` are settled here. `pause_expire` needs nothing — `expire_stale_pauses()` has covered it since 00006 — and `snooze_wake` is Task 4, because its stranding does not depend on this sweep giving up.

- [ ] **Step 1: The module**

```typescript
export interface Settled { what: string; ok: boolean; detail?: string }

/**
 * What a job leaves behind when it will not run.
 *
 * `certain` is whether the work provably never happened: a job that was never
 * claimed is certain, one claimed and never heard from again is not. It changes
 * the words, never the conditions — every write here is conditional on the
 * downstream row still claiming to be in flight, so a handler that DID record
 * its send before dying is left alone either way.
 */
export async function settle(db: Db, job: TerminalJob, certain: boolean): Promise<Settled[]>
```

`outbound_send` → the message to `failed`, conditional on `queued`. `broadcast_send` → the broadcast to `failed` + `finished_at`, conditional on `sending`. Errors are captured into `Settled.detail`, never dropped.

- [ ] **Step 2: Both paths call it, and the alert reports what it returned**

The `fired` reap passes `certain: false`, the give-up passes `certain: true`. The broadcast sentence appears only when the broadcast was actually released.

- [ ] **Step 3: Test, run, commit**

---

## Task 4: The sweeper `snooze_wake` never had

**Files:** Create `supabase/migrations/00082_wake_stale_snoozes.sql`

Directly mirrors 00006, whose header records the same lesson for pauses: a timer whose only mechanism is a job is a timer that stops for ever when the job is lost. Pauses got a net; snoozes did not.

- [ ] **Step 1: The migration**

A `wake_stale_snoozes()` reopening `state = 'snoozed'` rows with `snooze_until < now()`, emitting `conversation.snooze_expired`, on the same fifteen-minute cadence and offset off 00006's tick.

- [ ] **Step 2: Assert it in the test file, run, commit**

---

## Task 5: Test control flow, not source shape

**Files:** Create `tooling/scripts/tests/_fake-db.mjs`, `tooling/scripts/tests/jobs-sweep-behaviour.test.mjs`; modify `apps/edge/api/cron/jobs.ts`

Both release blockers passed thirteen source-reading tests and a full CI run; one was found by a probe row, the other by an external reviewer. Across the suite, **99 of 136 files read source text and 2 call a module.** That ratio is the finding.

- [ ] **Step 1: The narrowest seam that works**

Not an eight-function port object. Move the body of `POST` into an exported `sweepLedger(db, L, seams)` where `seams` is `{ publish = republishJob, alert = alertFor }` — two default parameters. `POST` keeps auth and calls it. Production control flow is unchanged; only its two outward calls become substitutable.

- [ ] **Step 2: A double that fails loudly**

A fake `db` supporting exactly the chains this route uses, throwing on any method it does not know, so an unfaithful double is a test failure rather than a false pass.

- [ ] **Step 3: The cases source reading cannot see**

1. No stuck jobs, one overdue row → publishes exactly once. *(Would have caught #262.)*
2. A `done` job is invisible to both halves. *(Would have caught #263.)*
3. Two sweeps over one row → one reservation, one publish.
4. A reservation inside the horizon → no second publish.
5. Give-up on `outbound_send` → message `failed`, and the alert says so.
6. A settlement write that fails → reported, not swallowed.
7. Either read failing → non-200, and the other half still runs.

- [ ] **Step 4: Full suite, commit**

---

## Task 6: Make the jobs sweep watchable

**Files:** Create `supabase/migrations/00083_sweep_health_jobs.sql`

Scope corrected from the first draft. I argued that adding only the newest sweep was arbitrary and that the honest cut was "every sweep that mutates state" — three of them. Reading `00026` changed the arithmetic: each registration needs a constraint change, a seed row, a trigger rewrite and a `create or replace` of the whole health function. Doing that for `registration-sweep` and `calendar-people-sweep` triples a production cron migration inside a PR about job recovery. The principle stands and is recorded; applying it to those two belongs in its own change.

- [ ] **Steps:** widen `sweep_status_sweep_check` to admit `'jobs'`; seed the row; add the `sweep_status` write to `trigger_stale_jobs_sweep()` on both its paths, matching `trigger_deadman_sweep()` exactly; add `('jobs', 'stale-jobs-sweep', interval '40 minutes')` to `sweep_health()` — two missed fifteen-minute ticks plus slack, the same reasoning as the deadman row's 25.

---

## Task 7: An unreadable consent row fails loudly

**Files:** Modify `packages/jobs/src/handlers.ts`

Its own PR, because it is the only change here touching a path that speaks to customers.

Throwing instead of returning reaches `fail_job` and the alert `fire.ts` already builds. The message itself stays `queued` either way, and that is deliberate — the comment there says why: it was not sent, and marking it `failed` on our own inability to check would be a second untruth. Only the job fails, which is the part that reaches an owner.

---

## Self-Review

**Coverage.** A → Task 2. B → Task 1. C, D → Task 3. E → Task 5 step 3 case 7 (and the change itself lands with Task 3). F → Task 7. G → Task 1 step 6 and Task 4. The review's methodology point → Task 5. Its `sweep_health` point → Task 6.

**Sequencing.** 1 + 2 are the correctness fixes and land together. 3 + 4 + the status fix are one PR. 5 lands alone, after them, so a mistake in the extraction cannot hide behind a correctness fix. 6 and 7 stand apart.

**Not doing, and why.** Renaming `fired`; completion and reservation RPCs; a delivery-attempt table; pausing the cron; registering the other two mutating sweeps. Recorded so the decisions stay visible rather than becoming folklore.

**Risk left standing.** Task 5 moves working production code for testability, and Task 4 adds a sweeper that writes to conversations on a timer. Both are reviewed on their own PRs. The pacing change also lengthens the worst case before a job is declared dead from ~90 minutes to ~4 hours; that is the point — nothing is declared dead while a delivery it owns can still land — but it is a behaviour change worth stating rather than discovering.

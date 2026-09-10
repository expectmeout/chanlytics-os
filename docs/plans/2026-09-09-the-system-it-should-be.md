# The System It Should Be — Refactor Program

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the four pieces of machinery Chanlytics carries without having earned them — QStash as a holder of state, a second copy of every enum, a second domain layer, and a test corpus that reads source instead of exercising behaviour — and bind tenancy and operator alerting by construction, so that the class of bug that shipped green twice in one evening cannot be written.

**Architecture:** Postgres stays the single source of truth; every clock the product has lives in a row and one ten-second heartbeat acts on whatever is due. Business rules move into one package behind ports; the two apps keep only transport. Enums are generated from the schema. Tests get their evidence from behaviour (fakes for orchestration, a local Postgres for SQL invariants) and the source-scan corpus is ratcheted down to a handful of repo-wide lints.

**Tech Stack:** Node 22, pnpm, TypeScript, Supabase (Postgres 15+, pg_cron ≥ 1.5, pg_net, Vault), Vercel functions (`apps/edge`), Next.js route handlers (`apps/dashboard`), `node:test` + `tsx`, Playwright. Every command below is bash (Git Bash on Windows).

---

## 0. How to read this

This is a **program of six phases plus a Phase 0**. Each phase leaves a working, deployed system and is its own PR series. The writing-plans discipline says a spec spanning independent subsystems becomes one plan per subsystem; this document is the program-level plan and it is honest about depth:

- **Phase 0, 1, 2 and 4 are fully specified** — every step carries the code.
- **Phase 3 and 5 lock the design and specify the shared machinery and the first worked example in full**; the remaining routes follow a recipe with an inventory command. Each of those gets its own plan document in this format when reached, because its exact content depends on the state left by the phases before it.
- **Phase 6 is an inventory task**, because its scope depends on a product question nobody has answered yet.

Standing rules for every task in every phase:

- Every migration is followed by `cd packages/db && supabase gen types typescript --linked > src/database.types.ts && cd ../..` and the regenerated types are committed with it.
- Every PR is green on `pnpm -r typecheck && pnpm lint && pnpm test` and, from Phase 1 on, `pnpm test:integration` against a local Supabase.
- Commit messages are one sentence in the house voice, no prefix: `A job that finished says so`, not `feat: job done state`.
- When a behaviour test lands for a piece of code, the `readCode` assertions that pinned that code's text are **deleted in the same PR**, and the Phase 0 baseline goes down. Never add a `readCode` assertion outside the lint allowlist.

### Relationship to "The Jobs Ledger, Round Two"

Phase 1 replaces the delivery mechanism that Round Two paces and reserves. If Round Two has not shipped: **do not ship its Tasks 1, 2, 4, 5 and 6** — there is no re-publish to pace, reserve, or test once the outbox exists. Its Task 3 (settlement) and Task 7 (throw on an unreadable consent row) survive here in Phase 1 in their new shape. If Round Two *has* shipped, Phase 1's migration drops `last_republish_at` alongside `republishes` and deletes `apps/edge/lib/jobs-settle.ts` in favour of `packages/jobs/src/settle.ts`.

### Decisions taken here — say so if any is wrong

1. **Pause expiry is unified on the escalation-aware rule.** Today `expire_stale_pauses()` refuses to reopen a thread with an open escalation and the `pause_expire` job handler reopens regardless; the two disagree. Phase 1 keeps the SQL rule: a thread a human is handling stays with humans until the escalation is resolved.
2. **The undo window becomes "fifteen seconds, then sent on the next heartbeat."** `SEND_GRACE_MS` stays 15 s; the actual send lands within 15–25 s. `cancelable_until` in the reply response is unchanged and still true.
3. **`fire.ts` is retired on deploy**, answering 200 and doing nothing, so QStash deliveries for jobs scheduled before the outbox (up to the 30-day snooze cap) stop retrying. The tick runs those jobs from their `due_at`. The file and the `QSTASH_*` env vars are deleted 30 days later.
4. **Historical `snooze_wake` / `pause_expire` job rows are deleted in Phase 2** when `jobs.kind` becomes an enum. Their effect is fully recorded on the conversation row; what is lost is the timestamp of a finished timer.
5. **`JobContext.schedule` and `JobContext.eraseThread` become required.** There is exactly one runner and it can always do both; making the compiler enforce it replaces two source-scan assertions.

---

## 1. The decisions this program locks

**Time lives in the row, not in a broker.** `conversations.snooze_until` and `paused_until` already exist and `expire_stale_pauses()` already acts on one of them. `outbound_send`, `broadcast_send` and `blob_thread_erase` are "do external work at time T" and are exactly what a transactional outbox is for. A pg_cron heartbeat every ten seconds (`'10 seconds'`, supported on Supabase's pg_cron 1.6) does one index probe, and calls the edge only when something is due. Recovery stops being a concept: a job that did not run is still due. `#256`, `#261`, `#262`, `#263` and Round Two were all the cost of a second clock whose deliveries could not be observed.

**One transition path per aggregate, with the edges enforced in the database.** `claim_due_jobs` (SQL, `FOR UPDATE SKIP LOCKED`) is the only way a job becomes `fired`; `completeJob`/`failJob` are the only ways out, both compare-and-swap on state *and* attempt number; `jobs_guard` rejects any edge not in the machine, the way `messages_guard` already does for messages.

**Enums have one source.** Postgres enum types generate into `Database["public"]["Enums"]`; the contracts arrays are checked against them at compile time. The `enums-vs-checks` test — which picked the wrong CHECK constraint once — ceases to exist.

**Rules in one package, transport in the apps.** `packages/core` owns use cases as `verb(ports, command) → result`. `apps/dashboard` and `apps/edge` map requests to commands and results to responses. `pgSink` and `recoveryFor` already have this shape; it becomes the default.

**Tests get their evidence from behaviour.** Pure functions tested directly; use cases tested with fakes; SQL invariants tested against a local Postgres in CI; Playwright for flows. Source scanning survives only as a short allowlist of repo-wide lints, and a ratchet makes the count monotone.

**Tenancy is bound by construction.** The workspace a request acts on is resolved once in `withRoute` from a cookie set at switch time; the `ambiguous` concept and the `?workspace=` convention go away.

**Two alert channels.** `notifyOwner` for a thing that happened to one workspace; `pageOperator` for a systemic condition. Both suppressed, both present before the first caller needs them.

**Not doing, and why.** Renaming `fired`; a delivery-attempt table; an external queue or worker process (pg_cron + pg_net is the worker this platform already has); a rewrite of the WhatsApp inbound path inside this program (it is Phase 5's last and largest sub-plan, on its own).

---

## 2. Sequencing

| Phase | What | Why here |
|---|---|---|
| 0 | The source-scan ratchet | So every later phase is measured against a baseline that can only fall |
| 1 | The outbox | Largest correctness gain, removes the most machinery, unblocks a one-module ledger |
| 2 | Enums from the schema | Small, mechanical, and Phase 5's use cases want real enum types |
| 3 | Tenancy by construction | Touches `withRoute` and every route's first line — do it before Phase 5 touches every route's body |
| 4 | Two alert channels | Small; Phase 5's use cases call `pageOperator` |
| 5 | The core package, per domain | The long tail; each domain its own plan |
| 6 | The legacy frontend | Needs a product decision first |

---

## Phase 0: The ratchet

**Files:**
- Create: `tooling/scripts/tests/source-scan-ratchet.test.mjs`
- Create: `tooling/scripts/tests/source-scan-baseline.json`

The suite calls `readCode`/`readRaw` well over a thousand times across ~120 files. This test makes that number monotone non-increasing per file, and names the files allowed to keep doing it because their purpose is a repo-wide policy rather than pinning one module's text.

- [ ] **Step 1: Write the test**

```javascript
/**
 * Source-scan assertions pin text, not behaviour; two release blockers passed
 * thirteen of them in one evening. This makes their count per file a ratchet:
 * it may only fall, except in the files whose whole purpose is a repo-wide
 * lint (every write names a workspace, env vars are declared where read).
 *
 *   UPDATE_SOURCE_SCAN_BASELINE=1 pnpm test   # rewrite the baseline after a reduction
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { ROOT, readRaw } from "./_source.mjs";

const DIR = "tooling/scripts/tests";
const BASELINE = path.join(ROOT, DIR, "source-scan-baseline.json");

const files = fs.readdirSync(path.join(ROOT, DIR)).filter((f) => f.endsWith(".test.mjs") && f !== "source-scan-ratchet.test.mjs");
const counts = Object.fromEntries(
  files.map((f) => [f, (readRaw(`${DIR}/${f}`).match(/\b(readCode|readRaw)\(/g) ?? []).length]).filter(([, n]) => n > 0),
);

if (process.env.UPDATE_SOURCE_SCAN_BASELINE === "1") {
  const prev = JSON.parse(fs.readFileSync(BASELINE, "utf8"));
  fs.writeFileSync(BASELINE, JSON.stringify({ lint: prev.lint, counts }, null, 2) + "\n");
}

const baseline = JSON.parse(fs.readFileSync(BASELINE, "utf8"));

test("no test file reads more source than it did yesterday", () => {
  const worse = [];
  for (const [f, n] of Object.entries(counts)) {
    if (baseline.lint.includes(f)) continue;
    const allowed = baseline.counts[f] ?? 0;
    if (n > allowed) worse.push(`${f}: ${n} source reads, baseline ${allowed}`);
  }
  assert.deepEqual(worse, [], "write a behaviour test instead; if this file IS a repo-wide lint, add it to `lint` in the baseline with a reason in the PR");
});

test("the baseline is not stale", () => {
  const better = Object.entries(baseline.counts).filter(([f, n]) => (counts[f] ?? 0) < n);
  assert.deepEqual(better.map(([f, n]) => `${f}: now ${counts[f] ?? 0}, baseline ${n}`), [],
    "good — now lower the baseline: UPDATE_SOURCE_SCAN_BASELINE=1 pnpm test");
});
```

- [ ] **Step 2: Seed the baseline**

```bash
cat > tooling/scripts/tests/source-scan-baseline.json <<'EOF'
{ "lint": ["e2e-shape.test.mjs", "workspace-scoping.test.mjs", "env-manifest.test.mjs", "hygiene.test.mjs", "ops-hygiene.test.mjs", "runtime-freshness.test.mjs"], "counts": {} }
EOF
UPDATE_SOURCE_SCAN_BASELINE=1 node --import tsx --test tooling/scripts/tests/source-scan-ratchet.test.mjs
```

Expected: both tests PASS and `source-scan-baseline.json` now lists every test file with a nonzero count. Open it and confirm the six `lint` files are the only ones that should be exempt; remove any from the list that pin a single module.

- [ ] **Step 3: Verify the ratchet bites**

Add a line `readCode("x");` to any non-lint test file, run the ratchet test, confirm FAIL naming that file, revert the line.

- [ ] **Step 4: Commit**

```bash
git add tooling/scripts/tests/source-scan-ratchet.test.mjs tooling/scripts/tests/source-scan-baseline.json
git -c core.safecrlf=false commit -m "Source-scan assertions may only get fewer"
```

---

## Phase 1: The outbox — time lives in the row

> **As built: #320 (migration 00098), live 2026-09-10.** Four departures from the text below, each because the text was wrong against the code or the schema of the day. Jobs are claimed ONE at a time: a batch leaves claimed-but-unstarted jobs that come back looking like runs that died mid-send. A looping handler gets a yield deadline, because a shared function no longer gives each broadcast batch its own sixty seconds. The two row clocks stay separate 10-second cron jobs rather than folding into the tick, so one failing cannot stop the other or the ledger. And `sweep_health()` was rebuilt from 00086, with `sweep_status_sweep_check` left at its nine sweeps. Found on the way: 00018 seeds the production edge address into every Vault; `supabase/seed.sql` removes it on local and CI databases.

**Files:**
- Create: `supabase/migrations/00081_jobs_outbox.sql` (use the next free number if Round Two shipped; update the one test that names it)
- Rewrite: `packages/jobs/src/schedule.ts`
- Create: `packages/jobs/src/ledger.ts`, `packages/jobs/src/settle.ts`, `packages/jobs/src/tick.ts`
- Modify: `packages/jobs/src/index.ts`, `packages/jobs/src/handlers.ts`, `packages/jobs/package.json`
- Create: `apps/edge/api/jobs/tick.ts`, `apps/edge/lib/cron-auth.ts`
- Rewrite: `apps/edge/api/jobs/fire.ts` (retired responder)
- Delete: `apps/edge/api/cron/jobs.ts`, `apps/edge/lib/jobs-recovery.ts`, `tooling/scripts/tests/stale-jobs.test.mjs`
- Modify: `apps/edge/lib/draft-queue.ts`, `apps/edge/lib/playbooks.ts`, `apps/edge/api/admin/steer.ts`, `apps/edge/api/diag.ts`, `apps/edge/lib/whatsapp/persist.ts`, `apps/edge/lib/whatsapp/inbound.ts`, `apps/edge/lib/sweep-health.ts`, `apps/edge/package.json`, `apps/edge/.env.example`
- Modify: `apps/dashboard/src/server/service.ts`, `apps/dashboard/.env.example`, and the five conversation routes that schedule or cancel timer jobs
- Modify: `packages/contracts/src/enums.ts`
- Create: `tooling/scripts/tests/jobs-ledger.test.mjs`, `tooling/scripts/tests/jobs-tick.test.mjs`, `tooling/scripts/tests/jobs-outbox.integration.test.mjs`
- Create: `.github/workflows/integration.yml`; modify `package.json`

### Task 1.1: The ledger's pure rules

**Files:** Create `packages/jobs/src/ledger.ts`; Test `tooling/scripts/tests/jobs-ledger.test.mjs`

- [ ] **Step 1: Write the failing test**

```javascript
import { test } from "node:test";
import assert from "node:assert/strict";
import { verdictFor, LEASE_SECONDS, MAX_ATTEMPTS, SPEAKS_TO_A_PERSON } from "../../../packages/jobs/src/ledger.ts";

test("a first run always runs", () => {
  for (const kind of ["outbound_send", "broadcast_send", "blob_thread_erase"]) {
    assert.equal(verdictFor({ kind, attempts: 1 }), "run", kind);
  }
});

test("work that speaks to a person is never re-run after a lease expired", () => {
  // The run may have died AFTER the provider accepted the message and BEFORE
  // the status write. Re-running risks a second text to a real person; the
  // honest outcome is to fail it and tell the owner what is unknown.
  for (const kind of SPEAKS_TO_A_PERSON) {
    assert.equal(verdictFor({ kind, attempts: 2 }), "give_up", kind);
  }
});

test("internal work retries up to the cap, then gives up", () => {
  assert.equal(verdictFor({ kind: "blob_thread_erase", attempts: 2 }), "run");
  assert.equal(verdictFor({ kind: "blob_thread_erase", attempts: MAX_ATTEMPTS }), "run");
  assert.equal(verdictFor({ kind: "blob_thread_erase", attempts: MAX_ATTEMPTS + 1 }), "give_up");
});

test("a lease outlives one run, so two runs never overlap on one row", () => {
  // api/jobs/tick.ts sets maxDuration 60. If the lease were shorter, a second
  // tick could re-claim a row whose first run is still inside the provider call.
  assert.ok(LEASE_SECONDS > 60, `lease ${LEASE_SECONDS}s must exceed the function's 60s maxDuration`);
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
node --import tsx --test tooling/scripts/tests/jobs-ledger.test.mjs
```

Expected: FAIL — `Cannot find module '.../packages/jobs/src/ledger.ts'`.

- [ ] **Step 3: Write the module**

```typescript
/**
 * The jobs ledger's rules, and the four writes that move a row through them.
 *
 * scheduled --claim_due_jobs--> fired --completeJob--> done
 *                                    \--failJob------> failed
 * scheduled --cancelJob-------> canceled
 *
 * `claim_due_jobs` (SQL) is the only way in to 'fired' and it also re-claims a
 * 'fired' row whose lease expired: the run that held it never reported back.
 * Whether that re-claim RUNS or GIVES UP is `verdictFor`, and it is pure.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@chanlytics/db";

export type Db = SupabaseClient<Database>;

/** Longer than api/jobs/tick.ts maxDuration (60s), so one row is never run twice at once. */
export const LEASE_SECONDS = 90;
/** Re-claims allowed for internal work before it is failed and reported. */
export const MAX_ATTEMPTS = 3;
/** Kinds whose re-run could reach a real person a second time. */
export const SPEAKS_TO_A_PERSON: ReadonlySet<string> = new Set(["outbound_send", "broadcast_send"]);

export const RUN_INTERRUPTED = "the run did not finish; its outcome is unknown";

export interface LedgerRow {
  id: string;
  tenant_id: string;
  kind: string;
  payload: Json;
  due_at: string;
  /** Incremented by the claim: 1 on the first run, 2+ when a lease expired before the last run reported back. */
  attempts: number;
}

export type Verdict = "run" | "give_up";

export function verdictFor(job: { kind: string; attempts: number }): Verdict {
  if (job.attempts <= 1) return "run";
  if (SPEAKS_TO_A_PERSON.has(job.kind)) return "give_up";
  return job.attempts > MAX_ATTEMPTS ? "give_up" : "run";
}

export async function claimDue(db: Db, limit: number, leaseSeconds: number): Promise<LedgerRow[]> {
  const { data, error } = await db.rpc("claim_due_jobs", { p_limit: limit, p_lease_seconds: leaseSeconds } as never);
  if (error) throw new Error(`claim_due_jobs: ${error.message}`);
  return (data ?? []) as unknown as LedgerRow[];
}

/**
 * Both exits compare-and-swap on state AND attempts: a run whose lease expired
 * and was re-claimed must not be able to finish the row out from under the run
 * that now holds it. Zero rows means exactly that, and the caller logs it.
 */
export async function completeJob(db: Db, job: { id: string; attempts: number }): Promise<boolean> {
  const { data, error } = await db
    .from("jobs")
    .update({ state: "done", lease_until: null })
    .eq("id", job.id)
    .eq("state", "fired")
    .eq("attempts", job.attempts)
    .select("id");
  if (error) throw new Error(`complete_job: ${error.message}`);
  return (data?.length ?? 0) > 0;
}

export async function failJob(db: Db, job: { id: string; attempts: number }, reason: string): Promise<boolean> {
  const { data, error } = await db
    .from("jobs")
    .update({ state: "failed", last_error: reason.slice(0, 500), lease_until: null })
    .eq("id", job.id)
    .eq("state", "fired")
    .eq("attempts", job.attempts)
    .select("id");
  if (error) throw new Error(`fail_job: ${error.message}`);
  return (data?.length ?? 0) > 0;
}
```

- [ ] **Step 4: Run the test**

```bash
node --import tsx --test tooling/scripts/tests/jobs-ledger.test.mjs
```

Expected: 4 PASS. (`lease_until` does not exist in the generated types yet; that is fine for this test, which imports the file through tsx without typechecking. Task 1.3 adds the column and regenerates.)

- [ ] **Step 5: Commit**

```bash
git add packages/jobs/src/ledger.ts tooling/scripts/tests/jobs-ledger.test.mjs
git -c core.safecrlf=false commit -m "The ledger's rules in one place, and pure"
```

### Task 1.2: Settlement — what a job leaves behind

**Files:** Create `packages/jobs/src/settle.ts`

- [ ] **Step 1: Write it**

```typescript
/**
 * What a job leaves behind when it will not run.
 *
 * The ledger row is half the truth. An outbound_send that never ran left a
 * message saying "Sending…" for ever; a broadcast whose chain broke sat in
 * 'sending' with half its recipients done. Only the kind knows what it was in
 * the middle of, so settlement is per kind, every write is conditional on the
 * state it expects, and every outcome — including a failed write — is returned
 * rather than swallowed, so the alert can say what actually happened.
 */
import type { Json } from "@chanlytics/db";
import type { Db } from "./ledger";

export interface Settlement {
  /** Plain English, addressed to the owner. */
  what: string;
  settled: boolean;
  error?: string;
}

export async function settleFor(
  db: Db,
  job: { id: string; kind: string; tenant_id: string; payload: Json },
  reason: string,
): Promise<Settlement[]> {
  const p = (typeof job.payload === "object" && job.payload !== null ? job.payload : {}) as Record<string, unknown>;
  const out: Settlement[] = [];

  if (job.kind === "outbound_send" && typeof p.message_id === "string") {
    // Conditional on 'queued': if the run DID record the send before dying the
    // row already says 'sent', and saying otherwise would lie about a message
    // that reached someone.
    const { data, error } = await db
      .from("messages")
      .update({ status: "failed", error: { reason: "job_failed", note: reason } })
      .eq("id", p.message_id)
      .eq("tenant_id", job.tenant_id)
      .eq("status", "queued")
      .select("id");
    out.push({
      what: "the message no longer shows as sending",
      settled: !error && (data?.length ?? 0) > 0,
      ...(error ? { error: error.message } : {}),
    });
  }

  if (job.kind === "broadcast_send" && typeof p.broadcast_id === "string") {
    const { data, error } = await db
      .from("broadcasts")
      .update({ state: "failed", finished_at: new Date().toISOString() })
      .eq("id", p.broadcast_id)
      .eq("tenant_id", job.tenant_id)
      .eq("state", "sending")
      .select("id");
    out.push({
      what: "the broadcast is marked failed; the people it had already reached still got it",
      settled: !error && (data?.length ?? 0) > 0,
      ...(error ? { error: error.message } : {}),
    });
  }

  // blob_thread_erase: nothing to settle — the stored copy either went or did
  // not, and the alert tells the owner to retry from the contact's page.
  return out;
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/jobs/src/settle.ts
git -c core.safecrlf=false commit -m "A job that will not run settles what it was in the middle of"
```

### Task 1.3: The tick, as orchestration behind ports

**Files:** Create `packages/jobs/src/tick.ts`; Test `tooling/scripts/tests/jobs-tick.test.mjs`

- [ ] **Step 1: Write the failing tests**

```javascript
import { test } from "node:test";
import assert from "node:assert/strict";
import { runTick } from "../../../packages/jobs/src/tick.ts";
import { RUN_INTERRUPTED } from "../../../packages/jobs/src/ledger.ts";

const job = (id, kind = "blob_thread_erase", attempts = 1) =>
  ({ id, tenant_id: "t1", kind, payload: { message_id: `m-${id}` }, due_at: "2026-01-01T00:00:00Z", attempts });

function fakes(jobs, opts = {}) {
  const { throwOn = new Set(), unknown = new Set(), completeLost = new Set(), clock = [0] } = opts;
  const queue = [...jobs];
  const calls = { dispatch: [], complete: [], fail: [], settle: [], alert: [], log: [] };
  let tick = 0;
  const ports = {
    claim: async (limit) => queue.splice(0, limit),
    dispatch: async (j) => {
      calls.dispatch.push(j.id);
      if (throwOn.has(j.id)) throw new Error(`boom ${j.id}`);
      return unknown.has(j.id) ? "unknown_kind" : "done";
    },
    complete: async (j) => { calls.complete.push(j.id); return !completeLost.has(j.id); },
    fail: async (j, reason) => { calls.fail.push([j.id, reason]); return true; },
    settle: async (j) => { calls.settle.push(j.id); return [{ what: "the message no longer shows as sending", settled: true }]; },
    alert: async (j, subject, body) => { calls.alert.push([j.id, subject, body]); },
    log: { info: (e, f) => calls.log.push(["info", e, f]), warn: (e, f) => calls.log.push(["warn", e, f]), error: (e, f) => calls.log.push(["error", e, f]) },
    now: () => clock[Math.min(tick++, clock.length - 1)],
  };
  return { ports, calls, queue };
}

const opts = { budgetMs: 40_000, batch: 2, leaseSeconds: 90 };

test("every due job runs once and is completed; the loop stops when nothing is due", async () => {
  const { ports, calls } = fakes([job("a"), job("b"), job("c")]);
  const counts = await runTick(ports, opts);
  assert.deepEqual(calls.dispatch, ["a", "b", "c"]);
  assert.deepEqual(calls.complete, ["a", "b", "c"]);
  assert.deepEqual(calls.fail, []);
  assert.equal(counts.done, 3);
  assert.equal(counts.batches, 2, "two batches of two, the second short");
});

test("a handler that throws fails its job, settles, alerts — and the rest still run", async () => {
  const { ports, calls } = fakes([job("a"), job("b"), job("c")], { throwOn: new Set(["b"]) });
  const counts = await runTick(ports, opts);
  assert.deepEqual(calls.dispatch, ["a", "b", "c"]);
  assert.deepEqual(calls.fail, [["b", "boom b"]]);
  assert.deepEqual(calls.settle, ["b"]);
  assert.equal(calls.alert.length, 1);
  assert.match(calls.alert[0][2], /no longer shows as sending/, "the alert names what was settled");
  assert.equal(counts.failed, 1);
  assert.equal(counts.done, 2);
});

test("an unknown kind is failed and reported, never silently completed", async () => {
  const { ports, calls } = fakes([job("a", "made_up")], { unknown: new Set(["a"]) });
  await runTick(ports, opts);
  assert.deepEqual(calls.complete, []);
  assert.equal(calls.fail[0][0], "a");
  assert.match(calls.fail[0][1], /unknown job kind made_up/);
  assert.equal(calls.alert.length, 1);
});

test("a re-claimed job that speaks to a person is given up without being dispatched", async () => {
  const { ports, calls } = fakes([job("a", "outbound_send", 2)]);
  const counts = await runTick(ports, opts);
  assert.deepEqual(calls.dispatch, [], "re-running could text a real person twice");
  assert.deepEqual(calls.fail, [["a", RUN_INTERRUPTED]]);
  assert.deepEqual(calls.settle, ["a"]);
  assert.match(calls.alert[0][1], /did not finish/);
  assert.equal(counts.gaveUp, 1);
});

test("a re-claimed internal job runs again", async () => {
  const { ports, calls } = fakes([job("a", "blob_thread_erase", 2)]);
  await runTick(ports, opts);
  assert.deepEqual(calls.dispatch, ["a"]);
  assert.deepEqual(calls.complete, ["a"]);
});

test("the budget is respected: no new batch is claimed once time is up", async () => {
  // now() is read once at start and once per loop check: 0, then 50s.
  const { ports, calls, queue } = fakes([job("a"), job("b"), job("c")], { clock: [0, 50_000] });
  await runTick(ports, opts);
  assert.deepEqual(calls.dispatch, [], "the first check already found the budget spent");
  assert.equal(queue.length, 3, "nothing was claimed");
});

test("a completion that matched no row is logged, not thrown, and not counted as done", async () => {
  const { ports, calls } = fakes([job("a")], { completeLost: new Set(["a"]) });
  const counts = await runTick(ports, opts);
  assert.equal(counts.done, 0);
  assert.ok(calls.log.some(([lvl, e]) => lvl === "warn" && e === "job_complete_lost_race"));
});

test("a failing alert does not turn a recorded failure into an unrecorded one", async () => {
  const { ports, calls } = fakes([job("a")], { throwOn: new Set(["a"]) });
  ports.alert = async () => { throw new Error("mail down"); };
  const counts = await runTick(ports, opts);
  assert.equal(counts.failed, 1);
  assert.deepEqual(calls.fail.map(([id]) => id), ["a"]);
  assert.ok(calls.log.some(([lvl, e]) => lvl === "error" && e === "job_alert_failed"));
});
```

- [ ] **Step 2: Run to verify failure**

```bash
node --import tsx --test tooling/scripts/tests/jobs-tick.test.mjs
```

Expected: FAIL — cannot find `tick.ts`.

- [ ] **Step 3: Write the module**

```typescript
/**
 * One heartbeat over the ledger.
 *
 * Claims whatever is due (or whose lease expired), runs it, records the
 * outcome. Everything it touches is a port, so this file is tested by calling
 * it — not by reading it. api/jobs/tick.ts builds the ports from the database
 * and the tenant's credentials; this file never imports either.
 */
import { verdictFor, RUN_INTERRUPTED, type LedgerRow } from "./ledger";
import type { Settlement } from "./settle";

export type TickFields = Record<string, string | number | boolean | null | undefined>;

export interface TickLog {
  info(event: string, fields?: TickFields): void;
  warn(event: string, fields?: TickFields): void;
  error(event: string, fields?: TickFields): void;
}

export interface TickPorts {
  claim(limit: number, leaseSeconds: number): Promise<LedgerRow[]>;
  dispatch(job: LedgerRow): Promise<"done" | "unknown_kind">;
  complete(job: LedgerRow): Promise<boolean>;
  fail(job: LedgerRow, reason: string): Promise<boolean>;
  settle(job: LedgerRow, reason: string): Promise<Settlement[]>;
  alert(job: LedgerRow, subject: string, body: string): Promise<void>;
  log: TickLog;
  now(): number;
}

export interface TickOptions {
  budgetMs: number;
  batch: number;
  leaseSeconds: number;
}

export interface TickCounts {
  claimed: number;
  done: number;
  failed: number;
  gaveUp: number;
  batches: number;
}

export async function runTick(ports: TickPorts, opts: TickOptions): Promise<TickCounts> {
  const started = ports.now();
  const c: TickCounts = { claimed: 0, done: 0, failed: 0, gaveUp: 0, batches: 0 };

  while (ports.now() - started < opts.budgetMs) {
    const jobs = await ports.claim(opts.batch, opts.leaseSeconds);
    if (jobs.length === 0) break;
    c.batches += 1;

    for (const job of jobs) {
      c.claimed += 1;
      if (verdictFor(job) === "give_up") {
        await conclude(ports, job, RUN_INTERRUPTED, `A ${job.kind} job did not finish`,
          `Job ${job.id} (${job.kind}) started and never reported back, so ${RUN_INTERRUPTED}.`);
        c.gaveUp += 1;
        continue;
      }
      try {
        const outcome = await ports.dispatch(job);
        if (outcome === "unknown_kind") {
          await conclude(ports, job, `unknown job kind ${job.kind}`, `A ${job.kind} job could not run`,
            `Job ${job.id} has a kind this runner does not know (${job.kind}).`);
          c.failed += 1;
          continue;
        }
        const marked = await ports.complete(job);
        if (marked) c.done += 1;
        else ports.log.warn("job_complete_lost_race", { job_id: job.id, kind: job.kind, attempts: job.attempts });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        await conclude(ports, job, msg, `A ${job.kind} job failed`,
          `Job ${job.id} (${job.kind}) failed and will not retry on its own.\n\n${msg}`);
        c.failed += 1;
      }
    }
  }
  return c;
}

/**
 * Fail the row, settle what it left behind, tell the owner what was settled.
 * Each step is best-effort relative to the one before: a settlement that
 * fails is reported in the alert, and an alert that fails is logged — a
 * recorded failure must never become an unrecorded one.
 */
async function conclude(ports: TickPorts, job: LedgerRow, reason: string, subject: string, lead: string): Promise<void> {
  let failed = false;
  try {
    failed = await ports.fail(job, reason);
  } catch (e) {
    ports.log.error("job_fail_write_failed", { job_id: job.id, error: e instanceof Error ? e.message : String(e) });
    return;
  }
  if (!failed) {
    // Someone else finished this row first (a lease expired and the re-claim
    // concluded it). Nothing to settle, nothing new to say.
    ports.log.warn("job_fail_lost_race", { job_id: job.id, kind: job.kind, attempts: job.attempts });
    return;
  }

  let settlements: Settlement[] = [];
  try {
    settlements = await ports.settle(job, reason);
  } catch (e) {
    settlements = [{ what: "its side effects", settled: false, error: e instanceof Error ? e.message : String(e) }];
  }
  ports.log.info("job_failed", { job_id: job.id, tenant_id: job.tenant_id, kind: job.kind, attempts: job.attempts, reason });

  const done = settlements.filter((s) => s.settled).map((s) => `${s.what[0].toUpperCase()}${s.what.slice(1)}.`);
  const notDone = settlements.filter((s) => !s.settled).map((s) => `Could not settle ${s.what}${s.error ? ` (${s.error})` : ""} — check it by hand.`);
  const tail = job.kind === "outbound_send"
    ? "If the run was interrupted mid-send the customer may still have received it; check the conversation before sending it again."
    : job.kind === "blob_thread_erase"
      ? "The stored copy may still exist; retry the erase from the contact's page."
      : "Nothing else will run it.";
  const body = [lead, ...done, ...notDone, tail].join("\n\n");

  try {
    await ports.alert(job, subject, body);
  } catch (e) {
    ports.log.error("job_alert_failed", { job_id: job.id, error: e instanceof Error ? e.message : String(e) });
  }
}
```

- [ ] **Step 4: Run the tests**

```bash
node --import tsx --test tooling/scripts/tests/jobs-tick.test.mjs
```

Expected: 8 PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/jobs/src/tick.ts tooling/scripts/tests/jobs-tick.test.mjs
git -c core.safecrlf=false commit -m "The heartbeat over the ledger, tested by running it"
```

### Task 1.4: The migration

**Files:** Create `supabase/migrations/00081_jobs_outbox.sql`

- [ ] **Step 1: Confirm the number and the health function's exact text**

```bash
ls supabase/migrations | tail -3
sed -n '270,384p' supabase/migrations/00026_sweep_health.sql
```

If `00081` exists, name this file with the next free number. Keep the `sweep_health()` text from the second command open; Step 2 pastes it with one added row.

- [ ] **Step 2: Write the migration**

```sql
-- 00081 · Time lives in the row.
--
-- A job was a row AND a QStash message, and only the row could be observed.
-- Every recovery problem in #256, #261, #262, #263 and the Round Two plan was
-- the same problem: two clocks for one event. From here the row is the only
-- clock. A pg_cron heartbeat every ten seconds asks one question — is anything
-- due? — and calls the edge only when the answer is yes. The edge claims due
-- rows with SKIP LOCKED, runs them, and records the outcome. A job that did
-- not run is simply still due; there is no re-publish, no dedup window, no
-- signature to verify, no second identity to keep in step.
--
-- Snoozed and paused threads reopen from their own timestamps on the same
-- heartbeat, so the two timer job kinds are retired: the row already knew
-- when to wake; the job only knew how to ask a broker to remind us.

-- ------------------------------------------------------------------ the lease
alter table public.jobs add column if not exists lease_until timestamptz;
comment on column public.jobs.lease_until is
  'While set and in the future, a run holds this row. Past it, the run is presumed dead and the tick may claim the row again (attempts + 1); whether it re-runs or gives up is the kind''s rule in packages/jobs/src/ledger.ts.';
create index if not exists jobs_lease_idx on public.jobs (lease_until) where state = 'fired';

-- Rows the old fire callback claimed and that never came back: give them a
-- lease that has already expired, so the heartbeat judges them once.
update public.jobs set lease_until = coalesce(fired_at, now()) + interval '90 seconds'
 where state = 'fired' and lease_until is null;

-- ---------------------------------------------------------------- the claim
create or replace function public.claim_due_jobs(p_limit int, p_lease_seconds int)
returns setof public.jobs
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with due as (
    select id
      from public.jobs
     where (state = 'scheduled' and due_at <= now())
        or (state = 'fired' and lease_until is not null and lease_until < now())
     order by due_at
     limit p_limit
     for update skip locked
  )
  update public.jobs j
     set state       = 'fired',
         fired_at    = now(),
         attempts    = j.attempts + 1,
         lease_until = now() + make_interval(secs => p_lease_seconds)
    from due
   where j.id = due.id
  returning j.*;
end $$;
revoke execute on function public.claim_due_jobs(int, int) from public, anon, authenticated;
comment on function public.claim_due_jobs(int, int) is
  'The ONLY way a job becomes fired. Concurrent ticks claim disjoint rows (SKIP LOCKED). attempts counts claims: 1 is the first run; more means a lease expired.';

-- ---------------------------------------------------------------- the guard
-- The machine, enforced where every writer has to pass. messages_guard did
-- this for messages from the first migration; jobs had six writers each
-- remembering their own .eq("state", …).
create or replace function public.jobs_guard() returns trigger
language plpgsql as $$
begin
  if OLD.state in ('done', 'failed', 'canceled') and NEW.state is distinct from OLD.state then
    raise exception 'jobs.state is terminal (% -> % rejected)', OLD.state, NEW.state;
  end if;
  if OLD.state = 'scheduled' and NEW.state not in ('scheduled', 'fired', 'canceled') then
    raise exception 'a scheduled job may only be fired or canceled (% rejected)', NEW.state;
  end if;
  if OLD.state = 'fired' and NEW.state not in ('fired', 'done', 'failed') then
    raise exception 'a fired job may only finish or fail (% rejected)', NEW.state;
  end if;
  return NEW;
end $$;
drop trigger if exists jobs_guard on public.jobs;
create trigger jobs_guard before update on public.jobs
  for each row execute function public.jobs_guard();

-- ------------------------------------------------- the retired timer kinds
-- Their rows' own timestamps are the clock now (wake_snoozed, expire_stale_pauses
-- below). Scheduled ones are withdrawn — the row will still wake on time.
update public.jobs set state = 'canceled'
 where kind in ('snooze_wake', 'pause_expire') and state = 'scheduled';
alter table public.jobs drop constraint if exists jobs_kind_check;
alter table public.jobs add constraint jobs_kind_check
  check (kind in ('outbound_send', 'broadcast_send', 'blob_thread_erase')) not valid;

-- ----------------------------------------------------- the broker's columns
drop index if exists public.jobs_qstash_uq;
alter table public.jobs drop column if exists qstash_id;
alter table public.jobs drop column if exists republishes;
alter table public.jobs drop column if exists last_republish_at;
drop function if exists public.claim_job(uuid);
drop function if exists public.fail_job(uuid, text);

-- ------------------------------------------------------------ the row clocks
create or replace function public.wake_snoozed() returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  with woken as (
    update conversations c
       set state = 'open', snooze_until = null
     where c.state = 'snoozed'
       and c.snooze_until is not null
       and c.snooze_until <= now()
    returning c.id, c.tenant_id
  )
  insert into events (tenant_id, kind, category, subject_type, subject_id, data)
  select tenant_id, 'conversation.snooze_woke', 'conversation', 'conversation', id, '{}'::jsonb
    from woken;
  get diagnostics v_count = row_count;
  return v_count;
end $$;
revoke execute on function public.wake_snoozed() from public, anon, authenticated;

-- ------------------------------------------------------------- the heartbeat
alter table public.sweep_status drop constraint if exists sweep_status_sweep_check;
alter table public.sweep_status add constraint sweep_status_sweep_check
  check (sweep in ('calls', 'deadman', 'health', 'jobs'));

create or replace function public.trigger_jobs_tick()
returns bigint
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_key text;
  v_url text;
  v_id  bigint;
begin
  -- The row clocks first. Cheap, and they need no edge at all.
  perform public.expire_stale_pauses();
  perform public.wake_snoozed();

  -- The heartbeat is recorded every tick, whether or not the edge is called,
  -- so sweep_health() can tell a quiet ledger from a dead pg_cron. request_id
  -- is kept from the last REAL call so its response can still be judged; a
  -- failed answer therefore stays visible until the next real call replaces
  -- it, which is the honest state of affairs.
  if not exists (
    select 1 from public.jobs
     where (state = 'scheduled' and due_at <= now())
        or (state = 'fired' and lease_until < now())
  ) then
    insert into public.sweep_status (sweep, requested_at, note) values ('jobs', now(), null)
    on conflict (sweep) do update set requested_at = excluded.requested_at, note = null;
    return null;
  end if;

  select public.get_cron_sweep_key() into v_key;
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'edge_base_url';
  if v_key is null or v_url is null then
    insert into public.sweep_status (sweep, note) values ('jobs', 'missing cron_sweep_key or edge_base_url in Vault')
    on conflict (sweep) do update set note = excluded.note;
    return null;
  end if;
  select net.http_post(
    url     := v_url || '/api/jobs/tick',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-key', v_key),
    body    := '{}'::jsonb,
    timeout_milliseconds := 55000
  ) into v_id;
  insert into public.sweep_status (sweep, request_id, requested_at, note) values ('jobs', v_id, now(), null)
  on conflict (sweep) do update set request_id = excluded.request_id, requested_at = excluded.requested_at, note = null;
  return v_id;
end $$;
revoke execute on function public.trigger_jobs_tick() from public, anon, authenticated;

-- One clock. The quarter-hour pause sweep and the stale-jobs sweep are this
-- heartbeat now.
select cron.unschedule('expire-stale-pauses') where exists (select 1 from cron.job where jobname = 'expire-stale-pauses');
select cron.unschedule('stale-jobs-sweep')     where exists (select 1 from cron.job where jobname = 'stale-jobs-sweep');
select cron.unschedule('jobs-tick')            where exists (select 1 from cron.job where jobname = 'jobs-tick');
select cron.schedule('jobs-tick', '10 seconds', $$select public.trigger_jobs_tick()$$);

-- ----------------------------------------------------------- watch the heart
-- sweep_health() gains one row. Paste the function from 00026 lines 276–384
-- verbatim here, adding this row directly after the ('health', …) row:
--
--      -- the heartbeat writes requested_at every ten seconds whether or not
--      -- it calls the edge. Three minutes is eighteen consecutive missed
--      -- ticks: pg_cron skipping one under load is not evidence; eighteen is.
--      ('jobs',          'jobs-tick',            interval '3 minutes'),
--
-- (Do not retype the function; copy it. Its body is the health contract.)
```

Then paste `create or replace function public.sweep_health() … $$;` from `00026` with the added row, below that comment block.

- [ ] **Step 3: Apply locally first**

```bash
supabase start
supabase db reset
```

Expected: all migrations apply; the last lines mention `00081_jobs_outbox.sql`. If `supabase start` fails on a missing extension, enable it in `supabase/config.toml` (`pg_cron`, `pg_net`, `supabase_vault` must be on) and retry. Then:

```bash
docker exec -i "$(docker ps -qf name=supabase_db)" psql -U postgres -c "select jobname, schedule from cron.job order by jobname"
```

Expected: `jobs-tick | 10 seconds` present; `expire-stale-pauses` and `stale-jobs-sweep` absent. (The `cron` schema is not exposed through PostgREST, so this goes through the local container's `psql`.)

- [ ] **Step 4: Apply to production and regenerate types**

```bash
supabase db push --linked
cd packages/db && supabase gen types typescript --linked > src/database.types.ts && cd ../..
git diff --stat packages/db/src/database.types.ts
```

Expected diff: `lease_until` added; `qstash_id`, `republishes` (and `last_republish_at` if present) removed from `jobs`; `claim_due_jobs`, `wake_snoozed`, `trigger_jobs_tick` added under Functions; `claim_job`, `fail_job` removed.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/00081_jobs_outbox.sql packages/db/src/database.types.ts
git -c core.safecrlf=false commit -m "Time lives in the row: one heartbeat over the ledger"
```

### Task 1.5: The integration test that proves the SQL

**Files:** Create `tooling/scripts/tests/jobs-outbox.integration.test.mjs`; modify `package.json`

- [ ] **Step 1: Add the script**

In the root `package.json` scripts, after `"test"`:

```json
    "test:integration": "node --import tsx --test tooling/scripts/tests/*.integration.test.mjs",
```

- [ ] **Step 2: Write the test**

```javascript
/**
 * The outbox's invariants live in SQL, so they are proved against Postgres.
 * Run against `supabase start` (never production: a due row here would be
 * claimed by the real heartbeat within ten seconds):
 *
 *   SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_SERVICE_ROLE_KEY=$(supabase status -o env | sed -n 's/^SERVICE_ROLE_KEY="\(.*\)"$/\1/p') pnpm test:integration
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";

const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const skip = !URL_ || !KEY ? "no service-role credentials in env" : false;

let db;
let tenantId;
const ago = (s) => new Date(Date.now() - s * 1000).toISOString();
const ahead = (s) => new Date(Date.now() + s * 1000).toISOString();

before(async () => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
  const first = new Date(); first.setUTCDate(1); first.setUTCHours(0, 0, 0, 0);
  await db.rpc("ensure_events_partition", { p_month: first.toISOString().slice(0, 10) });
  const { data, error } = await db.from("tenants").insert({ slug: `outbox-probe-${Date.now()}`, name: "Outbox probe" }).select("id").single();
  assert.equal(error, null, error?.message);
  tenantId = data.id;
});

after(async () => {
  if (skip || !tenantId) return;
  await db.from("tenants").delete().eq("id", tenantId);
});

const insertJob = async (patch) => {
  const { data, error } = await db.from("jobs")
    .insert({ tenant_id: tenantId, kind: "blob_thread_erase", due_at: ago(60), payload: {}, ...patch })
    .select("id").single();
  assert.equal(error, null, error?.message);
  return data.id;
};

test("claim_due_jobs takes what is due and leaves what is not", { skip }, async () => {
  const due = await insertJob({});
  const later = await insertJob({ due_at: ahead(3600) });
  const { data, error } = await db.rpc("claim_due_jobs", { p_limit: 50, p_lease_seconds: 90 });
  assert.equal(error, null, error?.message);
  const ids = data.map((r) => r.id);
  assert.ok(ids.includes(due));
  assert.ok(!ids.includes(later));
  const row = data.find((r) => r.id === due);
  assert.equal(row.state, "fired");
  assert.equal(row.attempts, 1);
  assert.ok(Date.parse(row.lease_until) > Date.now() + 80_000, "lease is ~90s out");
});

test("two concurrent claims take disjoint rows", { skip }, async () => {
  await Promise.all([insertJob({}), insertJob({}), insertJob({}), insertJob({})]);
  const [a, b] = await Promise.all([
    db.rpc("claim_due_jobs", { p_limit: 2, p_lease_seconds: 90 }),
    db.rpc("claim_due_jobs", { p_limit: 2, p_lease_seconds: 90 }),
  ]);
  const ids = [...a.data, ...b.data].map((r) => r.id);
  assert.equal(new Set(ids).size, ids.length, "SKIP LOCKED: no row claimed twice");
});

test("an expired lease is re-claimed with attempts + 1; a live one is not", { skip }, async () => {
  const dead = await insertJob({ state: "fired", fired_at: ago(200), lease_until: ago(10), attempts: 1 });
  const alive = await insertJob({ state: "fired", fired_at: ago(5), lease_until: ahead(80), attempts: 1 });
  const { data } = await db.rpc("claim_due_jobs", { p_limit: 50, p_lease_seconds: 90 });
  const ids = data.map((r) => r.id);
  assert.ok(ids.includes(dead));
  assert.ok(!ids.includes(alive));
  assert.equal(data.find((r) => r.id === dead).attempts, 2);
});

test("jobs_guard enforces the machine", { skip }, async () => {
  const id = await insertJob({});
  await db.rpc("claim_due_jobs", { p_limit: 50, p_lease_seconds: 90 });
  const done = await db.from("jobs").update({ state: "done" }).eq("id", id).eq("state", "fired").select("id");
  assert.equal(done.data.length, 1, "fired -> done is allowed");
  const back = await db.from("jobs").update({ state: "scheduled" }).eq("id", id);
  assert.match(back.error?.message ?? "", /terminal/, "done -> scheduled is refused by the database, not by a remembered .eq");
  const fresh = await insertJob({ due_at: ahead(3600) });
  const skipAhead = await db.from("jobs").update({ state: "done" }).eq("id", fresh);
  assert.match(skipAhead.error?.message ?? "", /only be fired or canceled/, "scheduled -> done is refused");
});

test("wake_snoozed reopens a thread whose time has come and leaves one whose has not", { skip }, async () => {
  // conversations are unique per (tenant, contact), so each gets its own contact.
  let n = 0;
  const mkConv = async (snooze_until) => {
    const { data: c, error: cErr } = await db.from("contacts")
      .insert({ tenant_id: tenantId, phone_e164: `+1555000${String(++n).padStart(4, "0")}` })
      .select("id").single();
    assert.equal(cErr, null, cErr?.message);
    const { data: v, error: vErr } = await db.from("conversations")
      .insert({ tenant_id: tenantId, contact_id: c.id, state: "snoozed", snooze_until })
      .select("id").single();
    assert.equal(vErr, null, vErr?.message);
    return v.id;
  };
  const dueConv = await mkConv(ago(5));
  const laterConv = await mkConv(ahead(3600));
  const { data: n, error } = await db.rpc("wake_snoozed");
  assert.equal(error, null, error?.message);
  assert.ok(n >= 1);
  const { data: rows } = await db.from("conversations").select("id, state, snooze_until").in("id", [dueConv, laterConv]);
  const byId = Object.fromEntries(rows.map((r) => [r.id, r]));
  assert.equal(byId[dueConv].state, "open");
  assert.equal(byId[dueConv].snooze_until, null);
  assert.equal(byId[laterConv].state, "snoozed");
  const { data: ev } = await db.from("events").select("id").eq("tenant_id", tenantId).eq("kind", "conversation.snooze_woke").eq("subject_id", dueConv);
  assert.equal(ev.length, 1, "the wake is on the record");
});
```

- [ ] **Step 3: Run it against local**

```bash
supabase start >/dev/null
export SUPABASE_URL=http://127.0.0.1:54321
export SUPABASE_SERVICE_ROLE_KEY=$(supabase status -o env | sed -n 's/^SERVICE_ROLE_KEY="\(.*\)"$/\1/p')
node --import tsx --test tooling/scripts/tests/jobs-outbox.integration.test.mjs
```

Expected: 5 PASS. Then run the whole integration set once to learn which existing files need live third parties:

```bash
pnpm test:integration
```

Any file that fails for want of a live external service (not the database) gets `const skip = … || (!process.env.LIVE_SERVICES ? "needs live services" : false)` and is listed in the PR description.

- [ ] **Step 4: Commit**

```bash
git add package.json tooling/scripts/tests/jobs-outbox.integration.test.mjs
git -c core.safecrlf=false commit -m "The outbox's invariants are proved against Postgres"
```

### Task 1.6: CI runs the integration tests against a local Supabase

**Files:** Create `.github/workflows/integration.yml`

- [ ] **Step 1: Write the workflow**

```yaml
name: Integration

on:
  pull_request:
  push:
    branches: [main]

jobs:
  postgres:
    name: SQL invariants against a local Supabase
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
      - uses: supabase/setup-cli@v1
        with:
          version: latest
      - run: pnpm install --frozen-lockfile
      # Applies every migration to a fresh database. This is also the only
      # place the migrations are replayed from zero on every PR.
      - run: supabase start -x studio,imgproxy,inbucket,edge-runtime,logflare,vector
      - run: |
          echo "SUPABASE_URL=http://127.0.0.1:54321" >> "$GITHUB_ENV"
          echo "SUPABASE_SERVICE_ROLE_KEY=$(supabase status -o env | sed -n 's/^SERVICE_ROLE_KEY="\(.*\)"$/\1/p')" >> "$GITHUB_ENV"
      - run: pnpm test:integration
      - if: always()
        run: supabase stop --no-backup
```

- [ ] **Step 2: Commit and confirm green on the PR**

```bash
git add .github/workflows/integration.yml
git -c core.safecrlf=false commit -m "Every PR replays the migrations and proves the SQL"
```

### Task 1.7: One insert to schedule; the runner; the retired callback

**Files:** Rewrite `packages/jobs/src/schedule.ts`; modify `packages/jobs/src/index.ts`, `packages/jobs/src/handlers.ts`, `packages/jobs/package.json`; create `apps/edge/lib/cron-auth.ts`, `apps/edge/api/jobs/tick.ts`; rewrite `apps/edge/api/jobs/fire.ts`

- [ ] **Step 1: `schedule.ts`**

```typescript
/**
 * Scheduling is one insert. The heartbeat (api/jobs/tick.ts) runs whatever is
 * due; there is no second system to tell and no orphan to clean up.
 */
import type { Json } from "@chanlytics/db";
import type { JobKind } from "@chanlytics/contracts";
import type { Db } from "./ledger";

export interface ScheduleParams {
  tenantId: string;
  kind: JobKind;
  dueAt: Date;
  payload: Json;
}

export async function scheduleJob(db: Db, p: ScheduleParams): Promise<{ jobId: string }> {
  const { data, error } = await db
    .from("jobs")
    .insert({ tenant_id: p.tenantId, kind: p.kind, due_at: p.dueAt.toISOString(), payload: p.payload })
    .select("id")
    .single();
  if (error || !data) throw new Error(`schedule_job: ${error?.message ?? "no row"}`);
  return { jobId: data.id };
}

/** Withdraw while still scheduled. A claimed row is past cancelling; the handler's own state checks are the guard from there. */
export async function cancelJob(db: Db, jobId: string): Promise<boolean> {
  const { data, error } = await db
    .from("jobs")
    .update({ state: "canceled" })
    .eq("id", jobId)
    .eq("state", "scheduled")
    .select("id");
  if (error) {
    console.error(JSON.stringify({ level: "error", event: "cancel_job_failed", job_id: jobId, error: error.message }));
    return false;
  }
  return (data?.length ?? 0) > 0;
}

/** Withdraw every scheduled job of a kind for one subject, in one statement. */
export async function cancelJobsFor(db: Db, tenantId: string, kind: JobKind, payloadKey: string, payloadValue: string): Promise<number> {
  const { data, error } = await db
    .from("jobs")
    .update({ state: "canceled" })
    .eq("tenant_id", tenantId)
    .eq("kind", kind)
    .eq("state", "scheduled")
    .eq(`payload->>${payloadKey}`, payloadValue)
    .select("id");
  if (error) {
    console.error(JSON.stringify({ level: "error", event: "cancel_jobs_for_failed", tenant_id: tenantId, kind, error: error.message }));
    return 0;
  }
  return data?.length ?? 0;
}
```

- [ ] **Step 2: `index.ts`**

```typescript
export * from "./schedule";
export * from "./handlers";
export * from "./ledger";
export * from "./settle";
export * from "./tick";
```

- [ ] **Step 3: `handlers.ts` — retire the timer kinds, require the runner's capabilities, throw on an unreadable consent row**

Delete `pauseExpire` (lines 223–237) and `snoozeWake` (239–252) and their two `HANDLERS` entries. In `JobContext`, make `eraseThread` and `schedule` required (remove the `?` and the two comments explaining why they were optional). In `outboundSend`, replace the consent-unreadable branch:

```typescript
  if (consentErr || !convRow) {
    // Fail closed AND loudly. Returning here consumed the claim and left the
    // message queued with nothing left to send it and nobody told. Throwing
    // reaches the tick's failure path: the job is failed, the message is
    // settled out of "Sending…", and the owner hears about it.
    throw new Error(`outbound_send: cannot read consent for ${p.conversation_id}: ${consentErr?.message ?? "conversation not found"}`);
  }
```

- [ ] **Step 4: `packages/jobs/package.json`** — remove the `"@upstash/qstash"` line from `dependencies`.

- [ ] **Step 5: `apps/edge/lib/cron-auth.ts`**

```typescript
/** The door every pg_cron → pg_net route stands behind: x-cron-key against the Vault-held key. */
import crypto from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./workspace/db.js";
import { json } from "./http.js";

export async function authorizeCron(request: Request, db: SupabaseClient<Database>): Promise<Response | null> {
  const presented = request.headers.get("x-cron-key") || "";
  const { data: expected, error } = await db.rpc("get_cron_sweep_key");
  if (error || !expected) return json(503, { ok: false, error: "key_unavailable" });
  const a = Buffer.from(presented);
  const b = Buffer.from(expected as unknown as string);
  if (!presented || a.length !== b.length || !crypto.timingSafeEqual(a, b)) return json(401, { ok: false, error: "unauthorized" });
  return null;
}
```

- [ ] **Step 6: `apps/edge/api/jobs/tick.ts`**

```typescript
/**
 * The heartbeat's edge half. pg_cron calls this every ten seconds when
 * something is due (migration 00081). Auth, credentials and the database are
 * bound here; the loop itself is packages/jobs/src/tick.ts and is tested by
 * running it against fakes.
 */
import { json } from "../../lib/http.js";
import { pg } from "../../lib/pg.js";
import { logger, errField } from "../../lib/log.js";
import { authorizeCron } from "../../lib/cron-auth.js";
import { alertFor } from "../../lib/job-alert.js";
import { waCredentialsForTenant } from "../../lib/tenant-runtime.js";
import { smsSenderForTenant } from "../../lib/sms.js";
import { deleteThread } from "../../lib/store.js";
import {
  runTick, claimDue, completeJob, failJob, settleFor, dispatchJob, scheduleJob, LEASE_SECONDS,
} from "../../lib/workspace/jobs.js";

export const config = { maxDuration: 60 };

/** Leaves twenty seconds for the batch in flight to finish inside maxDuration. */
const BUDGET_MS = 40_000;
const BATCH = 25;

export async function POST(request: Request): Promise<Response> {
  const L = logger({ sweep: "jobs" });
  const db = pg();
  if (!db) return json(503, { ok: false, error: "no_database" });
  const denied = await authorizeCron(request, db);
  if (denied) return denied;

  try {
    const counts = await runTick(
      {
        claim: (limit, lease) => claimDue(db, limit, lease),
        dispatch: async (job) =>
          dispatchJob(
            {
              db,
              waCfg: await waCredentialsForTenant(db, job.tenant_id),
              sms: await smsSenderForTenant(db, job.tenant_id),
              alert: alertFor(db, job),
              eraseThread: deleteThread,
              schedule: (kind, dueAt, payload) => scheduleJob(db, { tenantId: job.tenant_id, kind, dueAt, payload }).then(() => undefined),
            },
            { id: job.id, tenant_id: job.tenant_id, kind: job.kind, payload: (job.payload ?? {}) as Record<string, unknown> },
          ),
        complete: (job) => completeJob(db, job),
        fail: (job, reason) => failJob(db, job, reason),
        settle: (job, reason) => settleFor(db, job, reason),
        alert: (job, subject, body) => alertFor(db, job)(subject, body),
        log: L,
        now: Date.now,
      },
      { budgetMs: BUDGET_MS, batch: BATCH, leaseSeconds: LEASE_SECONDS },
    );
    // Spread: LogContext wants an index signature, and an interface has none.
    L.info("jobs_tick", { ...counts });
    return json(200, { ok: true, ...counts });
  } catch (e) {
    // Only the claim can throw out of runTick; everything per job is caught
    // inside it. A claim that fails is a database problem and sweep_health
    // should see it as one.
    L.error("jobs_tick_failed", { error: errField(e) });
    return json(503, { ok: false, error: errField(e) });
  }
}
```

- [ ] **Step 7: `apps/edge/api/jobs/fire.ts` — retired**

```typescript
/**
 * Retired. Jobs are run by api/jobs/tick.ts from their own due_at (migration
 * 00081). QStash may still deliver messages for jobs scheduled before that —
 * up to the thirty-day snooze cap — and this answers them so it stops trying.
 * Delete this file, and the QSTASH_* variables, after 2026-10-09.
 */
import { json } from "../../lib/http.js";

export async function POST(): Promise<Response> {
  return json(200, { ok: true, skipped: "retired" });
}
```

- [ ] **Step 8: Build, typecheck, commit**

```bash
pnpm install
pnpm --filter "./packages/*" build && pnpm -r typecheck
```

Expected: typecheck fails in the callers that still pass `qstashToken` or call the deleted sweep — that is the list for Task 1.8. Commit what compiles so far only after 1.8.

### Task 1.8: Every caller, and the deletions

**Files:** the callers listed below

- [ ] **Step 1: Find them**

```bash
rg -n "qstashToken|QSTASH|@upstash/qstash|jobs-recovery|cron/jobs|snooze_wake|pause_expire" --glob '!**/dist/**' --glob '!**/node_modules/**' --glob '!docs/**' --glob '!pnpm-lock.yaml'
```

- [ ] **Step 2: Apply each edit**

`apps/dashboard/src/server/service.ts` — `schedule` passes `{ tenantId, kind, dueAt, payload }` only; `cancelKindFor` drops the trailing `process.env.QSTASH_TOKEN` argument.

`apps/dashboard/app/api/v1/conversations/[id]/snooze/route.ts` — delete the two lines `await cancelKindFor(conv.tenant_id, "pause_expire", …)` and `await schedule(conv.tenant_id, "snooze_wake", …)`. The row's `snooze_until` is the clock. Remove the now-unused imports.

`apps/dashboard/app/api/v1/conversations/[id]/wake/route.ts:43`, `hand-back/route.ts:27`, `take-over/route.ts:36` — delete the `cancelKindFor(…, "snooze_wake", …)` lines. In `take-over` and `reply/route.ts:213`, delete `await schedule(conv.tenant_id, "pause_expire", …)`; `paused_until` is the clock and `expire_stale_pauses()` runs on the heartbeat.

`apps/edge/lib/draft-queue.ts` — delete the `QSTASH_TOKEN` guard (lines 43–47) and the `qstashToken: token` field.

`apps/edge/lib/playbooks.ts:231` — drop `qstashToken: process.env.QSTASH_TOKEN!`.

`apps/edge/api/admin/steer.ts:151,154` — drop the trailing `process.env.QSTASH_TOKEN` argument.

`apps/edge/api/diag.ts:45` — delete the `qstashToken:` line.

`apps/edge/lib/whatsapp/persist.ts` — delete `has_qstash` from the log fields (line 79); change `vetoFallback: (delayMs: number, hasQstash: boolean)` to `vetoFallback: (delayMs: number)` and its `reason` to the constant `"scheduling_failed"`. `apps/edge/lib/whatsapp/inbound.ts:654` — `await sink.vetoFallback(delayMs);`.

`apps/edge/lib/sweep-health.ts:64` — add to `CONSEQUENCE`: `jobs: "no queued reply, broadcast batch or erase runs, and snoozed or paused threads do not reopen",`.

`apps/edge/package.json` — remove `"@upstash/qstash"`. `apps/edge/.env.example` — delete the three `QSTASH_*` lines. `apps/dashboard/.env.example` — delete `QSTASH_TOKEN=`.

`packages/contracts/src/enums.ts` — `JOB_KINDS` becomes `["outbound_send", "broadcast_send", "blob_thread_erase"]`.

Delete: `apps/edge/api/cron/jobs.ts`, `apps/edge/lib/jobs-recovery.ts`, `tooling/scripts/tests/stale-jobs.test.mjs`, and `apps/edge/lib/jobs-settle.ts` if it exists.

- [ ] **Step 3: Fix the tests that pinned the old world**

```bash
pnpm install && pnpm --filter "./packages/*" build && pnpm -r typecheck && pnpm lint && pnpm test 2>&1 | tail -60
```

Expected failures and their fixes — delete the assertion in each case; the behaviour is now covered by `jobs-tick.test.mjs`, `jobs-ledger.test.mjs` and the integration test:

- `store-retired.test.mjs:72` — the `JOB_KINDS` list becomes the three kinds. `:84` — replace the migration text with `assert.ok(readRaw("supabase/migrations/00081_jobs_outbox.sql").includes("check (kind in ('outbound_send', 'broadcast_send', 'blob_thread_erase')) not valid"))`.
- `broadcasts.test.mjs:120` — delete (the compiler now requires `schedule` on `JobContext`).
- `steer.test.mjs:56` — delete the `QSTASH_TOKEN` assertion.
- `veto-window.test.mjs:190` — delete.
- `enums-vs-checks.test.mjs` — will pass; `jobs.state` CHECK is unchanged until Phase 2.
- `env-manifest.test.mjs` — passes once both `.env.example` files and all readers agree.
- `sweep-health.integration.test.mjs` — if it enumerates sweeps, add `jobs`.

Then lower the ratchet:

```bash
UPDATE_SOURCE_SCAN_BASELINE=1 pnpm test
```

- [ ] **Step 4: Commit**

```bash
git add -A
git -c core.safecrlf=false commit -m "Scheduling is one insert; QStash is retired"
```

### Task 1.9: Deploy and prove it with a probe

- [ ] **Step 1: Open the PR, wait for CI (typecheck, lint, test, integration), merge, wait for the Vercel deploy.**

- [ ] **Step 2: Probe against production with the smoke tenant**

With `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` for the linked project in the shell (from `supabase projects api-keys`, never printed):

```bash
node --input-type=module -e '
import { createClient } from "@supabase/supabase-js";
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const { data: t } = await db.from("tenants").select("id").eq("slug", "chanlytics-smoke-test").single();
const { data: j } = await db.from("jobs").insert({ tenant_id: t.id, kind: "blob_thread_erase", due_at: new Date().toISOString(), payload: { namespace: "probe", thread_id: "does-not-exist" } }).select("id").single();
console.log("probe", j.id);
await new Promise((r) => setTimeout(r, 30_000));
const { data: row } = await db.from("jobs").select("state, attempts, last_error, lease_until").eq("id", j.id).single();
console.log(row);
'
```

Expected within 30 s: `state: "done"` (or `failed` with a `last_error` naming the missing blob, which also proves the path). Then:

```bash
node --input-type=module -e '
import { createClient } from "@supabase/supabase-js";
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
console.log((await db.from("sweep_status").select("sweep, requested_at, request_id, note").eq("sweep", "jobs").single()).data);
'
```

Expected: `requested_at` within the last ten seconds and `note: null`.

- [ ] **Step 3: Snooze a thread in the smoke workspace for one minute from the dashboard; confirm it reopens within ~70 s without any job row being created** (`select count(*) from jobs where kind = 'snooze_wake' and created_at > now() - interval '5 minutes'` is 0).

- [ ] **Step 4: Calendar a reminder for 2026-10-09: delete `apps/edge/api/jobs/fire.ts`, the `QSTASH_*` env vars on Vercel, and `pnpm-lock.yaml`'s `@upstash/qstash` entries.**

---

## Phase 2: Enums from the schema

> **As built, 2026-09-10: not Postgres enums.** The live database has 53 value-set CHECKs. The text below converts five, then deletes the only test that watched about twenty, which would leave the rest unguarded. Converting all of them would make every new value a two-migration change, rewrite large tables under an exclusive lock, and break any plpgsql body that assigns a text variable to a converted column. Instead `tooling/scripts/gen-schema-sets.mjs` generates every set from the CHECKs themselves into `packages/contracts/src/schema-sets.generated.ts`; `schema-sets.ts` and `channels/src/schema-agreement.ts` hold every hand-kept list to its column at compile time; and the Database workflow regenerates the file on every PR and fails when it is stale. The same guarantee, drift cannot merge, for all 53 sets, with no schema change.

**Files:**
- Create: `supabase/migrations/00082_enums_jobs.sql`, `00083_enums_conversations_messages.sql`, `00084_enums_broadcasts.sql`
- Create: `packages/db/src/enum-contracts.ts`; modify `packages/db/src/index.ts`
- Delete: `tooling/scripts/tests/enums-vs-checks.test.mjs`

A note on Postgres enums: `alter type … add value` may not be used in the same transaction as the value's first use, and the Supabase CLI runs each migration file in one transaction. Adding a value later is therefore two files: one to add, the next to use. That is the price of the compiler catching drift; it is small.

### Task 2.1: Jobs

- [ ] **Step 1: The migration**

```sql
-- 00082 · One source for the job enums.
--
-- JOB_STATES in contracts and check (state in (…)) in SQL were two hand-kept
-- copies with a test comparing them, and the test compared the wrong
-- constraint once. An enum type generates into Database["public"]["Enums"]
-- with the types we already regenerate; packages/db checks the contracts
-- arrays against it at COMPILE time. There is nothing left to drift.
--
-- Historical snooze_wake / pause_expire rows are deleted: the timers they
-- represented are recorded on the conversation rows they moved and, since
-- 00081, in events. What is lost is the finish time of a timer.
delete from public.jobs where kind in ('snooze_wake', 'pause_expire');

create type public.job_state as enum ('scheduled', 'fired', 'done', 'canceled', 'failed');
create type public.job_kind  as enum ('outbound_send', 'broadcast_send', 'blob_thread_erase');

alter table public.jobs alter column state drop default;
alter table public.jobs alter column state type public.job_state using state::public.job_state;
alter table public.jobs alter column state set default 'scheduled';
alter table public.jobs drop constraint if exists jobs_state_check;

alter table public.jobs alter column kind type public.job_kind using kind::public.job_kind;
alter table public.jobs drop constraint if exists jobs_kind_check;
```

- [ ] **Step 2: Apply locally, then linked; regenerate types**

```bash
supabase db reset && supabase db push --linked
cd packages/db && supabase gen types typescript --linked > src/database.types.ts && cd ../..
rg -n "job_state|job_kind" packages/db/src/database.types.ts | head
```

Expected: `Enums: { job_state: "scheduled" | "fired" | …, job_kind: … }` and `jobs.Row.state: Database["public"]["Enums"]["job_state"]`.

- [ ] **Step 3: The compile-time check**

`packages/db/src/enum-contracts.ts`:

```typescript
/**
 * The contracts arrays must be exactly the database's enums. This file has no
 * runtime; if it stops compiling, one side changed without the other.
 */
import type { Database } from "./database.types";
import { JOB_STATES, JOB_KINDS } from "@chanlytics/contracts";

type Enums = Database["public"]["Enums"];
type Exactly<A, B> = [A] extends [B] ? ([B] extends [A] ? true : never) : never;

export const jobStatesMatch: Exactly<(typeof JOB_STATES)[number], Enums["job_state"]> = true;
export const jobKindsMatch: Exactly<(typeof JOB_KINDS)[number], Enums["job_kind"]> = true;
```

Add `export * from "./enum-contracts";` to `packages/db/src/index.ts`.

- [ ] **Step 4: Prove the check bites**

Temporarily add `"made_up"` to `JOB_KINDS` in contracts; `pnpm --filter "./packages/*" build`. Expected: `Type 'true' is not assignable to type 'never'` in `enum-contracts.ts`. Revert.

- [ ] **Step 5: Typecheck the apps; fix any `state: string` that now needs narrowing; delete the old test's job assertions**

```bash
pnpm --filter "./packages/*" build && pnpm -r typecheck
```

In `tooling/scripts/tests/enums-vs-checks.test.mjs`, delete the `jobs.state` and `jobs.kind` cases (the file is deleted entirely in Task 2.3). In `store-retired.test.mjs`, delete the assertion that reads the kind CHECK text.

- [ ] **Step 6: Commit**

```bash
git add -A && git -c core.safecrlf=false commit -m "Job states and kinds have one source, and the compiler checks it"
```

### Task 2.2: Conversations and messages

- [ ] **Step 1: The migration**

```sql
-- 00083 · Conversation state and message status as enums (see 00082).
create type public.conversation_state as enum ('open', 'needs_human', 'snoozed', 'archived');
create type public.message_status     as enum ('received', 'queued', 'sent', 'delivered', 'read', 'failed', 'canceled');

alter table public.conversations alter column state drop default;
alter table public.conversations alter column state type public.conversation_state using state::public.conversation_state;
alter table public.conversations alter column state set default 'open';
alter table public.conversations drop constraint if exists conversations_state_check;

alter table public.messages alter column status drop default;
alter table public.messages alter column status type public.message_status using status::public.message_status;
alter table public.messages alter column status set default 'received';
alter table public.messages drop constraint if exists messages_status_check;
```

`messages_guard()` compares `OLD.status in ('failed','canceled')` and `case OLD.status when 'received' …` — string literals coerce to the enum, so the trigger body is unchanged. The `conversations_tenant_state_recent` index is rebuilt by the type change.

- [ ] **Step 2: Apply (local, then linked), regenerate, extend the check**

```typescript
import { CONVERSATION_STATES, MESSAGE_STATUSES } from "@chanlytics/contracts";
export const conversationStatesMatch: Exactly<(typeof CONVERSATION_STATES)[number], Enums["conversation_state"]> = true;
export const messageStatusesMatch: Exactly<(typeof MESSAGE_STATUSES)[number], Enums["message_status"]> = true;
```

- [ ] **Step 3: Typecheck, fix narrowings, run the suite, commit**

```bash
pnpm --filter "./packages/*" build && pnpm -r typecheck && pnpm test
git add -A && git -c core.safecrlf=false commit -m "Conversation state and message status have one source"
```

### Task 2.3: Broadcasts, and the test that no longer needs to exist

- [ ] **Step 1: The migration**

```sql
-- 00084 · Broadcast state as an enum (see 00082).
create type public.broadcast_state as enum ('pending_approval', 'scheduled', 'sending', 'sent', 'canceled', 'failed');
alter table public.broadcasts alter column state drop default;
alter table public.broadcasts alter column state type public.broadcast_state using state::public.broadcast_state;
alter table public.broadcasts alter column state set default 'pending_approval';
alter table public.broadcasts drop constraint if exists broadcasts_state_check;
```

Check the current default first: `rg -n "state.*default" supabase/migrations/00046_broadcasts.sql` and use that value.

- [ ] **Step 2: Apply, regenerate, extend the check with `BROADCAST_STATES` (add the array to contracts if absent), typecheck.**

- [ ] **Step 3: Delete `tooling/scripts/tests/enums-vs-checks.test.mjs`; lower the ratchet; commit**

```bash
git rm tooling/scripts/tests/enums-vs-checks.test.mjs
UPDATE_SOURCE_SCAN_BASELINE=1 pnpm test
git add -A && git -c core.safecrlf=false commit -m "The enum-versus-check test is retired; the compiler holds that line"
```

---

## Phase 3: Tenancy by construction

> **Superseded, 2026-09-10 (evening): execute [`2026-09-10-the-route-definition.md`](2026-09-10-the-route-definition.md).** Tenancy becomes the first field of a route that declares its whole policy (scope, role, rate, spend, input), enforced in one place and recorded in one file. Every rule in the review block below survives there as the inside of the `workspace` scope; the review and the original design stay here as history.

> **Reviewed against the code, 2026-09-10: execute the corrected shape below, not the design that follows it.**
>
> What still holds: one workspace per request, resolved by construction, and a named `choose_workspace` error. Today an ambiguous write is refused as a generic `validation` 400, which a nightly read as a billing bug and a phone-number bug for a day.
>
> Where the code says otherwise:
>
> 1. **No global resolution in `withRoute`.** Twenty-two routes go through it and must not require a workspace: `GET /workspaces` (the switcher's own source, which picks the boot default), `me`, `signup`, `workspaces/create`, the five platform routes, and the routes that act on one row. The Google callback takes its workspace from signed OAuth state. Two tests already pin this: identity.test.mjs ("your name needs no workspace") and back-office.test.mjs (`memberContext` on a platform route is "a category error"). Resolution has to be lazy: a route that needs a workspace asks for one.
> 2. **No cookie, and no `POST /workspaces/select`.** The selection is per tab today. Each tab holds its workspace in memory, and `scoped()` sends it with every request. `scoped()` is the single fetch chokepoint: 145 of the 149 client call sites go through it, and the other four need no workspace. It also scopes `<img src>` and download links, which cannot carry a header. A cookie is shared by every tab, so an open tab's writes would follow whichever tab last switched. The proposed 409 covered only routes that act on one row; a settings form or a new broadcast would land in the wrong business silently.
> 3. **`requireMember` does not exist, and is not needed.** Routes that act on one row already resolve membership from that row: `memberContext(ctx, row.tenant_id)` (15 calls), and `requireOperator(ctx, tenantId)` for the conversation verbs. With per-tab selection there is no second workspace for the row to disagree with.
> 4. **The premise was overstated.** e2e-shape.test.mjs records two nightly failures, not six of seven, and both were specs calling `page.request` directly, bypassing `scoped()`. The product client was not the source. The real gap is on the server: 73 calls read `?workspace=` by hand, and an ambiguous READ silently uses the oldest membership, because `requireRole` refuses only writes. Every production account belongs to two workspaces, so that is the ordinary path, not an edge case.
>
> **The corrected phase.** No migration, and three or four PRs rather than one per directory.
>
> - **Fix first, independent of the rest.** `pages/business-record.jsx:38` pre-fills an empty business record's website with `/yes/` plus `__WORKSPACES[0].slug`: the workspace that sorts first by name, not the active one. An owner of two businesses is offered the other business's opt-in page as their website, on the form that files with the carriers.
> - **3.1 Server.** `withRoute` gains a lazy, memoized `ctx.workspace()`, which becomes the only reader of `?workspace=`, and `ctx.memberOf(tenantId)` for routes that act on one row. Both resolve through one pure `resolveWorkspace(rows, wanted)`, tested by running it. A caller with several memberships who names none gets 400 `choose_workspace`, on reads and writes alike, and the `ambiguous` flag goes. `GET /workspaces` keeps the one legitimate default (the stored preference, else the oldest membership), because answering "which workspace should this tab open" is its job.
> - **3.2 Routes.** The 73 hand-read parameters become `await ctx.workspace()`, and the 15 row lookups become `ctx.memberOf(row.tenant_id)`. Retire the text pins on the old expression (exports.test.mjs, media.test.mjs) and rewrite the workspace-scoping lint to the new shape.
> - **3.3 Client.** When no workspace is known yet (a first visit, or blocked storage), boot waits for the workspace surface before the other fourteen fire. Today they fire together, and once reads refuse ambiguity they would all fail. A `choose_workspace` answer clears the stored preference and reloads. Drop the `__WORKSPACES[0]` fallbacks. Subscribe realtime with the active tenant: packages/db supports the filter and nothing passes it, so every workspace's changes trigger refetches in every tab.
> - **Out of the phase:** the cookie, the select endpoint, the 409, removing `?workspace=`, and deleting `scoped()`. `e2e/workspace.ts` stays. The e2e-shape lint can go once a forgotten workspace fails loudly as `choose_workspace`.

**Files:**
- Modify: `apps/dashboard/src/server/with-route.ts`
- Create: `apps/dashboard/app/api/v1/workspaces/select/route.ts`
- Modify: the client's workspace switcher; every route that calls `memberContext(ctx, …)`
- Delete: `e2e/workspace.ts`'s `scoped()` once the param is gone; `tooling/scripts/tests/e2e-shape.test.mjs`
- Own plan document when reached: `docs/plans/<date>-tenancy-by-construction.md`

### The design, locked here

Today `memberContext(ctx, wanted)` reads `?workspace=` and sets `ambiguous` when the caller has several memberships and named none; `requireRole` refuses writes when `ambiguous`. That is a convention guarded by a lint test, and the nightly's six-of-seven failures were exactly the convention being forgotten.

After: `withRoute` resolves **one** workspace per request, before the handler runs, and puts it on `ctx.workspace: { tenantId, role }`. Resolution order: `?workspace=` (id or slug; accepted for one release, then removed), the `chanlytics_ws` cookie, and — only for an account with exactly one membership — that membership. An account with several memberships and no selection gets **400 `choose_workspace`** on every method; the client responds by calling `POST /api/v1/workspaces/select` and retrying. There is no `ambiguous` flag because there is no ambiguous request.

Subject-scoped routes (`/conversations/[id]/…`, `/messages/[id]/…`) keep taking the tenant from the row they name and checking membership — `requireMember(ctx, tenantId, atLeast)` — and additionally assert it equals `ctx.workspace.tenantId`, so a stale tab cannot act on a row from a workspace the user has since switched away from.

### Task 3.1: `withRoute` resolves the workspace (specified in full)

- [ ] **Step 1: Failing behaviour test** — `tooling/scripts/tests/workspace-resolution.test.mjs`, importing `resolveWorkspace` from `apps/dashboard/src/server/workspace.ts` and driving it with a fake membership list: one membership → that one; several + cookie → the cookie's; several + no cookie → throws `AppError("choose_workspace")`; cookie for a workspace the user left → throws `not_found`, never falls back.

- [ ] **Step 2: `apps/dashboard/src/server/workspace.ts`**

```typescript
import { AppError } from "@chanlytics/contracts";

export interface Membership { tenantId: string; slug: string | null; role: "owner" | "operator" | "viewer" }
export interface Workspace { tenantId: string; role: Membership["role"] }

export const WS_COOKIE = "chanlytics_ws";

/**
 * Exactly one workspace per request, or a 400 that tells the client to choose.
 * `wanted` is the ?workspace= param (id or slug), kept for one release.
 */
export function resolveWorkspace(rows: Membership[], wanted: string | null, cookie: string | null): Workspace {
  if (rows.length === 0) throw new AppError("not_found", "No workspace found for this account.", 404);
  const pick = (key: string) => rows.find((r) => r.tenantId === key || r.slug === key);
  if (wanted) {
    const m = pick(wanted);
    if (!m) throw new AppError("not_found", "That workspace is not one you belong to.", 404);
    return { tenantId: m.tenantId, role: m.role };
  }
  if (cookie) {
    const m = pick(cookie);
    if (!m) throw new AppError("not_found", "The selected workspace is no longer one you belong to — choose another.", 404);
    return { tenantId: m.tenantId, role: m.role };
  }
  if (rows.length === 1) return { tenantId: rows[0].tenantId, role: rows[0].role };
  throw new AppError("choose_workspace", "This account belongs to more than one workspace — choose one first.", 400);
}
```

- [ ] **Step 3: Wire it in `withRoute`** — after `getUser()`, load memberships (the same query `memberContext` runs), read `new URL(req.url).searchParams.get("workspace")` and the cookie via `cookies()`, call `resolveWorkspace`, put the result on `ctx.workspace`. Add `"choose_workspace"` to `AppError`'s code union in contracts and map it to 400 in `withRoute`'s error rendering. Keep `memberContext` as a thin shim returning `{ ...ctx.workspace, ambiguous: false }` until Task 3.3 removes the last caller.

- [ ] **Step 4: `POST /api/v1/workspaces/select`** — body `{ workspaceId }`, verifies membership, sets `chanlytics_ws` (httpOnly, sameSite=lax, path=/, 400 days), returns `{ workspaceId }`.

- [ ] **Step 5: Client** — find how the switcher threads the workspace today (`rg -n "workspace=" apps/dashboard/src apps/dashboard/app --glob '!**/api/**'`), make the switcher call `select` then reload, and make the fetch wrapper retry once after `choose_workspace` by opening the switcher.

### Task 3.2 → 3.n: the routes

```bash
rg -l "memberContext\(" apps/dashboard/app/api | sort
```

One PR per directory under `app/api/v1/`. Recipe per route: replace `const member = await memberContext(ctx, …)` with `ctx.workspace`; replace `requireRole(member, "operator")` with `requireRole(ctx.workspace, "operator")`; for subject-scoped routes add `if (row.tenant_id !== ctx.workspace.tenantId) throw new AppError("conflict", "This belongs to a different workspace than the one you have open.", 409)`. Each PR deletes the `readCode` assertions that pinned `memberContext` in those files and lowers the ratchet.

### Task 3.last: remove the param

Delete the `wanted` branch from `resolveWorkspace`, `scoped()` and `activeWorkspace()` from `e2e/workspace.ts` (E2E sets the cookie once via `select` in `auth.setup.ts`), and `tooling/scripts/tests/e2e-shape.test.mjs`. Remove `e2e-shape.test.mjs` from the ratchet's `lint` list.

---

## Phase 4: Two alert channels

**Files:**
- Create: `supabase/migrations/00085_operator_pages.sql`, `apps/edge/lib/page-operator.ts`
- Modify: `apps/edge/lib/notify.ts` (export `post`), `apps/edge/api/jobs/tick.ts`, `packages/jobs/src/handlers.ts`, `apps/edge/api/cron/health.ts`
- Test: `tooling/scripts/tests/page-operator.test.mjs`

`alertFor` addresses a workspace owner about a thing that happened to their workspace. Nothing addresses the operator about a condition that is the platform's: a provider rejecting every send with 401, a heartbeat that fails fifty jobs in one run, a ledger backlog. Those produce N owner emails hours later and zero pages.

### Task 4.1: Durable suppression and the function

- [ ] **Step 1: Migration**

```sql
-- 00085 · When the platform itself is wrong, one person is paged once.
create table public.operator_pages (
  key        text primary key,
  first_at   timestamptz not null default now(),
  last_at    timestamptz not null default now(),
  count      integer not null default 1,
  alerted_at timestamptz
);
comment on table public.operator_pages is
  'Systemic conditions (provider auth failing, heartbeat mass-failing, ledger backlog) keyed by condition. alerted_at is the suppression stamp: one page per key per window.';

/** Ledger backlog: due work nobody has claimed. The honest measure of whether the heartbeat is draining. */
create or replace function public.jobs_backlog(p_wait interval default interval '2 minutes')
returns integer
language sql
security definer
set search_path = public
as $$
  select count(*)::int from public.jobs
   where state = 'scheduled' and due_at < now() - p_wait;
$$;
revoke execute on function public.jobs_backlog(interval) from public, anon, authenticated;
```

- [ ] **Step 2: Behaviour test** — `page-operator.test.mjs` drives `pageOperator` with a fake `db` (an object with `from("operator_pages")` returning canned rows) and a fake `send`: first call sends and stamps; second call within the window increments `count` and does not send; a call after the window sends again; a `send` that throws leaves `alerted_at` unset so the next tick retries.

- [ ] **Step 3: `apps/edge/lib/page-operator.ts`**

```typescript
/**
 * The platform's own pager. Not a tenant's mailbox: the env pair notify.ts
 * already knows as the platform address. One page per condition key per six
 * hours, stamped only after delivery — a page that did not send earns no quiet.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./workspace/db.js";
import { post, platformFrom, platformTo } from "./notify.js";

export const PAGE_WINDOW_MS = 6 * 3600_000;

export interface PagePorts {
  db: SupabaseClient<Database>;
  send?: (from: string, to: string[], subject: string, body: string) => Promise<boolean>;
  now?: () => number;
}

export async function pageOperator(ports: PagePorts, key: string, subject: string, body: string): Promise<"sent" | "suppressed" | "unaddressed" | "failed"> {
  const now = ports.now?.() ?? Date.now();
  const send = ports.send ?? post;
  const { data: row } = await ports.db.from("operator_pages").select("alerted_at, count").eq("key", key).maybeSingle();
  await ports.db.from("operator_pages").upsert(
    { key, last_at: new Date(now).toISOString(), count: (row?.count ?? 0) + 1 },
    { onConflict: "key" },
  );
  if (row?.alerted_at && now - Date.parse(row.alerted_at) < PAGE_WINDOW_MS) return "suppressed";
  const to = platformTo();
  const from = platformFrom();
  if (!to || !from) {
    console.error(JSON.stringify({ level: "error", event: "operator_page_unaddressed", key, subject }));
    return "unaddressed";
  }
  const ok = await send(from, [to], `[Chanlytics] ${subject}`, body).catch(() => false);
  if (!ok) return "failed";
  await ports.db.from("operator_pages").update({ alerted_at: new Date(now).toISOString() }).eq("key", key);
  return "sent";
}
```

Export `post`, `platformTo`, `platformFrom` from `notify.ts` if they are not already.

### Task 4.2: The first three callers

- [ ] **Tick, mass failure** — in `apps/edge/api/jobs/tick.ts` after `runTick`: `if (counts.failed + counts.gaveUp >= 10) await pageOperator({ db }, "jobs_mass_failure", \`${counts.failed + counts.gaveUp} jobs failed in one heartbeat\`, JSON.stringify(counts));`.

- [ ] **Provider auth** — add `page?: (key: string, subject: string, body: string) => Promise<unknown>` to `JobContext`; in `outboundSend`'s `else` branch (send failed), before the tenant alert: `if (sent.status === 401 || sent.status === 403) await ctx.page?.(\`provider_auth:${channel}\`, \`${channel} rejected a send with ${sent.status}\`, \`Tenant ${job.tenant_id}, message ${p.message_id}. Credentials, not content.\`);`. `tick.ts` supplies `page: (k, s, b) => pageOperator({ db }, k, s, b)`.

- [ ] **Backlog** — in `apps/edge/api/cron/health.ts`, after the sweep rows are judged: `const { data: backlog } = await db.rpc("jobs_backlog"); if ((backlog ?? 0) > 0) await pageOperator({ db }, "jobs_backlog", \`${backlog} due jobs have waited more than two minutes\`, "The heartbeat is scheduled but not draining. Check sweep_health for 'jobs' and the tick's Vercel logs.");` Add the same number to the `/api/diag` payload as `jobs_backlog`.

- [ ] **Commit per caller.**

---

## Phase 5: The core package — rules in one place

**Files:**
- Create: `packages/core/` (package.json, tsconfig, `src/index.ts`, `src/ports.ts`, one directory per domain)
- Modify: every route and handler, one domain per plan document
- Delete: the `readCode` tests that pinned each extracted module

### The shape, locked here

A use case is `async function verb(ports: VerbPorts, cmd: VerbCommand): Promise<VerbResult>`. Its ports are the *minimum* it needs, named for what they mean (`snooze(id, untilIso)`), not for the table they touch. It throws `AppError` for anything the caller did wrong and plain `Error` for anything the world did wrong. It never imports `@supabase/supabase-js`, `next/*`, a provider SDK, or `process.env`. The route builds the ports from `ctx`, calls the verb, returns the result. `packages/jobs/src/tick.ts` is the first thing already in this shape; `pgSink` is the older cousin.

### Task 5.1: The package and the first verb, in full

- [ ] **Step 1: Scaffold** — `packages/core/package.json` mirrors `packages/jobs/package.json` (tsup build, `@chanlytics/contracts` and `@chanlytics/db` as type-only deps, nothing else). `src/ports.ts` holds only the shared `Clock = { now(): number }`.

- [ ] **Step 2: Failing behaviour test** — `tooling/scripts/tests/core-snooze.test.mjs`:

```javascript
import { test } from "node:test";
import assert from "node:assert/strict";
import { snoozeConversation, MAX_SNOOZE_MS } from "../../../packages/core/src/conversations/snooze.ts";

const conv = { id: "c1", tenant_id: "t1", paused_until: null, phone_e164: "+15550000001" };
function fakes(over = {}) {
  const calls = { released: [], snoozed: [], decisions: [] };
  const ports = {
    loadConversation: async () => conv,
    requireOperator: async () => {},
    releaseBlobPause: async (t, p) => { calls.released.push([t, p]); },
    snooze: async (id, until) => { calls.snoozed.push([id, until]); return true; },
    recordDecision: async (t, id, until) => { calls.decisions.push([t, id, until]); return "d1"; },
    now: () => Date.parse("2026-04-26T12:04:00Z"),
    ...over,
  };
  return { ports, calls };
}

test("rejects a missing, malformed, past, or too-distant until before touching anything", async () => {
  for (const until of [undefined, "yesterday", "2026-04-26T12:03:00Z", new Date(Date.parse("2026-04-26T12:04:00Z") + MAX_SNOOZE_MS + 1).toISOString()]) {
    const { ports, calls } = fakes();
    await assert.rejects(snoozeConversation(ports, { conversationId: "c1", until }), /snooze/);
    assert.deepEqual(calls.snoozed, []);
  }
});

test("releases a Blob pause only when there is one and a phone to release it for", async () => {
  const { ports, calls } = fakes({ loadConversation: async () => ({ ...conv, paused_until: "2026-04-27T00:00:00Z" }) });
  await snoozeConversation(ports, { conversationId: "c1", until: "2026-04-27T09:00:00Z" });
  assert.deepEqual(calls.released, [["t1", "+15550000001"]]);
  const plain = fakes();
  await snoozeConversation(plain.ports, { conversationId: "c1", until: "2026-04-27T09:00:00Z" });
  assert.deepEqual(plain.calls.released, []);
});

test("a snooze that changed no row is a conflict, and no decision is recorded for it", async () => {
  const { ports, calls } = fakes({ snooze: async () => false });
  await assert.rejects(snoozeConversation(ports, { conversationId: "c1", until: "2026-04-27T09:00:00Z" }), /reload/);
  assert.deepEqual(calls.decisions, []);
});

test("the decision is recorded after the row changed, and the result says what happened", async () => {
  const { ports, calls } = fakes();
  const r = await snoozeConversation(ports, { conversationId: "c1", until: "2026-04-27T09:00:00Z" });
  assert.deepEqual(r, { state: "snoozed", snooze_until: "2026-04-27T09:00:00.000Z", decision_id: "d1" });
  assert.deepEqual(calls.decisions, [["t1", "c1", "2026-04-27T09:00:00.000Z"]]);
});
```

- [ ] **Step 3: `packages/core/src/conversations/snooze.ts`**

```typescript
import { AppError } from "@chanlytics/contracts";

export const MAX_SNOOZE_MS = 30 * 24 * 3600 * 1000;

export interface SnoozeConversation { id: string; tenant_id: string; paused_until: string | null; phone_e164: string | null }

export interface SnoozePorts {
  loadConversation(id: string): Promise<SnoozeConversation>;
  requireOperator(tenantId: string): Promise<void>;
  /** The receptionist's own pause store, outside Postgres. */
  releaseBlobPause(tenantId: string, phone: string): Promise<void>;
  /** state → snoozed, snooze_until set, pause and assignee cleared. True iff a row changed. */
  snooze(conversationId: string, untilIso: string): Promise<boolean>;
  recordDecision(tenantId: string, conversationId: string, untilIso: string): Promise<string>;
  now(): number;
}

export interface SnoozeCommand { conversationId: string; until: string | undefined }
export interface SnoozeResult { state: "snoozed"; snooze_until: string; decision_id: string }

/** Hide a thread from the queue until a wake time. The bot stays active; the row's snooze_until is the only clock. */
export async function snoozeConversation(ports: SnoozePorts, cmd: SnoozeCommand): Promise<SnoozeResult> {
  const now = ports.now();
  const until = cmd.until ? new Date(cmd.until) : null;
  if (!until || Number.isNaN(until.getTime()) || until.getTime() <= now) {
    throw new AppError("validation", "snooze needs a future `until` timestamp.");
  }
  if (until.getTime() - now > MAX_SNOOZE_MS) throw new AppError("validation", "snooze is capped at 30 days.");

  const conv = await ports.loadConversation(cmd.conversationId);
  await ports.requireOperator(conv.tenant_id);
  if (conv.paused_until && conv.phone_e164) await ports.releaseBlobPause(conv.tenant_id, conv.phone_e164);

  const untilIso = until.toISOString();
  if (!(await ports.snooze(conv.id, untilIso))) {
    throw new AppError("conflict", "Could not snooze this thread — reload and try again.", 409);
  }
  const decision_id = await ports.recordDecision(conv.tenant_id, conv.id, untilIso);
  return { state: "snoozed", snooze_until: untilIso, decision_id };
}
```

- [ ] **Step 4: The route becomes an adapter** — `apps/dashboard/app/api/v1/conversations/[id]/snooze/route.ts`:

```typescript
import { withRoute } from "@/server/with-route";
import { requireOperator, loadConversation, recordDecision } from "@/server/verbs";
import { mirrorBlobPause } from "@/server/service";
import { snoozeConversation } from "@chanlytics/core";

export const POST = withRoute(async (req, ctx) => {
  const body = (await req.json().catch(() => ({}))) as { until?: string };
  return snoozeConversation(
    {
      loadConversation: (id) => loadConversation(ctx, id),
      requireOperator: (tenantId) => requireOperator(ctx, tenantId),
      releaseBlobPause: (tenantId, phone) => mirrorBlobPause(tenantId, phone, 0),
      snooze: async (id, until) => {
        const { data, error } = await ctx.supabase
          .from("conversations")
          .update({ state: "snoozed", snooze_until: until, paused_until: null, assignee_user_id: null })
          .eq("id", id)
          .select("id");
        if (error) throw new Error(error.message);
        return (data?.length ?? 0) > 0;
      },
      recordDecision: (tenantId, id, until) => recordDecision(ctx, tenantId, "conversation", id, "snooze", { until }),
      now: Date.now,
    },
    { conversationId: String(ctx.params.id ?? ""), until: body.until },
  );
});
```

- [ ] **Step 5: Delete the `readCode` tests that pinned the snooze route**

```bash
rg -l "conversations/\[id\]/snooze" tooling/scripts/tests
```

Remove those assertions; lower the ratchet; `pnpm -r typecheck && pnpm test`; commit `The first verb lives in core and is tested by calling it`.

### Task 5.2 → 5.n: the inventory, one plan document per group

Order by value and risk; each group is its own `docs/plans/<date>-core-<group>.md` in this format:

1. **Conversation verbs** — `reply`, `take-over`, `hand-back`, `wake`, `cancel-send`, `steer` (edge). The product's core; `reply/route.ts` is ~290 lines and becomes `replyToConversation` with ports for the window check, the draft withdrawal, the message insert, the schedule, the decision, the escalation.
2. **The send path** — `outboundSend` in `packages/jobs/src/handlers.ts` becomes `core/messages/send.ts` with ports for consent, the sender, the status writes; `handlers.ts` keeps only the adapter. `blobThreadErase` and `broadcastSend` follow.
3. **Broadcasts and playbooks** — dashboard routes plus `apps/edge/lib/playbooks.ts`.
4. **Calendar, contacts, consent.**
5. **Team, workspaces, settings, billing.**
6. **Webhooks** — `inbound-sms.ts`, `retell-*.ts`, and last, on its own, `whatsapp.ts` + `lib/whatsapp/inbound.ts`.

Recipe for each route or handler: (1) list its branches from the code and write one behaviour test per branch against fakes; (2) extract the verb with the minimum ports; (3) reduce the route to an adapter; (4) `rg -l "<path>" tooling/scripts/tests` and delete the assertions that pinned it; (5) lower the ratchet; (6) one commit per verb. Definition of done for the phase: the ratchet baseline lists only the `lint` files.

---

## Phase 6: The legacy frontend

**Files:** `apps/dashboard/src/legacy/**` (Babel-in-browser React, `window.*` data layer, `IX_STORE` et al.)

- [ ] **Task 6.1: Inventory.** `rg -n "legacy" apps/dashboard/app apps/dashboard/next.config.* apps/dashboard/src --glob '!apps/dashboard/src/legacy/**'` to find every entry point that still serves it; list which routes real users reach through it versus the Next app; record the answer in `docs/plans/<date>-legacy-inventory.md`.
- [ ] **Task 6.2: Decide.** If nothing customer-facing is served from it, delete it and its rule file. If something is, write one migration plan per surface, in this format, each moving one surface into the Next app against `packages/core` verbs.

---

## Self-Review

**Coverage against §1.** Time in the row → Phase 1. One transition path + database-enforced edges → Task 1.1, 1.4 (`claim_due_jobs`, `jobs_guard`). Enums → Phase 2. Rules in one package → Phase 5. Behaviour tests → Tasks 1.3, 1.5, 1.6, Phase 0 ratchet, Phase 5 recipe. Tenancy → Phase 3. Two channels → Phase 4. Round Two's surviving substance: settlement → Task 1.2; consent throw → Task 1.7 Step 3.

**Placeholders.** Phases 3 and 5 name routes to be handled by recipe with an inventory command and one fully worked example each; that is the scope decision stated in §0, not an omission. Phase 6 is explicitly an inventory. Task 1.4 asks the executor to paste `sweep_health()` verbatim rather than retyping 110 lines of health contract; the exact row to add and its position are given.

**Type consistency.** `LedgerRow` (1.1) is what `claimDue` returns, what `TickPorts` (1.3) takes, and what `settleFor` (1.2) accepts via its structural subset. `completeJob`/`failJob` take `{ id, attempts }` and the tick passes the full row. `Settlement` is defined once in `settle.ts` and imported by `tick.ts`. `Db` is defined once in `ledger.ts`. `JobContext.schedule` returns `Promise<void>`; `tick.ts` adapts `scheduleJob(...).then(() => undefined)`. `resolveWorkspace` (3.1) returns `Workspace`, which `ctx.workspace` carries. `pageOperator` (4.1) is what 4.2's three callers invoke with `{ db }`.

**Risk left standing.** Phase 1 changes production timing (a ten-second heartbeat replacing a push) and deletes two job kinds in one migration; it is proved locally, then by a probe row, before anything else lands on it. Phase 2's type changes take a brief lock on tables that hold at most thousands of rows. Phase 5 is the long tail and is deliberately unspecified beyond its first verb, because specifying eighty routes before the first extraction has taught anything would be fiction.

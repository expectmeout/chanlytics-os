# Core, group one: the conversation verbs — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The eight conversation verbs — take-over, hand-back, snooze, wake, archive, resolve, cancel-send, reply — live in `packages/core` as functions over ports, tested by calling them, and the eight routes become adapters of a few lines each.

**Architecture:** A verb is `async function verb(ports, cmd)`. The route's `handle` builds the ports from `ctx` (one adapter module, `apps/dashboard/src/server/core-ports.ts`), hands the verb the row its scope already loaded and the user, and returns what the verb returns: the route's answer, typed, which the client's registry already carries to the browser. A verb throws `AppError` for anything the caller did wrong and a plain `Error` for anything the world did wrong, and never imports a database client, a framework, a provider or `process.env`. This is Phase 5 of [the program](2026-09-09-the-system-it-should-be.md), group one of its inventory; the program's snooze example is the shape, with one change: `route()` now loads the row and judges the role before `handle`, so the verb takes the thread as a fact rather than loading it through a port.

**Tech Stack:** TypeScript, `packages/core` (tsup, dist committed, `dist-freshness.test.mjs` holds it current), `node:test` with hand-written fakes, `route()` from `apps/dashboard/src/server/route.ts`.

---

## Why now, and why this group

- Every rule the eight routes hold is stated in their text, and pinned by text in a dozen tests. The rules are the product: who may speak to a customer and when, what a held draft does when a person arrives, what a replay of a send returns. A rule pinned by text cannot be run.
- The routes agree with each other by copy: "row count, not just the error" appears seven times; the pause-then-claim order is stated twice; the drafts are withdrawn in two places. One `withdrawDrafts` port is one place.
- The typed client (done) means the verb's result type is the browser's type. A verb that returns `{ state: "snoozed", snooze_until, decision_id }` is what the Inbox reads, end to end, with nothing hand-typed in between.
- The edge has verbs of its own on the same rows (the receptionist's escalation pauses the thread; `expire_stale_pauses` ends it), and the one divergence still open — the receptionist answering after a hold expires while an escalation is open — is a rule that will have one home once these verbs do. That is group six, not this plan.

## Files

- Create: `packages/core/src/conversations/ports.ts` — the thread as a fact, the ports, the decision verbs.
- Create: `packages/core/src/conversations/take-over.ts`, `hand-back.ts`, `snooze.ts`, `wake.ts`, `archive.ts`, `resolve.ts`, `cancel-send.ts`, `reply.ts`, `index.ts`.
- Modify: `packages/core/src/index.ts` (export the group).
- Create: `apps/dashboard/src/server/core-ports.ts` — `threadPorts(ctx)`, `escalationPorts(ctx)`, `cancelSendPorts(ctx)`, `replyPorts(ctx)`.
- Modify: `apps/dashboard/package.json` (`@chanlytics/core` as a workspace dependency; it is not one yet), the eight routes under `apps/dashboard/app/api/v1/`, `apps/dashboard/src/server/verbs.ts` (`SEND_GRACE_MS` re-exported from core).
- Test: `tooling/scripts/tests/core-thread-verbs.test.mjs`, `tooling/scripts/tests/core-reply.test.mjs`; `inbox-routes.test.mjs` stays and keeps running the adapters; the pins the routes carried move or go; a lint in `hygiene.test.mjs`.

Two PRs: Task 1 (the seven thread verbs, one small route each) and Task 2 (reply).

---

### Task 1: The seven thread verbs (PR 1)

**Files:** `packages/core/src/conversations/{ports,take-over,hand-back,snooze,wake,archive,resolve,cancel-send,index}.ts`, `packages/core/src/index.ts`, `apps/dashboard/src/server/core-ports.ts`, seven routes, `tooling/scripts/tests/core-thread-verbs.test.mjs`, `hygiene.test.mjs`.

- [x] **Step 1: The ports.** `packages/core/src/conversations/ports.ts`:

```typescript
import type { Json } from "@chanlytics/db";

/**
 * The thread as the route's scope loaded it: visible under RLS, the role
 * already judged where it lives. A verb names only the fields it reads.
 */
export interface Thread {
  id: string;
  tenant_id: string;
  state: string;
  paused_until: string | null;
  phone_e164: string | null;
}

export type DecisionSubject = "conversation" | "escalation" | "message";
export type DecisionVerb = "take_over" | "hand_back" | "snooze" | "wake" | "archive" | "resolve" | "cancel_send" | "reply";

/** What the thread verbs need of the world, named for what each means, not the table it touches. */
export interface ThreadPorts {
  /** How long a person's touch keeps the receptionist off a thread: the reply policy's pause_hours, or a day. */
  pauseMs(tenantId: string): Promise<number>;
  /** The live receptionist's own pause, kept outside Postgres and mirrored FIRST; 0 releases it. */
  pauseBot(tenantId: string, phone: string, untilMs: number): Promise<void>;
  /** needs_human, paused until, snooze cleared, claimed by the user. True iff a row changed. */
  claim(conversationId: string, untilIso: string, userId: string): Promise<boolean>;
  /** open, pause and snooze cleared, unassigned. True iff a row changed. */
  release(conversationId: string): Promise<boolean>;
  /** snoozed until; pause and assignee cleared. True iff a row changed. */
  snooze(conversationId: string, untilIso: string): Promise<boolean>;
  /** open with the snooze cleared, only while still snoozed. True iff a row changed. */
  wake(conversationId: string): Promise<boolean>;
  /** archived; pause and assignee cleared. True iff a row changed. */
  archive(conversationId: string): Promise<boolean>;
  /** The receptionist's held drafts on the thread withdrawn, rows then jobs; how many. */
  withdrawDrafts(tenantId: string, conversationId: string): Promise<number>;
  /** The open escalation on the thread resolved by this decision, when there is one. */
  resolveEscalation(conversationId: string, decisionId: string): Promise<void>;
  /** The ledger: who did what to which row. The decision's id. */
  record(tenantId: string, subject: DecisionSubject, id: string, verb: DecisionVerb, payload?: Json): Promise<string>;
  now(): number;
}

export interface EscalationPorts {
  /** open → resolved by the user, only while open. True iff a row changed. */
  resolve(escalationId: string): Promise<boolean>;
  /** The decision linked back onto the escalation; a failure is logged, never fatal. */
  link(escalationId: string, decisionId: string): Promise<void>;
  record: ThreadPorts["record"];
}

export interface CancelSendPorts {
  /** queued → canceled, only while queued: zero rows means the send job won. */
  cancelQueued(messageId: string): Promise<boolean>;
  /** The outbound_send job for the message withdrawn; how many. */
  cancelJob(tenantId: string, messageId: string): Promise<number>;
  record: ThreadPorts["record"];
}
```

- [x] **Step 2: The failing test.** `tooling/scripts/tests/core-thread-verbs.test.mjs` — one `fakes()` for every verb, an ordered log of the ports called, every branch a case:

```javascript
/**
 * The thread verbs, run: each port a fake that records its call, so what is
 * proved is the order and the outcome, not the routes' text.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { importSrc } from "./_source.mjs";

const core = await importSrc("packages/core/src/conversations/index.ts");
const NOW = Date.parse("2026-09-11T12:00:00Z");
const HOUR = 3_600_000;
const conv = (over = {}) => ({ id: "c1", tenant_id: "t1", state: "open", paused_until: null, phone_e164: "+15550000001", ...over });

function fakes(over = {}) {
  const log = [];
  const ports = {
    pauseMs: async () => 2 * HOUR,
    pauseBot: async (t, p, until) => { log.push(["pauseBot", t, p, until]); },
    claim: async (id, until, user) => { log.push(["claim", id, until, user]); return true; },
    release: async (id) => { log.push(["release", id]); return true; },
    snooze: async (id, until) => { log.push(["snooze", id, until]); return true; },
    wake: async (id) => { log.push(["wake", id]); return true; },
    archive: async (id) => { log.push(["archive", id]); return true; },
    withdrawDrafts: async (t, id) => { log.push(["withdrawDrafts", t, id]); return 1; },
    resolveEscalation: async (id, d) => { log.push(["resolveEscalation", id, d]); },
    record: async (t, subject, id, verb, payload) => { log.push(["record", subject, id, verb, payload ?? {}]); return "d1"; },
    resolve: async (id) => { log.push(["resolve", id]); return true; },
    link: async (id, d) => { log.push(["link", id, d]); },
    cancelQueued: async (id) => { log.push(["cancelQueued", id]); return true; },
    cancelJob: async (t, id) => { log.push(["cancelJob", t, id]); return 1; },
    now: () => NOW,
    ...over,
  };
  return { ports, log, ops: () => log.map((l) => l[0]) };
}
const refused = async (p, code, status, words) => assert.rejects(p, (e) => e.code === code && (status === undefined || e.status === status) && (words === undefined || words.test(e.message)));

test("take over: the bot is paused FIRST, then the claim, then the drafts, then the ledger; a thread with no phone is refused before anything", async () => {
  const { ports, log, ops } = fakes();
  const r = await core.takeOver(ports, { conv: conv(), userId: "u1" });
  const until = new Date(NOW + 2 * HOUR).toISOString();
  assert.deepEqual(ops(), ["pauseBot", "claim", "withdrawDrafts", "record"]);
  assert.deepEqual(log[0], ["pauseBot", "t1", "+15550000001", NOW + 2 * HOUR]);
  assert.deepEqual(r, { state: "needs_human", paused_until: until, decision_id: "d1", withdrawn_drafts: 1 });
  const bare = fakes();
  await refused(core.takeOver(bare.ports, { conv: conv({ phone_e164: null }), userId: "u1" }), "conflict", undefined, /phone/);
  assert.deepEqual(bare.ops(), []);
});

test("take over: a claim that changed no row releases the pause it mirrored and is a 409, with no decision", async () => {
  const { ports, log, ops } = fakes({ claim: async () => false });
  await refused(core.takeOver(ports, { conv: conv(), userId: "u1" }), "conflict", 409, /reload/);
  assert.deepEqual(ops(), ["pauseBot", "pauseBot"]);
  assert.equal(log[1][3], 0, "the second mirror releases");
});

test("hand back: the pause released, the thread opened, the decision recorded, and the open escalation resolved by it", async () => {
  const { ports, log, ops } = fakes();
  assert.deepEqual(await core.handBack(ports, { conv: conv() }), { state: "open", decision_id: "d1" });
  assert.deepEqual(ops(), ["pauseBot", "release", "record", "resolveEscalation"]);
  assert.deepEqual(log[3], ["resolveEscalation", "c1", "d1"]);
  const stale = fakes({ release: async () => false });
  await refused(core.handBack(stale.ports, { conv: conv() }), "conflict", 409, /reload/);
  assert.deepEqual(stale.ops(), ["pauseBot", "release"], "no decision and no resolve for a change that never happened");
});

test("snooze: a missing, malformed, past or too-distant until is refused before anything is touched", async () => {
  for (const until of [undefined, "yesterday", new Date(NOW - 1).toISOString(), new Date(NOW + core.MAX_SNOOZE_MS + 1).toISOString()]) {
    const { ports, ops } = fakes();
    await refused(core.snooze(ports, { conv: conv(), until }), "validation", undefined, /snooze/);
    assert.deepEqual(ops(), []);
  }
});

test("snooze: releases the receptionist's pause only when the thread holds one, hides the thread, and leaves the escalation OPEN", async () => {
  const until = new Date(NOW + HOUR).toISOString();
  const paused = fakes();
  const r = await core.snooze(paused.ports, { conv: conv({ paused_until: new Date(NOW + HOUR).toISOString() }), until });
  assert.deepEqual(paused.ops(), ["pauseBot", "snooze", "record"]);
  assert.deepEqual(r, { state: "snoozed", snooze_until: until, decision_id: "d1" });
  const plain = fakes();
  await core.snooze(plain.ports, { conv: conv(), until });
  assert.deepEqual(plain.ops(), ["snooze", "record"]);
  assert.deepEqual(plain.log[1], ["record", "conversation", "c1", "snooze", { until }]);
  const stale = fakes({ snooze: async () => false });
  await refused(core.snooze(stale.ports, { conv: conv(), until }), "conflict", 409, /reload/);
  assert.deepEqual(stale.ops(), ["snooze"]);
});

test("wake: only a snoozed thread wakes, only while still snoozed, and it goes back to being whatever it was", async () => {
  const { ports, ops } = fakes();
  assert.deepEqual(await core.wake(ports, { conv: conv({ state: "snoozed" }) }), { state: "open", decision_id: "d1" });
  assert.deepEqual(ops(), ["wake", "record"]);
  const open = fakes();
  await refused(core.wake(open.ports, { conv: conv({ state: "open" }) }), "conflict", 409, /not snoozed/);
  assert.deepEqual(open.ops(), []);
  const raced = fakes({ wake: async () => false });
  await refused(core.wake(raced.ports, { conv: conv({ state: "snoozed" }) }), "conflict", 409, /reload/);
});

test("archive: a paused thread's receptionist is released, the thread closed, the escalation resolved", async () => {
  const { ports, ops } = fakes();
  assert.deepEqual(await core.archive(ports, { conv: conv({ paused_until: new Date(NOW + HOUR).toISOString() }) }), { state: "archived", decision_id: "d1" });
  assert.deepEqual(ops(), ["pauseBot", "archive", "record", "resolveEscalation"]);
  const stale = fakes({ archive: async () => false });
  await refused(core.archive(stale.ports, { conv: conv() }), "conflict", 409, /reload/);
  assert.deepEqual(stale.ops(), ["archive"]);
});

test("resolve: an already-resolved escalation is an answer, not an error; the update lands before the ledger; the decision is linked back", async () => {
  const done = fakes();
  assert.deepEqual(await core.resolveEscalation(done.ports, { esc: { id: "e1", tenant_id: "t1", state: "resolved" } }), { state: "resolved", already: true });
  assert.deepEqual(done.ops(), []);
  const { ports, ops, log } = fakes();
  assert.deepEqual(await core.resolveEscalation(ports, { esc: { id: "e1", tenant_id: "t1", state: "open" } }), { state: "resolved", decision_id: "d1" });
  assert.deepEqual(ops(), ["resolve", "record", "link"]);
  assert.deepEqual(log[2], ["link", "e1", "d1"]);
  const raced = fakes({ resolve: async () => false });
  await refused(core.resolveEscalation(raced.ports, { esc: { id: "e1", tenant_id: "t1", state: "open" } }), "conflict", 409, /already resolved/);
  assert.deepEqual(raced.ops(), ["resolve"]);
});

test("cancel a send: only a queued row, the row before the job, and the words when the job won", async () => {
  const { ports, ops } = fakes();
  assert.deepEqual(await core.cancelSend(ports, { msg: { id: "m1", tenant_id: "t1", status: "queued" } }), { status: "canceled", decision_id: "d1" });
  assert.deepEqual(ops(), ["cancelQueued", "cancelJob", "record"]);
  const sent = fakes();
  await refused(core.cancelSend(sent.ports, { msg: { id: "m1", tenant_id: "t1", status: "sent" } }), "conflict", undefined, /already been sent/);
  assert.deepEqual(sent.ops(), []);
  const raced = fakes({ cancelQueued: async () => false });
  await refused(core.cancelSend(raced.ports, { msg: { id: "m1", tenant_id: "t1", status: "queued" } }), "conflict", undefined, /while you were canceling/);
  assert.deepEqual(raced.ops(), ["cancelQueued"]);
});
```

- [x] **Step 3: Run it and watch it fail** on the missing module: `node --conditions=react-server --import tsx --test tooling/scripts/tests/core-thread-verbs.test.mjs`.

- [x] **Step 4: The verbs.** Each file is the route's rule, moved. The comments come with them; they are the reasons.

`take-over.ts`:

```typescript
import { AppError } from "@chanlytics/contracts";
import type { Thread, ThreadPorts } from "./ports";

export type TakeOverPorts = Pick<ThreadPorts, "pauseMs" | "pauseBot" | "claim" | "withdrawDrafts" | "record" | "now">;
export interface TakeOverResult { state: "needs_human"; paused_until: string; decision_id: string; withdrawn_drafts: number }

/** Take over: pause the receptionist, claim the thread. The open escalation stays open (§4). */
export async function takeOver(ports: TakeOverPorts, cmd: { conv: Pick<Thread, "id" | "tenant_id" | "phone_e164">; userId: string }): Promise<TakeOverResult> {
  const { conv } = cmd;
  if (!conv.phone_e164) throw new AppError("conflict", "Conversation has no phone identity.");
  const untilMs = ports.now() + (await ports.pauseMs(conv.tenant_id));
  const paused_until = new Date(untilMs).toISOString();
  // The live receptionist reads its own store: mirror FIRST, fail loud.
  await ports.pauseBot(conv.tenant_id, conv.phone_e164, untilMs);
  if (!(await ports.claim(conv.id, paused_until, cmd.userId))) {
    // The mirror already paused the receptionist; release it so the two stores
    // do not disagree about a thread nobody took.
    await ports.pauseBot(conv.tenant_id, conv.phone_e164, 0);
    throw new AppError("conflict", "Could not take this thread over — reload and try again.", 409);
  }
  // A held reply must not land after a person has taken the thread — the case
  // the veto window exists to prevent.
  const withdrawn_drafts = await ports.withdrawDrafts(conv.tenant_id, conv.id);
  // No timer to set: expire_stale_pauses() ends the pause from paused_until (00098).
  const decision_id = await ports.record(conv.tenant_id, "conversation", conv.id, "take_over", { paused_until });
  return { state: "needs_human", paused_until, decision_id, withdrawn_drafts };
}
```

`hand-back.ts`:

```typescript
import { AppError } from "@chanlytics/contracts";
import type { Thread, ThreadPorts } from "./ports";

export type HandBackPorts = Pick<ThreadPorts, "pauseBot" | "release" | "record" | "resolveEscalation">;

/** Hand back: the receptionist resumes; the open escalation resolves (§4). */
export async function handBack(ports: HandBackPorts, cmd: { conv: Pick<Thread, "id" | "tenant_id" | "phone_e164"> }): Promise<{ state: "open"; decision_id: string }> {
  const { conv } = cmd;
  if (!conv.phone_e164) throw new AppError("conflict", "Conversation has no phone identity.");
  await ports.pauseBot(conv.tenant_id, conv.phone_e164, 0);
  if (!(await ports.release(conv.id))) throw new AppError("conflict", "Could not hand this thread back — reload and try again.", 409);
  const decision_id = await ports.record(conv.tenant_id, "conversation", conv.id, "hand_back");
  await ports.resolveEscalation(conv.id, decision_id);
  return { state: "open", decision_id };
}
```

`snooze.ts`:

```typescript
import { AppError } from "@chanlytics/contracts";
import type { Thread, ThreadPorts } from "./ports";

export const MAX_SNOOZE_MS = 30 * 24 * 3600 * 1000;
const NEEDS_UNTIL = "snooze needs a future `until` timestamp.";
export type SnoozePorts = Pick<ThreadPorts, "pauseBot" | "snooze" | "record" | "now">;
export interface SnoozeResult { state: "snoozed"; snooze_until: string; decision_id: string }

/** Snooze: hide from the queue until a wake time. The receptionist stays active. */
export async function snooze(ports: SnoozePorts, cmd: { conv: Pick<Thread, "id" | "tenant_id" | "paused_until" | "phone_e164">; until: string | undefined }): Promise<SnoozeResult> {
  const { conv } = cmd;
  const now = ports.now();
  const until = cmd.until ? new Date(cmd.until) : null;
  if (!until || Number.isNaN(until.getTime()) || until.getTime() <= now) throw new AppError("validation", NEEDS_UNTIL);
  if (until.getTime() - now > MAX_SNOOZE_MS) throw new AppError("validation", "snooze is capped at 30 days.");
  // Snooze hides the thread from the queue; it does NOT keep the receptionist
  // muted (that is take-over's job): release any pause first.
  if (conv.paused_until && conv.phone_e164) await ports.pauseBot(conv.tenant_id, conv.phone_e164, 0);
  const snooze_until = until.toISOString();
  if (!(await ports.snooze(conv.id, snooze_until))) throw new AppError("conflict", "Could not snooze this thread — reload and try again.", 409);
  // No timer to set: wake_stale_snoozes() reopens the thread from snooze_until (00098).
  const decision_id = await ports.record(conv.tenant_id, "conversation", conv.id, "snooze", { until: snooze_until });
  // The escalation deliberately stays OPEN. Resolving it here once returned the
  // thread at wake as "Handled — no one asked for you" while the customer who
  // had asked for a person was still waiting and in nobody's queue.
  return { state: "snoozed", snooze_until, decision_id };
}
```

`wake.ts`:

```typescript
import { AppError } from "@chanlytics/contracts";
import type { Thread, ThreadPorts } from "./ports";

export type WakePorts = Pick<ThreadPorts, "wake" | "record">;

/**
 * Wake now: end a snooze early and put the thread back exactly as it was.
 * Waking touches only the snooze — whatever the thread was (escalated, taken
 * over, open) is what it goes back to being; that state was never thrown
 * away when it was hidden.
 */
export async function wake(ports: WakePorts, cmd: { conv: Pick<Thread, "id" | "tenant_id" | "state"> }): Promise<{ state: "open"; decision_id: string }> {
  const { conv } = cmd;
  if (conv.state !== "snoozed") throw new AppError("conflict", "This thread is not snoozed.", 409);
  if (!(await ports.wake(conv.id))) throw new AppError("conflict", "Could not wake this thread — reload and try again.", 409);
  const decision_id = await ports.record(conv.tenant_id, "conversation", conv.id, "wake", {});
  return { state: "open", decision_id };
}
```

`archive.ts`:

```typescript
import { AppError } from "@chanlytics/contracts";
import type { Thread, ThreadPorts } from "./ports";

export type ArchivePorts = Pick<ThreadPorts, "pauseBot" | "archive" | "record" | "resolveEscalation">;

/** Archive: close the thread (a state, never a deletion — P3). A later inbound reopens it. */
export async function archive(ports: ArchivePorts, cmd: { conv: Pick<Thread, "id" | "tenant_id" | "paused_until" | "phone_e164"> }): Promise<{ state: "archived"; decision_id: string }> {
  const { conv } = cmd;
  // Closing a thread releases it completely; the receptionist must not stay muted meanwhile.
  if (conv.paused_until && conv.phone_e164) await ports.pauseBot(conv.tenant_id, conv.phone_e164, 0);
  if (!(await ports.archive(conv.id))) throw new AppError("conflict", "Could not archive this thread — reload and try again.", 409);
  const decision_id = await ports.record(conv.tenant_id, "conversation", conv.id, "archive");
  await ports.resolveEscalation(conv.id, decision_id);
  return { state: "archived", decision_id };
}
```

`resolve.ts`:

```typescript
import { AppError } from "@chanlytics/contracts";
import type { EscalationPorts } from "./ports";

export type ResolveResult = { state: "resolved"; already: true } | { state: "resolved"; decision_id: string };

/** Explicit resolve — "no change was needed" is also an answer (§4). */
export async function resolveEscalation(ports: EscalationPorts, cmd: { esc: { id: string; tenant_id: string; state: string } }): Promise<ResolveResult> {
  const { esc } = cmd;
  if (esc.state === "resolved") return { state: "resolved", already: true };
  // The update FIRST, row-counted; the ledger entry only once it landed, so a
  // resolve that RLS or a concurrent resolve excluded never leaves "resolve"
  // on the ledger for an escalation still open.
  if (!(await ports.resolve(esc.id))) throw new AppError("conflict", "This escalation was already resolved — reload.", 409);
  const decision_id = await ports.record(esc.tenant_id, "escalation", esc.id, "resolve");
  await ports.link(esc.id, decision_id);
  return { state: "resolved", decision_id };
}
```

`cancel-send.ts`:

```typescript
import { AppError } from "@chanlytics/contracts";
import type { CancelSendPorts } from "./ports";

/** The honest undo (§6): inside the grace window a queued send cancels cleanly; after fire it is out, and this says so. */
export async function cancelSend(ports: CancelSendPorts, cmd: { msg: { id: string; tenant_id: string; status: string } }): Promise<{ status: "canceled"; decision_id: string }> {
  const { msg } = cmd;
  if (msg.status !== "queued") throw new AppError("conflict", "Too late — this message has already been sent.");
  // The row, guarded on `queued`, closes the race the check above cannot: the
  // send job can fire between the read and the update. Zero rows means it won.
  if (!(await ports.cancelQueued(msg.id))) throw new AppError("conflict", "Too late — this message went out while you were canceling it.");
  await ports.cancelJob(msg.tenant_id, msg.id);
  const decision_id = await ports.record(msg.tenant_id, "message", msg.id, "cancel_send");
  return { status: "canceled", decision_id };
}
```

`conversations/index.ts` exports all of the above and `ports.ts`; `packages/core/src/index.ts` adds `export * from "./conversations";`.

- [x] **Step 5: Run the test green**, then prove it: swap `pauseBot` after `claim` in `takeOver` and watch the order case fail; put it back.

- [x] **Step 6: Build and link.** `corepack pnpm --filter ./packages/core build` (dist is committed; `dist-freshness.test.mjs` fails otherwise). Add `"@chanlytics/core": "workspace:*"` to `apps/dashboard/package.json` dependencies and run `COREPACK_ENABLE_DOWNLOAD_PROMPT=0 corepack pnpm install` (the edge and jobs already depend on it; the dashboard does not yet).

- [x] **Step 7: The adapter.** `apps/dashboard/src/server/core-ports.ts` — the only file that knows both the ports and the tables:

```typescript
import type { CancelSendPorts, EscalationPorts, ThreadPorts } from "@chanlytics/core";
import type { RouteContext } from "./with-route";
import { cancelPendingAiReply, pauseMsFor, recordDecision, resolveOpenEscalation } from "./verbs";
import { cancelKindFor, mirrorBlobPause } from "./service";

/**
 * True iff a row changed. An UPDATE that RLS or a vanished row excludes
 * reports success while changing nothing, and everything a verb does after
 * it would then describe a change that never happened.
 */
async function changed(q: PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>): Promise<boolean> {
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return !!data && data.length > 0;
}

export function threadPorts(ctx: RouteContext): ThreadPorts {
  const conversations = () => ctx.supabase.from("conversations");
  return {
    pauseMs: (tenantId) => pauseMsFor(ctx, tenantId),
    pauseBot: (tenantId, phone, untilMs) => mirrorBlobPause(tenantId, phone, untilMs),
    claim: (id, until, userId) => changed(conversations().update({ state: "needs_human", paused_until: until, snooze_until: null, assignee_user_id: userId }).eq("id", id).select("id")),
    release: (id) => changed(conversations().update({ state: "open", paused_until: null, snooze_until: null, assignee_user_id: null }).eq("id", id).select("id")),
    snooze: (id, until) => changed(conversations().update({ state: "snoozed", snooze_until: until, paused_until: null, assignee_user_id: null }).eq("id", id).select("id")),
    wake: (id) => changed(conversations().update({ state: "open", snooze_until: null }).eq("id", id).eq("state", "snoozed").select("id")),
    archive: (id) => changed(conversations().update({ state: "archived", paused_until: null, assignee_user_id: null }).eq("id", id).select("id")),
    withdrawDrafts: (tenantId, id) => cancelPendingAiReply(ctx, { id, tenant_id: tenantId }, (tid, k, v) => cancelKindFor(tid, "outbound_send", k, v)),
    resolveEscalation: (id, decisionId) => resolveOpenEscalation(ctx, id, decisionId),
    record: (tenantId, subject, id, verb, payload) => recordDecision(ctx, tenantId, subject, id, verb, payload),
    now: Date.now,
  };
}

export function escalationPorts(ctx: RouteContext): EscalationPorts {
  return {
    resolve: (id) => changed(ctx.supabase.from("escalations").update({ state: "resolved", resolved_by_user_id: ctx.userId }).eq("id", id).eq("state", "open").select("id")),
    link: async (id, decisionId) => {
      const { error } = await ctx.supabase.from("escalations").update({ decision_id: decisionId }).eq("id", id);
      if (error) console.error("resolve_link_decision_failed", id, error.message);
    },
    record: (tenantId, subject, id, verb, payload) => recordDecision(ctx, tenantId, subject, id, verb, payload),
  };
}

export function cancelSendPorts(ctx: RouteContext): CancelSendPorts {
  return {
    cancelQueued: (id) => changed(ctx.supabase.from("messages").update({ status: "canceled" }).eq("id", id).eq("status", "queued").select("id")),
    cancelJob: (tenantId, id) => cancelKindFor(tenantId, "outbound_send", "message_id", id),
    record: (tenantId, subject, id, verb, payload) => recordDecision(ctx, tenantId, subject, id, verb, payload),
  };
}
```

`RouteContext` is the type `verbs.ts` already takes; `recordDecision`'s `DecisionSubject`/`DecisionVerb` are the same unions core names, so the adapter passes them straight through (if the contracts' unions are wider, core's are a subset and assign cleanly).

- [x] **Step 8: The routes become adapters.** Each keeps its policy and loses its body:

```typescript
// conversations/[id]/take-over/route.ts
import { takeOver } from "@chanlytics/core";
import { write } from "@/server/route";
import { conversationScope } from "@/server/verbs";
import { threadPorts } from "@/server/core-ports";

/** Take over: pause the receptionist, claim the thread. The open escalation stays open (§4). */
export const POST = write({
  scope: conversationScope,
  role: "operator",
  rate: "thread_state",
  handle: ({ ctx, row: conv }) => takeOver(threadPorts(ctx), { conv, userId: ctx.userId }),
});
```

The same shape for hand-back (`handBack(threadPorts(ctx), { conv })`), snooze (`snooze(threadPorts(ctx), { conv, until: input.until })`, keeping its zod `input`), wake, archive; resolve keeps its `theEscalation` row scope and calls `resolveEscalation(escalationPorts(ctx), { esc })`; cancel-send keeps `theMessage` and calls `cancelSend(cancelSendPorts(ctx), { msg })`.

- [x] **Step 9: `inbox-routes.test.mjs` is the adapter's proof.** Run it: it drives the real route modules with `fakeDb`, so a port wired to the wrong column fails here. Add one case per verb that was not already run (wake, archive, resolve, cancel-send) if the file lacks it: the happy path and the 409, with `writes(ctx)` counted.

- [x] **Step 10: The pins.** `rg -l "conversations/\[id\]/(take-over|hand-back|snooze|wake|archive)|escalations/\[id\]/resolve|messages/\[id\]/cancel-send" tooling/scripts/tests` names the files that read these routes. For each assertion: if the branch it pins is now a case in `core-thread-verbs.test.mjs`, delete it; if it pins the policy (`role:`, `rate:`, the scope), it already lives in `route-policy.json` — delete it; anything left names the adapter's four lines, which is not worth a pin. Then `UPDATE_SOURCE_SCAN_BASELINE=1 pnpm test` to bank the fall. Never add one.

- [x] **Step 11: The wall.** In `hygiene.test.mjs` (a repo-wide lint file):

```javascript
test("a core verb knows no database, framework, provider or environment", () => {
  const dir = path.join(here, "../../../packages/core/src/conversations");
  const offenders = [];
  for (const f of fs.readdirSync(dir)) {
    for (const line of readCode(`packages/core/src/conversations/${f}`).split("\n")) {
      if (!/^import /.test(line)) continue;
      const ok = /from "\.\//.test(line) || /from "@chanlytics\/contracts"/.test(line) || /^import type .* from "@chanlytics\/db"/.test(line);
      if (!ok) offenders.push(`${f}: ${line.trim()}`);
    }
  }
  assert.deepEqual(offenders, [], "a verb takes the world through its ports; the adapter in core-ports.ts is where the tables are");
});
```

- [x] **Step 12: Typecheck, suite, lint, PR, merge when green.** `corepack pnpm -C apps/dashboard typecheck && corepack pnpm test && corepack pnpm lint`. Commit: `The thread verbs live in core and are tested by calling them`.

---

### Task 2: The reply (PR 2)

**Files:** `packages/core/src/conversations/reply.ts`, `core-ports.ts` (`replyPorts`), `conversations/[id]/reply/route.ts`, `verbs.ts` (`SEND_GRACE_MS` from core), `tooling/scripts/tests/core-reply.test.mjs`.

- [x] **Step 1: The ports and the shapes**, in `reply.ts`:

```typescript
import { AppError, isOptedOutContact, OPT_OUT_REFUSAL, purposeOfTemplate, replyWindow } from "@chanlytics/contracts";
import type { Json } from "@chanlytics/db";
import type { Thread, ThreadPorts } from "./ports";

export const SEND_GRACE_MS = 15 * 1000; // the cancelable window IS the undo (§6)
/**
 * How long a stored reply receipt is replayed instead of sending again. The
 * key identifies the message, not the attempt, so this window is the ONLY
 * thing separating "a retry of the send that just timed out" from "the
 * operator meant to say that again". A retry arrives in seconds.
 */
export const IDEMPOTENCY_WINDOW_MS = 30 * 1000;

export interface ReplyBody { text?: string; template?: { name: string; language: string; params?: string[] } }
export interface ReplyReceipt { message_id: string; status: string; cancelable_until: string; window_open: boolean; withdrawn_drafts: number }
export interface ReplyThread extends Pick<Thread, "id" | "tenant_id" | "phone_e164"> {
  contact_id: string | null;
  last_wa_inbound_at: string | null;
  consent: string | null;
  dnc: boolean | null;
  marketing_consent: string | null;
}
export interface QueuedReply {
  tenant_id: string; conversation_id: string; contact_id: string | null; channel: "whatsapp" | "sms";
  sent_by: string; type: "template" | "text"; body: string; template_name: string | null; template_vars: Json | null; content_hash: string;
}
export type SendPayload = { message_id: string; conversation_id: string; to_phone: string } & ({ body: string } | { template: { name: string; language: string; params: string[] } });

export interface ReplyPorts extends Pick<ThreadPorts, "pauseMs" | "pauseBot" | "withdrawDrafts" | "record" | "resolveEscalation" | "now"> {
  /** Where the person last wrote: a text has no 24-hour window and no templates. */
  replyChannel(conv: { id: string; tenant_id: string }): Promise<"whatsapp" | "sms">;
  /** The receipt stored under this caller's key, with when and for which intent. */
  priorReceipt(tenantId: string, key: string): Promise<{ response: ReplyReceipt; created_at: string; request_hash: string | null } | null>;
  /** The workspace's template by name and language, as Meta last told us about it. */
  template(tenantId: string, name: string, language: string): Promise<{ name: string; language: string; body_preview: string | null; meta_status: string | null; category: string | null } | null>;
  /** The facts a template's params come from, when the workspace has them. */
  templateFacts(tenantId: string): Promise<{ business_name: string; booking_link: string } | null>;
  /** needs_human, paused until, snooze cleared, claimed, and the thread touched now. True iff a row changed. */
  claimForReply(conversationId: string, untilIso: string, userId: string, nowIso: string): Promise<boolean>;
  /** The operator's words as a queued row; its id. */
  queue(row: QueuedReply): Promise<string>;
  /** The send job, due after the grace window; throws when it could not be scheduled. */
  schedule(tenantId: string, dueAt: Date, payload: SendPayload): Promise<void>;
  /** A queued row with no job to send it, canceled so it never sits "Sending…" forever. */
  cancelOrphan(messageId: string): Promise<void>;
  /** The receipt kept under the key for the replay window; a failure is logged there, never fatal. */
  storeReceipt(tenantId: string, key: string, requestHash: string, response: ReplyReceipt): Promise<void>;
  /** A stable digest of a string, for the intent and the content. */
  hash(s: string): string;
}
export interface ReplyCommand { conv: ReplyThread; userId: string; body: ReplyBody; idempotencyKey: string | null }
```

- [x] **Step 2: The failing test.** `tooling/scripts/tests/core-reply.test.mjs`, one case per branch, the fakes recording the order and what was queued:

```javascript
import { test } from "node:test";
import assert from "node:assert/strict";
import { importSrc } from "./_source.mjs";

const { replyToConversation, IDEMPOTENCY_WINDOW_MS, SEND_GRACE_MS } = await importSrc("packages/core/src/conversations/reply.ts");
const NOW = Date.parse("2026-09-11T12:00:00Z");
const HOUR = 3_600_000;
const iso = (ms) => new Date(ms).toISOString();
const conv = (over = {}) => ({ id: "c1", tenant_id: "t1", phone_e164: "+15550000001", contact_id: "k1", last_wa_inbound_at: iso(NOW - HOUR), consent: "opted_in", dnc: false, marketing_consent: null, ...over });
const approved = { name: "booking_link_v1", language: "en_US", body_preview: "Book with {{1}}: {{2}}", meta_status: "approved", category: "UTILITY" };

function fakes(over = {}) {
  const log = [];
  const ports = {
    pauseMs: async () => 2 * HOUR,
    pauseBot: async (t, p, until) => { log.push(["pauseBot", until]); },
    withdrawDrafts: async () => { log.push(["withdrawDrafts"]); return 1; },
    record: async (t, s, id, verb, payload) => { log.push(["record", verb, payload]); return "d1"; },
    resolveEscalation: async (id, d) => { log.push(["resolveEscalation", d]); },
    now: () => NOW,
    replyChannel: async () => "whatsapp",
    priorReceipt: async () => null,
    template: async () => approved,
    templateFacts: async () => ({ business_name: "Marisa's", booking_link: "https://book.example/m" }),
    claimForReply: async (id, until, user, now) => { log.push(["claim", until, now]); return true; },
    queue: async (row) => { log.push(["queue", row]); return "m1"; },
    schedule: async (t, due, payload) => { log.push(["schedule", due.toISOString(), payload]); },
    cancelOrphan: async (id) => { log.push(["cancelOrphan", id]); },
    storeReceipt: async (t, key, hash, response) => { log.push(["storeReceipt", key, hash, response]); },
    hash: (s) => `h(${s})`,
    ...over,
  };
  return { ports, log, ops: () => log.map((l) => l[0]) };
}
const cmd = (over = {}) => ({ conv: conv(), userId: "u1", body: { text: "On our way." }, idempotencyKey: null, ...over });
const refused = async (p, code, words) => assert.rejects(p, (e) => e.code === code && words.test(e.message));

test("a person who opted out is refused before anything is paused or queued", async () => {
  const { ports, ops } = fakes();
  await refused(replyToConversation(ports, cmd({ conv: conv({ consent: "opted_out" }) })), "conflict", /opt/i);
  assert.deepEqual(ops(), []);
});

test("inside the window: the words go as they are; the thread is paused and claimed BEFORE any row a job could send exists; the draft is withdrawn; the receipt says so", async () => {
  const { ports, log, ops } = fakes();
  const r = await replyToConversation(ports, cmd());
  assert.deepEqual(ops(), ["pauseBot", "claim", "withdrawDrafts", "queue", "schedule", "record", "resolveEscalation"]);
  assert.equal(log[3][1].body, "On our way.");
  assert.equal(log[3][1].type, "text");
  assert.equal(log[4][1], iso(NOW + SEND_GRACE_MS));
  assert.deepEqual(log[4][2], { message_id: "m1", conversation_id: "c1", to_phone: "+15550000001", body: "On our way." });
  assert.deepEqual(r, { message_id: "m1", status: "queued", cancelable_until: iso(NOW + SEND_GRACE_MS), window_open: true, withdrawn_drafts: 1 });
});

test("inside the window, empty text is refused; on the texting line a text over 1600 characters is refused", async () => {
  await refused(replyToConversation(fakes().ports, cmd({ body: { text: "  " } })), "validation", /required/);
  const sms = fakes({ replyChannel: async () => "sms" });
  await refused(replyToConversation(sms.ports, cmd({ body: { text: "x".repeat(1601) } })), "validation", /1600/);
});

test("outside the window: only an approved template goes, a promotion needs a yes to offers, and the params are the workspace's facts before the client's", async () => {
  const closed = conv({ last_wa_inbound_at: iso(NOW - 25 * HOUR) });
  await refused(replyToConversation(fakes().ports, cmd({ conv: closed })), "window_closed", /24-hour/);
  const pending = fakes({ template: async () => ({ ...approved, meta_status: "pending" }) });
  await refused(replyToConversation(pending.ports, cmd({ conv: closed, body: { template: { name: "booking_link_v1", language: "en_US" } } })), "validation", /not approved/);
  const promo = fakes({ template: async () => ({ ...approved, category: "MARKETING" }) });
  await refused(replyToConversation(promo.ports, cmd({ conv: closed, body: { template: { name: "booking_link_v1", language: "en_US" } } })), "forbidden", /offers/);
  const { ports, log } = fakes();
  const r = await replyToConversation(ports, cmd({ conv: closed, body: { template: { name: "booking_link_v1", language: "en_US", params: ["client", "params"] } } }));
  assert.equal(log[3][1].body, "Book with Marisa's: book.example/m", "the config's facts, the scheme stripped");
  assert.deepEqual(log[4][2].template, { name: "booking_link_v1", language: "en_US", params: ["Marisa's", "book.example/m"] });
  assert.equal(r.window_open, false);
  const bare = fakes({ templateFacts: async () => null });
  const fell = await replyToConversation(bare.ports, cmd({ conv: closed, body: { template: { name: "booking_link_v1", language: "en_US", params: ["A", "B"] } } }));
  assert.equal(fell.status, "queued", "the client's params are the fallback for a workspace with no facts");
  const none = fakes({ templateFacts: async () => null });
  await refused(replyToConversation(none.ports, cmd({ conv: closed, body: { template: { name: "booking_link_v1", language: "en_US" } } })), "validation", /no template facts/);
});

test("a claim that changed no row is a 409 and nothing was queued", async () => {
  const { ports, ops } = fakes({ claimForReply: async () => false });
  await refused(replyToConversation(ports, cmd()), "conflict", /nothing was sent/);
  assert.deepEqual(ops(), ["pauseBot", "claim"]);
});

test("a job that could not be scheduled cancels the row it would have sent, and the error is the caller's", async () => {
  const { ports, log } = fakes({ schedule: async () => { throw new Error("queue down"); } });
  await assert.rejects(replyToConversation(ports, cmd()), /queue down/);
  assert.deepEqual(log.at(-1), ["cancelOrphan", "m1"]);
});

test("a replay: the same key and intent inside the window returns the stored receipt and sends nothing; after the window, or for a different intent, it sends", async () => {
  const stored = { message_id: "m0", status: "queued", cancelable_until: iso(NOW), window_open: true, withdrawn_drafts: 0 };
  const key = "u1:k1";
  const fresh = fakes({ priorReceipt: async (t, k) => (k === key ? { response: stored, created_at: iso(NOW - 5_000), request_hash: "h({\"text\":\"On our way.\"})" } : null) });
  assert.deepEqual(await replyToConversation(fresh.ports, cmd({ idempotencyKey: "k1" })), stored);
  assert.deepEqual(fresh.ops(), []);
  const old = fakes({ priorReceipt: async () => ({ response: stored, created_at: iso(NOW - IDEMPOTENCY_WINDOW_MS - 1), request_hash: "h({\"text\":\"On our way.\"})" }) });
  assert.equal((await replyToConversation(old.ports, cmd({ idempotencyKey: "k1" }))).message_id, "m1");
  const other = fakes({ priorReceipt: async () => ({ response: stored, created_at: iso(NOW - 5_000), request_hash: "h(other)" }) });
  assert.equal((await replyToConversation(other.ports, cmd({ idempotencyKey: "k1" }))).message_id, "m1");
  const { log } = other;
  assert.deepEqual(log.at(-1)[0], "storeReceipt", "the receipt is stored under the caller's key with the intent");
  assert.equal(log.at(-1)[1], key);
});
```

- [x] **Step 3: Run it and watch it fail.**

- [x] **Step 4: The verb**, the route's rule moved with its reasons:

```typescript
/**
 * Human reply (§4/§6): honest by API shape. Inside the 24h window → freeform;
 * outside → approved template only. The send is NEVER synchronous: the row
 * sits status='queued' through a cancel window (the honest undo), then the
 * outbound_send job fires it. A dashboard reply implicitly pauses the
 * receptionist (D10).
 */
export async function replyToConversation(ports: ReplyPorts, cmd: ReplyCommand): Promise<ReplyReceipt> {
  const { conv, body } = cmd;
  if (!conv.phone_e164) throw new AppError("conflict", "Conversation has no phone identity.");
  // An opt-out binds the humans too — refuse BEFORE anything is queued, so the
  // operator is told rather than watching a message sit in "queued" and then
  // silently cancel itself when the job re-checks.
  if (isOptedOutContact(conv)) throw new AppError("conflict", OPT_OUT_REFUSAL);

  const channel = await ports.replyChannel(conv);
  const window = replyWindow(channel, conv.last_wa_inbound_at);
  const now = ports.now();

  // Idempotency: a replayed POST returns the original receipt, never a double
  // text. The key is scoped to the CALLER (the route prefixes the user) and
  // checked against the INTENT: a different body under the same key is a
  // different intent and goes through.
  const idemKey = cmd.idempotencyKey ? `${cmd.userId}:${cmd.idempotencyKey}` : null;
  const intentHash = ports.hash(JSON.stringify(body));
  if (idemKey) {
    const prior = await ports.priorReceipt(conv.tenant_id, idemKey);
    const sameIntent = !prior?.request_hash || prior.request_hash === intentHash;
    if (prior && sameIntent && now - Date.parse(prior.created_at) < IDEMPOTENCY_WINDOW_MS) return prior.response;
  }

  let messageBody: string;
  let templateVars: Json | null = null;
  let templateName: string | null = null;
  let jobTemplate: { name: string; language: string; params: string[] } | undefined;
  if (window.open) {
    if (!body.text?.trim()) throw new AppError("validation", "Reply text is required.");
    messageBody = body.text.trim();
    if (channel === "sms" && messageBody.length > 1600) throw new AppError("validation", "A text can be at most 1600 characters.");
  } else {
    if (!body.template?.name) throw new AppError("window_closed", "The 24-hour WhatsApp window is closed — replies must use an approved template.");
    const tpl = await ports.template(conv.tenant_id, body.template.name, body.template.language);
    if (!tpl || tpl.meta_status !== "approved") throw new AppError("validation", "Template not found or not approved.");
    // Which yes this template needs is Meta's category, and the door asks again
    // at the wire. Asked here too, so the operator hears a sentence now.
    if (purposeOfTemplate(tpl.category) === "marketing" && conv.marketing_consent !== "opted_in") {
      throw new AppError("forbidden", "This template is a promotion, and this person has not said yes to offers. Use an appointment template, or ask them first.");
    }
    // Params are TENANT FACTS (E4): the workspace's config first, the client's
    // as a fallback for a workspace with no config, bounded by the route's schema.
    const facts = await ports.templateFacts(conv.tenant_id);
    let params: string[] = facts ? [facts.business_name, facts.booking_link.replace(/^https?:[/][/]/, "")] : [];
    if (!params.length) params = body.template.params ?? [];
    if (!params.length) throw new AppError("validation", "This workspace has no template facts configured yet.");
    templateName = tpl.name;
    templateVars = { language: tpl.language, params } as Json;
    messageBody = params.reduce((acc, p, i) => acc.replaceAll(`{{${i + 1}}}`, p), tpl.body_preview ?? `[template ${tpl.name}]`);
    jobTemplate = { name: tpl.name, language: tpl.language, params };
  }

  // ORDER MATTERS: pause the receptionist and claim the thread BEFORE any row
  // exists that a job could send. A failure here means nothing was queued, so
  // "it failed" is the truth. Zero rows counts as failure: a forbidden or
  // mis-targeted UPDATE reports success.
  const pauseUntil = now + (await ports.pauseMs(conv.tenant_id));
  await ports.pauseBot(conv.tenant_id, conv.phone_e164, pauseUntil);
  if (!(await ports.claimForReply(conv.id, new Date(pauseUntil).toISOString(), cmd.userId, new Date(now).toISOString()))) {
    throw new AppError("conflict", "Could not take this thread over just now, so nothing was sent. Try again.", 409);
  }
  // The operator is REPLACING the receptionist's held reply, not queueing
  // behind it: withdraw the draft before writing their own words.
  const withdrawn_drafts = await ports.withdrawDrafts(conv.tenant_id, conv.id);

  const message_id = await ports.queue({
    tenant_id: conv.tenant_id, conversation_id: conv.id, contact_id: conv.contact_id, channel,
    sent_by: cmd.userId, type: jobTemplate ? "template" : "text", body: messageBody,
    template_name: templateName, template_vars: templateVars, content_hash: ports.hash(messageBody),
  });
  const dueAt = new Date(now + SEND_GRACE_MS);
  try {
    await ports.schedule(conv.tenant_id, dueAt, { message_id, conversation_id: conv.id, to_phone: conv.phone_e164, ...(jobTemplate ? { template: jobTemplate } : { body: messageBody }) });
  } catch (e) {
    // Never leave an orphan queued row that silently never sends.
    await ports.cancelOrphan(message_id);
    throw e;
  }
  const decision_id = await ports.record(conv.tenant_id, "conversation", conv.id, "reply", { message_id, window_open: window.open, template: templateName });
  await ports.resolveEscalation(conv.id, decision_id);

  const receipt: ReplyReceipt = { message_id, status: "queued", cancelable_until: dueAt.toISOString(), window_open: window.open, withdrawn_drafts };
  if (idemKey) await ports.storeReceipt(conv.tenant_id, idemKey, intentHash, receipt);
  return receipt;
}
```

Note `queue` no longer takes `direction`/`sender`/`status`: the adapter writes `direction: "outbound", sender: "human", status: "queued"` itself, because those are what "queue a human reply" means, and a verb that could be asked to queue an AI row would be a wider door than the route ever was.

- [x] **Step 5: Run the test green**, then prove it: move the `claimForReply` call below `queue` and watch the order case fail; put it back.

- [x] **Step 6: The adapter.** `replyPorts(ctx)` in `core-ports.ts`: `...threadPorts(ctx)` for the shared six; `replyChannel` → `replyChannelOf(ctx, conv)`; `priorReceipt` → the `idempotency_keys` select (`response, created_at, request_hash`), the response cast to `ReplyReceipt`; `template` → the `templates` select by `tenant_id, channel = "whatsapp", name, language`; `templateFacts` → `tenant_config.config.brain` when both `business_name` and `booking_link` are set, else null; `claimForReply` → the update with `last_message_at: nowIso`, row-counted; `queue` → the `messages` insert with `direction: "outbound", sender: "human", status: "queued"`, `.select("id").single()`; `schedule` → `schedule(tenantId, "outbound_send", dueAt, payload as unknown as Json)`; `cancelOrphan` → `messages.update({ status: "canceled" })`; `storeReceipt` → the upsert on `tenant_id,key` with `route: "reply"` and a fresh `created_at`, logging `idempotency_record_failed` on error; `hash` → `crypto.createHash("sha256").update(s).digest("hex").slice(0, 32)`.

- [x] **Step 7: The route.**

```typescript
import { z } from "zod";
import { replyToConversation } from "@chanlytics/core";
import { write } from "@/server/route";
import { conversationScope } from "@/server/verbs";
import { replyPorts } from "@/server/core-ports";

const ReplyBody = z.object({ /* as today: text ≤ 4096, template {name, language, params?} strict */ }).strict();

export const POST = write({
  scope: conversationScope,
  role: "operator",
  rate: "reply",
  input: ReplyBody,
  handle: ({ ctx, req, row: conv, input }) => replyToConversation(replyPorts(ctx), { conv, userId: ctx.userId, body: input, idempotencyKey: req.headers.get("idempotency-key") }),
});
```

`ReplyReceipt` in the route goes (core exports it); `verbs.ts` becomes `export { SEND_GRACE_MS } from "@chanlytics/core";` for its other readers; `assertCanSend` stays for the routes that still call it. The `VerbConversation` the scope loads already carries `consent`, `dnc`, `marketing_consent`, `contact_id` and `last_wa_inbound_at` (it is what `assertCanSend` and `replyWindow` read today), so it is a `ReplyThread` as it is.

- [x] **Step 8: `inbox-routes.test.mjs`** runs the reply route's happy path, the window-closed refusal and the viewer's refusal today; they stay green through the adapter. Then the pins: `rg -l "conversations/\[id\]/reply" tooling/scripts/tests`, the same rule as Task 1 Step 10; bank the ratchet.

- [x] **Step 9: Build, typecheck, suite, lint, PR, merge when green.** Commit: `The reply lives in core; the route is its adapter`.

---

## Status, 2026-09-11

| PR | What | Merged |
|---|---|---|
| 1 | The seven thread verbs, the adapter `core-ports.ts`, the wall in hygiene, the dashboard on `@chanlytics/core` | #376 |
| 2 | The reply, `replyPorts`, `SEND_GRACE_MS` in core | #377 |

Departures from the plan: the fakes in both tests log every port from one answers map, so an overridden port is logged too; `changed()` in the adapter is the one place zero rows is judged, and `doors-and-rows` pins the ports through it rather than each route; the reply adapter turns a failed claim into `false`, so the verb answers 409 ("nothing was sent") and a database error never reads as success; `packages/jobs` bundles core, so its committed dist is rebuilt whenever core changes. The receptionist's own verbs on the edge are the next home for these ports, and the expired-hold rule waits for Ruben.

## Definition of done

- Eight verbs in `packages/core/src/conversations/`, each with every branch a case in a test that runs it.
- Eight routes of policy plus one line of `handle`.
- `hygiene.test.mjs` holds the verbs to contracts, db types and each other.
- The source-scan baseline lower by every pin those routes carried.
- Behaviour unchanged for the operator: the same refusals in the same words, the same receipts; `inbox-routes.test.mjs` is the proof that the adapters wire the same columns.

## After this plan

- **Group two, the send path**: `outboundSend` in `packages/jobs/src/handlers.ts` onto core with ports for consent, the sender and the status writes, beside `deliver()` which is already there.
- **The receptionist's own verbs on the edge** (escalate, hold, answer) are the next home for these ports: `apps/edge/lib/whatsapp/inbound.ts` pauses the thread and queues the holding message in one breath, and the open divergence — answering after a hold expires while an escalation is open — becomes one rule in one verb once it lives here. That is Ruben's call to make first.
- **Steer** stays a route to the edge's rewrite: the rule is on the edge, and it moves with the receptionist's verbs.

## Self-review

- **Spec coverage.** The program's shape: `verb(ports, cmd)`, minimum ports named for meaning, `AppError` for the caller's mistakes, no database/framework/provider/env imports (Task 1 Step 11 holds it), the route as an adapter (Steps 7–8), the pinned tests deleted and the ratchet lowered (Step 10). The one departure — the row arrives loaded — is the consequence of `route()`, stated in the header.
- **Placeholders.** Every verb's code is in the plan; the reply adapter is described port by port because each is a two-line query the route holds today (lines named in Step 6); `ReplyBody`'s zod is the route's own, unchanged.
- **Types.** `ThreadPorts.record`'s subject and verb unions match what `recordDecision` takes; `ReplyPorts` extends the six thread ports it shares, so `replyPorts(ctx)` spreads `threadPorts(ctx)`; `ReplyReceipt` is the type the reply route already declared, moved; `SEND_GRACE_MS` has one home.

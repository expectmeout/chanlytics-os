# Core, group two: the send path — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The four job handlers — the queued send, the broadcast batch, the Blob thread erasure, the line provisioning — live in `packages/core` as functions over ports, each branch run by a test, and `packages/jobs/src/handlers.ts` keeps only the adapter that builds the ports from the job's context.

**Architecture:** Same shape as [group one](2026-09-11-core-conversation-verbs.md): `verb(ports, cmd)`, ports named for what they mean, `Error` for anything the world did wrong (a handler's throw is what fails the job, settles the message and tells the tenant), no database client, framework, provider or environment inside a verb. The door, `deliver()`, stays where it is and becomes a port the adapter hands in, so a verb can be run against a door that answers whatever the case needs. `JobContext`, `ClaimedJob`, `upsertEscalation` and the dispatch map stay in `packages/jobs`: the edge imports them from there, and they are the adapter's, not the rules'.

**Tech Stack:** TypeScript, `packages/core` (tsup, dist committed; `packages/jobs` bundles it, so the jobs dist is rebuilt with it), `node:test` with hand-written fakes.

---

## Why this group next

- The broadcast batch is the one handler no test runs. Six test files pin its text (`broadcasts`, `playbooks` twice, `templates-made-here`, `visit-playbooks`, `billing-pause`) and none exercise its branches: a person left queued because their row could not be read, a slot nothing can fill, a cancel landing mid-batch, the deadline yielding to a follow-up job. Those are the rules that decide who receives a promotion; they deserve to be run.
- The queued send is run today (`outbound-send.test.mjs`, ten cases through `packages/jobs/dist` and a fake Graph API), but its own two rules, the read that failed versus the message that is gone and the pager on a provider's 401, are executed only through that whole stack. As a verb they are four cases with fakes.
- After this group the ledger's four kinds are rules in core with adapters in jobs, and the source-scan baseline falls by the six pins above.

## Files

- Create: `packages/core/src/messages/ports.ts`, `send.ts`, `broadcast.ts`, `erase-thread.ts`, `provision-line.ts`, `index.ts`.
- Modify: `packages/core/src/index.ts` (export the group), `packages/jobs/src/handlers.ts` (adapters only), `tooling/scripts/tests/hygiene.test.mjs` (the wall covers `messages` too).
- Test: `tooling/scripts/tests/core-send-path.test.mjs` (the queued send, the erasure, the provisioning), `tooling/scripts/tests/core-broadcast.test.mjs`; `outbound-send`, `erasure`, `line-provision` and `jobs-ledger` keep running the adapters through the dist.

Two PRs: Task 1 (the queued send, the erasure, the provisioning) and Task 2 (the broadcast batch).

---

### Task 1: The queued send, the erasure, the provisioning (PR 1)

**Files:** `packages/core/src/messages/{ports,send,erase-thread,provision-line,index}.ts`, `packages/core/src/index.ts`, `packages/jobs/src/handlers.ts`, `tooling/scripts/tests/core-send-path.test.mjs`, `hygiene.test.mjs`.

- [x] **Step 1: The ports.** `packages/core/src/messages/ports.ts`:

```typescript
import type { SendPurpose } from "@chanlytics/contracts";
import type { Json } from "@chanlytics/db";
import type { Delivered, Delivery } from "../deliver";

/** The door, handed in: a verb never builds it, so a test can answer whatever the case needs. */
export type Door = (d: Delivery) => Promise<Delivered>;

export interface SendQueuedPorts {
  /**
   * The row as it stands, or null when it is gone. Throws when it cannot be
   * read: a read that FAILED and a message that is genuinely gone are
   * different facts, and collapsing them is how a reply once vanished.
   */
  queued(messageId: string): Promise<{ status: string; body: string | null; channel: string | null; sender: string | null } | null>;
  /** Which yes this send needs: the template's category as Meta has it, read now; unreadable throws. */
  purposeOf(template: { name: string; language: string } | undefined): Promise<SendPurpose>;
  deliver: Door;
  /** The thread flagged for a person, with why. */
  escalate(conversationId: string, reason: string, details: string): Promise<unknown>;
  alert(subject: string, body: string): Promise<void>;
  /** The platform's own pager, for a provider refusing every send on a wire. */
  page?(key: string, subject: string, body: string): Promise<unknown>;
}

export interface EraseThreadPorts {
  /** One stored Blob thread gone. False when it is still there. */
  eraseThread(namespace: string, threadId: string): Promise<boolean>;
  /** Every job row for this contact, or this one job, carries the scrubbed payload from now on. */
  scrub(tenantId: string, by: { contactId: string } | { jobId: string }, scrubbed: Json): Promise<void>;
  /** The same ledger as the owner's own erase decision, and the event. */
  recordErased(tenantId: string, contactId: string, threads: number, jobId: string): Promise<void>;
}

export interface ProvisionLinePorts {
  /** The saga, or its resumption: the edge's, because the provider and the credentials live there. Absent in a runtime that holds none. */
  provision?(lineId: string, by: "owner" | "support" | "sweep"): Promise<{ ok: boolean; step?: string; error?: string }>;
}
```

- [x] **Step 2: The failing test.** `tooling/scripts/tests/core-send-path.test.mjs`, fakes from one answers map as in group one, every branch a case:

```javascript
import { test } from "node:test";
import assert from "node:assert/strict";
import { importSrc } from "./_source.mjs";

const core = await importSrc("packages/core/src/messages/index.ts");
const WRITES = new Set(["deliver", "escalate", "alert", "page", "eraseThread", "scrub", "recordErased", "provision"]);
function fakes(over = {}) {
  const log = [];
  const answers = {
    queued: { status: "queued", body: "See you at 3", channel: "whatsapp", sender: "human" }, purposeOf: "conversational",
    deliver: { outcome: "sent", messageId: "m1", externalId: "wamid.1" }, escalate: "opened", alert: undefined, page: undefined,
    eraseThread: true, scrub: undefined, recordErased: undefined, provision: { ok: true },
    ...over,
  };
  const ports = {};
  for (const [name, answer] of Object.entries(answers)) {
    if (answer === null) continue; // a port the runtime does not hold
    ports[name] = async (...args) => {
      if (WRITES.has(name)) log.push([name, ...args]);
      if (answer instanceof Error) throw answer;
      return typeof answer === "function" ? answer(...args) : answer;
    };
  }
  return { ports, log, ops: () => log.map((l) => l[0]) };
}
const send = (payload = {}) => ({ tenantId: "t1", payload: { message_id: "m1", conversation_id: "c1", to_phone: "+13475550101", body: "See you at 3", ...payload } });

test("a queued row goes through the door with the row's own sender, the template's purpose, never proactive; a gone or handled row is a no-op", async () => {
  const { ports, log } = fakes();
  await core.sendQueued(ports, send());
  assert.equal(log.length, 1);
  const d = log[0][1];
  assert.deepEqual(d, { tenantId: "t1", conversationId: "c1", contactId: null, to: "+13475550101", channel: "whatsapp", sender: "human", purpose: "conversational", proactive: false, body: "See you at 3", template: undefined, messageId: "m1" });
  const ai = fakes({ queued: { status: "queued", body: "Hi!", channel: "whatsapp", sender: "ai" } });
  await core.sendQueued(ai.ports, send({ body: undefined }));
  assert.equal(ai.log[0][1].sender, "ai", "the door is handed the row's sender, never a constant");
  assert.equal(ai.log[0][1].body, "Hi!", "and the row's words when the payload carries none");
  const gone = fakes({ queued: null });
  await core.sendQueued(gone.ports, send());
  assert.deepEqual(gone.ops(), [], "canceled or already handled: nothing");
  const done = fakes({ queued: { status: "sent", body: "x", channel: "whatsapp", sender: "human" } });
  await core.sendQueued(done.ports, send());
  assert.deepEqual(done.ops(), []);
});

test("a read that failed is not a message that is gone: the job fails loudly", async () => {
  const { ports, ops } = fakes({ queued: new Error("PostgREST blip") });
  await assert.rejects(core.sendQueued(ports, send()), /cannot read message m1/);
  assert.deepEqual(ops(), []);
});

test("a template send asks which yes it needs, and a channel the row names travels on that wire", async () => {
  const { ports, log } = fakes({ purposeOf: "marketing", queued: { status: "queued", body: null, channel: "sms", sender: "human" } });
  const tpl = { name: "month_offer", language: "en_US", params: [] };
  await core.sendQueued(ports, send({ template: tpl, body: undefined }));
  assert.equal(log[0][1].purpose, "marketing");
  assert.equal(log[0][1].channel, "sms");
  assert.deepEqual(log[0][1].template, tpl);
});

test("a wire that could not carry it flags the thread and tells the owner; a provider's 401 or 403 pages the platform as well; a refusal does neither", async () => {
  const failed = fakes({ deliver: { outcome: "failed", reason: "provider", status: 500, errorBody: "boom", messageId: "m1" } });
  await core.sendQueued(failed.ports, send());
  assert.deepEqual(failed.ops(), ["deliver", "escalate", "alert"]);
  assert.deepEqual(failed.log[1], ["escalate", "c1", "send_failed", "Dashboard reply could not be delivered (HTTP 500)."]);
  assert.match(failed.log[2][1], /Reply delivery failed: \+13475550101/);
  const creds = fakes({ deliver: { outcome: "failed", reason: "provider", status: 401, errorBody: "bad token", messageId: "m1" } });
  await core.sendQueued(creds.ports, send());
  assert.deepEqual(creds.ops(), ["deliver", "page", "escalate", "alert"]);
  assert.equal(creds.log[1][1], "provider_auth:whatsapp");
  const noPager = fakes({ deliver: { outcome: "failed", reason: "provider", status: 403, errorBody: "", messageId: "m1" }, page: null });
  await core.sendQueued(noPager.ports, send());
  assert.deepEqual(noPager.ops(), ["deliver", "escalate", "alert"], "a runtime without a pager still flags and tells");
  const refused = fakes({ deliver: { outcome: "refused", reason: "opted_out", messageId: "m1" } });
  await core.sendQueued(refused.ports, send());
  assert.deepEqual(refused.ops(), ["deliver"], "the row says why; nobody is paged or flagged for a refusal");
});

test("the Blob erasure: every thread gone before the payload is scrubbed and the ledger written; a thread that stayed fails the job with nothing scrubbed; a scrubbed payload is a finished job", async () => {
  const { ports, log, ops } = fakes();
  await core.eraseBlobThread(ports, { tenantId: "t1", jobId: "j1", payload: { contact_id: "k1", namespace: "ns", thread_ids: ["a", "b", ""] } });
  assert.deepEqual(ops(), ["eraseThread", "eraseThread", "scrub", "recordErased"]);
  assert.deepEqual(log[2], ["scrub", "t1", { contactId: "k1" }, { contact_id: "k1", namespace: "ns", threads: 2, scrubbed: true }]);
  assert.deepEqual(log[3], ["recordErased", "t1", "k1", 2, "j1"]);
  const stuck = fakes({ eraseThread: (ns, id) => id !== "b" });
  await assert.rejects(core.eraseBlobThread(stuck.ports, { tenantId: "t1", jobId: "j1", payload: { contact_id: "k1", namespace: "ns", thread_ids: ["a", "b"] } }), /1 thread\(s\) not deleted/);
  assert.deepEqual(stuck.ops(), ["eraseThread", "eraseThread"], "the payload is the only thing that can retry it, so it stays");
  const done = fakes();
  await core.eraseBlobThread(done.ports, { tenantId: "t1", jobId: "j1", payload: { scrubbed: true } });
  assert.deepEqual(done.ops(), []);
  await assert.rejects(core.eraseBlobThread(fakes().ports, { tenantId: "t1", jobId: "j1", payload: {} }), /no namespace/);
  const anon = fakes();
  await core.eraseBlobThread(anon.ports, { tenantId: "t1", jobId: "j1", payload: { namespace: "ns", thread_ids: ["a"] } });
  assert.deepEqual(anon.log[1], ["scrub", "t1", { jobId: "j1" }, { contact_id: null, namespace: "ns", threads: 1, scrubbed: true }]);
  assert.deepEqual(anon.ops(), ["eraseThread", "scrub"], "no contact, no ledger row");
});

test("the provisioning: the saga is the edge's; a runtime without it fails loudly, and a saga that stopped names its step", async () => {
  const { ports, log } = fakes();
  await core.provisionLine(ports, { payload: { line_id: "l1", by: "sweep" } });
  assert.deepEqual(log[0], ["provision", "l1", "sweep"]);
  await core.provisionLine(fakes().ports, { payload: { line_id: "l1", by: "nobody" } });
  await assert.rejects(core.provisionLine(fakes().ports, { payload: {} }), /line_id is required/);
  await assert.rejects(core.provisionLine(fakes({ provision: null }).ports, { payload: { line_id: "l1" } }), /holds no line provider/);
  await assert.rejects(core.provisionLine(fakes({ provision: { ok: false, step: "buy", error: "no numbers" } }).ports, { payload: { line_id: "l1" } }), /stopped at buy: no numbers/);
});
```

- [x] **Step 3: Run it and watch it fail** on the missing module.

- [x] **Step 4: The verbs.**

`send.ts`:

```typescript
import type { Channel } from "../deliver";
import type { SendQueuedPorts } from "./ports";

export interface SendQueuedCommand {
  tenantId: string;
  payload: { message_id: string; conversation_id: string; to_phone: string; body?: string; template?: { name: string; language: string; params: string[] } };
}

/**
 * outbound_send: the honest undo — the message sat status='queued' through
 * its cancel window; if it is STILL queued, send it through the door and
 * finalize. The door re-reads the person's consent with this message's
 * purpose, the thread's pause and the workspace's status at the wire; what is
 * here is the outbox's own business: whether the row is still there to send,
 * which yes its template needs, and who is told when the wire could not carry it.
 */
export async function sendQueued(ports: SendQueuedPorts, cmd: SendQueuedCommand): Promise<void> {
  const p = cmd.payload;
  let msg;
  try {
    msg = await ports.queued(p.message_id);
  } catch (e) {
    // Throw: the tick fails the job, settles the message and tells the tenant,
    // so it is visibly stuck rather than invisibly lost.
    throw new Error(`outbound_send: cannot read message ${p.message_id}: ${e instanceof Error ? e.message : String(e)}`);
  }
  if (!msg || msg.status !== "queued") return; // canceled or already handled: no-op
  // Which yes this send needs. Never proactive: everything on this queue
  // answers a thread that exists.
  const purpose = await ports.purposeOf(p.template);
  // A channel this runtime has no wire for finds none at the door and fails
  // loudly, leaving the customer un-messaged rather than reached over the wrong wire.
  const channel = (msg.channel ?? "whatsapp") as Channel;
  const out = await ports.deliver({
    tenantId: cmd.tenantId,
    conversationId: p.conversation_id,
    contactId: null,
    to: p.to_phone,
    channel,
    // Read from the ROW, not hardcoded: under a veto window the receptionist's
    // own reply travels this path, and stamping every send "human" would make
    // the metrics report a bot's words as a person's.
    sender: (msg.sender ?? "human") as "ai" | "human" | "system",
    purpose,
    proactive: false,
    body: p.body ?? msg.body ?? "",
    template: p.template,
    messageId: p.message_id,
  });
  if (out.outcome !== "failed") return;
  // A 401 or 403 from the provider is the platform's problem, not this thread's.
  if (out.reason === "provider" && (out.status === 401 || out.status === 403)) {
    await ports.page?.(`provider_auth:${channel}`, `${channel} rejected a send with ${out.status}`, `Tenant ${cmd.tenantId}, message ${p.message_id}. Credentials, not content.`);
  }
  // The wire could not carry it: the thread is flagged for a person and the
  // owner told. A refusal needs neither; the row says why.
  await ports.escalate(p.conversation_id, "send_failed", `Dashboard reply could not be delivered (HTTP ${out.status}).`);
  await ports.alert(`Reply delivery failed: ${p.to_phone}`, `A reply queued from the dashboard could not be sent (HTTP ${out.status}). The thread is flagged in the Inbox.`);
}
```

`erase-thread.ts`:

```typescript
import type { EraseThreadPorts } from "./ports";

export interface EraseThreadCommand { tenantId: string; jobId: string; payload: { contact_id?: string; namespace?: string; thread_ids?: unknown; scrubbed?: boolean } }

/**
 * blob_thread_erase: the copy Postgres cannot reach. The dashboard queues
 * this BEFORE it destroys anything, so a crash mid-erasure leaves a
 * retryable request rather than an orphaned transcript.
 */
export async function eraseBlobThread(ports: EraseThreadPorts, cmd: EraseThreadCommand): Promise<void> {
  const p = cmd.payload;
  // A sibling job (a retry that raced this one) already finished this contact's
  // Blob leg and scrubbed every payload for it: nothing to do, no second ledger row.
  if (p.scrubbed) return;
  if (!p.namespace) throw new Error("blob_thread_erase: payload has no namespace");
  const ids = (Array.isArray(p.thread_ids) ? p.thread_ids : []).filter((t): t is string => typeof t === "string" && t.length > 0);
  const failed: string[] = [];
  for (const id of ids) if (!(await ports.eraseThread(p.namespace, id))) failed.push(id);
  if (failed.length) throw new Error(`blob_thread_erase: ${failed.length} thread(s) not deleted`);
  // The payload carried the customer's phone digits, because that IS the Blob
  // key. Once the objects are gone it is a durable copy of the identifier we
  // were asked to erase; scrub it, but only on success, because while the leg
  // is outstanding this payload is the only thing that can retry it.
  const scrubbed = { contact_id: p.contact_id ?? null, namespace: p.namespace, threads: ids.length, scrubbed: true };
  await ports.scrub(cmd.tenantId, p.contact_id ? { contactId: p.contact_id } : { jobId: cmd.jobId }, scrubbed);
  if (p.contact_id) await ports.recordErased(cmd.tenantId, p.contact_id, ids.length, cmd.jobId);
}
```

`provision-line.ts`:

```typescript
import type { ProvisionLinePorts } from "./ports";

/** line_provision: the durable part is the ledger's; the saga is the edge's, and reads its own receipts. */
export async function provisionLine(ports: ProvisionLinePorts, cmd: { payload: Record<string, unknown> }): Promise<void> {
  const lineId = typeof cmd.payload.line_id === "string" ? cmd.payload.line_id : "";
  const by = cmd.payload.by === "sweep" || cmd.payload.by === "support" ? cmd.payload.by : "owner";
  if (!lineId) throw new Error("line_provision: payload.line_id is required");
  if (!ports.provision) throw new Error("line_provision: this runtime holds no line provider");
  const r = await ports.provision(lineId, by);
  if (!r.ok) throw new Error(`line_provision: stopped at ${r.step ?? "?"}: ${r.error ?? "unknown"}`);
}
```

`messages/index.ts` exports the four files; `packages/core/src/index.ts` adds `export * from "./messages";`.

- [x] **Step 5: Run the test green.**

- [x] **Step 6: The adapter.** In `packages/jobs/src/handlers.ts`, the three handlers become port-builders; `upsertEscalation`, `JobContext`, `ClaimedJob`, `HANDLERS` and `dispatchJob` stay:

```typescript
import { deliver, eraseBlobThread, provisionLine, sendQueued, templatePurpose } from "@chanlytics/core";

async function outboundSend(ctx: JobContext, job: ClaimedJob): Promise<void> {
  await sendQueued(
    {
      queued: async (id) => {
        const { data, error } = await ctx.db.from("messages").select("id, status, body, template_name, channel, sender").eq("id", id).eq("tenant_id", job.tenant_id).maybeSingle();
        if (error) throw new Error(error.message);
        return data;
      },
      purposeOf: (template) => templatePurpose(ctx.db, job.tenant_id, template),
      deliver: (d) => deliver({ db: ctx.db, wire: ctx.wire }, d),
      escalate: (conversationId, reason, details) => upsertEscalation(ctx.db, job.tenant_id, conversationId, reason, details),
      alert: ctx.alert,
      ...(ctx.page ? { page: ctx.page } : {}),
    },
    { tenantId: job.tenant_id, payload: job.payload as SendQueuedCommand["payload"] },
  );
}

async function blobThreadErase(ctx: JobContext, job: ClaimedJob): Promise<void> {
  await eraseBlobThread(
    {
      eraseThread: ctx.eraseThread,
      scrub: async (tenantId, by, scrubbed) => {
        const q = ctx.db.from("jobs").update({ payload: scrubbed });
        if ("contactId" in by) await q.eq("tenant_id", tenantId).eq("kind", "blob_thread_erase").eq("payload->>contact_id", by.contactId);
        else await q.eq("id", by.jobId);
      },
      recordErased: async (tenantId, contactId, threads, jobId) => {
        await ctx.db.from("decisions").insert({ tenant_id: tenantId, subject_type: "contact", subject_id: contactId, verb: "erase", actor_type: "system", payload: { leg: "blob", threads, job_id: jobId } });
        await ctx.db.from("events").insert({ tenant_id: tenantId, kind: "contact.blob_erased", category: "contact", subject_type: "contact", subject_id: contactId, data: { threads } });
      },
    },
    { tenantId: job.tenant_id, jobId: job.id, payload: job.payload as EraseThreadCommand["payload"] },
  );
}

async function lineProvision(ctx: JobContext, job: ClaimedJob): Promise<void> {
  await provisionLine({ ...(ctx.provisionLine ? { provision: ctx.provisionLine } : {}) }, { payload: job.payload });
}
```

The queued read's `maybeSingle()` reports an absent row as `data: null` without an error, so the two facts stay separable; the adapter throws only on `error`, and the verb turns that into the job's loud failure.

- [x] **Step 7: Build, run the adapters' own tests.** `corepack pnpm --filter "./packages/*" build`, restore the CR-only dists by name; then `outbound-send.test.mjs`, `erasure.test.mjs`, `line-provision.test.mjs`, `jobs-ledger.test.mjs` through the dist, unchanged.

- [x] **Step 8: The pins.** `veto-window.test.mjs:162` (the row's sender) names `packages/core/src/messages/send.ts` instead; `person-mode-enforcement.test.mjs:83` (`EscalationOutcome`) and `store-retired.test.mjs:73` (the dispatch map) still read `handlers.ts`, which keeps both. `rg -l "jobs/src/handlers" tooling/scripts/tests` for anything else; bank the ratchet.

- [x] **Step 9: The wall.** `hygiene.test.mjs`'s core lint walks `packages/core/src/messages` as well and allows a relative `../` import (the door's types).

- [x] **Step 10: Typecheck (`corepack pnpm -r typecheck`), suite, lint, PR, merge when green.** Commit: `The queued send, the erasure and the provisioning live in core`.

---

### Task 2: The broadcast batch (PR 2)

**Files:** `packages/core/src/messages/broadcast.ts` (+ its ports in `ports.ts`), `packages/jobs/src/handlers.ts`, `tooling/scripts/tests/core-broadcast.test.mjs`.

- [x] **Step 1: The ports**, added to `ports.ts`:

```typescript
export interface BroadcastRow { id: string; state: string; name: string; template_name: string; template_language: string; params: unknown; recipient_count: number | null; playbook_id: string | null; audience: unknown }
export interface RecipientRow { contact_id: string; facts: unknown }
export interface ContactRow { id: string; phone_e164: string | null; erased_at: string | null; display_name: string | null; wa_profile_name: string | null }
export type RecipientMark = { state: "sent" | "skipped" | "failed"; reason?: string | null; message_id?: string | null };

export interface BroadcastBatchPorts {
  /** The broadcast, or null when it is gone; throws when it cannot be read. */
  broadcast(id: string): Promise<BroadcastRow | null>;
  workspacePaused(): Promise<boolean>;
  fail(id: string, failure: string): Promise<void>;
  /** scheduled → sending, only while scheduled. */
  startSending(id: string): Promise<void>;
  /** The template as Meta has it: its status, its words, its category. */
  template(name: string, language: string): Promise<{ meta_status: string | null; body_preview: string | null; category: string | null } | null>;
  /** The workspace's own words for the slots that name it. */
  facts(): Promise<{ businessName: string; bookingLink: string | null }>;
  /** Up to `limit` people still queued; throws when it cannot be read. */
  batch(id: string, limit: number): Promise<RecipientRow[]>;
  /** One person's row, null when gone; throws when it cannot be read. */
  contact(contactId: string): Promise<ContactRow | null>;
  /** The thread this send belongs to, never created here. */
  target(phoneE164: string): Promise<{ conversationId: string } | null>;
  mark(id: string, contactId: string, patch: RecipientMark): Promise<void>;
  deliver: Door;
  /** How many are still queued; throws when it cannot be counted. */
  remaining(id: string): Promise<number>;
  state(id: string): Promise<string | null>;
  /** The next batch, as this tenant, through the same door the dashboard uses. */
  scheduleNext(id: string): Promise<void>;
  /** sending → sent, the event, with the tally. */
  finish(id: string, tally: { sent: number; held: number }): Promise<void>;
  alert(subject: string, body: string): Promise<void>;
  now(): number;
  sleep(ms: number): Promise<void>;
}
export interface BroadcastBatchCommand { tenantId: string; broadcastId: string; deadline: number }
```

- [x] **Step 2: The failing test.** `core-broadcast.test.mjs`, every branch: gone → nothing; a state other than scheduled or sending → nothing; a paused workspace → `fail(id, "paused")` and the owner's words; scheduled → `startSending` first; a template withdrawn → `fail(id, "template_not_approved")`, nothing sent; a person whose row cannot be read → left queued, nothing marked; erased → `skipped/erased`; no phone → `skipped/no_phone`; no target → `skipped/no_phone`; a slot nothing can fill → `skipped/missing_value` and no send; the door's sent/refused/failed → `sent`/`skipped(reason)`/`failed(send_failed)`, with the delivery carrying `purpose` from the category, `proactive: true`, `sender: "human"`, the template's rendered words and the playbook's name in `meta`; the deadline: with two people and `now()` past the deadline after the first, one send, then the follow-up is scheduled; remaining > 0 and still sending → `scheduleNext`; remaining > 0 but canceled meanwhile → nothing; remaining 0 → `finish` with the tally and the owner told with the held count.

- [x] **Step 3: Run it and watch it fail.**

- [x] **Step 4: The verb**, `broadcast.ts`: `broadcastSend`'s body with `ports.*` in place of the queries, `BROADCAST_CHUNK`, `BROADCAST_GAP_MS`, `parseParamSpec`, `resolveParams`, `renderTemplate`, `firstNameOf` and `purposeOfTemplate` from contracts as today, `ports.now()` and `cmd.deadline` for the yield, `ports.sleep(BROADCAST_GAP_MS)` between people. A person whose row cannot be read is caught and left queued (`console.error("broadcast_contact_unreadable", …)`), as today.

- [x] **Step 5: Run it green**, then prove it: move the template check below the first send and watch the withdrawn-template case fail; put it back.

- [x] **Step 6: The adapter.** `broadcastSend` in `handlers.ts` builds the ports: `broadcast` (the select with `.eq("tenant_id")`, throwing on error), `workspacePaused` (`tenants.status === "paused"`), `fail` (state, failure, finished_at), `startSending` (`.eq("state", "scheduled")`), `template` (the four-column select), `facts` (`tenants.name` and `parseTenantConfig(config).brain`), `batch` (`.eq("state", "queued").limit(limit)`), `contact`, `target` (`resolveOutboundTarget(db, { tenantId, phoneE164, create: false })`), `mark` (with `sent_at`), `deliver`, `remaining` (the head count), `state`, `scheduleNext` (`ctx.schedule("broadcast_send", new Date(), { broadcast_id })`), `finish` (state sent + the `broadcast.sent` event), `alert: ctx.alert`, `now: Date.now`, `sleep`.

- [x] **Step 7: The pins.** `broadcasts.test.mjs:173`, `playbooks.test.mjs:97` and `:184`, `templates-made-here.test.mjs:100`, `visit-playbooks.test.mjs:131`, `billing-pause.test.mjs:53`: each names a branch that `core-broadcast.test.mjs` now runs. Delete the assertion, or where it pins wording the owner reads (the paused message, the playbook's name in `meta`), point it at `packages/core/src/messages/broadcast.ts`. Bank the ratchet.

- [x] **Step 8: Build, typecheck, suite, lint, PR, merge when green.** Commit: `The broadcast batch lives in core and every branch is run`.

---

## Definition of done

- Four verbs in `packages/core/src/messages/`, every branch a case in a test that runs it.
- `packages/jobs/src/handlers.ts` is the adapter: ports from `JobContext`, the dispatch map, `upsertEscalation` for the edge.
- The wall covers `messages`; the ratchet baseline is lower by the six broadcast pins.
- `outbound-send`, `erasure`, `line-provision` and `jobs-ledger` keep running the adapters through the dist, unchanged.

## After this plan

- **Group three, broadcasts and playbooks** on the dashboard and `apps/edge/lib/playbooks.ts`: the run planner (`planRun`, eligibility, the daily slice) is already pure; what moves is the run's assembly.
- **The receptionist's own verbs** on the edge (escalate, hold, answer): the largest and the last, on its own, once Ruben decides the expired-hold rule.

## Self-review

- **Spec coverage.** The program's group two sentence: "`outboundSend` … becomes `core/messages/send.ts` with ports for consent, the sender, the status writes; `handlers.ts` keeps only the adapter. `blobThreadErase` and `broadcastSend` follow." Consent, the sender and the status writes are the door's, handed in as one port (`deliver`); the adapter keeps only the queries. `lineProvision` comes along so the map is uniform.
- **Placeholders.** Task 1's verbs and tests are in full; Task 2's ports and the test's case list are in full, and the verb is the handler's body with named ports, which the executing engineer copies from `handlers.ts` rather than from this page.
- **Types.** `Door` is `deliver`'s own signature; `SendPurpose` is contracts'; `RecipientMark` is the recipient table's state set; `BroadcastBatchCommand.deadline` is `JobContext.deadline`.

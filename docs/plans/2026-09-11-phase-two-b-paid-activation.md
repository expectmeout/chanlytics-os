# Phase Two B: Paid Activation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish PRD G1 for everything but texting: every browser subscription is scoped to the workspace it shows, every edge door trusts the signed token, an owner's activation of a capability is a record the product computes status from, a line's provisioning runs on the ledger under a lease, and the WhatsApp handler is executed by a test rather than pinned by its text.

**Architecture:** Five PRs on `origin/main`, cheapest first. Two carry migrations (00108, 00109) and open held. Nothing here touches texting: the A2P sagas, the OTP leg and the campaign recreate stay last, as Ruben decided. The Retell `?key=` fallback is NOT retired in this plan: production's own record (`events` kind `webhook.auth`, 127 deliveries on 2026-09-05) shows the signature verified in neither form and the key opened every one, so the fallback is load-bearing until the signature question is diagnosed against a fresh delivery.

**Tech Stack:** as phase two A: pnpm 10 (`corepack pnpm`), Node 22, TypeScript, Next.js dashboard, Vercel functions (edge), Supabase Postgres with pg_cron, node:test + tsx, `tooling/scripts/tests/_fake-db.mjs`.

**Rules:** the house rules of the two earlier plans apply unchanged. Two more from 2A: after any package build, the three dist files that differ only in line endings (`packages/contracts/dist/index.d.ts`, `index.js`, `packages/db/dist/index.d.ts`) show in `git status` but not in `git diff --name-only`, so restore them by name; and the env-manifest test wants every declared variable read as a literal `process.env.NAME`.

---

### Task 1: Realtime is scoped to the active workspace

`subscribeMessagesInserts` (packages/db) already takes a `tenantId` and puts `filter: tenant_id=eq.<id>` on every watched table, and RLS authorises the events server-side. The one caller, the legacy bridge's surface runner, never passes it: a member of two workspaces receives the other workspace's inserts on every subscription and repaints on them. Every production account holds two workspaces.

**Files:**
- Modify: `apps/dashboard/src/legacy-bridge/surface-runner.ts` (the `subscribeMessagesInserts` call, `tenantId` and a per-workspace topic)
- Test: `tooling/scripts/tests/realtime-scope.test.mjs` (new, executed against a fake client)

- [x] **Step 1: The failing test**

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { subscribeMessagesInserts } from "@chanlytics/db";

/** A client whose channel records what it was asked to listen to. */
function fakeClient() {
  const listened = [];
  let status = null;
  const channel = {
    on(kind, spec, cb) { listened.push({ kind, ...spec, cb }); return channel; },
    subscribe(onStatus) { status = onStatus; return channel; },
  };
  const client = {
    auth: { getSession: async () => ({ data: { session: { access_token: "jwt" } } }) },
    realtime: { setAuth(t) { client.token = t; } },
    channel: (topic) => { client.topic = topic; return channel; },
    removeChannel: async () => { client.removed = true; },
    token: null, topic: null, removed: false,
  };
  return { client, listened, fire: (s) => status && status(s) };
}
const tick = () => new Promise((r) => setTimeout(r, 0));

test("with a workspace named, every watched table is filtered to it, on a topic of its own", async () => {
  const { client, listened } = fakeClient();
  const off = subscribeMessagesInserts(client, () => {}, { tenantId: "ws-1", topic: "bridge:ws-1" });
  await tick();
  assert.ok(listened.length >= 9, "every watched table");
  for (const l of listened) assert.equal(l.filter, "tenant_id=eq.ws-1", `${l.table} is filtered`);
  assert.equal(client.topic, "db-changes:bridge:ws-1");
  assert.equal(client.token, "jwt", "the session token is pushed before the join");
  off();
  assert.equal(client.removed, true);
});

test("without a workspace, nothing is filtered: the caller must say", async () => {
  const { client, listened } = fakeClient();
  subscribeMessagesInserts(client, () => {}, {});
  await tick();
  for (const l of listened) assert.equal(l.filter, undefined);
});
```

Run: `node --conditions=react-server --import tsx --test tooling/scripts/tests/realtime-scope.test.mjs` → both pass already (the wrapper is right); the bridge is what is wrong, and its pin moves in Step 2.

- [x] **Step 2: The bridge names the workspace**

In `surface-runner.ts`, the call becomes:

```ts
    const ws = tenantId();
    unsubscribe = subscribeMessagesInserts(
      supabase,
      (row, table, event) => …unchanged…,
      {
        // Scoped to the workspace this tab shows: a member of two workspaces
        // must not receive, or repaint on, the other one's rows. RLS still
        // authorises server-side; the filter is what makes the subscription
        // the active workspace's and nobody else's.
        topic: ws ? `${topic}:${ws}` : topic,
        tenantId: ws ?? undefined,
        onStatus: …unchanged…,
      },
    );
```

- [x] **Step 3: Typecheck, full suite, commit, PR, merge when green.** Commit: `Realtime is scoped to the workspace the tab shows`.

---

### Task 2: Every edge door trusts the token, and every caller carries one

2A moved four doors (lines, billing, google, llm) and their four callers. Seventeen doors still compare `x-diag-key` with `!==` (sixteen under `admin/` and `/api/diag`), and eleven callers in `service.ts` and `signup.ts` still send the key to a literal address. This task is mechanical: `authorizeAdmin(request, "<door path>")` on every door, `workspaceFor(auth, body.tenant_id)` on the ten doors that act on a workspace, a row-tenant check on the two that act on a row (steer on a message, whisper on a call), and `edgeUrl()` + `edgeHeaders(aud, { workspace })` on every caller. The shared key still opens every door (constant time), so the ops scripts (`eval-brain.mjs`, `golden-edge.mjs`, `run-backfill.mjs`, `run-calls-backfill.mjs`) keep working; retiring the key path is the step after Ruben sets `EDGE_CALL_SECRET`, and it is not in this plan.

**Files:**
- Modify: `apps/edge/api/admin/{backfill-calls,backfill,eval,pause,playbooks-run,setup-request,signup-notify,steer,voice-converge,voice-provision,whisper}.ts`, `apps/edge/api/admin/whatsapp/{connect,signup-config,templates-create,templates-delete,templates-sync}.ts`, `apps/edge/api/diag.ts`
- Modify: `apps/dashboard/src/server/service.ts` (ten fetches, the `EDGE_BASE` literal), `apps/dashboard/src/server/signup.ts` (one fetch, the literal)
- Test: the fourteen pins on these files move (call-outcomes, eval-harness, steer ×2, templates-made-here, templates-truth ×2, voice-provision, whatsapp-connect ×2, whisper ×2, setup ×2); none are added. `edge-token.test.mjs` already proves the token.

- [x] **Step 1: The doors**

Replace, in each door, the three-line gate

```ts
  if (!process.env.DIAG_KEY || request.headers.get("x-diag-key") !== process.env.DIAG_KEY) {
    return json(403, { ok: false });
  }
```

with `const auth = authorizeAdmin(request, "/api/admin/<name>");\n  if (!auth.ok) return auth.response;` (diag's `headerOk` line becomes the same two lines with `"/api/diag"`), importing `authorizeAdmin` (and `workspaceFor` where used) from `../../lib/admin-auth.js` (`../lib/admin-auth.js` from `api/diag.ts`, `../../../lib/admin-auth.js` from `api/admin/whatsapp/`).

Where the door reads `tenant_id` from its body, the token's workspace is believed over the body: immediately before the line that reads it (`const tenantId = …body.tenant_id…`, or the first use of `body.tenant_id`), insert

```ts
  const ws = workspaceFor(auth, body.tenant_id);
  if (!ws.ok) return ws.response;
  body.tenant_id = ws.tenantId ?? undefined;
```

That is eval, pause, playbooks-run, setup-request, signup-notify, voice-provision, whatsapp/connect, templates-create, templates-delete, templates-sync. steer loads its message and whisper its call: after the row is loaded, `if (auth.workspace && row.tenant_id !== auth.workspace) return json(403, { ok: false, error: "workspace_mismatch" });` (whisper's call row is read through the provider id; if the door never reads a row with `tenant_id`, the check is on the dashboard side, which passes the call's workspace in the token, and the door keeps the key semantics). backfill, backfill-calls, voice-converge, signup-config and diag act on no single workspace: gate only.

- [x] **Step 2: The callers**

`service.ts`: delete `const EDGE_BASE = …`, import `{ edgeConfigured, edgeHeaders, edgeUrl } from "./edge"`, and each fetch becomes `fetch(\`${edgeUrl()}/api/admin/<name>\`, { method: "POST", headers: edgeHeaders("/api/admin/<name>", { workspace: tenantId }), … })` where the function has a `tenantId` (mirrorBlobPause, tellPlatformOfSetupRequest, connectWhatsApp, syncTemplates, createTemplate, deleteTemplate, runPlaybookNow) and `edgeHeaders("/api/admin/<name>")` where it does not (whisperLiveCall, steerDraft, whatsappSignupConfig). `signup.ts`: the same for signup-notify, and its `if (!process.env.DIAG_KEY || …)` becomes `if (!edgeConfigured() || …)`.

- [x] **Step 3: The pins move**

Each `'request.headers.get("x-diag-key") !== process.env.DIAG_KEY'` pin on a door becomes `'authorizeAdmin(request, "/api/admin/<name>")'`; each `` "`${EDGE_BASE}/api/admin/<name>`" `` pin on a caller becomes `` "`${edgeUrl()}/api/admin/<name>`" ``; whisper's `'"x-diag-key": process.env.DIAG_KEY!'` becomes `'edgeHeaders("/api/admin/whisper")'`.

- [x] **Step 4: Typecheck, full suite, lint, commit, PR, merge when green.** Commit: `Every edge door trusts the token, and every caller carries one`.

---

### Task 3: An owner's activation is a record, and capability status is computed from records (migration 00108; PR opened, merge on Ruben's yes)

PRD ON-02: readiness and owner activation are separate; test evidence is recorded; blockers are machine-readable. Today `setupSteps` and `connectionRows` compute readiness from records and `tryIt` names the numbers to test, but nothing records that the owner tested and activated a capability, and the readiness sentence ("answering") is the only claim. This task adds the record and the computation, and shows both on Setup and Connections. Activation gates nothing at runtime in this plan: the pilot workspace answers today and must keep answering; what activation gates (the recurring service, the sales copy) is a G2 decision, and the record is what makes that decision possible.

**Files:**
- Create: `supabase/migrations/00108_an_activation_is_a_record.sql`
- Create: `packages/contracts/src/capabilities.ts` (`capabilityStatus`, `CapabilityKind`, `CapabilityBlocker`), exported from the package index
- Create: `apps/dashboard/app/api/v1/capabilities/[kind]/route.ts` (`POST` activate / `DELETE` deactivate, on `write()`, owner)
- Modify: `packages/contracts/src/setup.ts` (`SetupDto.activations`, the voice and WhatsApp rows carry the activation state and an `Activate` verb), `apps/dashboard/src/server/setup.ts` (reads the record), `apps/dashboard/src/legacy-bridge/setup.ts` (`activate(kind)`), `apps/dashboard/src/legacy/pages/setup.jsx` (the `verb:activate:` branch of `act`)
- Test: `tooling/scripts/tests/capabilities.test.mjs` (executed: the status function over every record combination), `tooling/scripts/tests/activations.db.test.mjs` (local Supabase: RLS, one row per capability, the owner-only write)

- [x] **Step 1: The migration**

```sql
-- 00108 · An owner's activation of a capability is a record.
create table public.capability_activations (
  tenant_id     uuid not null references public.tenants (id) on delete cascade,
  capability    text not null check (capability in ('voice', 'whatsapp', 'sms')),
  activated_at  timestamptz not null default now(),
  activated_by  uuid references auth.users (id) on delete set null,
  deactivated_at timestamptz,
  note          text,
  primary key (tenant_id, capability)
);
alter table public.capability_activations enable row level security;
create policy capability_activations_member_select on public.capability_activations
  for select using (public.is_member(tenant_id));
-- Writes go through the route with the session client: owners only, checked by is_acting_owner.
create policy capability_activations_owner_write on public.capability_activations
  for all using (public.is_owner(tenant_id)) with check (public.is_owner(tenant_id));
alter publication supabase_realtime add table public.capability_activations;
```

(The helper names `is_member` / `is_owner` are read from the latest policy migrations at execution and used exactly; if the repo's helpers are named differently, use those.)

- [x] **Step 2: The status, pure**

```ts
export type CapabilityKind = "voice" | "whatsapp" | "sms";
export interface CapabilityBlocker { code: string; words: string }
export interface CapabilityStatus {
  kind: CapabilityKind;
  /** The records say it can work: line answering / channel active / registration approved and active. */
  ready: boolean;
  blockers: CapabilityBlocker[];
  /** The first real interaction after readiness: a call answered, a message replied to. Evidence, never a claim. */
  tested: { at: string; what: string } | null;
  activated: { at: string; by: string | null } | null;
  /** ready && tested && activated */
  live: boolean;
  words: string;
}
export function capabilityStatus(kind: CapabilityKind, i: SetupDto & { activations: ActivationRecord[] }, nowMs?: number): CapabilityStatus
```

Voice: ready when `channels.voice.active` (a line answering); blockers otherwise from the line row (`no_line`, `provisioning`, `line_failed:<step>`, `billing_required`); tested = `channels.voice.lastInboundAt` after the line's `state_since`; activated from the record. WhatsApp: ready when `channels.whatsapp.active` and Meta is not waiting; tested = `lastInboundAt`; SMS: ready only when `sms_state === "active"` and never mock (texting is last; the function says so honestly).

- [x] **Step 3: The route, the DTO, the rows, the bridge, the page**

`POST /api/v1/capabilities/[kind]` `write({ scope: workspace, role: "owner", rate: "settings", input: z.object({ note: z.string().max(200).optional() }), handle })` upserts the record for `(member.tenantId, kind)` with `activated_by: ctx.userId`, `deactivated_at: null`, and refuses (409, `not_ready`) when `capabilityStatus(kind).ready` is false; `DELETE` sets `deactivated_at`. `setupDtoFor` reads `capability_activations` into `SetupDto.activations`. In `setupSteps`, the `receptionist` row (voice) and the `whatsapp` row gain: when ready and tested and not activated, `verb: { label: "Activate", to: "verb:activate:voice" }` and the sentence `"Answering on <number>. You have tested it; activate it to say so."`; when activated, details gain `"Activated <ago> by you"`. The bridge's `SetupApi` gains `activate(kind)` posting to the route and refreshing Setup; `act(verb)` in `setup.jsx` gains `if (verb.to.startsWith("verb:activate:")) { …window.__setup.activate(kind)… }` mirroring the retry-line branch (owner check, flash). Render the page loaded (the legacy harness pattern in `registration-path.test.mjs`) before trusting it.

- [x] **Step 4: Prove on a local database, typecheck, full suite, lint, PR opened; do not merge.**

---

### Task 4: A line is provisioned on the ledger (migration 00109; PR opened, merge on Ruben's yes)

`admin/lines.ts` runs the whole saga inside the buy request (up to fourteen provider calls in a sixty-second function) and the retry the same way; a cut-off saga waits for the lines sweep, five minutes later. PRD W4 "durable provisioning": the saga runs as a job under the ledger's lease, resumed by the ten-second heartbeat, receipts per step (the saga already looks up an owned number before buying, so a dead worker never buys twice), and the page repaints from the row through realtime (`lines` is a watched table).

**Files:**
- Create: `supabase/migrations/00109_a_line_is_provisioned_on_the_ledger.sql` (`jobs_kind_check` gains `line_provision`)
- Modify: `packages/contracts/src/enums.ts` (`JOB_KINDS` gains `"line_provision"`), `packages/contracts/src/schema-sets.generated.ts` (regenerated)
- Modify: `packages/jobs/src/handlers.ts` (`JobContext.provisionLine?: (lineId: string, by: ResumedBy) => Promise<{ ok: boolean; step?: string; error?: string }>`, the `line_provision` handler), `apps/edge/api/jobs/tick.ts` (the port, built from `provisionLine` + the provider choice, exactly as `api/cron/lines.ts` builds it)
- Modify: `apps/edge/api/admin/lines.ts` (`buy` inserts the row and schedules the job, answers 202 with the row; `retry` claims and schedules), `apps/edge/api/cron/lines.ts` (the sweep schedules a job instead of running the saga inline)
- Modify: `apps/dashboard/app/api/v1/lines/buy/route.ts` (accepts 202: `{ ok: true, line, queued: true }`), `apps/dashboard/src/legacy-bridge/setup.ts` (buy's message: "Setting up — this page updates by itself")
- Test: `tooling/scripts/tests/jobs-ledger.test.mjs` (the handler with a fake port: success completes, a thrown provider fails the job with its words, a deadline passed schedules nothing new), `tooling/scripts/tests/line-provision.db.test.mjs` (00109 replays; a `line_provision` row is accepted and claimed by `claim_due_jobs`)

- [x] **Step 1: The migration and the kind**

```sql
alter table public.jobs drop constraint if exists jobs_kind_check;
alter table public.jobs add constraint jobs_kind_check
  check (kind in ('outbound_send', 'broadcast_send', 'blob_thread_erase', 'line_provision'));
```

- [x] **Step 2: The handler**

```ts
async function lineProvision(ctx: JobContext, job: ClaimedJob): Promise<void> {
  const lineId = typeof job.payload.line_id === "string" ? job.payload.line_id : "";
  const by = job.payload.by === "sweep" || job.payload.by === "support" ? job.payload.by : "owner";
  if (!lineId) throw new Error("line_provision: payload.line_id is required");
  if (!ctx.provisionLine) throw new Error("line_provision: this runtime has no line provider");
  const r = await ctx.provisionLine(lineId, by);
  if (!r.ok) throw new Error(`line_provision: stopped at ${r.step ?? "?"}: ${r.error ?? "unknown"}`);
}
```

The tick's port loads the row and the tenant, refuses a row that is not `provisioning` (a release or a retry by a person took it), and calls `provisionLine(db, choice, cfg, secrets, tenant, rowToLine(row), by)`; the saga's own failure path already writes `failed`, reports and bells.

- [x] **Step 3: The doors and the page**, then **Step 4: local database proof, typecheck, full suite, lint, PR opened; do not merge.**

---

### Task 5: The WhatsApp handler is executed by a test

`handleInbound` (730 lines) is pinned by fifty source reads and executed by none; it is the customer path. It reaches its world through module imports: the database (`pg()`), the thread store, the tenant runtime, the sink and the sender, the alerts, the pager, the model (a dynamic import of `../brain.js`). This task gives it a ports object with the real modules as the default, so the handler's control flow runs in a test against `fakeDb`, a memory store, a recording sender and a recording mailbox, with no environment.

**Files:**
- Create: `apps/edge/lib/whatsapp/ports.ts` (`InboundPorts`, `realPorts()`)
- Modify: `apps/edge/lib/whatsapp/inbound.ts` (an optional last parameter `ports = realPorts()`; every `pg()`, `getThread`, `saveThread`, `storeBackend`, `threadNamespace`, `loadTenantRuntime`, `pgThread`, `pgSink`, `queueReply`, `alertStaff`, `whatsappSender`, `tokensLast24h`, `openingsFor`, `visitsFor`, `readLeadContext`, `pageOperator`, `isThreadUnknown` and the brain import go through `ports`)
- Test: `tooling/scripts/tests/inbound-executed.test.mjs` (new): a text from a new customer with no model key → the greeting leaves labelled `fallback: "no_model"`, the thread is paused, an escalation `brain_error` is written, the owner is alerted, the platform paged once; the same customer's second text inside the pause → no reply, a handoff alert; a short code → recorded, marked handled, nothing sent; an ingest the database refuses → `IngestFailed` propagates and a copy reaches the mailbox; an opted-out customer → no reply, the opt-out alert.

- [x] **Step 1: The ports** (interface with one member per dependency above, typed from the modules' own signatures; `realPorts()` returns the modules)

- [x] **Step 2: The handler reads its world through `ports`** (mechanical: `saveThread(` → `ports.store.save(`, etc.; the count of each replacement is asserted by the patch script)

- [x] **Step 3: The test**, then **Step 4: the pins that moved with the renames move; typecheck, full suite, lint, commit, PR, merge when green.**

---

### After 2B

Ruben's yes on #344, #346, #348 and the two held PRs here; one `db push --linked` for 00106 to 00109. Ruben's switches from 2A (EDGE_CALL_SECRET on both projects, GOOGLE_OAUTH_STATE_SECRET, the external pinger). Then the Retell signature diagnosis (a fresh delivery, the raw body and the header, against `RETELL_API_KEY`), the key path removed from the doors once the secret is set, and texting: the A2P sagas, the OTP leg and the campaign recreate, last.

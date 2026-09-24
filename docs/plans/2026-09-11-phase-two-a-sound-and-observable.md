# Phase Two A: Sound and Observable Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the two G0 items phase one left open and make the platform observable and honest before the paid cohort: a message the database did not accept is never acknowledged, the state machines keep their edges, a missing model key is a visible degraded state, every clock is registered and watched from outside, the money and consent routes declare their policy, and the two runtimes trust a signed per-call token instead of one shared key.

**Architecture:** Seven independent PRs on `origin/main`, safest first. Each adds executed tests where a module can run, and changes production only through code the existing gates already cover. Migrations 00106 and 00107 are opened as PRs and merged on Ruben's yes. Texting (the A2P sagas, the OTP leg, the campaign) is deliberately absent: Ruben moved it to last.

**Tech Stack:** as phase one: pnpm 10 (`corepack pnpm`), Node 22, TypeScript, Next.js dashboard, Vercel functions (edge), Supabase Postgres with pg_cron, node:test + tsx, the fake database in `tooling/scripts/tests/_fake-db.mjs`.

**Rules:** the house rules of `docs/plans/2026-09-11-phase-one-safe-pilot.md` apply unchanged (worktree `../cm-phase1`, `&&` only, `set -o pipefail`, tests to a log file and never through a grep, rebuild dist after any package change, never add a `readCode`, migrations and sign-in code wait for Ruben's yes). Two lessons from phase one are now rules: pass node absolute Windows paths, never `/tmp`; and a regenerated `database.types.ts` from `--local` is never committed whole (splice the new blocks).

---

### Task 1: A message the database did not accept is not acknowledged

The WhatsApp webhook answers 200 whatever happened. When the ingest write fails the customer's words exist only in an email, and Meta, which retries any non-200 with decreasing frequency for up to seven days, is told all is well. The ingest's `is_new` gate makes a redelivery of the already-recorded messages in the same batch a no-op, so a 503 is safe. Twilio retries nothing, so the SMS ingress alerts the platform on the same signal and answers 503 so Twilio's own log shows it.

**Files:**
- Modify: `apps/edge/lib/whatsapp/persist.ts:93-118` (`pgIngest` takes the client, throws `IngestFailed`)
- Modify: `apps/edge/lib/whatsapp/inbound.ts` (the helper `recordOrSay`, four call sites)
- Modify: `apps/edge/api/whatsapp.ts:89,156-158,232` (count, per-message catch, final reply)
- Modify: `apps/edge/api/inbound-sms.ts:77-82` (the catch)
- Test: `tooling/scripts/tests/ingest-failed.test.mjs` (new, executed)

- [x] **Step 1: The failing test**

```js
/**
 * Persist first, or say so. pgIngest returned null for two different facts:
 * "there is no database or no tenant to record for" (by design) and "the
 * write failed" (a loss). The second is now its own error, so the webhook can
 * refuse to acknowledge what it could not record.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fakeDb } from "./_fake-db.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const { pgIngest, IngestFailed } = await import(pathToFileURL(path.join(ROOT, "apps/edge/lib/whatsapp/persist.ts")).href);

const n = { waId: "13475550101", phoneDigits: "13475550101", profileName: "Dana", messageId: "wamid.1", type: "text", kind: "text", rawType: "text", body: "hi", channelTsIso: null, media: null, optOut: false, optIn: false, optInMarketing: false };
const row = { message_id: "m1", conversation_id: "c1", contact_id: "k1", is_new: true, consent: "unknown", dnc: false, paused_until: null };

test("no database or no tenant is null, by design", async () => {
  assert.equal(await pgIngest(null, "t1", n), null);
  assert.equal(await pgIngest(fakeDb({}, {}, { ingest_inbound: () => row }), null, n), null);
});

test("a write the database refused is IngestFailed, never a quiet null", async () => {
  const db = fakeDb({}, {}, { ingest_inbound: () => { throw new Error("connection reset"); } });
  await assert.rejects(() => pgIngest(db, "t1", n), (e) => e instanceof IngestFailed && /connection reset/.test(e.message));
});

test("a write that succeeded returns the row", async () => {
  const db = fakeDb({}, {}, { ingest_inbound: () => row });
  const out = await pgIngest(db, "t1", n);
  assert.equal(out.conversation_id, "c1");
  assert.equal(out.is_new, true);
});
```

Run: `node --conditions=react-server --import tsx --test tooling/scripts/tests/ingest-failed.test.mjs` → expected: the second test fails (`pgIngest` resolves null) and the first fails on the signature (the first argument is the tenant today).

- [x] **Step 2: `pgIngest` takes the client and names the loss**

Replace the function in `apps/edge/lib/whatsapp/persist.ts`:

```ts
/** The ingest write itself failed. The message is NOT recorded, and the provider must be told so it retries. */
export class IngestFailed extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IngestFailed";
  }
}

/**
 * Persist first. Null when there is no database or no tenant to record for,
 * which is a fact about the deployment and by design. A write that FAILED is
 * IngestFailed: the caller says so to the provider, which retries, rather
 * than acknowledging words that exist only in an email.
 */
export async function pgIngest(db: SupabaseClient<Database> | null, tenantId: string | null, n: NormalizedInbound, channel: "whatsapp" | "sms" = "whatsapp"): Promise<IngestResult | null> {
  if (!db || !tenantId) return null;
  try {
    return await ingestInbound(db, {
      tenantId,
      channel,
      identityExternalId: n.waId,
      phoneE164: n.phoneDigits ? `+${n.phoneDigits.replace(/^\+/, "")}` : null,
      waProfileName: n.profileName,
      messageExternalId: n.messageId,
      type: n.type,
      body: n.body,
      channelTs: n.channelTsIso,
      media: n.media ? (n.media as unknown as Json) : null,
      meta: { raw_type: n.rawType } as Json,
      optOut: n.optOut,
      optIn: n.optIn,
      optInMarketing: n.optInMarketing,
    });
  } catch (e) {
    console.error(JSON.stringify({ level: "error", event: "ingest_pg_failed", tenant_id: tenantId, message: n.messageId, error: errField(e) }));
    throw new IngestFailed(e instanceof Error ? e.message : String(e));
  }
}
```

(`pg` stays imported; `pgThread` and the sink still use it.) The file header's promise, "never throws into the handling path", gains its one exception: `pgIngest` throws `IngestFailed` when the write itself failed, because that is the one loss the provider can undo.

Three source pins move with the call sites (none are added): `phone.test.mjs` looks for `await recordOrSay()` in the short-code guard; `settings-truth.test.mjs` counts fourteen handoff emails carrying `pauseHours`; `sms.test.mjs` counts `pgIngest\(db, tenantId, n, channel\)`.

- [x] **Step 3: The handler records or says so**

In `apps/edge/lib/whatsapp/inbound.ts`, add `IngestFailed` to the persist import, and insert after the line `const pauseHours = Math.round(pauseMs / 3600000);`:

```ts
  // Persist first, or say so. An ingest write that fails is the one loss the
  // provider can undo: the customer's words go to the workspace mailbox as a
  // copy, and IngestFailed travels up to the webhook, which answers 503 so
  // Meta redelivers (the ingest's is_new gate makes that idempotent). Twilio
  // retries nothing, so the SMS ingress alerts the platform on the same signal.
  const recordOrSay = async (): Promise<IngestResult | null> => {
    try {
      return await pgIngest(db, tenantId, n, channel);
    } catch (e) {
      if (e instanceof IngestFailed) {
        // The copy is best effort: a mailbox that cannot be reached must not mask the loss.
        try {
          await alertStaff(from, n.body ?? `[${m.type} message]`, "(NOT recorded: the database did not accept the message; the provider will retry)", "message not recorded", notifyTarget, pauseHours, "inbox", n.profileName ?? null, null);
        } catch (alertErr) {
          L.error("wa_unrecorded_alert_failed", { error: errField(alertErr) });
        }
      }
      throw e;
    }
  };
```

Then the four call sites: `const ing = await pgIngest(tenantId, n, channel);` (twice) becomes `const ing = await recordOrSay();`; `ing = await pgIngest(tenantId, n, channel);` becomes `ing = await recordOrSay();`; and `Promise.all([pgIngest(tenantId, n, channel), getThread(ns, from)])` becomes `Promise.all([recordOrSay(), getThread(ns, from)])`.

- [x] **Step 4: The webhook counts what it could not record**

In `apps/edge/api/whatsapp.ts`: import `IngestFailed` beside `pgSafe`; after `try { body = JSON.parse(raw) as WebhookBody; } catch { /* ack anyway */ }` add `let unrecorded = 0;`; in the per-message catch add `if (e instanceof IngestFailed) unrecorded += 1;` before the `console.error`; and replace the final `return json(200, { ok: true });` with:

```ts
  // A message the database did not accept is not acknowledged: Meta retries
  // any non-200 with decreasing frequency for up to seven days, and the
  // ingest's is_new gate makes the redelivery of the others a no-op.
  if (unrecorded > 0) return json(503, { ok: false, unrecorded });
  return json(200, { ok: true });
```

In `apps/edge/api/inbound-sms.ts`, import `IngestFailed` from `../lib/whatsapp/persist.js` and make the catch:

```ts
  } catch (e) {
    L.error("sms_inbound_failed", { error: e instanceof Error ? e.message : String(e) });
    if (e instanceof IngestFailed) {
      // Twilio retries nothing: the platform is told now, and the 503 leaves a trace in Twilio's own log.
      await alertUnroutable("sms", inbound.to, 1, "the text could not be recorded");
      return twiml(503);
    }
  }
```

- [x] **Step 5: Run the new test, typecheck, full suite; commit; PR; merge when green**

```bash
node --conditions=react-server --import tsx --test tooling/scripts/tests/ingest-failed.test.mjs > /c/Users/Ruben/AppData/Local/Temp/phase2/t1.log 2>&1 && grep -E "^# (pass|fail)" /c/Users/Ruben/AppData/Local/Temp/phase2/t1.log
COREPACK_ENABLE_DOWNLOAD_PROMPT=0 corepack pnpm -r typecheck
COREPACK_ENABLE_DOWNLOAD_PROMPT=0 corepack pnpm test > /c/Users/Ruben/AppData/Local/Temp/phase2/t1-suite.log 2>&1 && grep -E "^# (tests|pass|fail)" /c/Users/Ruben/AppData/Local/Temp/phase2/t1-suite.log
```

Commit: `A message the database did not accept is not acknowledged: the webhook answers 503 so Meta retries, and the text ingress says so`. No migration, no auth: merge when green.

---

### Task 2: The state machines keep their edges (migration 00106; PR opened, merge on Ruben's yes)

`jobs` and `messages` are guarded by triggers; `broadcasts`, `escalations` and a line's `voice_state` have CHECKs but no transition rule, and most of their writers key on the id alone, so a late callback can flip a sent broadcast back to scheduled or re-provision an answering line. The edges below are read from every writer in the repo.

**Files:**
- Create: `supabase/migrations/00106_a_state_machine_keeps_its_edges.sql`
- Test: `tooling/scripts/tests/state-guards.db.test.mjs` (new; local Supabase)

- [x] **Step 1: The migration**

```sql
-- 00106 · A state machine keeps its edges: broadcasts, escalations and a line's voice.
--
-- jobs (00098) and messages (00015) are guarded by a trigger; these three
-- have a CHECK on the value and nothing on the move, and most of their
-- writers key on the id alone. A late callback could flip a sent broadcast
-- back to scheduled and send it twice, resolve an escalation nobody opened,
-- or re-provision an answering line. The edges here are the ones every writer
-- in the repo actually takes; a same-state update is always allowed.

create or replace function public.broadcasts_guard() returns trigger
language plpgsql as $$
begin
  if new.state = old.state then return new; end if;
  if (old.state, new.state) in (
       ('pending_approval', 'scheduled'), ('pending_approval', 'canceled'),
       ('scheduled', 'sending'), ('scheduled', 'canceled'), ('scheduled', 'failed'), ('scheduled', 'pending_approval'),
       ('sending', 'sent'), ('sending', 'failed'), ('sending', 'canceled')
     ) then return new; end if;
  raise exception 'a broadcast does not go from % to %', old.state, new.state using errcode = 'check_violation';
end $$;
comment on function public.broadcasts_guard() is
  'pending_approval → scheduled|canceled; scheduled → sending|canceled|failed|pending_approval (the approve route rolls back a schedule that could not be queued); sending → sent|failed|canceled; sent, canceled and failed are final.';
drop trigger if exists broadcasts_guard on public.broadcasts;
create trigger broadcasts_guard before update of state on public.broadcasts
  for each row execute function public.broadcasts_guard();

create or replace function public.escalations_guard() returns trigger
language plpgsql as $$
begin
  if new.state = old.state then return new; end if;
  if old.state = 'open' and new.state = 'resolved' then return new; end if;
  raise exception 'an escalation does not go from % to %', old.state, new.state using errcode = 'check_violation';
end $$;
comment on function public.escalations_guard() is 'open → resolved, once. A new concern is a new row (escalations_one_open allows one open per conversation).';
drop trigger if exists escalations_guard on public.escalations;
create trigger escalations_guard before update of state on public.escalations
  for each row execute function public.escalations_guard();

create or replace function public.lines_voice_guard() returns trigger
language plpgsql as $$
begin
  if new.voice_state = old.voice_state then return new; end if;
  if new.voice_state = 'none' then
    raise exception 'a line does not go back to voice_state none; it is released instead' using errcode = 'check_violation';
  end if;
  if old.voice_state = 'answering' and new.voice_state = 'provisioning' then
    raise exception 'an answering line is not re-provisioned by a late retry' using errcode = 'check_violation';
  end if;
  return new;
end $$;
comment on function public.lines_voice_guard() is
  'Forward moves only: none → provisioning → answering|failed, failed → provisioning, answering → failed. Never back to none; never answering → provisioning. sms_state waits for the texting phase.';
drop trigger if exists lines_voice_guard on public.lines;
create trigger lines_voice_guard before update of voice_state on public.lines
  for each row execute function public.lines_voice_guard();
```

- [x] **Step 2: The database test**

```js
/**
 * The edges a state machine keeps, proved on a real Postgres: a sent
 * broadcast cannot be scheduled again, an escalation resolves once, an
 * answering line is not re-provisioned by a late retry. Same-state updates
 * and every move a writer actually makes still pass.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";

const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const skip = !URL_ || !KEY ? "no database in env"
  : !/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(URL_) ? "refusing a database that is not on this machine" : false;

let db, tenantId, templateId, conversationId;
before(async () => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
  const t = await db.from("tenants").insert({ slug: `guards-${Date.now()}`, name: "Guards" }).select("id").single();
  assert.equal(t.error, null, t.error?.message);
  tenantId = t.data.id;
  const tpl = await db.from("templates").insert({ tenant_id: tenantId, channel: "whatsapp", name: "visit_reminder", language: "en_US", meta_status: "approved" }).select("id").single();
  assert.equal(tpl.error, null, tpl.error?.message);
  templateId = tpl.data.id;
  const c = await db.from("contacts").insert({ tenant_id: tenantId, phone_e164: "+15550000001" }).select("id").single();
  assert.equal(c.error, null, c.error?.message);
  const v = await db.from("conversations").insert({ tenant_id: tenantId, contact_id: c.data.id }).select("id").single();
  assert.equal(v.error, null, v.error?.message);
  conversationId = v.data.id;
});
after(async () => { if (!skip && tenantId) await db.from("tenants").delete().eq("id", tenantId); });

async function broadcast(state) {
  const { data, error } = await db.from("broadcasts")
    .insert({ tenant_id: tenantId, name: "run", template_id: templateId, template_name: "visit_reminder", template_language: "en_US", state, scheduled_for: new Date().toISOString() })
    .select("id").single();
  assert.equal(error, null, error?.message);
  return data.id;
}
const move = (table, id, patch) => db.from(table).update(patch).eq("id", id).select("id");

test("a broadcast takes every edge its writers take, and no other", { skip }, async () => {
  for (const [from, to] of [["pending_approval", "scheduled"], ["scheduled", "sending"], ["sending", "sent"], ["scheduled", "canceled"], ["scheduled", "pending_approval"], ["sending", "canceled"], ["scheduled", "failed"], ["sending", "failed"]]) {
    const id = await broadcast(from);
    const r = await move("broadcasts", id, { state: to });
    assert.equal(r.error, null, `${from} → ${to}: ${r.error?.message}`);
  }
  for (const [from, to] of [["sent", "scheduled"], ["sent", "sending"], ["canceled", "scheduled"], ["failed", "sending"], ["pending_approval", "sending"], ["scheduled", "sent"]]) {
    const id = await broadcast(from);
    const r = await move("broadcasts", id, { state: to });
    assert.match(r.error?.message ?? "", /does not go from/, `${from} → ${to} must be refused`);
  }
  const same = await broadcast("sent");
  assert.equal((await move("broadcasts", same, { state: "sent", name: "renamed" })).error, null, "a same-state update passes");
});

test("an escalation resolves once", { skip }, async () => {
  const { data, error } = await db.from("escalations").insert({ tenant_id: tenantId, conversation_id: conversationId, reason: "manual", details: "test" }).select("id").single();
  assert.equal(error, null, error?.message);
  assert.equal((await move("escalations", data.id, { state: "resolved" })).error, null);
  assert.match((await move("escalations", data.id, { state: "open" })).error?.message ?? "", /does not go from/);
});

test("a line moves forward on its voice, and an answering line is not re-provisioned", { skip }, async () => {
  const { data, error } = await db.from("lines").insert({ tenant_id: tenantId, e164: "+15550000099", kind: "chanlytics", provider: "dry", voice_state: "provisioning" }).select("id").single();
  assert.equal(error, null, error?.message);
  const id = data.id;
  assert.equal((await move("lines", id, { voice_state: "failed" })).error, null);
  assert.equal((await move("lines", id, { voice_state: "provisioning" })).error, null, "a failed line may be retried");
  assert.equal((await move("lines", id, { voice_state: "answering" })).error, null);
  assert.match((await move("lines", id, { voice_state: "provisioning" })).error?.message ?? "", /not re-provisioned/);
  assert.match((await move("lines", id, { voice_state: "none" })).error?.message ?? "", /released instead/);
  assert.equal((await move("lines", id, { voice_state: "failed" })).error, null, "an answering line may still fail");
});
```

If the `lines` insert refuses a column (its NOT NULL set is read from `00066_lines.sql` at execution time), add the columns it names with the values the `admin/lines.ts` insert uses.

- [x] **Step 3: Prove on a local database; open the PR; do not merge**

```bash
node "$SUPABASE_CLI" start -x studio,imgproxy,inbucket,edge-runtime,logflare,vector
node "$SUPABASE_CLI" status -o env > "$STATUS" 2>&1; export SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_SERVICE_ROLE_KEY=$(sed -n 's/^SERVICE_ROLE_KEY="\(.*\)"$/\1/p' "$STATUS")
COREPACK_ENABLE_DOWNLOAD_PROMPT=0 corepack pnpm test:db > "$LOG/db.log" 2>&1; grep -E "^# (tests|pass|fail|skipped)" "$LOG/db.log"
node "$SUPABASE_CLI" stop --no-backup
```

Expected: every db test passes, the three new ones included. PR body: "Adds migration 00106. Merge on Ruben's yes; push after deploy."

---

### Task 3: A missing model key is a visible degraded state

Today no `ANTHROPIC_API_KEY` means every message gets the workspace's generic greeting, no escalation, no alert. PRD AI-04: the generic acknowledgement may go only as a labelled fallback that counts as nothing, the thread goes to a person, and the platform is paged.

**Files:**
- Modify: `apps/edge/lib/whatsapp/steps.ts` (the decision, pure: `noModelPlan`, `NO_MODEL_PAGE`)
- Modify: `apps/edge/lib/whatsapp/alerts.ts` (the owner's words for the reason `no model`)
- Modify: `apps/edge/lib/whatsapp/inbound.ts` (the `else` of the model branch, the send's meta, the escalation's details and the alert's reason)
- Test: `tooling/scripts/tests/no-model.test.mjs` (new, executed)

- [x] **Step 1: The failing test**

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { ESCALATION_REASONS } from "@chanlytics/contracts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const { noModelPlan, NO_MODEL_PAGE } = await import(pathToFileURL(path.join(ROOT, "apps/edge/lib/whatsapp/steps.ts")).href);

test("no model: the workspace's own greeting goes as a labelled fallback, and the thread goes to a person", () => {
  const plan = noModelPlan({ greeting: "Thanks for writing to Marisa's. A person will be with you shortly." });
  assert.equal(plan.replyText, "Thanks for writing to Marisa's. A person will be with you shortly.");
  assert.deepEqual(plan.meta, { ack: true, fallback: "no_model" });
  assert.equal(plan.escalate, true);
  assert.ok(ESCALATION_REASONS.includes(plan.escalationReason));
  assert.match(plan.escalationDetails("is my order ready?"), /no model key/);
  assert.equal(plan.alertReason, "no model");
});

test("the platform is paged under one stable key, and the page carries no secret", () => {
  assert.equal(NO_MODEL_PAGE.key, "brain_unavailable");
  assert.match(NO_MODEL_PAGE.body, /ANTHROPIC_API_KEY is not set/);
  assert.ok(!/sk-ant-/.test(NO_MODEL_PAGE.body));
});
```

Run: `node --conditions=react-server --import tsx --test tooling/scripts/tests/no-model.test.mjs` → expected: fails, `noModelPlan` is not exported.

- [x] **Step 2: The decision, pure (append to `steps.ts`)**

```ts
export const NO_MODEL_PAGE = {
  key: "brain_unavailable",
  subject: "The receptionist has no model key",
  body: "ANTHROPIC_API_KEY is not set on the edge. Every reply is the workspace's generic greeting, labelled a fallback, and every thread is handed to a person until the key is back.",
} as const;

export function noModelPlan(fallbacks: { greeting: string }): {
  replyText: string;
  meta: { ack: true; fallback: "no_model" };
  escalate: true;
  escalationReason: "brain_error";
  escalationDetails: (customerText: string) => string;
  alertReason: "no model";
} {
  return {
    replyText: fallbacks.greeting,
    meta: { ack: true, fallback: "no_model" },
    escalate: true,
    escalationReason: "brain_error",
    escalationDetails: (customerText) => `the receptionist has no model key — "${customerText}"`,
    alertReason: "no model",
  };
}
```

`brain_error` is the closed set's word for "the receptionist could not answer and a holding message went out"; the owner's inbox already knows it. In `alerts.ts`, `REASON_WORDS` gains `"no model": "the receptionist has no model to answer with"`.

- [x] **Step 3: The handler applies it**

In `inbound.ts`: import `pageOperator` from `../page-operator.js` and `noModelPlan, NO_MODEL_PAGE` from `./steps.js`; beside `let brainMeta: BrainMeta | undefined;` add `let fallback: ReturnType<typeof noModelPlan> | undefined;`. The model branch's `else` becomes:

```ts
  } else {
    fallback = noModelPlan(brainCfg.fallbacks);
    replyText = fallback.replyText;
    escalate = fallback.escalate;
    escalationReason = fallback.escalationReason;
    L.error("wa_no_model");
    if (db) await pageOperator({ db }, NO_MODEL_PAGE.key, NO_MODEL_PAGE.subject, NO_MODEL_PAGE.body);
  }
```

The send carries the label: `send(replyText, fallback ? (fallback.meta as Record<string, Json>) : (brainMeta as unknown as Record<string, Json> | undefined))`. In the post-send handoff, the escalation's details are `fallback ? fallback.escalationDetails(bodyText) : …` and the alert's reason is `fallback ? fallback.alertReason : "assistant flagged handoff"`. The escalation pauses the thread for the workspace's pause window, so one greeting goes per thread and a person has it from then on; no usage row is written, so the fallback counts as nothing.

- [x] **Step 4: Run the test, typecheck, full suite; commit; PR; merge when green**

Commit: `A missing model key is a degraded state a person can see, not a canned receptionist`. No migration, no auth: merge when green.

---

### Task 4: Every clock is registered, and an outside monitor can knock (migration 00107; PR opened, merge on Ruben's yes)

`sweep_health()` judged eleven clocks from a VALUES list inside the function; six pg_cron jobs (the monthly partition precreate and five nightly purges) were outside it, and the only watcher ran inside the edge it watches. The register becomes data on `sweep_status`, the health function reads it, the jobs that never leave the database are judged on `cron.job_run_details`, and a keyless `/api/health` answers 200 or 503 for a pinger outside our failure domain.

**Files:**
- Create: `supabase/migrations/00107_every_clock_is_registered.sql`
- Create: `apps/edge/api/health.ts`
- Modify: `apps/edge/lib/sweep-health.ts` (the words for the eight newly judged clocks)
- Modify: `tooling/scripts/tests/sweep-health.integration.test.mjs` (pins move: seventeen names, the registration trigger instead of the CHECK)
- Modify: `packages/db/src/database.types.ts` (the `sweep_status` block, spliced from a local generation), `packages/contracts/src/schema-sets.generated.ts` (regenerated: `sweep_status.sweep` goes, `sweep_status.judged_by` arrives)
- Test: `tooling/scripts/tests/sweep-registry.db.test.mjs` (new; local Supabase), `tooling/scripts/tests/health-route.test.mjs` (new, executed with a fake database)

- [x] **Step 1: The migration**

`sweep_status` gains `jobname text`, `max_silence interval`, `judged_by text not null default 'request' check (judged_by in ('request', 'run'))` and `registered_at timestamptz not null default now()`; the CHECK on the name is dropped. One upsert registers all seventeen clocks: the nine HTTP sweeps 00098 knew with the silences it gave them (`request`), the two ten-second row clocks now judged on their runs (`run`, 3 minutes), the monthly precreate (`run`, 35 days) and the five nightly purges (`run`, 26 hours).

A `BEFORE INSERT` trigger, `sweep_status_registered`, refuses a row that carries no `jobname` when no row of that name exists; the upserts `request_sweep()`, `trigger_jobs_tick()` and `sweep_mark_alerted()` make carry no `jobname` but land on rows that exist, and pass. This replaces what the CHECK guaranteed.

`sweep_health()` keeps its return shape and reads the table: rows with no `jobname` are reported as unregistered; `run` rows are judged on their last run (a failed last run is reported with its message; never succeeded is healthy until `max_silence` has passed since `registered_at`, then reported; a last success older than `max_silence` is reported with its time and schedule); `request` rows are judged exactly as 00098 judged them. `last_request_at` is the last successful run for a `run` row.

- [x] **Step 2: The database test (`sweep-registry.db.test.mjs`)**

Against the local database: the register maps every name to its cron job and every job is scheduled and active; `sweep_health()` returns the seventeen names, every row scheduled, every run-judged row healthy on a fresh database (registered moments ago, or running every ten seconds); a bare name is refused with "not registered" while a name with a job nobody scheduled is reported unhealthy and unscheduled; `request_sweep('deadman', …)` still lands on its row; `sweep_mark_alerted` stamps and clears a run-judged row.

- [x] **Step 3: The public door (`apps/edge/api/health.ts`)**

`judgeHealth(db)` calls `sweep_health` and `jobs_backlog`: 200 with `{ ok: true, unhealthy: [], jobs_backlog: 0, checked_at }` only when every clock is healthy and nothing due is waiting; otherwise 503 with the unhealthy names (never the detail, which stays inside) and the backlog (null when unreadable, which is not zero); a health function that cannot be read is 503 with `reason: "health_unreadable"` and none of the database's words. `GET` wraps it with a ten-second per-instance cache and `cache-control: no-store`. `health-route.test.mjs` proves the five cases with a fake database.

- [x] **Step 4: Prove on a local database, regenerate the value sets, splice the types, open the PR; do not merge**

```bash
node "$S" db reset            # 00107 replays from zero
COREPACK_ENABLE_DOWNLOAD_PROMPT=0 corepack pnpm test:db > "$LOG/db.log" 2>&1
SUPABASE_CLI="$S" node tooling/scripts/gen-schema-sets.mjs
node "$S" gen types typescript --local > "$LOG/types.ts"   # then splice only the sweep_status block
```

PR body: "Adds migration 00107. Merge on Ruben's yes; push after deploy." **Ruben's half:** point an external pinger (UptimeRobot, Better Stack, or a Cloudflare health check) at `https://chanlytics-messaging.vercel.app/api/health` every minute, alerting on non-200. Until then the door exists and nobody knocks.

---

### Task 5: The money, team and consent routes declare their policy

Eight handlers in seven files move from hand-performed policy onto `route()`: scope, role, rate, spend and input declared on the export, enforced by one wrapper, banked in `route-policy.json`. The two team writes that took no rate token get a bucket, said out loud.

**Files:**
- Modify: `apps/dashboard/src/server/rate-limit.ts` (a `team` bucket)
- Modify: `apps/dashboard/src/server/verbs.ts` (`loadContact`, `contactScope`)
- Rewrite: `apps/dashboard/app/api/v1/lines/buy/route.ts`, `lines/register/route.ts`, `billing/checkout/route.ts`, `billing/portal/route.ts`, `team/invite/route.ts`, `team/[id]/route.ts`, `contacts/[id]/consent/route.ts`, `contacts/[id]/marketing-consent/route.ts`
- Modify: `tooling/scripts/tests/route-policy.json` (banked with `UPDATE_ROUTE_POLICY=1`)

- [x] **Step 1: The bucket and the contact scope**

In `RATE` (`rate-limit.ts`), after `invite`: `team: { limit: 30, windowMs: 3_600_000, noun: "team changes" },`.

In `verbs.ts`:

```ts
export interface VerbContact { id: string; tenant_id: string; marketing_consent: string | null; }

/** The contact a consent verb acts on: read under RLS, so a person the caller cannot see is a 404; an erased one is gone. */
export async function loadContact(ctx: RouteContext, id: string): Promise<VerbContact> {
  const contactId = requireUuid(id, "contact");
  const { data, error } = await ctx.supabase.from("contacts").select("id, tenant_id, erased_at, marketing_consent").eq("id", contactId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data || data.erased_at) throw new AppError("not_found", "Contact not found.", 404);
  return { id: data.id, tenant_id: data.tenant_id, marketing_consent: data.marketing_consent ?? null };
}
export const contactScope = row((ctx, params) => loadContact(ctx, String(params.id ?? "")));
```

- [x] **Step 2: The eight handlers**

`lines/buy/route.ts`:

```ts
import { z } from "zod";
import { AppError } from "@chanlytics/contracts";
import { write, workspace } from "@/server/route";
import { edgeLines } from "@/server/lines";

const Body = z.object({
  number: z.string().trim().regex(/^\+[1-9]\d{6,14}$/, "Choose one of the numbers offered."),
  area_code: z.union([z.number().int(), z.string().trim().regex(/^\d{3}$/)]).optional(),
}).strict();

/** Buy a number for this workspace. Owner only; a card or a direct arrangement first; three an hour. */
export const POST = write({
  scope: workspace,
  role: "owner",
  rate: "lines_buy",
  spend: true,
  input: Body,
  handle: async ({ member, input }) => {
    const areaCode = typeof input.area_code === "number" ? input.area_code : input.area_code ? Number(input.area_code) : undefined;
    const a = await edgeLines({ op: "buy", tenant_id: member.tenantId, number: input.number, ...(areaCode ? { area_code: areaCode } : {}) }, 60_000);
    const b = a.body ?? {};
    if (a.status === 409) throw new AppError("conflict", b.error === "line_failed_retry" ? "This workspace has a line that stopped part-way — retry it from Setup." : "This workspace already has a line.", 409);
    if (a.status === 503 && b.error === "no_line_provider") throw new AppError("conflict", "Getting a line is not available here yet — ask us and a person at Chanlytics sets it up with you.", 409);
    if (a.status === 400) throw new AppError("validation", typeof b.error === "string" ? b.error : "That number cannot be used.", 400);
    if (a.status !== 200 && a.status !== 502) throw new AppError("internal", typeof b.error === "string" ? b.error : "The carrier did not answer. Try again in a moment.", 502);
    return { ok: b.ok === true, line: b.line ?? null, step: typeof b.step === "string" ? b.step : null, error: typeof b.error === "string" ? b.error : null };
  },
});
```

`lines/register/route.ts`: the same shape with `rate: "lines_register"`, `spend: true`, `input: z.object({ line_id: z.string().trim().min(1, "Which line?") }).strict()`, and the existing body of the handler from `const a = await edgeLines({ op: "register", tenant_id: member.tenantId, line_id: input.line_id }, 60_000);` onward, unchanged.

`billing/checkout/route.ts` and `billing/portal/route.ts`: `write({ scope: workspace, role: "owner", rate: "billing", handle: async ({ ctx, member }) => { … } })` with the existing bodies, `member.tenantId` and `ctx.email` as before, no `input`.

`team/invite/route.ts`:

```ts
import { z } from "zod";
import { write, workspace } from "@/server/route";
import { inviteMember } from "@/server/service";

const Body = z.object({
  email: z.string().trim().toLowerCase().regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, "That doesn't look like an email address."),
  role: z.enum(["operator", "viewer"], { message: "Invites can grant operator or viewer." }),
}).strict();

export const POST = write({
  scope: workspace, role: "owner", rate: "invite", input: Body,
  handle: async ({ ctx, member, input }) => inviteMember(ctx.supabase, member.tenantId, ctx.userId, input.email, input.role),
});
```

`team/[id]/route.ts`: PATCH `write({ scope: workspace, role: "owner", rate: "team", input: z.object({ role: z.enum(ROLES, { message: "Unknown role." }) }).strict(), handle: ({ ctx, member, input }) => setMemberRole(ctx, member.tenantId, requireUuid(ctx.params.id, "member"), input.role) })` and DELETE `write({ scope: workspace, role: "owner", rate: "team", handle: ({ ctx, member }) => removeMember(ctx, member.tenantId, requireUuid(ctx.params.id, "member"), ctx.userId) })`.

`contacts/[id]/consent/route.ts` and `marketing-consent/route.ts`: `write({ scope: contactScope, role: "operator", rate: "consent", input: z.object({ consent: z.enum(CONSENT_STATES, { message: "Consent must be one of: opted_in, opted_out, unknown." }), source: z.string().optional(), note: z.string().trim().max(200).optional() }).strict(), handle: async ({ ctx, row: contact, input }) => { … } })` with the existing source rule (`CONSENT_RESET_SOURCE` when unknown; `CONSENT_SOURCES` otherwise; `offersYesRefusal` for marketing), the RPC call and `recordDecision` unchanged, `contact.tenant_id` and `contact.id` from the row.

- [x] **Step 3: Bank the policy, typecheck, full suite, commit, PR, merge when green**

```bash
UPDATE_ROUTE_POLICY=1 node --conditions=react-server --import tsx --test tooling/scripts/tests/route-policy.test.mjs
git diff --stat tooling/scripts/tests/route-policy.json   # eight leave undeclared; eight appear under routes
```

Commit: `The money, team and consent routes declare their policy: scope, role, rate and spend on the export, one wrapper enforcing them`.

---

### Task 6: The two runtimes trust a signed per-call token, not one shared key

Twenty edge doors compared `x-diag-key` with `!==`; the same key signed Google OAuth state; the edge's address was a literal in five dashboard files. This task adds the token (signed with its own secret, bound to one door, one workspace, one person and one minute), a constant-time key fallback while the secret is rolled out, `EDGE_URL`, and a separate OAuth state secret. Four doors and their four callers move in this PR: lines, billing, google, llm. The other sixteen follow in 2B, mechanically.

**Files:**
- Create: `packages/channels/src/edge-token.ts` (`signEdgeToken`, `verifyEdgeToken`, `EDGE_TOKEN_TTL_MS`; exported from the package index)
- Create: `apps/edge/lib/admin-auth.ts` (`authorizeAdmin(request, aud)`, `workspaceFor(auth, bodyTenant)`)
- Create: `apps/dashboard/src/server/edge.ts` (`edgeUrl()`, `edgeConfigured()`, `edgeHeaders(aud, { workspace, user })`)
- Modify: `apps/edge/api/admin/{lines,billing,google,llm}.ts`; `apps/dashboard/src/server/{lines,billing,google,ask/gateway}.ts`; both `.env.example` files
- Test: `tooling/scripts/tests/edge-token.test.mjs` (new, executed; the pins on the migrated doors and clients move)

- [x] **Step 1: The token, pure**

A token is `base64url(JSON claims).base64url(HMAC-SHA256(secret, payload))`; the claims are `{ aud, ws, user, iat, exp, nonce }` with `exp = iat + 60 s`. `verifyEdgeToken(secret, token, aud, nowMs)` checks the signature first, in constant time, and only then parses: `malformed`, `signature`, `audience`, `expired` (past `exp`, or an `iat` more than one TTL in the future) are each their own refusal.

- [x] **Step 2: The edge's door**

`authorizeAdmin(request, aud)`: when the edge holds `EDGE_CALL_SECRET` and a token is presented, the token must verify (no falling back from a bad token to the key); when the edge holds no secret, a token is ignored and the key decides, so the dashboard may be given the secret before or after the edge; with no token, the key decides, compared in constant time. `workspaceFor(auth, body.tenant_id)`: the token's workspace is believed over the body, and a body naming another workspace is refused with `workspace_mismatch`; a key-authorised caller's body still names it. The four doors call both (llm's before it reads `tenant_id`; google's only where it reads an `op`).

- [x] **Step 3: The dashboard's side**

`edgeUrl()` is `EDGE_URL` with the old literal as its default; `edgeHeaders(aud, ctx)` carries `x-edge-token` when `EDGE_CALL_SECRET` is set and `x-diag-key` while `DIAG_KEY` is; `edgeConfigured()` is either. `edgeLines`, `edgeBilling`, `edgeGoogle` pass the body's `tenant_id` as the token's workspace; `streamModel` passes the call's workspace and user. `stateSecret()` returns `GOOGLE_OAUTH_STATE_SECRET || DIAG_KEY`.

- [x] **Step 4: Build channels, run the token test, typecheck, full suite, commit, PR, merge when green.** Behaviour is unchanged until the secrets exist. **Ruben's half:** `openssl rand -base64 32` once, as `EDGE_CALL_SECRET` on BOTH Vercel projects (Production), in either order; a second value as `GOOGLE_OAUTH_STATE_SECRET` on the dashboard. 2B moves the remaining doors and then removes the key path.

---

### Task 7: One deployment configuration, not twelve checks of the environment name

Twelve server functions run only when `VERCEL_ENV` is production, so Connections, Ask and templates cannot be rehearsed anywhere else. One module says what this deployment may do; the guards read it.

**Files:**
- Create: `apps/dashboard/src/server/deployment.ts`
- Modify: `apps/dashboard/src/server/service.ts` (ten sites), `ask/gateway.ts:56`, `signup.ts:126`; `apps/dashboard/.env.example` (`EDGE_PROVIDERS=`)
- Test: `tooling/scripts/tests/deployment.test.mjs` (executed)

- [x] **Step 1: The module**

```ts
import "server-only";

export type DeploymentEnv = "production" | "preview" | "development";

/**
 * What this deployment may do. Production reaches the real providers through
 * the edge. A preview or a laptop reaches them only when EDGE_PROVIDERS=live
 * says its EDGE_URL points at an edge that holds sandbox keys; otherwise the
 * calls that would buy, register, connect or bill answer "not here".
 */
export function deploymentFrom(env: NodeJS.ProcessEnv): { env: DeploymentEnv; providersLive: boolean } {
  const name = (env.VERCEL_ENV as DeploymentEnv | undefined) ?? "development";
  return { env: name, providersLive: name === "production" || env.EDGE_PROVIDERS === "live" };
}
export const deployment = deploymentFrom(process.env);
```

- [x] **Step 2: The test**

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { deploymentFrom } from "../../../apps/dashboard/src/server/deployment.ts";
test("production is live; a preview or a laptop only when it says so", () => {
  assert.equal(deploymentFrom({ VERCEL_ENV: "production" }).providersLive, true);
  assert.equal(deploymentFrom({ VERCEL_ENV: "preview" }).providersLive, false);
  assert.equal(deploymentFrom({}).providersLive, false);
  assert.equal(deploymentFrom({ VERCEL_ENV: "preview", EDGE_PROVIDERS: "live" }).providersLive, true);
  assert.equal(deploymentFrom({}).env, "development");
});
```

(`server-only` is a no-op import outside Next; if the test runner refuses it, move the import behind `deployment.ts`'s consumers and keep `deploymentFrom` in a file without it.)

- [x] **Step 3: The twelve guards**

Every `process.env.VERCEL_ENV !== "production"` in `service.ts`, `ask/gateway.ts` and `signup.ts` becomes `!deployment.providersLive`, with `import { deployment } from "@/server/deployment";` (`"./deployment"` inside `server/`). The rest of each line is unchanged.

- [x] **Step 4: Typecheck, full suite, commit, PR, merge when green.** Commit: `One deployment configuration says what this deployment may do; twelve checks of the environment name read it`.

---

### After 2A

Tasks 2 and 4 wait on Ruben's yes; then one `db push --linked` for 00106 and 00107. Then plan 2B: the sixteen remaining doors onto the token and the key path removed; line provisioning onto the ledger (voice); capability status, a real test and owner activation; the WhatsApp handler executed by a test; realtime scoped to the workspace; environment-neutral seeds. Texting last, as decided.

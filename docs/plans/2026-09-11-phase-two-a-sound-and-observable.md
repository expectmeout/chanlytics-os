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

- [ ] **Step 1: The failing test**

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

- [ ] **Step 2: `pgIngest` takes the client and names the loss**

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

- [ ] **Step 3: The handler records or says so**

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

- [ ] **Step 4: The webhook counts what it could not record**

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

- [ ] **Step 5: Run the new test, typecheck, full suite; commit; PR; merge when green**

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

- [ ] **Step 1: The migration**

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

- [ ] **Step 2: The database test**

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

- [ ] **Step 3: Prove on a local database; open the PR; do not merge**

```bash
node "$SUPABASE_CLI" start -x studio,imgproxy,inbucket,edge-runtime,logflare,vector
node "$SUPABASE_CLI" status -o env > "$STATUS" 2>&1; export SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_SERVICE_ROLE_KEY=$(sed -n 's/^SERVICE_ROLE_KEY="\(.*\)"$/\1/p' "$STATUS")
COREPACK_ENABLE_DOWNLOAD_PROMPT=0 corepack pnpm test:db > "$LOG/db.log" 2>&1; grep -E "^# (tests|pass|fail|skipped)" "$LOG/db.log"
node "$SUPABASE_CLI" stop --no-backup
```

Expected: every db test passes, the three new ones included. PR body: "Adds migration 00106. Merge on Ruben's yes; push after deploy."

---

### Task 3: A missing model key is a visible degraded state

Today no `ANTHROPIC_API_KEY` means every message gets the workspace's generic greeting, no escalation, no alert. AI-04 in the PRD: the generic acknowledgement may go only as a labelled fallback that counts as nothing, the thread goes to a person, and the platform is paged.

**Files:**
- Modify: `apps/edge/lib/whatsapp/inbound.ts` (the `else` of the model branch, the send's meta)

- [ ] **Step 1: The change**

Import `pageOperator` from `../page-operator.js`. Beside `let brainMeta: BrainMeta | undefined;` add `let noModel = false;`. Replace the model branch's `else`:

```ts
  } else {
    // No model key: the receptionist cannot answer, and a canned greeting
    // passed off as an answer is the quiet failure. The workspace's own
    // generic greeting still goes, marked as a fallback that spends no cap,
    // the thread is handed to a person, and the platform is paged once per
    // window: this is the platform's condition, not this workspace's.
    L.error("wa_no_model", { tenant: tenantId });
    replyText = brainCfg.fallbacks.greeting;
    escalate = true;
    escalationReason = "brain_error";
    noModel = true;
    if (db) await pageOperator({ db }, "brain_unavailable", "The receptionist has no model key", "ANTHROPIC_API_KEY is not set on the edge. Every reply is the workspace's generic greeting, marked fallback, and each thread is handed to a person until the key is back.");
  }
```

And the send: `const sent = await send(replyText, brainMeta as unknown as Record<string, Json> | undefined);` becomes `const sent = await send(replyText, noModel ? { ack: true, fallback: "no_model" } : (brainMeta as unknown as Record<string, Json> | undefined));`.

- [ ] **Step 2: Typecheck, full suite (a pin on the moved lines is updated, never added), commit, PR, merge when green**

Commit: `A missing model key is a degraded state a person can see, not a canned receptionist`.

---

### Task 4: Every clock is registered, and an outside monitor can knock (migration 00107; PR opened, merge on Ruben's yes)

`sweep_health()` judges eleven clocks from a VALUES list; six pg_cron jobs (the monthly partition precreate and five purges) are outside it, and the only watcher runs inside the edge it watches. The registry becomes data on `sweep_status`, the health function reads it, run-judged jobs are judged on `cron.job_run_details`, and a keyless `/api/health` answers 200 or 503 for a pinger outside our failure domain.

**Files:**
- Create: `supabase/migrations/00107_every_clock_is_registered.sql`
- Create: `apps/edge/api/health.ts`
- Modify: `tooling/scripts/tests/jobs-outbox.db.test.mjs` (the health test's expected rows grow from 11 to 17)
- Test: the db test above; `tooling/scripts/tests/health-route.test.mjs` (new, executed with a fake db)

- [ ] **Step 1: The migration**

```sql
-- 00107 · Every clock is registered as data, and the health check reads the register.
--
-- sweep_health() carried its expectations as a VALUES list, so registering a
-- sweep was four hand steps and the six clocks nobody typed in (the monthly
-- partition precreate and the five nightly purges) were never watched. The
-- register is the table now: a row per clock with its cron job name, how long
-- it may go silent, and how it is judged -- by the request it enqueued
-- ('request'), by its last successful run in cron.job_run_details ('run'), or
-- by nothing but its existence ('exists', the ten-second row clocks).

alter table public.sweep_status
  add column if not exists jobname       text,
  add column if not exists max_silence   interval,
  add column if not exists judged_by     text not null default 'request' check (judged_by in ('request', 'run', 'exists')),
  add column if not exists registered_at timestamptz not null default now();
alter table public.sweep_status drop constraint if exists sweep_status_sweep_check;

update public.sweep_status s
   set jobname = v.jobname, max_silence = v.max_silence, judged_by = v.judged_by
  from (values
    ('deadman',      'deadman-sweep',          interval '25 minutes',          'request'),
    ('health',       'sweep-health',           interval '70 minutes',          'request'),
    ('calls',        'call-reconcile',         null::interval,                 'request'),
    ('jobs',         'jobs-tick',              interval '3 minutes',           'request'),
    ('lines',        'lines-sweep',            interval '40 minutes',          'request'),
    ('registration', 'registration-sweep',     interval '2 hours 20 minutes',  'request'),
    ('calendar',     'calendar-people-sweep',  interval '2 hours 20 minutes',  'request'),
    ('google',       'google-listings-sweep',  interval '2 hours 20 minutes',  'request'),
    ('playbooks',    'playbooks-sweep',        interval '2 hours 20 minutes',  'request')
  ) as v(sweep, jobname, max_silence, judged_by)
 where s.sweep = v.sweep;

insert into public.sweep_status (sweep, jobname, max_silence, judged_by) values
  ('pauses',             'expire-stale-pauses',        null,                 'exists'),
  ('snoozes',            'wake-stale-snoozes',         null,                 'exists'),
  ('partitions',         'events-partition-precreate', interval '35 days',   'run'),
  ('purge_events',       'purge-events',               interval '26 hours',  'run'),
  ('purge_ask',          'purge-ask',                  interval '26 hours',  'run'),
  ('purge_notifications','purge-notifications',        interval '26 hours',  'run'),
  ('purge_rate_hits',    'purge-rate-hits',            interval '26 hours',  'run'),
  ('purge_cron_history', 'purge-cron-history',         interval '26 hours',  'run')
on conflict (sweep) do update set jobname = excluded.jobname, max_silence = excluded.max_silence, judged_by = excluded.judged_by;

create or replace function public.sweep_health()
returns table (
  sweep           text,
  healthy         boolean,
  detail          text,
  last_request_at timestamptz,
  status_code     integer,
  scheduled       boolean,
  alerted_at      timestamptz
)
language sql
security definer
set search_path = public
as $$
  with runs as (
    select j.jobid,
           max(d.end_time) filter (where d.status = 'succeeded') as last_ok,
           (select d2.status from cron.job_run_details d2 where d2.jobid = j.jobid order by d2.start_time desc limit 1) as last_status,
           (select left(d2.return_message, 120) from cron.job_run_details d2 where d2.jobid = j.jobid order by d2.start_time desc limit 1) as last_message
      from cron.job j
      left join cron.job_run_details d on d.jobid = j.jobid
     group by j.jobid
  ),
  observed as (
    select e.sweep, e.jobname, e.max_silence, e.judged_by, e.registered_at,
           e.request_id, e.requested_at, e.note, e.alerted_at,
           j.jobid is not null                    as job_exists,
           coalesce(j.active, false)              as job_active,
           j.schedule                             as job_schedule,
           r.id is not null                       as has_response,
           r.status_code,
           coalesce(r.timed_out, false)           as timed_out,
           r.error_msg,
           left(r.content, 200)                   as content,
           exists (select 1 from net._http_response nr where nr.id > e.request_id)
                                                  as newer_response_seen,
           ru.last_ok, ru.last_status, ru.last_message
      from public.sweep_status e
      left join lateral (
        select jobid, active, schedule from cron.job
         where jobname = e.jobname order by jobid limit 1
      ) j on true
      left join runs ru on ru.jobid = j.jobid
      left join net._http_response r on r.id = e.request_id
     where e.jobname is not null
  ),
  judged as (
    select o.*,
      case
        when not o.job_exists then
          'no cron job named ' || o.jobname || ' is scheduled'
        when not o.job_active then
          'the cron job ' || o.jobname || ' is disabled'
        -- judged on its runs: the SQL-only jobs that never enqueue a request
        when o.judged_by = 'run' and o.last_ok is null and o.registered_at > now() - o.max_silence then
          null
        when o.judged_by = 'run' and o.last_ok is null then
          'the job ' || o.jobname || ' has never succeeded' || coalesce('; its last run ended ' || o.last_status || ': ' || o.last_message, '')
        when o.judged_by = 'run' and o.last_ok < now() - o.max_silence then
          'the job ' || o.jobname || ' last succeeded at ' || to_char(o.last_ok at time zone 'utc', 'YYYY-MM-DD HH24:MI') ||
          ' UTC; it is scheduled ' || coalesce(o.job_schedule, '(unknown)') ||
          coalesce(' and its last run ended ' || o.last_status || ': ' || o.last_message, '')
        when o.judged_by in ('run', 'exists') then
          null
        -- judged on the request it enqueued, exactly as before
        when o.note is not null then
          'the trigger could not send the request: ' || o.note
        when o.max_silence is not null and o.requested_at is null then
          'this sweep has never enqueued a request'
        when o.max_silence is not null and o.requested_at < now() - o.max_silence then
          'last enqueued a request at ' ||
          to_char(o.requested_at at time zone 'utc', 'YYYY-MM-DD HH24:MI') || ' UTC, ' ||
          round((extract(epoch from (now() - o.requested_at)) / 60)::numeric)::text ||
          ' minutes ago; ' || o.jobname || ' is scheduled ' || coalesce(o.job_schedule, '(unknown)')
        when o.requested_at is null or o.requested_at < now() - interval '1 hour' then
          null
        when not o.has_response and o.request_id is not null
             and o.requested_at < now() - interval '2 minutes'
             and o.newer_response_seen then
          'the request was enqueued at ' || to_char(o.requested_at at time zone 'utc', 'HH24:MI') ||
          ' UTC and pg_net never recorded a response'
        when o.timed_out then
          'the request timed out before the edge answered'
        when o.error_msg is not null then
          'pg_net could not complete the request: ' || o.error_msg
        when o.status_code is not null and (o.status_code < 200 or o.status_code > 299) then
          'the edge answered ' || o.status_code || ': ' || coalesce(o.content, '(no body)')
      end as detail
      from observed o
  )
  select j.sweep,
         j.detail is null,
         j.detail,
         coalesce(j.requested_at, j.last_ok),
         j.status_code,
         j.job_exists and j.job_active,
         j.alerted_at
    from judged j
   order by j.sweep;
$$;

comment on function public.sweep_health() is
  'One row per registered clock (public.sweep_status): healthy, why not, when it last spoke, what the edge answered, whether pg_cron still has it, and when it was last alerted. Run-judged rows read cron.job_run_details; the health route mails the unhealthy ones and stamps alerted_at only after delivery.';
```

`sweep_mark_alerted(p_alerted, p_healthy)` and `request_sweep(...)` are unchanged; both key on the row name, which the new rows now carry.

- [ ] **Step 2: The database test moves from 11 to 17 rows**

In `tooling/scripts/tests/jobs-outbox.db.test.mjs`, the test "sweep_health() watches the heartbeat, and the lines sweep 00097 left out" asserts the set of names; add the six new names (`partitions`, `purge_ask`, `purge_cron_history`, `purge_events`, `purge_notifications`, `purge_rate_hits`) plus `pauses` and `snoozes` if it lists them, and assert every new row is healthy on a fresh database (grace: registered now, never run).

- [ ] **Step 3: The health route (`apps/edge/api/health.ts`)**

```ts
/**
 * GET /api/health — the one door an outside monitor knocks on.
 *
 * No key. It says only whether the platform's clocks are healthy and whether
 * due work is being drained, never a tenant's name or a secret: 200 when all
 * is well, 503 otherwise, so a pinger outside our failure domain can page a
 * person even when the edge, the database or pg_cron is the thing that is
 * down. Cached ten seconds per instance, so a noisy pinger cannot become a
 * load on the database.
 */
import { pg } from "../lib/pg.js";
import type { SweepHealthRow } from "../lib/sweep-health.js";

const CACHE_MS = 10_000;
let cached: { at: number; status: number; body: string } | null = null;

export interface HealthAnswer { ok: boolean; unhealthy: string[]; jobs_backlog: number | null; checked_at: string; reason?: string }

/** The judgement, separated from the transport so a test can run it against a fake database. */
export async function judgeHealth(db: { rpc: (name: string) => Promise<{ data: unknown; error: { message: string } | null }> }): Promise<{ status: number; body: HealthAnswer }> {
  const now = new Date().toISOString();
  const [health, backlog] = await Promise.all([db.rpc("sweep_health"), db.rpc("jobs_backlog")]);
  if (health.error) return { status: 503, body: { ok: false, unhealthy: [], jobs_backlog: null, checked_at: now, reason: "health_unreadable" } };
  const rows = (health.data ?? []) as SweepHealthRow[];
  const unhealthy = rows.filter((r) => !r.healthy).map((r) => r.sweep);
  const due = typeof backlog.data === "number" ? backlog.data : null;
  const ok = unhealthy.length === 0 && (due ?? 0) === 0;
  return { status: ok ? 200 : 503, body: { ok, unhealthy, jobs_backlog: due, checked_at: now } };
}

export async function GET(): Promise<Response> {
  const headers = { "content-type": "application/json", "cache-control": "no-store" };
  if (cached && Date.now() - cached.at < CACHE_MS) return new Response(cached.body, { status: cached.status, headers });
  const db = pg();
  if (!db) return new Response(JSON.stringify({ ok: false, unhealthy: [], jobs_backlog: null, checked_at: new Date().toISOString(), reason: "no_database" }), { status: 503, headers });
  let answer: { status: number; body: HealthAnswer };
  try {
    answer = await judgeHealth(db as unknown as Parameters<typeof judgeHealth>[0]);
  } catch (e) {
    answer = { status: 503, body: { ok: false, unhealthy: [], jobs_backlog: null, checked_at: new Date().toISOString(), reason: e instanceof Error ? e.message.slice(0, 120) : "error" } };
  }
  cached = { at: Date.now(), status: answer.status, body: JSON.stringify(answer.body) };
  return new Response(cached.body, { status: answer.status, headers });
}
```

- [ ] **Step 4: The executed test (`health-route.test.mjs`)**

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const { judgeHealth } = await import(pathToFileURL(path.join(ROOT, "apps/edge/api/health.ts")).href);
const db = (rows, backlog, err = null) => ({ rpc: async (name) => name === "sweep_health" ? { data: rows, error: err } : { data: backlog, error: null } });
const row = (sweep, healthy) => ({ sweep, healthy, detail: healthy ? null : "late", last_request_at: null, status_code: null, scheduled: true, alerted_at: null });

test("all clocks healthy and nothing waiting is 200", async () => {
  const a = await judgeHealth(db([row("jobs", true), row("purge_events", true)], 0));
  assert.equal(a.status, 200); assert.equal(a.body.ok, true); assert.deepEqual(a.body.unhealthy, []); assert.equal(a.body.jobs_backlog, 0);
});
test("one unhealthy clock names itself and is 503", async () => {
  const a = await judgeHealth(db([row("jobs", true), row("partitions", false)], 0));
  assert.equal(a.status, 503); assert.deepEqual(a.body.unhealthy, ["partitions"]);
});
test("due work nobody drains is 503 even when every clock ticks", async () => {
  const a = await judgeHealth(db([row("jobs", true)], 7));
  assert.equal(a.status, 503); assert.equal(a.body.jobs_backlog, 7);
});
test("a health function that cannot be read is 503 with a reason, and no secret", async () => {
  const a = await judgeHealth(db(null, 0, { message: "permission denied for schema cron: secret-ish" }));
  assert.equal(a.status, 503); assert.equal(a.body.reason, "health_unreadable"); assert.ok(!JSON.stringify(a.body).includes("secret-ish"));
});
```

- [ ] **Step 5: Local database proof (00107 replays; db tests; `sweep_health()` returns 17 rows, all healthy), typecheck, full suite, PR opened; do not merge.** Ruben's half: point an external pinger (UptimeRobot, Better Stack, or the Cloudflare health check) at `https://chanlytics-messaging.vercel.app/api/health` every minute, alerting on non-200.

---

### Task 5: The money, team and consent routes declare their policy

Eight handlers in seven files move from hand-performed policy onto `route()`: scope, role, rate, spend and input declared on the export, enforced by one wrapper, banked in `route-policy.json`. The two team writes that took no rate token get a bucket, said out loud.

**Files:**
- Modify: `apps/dashboard/src/server/rate-limit.ts` (a `team` bucket)
- Modify: `apps/dashboard/src/server/verbs.ts` (`loadContact`, `contactScope`)
- Rewrite: `apps/dashboard/app/api/v1/lines/buy/route.ts`, `lines/register/route.ts`, `billing/checkout/route.ts`, `billing/portal/route.ts`, `team/invite/route.ts`, `team/[id]/route.ts`, `contacts/[id]/consent/route.ts`, `contacts/[id]/marketing-consent/route.ts`
- Modify: `tooling/scripts/tests/route-policy.json` (banked with `UPDATE_ROUTE_POLICY=1`)

- [ ] **Step 1: The bucket and the contact scope**

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

- [ ] **Step 2: The eight handlers**

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

- [ ] **Step 3: Bank the policy, typecheck, full suite, commit, PR, merge when green**

```bash
UPDATE_ROUTE_POLICY=1 node --conditions=react-server --import tsx --test tooling/scripts/tests/route-policy.test.mjs
git diff --stat tooling/scripts/tests/route-policy.json   # eight leave undeclared; eight appear under routes
```

Commit: `The money, team and consent routes declare their policy: scope, role, rate and spend on the export, one wrapper enforcing them`.

---

### Task 6: The two runtimes trust a signed per-call token, not one shared key

Twenty edge doors compare `x-diag-key` with `!==`; the same key signs Google OAuth state; the edge's address is a literal in five dashboard files. This task adds the token (signed with its own secret, bound to one door, one workspace and one minute), a timing-safe key fallback while the secret is being rolled out, `EDGE_URL`, and a separate OAuth state secret. Four doors and their four callers move in this PR: lines, billing, google, llm. The rest follow in 2B, mechanically.

**Files:**
- Create: `packages/channels/src/edge-token.ts` (+ `export * from "./edge-token";` in `packages/channels/src/index.ts`)
- Create: `apps/edge/lib/admin-auth.ts`, `apps/dashboard/src/server/edge.ts`
- Modify: `apps/edge/api/admin/{lines,billing,google,llm}.ts`; `apps/dashboard/src/server/{lines,billing,google,ask/gateway}.ts`; `apps/dashboard/.env.example`, `apps/edge/.env.example`
- Test: `tooling/scripts/tests/edge-token.test.mjs` (new, executed)

- [ ] **Step 1: The token, pure (`packages/channels/src/edge-token.ts`)**

```ts
/**
 * The token a dashboard call carries to an edge door.
 *
 * One shared key opened every door and never said who was calling for
 * which workspace. This is minted per call: bound to one door (aud), one
 * workspace and one user, valid for a minute, signed with a secret kept for
 * nothing else. The edge verifies it in constant time and reads the
 * workspace from the token, never from the body.
 */
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const EDGE_TOKEN_TTL_MS = 60_000;

export interface EdgeClaims { aud: string; ws: string | null; user: string | null; iat: number; exp: number; nonce: string }

export function signEdgeToken(secret: string, aud: string, ctx: { workspace?: string | null; user?: string | null } = {}, nowMs = Date.now()): string {
  const claims: EdgeClaims = { aud, ws: ctx.workspace ?? null, user: ctx.user ?? null, iat: nowMs, exp: nowMs + EDGE_TOKEN_TTL_MS, nonce: randomBytes(8).toString("hex") };
  const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
  return `${payload}.${createHmac("sha256", secret).update(payload).digest("base64url")}`;
}

export type EdgeTokenVerdict = { ok: true; claims: EdgeClaims } | { ok: false; reason: "malformed" | "signature" | "audience" | "expired" };

export function verifyEdgeToken(secret: string, token: string, aud: string, nowMs = Date.now()): EdgeTokenVerdict {
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return { ok: false, reason: "malformed" };
  const expected = createHmac("sha256", secret).update(payload).digest();
  const given = Buffer.from(sig, "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return { ok: false, reason: "signature" };
  let claims: EdgeClaims;
  try { claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as EdgeClaims; } catch { return { ok: false, reason: "malformed" }; }
  if (claims.aud !== aud) return { ok: false, reason: "audience" };
  if (typeof claims.exp !== "number" || nowMs > claims.exp || nowMs < claims.iat - EDGE_TOKEN_TTL_MS) return { ok: false, reason: "expired" };
  return { ok: true, claims };
}
```

- [ ] **Step 2: The failing test (`edge-token.test.mjs`)**

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { signEdgeToken, verifyEdgeToken, EDGE_TOKEN_TTL_MS } from "@chanlytics/channels";
const S = "a-secret-kept-for-nothing-else", T0 = 1_760_000_000_000;
test("a token opens the door it was minted for, names the workspace and the person, and nothing else", () => {
  const t = signEdgeToken(S, "/api/admin/lines", { workspace: "ws1", user: "u1" }, T0);
  const v = verifyEdgeToken(S, t, "/api/admin/lines", T0 + 1000);
  assert.equal(v.ok, true); assert.equal(v.claims.ws, "ws1"); assert.equal(v.claims.user, "u1");
  assert.deepEqual(verifyEdgeToken(S, t, "/api/admin/billing", T0 + 1000), { ok: false, reason: "audience" });
  assert.deepEqual(verifyEdgeToken(S, t, "/api/admin/lines", T0 + EDGE_TOKEN_TTL_MS + 1), { ok: false, reason: "expired" });
  assert.deepEqual(verifyEdgeToken("another", t, "/api/admin/lines", T0), { ok: false, reason: "signature" });
  const [p] = t.split("."); assert.deepEqual(verifyEdgeToken(S, `${p}.AAAA`, "/api/admin/lines", T0), { ok: false, reason: "signature" });
  assert.deepEqual(verifyEdgeToken(S, "nonsense", "/api/admin/lines", T0), { ok: false, reason: "malformed" });
});
```

- [ ] **Step 3: The edge's door helper (`apps/edge/lib/admin-auth.ts`)**

```ts
/**
 * Who may open an admin door. A dashboard call carries a token minted for
 * this door (see packages/channels edge-token); while the secret is being
 * rolled out, the shared key still opens it, compared in constant time. A
 * token that is present must verify: there is no falling back from a bad
 * token to the key.
 */
import crypto from "node:crypto";
import { json } from "./http.js";
import { verifyEdgeToken } from "./workspace/channels.js";

export type AdminAuth =
  | { ok: true; via: "token" | "key"; workspace: string | null; user: string | null }
  | { ok: false; response: Response };

export function authorizeAdmin(request: Request, aud: string): AdminAuth {
  const token = request.headers.get("x-edge-token");
  if (token) {
    const secret = process.env.EDGE_CALL_SECRET;
    if (!secret) return { ok: false, response: json(503, { ok: false, error: "no_edge_secret" }) };
    const v = verifyEdgeToken(secret, token, aud);
    if (!v.ok) return { ok: false, response: json(403, { ok: false, error: `token_${v.reason}` }) };
    return { ok: true, via: "token", workspace: v.claims.ws, user: v.claims.user };
  }
  const key = process.env.DIAG_KEY || "";
  const presented = request.headers.get("x-diag-key") || "";
  const a = Buffer.from(presented);
  const b = Buffer.from(key);
  if (!key || !presented || a.length !== b.length || !crypto.timingSafeEqual(a, b)) return { ok: false, response: json(403, { ok: false }) };
  return { ok: true, via: "key", workspace: null, user: null };
}

/** The workspace a door acts on: the token's when it carries one; a body's only from a key-authorised caller. A body that names another workspace than the token is refused. */
export function workspaceFor(auth: Extract<AdminAuth, { ok: true }>, bodyTenant: unknown): { ok: true; tenantId: string | null } | { ok: false; response: Response } {
  const fromBody = typeof bodyTenant === "string" ? bodyTenant : null;
  if (auth.workspace && fromBody && fromBody !== auth.workspace) return { ok: false, response: json(403, { ok: false, error: "workspace_mismatch" }) };
  return { ok: true, tenantId: auth.workspace ?? fromBody };
}
```

In each of `admin/lines.ts`, `admin/billing.ts`, `admin/google.ts`, `admin/llm.ts` replace

```ts
  if (!process.env.DIAG_KEY || request.headers.get("x-diag-key") !== process.env.DIAG_KEY) {
    return json(403, { ok: false });
  }
```

with `const auth = authorizeAdmin(request, "/api/admin/<door>"); if (!auth.ok) return auth.response;` (the door's own path as `aud`), importing `authorizeAdmin, workspaceFor` from `../../lib/admin-auth.js`. In `lines.ts` and `billing.ts`, right after `const op = typeof body.op === "string" ? body.op : "";` add `const ws = workspaceFor(auth, body.tenant_id); if (!ws.ok) return ws.response; body.tenant_id = ws.tenantId ?? undefined;` so every later read of `body.tenant_id` is the token's.

- [ ] **Step 4: The dashboard's helper (`apps/dashboard/src/server/edge.ts`) and the four callers**

```ts
import "server-only";
import { signEdgeToken } from "@chanlytics/channels";

/** Where the edge lives: one variable, the old literal as its default so nothing moves until it is set. */
export function edgeUrl(): string {
  return (process.env.EDGE_URL || "https://chanlytics-messaging.vercel.app").replace(/\/$/, "");
}

/** The headers a call to an edge door carries: a token minted for that door when the secret exists, and the shared key while it still does. */
export function edgeHeaders(aud: string, ctx: { workspace?: string | null; user?: string | null } = {}): Record<string, string> {
  const h: Record<string, string> = { "content-type": "application/json" };
  const secret = process.env.EDGE_CALL_SECRET;
  if (secret) h["x-edge-token"] = signEdgeToken(secret, aud, ctx);
  if (process.env.DIAG_KEY) h["x-diag-key"] = process.env.DIAG_KEY;
  return h;
}
export const edgeConfigured = (): boolean => !!(process.env.EDGE_CALL_SECRET || process.env.DIAG_KEY);
```

`lines.ts`, `billing.ts`, `google.ts`: delete the `EDGE_BASE` constant; the guard becomes `if (!edgeConfigured()) return { status: 503, body: { ok: false, error: "no_edge_credential" } };`; the fetch becomes `fetch(`${edgeUrl()}/api/admin/lines`, { method: "POST", headers: edgeHeaders("/api/admin/lines", { workspace: typeof body.tenant_id === "string" ? body.tenant_id : null }), body: JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs) })` (billing and google with their own paths). `ask/gateway.ts`: the same with `edgeHeaders("/api/admin/llm", { workspace: call.tenantId, user: call.userId })`, and `GatewayRefused({ kind: "no_key" })` when `!edgeConfigured()`. `google.ts`'s `stateSecret()` becomes `return process.env.GOOGLE_OAUTH_STATE_SECRET || process.env.DIAG_KEY || null;`.

`.env.example` (dashboard) gains `EDGE_URL=`, `EDGE_CALL_SECRET=`, `GOOGLE_OAUTH_STATE_SECRET=`; (edge) gains `EDGE_CALL_SECRET=`. The env manifest test pins these.

- [ ] **Step 5: Build channels (and every consumer), run the token test, typecheck, full suite, commit, PR, merge when green.** Behaviour is unchanged until the secrets exist. **Ruben's half:** `openssl rand -base64 32` once; add it as `EDGE_CALL_SECRET` on BOTH Vercel projects (Production only), and a second value as `GOOGLE_OAUTH_STATE_SECRET` on the dashboard. From then on the four doors are opened by tokens; a follow-up PR in 2B removes the key path.

---

### Task 7: One deployment configuration, not twelve checks of the environment name

Twelve server functions run only when `VERCEL_ENV` is production, so Connections, Ask and templates cannot be rehearsed anywhere else. One module says what this deployment may do; the guards read it.

**Files:**
- Create: `apps/dashboard/src/server/deployment.ts`
- Modify: `apps/dashboard/src/server/service.ts` (ten sites), `ask/gateway.ts:56`, `signup.ts:126`; `apps/dashboard/.env.example` (`EDGE_PROVIDERS=`)
- Test: `tooling/scripts/tests/deployment.test.mjs` (executed)

- [ ] **Step 1: The module**

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

- [ ] **Step 2: The test**

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

- [ ] **Step 3: The twelve guards**

Every `process.env.VERCEL_ENV !== "production"` in `service.ts`, `ask/gateway.ts` and `signup.ts` becomes `!deployment.providersLive`, with `import { deployment } from "@/server/deployment";` (`"./deployment"` inside `server/`). The rest of each line is unchanged.

- [ ] **Step 4: Typecheck, full suite, commit, PR, merge when green.** Commit: `One deployment configuration says what this deployment may do; twelve checks of the environment name read it`.

---

### After 2A

Tasks 2 and 4 wait on Ruben's yes; then one `db push --linked` for 00106 and 00107. Then plan 2B: the sixteen remaining doors onto the token and the key path removed; line provisioning onto the ledger (voice); capability status, a real test and owner activation; the WhatsApp handler executed by a test; realtime scoped to the workspace; environment-neutral seeds. Texting last, as decided.

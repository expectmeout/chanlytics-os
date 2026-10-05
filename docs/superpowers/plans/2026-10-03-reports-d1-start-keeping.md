# Reports phase D1: start keeping — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Start keeping what four lenses will read and the product does not keep today: what each customer message became (K1), what a call was about and in which language (K2), how each new person first reached the workspace (K3), and when a handover ended and what its reason was before it changed (K4), without changing anything a customer, an owner or a page shows.

**Architecture:** K1 adds a SQL door beside `mark_processed` and one optional argument to the receptionist's `processed` port, which the 22 ways out of `answerInbound` fill from one rule (a message is a handoff exactly when an escalation was opened or refreshed for it). K2 adds two fields to the voice agent's post-call analysis, which `planAgentSettings` already syncs to existing agents. K3 and K4 are database triggers that write inside the transaction that already writes the row and trap their own failure, so no stamp can fail a message or a handover: K3 stamps a person, once, with the wire, line or ad of the message or call that made them; K4 stamps an escalation's `resolved_at` and writes an `escalation.changed {from, to}` event when a reason replaces another. Nothing is backfilled: an old row reads null, and a tile treats null as absent, never zero.

**Tech Stack:** Postgres (plpgsql, triggers, SECURITY DEFINER doors, forward-only migrations 00287-00290), TypeScript (`packages/contracts`, `packages/db`, `packages/core`, `packages/channels`, the edge's sink), `node:test` through `tooling/scripts/checks/test.mjs` (the `--db` files need the local Supabase stack).

**Spec:** `docs/superpowers/specs/2026-10-02-reports-lenses-design.md` (§10 K1-K4 is this batch; §5 phase D, §13 testing, §15-17 rollout, scope, risks). Why each capture exists and which tile reads it: `docs/superpowers/specs/2026-10-02-reports-lenses-data-catalog.md` (§1 rows 2, 3 and 6; the Overview, Receptionist and People tables).

## Global Constraints

- **No commit, no push, no PR** until Ruben says so (his standing rule, 2 Oct 2026). Every "Stage" step is `git add`, never `git commit`. No migration is applied to production by this plan: Task 9 lists Ruben's production steps.
- Work in a fresh worktree off `origin/main`: `git -C "C:/Users/Ruben/Documents/Claude Projects/Claude Video/cm-live" worktree add -b feat/reports-d1-start-keeping "../cm-reports-d1" origin/main`, then `corepack pnpm install` in it. Never edit the tree that serves `localhost:3300`.
- **Never run the whole suite locally** (about 20 minutes). Run each touched test file alone: `node tooling/scripts/checks/test.mjs <file>`; a database file with `--db`, its environment from `npx supabase status` (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`; `SUPABASE_ANON_KEY` where a file says so). Plus `corepack pnpm -r typecheck` and `corepack pnpm lint`.
- Tests import the packages from their built `dist`: run `corepack pnpm --filter "./packages/*" build` after every change to contracts, channels, db or core and before its tests. The rebuilt `packages/*/dist` is staged with the change (CI fails on drift).
- **Migrations 00287-00290**, the first four numbers above main's head (`00284` at `32328415f`). `00285` and `00286` are Reports phase A's, on its own branch and not on main, and another lane has an uncommitted `00285`: **the ledger skips a taken number**. Task 1 records both in the ledger's `gaps` with their reason, as `00266` was held on 29 Sep. If phase A lands first, `--record` lets go of those gaps and nothing else changes. If this batch lands first, the ledger head is `00290` and phase A renumbers its two unmerged files above it (the ledger refuses a file at or below the head). Numbers are given in task order; a task landed out of order is renumbered before it is recorded. Each migration: a header of a few lines, re-runnable statements (`create or replace`, `drop trigger if exists`, `add column if not exists`, a constraint added only when absent), a pinned `search_path`, grants stated (a definer function and its trigger function revoked from `public, anon, authenticated`; a door granted to `service_role`), and comments.
- **The regeneration sequence**, after each migration (it needs the stack): `node tooling/scripts/checks/migration-ledger.mjs --record`; `npx supabase db reset`; `corepack pnpm gen:schema-sets`; `corepack pnpm gen:db-types`; `corepack pnpm --filter "./packages/*" build`; `corepack pnpm gen:schema-snapshot`; `corepack pnpm gen:data-model`. Stage `supabase/migrations-ledger.json`, `supabase/schema.sql`, `packages/db/src/database.types.ts`, `packages/contracts/src/schema-sets.generated.ts`, `tooling/scripts/tests/_unique-keys.generated.json`, `docs/data-model.md` and `packages/*/dist`.
- **A stamp never blocks, delays or fails an inbound message or an escalation.** K1's is best-effort behind `pgSafe`, in parallel with the unchanged `mark_processed`. K3's and K4's are triggers whose stamping sits inside `begin … exception when others then raise warning`. Each task names the test where the stamp fails and the message still lands.
- **One predicate per rule.** What a message became is core's, one meaning for 22 call sites, held by one invariant in the executed test. First touch is `person_set_first_touch`: its `acquired_via is null` is the one place the first value wins, and its `created_at` test the one place that says which touch made the person. "Resolved" is `escalations_stamp_resolved`.
- **Names** (`docs/naming.md`): new SQL says person (a column on `contacts` keeps the table's word); a door is `<domain>_<verb>_<object>`; a trigger's function is named for its table and what it does; a closed set is declared once (`HANDLED_OUTCOMES` in contracts, `contacts_acquired_via_check` in SQL, `EVENT_KINDS`).
- **Either deploy order works**: each task says why.
- **No backfill.** An old row reads null ("unknown"); a tile treats null as absent, never zero (spec D9).
- No real customer in a test or a doc: slugs `harbor-*` and `acme-*`, numbers `+1555013xxxx`, made-up ids, addresses at example.com.
- Prettier owns formatting: run `corepack pnpm exec prettier --write <files>` on every touched file before staging (`docs/superpowers/` is Prettier-ignored).
- **No page changes.** The Activity log hides the new event kind (Task 7); Ask and the Inbox read no `why` off a customer's message (Task 2); nothing reads the new columns.

## Review Focus

1. **The apps deploy before migration 00287, or it is not applied yet:** the receptionist still answers, `processed_at` is still written, one `pg_handled_failed` line per message names the missing door, and no `handled` is written. Test: Task 2, a sink over a database that refuses the door, and the executed verb over the real sink and that database.
2. **The deadman sweep reads `meta.processed_at`:** a stamp must leave `processed_at`, the ingest's `raw_type` and the brain's own keys as they were, whichever of the two writes lands first and when both land at once. Test: Task 1's database test.
3. **A person who already existed (imported or added by hand, no history) writes for the first time, or a first message is redelivered:** the message is not their first touch, and nothing is stamped twice. Test: Task 4.
4. **A call that never connected makes a person:** no `call` first touch, and the message that follows does not stamp them either (it did not make them): unknown is read as before, never guessed. Test: Task 4.
5. **A reason changed back and forth, an escalation resolved by both of its writers:** one `escalation.changed` per change with the right `from` and `to`, none for an opening or a refresh; one `resolved_at`, the first, which a later update leaves alone. Test: Task 7, through the production writers.

---

## File Structure

| File | Change | Responsibility |
| --- | --- | --- |
| `supabase/migrations/00287_a_message_says_what_it_became.sql` | create | `message_stamp_handled` |
| `supabase/migrations/00288_a_person_keeps_how_they_first_reached_us.sql` | create | `acquired_via`, `acquired_ref`, their CHECKs, `person_set_first_touch`, the message and call triggers |
| `supabase/migrations/00289_a_person_added_at_a_door_keeps_how.sql` | create | the `contact.added` trigger |
| `supabase/migrations/00290_an_escalation_keeps_when_it_ended_and_why_it_changed.sql` | create | `resolved_at`, its stamp, the `escalation.changed` event |
| `supabase/migrations-ledger.json`, `supabase/schema.sql`, `packages/db/src/database.types.ts`, `packages/contracts/src/schema-sets.generated.ts`, `tooling/scripts/tests/_unique-keys.generated.json`, `docs/data-model.md` | regenerate | from the migrations |
| `packages/contracts/src/conversations/handled.ts` | create | `HANDLED_OUTCOMES`, `Handled` |
| `packages/contracts/src/conversations/message-author.ts`, `index.ts`, `inbox-thread.ts`, `conversation-vm.ts` | modify | `messageWhy`: only a receptionist reply carries a why |
| `packages/contracts/src/shared/enums.ts` | modify | `escalation.changed` in `EVENT_KINDS` |
| `packages/contracts/src/workspace/activity.ts`, `retention.ts` | modify | the kind's words; `escalation.` hidden from the log by default |
| `packages/db/src/repositories/ingest.ts`, `packages/db/src/index.ts` | modify | `stampHandled` |
| `packages/core/src/inbound/{ports,gates,reply-gates,unreadable,turn,dispatch,ingest,context}.ts` | modify | `processed(handled, intent)` at 22 ways out; the line travels with the ingest |
| `packages/channels/src/whatsapp.ts` | modify | the ad referral |
| `packages/channels/src/voice/voice-shell.ts` | modify | `topic` and `language` analysis fields |
| `apps/edge/lib/whatsapp/persist.ts`, `apps/edge/lib/log-events.ts` | modify | the sink's two doors; `pgIngest` carries line and referral |
| `apps/dashboard/src/server/ask/tools/read/threads.ts` | modify | `messageWhy` |
| `docs/system-prd.md` | modify | the voice analysis fields, said once more |
| `tooling/scripts/tests/database/a-message-says-what-it-became.db.test.mjs` | create | 00287 |
| `tooling/scripts/tests/database/a-person-keeps-how-they-first-reached-us.db.test.mjs` | create | 00288 |
| `tooling/scripts/tests/database/a-person-added-at-a-door-keeps-how.db.test.mjs` | create | 00289 |
| `tooling/scripts/tests/whatsapp/sink-says-what-a-message-became.test.mjs` | create | the sink's two doors, each failing alone |
| `tooling/scripts/tests/whatsapp/ad-referral.test.mjs` | create | the referral, and what `pgIngest` writes into the meta |
| `tooling/scripts/tests/conversations/message-why.test.mjs` | create | `messageWhy` |
| `tooling/scripts/tests/voice/calls/a-call-keeps-its-topic-and-language.db.test.mjs` | create | K2 on a real Postgres |
| `tooling/scripts/tests/reports/first-replies-person-wait.db.test.mjs` | create | the person's wait, as `first_replies` already says it |
| `tooling/scripts/tests/whatsapp/inbound-executed.test.mjs` | modify | the world records what each way out stamped; the invariant; the table of ways out |
| `tooling/scripts/tests/voice/calls/call-outcomes.test.mjs`, `tooling/scripts/tests/voice/voice-provision.test.mjs` | modify | seven analysis fields |
| `tooling/scripts/tests/conversations/escalations/{an-escalation-opens-and-resolves-once,escalation-outcome}.db.test.mjs`, `tooling/scripts/tests/workspace/activity.test.mjs` | modify | K4 through the production writers |

---

### Task 1: A message says what it became (migration 00287)

**Files:**
- Create: `supabase/migrations/00287_a_message_says_what_it_became.sql`
- Create: `tooling/scripts/tests/database/a-message-says-what-it-became.db.test.mjs`
- Modify: `supabase/migrations-ledger.json` (the gaps for `00285` and `00286`, then `--record`)
- Regenerate: the files the regeneration sequence names

**Interfaces:**
- Produces (SQL, granted to `service_role` only): `public.message_stamp_handled(p_tenant_id uuid, p_message_id uuid, p_handled text, p_intent text default null) returns void`. It merges `{ handled, intent? }` into the `meta` of an **inbound** message of that workspace, only where `handled` is absent, and never touches `processed_at` or any other key. `p_handled` and `p_intent` are cut at 20 characters; a null intent is no key.

- [ ] **Step 1: Write the failing database test**

Create `tooling/scripts/tests/database/a-message-says-what-it-became.db.test.mjs`:

```js
/**
 * 00287 on a real Postgres: message_stamp_handled says what a customer's message became (the Reports lenses spec, K1)
 * beside processed_at and never over it. The deadman sweep (apps/edge/lib/receptionist/unfinished.ts) reads
 * meta.processed_at, so a stamp that cost a key would show an answered customer as unanswered: both writes land,
 * whichever comes first and when both come at once. The first answer stands, no intent is no key, and a row that is
 * not this workspace's inbound message is left alone. Runs against the database `supabase start` builds on this
 * machine, never production.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";

const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const skip =
  !URL_ || !KEY
    ? "no database in env"
    : !/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(URL_)
      ? "refusing a database that is not on this machine: this suite writes customers' messages"
      : false;

let db;
let tenantId;
let otherId;
let seq = 0;
const ok = (res) => {
  assert.equal(res.error, null, res.error?.message);
  return res.data;
};

before(async () => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
  const at = Date.now();
  tenantId = ok(
    await db.from("tenants").insert({ slug: `harbor-handled-${at}`, name: "Harbor Handled" }).select("id").single(),
  ).id;
  otherId = ok(
    await db.from("tenants").insert({ slug: `acme-handled-${at}`, name: "Acme Handled" }).select("id").single(),
  ).id;
});

after(async () => {
  if (skip) return;
  for (const id of [tenantId, otherId]) {
    if (!id) continue;
    await db.from("events").delete().eq("tenant_id", id);
    await db.from("tenants").delete().eq("id", id);
  }
});

/** A customer's WhatsApp message, taken in the way the edge takes it in; answers its row's ids. */
async function inbound() {
  seq += 1;
  const phone = `+1555013${9000 + seq}`;
  return ok(
    await db.rpc("ingest_inbound", {
      p_tenant_id: tenantId,
      p_channel: "whatsapp",
      p_identity_external_id: phone.slice(1),
      p_phone_e164: phone,
      p_wa_profile_name: null,
      p_message_external_id: `wamid.handled.${Date.now()}.${seq}`,
      p_type: "text",
      p_body: "do you have time on Saturday?",
      p_channel_ts: null,
      p_media: null,
      p_meta: { raw_type: "text" },
      p_opt_out: false,
      p_opt_in: false,
    }),
  );
}
const metaOf = async (id) => ok(await db.from("messages").select("meta").eq("id", id).single()).meta;
const stampHandled = (tenant, id, handled, intent) =>
  db.rpc("message_stamp_handled", {
    p_tenant_id: tenant,
    p_message_id: id,
    p_handled: handled,
    ...(intent ? { p_intent: intent } : {}),
  });
const processed = (id) => db.rpc("mark_processed", { p_tenant_id: tenantId, p_message_id: id });

test(
  "a stamp lands beside processed_at and the row's own keys, whichever write comes first, and when both come at once",
  { skip },
  async () => {
    const first = await inbound();
    ok(await stampHandled(tenantId, first.message_id, "ai", "hours"));
    ok(await processed(first.message_id));
    const second = await inbound();
    ok(await processed(second.message_id));
    ok(await stampHandled(tenantId, second.message_id, "handoff", "money"));
    const third = await inbound();
    const both = await Promise.all([processed(third.message_id), stampHandled(tenantId, third.message_id, "held", "pricing")]);
    for (const r of both) ok(r);
    for (const [row, handled, intent] of [
      [first, "ai", "hours"],
      [second, "handoff", "money"],
      [third, "held", "pricing"],
    ]) {
      const meta = await metaOf(row.message_id);
      assert.equal(meta.raw_type, "text", "the ingest's own key stays");
      assert.ok(Date.parse(meta.processed_at) > 0, "processed_at stays: the deadman sweep reads it");
      assert.deepEqual([meta.handled, meta.intent], [handled, intent]);
    }
  },
);

test("the first answer stands, and no intent is no key: absent, never null", { skip }, async () => {
  const m = await inbound();
  ok(await stampHandled(tenantId, m.message_id, "blocked"));
  ok(await stampHandled(tenantId, m.message_id, "ai", "hours"));
  const meta = await metaOf(m.message_id);
  assert.equal(meta.handled, "blocked");
  assert.equal("intent" in meta, false);
});

test("another workspace's id, an outbound row and an unknown id change nothing, and say nothing", { skip }, async () => {
  const m = await inbound();
  ok(await stampHandled(otherId, m.message_id, "ai"));
  assert.equal("handled" in (await metaOf(m.message_id)), false, "a stamp from another workspace reaches nothing");
  const out = ok(
    await db
      .from("messages")
      .insert({
        tenant_id: tenantId,
        conversation_id: m.conversation_id,
        contact_id: m.contact_id,
        channel: "whatsapp",
        direction: "outbound",
        sender: "ai",
        type: "text",
        body: "Yes, Saturday works.",
        status: "sent",
        meta: {},
      })
      .select("id")
      .single(),
  );
  ok(await stampHandled(tenantId, out.id, "ai"));
  assert.equal("handled" in (await metaOf(out.id)), false, "only an inbound message says what it became");
  ok(await stampHandled(tenantId, "00000000-0000-4000-8000-000000000000", "ai"));
});
```

- [ ] **Step 2: Run it to verify it fails**

Start the local stack if it is not running (`npx supabase start` from the worktree root; `docs/runbook.md`, "Test it"), export `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` from `npx supabase status`, then:
Run: `node tooling/scripts/checks/test.mjs --db tooling/scripts/tests/database/a-message-says-what-it-became.db.test.mjs`
Expected: FAIL — `Could not find the function public.message_stamp_handled`.

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/00287_a_message_says_what_it_became.sql`:

```sql
-- 00287 · A message says what it became.
--
-- The Reports lenses spec, K1. What the receptionist made of a customer's message, and what they were after, were known
-- to the verb for a moment and kept nowhere. message_stamp_handled merges `handled` and `intent` into an inbound row's
-- meta, beside processed_at and never over it, the first answer standing. It is a door apart from mark_processed (00003):
-- the deadman sweep reads processed_at, so the two are written together and fail alone. Either deploy order works (an edge
-- ahead of this logs pg_handled_failed and carries on). No backfill: an older message reads unknown.

create or replace function public.message_stamp_handled(
  p_tenant_id  uuid,
  p_message_id uuid,
  p_handled    text,
  p_intent     text default null
)
returns void
language sql
security definer
set search_path = public
as $$
  update messages
     set meta = meta || jsonb_strip_nulls(jsonb_build_object('handled', left(p_handled, 20), 'intent', left(p_intent, 20)))
   where id = p_message_id
     and tenant_id = p_tenant_id
     and direction = 'inbound'
     and not (meta ? 'handled');
$$;

revoke all on function public.message_stamp_handled(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.message_stamp_handled(uuid, uuid, text, text) to service_role;

comment on function public.message_stamp_handled(uuid, uuid, text, text) is
  'What a customer''s message became (K1): meta.handled (ai, held, handoff or blocked: contracts HANDLED_OUTCOMES) and meta.intent where the model read it, merged beside processed_at, the first answer standing, inbound rows of the workspace named only. The edge calls it best-effort beside mark_processed.';
```

- [ ] **Step 4: Apply it and run the tests**

Run: `npx supabase migration up` (the local stack only), then `node tooling/scripts/checks/test.mjs --db tooling/scripts/tests/database/a-message-says-what-it-became.db.test.mjs` and `node tooling/scripts/checks/test.mjs --db tooling/scripts/tests/database/privileges.db.test.mjs`.
Expected: PASS (the privileges file proves the door is closed to `anon` and `authenticated`).

- [ ] **Step 5: Record the ledger, argue the gap, regenerate**

In `supabase/migrations-ledger.json`, add to `gaps`, after `"00268"` and in ascending order:

```json
    "00285": "held by Reports phase A (docs/superpowers/plans/2026-10-02-reports-a-the-numbers-say-what-they-count.md), on its own branch on 3 Oct 2026, and by another lane's uncommitted file; recorded when it lands",
    "00286": "held by Reports phase A (the same plan), on its own branch on 3 Oct 2026; recorded when it lands"
```

Then run the regeneration sequence (Global Constraints). Run `node tooling/scripts/checks/test.mjs tooling/scripts/tests/database/migrations.test.mjs` and `node tooling/scripts/checks/test.mjs tooling/scripts/tests/database/migration-ledger.test.mjs`.
Expected: PASS; `database.types.ts` now types `message_stamp_handled` (the in-memory database of later tasks refuses a function its schema lacks).

- [ ] **Step 6: Stage**

```bash
corepack pnpm exec prettier --write tooling/scripts/tests/database/a-message-says-what-it-became.db.test.mjs
git add supabase packages/db/src/database.types.ts packages/contracts/src/schema-sets.generated.ts tooling/scripts/tests/_unique-keys.generated.json docs/data-model.md tooling/scripts/tests/database/a-message-says-what-it-became.db.test.mjs
git add packages/contracts/dist packages/db/dist
```

---

### Task 2: The verb says what each message became (K1)

**Files:**
- Create: `packages/contracts/src/conversations/handled.ts`
- Modify: `packages/contracts/src/conversations/message-author.ts` (add `messageWhy`), `packages/contracts/src/conversations/index.ts` (export both), `packages/contracts/src/conversations/inbox-thread.ts:123`, `packages/contracts/src/conversations/conversation-vm.ts:94`
- Modify: `apps/dashboard/src/server/ask/tools/read/threads.ts:145`
- Modify: `packages/db/src/repositories/ingest.ts` (after `markProcessed`, line 160), `packages/db/src/index.ts` (the `./repositories/ingest` export list)
- Modify: `packages/core/src/inbound/ports.ts:186`, `ingest.ts:91,108`, `gates.ts:61,92,128,147,161`, `reply-gates.ts:52,102,134,150,171,193,219`, `unreadable.ts:47-81,98-99,146-147`, `turn.ts:40,61`, `dispatch.ts:128,155,191,197`
- Modify: `apps/edge/lib/whatsapp/persist.ts` (`PgStep` and `processed`, lines 182-193 and 300), `apps/edge/lib/log-events.ts` (after `"pg_escalation_failed"`)
- Create: `tooling/scripts/tests/whatsapp/sink-says-what-a-message-became.test.mjs`, `tooling/scripts/tests/conversations/message-why.test.mjs`
- Modify: `tooling/scripts/tests/whatsapp/inbound-executed.test.mjs`

**Interfaces:**
- Consumes: `message_stamp_handled` (Task 1, typed in `database.types.ts`).
- Produces: `HANDLED_OUTCOMES = ["ai", "held", "handoff", "blocked"] as const` and `type Handled` from `@chanlytics/contracts`; `messageWhy(m: Pick<MessageDto, "sender" | "meta">): ReplyWhyVM | null`; `stampHandled(db, tenantId: string, messageId: string, handled: Handled, intent: BrainIntent | null): Promise<void>` from `@chanlytics/db` (throws on an error, as `markProcessed` does); `InboundSink.processed(handled?: Handled, intent?: BrainIntent | null): Promise<unknown>`.

- [ ] **Step 1: Write the failing tests**

(a) Create `tooling/scripts/tests/whatsapp/sink-says-what-a-message-became.test.mjs`:

```js
/**
 * The receptionist's sink says what a message became, beside marking it processed (the Reports lenses spec, K1). Two
 * doors, each failing alone: a stamp the database refuses never costs the message its processed_at (the deadman
 * sweep reads it), and a processed_at that fails never costs the stamp. The doors are the real ones, stampHandled and
 * markProcessed, over a database in memory whose functions are the migrations' names; processed() resolves whatever
 * either did, as every sink method does.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { stampHandled } from "@chanlytics/db";
import { fakeDb } from "../_fake-db.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const { pgSink } = await import(pathToFileURL(path.join(ROOT, "apps/edge/lib/whatsapp/persist.ts")).href);

const T = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const M = "11111111-1111-4111-8111-111111111111";
const ing = {
  message_id: M,
  conversation_id: "22222222-2222-4222-8222-222222222222",
  contact_id: "33333333-3333-4333-8333-333333333333",
  is_new: true,
  processed: false,
  state: "open",
  paused_until: null,
};

/** A sink over a database whose two doors record what they were asked, and may refuse. */
function world(refuse = {}) {
  const calls = [];
  const db = fakeDb({}, {}, {
    mark_processed: (a) => {
      calls.push(["mark_processed", a]);
      if (refuse.processed) throw new Error(refuse.processed);
      return null;
    },
    message_stamp_handled: (a) => {
      calls.push(["message_stamp_handled", a]);
      if (refuse.stamp) throw new Error(refuse.stamp);
      return null;
    },
  });
  return { sink: pgSink(db, T, ing), calls, db };
}

test("processed(handled, intent) marks the message and says what it became, each through its own door", async () => {
  const w = world();
  await w.sink.processed("ai", "hours");
  assert.deepEqual(w.calls, [
    ["mark_processed", { p_tenant_id: T, p_message_id: M }],
    ["message_stamp_handled", { p_tenant_id: T, p_message_id: M, p_handled: "ai", p_intent: "hours" }],
  ]);
});

test("no intent is no argument, and no outcome is no stamp: a way out with nothing to say still marks the message", async () => {
  const w = world();
  await w.sink.processed("blocked");
  assert.deepEqual(w.calls.map((c) => c[0]), ["mark_processed", "message_stamp_handled"]);
  assert.equal("p_intent" in w.calls[1][1], false);
  const bare = world();
  await bare.sink.processed();
  assert.deepEqual(bare.calls.map((c) => c[0]), ["mark_processed"]);
});

test("a stamp the database refuses costs the message nothing: processed_at was written and processed() resolves", async () => {
  const w = world({ stamp: "connection reset" });
  await assert.doesNotReject(w.sink.processed("handoff", "money"));
  assert.deepEqual(w.calls.map((c) => c[0]), ["mark_processed", "message_stamp_handled"]);
});

test("a processed_at that fails costs the stamp nothing, and nothing is thrown", async () => {
  const w = world({ processed: "connection reset" });
  await assert.doesNotReject(w.sink.processed("ai", "hours"));
  assert.deepEqual(w.calls.map((c) => c[0]), ["mark_processed", "message_stamp_handled"]);
});

test("stampHandled asks the door by its names and throws what the database said", async () => {
  const w = world();
  await stampHandled(w.db, T, M, "held", null);
  assert.deepEqual(w.calls, [["message_stamp_handled", { p_tenant_id: T, p_message_id: M, p_handled: "held" }]]);
  const down = world({ stamp: "connection reset" });
  await assert.rejects(stampHandled(down.db, T, M, "ai", "hours"), /message_stamp_handled: connection reset/);
});
```

(b) Create `tooling/scripts/tests/conversations/message-why.test.mjs`:

```js
/**
 * Only the receptionist's own reply carries a why. Since 00287 a customer's inbound row carries an `intent` too (what
 * they were after, stamped when the receptionist read it): the Inbox, Conversations and Ask's thread tool must go on
 * saying nothing of reasoning beside a customer's words.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { messageWhy, toConversationVM } from "@chanlytics/contracts";

const ZONE = "America/New_York";
const NOW = new Date("2026-10-03T15:00:00Z");
const brain = { intent: "pricing", confidence: 0.62, reason: "asked a price", facts_used: [], language: "en", model: "m" };

test("a reply of the receptionist's has its why; a customer's message, a person's reply and a bare row have none", () => {
  const why = messageWhy({ sender: "ai", meta: brain });
  assert.equal(why.intent, "pricing");
  assert.equal(why.summary, "Pricing question · 62% sure");
  assert.equal(messageWhy({ sender: "customer", meta: { intent: "pricing", handled: "ai" } }), null);
  assert.equal(messageWhy({ sender: "human", meta: brain }), null);
  assert.equal(messageWhy({ sender: "ai", meta: null }), null);
});

test("Conversations draws a why beside the reply and none beside the customer's stamped message", () => {
  const msg = (over) => ({ id: "m", direction: "inbound", sender: "customer", type: "text", body: "hi", media: null, meta: null, status: "received", created_at: "2026-10-03T12:00:00Z", ...over });
  const vm = toConversationVM(
    {
      id: "c1",
      state: "open",
      paused_until: null,
      last_wa_inbound_at: "2026-10-03T12:00:00Z",
      last_message_at: "2026-10-03T12:00:41Z",
      contact: { id: "k1", display_name: null, wa_profile_name: null, phone_e164: "+15550139001" },
      messages: [
        msg({ id: "m1", meta: { raw_type: "text", processed_at: "2026-10-03T12:00:40Z", handled: "ai", intent: "pricing" } }),
        msg({ id: "m2", direction: "outbound", sender: "ai", body: "Gel refills are $40.", status: "sent", created_at: "2026-10-03T12:00:41Z", meta: brain }),
      ],
    },
    ZONE,
    NOW,
  );
  assert.equal(vm.messages[0].why, undefined, "the customer's message");
  assert.equal(vm.messages[1].why.intent, "pricing", "the receptionist's reply");
});
```

(c) In `tooling/scripts/tests/whatsapp/inbound-executed.test.mjs`:

1. Change the import `import { optInConfirmation, formatPhoneDisplay } from "@chanlytics/contracts";` to `import { optInConfirmation, formatPhoneDisplay, HANDLED_OUTCOMES } from "@chanlytics/contracts";` and `const { IngestFailed } = await import(at("apps/edge/lib/whatsapp/persist.ts"));` to `const { IngestFailed, pgSink } = await import(at("apps/edge/lib/whatsapp/persist.ts"));`.
2. In `world()`, add `handled: [], queued: [],` to `seen`. Replace the sink's `processed:` with:

```js
        // What the real sink does with it is sink-says-what-a-message-became.test.mjs's; a case may hand in the real one.
        processed: over.realProcessed
          ? over.realProcessed(ing)
          : async (how, intent) => {
              seen.processed += 1;
              seen.handled.push({ how: how ?? null, intent: intent ?? null });
            },
```

3. Replace `queueReply: async () => false,` with:

```js
      // A hold that can be written, when a case asks for one (`queue: true`): the draft's id, as queueDraft answers.
      queueReply: async (_db, _tenant, _ing, _to, body, delayMs, _L, source) => {
        if (!over.queue) return false;
        seen.queued.push({ body, delayMs, source });
        return "m-queued";
      },
```

4. In `run`, replace its final `return handleInbound(m, value, "t1", routed, !!over.isEnvDefault, over.carrier ?? null, { ...ports, ...extra });` (the body above it stays) with the following, so every case in the file is held to the one rule behind the stamps; a rejection (`IngestFailed`) propagates before the check:

```js
  const run = async (m, extra = {}) => {
    // ...the body above stays: the redelivery bookkeeping and the ingest wrapper...
    const before = { handled: seen.handled.length, escalations: seen.escalations.length };
    const out = await handleInbound(m, value, "t1", routed, !!over.isEnvDefault, over.carrier ?? null, {
      ...ports,
      ...extra,
    });
    // The rule behind every stamp (contracts HANDLED_OUTCOMES): a message is a handoff exactly when a person was
    // asked, and every way out says which of the four it was.
    const asked = seen.escalations.length > before.escalations;
    for (const s of seen.handled.slice(before.handled)) {
      assert.ok(HANDLED_OUTCOMES.includes(s.how), `${m.id}: a way out that says nothing of what the message became`);
      assert.equal(s.how === "handoff", asked, `${m.id}: handed to a person exactly when an escalation was opened (stamped ${s.how})`);
    }
    return out;
  };
```

5. Append at the end of the file:

```js
/* ------------------------------------- what each message became (K1) -------------------------------------- */

const handledOf = (w) => w.seen.handled.map((s) => [s.how, s.intent]);
const reply = (words, meta = sure, escalate = false) => ({
  brain: async () => ({ generateReply: async () => ({ text: words, escalate, meta, usage: { input_tokens: 40 } }) }),
});
const never = { brain: async () => { throw new Error("the model must not be asked"); } };
const refused = { outcome: "refused", reason: "paused", messageId: null };
const failed = { outcome: "failed", reason: "provider", status: 500, errorBody: null, messageId: null };

test("each way out says what the message became, and what it was about where the model read it; every outcome the set declares is reached and none it does not", async () => {
  const veto = runtime({ policy: { reply: { mode: "veto", limits: { reply_delay_ms: 60_000 } } } });
  const floor = runtime({ policy: { reply: { mode: "auto", limits: { min_confidence: 0.7, reply_delay_ms: 60_000 } } } });
  const live = { env: { modelKey: "sk-test" } };
  const cases = [
    ["a reply that left", world(live), text("when do you open?"), reply("We open at 9."), [["ai", "hours"]]],
    ["a reply that left and handed over", world(live), text("I want to speak to someone"), reply("A person will be in touch.", sure, true), [["handoff", "hours"]]],
    ["a reply waiting out the veto window", world({ ...live, rt: veto, queue: true }), text("when do you open?"), reply("We open at 9."), [["held", "hours"]]],
    ["a held reply that asks for a person", world({ ...live, rt: veto, queue: true }), text("I want to speak to someone"), reply("A person will be in touch.", sure, true), [["handoff", "hours"]]],
    ["a reply the confidence floor holds", world({ ...live, rt: floor, queue: true }), text("when do you open?"), reply("We open at 9.", { ...sure, confidence: 0.3 }), [["held", "hours"]]],
    ["a floor hold that could not be written", world({ ...live, rt: floor }), text("when do you open?"), reply("We open at 9.", { ...sure, confidence: 0.3 }), [["handoff", "hours"]]],
    ["a reply the wire refused", world({ ...live, delivered: refused }), text("when do you open?"), reply("We open at 9."), [["blocked", "hours"]]],
    ["a reply that could not be delivered stays unmarked", world({ ...live, delivered: failed }), text("when do you open?"), reply("We open at 9."), []],
    ["no model key: the holding message and a person", world(), text("hi"), {}, [["handoff", null]]],
    ["a thumbs-up", world(), { from: FROM, id: "wamid.like", type: "reaction", timestamp: String(Math.floor(Date.now() / 1000)), reaction: { message_id: "wamid.1", emoji: "\u{1F44D}" } }, {}, [["blocked", null]]],
    ["a short code", world(), text("Your code is 482913", "wamid.3", "12345"), {}, [["blocked", null]]],
    ["STOP", world(), text("STOP"), {}, [["handoff", null]]],
    ["a yes, confirmed", world(), text("START"), {}, [["ai", null]]],
    ["a yes whose confirmation did not go", world({ delivered: failed }), text("START"), {}, [["handoff", null]]],
    ["a workspace on ask", world({ rt: runtime({ policy: { reply: { mode: "ask", limits: {} } } }) }), text("can I book Friday?"), {}, [["handoff", null]]],
    ["the thread's turn is a newer message's", world({ ...live, turn: { claim: async () => false, holds: async () => true } }), text("when do you open?"), never, [["ai", null]]],
    ["the turn was taken while the model answered", world({ ...live, turn: { claim: async () => true, holds: async () => false } }), text("when do you open?"), reply("We open at 9."), [["ai", "hours"]]],
  ];
  const reached = new Set();
  for (const [name, w, message, extra, want] of cases) {
    await w.run(message, extra);
    assert.deepEqual(handledOf(w), want, name);
    for (const [how] of want) reached.add(how);
  }
  assert.deepEqual([...reached].sort(), [...HANDLED_OUTCOMES].sort(), "every declared outcome is stamped by some way out, and none that is not declared");
});

test("a thread a person holds sets a message aside, and a voice note on it: nobody is asked, so the stamp is blocked", async () => {
  const w = world();
  await w.run(text("hi, do you have time tomorrow?"));
  await w.run(text("hello?", "wamid.2"));
  await w.run({ from: FROM, id: "wamid.vn3", type: "audio", timestamp: String(Math.floor(Date.now() / 1000)), audio: { id: "a3", mime_type: "audio/ogg" } });
  assert.deepEqual(handledOf(w), [["handoff", null], ["blocked", null], ["blocked", null]]);
  assert.equal(w.seen.escalations.length, 1, "one hold, and nobody asked twice");
});

test("a stamp the database refuses never costs the customer their reply: the real sink's processed, over a database without the door", async () => {
  const doors = [];
  const db = fakeDb({}, {}, {
    mark_processed: () => {
      doors.push("mark_processed");
      return null;
    },
    message_stamp_handled: () => {
      doors.push("message_stamp_handled");
      throw new Error("connection reset");
    },
  });
  const w = world({ env: { modelKey: "sk-test" }, realProcessed: (ing) => pgSink(db, "t1", ing).processed });
  await w.run(text("when do you open?"), reply("We open at 9."));
  assert.deepEqual(w.seen.sent.map((m) => m.body), ["We open at 9."], "the reply left");
  assert.deepEqual(doors, ["mark_processed", "message_stamp_handled"], "processed_at was written, and the stamp was tried");
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `corepack pnpm --filter "./packages/*" build`, then, one per command: `node tooling/scripts/checks/test.mjs tooling/scripts/tests/whatsapp/sink-says-what-a-message-became.test.mjs`, `node tooling/scripts/checks/test.mjs tooling/scripts/tests/conversations/message-why.test.mjs`, `node tooling/scripts/checks/test.mjs tooling/scripts/tests/whatsapp/inbound-executed.test.mjs`.
Expected: FAIL — `stampHandled` and `messageWhy` are not exported, and every way out stamps nothing (`HANDLED_OUTCOMES` is undefined).

- [ ] **Step 3: Declare the four outcomes**

Create `packages/contracts/src/conversations/handled.ts`:

```ts
/**
 * What a customer's message became when the receptionist finished with it, stamped on the inbound row's meta as
 * `handled` (message_stamp_handled, 00287; the Reports lenses spec, K1). One meaning each, held by the verb's executed
 * test (inbound-executed.test.mjs): a message is a `handoff` exactly when an escalation was opened or refreshed for it.
 *
 *   ai       the receptionist answered it and nobody was asked: its reply left, or its thread's one reply covers it
 *            (a newer message of the thread took the turn, 00284)
 *   held     its reply was written and waits (the veto window, the confidence floor), and nobody was asked
 *   handoff  a person was asked: an escalation was opened or refreshed for it, whatever else went out beside it (a
 *            holding message, a confirmation that failed)
 *   blocked  nothing went out and nobody was asked: a rule set it aside (the person opted out, a person already holds
 *            the thread, a reaction or a system notice, a short code, a sender off the pilot allowlist, a send the
 *            wire refused)
 *
 * A message with no `handled` is unknown, not any of these: a row from before the stamp, an email (the receptionist
 * does not answer email), and a message the deadman sweep finished, whose outcome nobody recorded.
 */
export const HANDLED_OUTCOMES = ["ai", "held", "handoff", "blocked"] as const;
export type Handled = (typeof HANDLED_OUTCOMES)[number];
```

In `packages/contracts/src/conversations/index.ts`, add `export { HANDLED_OUTCOMES } from "./handled";` and `export type { Handled } from "./handled";`, and change `export { messageVia, messageAuthor } from "./message-author";` to `export { messageVia, messageAuthor, messageWhy } from "./message-author";`.

- [ ] **Step 4: One predicate for whose message carries a why**

In `packages/contracts/src/conversations/message-author.ts`, add `import { replyWhy, type ReplyWhyVM } from "../config/brain";` and append:

```ts
/**
 * The reasoning beside a message, for the messages that have any: only the receptionist's own replies carry it. A
 * customer's inbound row carries an `intent` too since 00287 (what they were after, stamped when the receptionist read
 * it), and that is the topic of their words, not why anyone said anything. The Inbox, Conversations and Ask's thread
 * tool say it here.
 */
export function messageWhy(m: Pick<MessageDto, "sender" | "meta">): ReplyWhyVM | null {
  return m.sender === "ai" ? replyWhy(m.meta) : null;
}
```

Replace the three call sites (add `messageWhy` to the existing import from `./message-author` in the two contracts files, and to the `@chanlytics/contracts` import in `threads.ts`, dropping `replyWhy` there if nothing else uses it):
- `inbox-thread.ts:123`: `const why = messageWhy(m);` (line 237's `replyWhy(draftMsg!.meta)` is a queued reply of the receptionist's: unchanged).
- `conversation-vm.ts:94`: `...(messageWhy(m) ? { why: messageWhy(m) as ReplyWhyVM } : {}),`
- `threads.ts:145`: `const why = messageWhy(m);` (the `as Record<string, unknown> | null` cast goes).

- [ ] **Step 5: Say it through the repository**

In `packages/db/src/repositories/ingest.ts`, add `type BrainIntent, type Handled` to the `@chanlytics/contracts` import and, after `markProcessed` (line 166), add:

```ts
/**
 * Say what a customer's message became (the Reports lenses spec, K1): `meta.handled` and, where the model read it,
 * `meta.intent`, merged into the row by message_stamp_handled beside processed_at, never over it, the first answer
 * standing. A door of its own, apart from markProcessed: processed_at is what the deadman sweep reads, so the two are
 * written together and fail alone. A failure throws, and the sink that calls it guards it (pgSafe), as it guards every
 * write of a message's bookkeeping.
 */
export async function stampHandled(
  db: Db,
  tenantId: string,
  messageId: string,
  handled: Handled,
  intent: BrainIntent | null,
): Promise<void> {
  const { error } = await db.rpc("message_stamp_handled", {
    p_tenant_id: tenantId,
    p_message_id: messageId,
    p_handled: handled,
    ...(intent ? { p_intent: intent } : {}),
  });
  if (error) throw new Error(`message_stamp_handled: ${error.message}`);
}
```

Add `stampHandled,` after `markProcessed,` in the `./repositories/ingest` export list of `packages/db/src/index.ts`.

- [ ] **Step 6: Give every way out its word**

In `packages/core/src/inbound/ports.ts`, add `BrainIntent` and `Handled` to the `@chanlytics/contracts` type import and replace line 186 with:

```ts
  /**
   * The message is finished with, and says what it became (contracts Handled) and, where the model read it, what it was
   * about; the adapter marks it processed and stamps both (K1). Both are optional so a caller with nothing to say still
   * marks it.
   */
  processed(handled?: Handled, intent?: BrainIntent | null): Promise<unknown>;
```

Then give each `sink.processed()` its argument. A way out is a `handoff` exactly when it asks a person (opens or refreshes an escalation):

| File:line | Way out | Argument |
| --- | --- | --- |
| `ingest.ts:91` | a short code: nothing can be sent back | `"blocked"` |
| `ingest.ts:108` | a sender off the pilot allowlist | `"blocked"` |
| `gates.ts:61` | the thread could not be read; escalated `state_unavailable` | `"handoff"` |
| `gates.ts:92` | opted out: `n.optOut` escalates `opt_out`, a later message from an opted-out person does not | `n.optOut ? "handoff" : "blocked"` |
| `gates.ts:128` | the carriers' hold; escalated | `"handoff"` |
| `gates.ts:147` | a reaction or a system notice: nothing was asked | `"blocked"` |
| `gates.ts:161` | a pin drop or a contact card; escalated `non_text` | `"handoff"` |
| `unreadable.ts:99` | not words, said unreadable | `said.escalated ? "handoff" : "blocked"` |
| `unreadable.ts:147` | a photo it meant to read and could not | `said.escalated ? "handoff" : "blocked"` |
| `reply-gates.ts:52` | too late to answer; escalated `stale` | `"handoff"` |
| `reply-gates.ts:102` | a yes, confirmed in the campaign's words | `confirmed.outcome === "sent" ? "ai" : "handoff"` (a failed one escalates `send_failed`) |
| `reply-gates.ts:134` | the thread is paused: a person holds it, nothing escalated | `"blocked"` |
| `reply-gates.ts:150` | the day's reply cap; escalated | `"handoff"` |
| `reply-gates.ts:171` | the model budget; escalated | `"handoff"` |
| `reply-gates.ts:193` | the workspace is paused; escalated | `"handoff"` |
| `reply-gates.ts:219` | held by policy (ask, a person's own mode, no persona); escalated | `"handoff"` |
| `turn.ts:40` | a newer message of the thread holds the turn: its reply covers this one's words | `"ai"` |
| `turn.ts:61` | the same, once the model had answered | `"ai", t.brainMeta?.intent ?? null` |
| `dispatch.ts:128` | the floor hold could not be written; escalated `policy_block` | `"handoff", brainMeta?.intent ?? null` |
| `dispatch.ts:155` | the reply is queued | `escalate ? "handoff" : "held", brainMeta?.intent ?? null` |
| `dispatch.ts:191` | the reply left | `escalate ? "handoff" : "ai", brainMeta?.intent ?? null` |
| `dispatch.ts:197` | the wire refused it | `"blocked", brainMeta?.intent ?? null` |

A send that failed (`dispatch.ts`, the `else` after line 197) calls no `processed()`, as before: the message stays visibly unprocessed for reconciliation, and nothing is stamped.

In `packages/core/src/inbound/unreadable.ts`, `sayUnreadable` (lines 47-81) now answers `Promise<{ pausedUntil: number; escalated: boolean }>`: its early return (`Date.now() <= pausedUntilNow`: the thread is a person's, and it says nothing and asks nobody) is `{ pausedUntil: 0, escalated: false }`, its end `{ pausedUntil, escalated: true }` (the `non_text` escalation is unconditional past that return). Update its comment to say so, and have `unreadableGate` and `photoOf` keep the answer as `said` for the table above. Nothing else reads its old number.

- [ ] **Step 7: The edge's sink writes both**

In `apps/edge/lib/whatsapp/persist.ts`: import `stampHandled` beside `markProcessed` and `type BrainIntent, type Handled` beside `BrainMeta, SendPurpose`; add `| "handled"` to `PgStep` after `"escalation"`; replace the `processed:` line (300) with:

```ts
    /**
     * The message is finished with: marked processed (the deadman sweep reads it), and, when the way out says what it
     * became, stamped with that (K1). Two doors in parallel, each guarded alone, so a stamp the database refuses
     * never costs the message its processed_at and the reverse.
     */
    processed: (handled?: Handled, intent?: BrainIntent | null) =>
      on
        ? Promise.all([
            pgSafe("processed", () => markProcessed(db, tenantId, ing.message_id)),
            handled
              ? pgSafe("handled", () => stampHandled(db, tenantId, ing.message_id, handled, intent ?? null))
              : undefined,
          ])
        : Promise.resolve(),
```

In `apps/edge/lib/log-events.ts`, add `"pg_handled_failed",` after `"pg_escalation_failed",` (the set is sorted; `repo/log-events.test.mjs` holds the name both ways).

- [ ] **Step 8: Run the tests to verify they pass**

Run: `corepack pnpm --filter "./packages/*" build`, then, one per command: `tooling/scripts/tests/whatsapp/sink-says-what-a-message-became.test.mjs`, `tooling/scripts/tests/conversations/message-why.test.mjs`, `tooling/scripts/tests/whatsapp/inbound-executed.test.mjs`, `tooling/scripts/tests/conversations/conversation-vm.test.mjs`, `tooling/scripts/tests/repo/log-events.test.mjs`, `tooling/scripts/tests/whatsapp/whatsapp-door.test.mjs`, `tooling/scripts/tests/whatsapp/ingest-failed.test.mjs`, `tooling/scripts/tests/edge/log-envelope.test.mjs` (each `node tooling/scripts/checks/test.mjs <file>`), then `corepack pnpm -r typecheck`.
Expected: PASS. The invariant added to `run` holds every existing case of `inbound-executed.test.mjs` to the rule too: a way out that forgot its argument, or a handoff with no escalation, fails there by message id.

- [ ] **Step 9: Stage**

```bash
corepack pnpm exec prettier --write packages/contracts/src/conversations packages/db/src/repositories/ingest.ts packages/db/src/index.ts packages/core/src/inbound apps/edge/lib/whatsapp/persist.ts apps/edge/lib/log-events.ts apps/dashboard/src/server/ask/tools/read/threads.ts tooling/scripts/tests/whatsapp/sink-says-what-a-message-became.test.mjs tooling/scripts/tests/whatsapp/inbound-executed.test.mjs tooling/scripts/tests/conversations/message-why.test.mjs
git add packages apps/edge/lib apps/dashboard/src/server/ask/tools/read/threads.ts tooling/scripts/tests/whatsapp tooling/scripts/tests/conversations/message-why.test.mjs
```

---

### Task 3: A call's topic and language (K2)

**Files:**
- Modify: `packages/channels/src/voice/voice-shell.ts` (the import at line 34, `CALL_ANALYSIS_FIELDS` at 319-369, the drift sentence at 447)
- Modify: `tooling/scripts/tests/voice/calls/call-outcomes.test.mjs:231-274`, `tooling/scripts/tests/voice/voice-provision.test.mjs:78-81`
- Create: `tooling/scripts/tests/voice/calls/a-call-keeps-its-topic-and-language.db.test.mjs`
- Modify: `docs/system-prd.md:358`

**Interfaces:**
- Produces: `CALL_ANALYSIS_FIELDS` of seven: the five it has, then `topic` (`type: "enum"`, `choices: [...BRAIN_INTENTS]`) and `language` (`type: "enum"`, `choices: [...BRAIN_LANGUAGES]`), appended so the five keep their order.
- How the fields reach Retell (found, not assumed): a **new agent** gets them on create, from `voiceAgentCreateBody` (`voice-provision.ts:122`). An **existing agent** gets them only through the converger: `planAgentSettings` sees the seven fields against the agent's live `post_call_analysis_data` and plans a patch that keeps any field of a stranger's first and appends ours. It is applied by `tooling/scripts/ops/voice-converge.mjs` or by `POST /api/admin/voice-converge` (a platform door, a dry run by default; a published version cannot change, so the patch goes on a new draft, and a pinned line follows only when asked to publish), and `/api/diag` reports `voiceAgents[].drift` until it is. So this change needs no sync code, only the fields: running the converger is Ruben's production step (Task 9), never this plan's. The answers land in `calls.analysis` with no migration (`ingest_call` keeps the analysis whole, 00164:`v_analysis`).

- [ ] **Step 1: Write the failing tests**

In `tooling/scripts/tests/voice/calls/call-outcomes.test.mjs`, add `BRAIN_INTENTS, BRAIN_LANGUAGES` to the `@chanlytics/contracts` import and replace the opening of the test "the agent's analysis fields: …" (line 231), from its `test(` line through the end of its `for (const f of CALL_ANALYSIS_FIELDS) { … }` loop (the line before `assert.ok(CALL_ANALYSIS_FIELDS[0].description.includes("never with 'The user'")`), with:

```js
test("the agent's analysis fields: each has a type, a name and a description; each enum's choices are a closed set the product already has, and its description says what each choice means; the planner adds them, keeps a stranger's field, and re-sends one that changed", () => {
  assert.deepEqual(
    CALL_ANALYSIS_FIELDS.map((f) => f.name),
    ["caller_wanted", "outcome", "follow_up", "caller_name", "caller_email", "topic", "language"],
  );
  const closed = { outcome: CALL_OUTCOMES, topic: BRAIN_INTENTS, language: BRAIN_LANGUAGES };
  for (const f of CALL_ANALYSIS_FIELDS) {
    assert.ok(["string", "enum"].includes(f.type) && f.name && f.description.length > 20, f.name);
    if (f.type === "enum") {
      assert.deepEqual([...f.choices], [...closed[f.name]], `${f.name}: the closed set the product already has`);
      for (const c of f.choices) assert.ok(f.description.includes(`${c}:`), `${f.name} says what ${c} means`);
    }
    if (f.type === "string") assert.ok(f.examples.length >= 2, `${f.name} shows the analyst the shape`);
  }
```

(the rest of that test, from `assert.ok(CALL_ANALYSIS_FIELDS[0].description.includes("never with 'The user'")…` on, is unchanged: its stranger-and-converged cases hold for seven fields as they did for five). Append these tests after it:

```js
test("an agent that has the five fields it had is told it lacks topic and language, and the plan adds them without touching the rest", () => {
  const converged = {
    webhook_events: [...VOICE_WEBHOOK_EVENTS],
    webhook_timeout_ms: 20000,
    opt_in_signed_url: true,
    data_storage_retention_days: null,
  };
  const stranger = { type: "system-presets", name: "call_summary" };
  const plan = planAgentSettings({
    ...converged,
    post_call_analysis_data: [stranger, ...CALL_ANALYSIS_FIELDS.slice(0, 5).map((f) => ({ ...f }))],
  });
  assert.match(plan.drift[0], /^post_call_analysis_data lacks topic, language /);
  assert.deepEqual(Object.keys(plan.agentPatch), ["post_call_analysis_data"], "nothing else is touched");
  assert.deepEqual(
    plan.agentPatch.post_call_analysis_data.map((f) => f.name),
    ["call_summary", ...CALL_ANALYSIS_FIELDS.map((f) => f.name)],
    "the stranger first, then the seven, in order",
  );
  const done = planAgentSettings({ ...converged, post_call_analysis_data: plan.agentPatch.post_call_analysis_data });
  assert.equal(done.agentPatch, null, "applied once, the agent is converged: the converger is idempotent");
});

test("a call's topic and language ride the normalised call into the door as the analysis, beside the fields that become columns", () => {
  const n = normalizeCall({
    call_id: "c9",
    call_analysis: {
      custom_analysis_data: { caller_wanted: "Asked a price.", outcome: "answered", topic: "pricing", language: "es" },
    },
  });
  assert.deepEqual(n.analysis, { caller_wanted: "Asked a price.", outcome: "answered", topic: "pricing", language: "es" });
});
```

In `tooling/scripts/tests/voice/voice-provision.test.mjs`, change the expected names (line 80) to `["caller_wanted", "outcome", "follow_up", "caller_name", "caller_email", "topic", "language"]`.

Create `tooling/scripts/tests/voice/calls/a-call-keeps-its-topic-and-language.db.test.mjs`:

```js
/**
 * A call's topic and language land in calls.analysis with no migration (the Reports lenses spec, K2): ingest_call keeps
 * the provider's custom analysis whole, beside the four answers it files as columns, and a retried call_ended that
 * carries none must not blank them. Runs against the database `supabase start` builds on this machine, never production.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";

const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const skip =
  !URL_ || !KEY
    ? "no database in env"
    : !/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(URL_)
      ? "refusing a database that is not on this machine: this suite writes calls"
      : false;

const stamp = Date.now();
let db;
let tenantId;
const ok = (res) => {
  assert.equal(res.error, null, res.error?.message);
  return res.data;
};

before(async () => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
  tenantId = ok(
    await db.from("tenants").insert({ slug: `harbor-topic-${stamp}`, name: "Harbor Topic" }).select("id").single(),
  ).id;
});

after(async () => {
  if (skip) return;
  if (tenantId) {
    await db.from("events").delete().eq("tenant_id", tenantId);
    await db.from("tenants").delete().eq("id", tenantId);
  }
});

/** An ended call as the webhook ingests it; `analysis` rides as the door's last argument when there is one. */
const ingest = (analysis) =>
  db.rpc("ingest_call", {
    p_tenant_id: tenantId,
    p_retell_call_id: `topic_${stamp}`,
    p_agent_id: null,
    p_from_e164: "+15550139301",
    p_from_raw: "+15550139301",
    p_to_e164: null,
    p_direction: "inbound",
    p_call_type: "phone_call",
    p_status: "ended",
    p_started_at: new Date().toISOString(),
    p_ended_at: new Date().toISOString(),
    p_duration_ms: 42_000,
    p_disconnection: null,
    p_sentiment: null,
    p_successful: null,
    p_in_voicemail: false,
    p_summary: null,
    p_transcript: null,
    p_transcript_obj: null,
    p_recording: null,
    p_public_log_url: null,
    p_cost: {},
    p_latency: {},
    p_raw: {},
    ...(analysis ? { p_analysis: analysis } : {}),
  });

test("topic and language land in calls.analysis beside the columns, and a retried end that carries none keeps them", { skip }, async () => {
  const analysis = {
    caller_wanted: "Asked what a gel refill costs.",
    outcome: "answered",
    follow_up: "",
    caller_name: "",
    topic: "pricing",
    language: "es",
  };
  const first = ok(await ingest(analysis));
  const row = async () =>
    ok(await db.from("calls").select("analysis, wanted, outcome").eq("id", first.call_id).single());
  let call = await row();
  assert.equal(call.analysis.topic, "pricing");
  assert.equal(call.analysis.language, "es");
  assert.deepEqual([call.wanted, call.outcome], ["Asked what a gel refill costs.", "answered"], "the columns are filed as before");
  ok(await ingest(null));
  call = await row();
  assert.deepEqual([call.analysis.topic, call.analysis.language], ["pricing", "es"], "a retry with no analysis blanks nothing");
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `corepack pnpm --filter "./packages/*" build`, then `node tooling/scripts/checks/test.mjs tooling/scripts/tests/voice/calls/call-outcomes.test.mjs` and `node tooling/scripts/checks/test.mjs tooling/scripts/tests/voice/voice-provision.test.mjs`.
Expected: FAIL — the names list is the five, `topic` and `language` are lacking. (The database file already passes: it proves the door needs no change; it is the one that must keep passing.)

- [ ] **Step 3: Add the two fields**

In `packages/channels/src/voice/voice-shell.ts`, change the import to `import { BRAIN_INTENTS, BRAIN_LANGUAGES, CALL_OUTCOMES, greetingFor, GREETING_DEFAULT } from "@chanlytics/contracts";`. Append to `CALL_ANALYSIS_FIELDS`, after the `caller_email` entry, in this order:

```ts
  {
    type: "enum",
    name: "topic",
    description:
      "What the call was mainly about. booking: they wanted to book, move or cancel a visit. pricing: they asked what something costs. money: a refund, a discount, a deposit, a payment plan or any other negotiation of what they pay. hours: when the business is open. services: what the business offers. location: where it is or how to get there. complaint: they were unhappy about something. smalltalk: a greeting or a chat with no request. other: none of these.",
    choices: [...BRAIN_INTENTS],
  },
  {
    type: "enum",
    name: "language",
    description: "The language the caller mostly spoke. en: English. es: Spanish. other: any other language.",
    choices: [...BRAIN_LANGUAGES],
  },
```

Say so in the field list's comment (lines 319-329): after "the email address they spelled out" add ", what the call was mainly about and the language it was spoken in (Reports read both, as the receptionist's texts carry the same two: contracts BRAIN_INTENTS, BRAIN_LANGUAGES)", and change "the first four as columns, the address inside the analysis it keeps whole" to "the first four as columns, the rest inside the analysis it keeps whole (calls.analysis)". In `planAgentSettings`, change the drift sentence's parenthesis (line 447) to `(the strip, the profile, the call card and Reports read what the call was about)`.

In `docs/system-prd.md:358`, change "the post-call analysis fields (`caller_wanted`, `outcome`, `follow_up`, `caller_name`, `caller_email`)" to "the post-call analysis fields (`caller_wanted`, `outcome`, `follow_up`, `caller_name`, `caller_email`, `topic`, `language`)".

- [ ] **Step 4: Run the tests to verify they pass**

Run: `corepack pnpm --filter "./packages/*" build`, then, one per command: `tooling/scripts/tests/voice/calls/call-outcomes.test.mjs`, `tooling/scripts/tests/voice/voice-provision.test.mjs`, `tooling/scripts/tests/voice/agent-settings.test.mjs`, `tooling/scripts/tests/voice/voice-doors.test.mjs`, `tooling/scripts/tests/edge/diag-door.test.mjs` (each `node tooling/scripts/checks/test.mjs <file>`), then with the stack `node tooling/scripts/checks/test.mjs --db tooling/scripts/tests/voice/calls/a-call-keeps-its-topic-and-language.db.test.mjs`.
Expected: PASS. `voice-doors.test.mjs` runs the converge endpoint over a provider in memory: its drifted agent now plans the seven fields, by the same plan, and a converged agent plans nothing.

- [ ] **Step 5: Stage**

```bash
corepack pnpm exec prettier --write packages/channels/src/voice/voice-shell.ts tooling/scripts/tests/voice/calls/call-outcomes.test.mjs tooling/scripts/tests/voice/voice-provision.test.mjs tooling/scripts/tests/voice/calls/a-call-keeps-its-topic-and-language.db.test.mjs
git add packages/channels docs/system-prd.md tooling/scripts/tests/voice
```

---

### Task 4: A person keeps how they first reached the workspace (migration 00288)

**Files:**
- Create: `supabase/migrations/00288_a_person_keeps_how_they_first_reached_us.sql`
- Create: `tooling/scripts/tests/database/a-person-keeps-how-they-first-reached-us.db.test.mjs`
- Regenerate: the files the regeneration sequence names (this one adds a CHECK, so `gen:schema-sets` changes `schema-sets.generated.ts`)

**Interfaces:**
- Produces (SQL): `contacts.acquired_via text` (null, or one of `whatsapp`, `sms`, `email`, `call`, `ad`, `calendar`, `import`, `lead`, `manual`: `contacts_acquired_via_check`, read by tiles as `SchemaSet<"contacts.acquired_via">`), `contacts.acquired_ref text` (null, or 1-200 characters and only with a via: `contacts_acquired_ref_check`); `public.person_set_first_touch(p_tenant_id uuid, p_contact_id uuid, p_via text, p_ref text default null, p_made_at timestamptz default null) returns boolean` (service role only; true when it wrote): sets both where `acquired_via is null` and, when `p_made_at` is given, only where the person's `created_at` is exactly it; triggers `messages_note_first_touch` (an inbound customer message on `whatsapp`, `sms` or `email`, not a backfilled one) and `calls_note_first_touch` (an inbound call whose first row is `ongoing` or `ended`) call the door with the new row's own `created_at`.
- The meta keys it reads, written by Task 5: `meta.line` (a `tenant_channels.id`) and `meta.referral.source_id`. A message without them is stamped by its wire alone.

- [ ] **Step 1: Write the failing database test**

Create `tooling/scripts/tests/database/a-person-keeps-how-they-first-reached-us.db.test.mjs`:

```js
/**
 * 00288 on a real Postgres: a person keeps how they first reached the workspace (the Reports lenses spec, K3), written
 * once, by the message or call that made them. The touch that made a person is told by their own row, written in the
 * same transaction (one now(): their created_at is the message's), so a person who existed before it, a redelivered
 * message and a later touch stamp nothing; a stamp that cannot be written costs nobody their message. The writers are
 * the real ones: ingest_inbound and ingest_call, whose bodies this change does not restate. Runs against the database
 * `supabase start` builds on this machine, never production.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";

const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const skip =
  !URL_ || !KEY
    ? "no database in env"
    : !/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(URL_)
      ? "refusing a database that is not on this machine: this suite writes people, messages and calls"
      : false;

const stamp = Date.now();
const agent = `agent_first_touch_${stamp}`;
let db;
let tenantId;
let waLine;
let voiceLine;
let seq = 0;
const ok = (res) => {
  assert.equal(res.error, null, res.error?.message);
  return res.data;
};
const newPhone = () => `+1555013${9100 + ++seq}`;

before(async () => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
  tenantId = ok(
    await db.from("tenants").insert({ slug: `harbor-first-touch-${stamp}`, name: "Harbor First Touch" }).select("id").single(),
  ).id;
  waLine = ok(
    await db.from("tenant_channels").insert({ tenant_id: tenantId, kind: "whatsapp", external_id: `pn-${stamp}` }).select("id").single(),
  ).id;
  voiceLine = ok(
    await db.from("tenant_channels").insert({ tenant_id: tenantId, kind: "voice", external_id: agent }).select("id").single(),
  ).id;
});

after(async () => {
  if (skip) return;
  if (tenantId) {
    await db.from("events").delete().eq("tenant_id", tenantId);
    await db.from("tenants").delete().eq("id", tenantId);
  }
});

/** An inbound customer message, taken in as the edge takes it in; its meta is what Task 5's pgIngest writes. */
async function arrive({ channel = "whatsapp", meta, number = newPhone(), external } = {}) {
  seq += 1;
  const mail = channel === "email";
  return ok(
    await db.rpc("ingest_inbound", {
      p_tenant_id: tenantId,
      p_channel: channel,
      p_identity_external_id: mail ? `guest${seq}@example.com` : number.slice(1),
      p_phone_e164: mail ? null : number,
      p_wa_profile_name: null,
      p_message_external_id: external ?? `ft.${stamp}.${seq}`,
      p_type: "text",
      p_body: "hello",
      p_channel_ts: null,
      p_media: null,
      p_meta: meta ?? { raw_type: "text", line: waLine },
      p_opt_out: false,
      p_opt_in: false,
    }),
  );
}
/** A call event as the webhook ingests it. */
const call = (id, status, from) =>
  db.rpc("ingest_call", {
    p_tenant_id: tenantId,
    p_retell_call_id: `ft-${id}-${stamp}`,
    p_agent_id: agent,
    p_from_e164: from,
    p_from_raw: from,
    p_to_e164: null,
    p_direction: "inbound",
    p_call_type: "phone_call",
    p_status: status,
    p_started_at: new Date().toISOString(),
    p_ended_at: null,
    p_duration_ms: null,
    p_disconnection: null,
    p_sentiment: null,
    p_successful: null,
    p_in_voicemail: false,
    p_summary: null,
    p_transcript: null,
    p_transcript_obj: null,
    p_recording: null,
    p_public_log_url: null,
    p_cost: {},
    p_latency: {},
    p_raw: {},
  });
const touchOf = async (contactId) => {
  const c = ok(await db.from("contacts").select("acquired_via, acquired_ref").eq("id", contactId).single());
  return [c.acquired_via, c.acquired_ref];
};

test("the message that made the person is their first touch: its wire, and the line it came in on", { skip }, async () => {
  const chat = await arrive();
  assert.deepEqual(await touchOf(chat.contact_id), ["whatsapp", waLine]);
  const text = await arrive({ channel: "sms", meta: { raw_type: "text" } });
  assert.deepEqual(await touchOf(text.contact_id), ["sms", null], "a text names no line unless the edge did");
  const mail = await arrive({ channel: "email", meta: { raw_type: "text" } });
  assert.deepEqual(await touchOf(mail.contact_id), ["email", null], "an email names no line");
});

test("a click-to-chat ad is the first touch of the person it brought, by the ad's id; a referral that names none is not one", { skip }, async () => {
  const ad = await arrive({
    meta: { raw_type: "text", line: waLine, referral: { source_id: "120200000000001", source_type: "ad" } },
  });
  assert.deepEqual(await touchOf(ad.contact_id), ["ad", "120200000000001"]);
  const blank = await arrive({ meta: { raw_type: "text", line: waLine, referral: { source_id: "  " } } });
  assert.deepEqual(await touchOf(blank.contact_id), ["whatsapp", waLine]);
});

test("the first value wins: a later touch on another wire changes nothing, and a redelivered first message makes no one", { skip }, async () => {
  const number = newPhone();
  const external = `ft.redelivered.${stamp}`;
  const first = await arrive({ number, external });
  const later = await arrive({ number, channel: "sms", meta: { raw_type: "text" } });
  assert.equal(later.contact_id, first.contact_id, "the same person");
  assert.deepEqual(await touchOf(first.contact_id), ["whatsapp", waLine]);
  const again = await arrive({ number, external });
  assert.equal(again.is_new, false, "a redelivery");
  assert.deepEqual(await touchOf(first.contact_id), ["whatsapp", waLine]);
});

test("a person who existed before the message is not stamped by it: unknown stays unknown", { skip }, async () => {
  const number = newPhone();
  const old = ok(await db.from("contacts").insert({ tenant_id: tenantId, phone_e164: number }).select("id").single());
  const r = await arrive({ number });
  assert.equal(r.contact_id, old.id);
  assert.deepEqual(await touchOf(old.id), [null, null]);
});

test("a stamp that cannot be written costs the person's message nothing: it lands, and the person has no first touch", { skip }, async () => {
  const r = await arrive({ meta: { raw_type: "text", line: "x".repeat(300) } });
  const message = ok(await db.from("messages").select("id, direction").eq("id", r.message_id).single());
  assert.equal(message.direction, "inbound", "the message is on record");
  assert.deepEqual(await touchOf(r.contact_id), [null, null], "an id no line has is no stamp, and a warning in the database's log");
});

test("a call that connected is its caller's first touch, on the line it rang; one that never did, and a person who existed, are not", { skip }, async () => {
  const from = newPhone();
  const rang = ok(await call("a", "ongoing", from));
  assert.deepEqual(await touchOf(rang.contact_id), ["call", voiceLine]);
  ok(await call("a", "ended", from));
  assert.deepEqual(await touchOf(rang.contact_id), ["call", voiceLine], "a later event of the same call changes nothing");

  const missedNumber = newPhone();
  const missed = ok(await call("b", "not_connected", missedNumber));
  assert.deepEqual(await touchOf(missed.contact_id), [null, null], "a call that never connected is no first touch");
  const spoke = await arrive({ number: missedNumber });
  assert.equal(spoke.contact_id, missed.contact_id);
  assert.deepEqual(
    await touchOf(missed.contact_id),
    [null, null],
    "and the message that follows did not make them: unknown stays unknown, read as before",
  );

  const old = ok(await db.from("contacts").insert({ tenant_id: tenantId, phone_e164: newPhone() }).select("id, phone_e164").single());
  const ringing = ok(await call("c", "ended", old.phone_e164));
  assert.equal(ringing.contact_id, old.id);
  assert.deepEqual(await touchOf(old.id), [null, null], "a person who existed is not made by a call");
});

test("the door: the first value wins, a touch that did not make the person stamps nothing, and the set is closed", { skip }, async () => {
  const c = ok(await db.from("contacts").insert({ tenant_id: tenantId, phone_e164: newPhone() }).select("id, created_at").single());
  const door = (id, via, ref = null, madeAt = null) =>
    db.rpc("person_set_first_touch", { p_tenant_id: tenantId, p_contact_id: id, p_via: via, p_ref: ref, p_made_at: madeAt });
  const later = new Date(Date.parse(c.created_at) + 1).toISOString();
  assert.equal(ok(await door(c.id, "import", null, later)), false, "not the row that made them");
  assert.equal(ok(await door(c.id, "import", null, c.created_at)), true);
  assert.equal(ok(await door(c.id, "manual")), false, "the first value wins");
  assert.deepEqual(await touchOf(c.id), ["import", null]);
  const fresh = ok(await db.from("contacts").insert({ tenant_id: tenantId, phone_e164: newPhone() }).select("id").single());
  const bad = await door(fresh.id, "carrier_pigeon");
  assert.match(bad.error?.message ?? "", /contacts_acquired_via_check/, "a way no one declared is refused");
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node tooling/scripts/checks/test.mjs --db tooling/scripts/tests/database/a-person-keeps-how-they-first-reached-us.db.test.mjs`
Expected: FAIL — `column contacts.acquired_via does not exist`.

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/00288_a_person_keeps_how_they_first_reached_us.sql`:

```sql
-- 00288 · A person keeps how they first reached the workspace.
--
-- The Reports lenses spec, K3. People works "where they first reached you" out when it reads, and nothing says which line
-- or which ad. Now contacts.acquired_via (whatsapp, sms, email, call, ad; from 00289 calendar, import, lead, manual) and
-- acquired_ref (the line, a tenant_channels id, or the ad's id; never the person) are written once, through
-- person_set_first_touch, by the message or call that made the person. A person and the first message or call that made
-- them are written in one transaction, so their created_at are one now(), and anyone who existed before (imported, added,
-- made by an earlier call) is never stamped by it. The triggers run inside ingest_inbound and ingest_call (neither
-- restated) and trap their own failure as lead_link_contact (00140) does: a warning and a person with no first touch,
-- never a lost message. A call counts when its first row is ongoing or ended (a subset of main's connected-call rule and
-- of phase A's call_connected); a person made by a call that never connected stays unknown. No backfill; the erasure
-- tombstone keeps both columns (neither identifies anyone). Either deploy order works. Triggers on messages and calls lock
-- them until commit: the lock guard of 00259. Every statement re-runs.
set local lock_timeout = '3s';
do $$
begin
  raise notice 'lock_timeout for this migration: %', current_setting('lock_timeout');
  if current_setting('lock_timeout') <> '3s' then
    raise warning 'this file was applied outside a transaction, so SET LOCAL did nothing: run it inside begin/commit, or set lock_timeout yourself before it';
  end if;
end $$;

/* ------------------------------------------------------------ 1. the columns -- */

alter table public.contacts add column if not exists acquired_via text;
alter table public.contacts add column if not exists acquired_ref text;

comment on column public.contacts.acquired_via is
  'How the person first reached the workspace, written once (person_set_first_touch): whatsapp, sms, email or call for the wire of the message or call that made them, ad for a WhatsApp click-to-chat ad, calendar, import, lead or manual for the door that added them (00289). Null for a person from before it was kept, and wherever nothing says: unknown, never a guess.';
comment on column public.contacts.acquired_ref is
  'The line (tenant_channels.id) or the ad (Meta''s source id) the person first came through; null where nothing says. Never the person.';

-- Added only when absent, and validated after: the columns are new and null, so no row can fail either.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'contacts_acquired_via_check' and conrelid = 'public.contacts'::regclass) then
    alter table public.contacts add constraint contacts_acquired_via_check
      check (acquired_via is null or acquired_via in ('whatsapp', 'sms', 'email', 'call', 'ad', 'calendar', 'import', 'lead', 'manual')) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'contacts_acquired_ref_check' and conrelid = 'public.contacts'::regclass) then
    alter table public.contacts add constraint contacts_acquired_ref_check
      check (acquired_ref is null or (acquired_via is not null and char_length(acquired_ref) between 1 and 200)) not valid;
  end if;
end $$;
alter table public.contacts validate constraint contacts_acquired_via_check;
alter table public.contacts validate constraint contacts_acquired_ref_check;

/* ----------------------------------------------------------------- 2. the door -- */

-- The one place a first touch is written. p_made_at, when given, names the instant of the row that made the person
-- (a message's or a call's created_at): the touch counts only if the person's own created_at is that instant, which it
-- is exactly when the two were written in one transaction. A caller that made the person itself (a door that just
-- added them) passes none.
create or replace function public.person_set_first_touch(
  p_tenant_id  uuid,
  p_contact_id uuid,
  p_via        text,
  p_ref        text default null,
  p_made_at    timestamptz default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update contacts
     set acquired_via = p_via,
         acquired_ref = nullif(btrim(p_ref), '')
   where id = p_contact_id
     and tenant_id = p_tenant_id
     and acquired_via is null
     and (p_made_at is null or created_at = p_made_at);
  return found;
end $$;

revoke all on function public.person_set_first_touch(uuid, uuid, text, text, timestamptz) from public, anon, authenticated;
grant execute on function public.person_set_first_touch(uuid, uuid, text, text, timestamptz) to service_role;
comment on function public.person_set_first_touch(uuid, uuid, text, text, timestamptz) is
  'A person''s first touch (K3), written once: sets acquired_via and acquired_ref where acquired_via is null and, when p_made_at is given, only where the person''s created_at is that instant (the row that made them was written in the same transaction). True when it wrote. Called by the message, call and contact.added triggers; the closed set is contacts_acquired_via_check.';

/* --------------------------------------------------- 3. the message and the call -- */

create or replace function public.messages_note_first_touch()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ad text := nullif(btrim(NEW.meta #>> '{referral,source_id}'), '');
begin
  perform public.person_set_first_touch(
    NEW.tenant_id,
    NEW.contact_id,
    case when v_ad is not null then 'ad' else NEW.channel end,
    case when v_ad is not null then v_ad else NEW.meta ->> 'line' end,
    NEW.created_at
  );
  return null;
exception when others then
  raise warning 'messages_note_first_touch: %', sqlerrm;
  return null;
end $$;

revoke execute on function public.messages_note_first_touch() from public, anon, authenticated;
comment on function public.messages_note_first_touch() is
  'The first touch of the person an inbound customer message made (K3): its wire, or the ad it came from (meta.referral.source_id), with the line it came in on (meta.line). Never fails the insert: a failure is a warning.';

drop trigger if exists messages_note_first_touch on public.messages;
create trigger messages_note_first_touch after insert on public.messages
  for each row
  when (new.direction = 'inbound' and new.sender = 'customer' and new.contact_id is not null
        and new.channel in ('whatsapp', 'sms', 'email')
        and coalesce(new.meta ->> 'backfill', 'false') <> 'true')
  execute function public.messages_note_first_touch();

create or replace function public.calls_note_first_touch()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.person_set_first_touch(NEW.tenant_id, NEW.contact_id, 'call', NEW.channel_id::text, NEW.created_at);
  return null;
exception when others then
  raise warning 'calls_note_first_touch: %', sqlerrm;
  return null;
end $$;

revoke execute on function public.calls_note_first_touch() from public, anon, authenticated;
comment on function public.calls_note_first_touch() is
  'The first touch of the person an inbound call made (K3): a call, on the line it rang (calls.channel_id), once the call''s first row is ongoing or ended. Never fails the insert: a failure is a warning.';

drop trigger if exists calls_note_first_touch on public.calls;
create trigger calls_note_first_touch after insert on public.calls
  for each row
  when (new.direction = 'inbound' and new.contact_id is not null and new.status in ('ongoing', 'ended'))
  execute function public.calls_note_first_touch();
```

- [ ] **Step 4: Apply it and run the tests**

Run: `npx supabase migration up`, then `node tooling/scripts/checks/test.mjs --db tooling/scripts/tests/database/a-person-keeps-how-they-first-reached-us.db.test.mjs`, then the suites that write the same tables: `node tooling/scripts/checks/test.mjs --db tooling/scripts/tests/database/privileges.db.test.mjs`, `tooling/scripts/tests/database/event-shapes.db.test.mjs` (needs `SUPABASE_ANON_KEY`), `tooling/scripts/tests/voice/calls/call-own-line.db.test.mjs`, `tooling/scripts/tests/whatsapp/echo-replay.db.test.mjs`, `tooling/scripts/tests/database/people-are-paged-by-their-kept-moments.db.test.mjs`.
Expected: PASS. A trigger that cost an ingest anything would fail the last four.

- [ ] **Step 5: Record and regenerate**

Run the regeneration sequence. `corepack pnpm gen:schema-sets` adds `"contacts.acquired_via"` to `schema-sets.generated.ts`; nothing hand-keeps the list (tiles read `SchemaSet<"contacts.acquired_via">`), so no line is added to `shared/schema-sets.ts`. Run `tooling/scripts/tests/database/migrations.test.mjs` and `tooling/scripts/tests/database/generated/unique-keys.db.test.mjs`.
Expected: PASS.

- [ ] **Step 6: Stage**

```bash
corepack pnpm exec prettier --write tooling/scripts/tests/database/a-person-keeps-how-they-first-reached-us.db.test.mjs
git add supabase packages/db/src/database.types.ts packages/contracts/src/schema-sets.generated.ts tooling/scripts/tests/_unique-keys.generated.json docs/data-model.md tooling/scripts/tests/database/a-person-keeps-how-they-first-reached-us.db.test.mjs
git add packages/contracts/dist packages/db/dist
```

---

### Task 5: The line and the ad travel with the message (K3, the webhook)

**Files:**
- Modify: `packages/channels/src/whatsapp.ts` (`WaRawMessage` at 19, `NormalizedInbound` at 66, `normalizeInbound` at 126)
- Modify: `packages/core/src/inbound/ports.ts:239-244`, `context.ts:23-78` (`openInbound`'s returned object), `ingest.ts:38`
- Modify: `apps/edge/lib/whatsapp/persist.ts:151-179` (`pgIngest`)
- Create: `tooling/scripts/tests/whatsapp/ad-referral.test.mjs`
- Modify: `tooling/scripts/tests/whatsapp/inbound-executed.test.mjs`

**Interfaces:**
- Produces: `NormalizedInbound.referral: { sourceId: string; sourceType: string | null } | null` (only `source_id` and `source_type` of Meta's `messages[].referral` are kept; the headline, link and click id never are; an id that is blank or over 200 characters is none); `InboundPorts.persist.ingest(db, tenantId, n, channel?, line?: string | null)`, the verb passing `routed?.channelId ?? null`; `pgIngest(db, tenantId, n, channel = "whatsapp", line: string | null = null)` writing `meta: { raw_type, line?, referral?: { source_id, source_type } }` (absent keys, never nulls, so a message with neither is exactly what it was). Task 4's trigger reads `meta.line` and `meta.referral.source_id`.
- Either deploy order: an older database ignores the two keys (a message from the new edge is stamped by its wire alone); an older edge writes neither.

- [ ] **Step 1: Write the failing tests**

Create `tooling/scripts/tests/whatsapp/ad-referral.test.mjs`:

```js
/**
 * The ad a person clicked to write (the Reports lenses spec, K3): Meta names it in messages[].referral, and the edge
 * keeps its id and kind, nothing else, and writes them with the line the message came in on into the inbound row's
 * meta, where the database's first-touch trigger (00288) reads them. A message with neither writes neither key.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { normalizeInbound } from "@chanlytics/channels";
import { fakeDb } from "../_fake-db.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const { pgIngest } = await import(pathToFileURL(path.join(ROOT, "apps/edge/lib/whatsapp/persist.ts")).href);

const FROM = "15550139401";
const message = (over = {}) => ({
  from: FROM,
  id: "wamid.ad.1",
  type: "text",
  timestamp: "1790000000",
  text: { body: "Hi, I saw your ad" },
  ...over,
});
const value = { metadata: { phone_number_id: "p1" }, contacts: [{ wa_id: FROM, profile: { name: "Dana" } }] };
const T = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const LINE = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

test("the ad is kept by its id and kind, and nothing else of Meta's referral", () => {
  const n = normalizeInbound(
    message({
      referral: {
        source_id: "120200000000001",
        source_type: "ad",
        headline: "Spring gel refills",
        source_url: "https://fb.example/ad/1",
        ctwa_clid: "click-id",
      },
    }),
    value,
  );
  assert.deepEqual(n.referral, { sourceId: "120200000000001", sourceType: "ad" });
});

test("a message with no referral, a blank id or an id no column could keep has none", () => {
  assert.equal(normalizeInbound(message(), value).referral, null);
  assert.equal(normalizeInbound(message({ referral: { source_id: "  ", source_type: "ad" } }), value).referral, null);
  assert.equal(normalizeInbound(message({ referral: { source_type: "ad" } }), value).referral, null);
  assert.equal(
    normalizeInbound(message({ referral: { source_id: "9".repeat(201), source_type: "ad" } }), value).referral,
    null,
    "an id that long is not one: the stamp would be refused, so the wire stamps the person instead",
  );
  assert.deepEqual(
    normalizeInbound(message({ referral: { source_id: "77" } }), value).referral,
    { sourceId: "77", sourceType: null },
    "a kind Meta did not say is none",
  );
});

function world() {
  const metas = [];
  const db = fakeDb({}, {}, {
    ingest_inbound: (a) => {
      metas.push(a.p_meta);
      return { message_id: "m1", conversation_id: "c1", contact_id: "k1", is_new: true, processed: false, state: "open", paused_until: null };
    },
  });
  return { db, metas };
}

test("pgIngest writes the line and the ad into the row's meta, beside the ingest's own key, and nothing for what a message does not have", async () => {
  const w = world();
  await pgIngest(w.db, T, normalizeInbound(message({ referral: { source_id: "120200000000001", source_type: "ad" } }), value), "whatsapp", LINE);
  await pgIngest(w.db, T, normalizeInbound(message({ id: "wamid.ad.2" }), value), "whatsapp", LINE);
  await pgIngest(w.db, T, normalizeInbound(message({ id: "wamid.ad.3" }), value));
  assert.deepEqual(w.metas, [
    { raw_type: "text", line: LINE, referral: { source_id: "120200000000001", source_type: "ad" } },
    { raw_type: "text", line: LINE },
    { raw_type: "text" },
  ]);
});
```

In `tooling/scripts/tests/whatsapp/inbound-executed.test.mjs`, add `lines: [],` to `seen`; in `run`, change the ingest wrapper to `ports.persist.ingest = async (db, tenant, n, channel, line) => { seen.lines.push(line ?? null); … }` (the rest of it unchanged); and append:

```js
test("the line a message came in on travels with its ingest, for the first touch the database stamps (K3)", async () => {
  const w = world();
  await w.run(text("hi"));
  assert.deepEqual(w.seen.lines, ["c1"], "the routed channel's id: the line that took the message");
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `corepack pnpm --filter "./packages/*" build`, then `node tooling/scripts/checks/test.mjs tooling/scripts/tests/whatsapp/ad-referral.test.mjs` and `node tooling/scripts/checks/test.mjs tooling/scripts/tests/whatsapp/inbound-executed.test.mjs`.
Expected: FAIL — `n.referral` is `undefined`, `pgIngest` writes only `raw_type`, and the verb passes no line.

- [ ] **Step 3: Keep the ad, write it down, carry the line**

In `packages/channels/src/whatsapp.ts`: add to `WaRawMessage` `referral?: { source_id?: string; source_type?: string };` with the comment "Present when the person came in through a click-to-WhatsApp ad or post: Meta names it (`source_id`) and says what it was (`source_type`). The rest of it (headline, link, click id) is never kept."; add to `NormalizedInbound` `referral: { sourceId: string; sourceType: string | null } | null;` ("the ad or post this person clicked to write, when Meta says: its id and kind (K3)"); and, private to the module, `const REFERRAL_ID_MAX = 200;` (said to be contacts_acquired_ref_check's own 200) and `function adReferralOf(r: WaRawMessage["referral"]): NormalizedInbound["referral"]` returning `null` unless `source_id` is a string whose trimmed text is 1 to `REFERRAL_ID_MAX` characters, else `{ sourceId: trimmed, sourceType: <the trimmed source_type, or null when blank or absent> }`. `normalizeInbound` adds `referral: adReferralOf(m.referral),` to its returned object.

In `packages/core/src/inbound/ports.ts`, the `persist.ingest` signature gains a last parameter `line?: string | null` (comment: "the line the message came in on, a tenant_channels id: the first touch of the person it makes carries it"). In `context.ts`, `openInbound` returns `routed` beside `isEnvDefault` (it is already in its input). In `ingest.ts:38`, `ingestOrSay` passes it: `ports.persist.ingest(db, tenantId, n, channel, cx.routed?.channelId ?? null)`.

In `apps/edge/lib/whatsapp/persist.ts`, `pgIngest` takes `line: string | null = null` after `channel` and writes:

```ts
      meta: {
        raw_type: n.rawType,
        // K3: the line it came in on and the ad it came from ride in the row's meta, where the database's own trigger
        // (00288) reads them for the first touch of the person this message made. Absent keys, never nulls.
        ...(line ? { line } : {}),
        ...(n.referral ? { referral: { source_id: n.referral.sourceId, source_type: n.referral.sourceType } } : {}),
      },
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `corepack pnpm --filter "./packages/*" build`, `corepack pnpm -r typecheck`, then, one per command: `tooling/scripts/tests/whatsapp/ad-referral.test.mjs`, `tooling/scripts/tests/whatsapp/inbound-executed.test.mjs`, `tooling/scripts/tests/whatsapp/whatsapp-door.test.mjs`, `tooling/scripts/tests/whatsapp/whatsapp-steps.test.mjs`, `tooling/scripts/tests/sms/sms-door.test.mjs`, `tooling/scripts/tests/repo/hygiene.test.mjs` (each `node tooling/scripts/checks/test.mjs <file>`).
Expected: PASS.

- [ ] **Step 5: Stage**

```bash
corepack pnpm exec prettier --write packages/channels/src/whatsapp.ts packages/core/src/inbound apps/edge/lib/whatsapp/persist.ts tooling/scripts/tests/whatsapp/ad-referral.test.mjs tooling/scripts/tests/whatsapp/inbound-executed.test.mjs
git add packages apps/edge/lib/whatsapp tooling/scripts/tests/whatsapp
```

---

### Task 6: A person added at a door keeps how (migration 00289)

**Files:**
- Create: `supabase/migrations/00289_a_person_added_at_a_door_keeps_how.sql`
- Create: `tooling/scripts/tests/database/a-person-added-at-a-door-keeps-how.db.test.mjs`
- Regenerate: the files the regeneration sequence names

**Interfaces:**
- Consumes: `person_set_first_touch` (Task 4).
- Produces: trigger `events_note_first_touch` on `events` (after insert, only a `contact.added` event about a contact): it reads the event's `source` and calls the door with `calendar`, `lead` or `import` for those words and `manual` for any other (the same mapping as People's `came_from`), the lead's id as the ref for a lead where the event names one. No writer of `contact.added` (the calendar sweep, `create_person`, `import_person`, `lead_set_stage`, `reach_out_person`, `lead_link_contact`) is restated.

- [ ] **Step 1: Write the failing database test**

Create `tooling/scripts/tests/database/a-person-added-at-a-door-keeps-how.db.test.mjs`:

```js
/**
 * 00289 on a real Postgres: a person added at a door keeps the door's word as their first touch (the Reports lenses
 * spec, K3). Every writer of a person who did not write or phone first (the calendar sweep, create_person,
 * import_person, a lead converted) already declares how in the contact.added event it inserts beside them; the trigger
 * reads that event, so none of those writers is restated, and the first value wins as everywhere else. The event is
 * inserted here as each writer inserts it. event-shapes.db.test.mjs runs the real SQL writers over the same trigger.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";

const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const skip =
  !URL_ || !KEY
    ? "no database in env"
    : !/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(URL_)
      ? "refusing a database that is not on this machine: this suite writes people and events"
      : false;

const stamp = Date.now();
let db;
let tenantId;
let seq = 0;
const ok = (res) => {
  assert.equal(res.error, null, res.error?.message);
  return res.data;
};

before(async () => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
  tenantId = ok(
    await db.from("tenants").insert({ slug: `harbor-door-${stamp}`, name: "Harbor Door" }).select("id").single(),
  ).id;
});

after(async () => {
  if (skip) return;
  if (tenantId) {
    await db.from("events").delete().eq("tenant_id", tenantId);
    await db.from("tenants").delete().eq("id", tenantId);
  }
});

const person = async () =>
  ok(await db.from("contacts").insert({ tenant_id: tenantId, phone_e164: `+1555013${9200 + ++seq}` }).select("id").single()).id;
const added = async (id, data, kind = "contact.added") =>
  ok(await db.from("events").insert({ tenant_id: tenantId, kind, category: "contact", subject_type: "contact", subject_id: id, data }));
const touchOf = async (id) => {
  const c = ok(await db.from("contacts").select("acquired_via, acquired_ref").eq("id", id).single());
  return [c.acquired_via, c.acquired_ref];
};

test("the door's word is the person's first touch: calendar, lead (with its lead), import, and manual for any other", { skip }, async () => {
  const lead = "9f2c1b1e-0000-4000-8000-000000000001";
  for (const [data, want] of [
    [{ source: "calendar", title: "Gel refill", uid: "ics-1" }, ["calendar", null]],
    [{ source: "lead", lead_id: lead }, ["lead", lead]],
    [{ source: "lead" }, ["lead", null]],
    [{ source: "import", by: "u1" }, ["import", null]],
    [{ source: "manual", title: null, by: "u1" }, ["manual", null]],
    [{ source: "front_desk" }, ["manual", null]],
    [{}, ["manual", null]],
  ]) {
    const id = await person();
    await added(id, data);
    assert.deepEqual(await touchOf(id), want, JSON.stringify(data));
  }
});

test("the first value wins: a second door's event, or a message's stamp already there, changes nothing", { skip }, async () => {
  const id = await person();
  await added(id, { source: "import" });
  await added(id, { source: "calendar" });
  assert.deepEqual(await touchOf(id), ["import", null]);

  const spoke = ok(
    await db.rpc("ingest_inbound", {
      p_tenant_id: tenantId,
      p_channel: "whatsapp",
      p_identity_external_id: "15550139299",
      p_phone_e164: "+15550139299",
      p_wa_profile_name: null,
      p_message_external_id: `door.${stamp}`,
      p_type: "text",
      p_body: "hello",
      p_channel_ts: null,
      p_media: null,
      p_meta: { raw_type: "text" },
      p_opt_out: false,
      p_opt_in: false,
    }),
  );
  await added(spoke.contact_id, { source: "import" });
  assert.deepEqual(await touchOf(spoke.contact_id), ["whatsapp", null], "the message that made them came first");
});

test("an event of another kind, and an event about a person who is not there, stamp nothing and fail nothing", { skip }, async () => {
  const id = await person();
  await added(id, { source: "import" }, "contact.named");
  assert.deepEqual(await touchOf(id), [null, null]);
  await added("00000000-0000-4000-8000-000000000000", { source: "import" });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node tooling/scripts/checks/test.mjs --db tooling/scripts/tests/database/a-person-added-at-a-door-keeps-how.db.test.mjs`
Expected: FAIL — the first test reads `[null, null]` for every door.

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/00289_a_person_added_at_a_door_keeps_how.sql`:

```sql
-- 00289 · A person added at a door keeps how.
--
-- The Reports lenses spec, K3, the other half. A person added at a door (the calendar sweep, create_person, import_person,
-- lead_set_stage, reach_out_person, lead_link_contact) is already declared by the contact.added event their writer
-- inserts, whose `source` is calendar, lead, import or the hand's own word. This trigger reads that event and calls
-- 00288's door (calendar, lead and import as themselves, anything else manual, as People's came_from reads it; a lead's id
-- as the ref), so no writer is restated. Cuttable: without it these people read null and People works their source out
-- from the same event, as today. It traps its own failure and fires only for a contact.added row. Either deploy order
-- works. A trigger on events locks its partitions until commit: the lock guard of 00259. Every statement re-runs.
set local lock_timeout = '3s';
do $$
begin
  raise notice 'lock_timeout for this migration: %', current_setting('lock_timeout');
  if current_setting('lock_timeout') <> '3s' then
    raise warning 'this file was applied outside a transaction, so SET LOCAL did nothing: run it inside begin/commit, or set lock_timeout yourself before it';
  end if;
end $$;

create or replace function public.events_note_first_touch()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_source text := coalesce(nullif(btrim(NEW.data ->> 'source'), ''), 'manual');
begin
  perform public.person_set_first_touch(
    NEW.tenant_id,
    NEW.subject_id,
    case v_source when 'calendar' then 'calendar' when 'lead' then 'lead' when 'import' then 'import' else 'manual' end,
    case when v_source = 'lead' then NEW.data ->> 'lead_id' end
  );
  return null;
exception when others then
  raise warning 'events_note_first_touch: %', sqlerrm;
  return null;
end $$;

revoke execute on function public.events_note_first_touch() from public, anon, authenticated;
comment on function public.events_note_first_touch() is
  'The first touch of a person added at a door (K3): the source of the contact.added event beside them (calendar, lead, import, else manual), through person_set_first_touch. Never fails the event''s writer: a failure is a warning.';

drop trigger if exists events_note_first_touch on public.events;
create trigger events_note_first_touch after insert on public.events
  for each row
  when (new.kind = 'contact.added' and new.subject_type = 'contact' and new.subject_id is not null)
  execute function public.events_note_first_touch();
```

- [ ] **Step 4: Apply it and run the tests**

Run: `npx supabase migration up`, then `node tooling/scripts/checks/test.mjs --db tooling/scripts/tests/database/a-person-added-at-a-door-keeps-how.db.test.mjs`, `tooling/scripts/tests/database/event-shapes.db.test.mjs` (the real `create_person`, `import_person`, `lead_set_stage`, `reach_out_person` and `lead_link_contact` writers, needing `SUPABASE_ANON_KEY`), `tooling/scripts/tests/database/privileges.db.test.mjs`, `tooling/scripts/tests/database/a-person-keeps-how-they-first-reached-us.db.test.mjs`, and `node tooling/scripts/checks/test.mjs tooling/scripts/tests/repo/event-kinds.test.mjs`.
Expected: PASS. The migration inserts no event, so the event-kinds lint is unchanged.

- [ ] **Step 5: Record and regenerate**

Run the regeneration sequence; `node tooling/scripts/checks/test.mjs tooling/scripts/tests/database/migrations.test.mjs`.
Expected: PASS.

- [ ] **Step 6: Stage**

```bash
corepack pnpm exec prettier --write tooling/scripts/tests/database/a-person-added-at-a-door-keeps-how.db.test.mjs
git add supabase packages/db/src/database.types.ts packages/contracts/src/schema-sets.generated.ts tooling/scripts/tests/_unique-keys.generated.json docs/data-model.md tooling/scripts/tests/database/a-person-added-at-a-door-keeps-how.db.test.mjs
git add packages/contracts/dist packages/db/dist
```

---

### Task 7: An escalation keeps when it ended and why it changed (K4, migration 00290)

**Files:**
- Create: `supabase/migrations/00290_an_escalation_keeps_when_it_ended_and_why_it_changed.sql`
- Modify: `packages/contracts/src/shared/enums.ts` (`EVENT_KINDS`, after `"conversation.snooze_expired"`, line 219)
- Modify: `packages/contracts/src/workspace/activity.ts` (`ACTIVITY_NOISE_PREFIXES` at 55, `WORDS` after `"conversation.snooze_expired"` at 137), `packages/contracts/src/workspace/retention.ts` (the comment above `EVENT_EVIDENCE_KINDS`)
- Modify: `tooling/scripts/tests/conversations/escalations/an-escalation-opens-and-resolves-once.db.test.mjs`, `tooling/scripts/tests/conversations/escalations/escalation-outcome.db.test.mjs`, `tooling/scripts/tests/workspace/activity.test.mjs:133-138`
- Regenerate: the files the regeneration sequence names

**Interfaces:**
- Produces: `escalations.resolved_at timestamptz` (null while open, and for every row resolved before this; set once, by the trigger `escalations_stamp_resolved`, when `state` goes from `open` to `resolved`, whichever writer does it); event kind `escalation.changed` (declared in `EVENT_KINDS`, written by the trigger `escalations_note_change` when a reason replaces another): subject `escalation` and the row's id, category `conversation`, data `{ from, to }` (reasons from `ESCALATION_REASONS`, never the words). An opening or a refresh of the same reason writes none. `first_replies` is not touched: Task 8 says why.
- The writers are exactly the ones the spec names and the tests below run: `upsertEscalation` (`packages/jobs/src/escalate.ts:30-93`, which tells `changed` from `refreshed` by row count and cannot say what the reason was), `resolveOpenEscalation` (`apps/dashboard/src/server/verbs.ts:237-254`, for a reply and a hand-back) and `escalationPorts.resolve` (`apps/dashboard/src/server/ports/core-ports.ts:83-91`, the explicit resolve). None is edited: a trigger holds all three, and a fourth.

- [ ] **Step 1: Write the failing tests**

In `tooling/scripts/tests/conversations/escalations/an-escalation-opens-and-resolves-once.db.test.mjs`:

1. Add `resolved_at` to the select list of `escalationsOf`: `.select("id, reason, details, state, resolved_by_user_id, decision_id, resolved_at")`.
2. At the top of the test body, add `const startedAt = Date.now() - 5_000;`.
3. After `assert.equal(await sink.escalate("human_token", "Asked for a person."), "opened");` and its `rows` read, add `assert.equal(rows[0].resolved_at, null, "an open hold has not ended");`.
4. After `const first = rows[0];`, add:

```js
    const changes = async () =>
      ok(
        await db
          .from("events")
          .select("subject_type, subject_id, category, data")
          .eq("tenant_id", T)
          .eq("kind", "escalation.changed")
          .order("created_at"),
      );
    assert.deepEqual(
      await changes(),
      [{ subject_type: "escalation", subject_id: first.id, category: "conversation", data: { from: "human_token", to: "policy_ask" } }],
      "the opening and the refresh wrote none; the replacement wrote one, with what it replaced",
    );
```

5. After the hand-back's `rows` assertion (the `[[first.id, "resolved", owner.userId, back.decision_id]]` one), add:

```js
    const resolvedAt = rows[0].resolved_at;
    assert.ok(Date.parse(resolvedAt) >= startedAt, "the hand-back stamped when the hold ended");
```

6. After the stale-resolve assertions (before "The customer asks for a person again"), add:

```js
    ok(
      await db
        .from("escalations")
        .update({ deadman_alerted_at: new Date().toISOString() })
        .eq("id", first.id),
    );
    assert.equal(
      (await escalationsOf(ing.conversation_id))[0].resolved_at,
      resolvedAt,
      "once: a refused resolve and a later update leave the first moment",
    );
```

7. After the final resolve-by-hand `rows` assertion, add `assert.ok(rows.every((r) => Date.parse(r.resolved_at) >= startedAt), "both writers stamp: the hand-back's and the explicit resolve");` and `assert.equal((await changes()).length, 1, "and no resolve wrote a change");`.

In `tooling/scripts/tests/conversations/escalations/escalation-outcome.db.test.mjs`: in the first test, after `assert.equal(count, 1, "one row throughout: this is a replacement, not a queue");` add:

```js
    const row = (await db.from("escalations").select("id, resolved_at").eq("conversation_id", id).single()).data;
    assert.equal(row.resolved_at, null, "still open");
    const { data: changes } = await db
      .from("events")
      .select("subject_id, data")
      .eq("tenant_id", tenantId)
      .eq("kind", "escalation.changed")
      .eq("subject_id", row.id)
      .order("created_at");
    assert.deepEqual(
      changes.map((c) => c.data),
      [
        { from: "carriers", to: "email_review" },
        { from: "email_review", to: "carriers" },
      ],
      "an opening wrote none, a refresh wrote none, and each replacement said what it replaced, back and forth",
    );
```

In the second test ("a resolved hold is out of the way"), after the `upsertEscalation(... "email_review" …)` assertion add:

```js
    const { data: rows } = await db.from("escalations").select("state, resolved_at").eq("conversation_id", id).order("created_at");
    assert.deepEqual(rows.map((r) => [r.state, r.resolved_at !== null]), [["resolved", true], ["open", false]], "the one a person dealt with ended; the new one has not");
```

and in its `after`-level cleanup (the file's `after`), add `await db.from("events").delete().eq("tenant_id", tenantId);` before the tenant delete: the ledger has no foreign key to a workspace, so a change event would outlive it.

In `tooling/scripts/tests/workspace/activity.test.mjs`, after `assert.equal(isActivityNoise("message.received"), false);` (line 138) add:

```js
  assert.equal(activityWords("escalation.changed", { from: "rate_cap", to: "budget" }), "A handover's reason changed");
  assert.equal(
    isActivityNoise("escalation.changed"),
    true,
    "a record Reports reads, not something that happened to the owner: hidden unless asked for by name",
  );
```

- [ ] **Step 2: Run them to verify they fail**

Run: `node tooling/scripts/checks/test.mjs --db tooling/scripts/tests/conversations/escalations/an-escalation-opens-and-resolves-once.db.test.mjs` (needs `SUPABASE_ANON_KEY`), `node tooling/scripts/checks/test.mjs --db tooling/scripts/tests/conversations/escalations/escalation-outcome.db.test.mjs`, `node tooling/scripts/checks/test.mjs tooling/scripts/tests/workspace/activity.test.mjs`.
Expected: FAIL — `column escalations.resolved_at does not exist`; the activity sentence reads "Escalation · changed".

- [ ] **Step 3: Declare the kind and keep it out of the Activity page**

In `packages/contracts/src/shared/enums.ts`, after `"conversation.snooze_expired",` add:

```ts
  /** A handover's reason was replaced by another while it was open (00290): { from, to }, reasons only, never the words. */
  "escalation.changed",
```

In `packages/contracts/src/workspace/activity.ts`: add `"escalation."` to `ACTIVITY_NOISE_PREFIXES` (`["usage.", "webhook.", "ingest.", "escalation."]`) and change its comment to: "Ledger families that are evidence rather than activity, and a record kept for Reports that no owner reads as activity (escalation.): hidden unless asked for by name." Add `"escalation.changed": "A handover's reason changed",` to `WORDS` after `"conversation.snooze_expired"`. In `retention.ts`, in the comment above `EVENT_EVIDENCE_KINDS`, change "the activity log hides the same families unless asked by name (ACTIVITY_NOISE_PREFIXES)" to "the activity log hides the same families unless asked by name (ACTIVITY_NOISE_PREFIXES), and escalation.changed beside them: a record, kept, that no owner reads as activity".

- [ ] **Step 4: Write the migration**

Create `supabase/migrations/00290_an_escalation_keeps_when_it_ended_and_why_it_changed.sql`:

```sql
-- 00290 · An escalation keeps when it ended, and why it changed.
--
-- The Reports lenses spec, K4. A thread has one open escalation, so a new reason replaces the old on the same row, and
-- resolving it sets a state and not a time: both histories were lost. Now escalations.resolved_at is stamped once by a
-- trigger when state goes from open to resolved, so every writer is held (a row cannot reopen: escalations_guard, 00106),
-- and an escalation.changed { from, to } event is written when a reason replaces another (an opening or a refresh writes
-- none). Triggers, not the TypeScript writers: OLD is the row's own, which a read before the write could not promise. The
-- event's insert traps its own failure: a failed replacement is a hold with a stale reason and nobody told, the worse
-- failure (upsertEscalation's comments). No backfill: a row resolved before reads null, never zero. Either deploy order works.

alter table public.escalations add column if not exists resolved_at timestamptz;

comment on column public.escalations.resolved_at is
  'When the escalation was resolved (K4), stamped once by escalations_stamp_resolved when state goes from open to resolved. Null while open, and for every row resolved before 00290: unknown, never zero.';

create or replace function public.escalations_stamp_resolved()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if OLD.state = 'open' and NEW.state = 'resolved' and NEW.resolved_at is null then
    NEW.resolved_at := now();
  end if;
  return NEW;
end $$;

drop trigger if exists escalations_stamp_resolved on public.escalations;
create trigger escalations_stamp_resolved before update of state on public.escalations
  for each row execute function public.escalations_stamp_resolved();
comment on function public.escalations_stamp_resolved() is
  'Stamps resolved_at once, when state goes from open to resolved, whoever writes it (K4).';

create or replace function public.escalations_note_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
  values (NEW.tenant_id, 'escalation.changed', 'conversation', 'escalation', NEW.id,
          jsonb_build_object('from', OLD.reason, 'to', NEW.reason));
  return null;
exception when others then
  raise warning 'escalations_note_change: %', sqlerrm;
  return null;
end $$;

revoke execute on function public.escalations_note_change() from public, anon, authenticated;
comment on function public.escalations_note_change() is
  'Writes escalation.changed { from, to } when a reason replaces another on an escalation (K4). Never fails the update: a failure is a warning.';

drop trigger if exists escalations_note_change on public.escalations;
create trigger escalations_note_change after update of reason on public.escalations
  for each row when (old.reason is distinct from new.reason)
  execute function public.escalations_note_change();
```

- [ ] **Step 5: Apply it and run the tests**

Run: `npx supabase migration up`, `corepack pnpm --filter "./packages/*" build`, then the three files of Step 2, and `tooling/scripts/tests/database/state-guards.db.test.mjs`, `tooling/scripts/tests/database/privileges.db.test.mjs`, `tooling/scripts/tests/database/each-workspace-is-told-what-changed.db.test.mjs` (`--db`), `tooling/scripts/tests/repo/event-kinds.test.mjs`, `tooling/scripts/tests/ops/retention-words.test.mjs` (plain).
Expected: PASS. `event-kinds.test.mjs` finds `escalation.changed` emitted by this migration's `insert into public.events` and declared in `EVENT_KINDS`, both ways.

- [ ] **Step 6: Record and regenerate**

Run the regeneration sequence; `node tooling/scripts/checks/test.mjs tooling/scripts/tests/database/migrations.test.mjs`.
Expected: PASS.

- [ ] **Step 7: Stage**

```bash
corepack pnpm exec prettier --write packages/contracts/src/shared/enums.ts packages/contracts/src/workspace/activity.ts packages/contracts/src/workspace/retention.ts tooling/scripts/tests/conversations/escalations tooling/scripts/tests/workspace/activity.test.mjs
git add supabase packages tooling/scripts/tests/_unique-keys.generated.json tooling/scripts/tests/conversations/escalations tooling/scripts/tests/workspace/activity.test.mjs docs/data-model.md
```

---

### Task 8: The person's wait, as `first_replies` already says it (K4)

**Files:**
- Create: `tooling/scripts/tests/reports/first-replies-person-wait.db.test.mjs`

**Interfaces:**
- Consumes: `public.first_replies(p_tenant_id, p_start)` as main has it (`00250_…:310`) and as Reports phase A's `00285` redefines it: both return `asked_at`, `conversation_id`, `ai_at`, `human_at`, `who`, `ai_seconds`. Neither is edited here.
- Produces: nothing in code. The spec's `human_seconds` is `human_at − asked_at`, and both are already columns; this task pins that, for the "You, after a handover" tile (C1), against a later redefinition of the function.
- **Why no column.** A `human_seconds` column changes `first_replies`' return type, which Postgres lets only a drop and create do, and phase A's `00285` does exactly that to add `ai_hold_s`. Two files each restating the function on two branches is the order-dependent overwrite the ledger exists to prevent: whichever applied last would drop the other's column. Adding the column is one small migration after phase A has landed (its body then restates `00285`'s), if Ruben wants the difference computed in SQL; a tile that subtracts needs nothing.

- [ ] **Step 1: Write the test**

Create `tooling/scripts/tests/reports/first-replies-person-wait.db.test.mjs`:

```js
/**
 * "You, after a handover" (the Reports lenses spec, K4) is read from first_replies, which already says when the customer
 * asked (asked_at) and when a person first replied (human_at): the person's wait is their difference, whoever answered
 * first. This pins that reading against a later redefinition of the function (Reports phase A's 00285 restates it): a
 * person's reply after the receptionist's holding one, a person who answered alone, and no person at all, which is
 * absent and never zero. Runs against the database `supabase start` builds on this machine, never production.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";

const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const skip =
  !URL_ || !KEY
    ? "no database in env"
    : !/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(URL_)
      ? "refusing a database that is not on this machine: this suite writes customers' messages"
      : false;

let db;
let tenantId;
let seq = 0;
const base = Date.now() - 6 * 3_600_000;
const iso = (ms) => new Date(ms).toISOString();
const ok = (res) => {
  assert.equal(res.error, null, res.error?.message);
  return res.data;
};

before(async () => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
  tenantId = ok(
    await db.from("tenants").insert({ slug: `harbor-wait-${Date.now()}`, name: "Harbor Wait", timezone: "UTC" }).select("id").single(),
  ).id;
});

after(async () => {
  if (skip) return;
  if (tenantId) {
    await db.from("events").delete().eq("tenant_id", tenantId);
    await db.from("tenants").delete().eq("id", tenantId);
  }
});

/** A person with a thread, and the messages of it: the customer's ask, then each reply as [sender, seconds after, words]. */
async function thread(replies) {
  seq += 1;
  const contact = ok(
    await db.from("contacts").insert({ tenant_id: tenantId, phone_e164: `+1555013${9300 + seq}` }).select("id").single(),
  ).id;
  const conv = ok(
    await db.from("conversations").insert({ tenant_id: tenantId, contact_id: contact, state: "open" }).select("id").single(),
  ).id;
  const row = (over) => ({ tenant_id: tenantId, conversation_id: conv, contact_id: contact, channel: "whatsapp", type: "text", body: "hi", meta: {}, ...over });
  ok(
    await db.from("messages").insert([
      row({ direction: "inbound", sender: "customer", status: "received", created_at: iso(base + seq * 1000) }),
      ...replies.map(([sender, after, body]) =>
        row({ direction: "outbound", sender, status: "sent", body, created_at: iso(base + seq * 1000 + after * 1000) }),
      ),
    ]),
  );
  return conv;
}
const rowOf = async (conv) =>
  ok(await db.rpc("first_replies", { p_tenant_id: tenantId, p_start: iso(base - 3_600_000) })).find((r) => r.conversation_id === conv);
const wait = (r) => (Date.parse(r.human_at) - Date.parse(r.asked_at)) / 1000;

test("a person's wait is human_at minus asked_at, whether the receptionist's holding reply came first or no one else did", { skip }, async () => {
  const handed = await rowOf(await thread([["ai", 5, "A person will be in touch."], ["human", 600, "Yes, Saturday works."]]));
  assert.equal(handed.who, "ai");
  assert.equal(Math.round(Number(handed.ai_seconds)), 5);
  assert.equal(wait(handed), 600, "the receptionist answered first; the person's wait is the longer one");

  const alone = await rowOf(await thread([["human", 90, "Hello! Yes."]]));
  assert.equal(alone.who, "you");
  assert.equal(wait(alone), 90);
});

test("a person who never replied has no wait: absent, never zero", { skip }, async () => {
  const unanswered = await rowOf(await thread([["ai", 5, "A person will be in touch."]]));
  assert.equal(unanswered.who, "ai");
  assert.equal(unanswered.human_at, null);
});
```

- [ ] **Step 2: Run it**

Run: `node tooling/scripts/checks/test.mjs --db tooling/scripts/tests/reports/first-replies-person-wait.db.test.mjs`
Expected: PASS at once (this pins what the database already says; it is not a failing-first test). It must keep passing when phase A's `00285` lands: its scenarios use no broadcast, so a redefinition that stops counting automated sends changes nothing here.

- [ ] **Step 3: Stage**

```bash
corepack pnpm exec prettier --write tooling/scripts/tests/reports/first-replies-person-wait.db.test.mjs
git add tooling/scripts/tests/reports/first-replies-person-wait.db.test.mjs
```

---

### Task 9: Prove the batch, and hand Ruben his steps

**Files:** none new.

- [ ] **Step 1: The checks CI runs, locally, file by file**

Run: `corepack pnpm --filter "./packages/*" build`, `corepack pnpm -r typecheck`, `corepack pnpm lint`, `git status --short packages/*/dist` (every rebuilt dist file staged), `corepack pnpm check:dead-exports`, and the ratchets: `node tooling/scripts/checks/test.mjs tooling/scripts/tests/repo/code-health-ratchets.test.mjs`.
Expected: clean. A ratchet that only fell (Task 2 removes a cast in `threads.ts`) is banked with `UPDATE_BASELINES=1` on that file's command; one that rose is a defect in this change, fixed here. No `docs/debt.md` row is owed: nothing here raises a baseline.

- [ ] **Step 2: Every test this batch touched, once more**

Run each, one per command (plain, `node tooling/scripts/checks/test.mjs <file>`): `whatsapp/{inbound-executed,sink-says-what-a-message-became,ad-referral,whatsapp-door,whatsapp-steps,ingest-failed}`, `conversations/{message-why,conversation-vm}`, `voice/{voice-provision,agent-settings,voice-doors}`, `voice/calls/call-outcomes`, `workspace/activity`, `ops/retention-words`, `repo/{log-events,event-kinds,hygiene,contracts-barrels}`, `database/{migrations,migration-ledger}`, `edge/{log-envelope,diag-door}` (all `.test.mjs` under `tooling/scripts/tests/`); and with the local stack, `--db`: `database/{a-message-says-what-it-became,a-person-keeps-how-they-first-reached-us,a-person-added-at-a-door-keeps-how,privileges,event-shapes,state-guards,each-workspace-is-told-what-changed}`, `voice/calls/{a-call-keeps-its-topic-and-language,call-own-line}`, `conversations/escalations/{an-escalation-opens-and-resolves-once,escalation-outcome}`, `reports/{first-replies-person-wait,report-series}`, `whatsapp/echo-replay`.
Expected: PASS.

- [ ] **Step 3: The one thing the stack cannot show**

Nothing here reaches a provider or a production database, and nothing draws a page, so no browser run is owed. What a real click-to-WhatsApp ad's payload looks like is Meta's, not this suite's: the stamp reads `messages[].referral.source_id` defensively (no id, no ad stamp, the wire stamps instead), and Ruben may check the shape against the first real ad-click delivery in the edge's logs.

- [ ] **Step 4: Hand back**

Tell Ruben, in his words: nothing a customer, an owner or a page shows changes; the receptionist, the Inbox, Ask and the Activity log read the same. What starts being kept: what each message became, a call's topic and language, how each new person first reached the workspace, when a handover ended and what its reason was before it changed. Then his production steps, none of which this plan takes:

1. **Apply the migrations**, from this branch with `origin/main` merged in, just before the merge: `supabase db push --linked --dry-run` (it must list `00287` to `00290` and nothing else; never `--include-all`), then `supabase db push --linked --yes`. `00287` before the merge: the new edge calls its door, and until it is applied each inbound message logs one `pg_handled_failed` line and stamps nothing. `00288` and `00289` create triggers on `messages`, `calls` and `events` under a 3-second lock guard: apply them when the line is quiet, and run again if one times out. `00290` either side of the merge.
2. **Land phase A first if it is ready.** It holds `00285` and `00286`. If this batch lands first, phase A renumbers its two unmerged files above `00290`; if phase A lands first, `--record` here drops the two gaps. Either order, K4's `first_replies` reading and everything else here are unchanged.
3. **After the edge deploys, bring the existing phone agents onto the new analysis fields (K2).** New agents get them on create. For each voice agent: `POST /api/admin/voice-converge` with `{}` is a dry run that lists the drift (`post_call_analysis_data lacks topic, language`) and writes nothing; with `{ "apply": true }` it creates a draft from the published version and patches it; add `"publish": true` for a number pinned to `latest_published` to follow. `node tooling/scripts/ops/voice-converge.mjs` does the same one agent at a time. Then `/api/diag` should show no `post_call_analysis_data` drift. Retell may cap the custom fields an agent carries (not verified): a refusal stops the apply loudly and changes nothing.
4. Nothing is backfilled. A message, person, call or escalation from before reads null, and a tile treats null as absent.

Everything stays staged and uncommitted until he says to commit.

---

## Coverage of §10

| Spec row | Where |
| --- | --- |
| K1 `meta.handled` (`ai`, `held`, `handoff`, `blocked`) and `meta.intent`, stamped when the message is processed | Tasks 1-2 (`message_stamp_handled`, `HANDLED_OUTCOMES`, the 22 ways out, the sink) |
| K2 `topic` and `language` in `CALL_ANALYSIS_FIELDS`; land in `calls.analysis`, no migration; reach existing agents the way the code syncs | Task 3 (fields, the converger's own plan, Ruben's step) |
| K3 `acquired_via`, `acquired_ref`, written once, the first touch | Tasks 4-6 (the door, the message and call triggers, the ad and the line, the doors' events) |
| K4 `resolved_at`, `escalation.changed {from,to}`, `human_seconds` from `first_replies` | Task 7 (the first two, through the production writers); Task 8 (the third, pinned as a difference, not a column) |

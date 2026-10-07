# Reports phase D2: start keeping, the second batch — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Start keeping what the Pipeline, Leads and Receptionist lenses will read and the product does not keep today: when a lead entered its stage, the stage it left and when the nightly purge set it aside (K5); the amount a deal held and the reason it was passed on at each move (K6); a booking link that left in a chat reply, and a call that was transferred and whether a person picked up (K7), without changing anything a customer, an owner or a page shows.

**Architecture:** All three are facts about a row changing, so each is a database trigger that writes inside the transaction that already writes the row and traps its own failure: no writer is restated and no live TypeScript path (`reply.ts`, the send door, the Retell webhook) is edited, so no capture can fail, block or delay a reply or a call. K5: one trigger stamps `leads.stage_at` and `leads.stage_from` on every stage move, a second writes `lead.set_aside` when the purge's set-aside happens, a third (on `events`) completes a `lead.stage` event with `from`. K6: one trigger on `events` completes each `deal.*` event with the deal's `amount_cents` and `lost_reason`. K7: a trigger on `calls` writes `call.transferred {answered}` from the provider's own ending, and a trigger on `messages` writes `booking_link.sent` when an outbound chat message leaves carrying the workspace's booking link. Nothing is backfilled: an old row reads null, a key never written is absent, never zero or null, and a tile treats null as absent.

**Tech Stack:** Postgres (plpgsql, triggers, forward-only migrations 00291-00295), TypeScript (`packages/contracts` closed sets only), `node:test` through `tooling/scripts/checks/test.mjs` (the `--db` files need the local Supabase stack).

**Spec:** `docs/superpowers/specs/2026-10-02-reports-lenses-design.md` (§10 K5-K7 is this batch; §5 phase D, §13 testing, §15-17 rollout, scope, risks). Why each capture exists and which tile reads it: `docs/superpowers/specs/2026-10-02-reports-lenses-data-catalog.md` (§1 rows 6 and 9; the Leads, Pipeline and Receptionist tables). Batch 1 (K1-K4, 00287-00290) is `docs/superpowers/plans/2026-10-03-reports-d1-start-keeping.md`; this plan copies its shape and its rules.

## Global Constraints

- **No commit, no push, no PR, no stash, no reset, no `git checkout`** until Ruben says so (his standing rule, 2 Oct 2026). Every "Stage" step is `git add`. Nothing is applied to production: Task 6 lists Ruben's steps.
- **The tree is `cm-reports-d1`** (branch `feat/reports-d1-start-keeping`): main `32328415f` + Reports phase A (00285, 00286) + batch 1 (00287-00290), all staged. Build on it; create no worktree. **Migrations 00291-00295.** No sibling worktree holds those numbers (checked 3 Oct). The ledger skips a taken number: if phase A or batch 1 renumbers when it lands, this batch renumbers above it and re-runs `node tooling/scripts/checks/migration-ledger.mjs --record`.
- **Never `supabase db reset`, never `supabase migration up`**: the local stack is shared (another lane's objects live in it). Apply each migration additively: `docker exec -i supabase_db_chanlytics-messaging psql -U postgres -d postgres -v ON_ERROR_STOP=1 --single-transaction < supabase/migrations/<file>`. `--single-transaction` is what makes the lock guard's `set local` hold (the CLI's `db query -f` refuses a file of several statements). Apply every file twice: a migration is re-runnable, and the second run is the proof. Then `node tooling/scripts/checks/migration-ledger.mjs --record`, and record the version in the stack's own ledger so `database/migration-head.db.test.mjs` is not red: `docker exec -i supabase_db_chanlytics-messaging psql -U postgres -d postgres -v ON_ERROR_STOP=1 -c "insert into supabase_migrations.schema_migrations (version, name) values ('<NNNNN>', '<name after the number>') on conflict (version) do nothing"`.
- **Never connect to production**, never `--linked`, never print a key. A database test needs the stack's environment: in the same bash command run `source "C:/Users/Ruben/AppData/Local/Temp/claude/C--Users-Ruben-Documents-Claude-Projects-Claude-Video/fb3146c6-45b0-45d3-8336-ef4e473e6ac1/scratchpad/sdd-reports-d1/db-env.sh"` (it exports `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`, `SUPABASE_CLI`) and then `node tooling/scripts/checks/test.mjs --db <file>`.
- **Never run the whole suite locally** (about 20 minutes). Run each touched file alone, plus `corepack pnpm -r typecheck` and `corepack pnpm lint` (lint holds its baseline in `docs/debt.md`, or fewer).
- Tests import the packages from their built `dist`: run `corepack pnpm --filter "./packages/*" build` after every change to contracts. Stage only the dists with a real diff (`git diff --ignore-cr-at-eol --stat -- packages/*/dist`); leave line-ending-only diffs unstaged.
- **Where the new database tests go (each folder holds at most 20 modules):** `tooling/scripts/tests/leads/` (11 now), `deals/` (6), `voice/calls/` (14), `messages/` (14): one file each, none past 20. The root of `tooling/scripts/tests/` is full: a helper a file needs is copied into the file, as ten neighbours copy `rolledBack`.
- **Every migration locks one live table**, so none needs a `lock_timeout` below `deadlock_timeout`: it opens with the 3-second guard of 00259 and 00290 (`set local lock_timeout = '3s';` and the DO block that warns when it was applied outside a transaction, copied from `supabase/migrations/00290_*.sql:24-31`). Triggers are made with `create or replace trigger`, never dropped and created (a `drop trigger` takes ACCESS EXCLUSIVE). Each migration has a header of a few lines, a pinned `search_path` on every function, grants stated (a trigger function `revoke all … from public, anon, authenticated`; a pure predicate `revoke all … from public, anon` and `grant execute … to authenticated, service_role`, as 00285 does), and comments. **A header comment never says "insert into events"**: `repo/event-kinds.test.mjs` reads every such phrase in a migration for a kind.
- **A capture never blocks, delays or fails the row that said it.** A trigger that reads another table or writes an event runs inside `begin … exception when others then raise warning '<name>: %', sqlerrm; return …; end`, a subtransaction; a BEFORE trigger returns `NEW` as it was. Each such trap has a committed test that forces the failure (the repo's `rolledBack` pattern, `tooling/scripts/tests/conversations/escalations/escalation-outcome.db.test.mjs:80-100`), and says what happened to the row. The one trigger with nothing to trap (`leads_stamp_stage` reads and writes only its own row) says so in its header, as 00290's stamp does.
- **One predicate per rule.** "A lead is set aside" is `lead_is_set_aside`; "a call's ending was a transfer, and a person picked up" is `call_transfer_answered`; "these words carry the booking link" is `message_carries_link`; "an automated send" is phase A's `automated_send`; "a call connected" stays `call_connected`. A lead event's `from` is said in one place (`events_complete_lead_stage`), a deal event's amount and reason in one place (`events_complete_deal`).
- **Event kinds are declared in the closed set**: a new kind is in `EVENT_KINDS`, has its words in `activity.ts`, and is hidden from the owner's Activity log **by its exact kind** in `ACTIVITY_NOISE_KINDS` (batch 1 hid `escalation.changed` so; a family prefix would hide a later owner-facing kind). A kind a record keeps is not purged (`retention.ts`: every other kind is the record and is kept).
- **No backfill, absent never zero (spec D9).** A lead, deal event, call or message from before reads null or has no key; a key with nothing to say is not written (no `null`, no `0`).
- **No page changes.** Nothing reads the new columns or kinds; the Activity log shows what it showed. The one existing test that pinned a deal event's exact key set (`deals/deals.db.test.mjs`) and the one that pinned a lead event's exact data (`reach-out/email-marketing.db.test.mjs`) are updated by the task that changes them.
- **Either deploy order works.** No app code reads a new column, door or kind; the dashboard hides the new kinds by name, so a migration that lands before the dashboard shows one plain extra line in the Activity log until it deploys (cosmetic; batch 1 had the same note). Tasks say why.
- No real customer in a test or a doc: slugs `harbor-*` and `acme-*`, numbers `+1555013xxxx`, made-up ids, addresses at example.com.
- Prettier owns formatting: run `corepack pnpm exec prettier --write <files>` on every touched file before staging (`docs/superpowers/` is Prettier-ignored).

## Review Focus

1. **A `from` that is stale:** a lead moved earlier, then a `lead.stage` event written for it later (a stage set to the stage it already has), must say no `from`, never the old one; and the leads of one person closed by their no each name their own `from`. Test: Task 2.
2. **A call's webhook delivered twice (call_ended, then call_analyzed), or ending in something that is not a transfer:** one `call.transferred` per call, none for `user_hangup`, `call_take_over` or no reason, and `answered` false only for `transfer_cancelled`. Test: Task 4.
3. **A message that mentions the link without carrying it:** `/booking` is not `/book`, a host that merely ends the same is not the host, a campaign's send, an email, a customer's own words, a canceled draft and a workspace with no link write nothing; a template's scheme-less link, a trailing slash, other case and a full stop after it all count. Test: Task 5.
4. **A deal with no amount, or passed with no reason:** the keys are absent, never null or zero; a deal moved back to proposed carries no reason; the event still carries no note and no link. Test: Task 3.
5. **The purge run twice, and the 180-day blanking:** one `lead.set_aside` per lead, from `ready`, once; a lead a person worked, a lead already set aside and a blanked lead write none, and blanking does not re-stamp `stage_at`. Test: Task 1.

---

## Spec anchors, checked in this tree

| Spec | Found | Moved or missing |
| --- | --- | --- |
| K5 `00220:480-489,610-661` | `lead_convert_by`'s update (480-489) and `lead_set_stage`'s update and events (610-661) are there, unchanged | The stage has more writers than the two the spec names: `lead_bulk` (`00145:385`, its event names no lead), `set_email_marketing` (`00220:184`, event at 303), `reach_out_reply_undo` (`00222:665`, event at 801), `lead_undo` (`00142:750`), the contact trigger `lead_link_contact` (`00184:267`), and `purge_leads`. A trigger on the stage holds every one; none is restated |
| K5 `purge_leads (00140)` | `00140:2072-2113`, never redefined; it archives untouched leads as `stale` in one update and writes no event | none |
| K6 `00160:229-247` | `deal_record`'s four move events (230, 235, 240, 245) | two more writers: `deal_record`'s new-deal event (`00160:173`) and `set_person_proposal`'s (`00160:336`). One trigger on `events` holds all of them and any later one (decision 0005's payment) |
| K7 `reply.ts:~192` | line 192 is the `templateFacts` port: the Inbox's template path, and `queueReply` (`442-466`) only *queues* (a 15 s undo follows) | The receptionist's own reply never passes `reply.ts`; it carries the link as `layerTwo`'s `replyText.includes(booking_link)` (`packages/core/src/inbound/steps.ts:142`); the voice tool sends it through `deliver` (`apps/edge/api/retell-fn.ts:340`). The moment the link has left is the message row becoming `sent`, so the capture is a trigger on `messages` |
| K7 `retell-webhook.ts:~401` | line 401 is `handToPerson` (the call-back escalation) | A transfer is known from the provider's ending: `disconnection_reason` (`voice-retell.ts:40,172`; labels `call-dto.ts:97,111-112`), stored in `calls.disconnection_reason` by `ingest_call`. A trigger on `calls` sees every writer, the webhook and the reconcile sweep alike |

Retell's meanings (docs.retellai.com, `get-call`): `call_transfer` the call was transferred, `transfer_bridged` it was connected to the destination, `transfer_cancelled` the attempt was aborted before completion; `call_take_over` is the dashboard's own take-over and is not a transfer.

---

## File Structure

| File | Change | Responsibility |
| --- | --- | --- |
| `supabase/migrations/00291_a_lead_keeps_when_it_changed_stage.sql` | create | `stage_at`, `stage_from`, `lead_is_set_aside`, `leads_stamp_stage`, `leads_note_set_aside` |
| `supabase/migrations/00292_a_lead_s_stage_event_says_where_it_came_from.sql` | create | `events_complete_lead_stage` |
| `supabase/migrations/00293_a_deal_s_event_keeps_its_amount_and_why_it_was_lost.sql` | create | `events_complete_deal` |
| `supabase/migrations/00294_a_transferred_call_says_whether_it_was_answered.sql` | create | `call_transfer_answered`, `calls_note_transfer` |
| `supabase/migrations/00295_a_booking_link_sent_in_chat_is_said_once.sql` | create | `message_carries_link`, `messages_note_booking_link` |
| `supabase/migrations-ledger.json`, `supabase/schema.sql`, `packages/db/src/database.types.ts`, `docs/data-model.md` | regenerate | from the migrations (Task 6) |
| `packages/contracts/src/shared/enums.ts` | modify | `lead.set_aside`, `call.transferred`, `booking_link.sent` in `EVENT_KINDS` |
| `packages/contracts/src/workspace/activity.ts`, `retention.ts` | modify | their words; hidden by exact kind; the comment |
| `docs/system-prd.md` | modify | what the rows keep, said once more |
| `tooling/scripts/tests/leads/a-lead-keeps-when-it-changed-stage.db.test.mjs` | create | 00291 and 00292 |
| `tooling/scripts/tests/deals/a-deal-s-events-keep-their-amount-and-reason.db.test.mjs` | create | 00293 |
| `tooling/scripts/tests/voice/calls/a-transferred-call-says-whether-it-was-answered.db.test.mjs` | create | 00294 |
| `tooling/scripts/tests/messages/a-booking-link-sent-in-chat-is-said-once.db.test.mjs` | create | 00295 |
| `tooling/scripts/tests/deals/deals.db.test.mjs`, `reach-out/email-marketing.db.test.mjs`, `workspace/activity.test.mjs` | modify | the two pins K5/K6 change; the words and hiding of the kinds |

---

### Task 1: A lead keeps when it changed stage, and is told when it is set aside (K5, migration 00291)

**Files:**
- Create: `supabase/migrations/00291_a_lead_keeps_when_it_changed_stage.sql`
- Create: `tooling/scripts/tests/leads/a-lead-keeps-when-it-changed-stage.db.test.mjs`
- Modify: `packages/contracts/src/shared/enums.ts` (after `"lead.not_a_fit"`), `packages/contracts/src/workspace/activity.ts` (`ACTIVITY_NOISE_KINDS` at 62, `WORDS` after `"lead.converted"`), `packages/contracts/src/workspace/retention.ts` (the comment above `EVENT_EVIDENCE_KINDS`), `tooling/scripts/tests/workspace/activity.test.mjs`

**Interfaces:**
- Produces (SQL): `leads.stage_at timestamptz` (when the lead entered the stage it is in; default `now()` for a new row, null for every lead from before) and `leads.stage_from text` (the stage it left; null until it moves); `public.lead_is_set_aside(p_stage text, p_closed_reason text) returns boolean` (archived and closed `stale`); triggers `leads_stamp_stage` (before update of `stage`, when it changes) and `leads_note_set_aside` (after update, when the lead moves into the set-aside). Event kind `lead.set_aside`: category `lead`, subject `lead` and the lead's id, data `{ stage: "archived", reason: "stale", from: <the stage it left> }`.
- Why a new kind and not `lead.stage`: `lead.stage` shows in the owner's Activity log, and the purge would put one line per lead there every night. The set-aside is the product's own word (`retention.ts`, `purge_leads`'s comment).
- Either deploy order: nothing reads the columns or the kind; a dashboard that does not yet hide `lead.set_aside` would show it as "Lead · set aside" until it deploys.

- [ ] **Step 1: Write the failing database test**

Create `tooling/scripts/tests/leads/a-lead-keeps-when-it-changed-stage.db.test.mjs`:

```js
/**
 * 00291 on a real Postgres: a lead keeps when it entered the stage it is in and the stage it left (the Reports lenses
 * spec, K5), whoever moved it, and the nightly purge's set-aside is told as lead.set_aside. The writers are the real ones:
 * the member's door (lead_set_stage), the bulk door (lead_bulk) and purge_leads, none of which this change restates. No row
 * is backfilled: a lead from before reads null, and a move stamps it. A ledger that cannot take the event does not take
 * the set-aside with it (a transaction on this machine's database that never commits, through the CLI, as
 * escalation-outcome.db.test.mjs does). 00292's half, the stage event's `from`, is in this file too, below. Runs against
 * the database `supabase start` builds on this machine, never production.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON = process.env.SUPABASE_ANON_KEY;
const skip =
  !URL_ || !KEY
    ? "no database in env"
    : !/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(URL_)
      ? "refusing a database that is not on this machine: this suite writes leads and events"
      : false;
// The member's doors need a signed-in owner.
const skipMember = skip || (!ANON ? "no SUPABASE_ANON_KEY in env: the owner these cases sign in needs it" : false);

// ROOT (four levels up from this folder), CLI, DB_URL and CLI_TARGET: copied from
// conversations/escalations/escalation-outcome.db.test.mjs:36-44.

const stamp = Date.now();
const users = [];
let db;
let owner;
let ownerId;
let tenantId;
let otherId;
let seq = 0;
const ok = (res) => {
  assert.equal(res.error, null, res.error?.message);
  return res.data;
};
const daysAgo = (n) => new Date(Date.now() - n * 86_400_000).toISOString();

// rolledBack(body): a transaction that never commits (a DO block that ends by raising what it `seen`), copied from
// conversations/escalations/escalation-outcome.db.test.mjs:76-99, doc comment included. A block that needs the
// right database first raises 'not_this_database' unless a row this suite made is there.

before(async () => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
  tenantId = ok(await db.from("tenants").insert({ slug: `harbor-lead-stage-${stamp}`, name: "Harbor Lead Stage" }).select("id").single()).id;
  otherId = ok(await db.from("tenants").insert({ slug: `acme-lead-stage-${stamp}`, name: "Acme Lead Stage" }).select("id").single()).id;
  if (!ANON) return;
  const email = `lead-stage-owner-${stamp}@example.com`;
  const password = `pw-${Math.random().toString(36).slice(2)}-Aa1!`;
  const made = await db.auth.admin.createUser({ email, password, email_confirm: true });
  assert.equal(made.error, null, made.error?.message);
  ownerId = made.data.user.id;
  users.push(ownerId);
  ok(await db.from("memberships").insert({ tenant_id: tenantId, user_id: ownerId, role: "owner" }));
  owner = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const signedIn = await owner.auth.signInWithPassword({ email, password });
  assert.equal(signedIn.error, null, signedIn.error?.message);
});

after(async () => {
  if (skip) return;
  for (const id of [tenantId, otherId]) {
    if (!id) continue;
    await db.from("events").delete().eq("tenant_id", id);
    await db.from("leads").delete().eq("tenant_id", id);
    await db.from("contacts").delete().eq("tenant_id", id);
    await db.from("tenants").delete().eq("id", id);
  }
  for (const id of users) await db.auth.admin.deleteUser(id).catch(() => {});
});

const lead = async (fields = {}) =>
  ok(
    await db
      .from("leads")
      .insert({ tenant_id: tenantId, place_id: `harbor-${stamp}-${++seq}`, business_name: "Harbor Studio", ...fields })
      .select("id, stage, stage_at, stage_from")
      .single(),
  );
const rowOf = async (id) =>
  ok(await db.from("leads").select("stage, closed_reason, stage_at, stage_from").eq("id", id).single());
const stampOf = async (id) => {
  const r = await rowOf(id);
  return [r.stage_at, r.stage_from];
};
const eventsOf = async (kind, id) =>
  ok(
    await db
      .from("events")
      .select("category, subject_type, data")
      .eq("tenant_id", tenantId)
      .eq("kind", kind)
      .eq("subject_id", id)
      .order("created_at"),
  );
const setStage = async (id, stage, reason) =>
  ok(await owner.rpc("lead_set_stage", { p_lead_id: id, p_stage: stage, ...(reason ? { p_reason: reason } : {}) }));

test(
  "a lead says since when it is in its stage and which stage it left, whoever moved it; a stage set to the one it has, and another column's update, say nothing",
  { skip: skipMember },
  async () => {
    const born = await lead();
    assert.ok(Date.now() - Date.parse(born.stage_at) < 60_000, "a new lead's stage_at is its birth");
    assert.equal(born.stage_from, null);
    ok(await db.from("leads").update({ last_note: "called twice" }).eq("id", born.id));
    assert.deepEqual(await stampOf(born.id), [born.stage_at, null], "another column moves nothing");
    await setStage(born.id, "ready");
    assert.deepEqual(await stampOf(born.id), [born.stage_at, null], "the stage it already has is no move");

    await setStage(born.id, "nurture");
    const moved = await rowOf(born.id);
    assert.deepEqual([moved.stage, moved.stage_from], ["nurture", "ready"]);
    assert.ok(Date.parse(moved.stage_at) > Date.parse(born.stage_at), "stamped at the move");

    // The bulk door moves many leads and writes no event per lead; the stamp is on each row all the same.
    const bulked = await lead();
    ok(await owner.rpc("lead_bulk", { p_tenant_id: tenantId, p_action: "contacted", p_ids: [bulked.id] }));
    const bulkedRow = await rowOf(bulked.id);
    assert.deepEqual([bulkedRow.stage, bulkedRow.stage_from], ["nurture", "ready"]);
    assert.deepEqual(await eventsOf("lead.stage", bulked.id), [], "one event for the act, none per lead (00142)");
  },
);

test("a lead from before has no stage_at: an update that moves nothing leaves it null, a move stamps it", { skip }, async () => {
  const old = await lead({ stage_at: null });
  assert.equal(old.stage_at, null);
  ok(await db.from("leads").update({ last_note: "x" }).eq("id", old.id));
  assert.deepEqual(await stampOf(old.id), [null, null], "unknown stays unknown, never now");
  ok(await db.from("leads").update({ stage: "nurture" }).eq("id", old.id));
  const moved = await rowOf(old.id);
  assert.deepEqual([moved.stage_from, moved.stage_at !== null], ["ready", true]);
});

test(
  "the nightly purge sets aside the lead nobody worked, once, and says so: lead.set_aside from ready, and no lead.stage line for the Activity log",
  { skip },
  async () => {
    const started = Date.now() - 5_000;
    const untouched = await lead({ found_at: daysAgo(91) });
    const worked = await lead({ found_at: daysAgo(91), contacted_at: daysAgo(5) });
    const fresh = await lead({ found_at: daysAgo(10) });
    const nurtured = await lead({ found_at: daysAgo(91), stage: "nurture", contacted_at: daysAgo(5) });
    const already = await lead({ found_at: daysAgo(91), stage: "archived", closed_reason: "stale" });
    ok(await db.rpc("purge_leads"));

    const set = await rowOf(untouched.id);
    assert.deepEqual([set.stage, set.closed_reason, set.stage_from], ["archived", "stale", "ready"]);
    assert.ok(Date.parse(set.stage_at) >= started, "stamped when it was set aside");
    assert.deepEqual(await eventsOf("lead.set_aside", untouched.id), [
      { category: "lead", subject_type: "lead", data: { stage: "archived", reason: "stale", from: "ready" } },
    ]);
    assert.deepEqual(await eventsOf("lead.stage", untouched.id), [], "nothing the owner's Activity log would show");
    for (const l of [worked, fresh, nurtured, already])
      assert.deepEqual(await eventsOf("lead.set_aside", l.id), [], "a lead the purge did not set aside says nothing");

    ok(await db.rpc("purge_leads"));
    assert.equal((await eventsOf("lead.set_aside", untouched.id)).length, 1, "a second run finds nothing to set aside");

    // Blanking at 180 days leaves the stage alone: no new stamp, no second event.
    const before = await stampOf(untouched.id);
    ok(await db.from("leads").update({ found_at: daysAgo(181) }).eq("id", untouched.id));
    ok(await db.rpc("purge_leads"));
    const blanked = ok(await db.from("leads").select("blanked_at").eq("id", untouched.id).single());
    assert.ok(blanked.blanked_at, "blanked at 180 days");
    assert.deepEqual(await stampOf(untouched.id), before);
    assert.equal((await eventsOf("lead.set_aside", untouched.id)).length, 1);
  },
);

test("a purge that sets aside many leads writes one event for each, and none twice", { skip }, async () => {
  const rows = Array.from({ length: 120 }, (_, i) => ({
    tenant_id: tenantId,
    place_id: `harbor-${stamp}-many-${i}`,
    business_name: "Harbor Studio",
    found_at: daysAgo(95),
  }));
  const many = ok(await db.from("leads").insert(rows).select("id"));
  ok(await db.rpc("purge_leads"));
  const said = ok(
    await db
      .from("events")
      .select("subject_id")
      .eq("tenant_id", tenantId)
      .eq("kind", "lead.set_aside")
      .in("subject_id", many.map((r) => r.id)),
  );
  assert.equal(said.length, 120);
  assert.equal(new Set(said.map((e) => e.subject_id)).size, 120);
});

test(
  "a ledger that cannot take the set-aside event does not take the set-aside with it: the lead is archived and no event is written",
  { skip },
  async () => {
    const a = await lead({ found_at: daysAgo(91) });
    const b = await lead({ found_at: daysAgo(91) });
    const setAside = (id) => `update public.leads set stage = 'archived', closed_reason = 'stale' where id = '${id}';`;
    const count = (id) =>
      `(select count(*) from public.events where kind = 'lead.set_aside' and subject_id = '${id}')`;
    const seen = rolledBack(`
      if not exists (select 1 from public.leads where id = '${a.id}') then raise exception 'not_this_database'; end if;
      ${setAside(a.id)}
      seen := seen || jsonb_build_object('control', ${count(a.id)});
      create function public.__set_aside_refused() returns trigger language plpgsql as $f$
      begin raise exception 'the ledger is unavailable'; end $f$;
      create trigger __set_aside_refused before insert on public.events
        for each row when (new.kind = 'lead.set_aside' and new.tenant_id = '${tenantId}') execute function public.__set_aside_refused();
      begin
        ${setAside(b.id)}
        seen := seen || jsonb_build_object('raised', false);
      exception when others then
        seen := seen || jsonb_build_object('raised', true, 'message', sqlerrm);
      end;
      seen := seen || jsonb_build_object('stage', (select stage from public.leads where id = '${b.id}'), 'events', ${count(b.id)});
    `);
    assert.equal(seen.control, 1, "the control: a working ledger writes it");
    assert.deepEqual([seen.raised, seen.stage, seen.events], [false, "archived", 0], JSON.stringify(seen));
    assert.equal((await rowOf(b.id)).stage, "ready", "nothing the block did was kept");
  },
);
```

- [ ] **Step 2: Run it to verify it fails**

Run (database environment as in the Global Constraints): `node tooling/scripts/checks/test.mjs --db tooling/scripts/tests/leads/a-lead-keeps-when-it-changed-stage.db.test.mjs`
Expected: FAIL: `column leads.stage_at does not exist` (the inserts select it).

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/00291_a_lead_keeps_when_it_changed_stage.sql`:

```sql
-- 00291 · A lead keeps when it changed stage, and is told when it is set aside.
--
-- The Reports lenses spec, K5. A lead's stage is overwritten by every writer that moves it (the member's door, the bulk
-- door, a conversion, a person's no, its undo, the contact trigger that links a lead, the nightly purge) and nothing kept
-- when, so "time in each stage" and the leads stuck now could not be read. Now leads.stage_at is the moment the lead
-- entered the stage it is in and leads.stage_from the stage it left, both stamped by one trigger on the stage itself:
-- every writer is held and none is restated (as 00290 holds an escalation's). A new row's stage_at is its birth, by the
-- column's default; no row is backfilled, so a lead from before reads null (unknown) and a tile treats null as absent.
-- stage_from is also what 00292 reads to say where a lead.stage event came from.
--
-- The purge's set-aside (archived, closed stale: the product's word, retention.ts) wrote no event. Now the move into it
-- writes lead.set_aside { stage, reason, from }: a kind of its own, not lead.stage, because lead.stage shows in the
-- owner's Activity log and a nightly run would put one line per lead there. lead_is_set_aside is the one predicate the
-- trigger asks of the old row and the new, so only the move into it writes, once; blanking at 180 days leaves the stage
-- alone and writes nothing. The purge itself is not restated.
--
-- The stamp reads and writes only its own row, so it has nothing to trap. The event's write traps its own failure: a lead
-- set aside with no event is a warning, never a failed purge. Either deploy order works (nothing reads these yet).
--
-- The lock. The columns are added first and take ACCESS EXCLUSIVE on leads, held to commit (a re-run takes it too, before it
-- finds them there); everything after runs under it and waits for no other table. The triggers are made with create or
-- replace trigger, which takes only SHARE ROW EXCLUSIVE. One table, one wait, bounded by 00259's 3 s guard; if it times out
-- nothing was applied and the owner re-runs it when the line is quiet. Every statement re-runs.
set local lock_timeout = '3s';
do $$
begin
  raise notice 'lock_timeout for this migration: %', current_setting('lock_timeout');
  if current_setting('lock_timeout') <> '3s' then
    raise warning 'this file was applied outside a transaction, so SET LOCAL did nothing: run it inside begin/commit, or set lock_timeout yourself before it';
  end if;
end $$;

alter table public.leads add column if not exists stage_at timestamptz;
alter table public.leads add column if not exists stage_from text;
-- A default for the rows still to be written, never for the ones there: adding the column with it would date every lead at this file.
alter table public.leads alter column stage_at set default now();

comment on column public.leads.stage_at is
  'When the lead entered the stage it is in (K5): its birth for a new row, the move for any later one, stamped by leads_stamp_stage whoever writes the stage. Null for a lead from before 00291: unknown, never now.';
comment on column public.leads.stage_from is
  'The stage the lead was in before the move that stamped stage_at (K5); null until it moves. 00292 reads it to say where a lead.stage event came from.';

create or replace function public.lead_is_set_aside(p_stage text, p_closed_reason text)
returns boolean
language sql
immutable
set search_path = public
as $$
  -- The purge's word for an untouched lead (purge_leads, 00140): archived, and closed stale.
  select coalesce(p_stage = 'archived' and p_closed_reason = 'stale', false)
$$;

revoke all on function public.lead_is_set_aside(text, text) from public, anon;
grant execute on function public.lead_is_set_aside(text, text) to authenticated, service_role;
comment on function public.lead_is_set_aside(text, text) is
  'A lead is set aside when it is archived and closed stale: the nightly purge''s word for a lead nobody worked (K5). leads_note_set_aside asks it of the old row and the new.';

create or replace function public.leads_stamp_stage()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  NEW.stage_at := now();
  NEW.stage_from := OLD.stage;
  return NEW;
end $$;

revoke all on function public.leads_stamp_stage() from public, anon, authenticated;
comment on function public.leads_stamp_stage() is
  'Stamps stage_at and stage_from when a lead''s stage changes, whoever writes it (K5). Reads and writes only its own row.';

create or replace trigger leads_stamp_stage before update of stage on public.leads
  for each row when (old.stage is distinct from new.stage)
  execute function public.leads_stamp_stage();

create or replace function public.leads_note_set_aside()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
  values (NEW.tenant_id, 'lead.set_aside', 'lead', 'lead', NEW.id,
          jsonb_build_object('stage', NEW.stage, 'reason', NEW.closed_reason, 'from', OLD.stage));
  return null;
exception when others then
  raise warning 'leads_note_set_aside: %', sqlerrm;
  return null;
end $$;

revoke all on function public.leads_note_set_aside() from public, anon, authenticated;
comment on function public.leads_note_set_aside() is
  'Writes lead.set_aside { stage, reason, from } when a lead moves into the set-aside (K5). Never fails the update: a failure is a warning.';

create or replace trigger leads_note_set_aside after update of stage, closed_reason on public.leads
  for each row
  when (public.lead_is_set_aside(new.stage, new.closed_reason) and not public.lead_is_set_aside(old.stage, old.closed_reason))
  execute function public.leads_note_set_aside();
```

- [ ] **Step 4: Apply it twice, record it, run the test**

Apply `00291` as the Global Constraints say, twice, then `--record` and the stack's ledger row (`'00291'`, `'a_lead_keeps_when_it_changed_stage'`). Run: `node tooling/scripts/checks/test.mjs --db tooling/scripts/tests/leads/a-lead-keeps-when-it-changed-stage.db.test.mjs`
Expected: PASS for the cases of this task. The 00292 cases are written in Task 2.

- [ ] **Step 5: Declare the kind, give it its words, keep it out of the Activity log**

In `packages/contracts/src/shared/enums.ts`, after `"lead.not_a_fit",` add:

```ts
  /** The nightly purge set an untouched lead aside (00291): { stage, reason, from }. Its own kind, so the Activity log is not filled with one line per lead. */
  "lead.set_aside",
```

In `packages/contracts/src/workspace/activity.ts`: `ACTIVITY_NOISE_KINDS = ["escalation.changed", "lead.set_aside"] as const;` and add `"lead.set_aside": "A lead was set aside",` to `WORDS` after `"lead.converted"`. In `retention.ts`, in the comment above `EVENT_EVIDENCE_KINDS`, change "and the one kind escalation.changed beside them (ACTIVITY_NOISE_KINDS)" to "and the kinds named in ACTIVITY_NOISE_KINDS beside them".

In `tooling/scripts/tests/workspace/activity.test.mjs`, after the `escalation.changed_by_hand` assertion (line 150) add:

```js
  assert.equal(activityWords("lead.set_aside", { stage: "archived", reason: "stale", from: "ready" }), "A lead was set aside");
  assert.equal(isActivityNoise("lead.set_aside"), true, "a record Reports reads: hidden unless asked for by name");
  assert.equal(isActivityNoise("lead.stage"), false, "a member's own move still shows");
  assert.equal(isActivityNoise("lead.converted"), false);
```

Run: `corepack pnpm --filter "./packages/*" build`, then `node tooling/scripts/checks/test.mjs tooling/scripts/tests/workspace/activity.test.mjs`, `tooling/scripts/tests/repo/event-kinds.test.mjs` (the lint finds `lead.set_aside` in 00291's trigger and in `EVENT_KINDS`, both ways), `tooling/scripts/tests/ops/retention-words.test.mjs`, and `--db` `tooling/scripts/tests/database/privileges.db.test.mjs`, `tooling/scripts/tests/leads/leads.db.test.mjs`, `tooling/scripts/tests/leads/engine/lead-engine.db.test.mjs` (it runs the purge).
Expected: PASS.

- [ ] **Step 6: Show the trap test can fail**

Apply a copy of `leads_note_set_aside` without its `exception` clause (`docker exec … psql -c "create or replace function public.leads_note_set_aside() … end $$"` over the same body minus the clause), run the last test of the file: the case must go red (`raised` true). Re-apply `00291` (re-runnable) to restore the function and run the file green again. This is the drill for every trap test in this plan.

- [ ] **Step 7: Stage**

```bash
corepack pnpm exec prettier --write tooling/scripts/tests/leads/a-lead-keeps-when-it-changed-stage.db.test.mjs tooling/scripts/tests/workspace/activity.test.mjs packages/contracts/src/shared/enums.ts packages/contracts/src/workspace/activity.ts packages/contracts/src/workspace/retention.ts
git add supabase/migrations/00291_a_lead_keeps_when_it_changed_stage.sql supabase/migrations-ledger.json tooling/scripts/tests/leads/a-lead-keeps-when-it-changed-stage.db.test.mjs tooling/scripts/tests/workspace/activity.test.mjs packages/contracts/src
git add packages/contracts/dist
```
(Stage `packages/contracts/dist` files that really changed only.)

---

### Task 2: A lead's stage event says where the lead came from (K5, migration 00292)

**Files:**
- Create: `supabase/migrations/00292_a_lead_s_stage_event_says_where_it_came_from.sql`
- Modify: `tooling/scripts/tests/leads/a-lead-keeps-when-it-changed-stage.db.test.mjs` (append), `tooling/scripts/tests/reach-out/email-marketing.db.test.mjs:233-235`

**Interfaces:**
- Consumes: `leads.stage_at`, `leads.stage_from` (Task 1).
- Produces: trigger `events_complete_lead_stage` (before insert on `events`, only a `lead.stage` event about a lead): it adds `from` to the event's data when, and only when, the lead moved into the stage the event names **in this same transaction** (`leads.stage_at = now()` and `leads.stage` is the event's `stage`) and the writer did not say `from` itself. Otherwise the event is left exactly as written. The writers (`lead_set_stage`, `set_email_marketing`, `reach_out_reply_undo`) are not restated; `lead_bulk`'s event names no lead and is not touched.
- Why in the same transaction: a `lead.stage` event written for a lead that did not move (a stage set to the one it has) must not borrow the `from` of an older move.

- [ ] **Step 1: Write the failing tests**

Append to `tooling/scripts/tests/leads/a-lead-keeps-when-it-changed-stage.db.test.mjs`:

```js
/* ---------------------------------------- 00292: the stage event says where the lead came from ---------------------------------------- */

test(
  "a stage event says which stage the lead came from, through the member's door, back and forth; a stage set to the one it has says none",
  { skip: skipMember },
  async () => {
    const l = await lead();
    await setStage(l.id, "nurture");
    await setStage(l.id, "archived", "said_no");
    await setStage(l.id, "ready");
    assert.deepEqual(
      (await eventsOf("lead.stage", l.id)).map((e) => e.data),
      [
        { stage: "nurture", reason: null, by: ownerId, from: "ready" },
        { stage: "archived", reason: "said_no", by: ownerId, from: "nurture" },
        { stage: "ready", reason: null, by: ownerId, from: "archived" },
      ],
    );
    const still = await lead();
    await setStage(still.id, "nurture");
    await setStage(still.id, "nurture");
    const [moved, again] = await eventsOf("lead.stage", still.id);
    assert.equal(moved.data.from, "ready");
    assert.equal("from" in again.data, false, "the lead did not move this time: the old from is not this event's");
  },
);

test(
  "a person's no closes each of their leads and each event says its own lead's from, not the last one's",
  { skip },
  async () => {
    const person = ok(
      await db
        .from("contacts")
        .insert({ tenant_id: tenantId, phone_e164: `+1555013${8000 + ++seq}`, email: `dana-${stamp}-${seq}@example.com` })
        .select("id")
        .single(),
    ).id;
    const ready = await lead({ contact_id: person });
    const nurture = await lead({ contact_id: person, stage: "nurture" });
    ok(await db.rpc("set_email_marketing", { p_tenant_id: tenantId, p_contact_id: person, p_state: "opted_out", p_source: "reply" }));
    const closed = ok(
      await db
        .from("events")
        .select("subject_id, data")
        .eq("tenant_id", tenantId)
        .eq("kind", "lead.stage")
        .in("subject_id", [ready.id, nurture.id]),
    );
    assert.deepEqual(Object.fromEntries(closed.map((e) => [e.subject_id, e.data.from])), {
      [ready.id]: "ready",
      [nurture.id]: "nurture",
    });
    for (const e of closed) assert.deepEqual(Object.keys(e.data).sort(), ["by", "from", "reason", "source", "stage"]);
  },
);

test("the bulk door's one event names no lead and says no from", { skip: skipMember }, async () => {
  const l = await lead();
  ok(await owner.rpc("lead_bulk", { p_tenant_id: tenantId, p_action: "contacted", p_ids: [l.id] }));
  const bulk = ok(
    await db.from("events").select("data").eq("tenant_id", tenantId).eq("kind", "lead.stage").contains("data", { bulk: true }),
  );
  assert.ok(bulk.length >= 1 && bulk.every((e) => !("from" in e.data)));
});

test("an event for a lead that was not just moved, for one that is not there, or that already says from, is left as its writer wrote it", { skip }, async () => {
  const quiet = await lead();
  const write = async (subject, data) =>
    ok(
      await db
        .from("events")
        .insert({ tenant_id: tenantId, kind: "lead.stage", category: "lead", subject_type: "lead", subject_id: subject, data })
        .select("data")
        .single(),
    ).data;
  assert.deepEqual(await write(quiet.id, { stage: "ready", reason: null, by: null }), { stage: "ready", reason: null, by: null });
  assert.deepEqual(await write("00000000-0000-4000-8000-000000000000", { stage: "ready" }), { stage: "ready" });
  assert.deepEqual(await write(quiet.id, { stage: "ready", from: "nurture" }), { stage: "ready", from: "nurture" });
});

test(
  "another workspace's event never borrows a lead's from; and a lookup that cannot be made costs the event nothing: it lands as written",
  { skip },
  async () => {
    const l = await lead();
    const event = (tenant, tag) => `
      insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
      values ('${tenant}', 'lead.stage', 'lead', 'lead', '${l.id}', jsonb_build_object('stage', 'nurture', 'tag', '${tag}'));`;
    const dataOf = (tag) =>
      `(select data from public.events where subject_id = '${l.id}' and data->>'tag' = '${tag}')`;
    const seen = rolledBack(`
      if not exists (select 1 from public.leads where id = '${l.id}') then raise exception 'not_this_database'; end if;
      update public.leads set stage = 'nurture' where id = '${l.id}';
      ${event(otherId, "cross")}
      ${event(tenantId, "control")}
      seen := seen || jsonb_build_object('cross', ${dataOf("cross")}, 'control', ${dataOf("control")});
      -- The lookup fails (the carrier column is gone) with the stamp trigger out of the way.
      alter table public.leads disable trigger leads_stamp_stage;
      alter table public.leads rename column stage_from to stage_from_x;
      begin
        ${event(tenantId, "trap")}
        seen := seen || jsonb_build_object('raised', false, 'trap', ${dataOf("trap")});
      exception when others then
        seen := seen || jsonb_build_object('raised', true, 'message', sqlerrm);
      end;
    `);
    assert.equal("from" in seen.cross, false, "another workspace's event gets nothing");
    assert.equal(seen.control.from, "ready", "the control: this workspace's event gets the lead's from");
    assert.equal(seen.raised, false, JSON.stringify(seen));
    assert.equal("from" in seen.trap, false, "the lookup failed, a warning in the log, and the event landed as written");
  },
);
```

In `tooling/scripts/tests/reach-out/email-marketing.db.test.mjs`, replace lines 233-235 (the `closed.map(...)` assertion and the `for` loop) with:

```js
    assert.deepEqual(closed.map((e) => e.subject_id).sort(), [leads.ready.id, leads.nurture.id].sort());
    // Each lead's event says the stage that lead came from (00292), whichever the order they were closed in.
    const cameFrom = { [leads.ready.id]: "ready", [leads.nurture.id]: "nurture" };
    for (const e of closed)
      assert.deepEqual(e.data, {
        stage: "archived",
        reason: "said_no",
        by: null,
        source: "unsubscribe",
        from: cameFrom[e.subject_id],
      });
```

- [ ] **Step 2: Run them to verify they fail**

Run: `node tooling/scripts/checks/test.mjs --db tooling/scripts/tests/leads/a-lead-keeps-when-it-changed-stage.db.test.mjs` and `--db tooling/scripts/tests/reach-out/email-marketing.db.test.mjs`
Expected: FAIL: the events carry no `from`.

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/00292_a_lead_s_stage_event_says_where_it_came_from.sql`:

```sql
-- 00292 · A lead's stage event says where the lead came from.
--
-- The Reports lenses spec, K5, the other half. lead.stage carried the stage a lead went to and never the one it left;
-- 00291 now keeps that on the lead (stage_from). This completes the event with it: one trigger on the ledger, so the
-- writers that say a lead's stage (lead_set_stage, set_email_marketing, reach_out_reply_undo) are not restated and a later
-- one is held too. It adds `from` only when the lead moved into the stage the event names in this very transaction
-- (stage_at is now(), and the stage is the event's): an event written for a lead that did not move, or that moved in
-- another transaction, is left as its writer wrote it, never given an older move's from. A writer's own `from` stands. The
-- bulk door's one event names no lead and is not touched. No backfill: an older event has no from, and a tile treats that
-- as unknown.
--
-- It reads one row of leads and writes only the event it is part of, and traps its own failure: a lookup that cannot be
-- made is a warning and the event lands as written. It fires for a lead.stage row about a lead only (the WHEN), so no other
-- event enters it. Either deploy order works (nothing reads `from` yet).
--
-- The lock. A trigger on the events ledger locks its partitions until commit (as 00289's does): one table, one wait, the
-- 3 s guard of 00259; if it times out nothing was applied and the owner re-runs it when the line is quiet. This file reads
-- leads but takes no lock on it. Every statement re-runs.
set local lock_timeout = '3s';
do $$
begin
  raise notice 'lock_timeout for this migration: %', current_setting('lock_timeout');
  if current_setting('lock_timeout') <> '3s' then
    raise warning 'this file was applied outside a transaction, so SET LOCAL did nothing: run it inside begin/commit, or set lock_timeout yourself before it';
  end if;
end $$;

create or replace function public.events_complete_lead_stage()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_from text;
begin
  if jsonb_typeof(NEW.data) = 'object' and not (NEW.data ? 'from') then
    select l.stage_from into v_from
      from public.leads l
     where l.id = NEW.subject_id and l.tenant_id = NEW.tenant_id
       and l.stage_at = now() and l.stage = NEW.data ->> 'stage';
    if v_from is not null then
      NEW.data := NEW.data || jsonb_build_object('from', v_from);
    end if;
  end if;
  return NEW;
exception when others then
  raise warning 'events_complete_lead_stage: %', sqlerrm;
  return NEW;
end $$;

revoke all on function public.events_complete_lead_stage() from public, anon, authenticated;
comment on function public.events_complete_lead_stage() is
  'Adds `from` to a lead.stage event when the lead moved into the event''s stage in this transaction (K5), whoever wrote the event. A writer''s own from stands; an event for a lead that did not just move is left as written. Never fails the insert: a failure is a warning.';

create or replace trigger events_complete_lead_stage before insert on public.events
  for each row
  when (new.kind = 'lead.stage' and new.subject_type = 'lead' and new.subject_id is not null)
  execute function public.events_complete_lead_stage();
```

- [ ] **Step 4: Apply it twice, record it, run the tests**

Apply `00292` (twice), `--record`, stack ledger row (`'00292'`, `'a_lead_s_stage_event_says_where_it_came_from'`). Run `--db`: `leads/a-lead-keeps-when-it-changed-stage`, `reach-out/email-marketing`, `leads/leads`, `reach-out-replies/never-again`, `reach-out-replies/reply-read`, `database/privileges` (all `.db.test.mjs` under `tooling/scripts/tests/`).
Expected: PASS. Show the trap case red once with the Task 1 drill on `events_complete_lead_stage`.

- [ ] **Step 5: Stage**

```bash
corepack pnpm exec prettier --write tooling/scripts/tests/leads/a-lead-keeps-when-it-changed-stage.db.test.mjs tooling/scripts/tests/reach-out/email-marketing.db.test.mjs
git add supabase/migrations/00292_a_lead_s_stage_event_says_where_it_came_from.sql supabase/migrations-ledger.json tooling/scripts/tests/leads/a-lead-keeps-when-it-changed-stage.db.test.mjs tooling/scripts/tests/reach-out/email-marketing.db.test.mjs
```

---

### Task 3: A deal's events keep its amount and why it was lost (K6, migration 00293)

**Files:**
- Create: `supabase/migrations/00293_a_deal_s_event_keeps_its_amount_and_why_it_was_lost.sql`
- Create: `tooling/scripts/tests/deals/a-deal-s-events-keep-their-amount-and-reason.db.test.mjs`
- Modify: `tooling/scripts/tests/deals/deals.db.test.mjs:294-304`

**Interfaces:**
- Produces: trigger `events_complete_deal` (before insert on `events`, only a `deal.proposed`, `deal.won`, `deal.lost` or `deal.ended` event about a deal): it adds `amount_cents` (the deal's amount at the move) and `lost_reason` (the reason the deal holds, which only a pass has) to the event's data, each only when the deal has one and the writer did not say it. No `per`, no `currency`, never a note or a link: the spec names two keys, and a reader joins `deals` for the rest. The writers (`deal_record` for a new deal and each move, `set_person_proposal` for the Proposal out it opens) are not restated, and decision 0005's payment writer, when built, is held for free.
- A number and a closed code carry no words, so the erasure scrub has nothing to reach (decision 0004's reason for keeping words out). Decisions 0004 and 0008 describe the shape as of then and are left as written; the as-built reference (Task 6) says the new one.

- [ ] **Step 1: Write the failing tests**

Create `tooling/scripts/tests/deals/a-deal-s-events-keep-their-amount-and-reason.db.test.mjs`. Its imports, `skip` (which also needs `SUPABASE_ANON_KEY`), `member()`, `before` and `after` are copied from `deals/deals.db.test.mjs:26-104` (slug prefix `harbor-deal-events`; `before` adds `w.seq = 0;`), plus `rolledBack` and the `CLI`/`CLI_TARGET` lines from Task 1's file. New helpers and tests:

```js
const SIX = ["by", "contact_id", "deal_id", "from", "service", "stage"];
const record = (client, args) => client.rpc("deal_record", args).then((r) => (r.error ? { error: r.error.message } : r.data));
const person = async () =>
  ok(await w.admin.from("contacts").insert({ tenant_id: w.tenant, phone_e164: `+1555013${7000 + ++w.seq}` }).select("id").single()).id;
const eventsOf = async (dealId) =>
  ok(await w.admin.from("events").select("kind, data").eq("tenant_id", w.tenant).eq("subject_id", dealId).order("created_at"));
const extras = (e) => Object.keys(e.data).filter((k) => !SIX.includes(k)).sort();

test(
  "every move of a deal says the amount it held and, for a pass, why: and only that, never a note or a link",
  { skip },
  async () => {
    const c = await person();
    const made = await record(w.operator, {
      p_contact_id: c, p_stage: "proposed", p_service: "Retainer", p_amount_cents: 150000, p_per: "month",
      p_note: "Sent by email", p_proposal_url: "https://docs.example.com/p/k6",
    });
    const id = made.deal.id;
    let version = 1;
    for (const [stage, extra] of [["won", {}], ["lost", { p_lost_reason: "price" }], ["proposed", {}], ["ended", {}]])
      version = (await record(w.operator, { p_contact_id: c, p_stage: stage, p_deal_id: id, p_version: version, ...extra })).deal.version;
    const events = await eventsOf(id);
    assert.deepEqual(
      events.map((e) => [e.kind, e.data.amount_cents ?? null, e.data.lost_reason ?? null]),
      [
        ["deal.proposed", 150000, null],
        ["deal.won", 150000, null],
        ["deal.lost", 150000, "price"],
        ["deal.proposed", 150000, null],
        ["deal.ended", 150000, null],
      ],
      "a reason only on the pass: proposing again clears it, and so does ending",
    );
    for (const e of events) assert.deepEqual(Object.keys(e.data).filter((k) => SIX.includes(k)).sort(), SIX);
    assert.ok(!/Sent by email|example\.com/.test(JSON.stringify(events)), "still no words and no link");
  },
);

test("a deal with no amount, or passed with no reason, says neither: absent, never null or zero", { skip }, async () => {
  const c = await person();
  const made = await record(w.operator, { p_contact_id: c, p_stage: "proposed", p_service: "Quote" });
  await record(w.operator, { p_contact_id: c, p_stage: "lost", p_deal_id: made.deal.id, p_version: 1 });
  for (const e of await eventsOf(made.deal.id)) assert.deepEqual(extras(e), [], `${e.kind}: no amount, no reason, no key at all`);
});

test("a Proposal out opened by a link carries no amount: the deal has none", { skip }, async () => {
  ok(await w.admin.from("tenants").update({ sells_by: "proposal" }).eq("id", w.tenant));
  const c = await person();
  ok(await w.owner.rpc("set_person_proposal", { p_contact_id: c, p_url: "https://docs.example.com/p/k6-link" }));
  const deal = ok(await w.admin.from("deals").select("id").eq("contact_id", c).single());
  const events = await eventsOf(deal.id);
  assert.deepEqual(events.map((e) => [e.kind, extras(e)]), [["deal.proposed", []]]);
});

test("an event that already says an amount keeps it; one for a deal that is not there lands as written", { skip }, async () => {
  const c = await person();
  const made = await record(w.operator, { p_contact_id: c, p_stage: "proposed", p_service: "Own", p_amount_cents: 5000 });
  const write = async (subject, data) =>
    ok(
      await w.admin
        .from("events")
        .insert({ tenant_id: w.tenant, kind: "deal.won", category: "deal", subject_type: "deal", subject_id: subject, data })
        .select("data")
        .single(),
    ).data;
  assert.deepEqual(await write(made.deal.id, { stage: "won", amount_cents: 1 }), { stage: "won", amount_cents: 1 });
  assert.deepEqual(await write("00000000-0000-4000-8000-000000000000", { stage: "won" }), { stage: "won" });
});

test("a lookup that cannot be made costs the event nothing: it lands as written, and a working one fills it", { skip }, async () => {
  const c = await person();
  const deal = ok(
    await w.admin
      .from("deals")
      .insert({ tenant_id: w.tenant, contact_id: c, stage: "lost", amount_cents: 5000, lost_reason: "timing" })
      .select("id")
      .single(),
  );
  const event = (tag) => `
    insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
    values ('${w.tenant}', 'deal.lost', 'deal', 'deal', '${deal.id}', jsonb_build_object('stage', 'lost', 'tag', '${tag}'));`;
  const dataOf = (tag) => `(select data from public.events where subject_id = '${deal.id}' and data->>'tag' = '${tag}')`;
  const seen = rolledBack(`
    if not exists (select 1 from public.deals where id = '${deal.id}') then raise exception 'not_this_database'; end if;
    ${event("control")}
    seen := seen || jsonb_build_object('control', ${dataOf("control")});
    alter table public.deals rename column lost_reason to lost_reason_x;
    begin
      ${event("trap")}
      seen := seen || jsonb_build_object('raised', false, 'trap', ${dataOf("trap")});
    exception when others then
      seen := seen || jsonb_build_object('raised', true, 'message', sqlerrm);
    end;
  `);
  assert.deepEqual([seen.control.amount_cents, seen.control.lost_reason], [5000, "timing"]);
  assert.equal(seen.raised, false, JSON.stringify(seen));
  assert.deepEqual(extras({ data: seen.trap }).filter((k) => k !== "tag"), [], "the trap: a warning in the log, the event as written");
});
```

In `tooling/scripts/tests/deals/deals.db.test.mjs` replace lines 294-304 (the comment, the `events` read, the kind assertion, the `for` loop and the test's closing) with:

```js
    // Events carry what they did: a stage; the amount the deal held at the move and, for a pass, its reason (00293, K6);
    // never a link or a note. The deal held 120000 when proposed, lost its amount to the cleared field before the pass
    // (so the pass says none), and the reason is the pass's alone.
    const SIX = ["by", "contact_id", "deal_id", "from", "service", "stage"];
    const events = ok(await w.admin.from("events").select("kind, data").eq("subject_id", id).order("created_at"));
    assert.deepEqual(
      events.map((e) => e.kind),
      ["deal.proposed", "deal.lost", "deal.proposed"],
    );
    assert.deepEqual(
      events.map((e) => Object.keys(e.data).filter((k) => !SIX.includes(k)).sort()),
      [["amount_cents"], ["lost_reason"], []],
    );
    for (const e of events) assert.deepEqual(Object.keys(e.data).filter((k) => SIX.includes(k)).sort(), SIX);
  },
);
```

- [ ] **Step 2: Run them to verify they fail**

Run `--db`: `deals/a-deal-s-events-keep-their-amount-and-reason` and `deals/deals`.
Expected: FAIL: the events carry neither key.

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/00293_a_deal_s_event_keeps_its_amount_and_why_it_was_lost.sql`:

```sql
-- 00293 · A deal's event keeps its amount and why it was lost.
--
-- The Reports lenses spec, K6. Each deal.* event said the stage and who (00156, 00160) and nothing of what the deal was
-- worth or why it was passed on, and both are overwritten on the row by the next edit, so "why they passed" and stage
-- movement by value could not be read later. One trigger on the ledger completes the event with the deal's amount_cents
-- and lost_reason as the deal holds them at that move (deal_record updates the row before it writes the event, so the row
-- is the move's): the writers (deal_record for a new deal and each move, set_person_proposal for the Proposal out it opens)
-- are not restated, and decision 0005's payment writer will be held too. A key is written only when the deal has the
-- thing: no amount is no key, never null or zero; a reason is a pass's alone (any other stage clears it). A writer's own
-- key stands. A number and a closed code are no words, so the erasure scrub has nothing to reach (decision 0004 kept words
-- out for that); per and currency are not carried (a reader joins deals for them). The note and the link stay out. No
-- backfill: an older event has neither key.
--
-- It reads one row of deals and writes only the event it is part of, and traps its own failure: a lookup that cannot be
-- made is a warning and the event lands as written. It fires for a deal.* row about a deal only (the WHEN). Either deploy
-- order works (nothing reads the keys yet).
--
-- The lock. As 00292: a trigger on the ledger, one table, the 3 s guard of 00259; this file reads deals and locks nothing
-- on it. Every statement re-runs.
set local lock_timeout = '3s';
do $$
begin
  raise notice 'lock_timeout for this migration: %', current_setting('lock_timeout');
  if current_setting('lock_timeout') <> '3s' then
    raise warning 'this file was applied outside a transaction, so SET LOCAL did nothing: run it inside begin/commit, or set lock_timeout yourself before it';
  end if;
end $$;

create or replace function public.events_complete_deal()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deal record;
begin
  if jsonb_typeof(NEW.data) = 'object' then
    select d.amount_cents, d.lost_reason into v_deal
      from public.deals d
     where d.id = NEW.subject_id and d.tenant_id = NEW.tenant_id;
    if found then
      NEW.data := jsonb_strip_nulls(jsonb_build_object('amount_cents', v_deal.amount_cents, 'lost_reason', v_deal.lost_reason))
                  || NEW.data;
    end if;
  end if;
  return NEW;
exception when others then
  raise warning 'events_complete_deal: %', sqlerrm;
  return NEW;
end $$;

revoke all on function public.events_complete_deal() from public, anon, authenticated;
comment on function public.events_complete_deal() is
  'Adds amount_cents and lost_reason, as the deal holds them, to a deal.* event (K6): only what the deal has, a writer''s own key standing, never a note or a link. Never fails the insert: a failure is a warning.';

create or replace trigger events_complete_deal before insert on public.events
  for each row
  when (new.kind in ('deal.proposed', 'deal.won', 'deal.lost', 'deal.ended') and new.subject_type = 'deal' and new.subject_id is not null)
  execute function public.events_complete_deal();
```

- [ ] **Step 4: Apply it twice, record it, run the tests**

Apply `00293` (twice), `--record`, stack ledger row (`'00293'`, `'a_deal_s_event_keeps_its_amount_and_why_it_was_lost'`). Run `--db`: `deals/a-deal-s-events-keep-their-amount-and-reason`, `deals/deals`, `deals/person-proposal`, `database/privileges`; and `tooling/scripts/tests/workspace/activity.test.mjs` (plain: the deal words are unchanged).
Expected: PASS. Show the trap case red once with the Task 1 drill on `events_complete_deal`.

- [ ] **Step 5: Stage**

```bash
corepack pnpm exec prettier --write tooling/scripts/tests/deals/a-deal-s-events-keep-their-amount-and-reason.db.test.mjs tooling/scripts/tests/deals/deals.db.test.mjs
git add supabase/migrations/00293_a_deal_s_event_keeps_its_amount_and_why_it_was_lost.sql supabase/migrations-ledger.json tooling/scripts/tests/deals/a-deal-s-events-keep-their-amount-and-reason.db.test.mjs tooling/scripts/tests/deals/deals.db.test.mjs
```

---

### Task 4: A transferred call says whether it was answered (K7, migration 00294)

**Files:**
- Create: `supabase/migrations/00294_a_transferred_call_says_whether_it_was_answered.sql`
- Create: `tooling/scripts/tests/voice/calls/a-transferred-call-says-whether-it-was-answered.db.test.mjs`
- Modify: `packages/contracts/src/shared/enums.ts` (after `"call.recorded"`), `packages/contracts/src/workspace/activity.ts`, `tooling/scripts/tests/workspace/activity.test.mjs`

**Interfaces:**
- Produces (SQL): `public.call_transfer_answered(p_reason text) returns boolean`: `true` for `call_transfer` and `transfer_bridged`, `false` for `transfer_cancelled`, null for any other ending or none (not a transfer). Triggers `calls_note_transfer` (after insert, a call that arrives already ending in a transfer) and `calls_note_transfer_on_update` (after update of `disconnection_reason`, when it becomes a transfer). Event kind `call.transferred`: category `call`, subject `call` and the call's id, data `{ answered: boolean }`.
- Why a trigger and not the webhook's `handToPerson` (the spec's `~401`): a call's ending reaches `calls` by every writer (the webhook's `call_ended` and `call_analyzed` carry the same reason and the reconcile sweep writes it too); the trigger fires on the change of the reason, so redeliveries write once, and nothing is added to the answer the provider waits for. A call whose transfer did not connect and which went on with the receptionist ends with another reason and writes none (not captured; said in the notes).
- Either deploy order: nothing reads it; an older dashboard would show "Call · transferred" until it deploys.

- [ ] **Step 1: Write the failing database test**

Create `tooling/scripts/tests/voice/calls/a-transferred-call-says-whether-it-was-answered.db.test.mjs`. Header, `skip` (service key, local only), `rolledBack` and the CLI lines are as Task 1's (`ROOT` is five levels up from `voice/calls/`); the world and the `call` helper follow batch 1's `messages/a-person-keeps-how-they-first-reached-us.db.test.mjs:41-151` (a workspace `harbor-transfer-${stamp}` and a voice line `tenant_channels(kind 'voice', external_id: agent)`, `agent = agent_transfer_${stamp}`). New code:

```js
import { DISCONNECTION_LABELS } from "@chanlytics/contracts";

/** A call event as the webhook ingests it, with the provider's ending. */
const call = (id, status, disconnection, from = `+1555013${6000 + ++seq}`, direction = "inbound") =>
  db.rpc("ingest_call", {
    p_tenant_id: tenantId, p_retell_call_id: `tr-${id}-${stamp}`, p_agent_id: agent, p_from_e164: from, p_from_raw: from,
    p_to_e164: null, p_direction: direction, p_call_type: "phone_call", p_status: status,
    p_started_at: new Date().toISOString(), p_ended_at: null, p_duration_ms: status === "ongoing" ? null : 42_000,
    p_disconnection: disconnection, p_sentiment: null, p_successful: null, p_in_voicemail: false, p_summary: null,
    p_transcript: null, p_transcript_obj: null, p_recording: null, p_public_log_url: null, p_cost: {}, p_latency: {}, p_raw: {},
  });
const callId = async (id) =>
  ok(await db.from("calls").select("id").eq("tenant_id", tenantId).eq("retell_call_id", `tr-${id}-${stamp}`).single()).id;
const transfers = async (id) =>
  ok(
    await db
      .from("events")
      .select("category, subject_type, data")
      .eq("tenant_id", tenantId)
      .eq("kind", "call.transferred")
      .eq("subject_id", await callId(id)),
  );

test(
  "a call that ended in a transfer says whether a person picked up, once, however many times the provider says it: its first row, its ending, its analysis",
  { skip },
  async () => {
    for (const [reason, answered] of [["call_transfer", true], ["transfer_bridged", true], ["transfer_cancelled", false]]) {
      ok(await call(reason, "ongoing", null));
      assert.deepEqual(await transfers(reason), [], `${reason}: nothing while the call runs`);
      ok(await call(reason, "ended", reason));
      ok(await call(reason, "ended", reason)); // call_analyzed carries the same ending
      assert.deepEqual(await transfers(reason), [{ category: "call", subject_type: "call", data: { answered } }], reason);
    }
  },
);

test("a call that arrives already ended in a transfer says so, and an outbound call is a call", { skip }, async () => {
  ok(await call("first-row", "ended", "transfer_bridged"));
  assert.equal((await transfers("first-row")).length, 1);
  ok(await call("outbound", "ended", "transfer_bridged", undefined, "outbound"));
  assert.equal((await transfers("outbound")).length, 1);
});

test("any other ending, and none, says nothing: a hang-up, the receptionist's, a person taking over from the dashboard", { skip }, async () => {
  for (const reason of ["user_hangup", "agent_hangup", "call_take_over", "manual_stopped", "dial_no_answer", null]) {
    ok(await call(`other-${reason}`, "ended", reason));
    assert.deepEqual(await transfers(`other-${reason}`), [], String(reason));
  }
});

test("the predicate is the labels' twin: a reason the product words as a transfer is one, and answered is the word's", { skip }, async () => {
  for (const [reason, label] of Object.entries(DISCONNECTION_LABELS)) {
    const said = ok(await db.rpc("call_transfer_answered", { p_reason: reason }));
    const transfer = /^Transfer/.test(label);
    assert.equal(said !== null, transfer, `${reason}: ${label}`);
    if (transfer) assert.equal(said, label === "Transferred to a person", reason);
  }
  assert.equal(ok(await db.rpc("call_transfer_answered", { p_reason: null })), null);
});

test(
  "a ledger that cannot take the event does not take the call with it: the call is on record and no event is written",
  { skip },
  async () => {
    const insert = (id) => `insert into public.calls (tenant_id, retell_call_id, status, disconnection_reason)
      values ('${tenantId}', 'tr-trap-${id}-${stamp}', 'ended', 'transfer_bridged');`;
    const count = (id) => `(select count(*) from public.events e join public.calls c on c.id = e.subject_id
      where e.kind = 'call.transferred' and c.retell_call_id = 'tr-trap-${id}-${stamp}')`;
    const seen = rolledBack(`
      if not exists (select 1 from public.tenants where id = '${tenantId}') then raise exception 'not_this_database'; end if;
      ${insert("control")}
      seen := seen || jsonb_build_object('control', ${count("control")});
      create function public.__transfer_refused() returns trigger language plpgsql as $f$
      begin raise exception 'the ledger is unavailable'; end $f$;
      create trigger __transfer_refused before insert on public.events
        for each row when (new.kind = 'call.transferred' and new.tenant_id = '${tenantId}') execute function public.__transfer_refused();
      begin
        ${insert("trap")}
        seen := seen || jsonb_build_object('raised', false);
      exception when others then
        seen := seen || jsonb_build_object('raised', true, 'message', sqlerrm);
      end;
      seen := seen || jsonb_build_object('rows', (select count(*) from public.calls where retell_call_id = 'tr-trap-trap-${stamp}'), 'events', ${count("trap")});
    `);
    assert.equal(seen.control, 1);
    assert.deepEqual([seen.raised, seen.rows, seen.events], [false, 1, 0], JSON.stringify(seen));
  },
);
```
(`after` deletes the workspace's `events` and then the workspace, as batch 1's file does; the rest cascade.)

- [ ] **Step 2: Run it to verify it fails**

Run: `--db tooling/scripts/tests/voice/calls/a-transferred-call-says-whether-it-was-answered.db.test.mjs`
Expected: FAIL: `Could not find the function public.call_transfer_answered`.

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/00294_a_transferred_call_says_whether_it_was_answered.sql`:

```sql
-- 00294 · A transferred call says whether it was answered.
--
-- The Reports lenses spec, K7 (the phone half). The receptionist hands a caller to a person with the transfer tool, and
-- the provider says how the call ended: call_transfer (it was transferred), transfer_bridged (the destination picked up and
-- the call was bridged), transfer_cancelled (the attempt was aborted before completion); the product already words them
-- (call-dto.ts). Nothing kept that as a fact a report can count. call_transfer_answered is the one place that says which
-- endings are a transfer and whether a person picked up (null: not a transfer); the trigger writes
-- call.transferred { answered } when a call's ending becomes one. call_take_over is the dashboard's own take-over, not a
-- transfer. The trigger is on the call row, not in the webhook: every writer of the ending is held (the webhook's call_ended
-- and call_analyzed, the reconcile sweep), a redelivery that says the same ending writes nothing (the WHEN asks for a
-- change), and nothing is added to the answer the provider waits for. A transfer that did not connect and left the caller
-- with the receptionist ends with another reason and writes none. No backfill.
--
-- It writes only the event, traps its own failure (a call with no event is a warning, never a failed ingest), and fires only
-- for a transfer ending (the WHEN). Either deploy order works (nothing reads it yet).
--
-- The lock. A trigger on calls takes SHARE ROW EXCLUSIVE (writers wait, readers do not) until commit: one table, one wait,
-- the 3 s guard of 00259; if it times out nothing was applied and the owner re-runs it when the line is quiet. Every
-- statement re-runs.
set local lock_timeout = '3s';
do $$
begin
  raise notice 'lock_timeout for this migration: %', current_setting('lock_timeout');
  if current_setting('lock_timeout') <> '3s' then
    raise warning 'this file was applied outside a transaction, so SET LOCAL did nothing: run it inside begin/commit, or set lock_timeout yourself before it';
  end if;
end $$;

create or replace function public.call_transfer_answered(p_reason text)
returns boolean
language sql
immutable
set search_path = public
as $$
  -- null: not a transfer. true: a person picked up (call_transfer, and transfer_bridged for a warm one). false: it did not go through.
  select case
           when p_reason in ('call_transfer', 'transfer_bridged') then true
           when p_reason = 'transfer_cancelled' then false
         end
$$;

revoke all on function public.call_transfer_answered(text) from public, anon;
grant execute on function public.call_transfer_answered(text) to authenticated, service_role;
comment on function public.call_transfer_answered(text) is
  'Whether a call''s ending (calls.disconnection_reason) was a transfer and a person picked up (K7): true for call_transfer and transfer_bridged, false for transfer_cancelled, null for any other ending or none. Held to the product''s own words for the endings (call-dto.ts DISCONNECTION_LABELS) by a database test.';

create or replace function public.calls_note_transfer()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
  values (NEW.tenant_id, 'call.transferred', 'call', 'call', NEW.id,
          jsonb_build_object('answered', public.call_transfer_answered(NEW.disconnection_reason)));
  return null;
exception when others then
  raise warning 'calls_note_transfer: %', sqlerrm;
  return null;
end $$;

revoke all on function public.calls_note_transfer() from public, anon, authenticated;
comment on function public.calls_note_transfer() is
  'Writes call.transferred { answered } when a call''s ending becomes a transfer (K7), once per change of the ending. Never fails the call''s writer: a failure is a warning.';

create or replace trigger calls_note_transfer after insert on public.calls
  for each row when (public.call_transfer_answered(new.disconnection_reason) is not null)
  execute function public.calls_note_transfer();

create or replace trigger calls_note_transfer_on_update after update of disconnection_reason on public.calls
  for each row
  when (public.call_transfer_answered(new.disconnection_reason) is not null
        and new.disconnection_reason is distinct from old.disconnection_reason)
  execute function public.calls_note_transfer();
```

- [ ] **Step 4: Apply it twice, record it, declare the kind, run the tests**

Apply `00294` (twice), `--record`, stack ledger row (`'00294'`, `'a_transferred_call_says_whether_it_was_answered'`).

In `packages/contracts/src/shared/enums.ts`, after `"call.recorded",` add:

```ts
  /** A call ended in a transfer to a person (00294): { answered }, whether they picked up. */
  "call.transferred",
```

In `activity.ts` add `"call.transferred"` to `ACTIVITY_NOISE_KINDS` and `"call.transferred": "A call was passed to a person",` to `WORDS` after `"call.recorded"`. In `activity.test.mjs` add beside Task 1's assertions:

```js
  assert.equal(activityWords("call.transferred", { answered: true }), "A call was passed to a person");
  assert.equal(isActivityNoise("call.transferred"), true);
  assert.equal(isActivityNoise("call.recorded"), false, "the kind is hidden, not the family: a call's record still shows");
```

Run: `corepack pnpm --filter "./packages/*" build`; plain `workspace/activity`, `repo/event-kinds`; `--db` `voice/calls/a-transferred-call-says-whether-it-was-answered`, `messages/a-person-keeps-how-they-first-reached-us` (its calls trigger neighbours this one), `voice/calls/call-own-line`, `database/privileges`.
Expected: PASS. Show the trap case red once with the Task 1 drill on `calls_note_transfer`.

- [ ] **Step 5: Stage**

```bash
corepack pnpm exec prettier --write tooling/scripts/tests/voice/calls/a-transferred-call-says-whether-it-was-answered.db.test.mjs tooling/scripts/tests/workspace/activity.test.mjs packages/contracts/src/shared/enums.ts packages/contracts/src/workspace/activity.ts
git add supabase/migrations/00294_a_transferred_call_says_whether_it_was_answered.sql supabase/migrations-ledger.json tooling/scripts/tests/voice/calls/a-transferred-call-says-whether-it-was-answered.db.test.mjs tooling/scripts/tests/workspace/activity.test.mjs packages/contracts/src
git add packages/contracts/dist
```

---

### Task 5: A booking link sent in chat is said once (K7, migration 00295)

**Files:**
- Create: `supabase/migrations/00295_a_booking_link_sent_in_chat_is_said_once.sql`
- Create: `tooling/scripts/tests/messages/a-booking-link-sent-in-chat-is-said-once.db.test.mjs`
- Modify: `packages/contracts/src/shared/enums.ts` (after `"message.send_raced_cancel"`), `packages/contracts/src/workspace/activity.ts`, `tooling/scripts/tests/workspace/activity.test.mjs`

**Interfaces:**
- Produces (SQL): `public.message_carries_link(p_body text, p_link text) returns boolean` (the link as a person reads it: no scheme, no closing slash, any case, found with a break on each side, not inside a longer word, host or path name). Triggers `messages_note_booking_link` (after insert) and `messages_note_booking_link_on_send` (after update of `status`), one function: it reads the workspace's `tenant_config.config.brain.booking_link` (the field every sender already uses: `steps.ts:142`, `reply.ts:461`, `retell-fn.ts:318`) and, when the words carry it, writes `booking_link.sent`: category `message`, subject `message` and the message's id, data `{ channel, sender }`.
- What counts: an **outbound** message **becoming `sent`** (inserted as sent, or a queued one finalized) on **whatsapp or sms**, that is **not an automated send** (`automated_send(meta)`: a broadcast or a reach-out is not a reply) and not a backfilled row. That is the receptionist's own replies, a member's replies, and the voice tool's WhatsApp link. A canceled or failed draft, an inbound message, an email and a campaign's send write nothing.
- Why the message row and not `reply.ts` (the spec's `~192`): see "Spec anchors". Nothing in the reply path, the send door or the webhook is edited.
- Cost, said plainly: the WHEN keeps the function to outbound sent chat messages with something shaped like a link in them (`\S\.\S`); for those it is one primary-key read of `tenant_config` and one regex. This is the only migration of the five whose cost is per message on the hottest table.
- Either deploy order: nothing reads it; an older dashboard would show "Booking_link · sent" until it deploys.

- [ ] **Step 1: Write the failing database test**

Create `tooling/scripts/tests/messages/a-booking-link-sent-in-chat-is-said-once.db.test.mjs`. Header, `skip`, `rolledBack` and the CLI lines as Task 1's; world: a workspace `harbor-link-${stamp}`, its `tenant_config` (`upsert({ tenant_id, config: { brain: { booking_link: LINK } } }, { onConflict: "tenant_id" })`), a person `contacts(phone_e164, consent: "opted_in")` and a `conversations` row. The real send door and the real repository writer are imported:

```js
import { recordOutbound } from "@chanlytics/db";
const { deliver } = await import(pathToFileURL(path.join(ROOT, "packages/core/dist/index.js")).href);

const LINK = "https://book.example.com/harbor";
const wire = { whatsapp: async () => ({ ok: true, wamid: `wamid.k7.${++seq}`, status: 200 }) };
const send = (over) =>
  deliver({ db, wire }, {
    tenantId, conversationId, contactId, to: phone, channel: "whatsapp", sender: "ai",
    purpose: "conversational", proactive: false, body: `Book here: ${LINK}`, ...over,
  });
const links = async (messageId) =>
  ok(await db.from("events").select("category, subject_type, data").eq("tenant_id", tenantId).eq("kind", "booking_link.sent").eq("subject_id", messageId));

const CASES = [
  ["Book here: https://book.example.com/harbor", LINK, true, "verbatim"],
  ["Book here: book.example.com/harbor", LINK, true, "a template's slot has no scheme"],
  ["BOOK.EXAMPLE.COM/HARBOR.", LINK, true, "any case, a full stop after it"],
  ["see book.example.com/harbor/, thanks", LINK, true, "a closing slash"],
  ["(book.example.com/harbor)", LINK, true, "in brackets"],
  ["book.example.com/harbor?src=wa", LINK, true, "a query after it"],
  ["https://book.example.com/harbor/classes", LINK, true, "a page under it is the business's own"],
  ["book.example.com/harbor-classes", LINK, false, "a longer name is another page"],
  ["book.example.com/harbors", LINK, false, "a longer word"],
  ["notbook.example.com/harbor", LINK, false, "another host that merely ends the same"],
  ["www.book.example.com/harbor", LINK, false, "another host that starts differently"],
  ["We open at nine.", LINK, false, "no link"],
  ["https://book.example.com/harbor", null, false, "none on file"],
  ["https://book.example.com/harbor", "  ", false, "a blank one"],
  [null, LINK, false, "no words"],
  ["a.b/c(d)", "https://a.b/c(d)", true, "brackets in a link are text, not a pattern"],
  ["https://x.example.com/a+b?c=1", "https://x.example.com/a+b?c=1", true, "a plus and a question mark are text"],
];

test("the predicate: the link as a person reads it, with a break on each side", { skip }, async () => {
  for (const [body, link, want, why] of CASES)
    assert.equal(ok(await db.rpc("message_carries_link", { p_body: body, p_link: link })), want, why);
});

test("the receptionist's reply that carries the link is said once, when it has left; the same words without it say nothing", { skip }, async () => {
  const sent = await send({});
  assert.deepEqual(await links(sent.messageId), [
    { category: "message", subject_type: "message", data: { channel: "whatsapp", sender: "ai" } },
  ]);
  assert.deepEqual(await links((await send({ body: "We open at nine." })).messageId), []);
  assert.deepEqual(await links((await send({ body: "Book at book.example.com/harbor-classes" })).messageId), []);
});

test("a queued reply says it when it is finalized, not when it is queued; a canceled one never does", { skip }, async () => {
  const words = "Here you go: book.example.com/harbor";
  const queued = await recordOutbound(db, { tenantId, conversationId, contactId, sender: "human", body: words, externalId: null, status: "queued" });
  assert.deepEqual(await links(queued), [], "queued: nothing has left");
  const out = await send({ messageId: queued, sender: "human", body: words });
  assert.equal(out.outcome, "sent");
  assert.deepEqual(await links(queued), [{ category: "message", subject_type: "message", data: { channel: "whatsapp", sender: "human" } }]);
  const canceled = await recordOutbound(db, { tenantId, conversationId, contactId, sender: "human", body: words, externalId: null, status: "queued" });
  ok(await db.from("messages").update({ status: "canceled" }).eq("id", canceled));
  assert.deepEqual(await links(canceled), []);
});

test("the voice tool's WhatsApp link counts as a message that carried it; a text does too, with its own channel", { skip }, async () => {
  const voice = await send({ meta: { source: "voice_booking_link", call_id: null } });
  assert.equal((await links(voice.messageId)).length, 1);
  const text = await recordOutbound(db, { tenantId, conversationId, contactId, sender: "ai", body: `Book: ${LINK}`, externalId: null, channel: "sms" });
  assert.deepEqual((await links(text))[0].data, { channel: "sms", sender: "ai" });
});

test("what is not a reply says nothing: a campaign, a reach-out, a backfilled row, an email, the customer's own words", { skip }, async () => {
  const row = (over) => ({ tenant_id: tenantId, conversation_id: conversationId, contact_id: contactId, channel: "whatsapp", direction: "outbound", sender: "human", type: "text", body: `Book: ${LINK}`, status: "sent", meta: {}, ...over });
  for (const [what, over] of [
    ["a broadcast", { meta: { source: "broadcast" } }],
    ["a reach-out", { meta: { source: "reach_out" } }],
    ["a backfilled row", { meta: { backfill: "true" } }],
    ["an email", { channel: "email" }],
    ["the customer", { direction: "inbound", sender: "customer", status: "received" }],
  ]) {
    const made = ok(await db.from("messages").insert(row(over)).select("id").single());
    assert.deepEqual(await links(made.id), [], what);
  }
});

test("a workspace with no booking link on file says nothing", { skip }, async () => {
  ok(await db.from("tenant_config").update({ config: { brain: {} } }).eq("tenant_id", tenantId));
  try {
    assert.deepEqual(await links((await send({})).messageId), []);
  } finally {
    ok(await db.from("tenant_config").update({ config: { brain: { booking_link: LINK } } }).eq("tenant_id", tenantId));
  }
});

test("a ledger that cannot take the event does not take the message with it: it is on record and no event is written", { skip }, async () => {
  const insert = (tag) => `insert into public.messages (tenant_id, conversation_id, contact_id, channel, direction, sender, type, body, status, meta)
    values ('${tenantId}', '${conversationId}', '${contactId}', 'whatsapp', 'outbound', 'ai', 'text', 'Book: ${LINK} ${tag}', 'sent', '{}'::jsonb);`;
  const count = (tag) => `(select count(*) from public.events e join public.messages m on m.id = e.subject_id
    where e.kind = 'booking_link.sent' and m.body like '%${tag}')`;
  const seen = rolledBack(`
    if not exists (select 1 from public.tenants where id = '${tenantId}') then raise exception 'not_this_database'; end if;
    ${insert("control")}
    seen := seen || jsonb_build_object('control', ${count("control")});
    create function public.__link_refused() returns trigger language plpgsql as $f$
    begin raise exception 'the ledger is unavailable'; end $f$;
    create trigger __link_refused before insert on public.events
      for each row when (new.kind = 'booking_link.sent' and new.tenant_id = '${tenantId}') execute function public.__link_refused();
    begin
      ${insert("trap")}
      seen := seen || jsonb_build_object('raised', false);
    exception when others then
      seen := seen || jsonb_build_object('raised', true, 'message', sqlerrm);
    end;
    seen := seen || jsonb_build_object('rows', (select count(*) from public.messages where body like '%trap'), 'events', ${count("trap")});
  `);
  assert.equal(seen.control, 1);
  assert.deepEqual([seen.raised, seen.rows, seen.events], [false, 1, 0], JSON.stringify(seen));
});
```
(`after` deletes the workspace's `events` and then the workspace, as batch 1's file does; the rest cascade.)

- [ ] **Step 2: Run it to verify it fails**

Run: `corepack pnpm --filter "./packages/*" build`, then `--db tooling/scripts/tests/messages/a-booking-link-sent-in-chat-is-said-once.db.test.mjs`
Expected: FAIL: `Could not find the function public.message_carries_link`.

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/00295_a_booking_link_sent_in_chat_is_said_once.sql`:

```sql
-- 00295 · A booking link sent in chat is said once.
--
-- The Reports lenses spec, K7 (the chat half). A call that sends the booking link records it as its outcome
-- (calls.outcome booking_link_sent); a chat message that carries it recorded nothing, so "links sent, then booked" could
-- not be read for the receptionist's replies or a member's. Now booking_link.sent { channel, sender } is written when an
-- outbound chat message (whatsapp or sms) has left, carrying the workspace's booking link, and is not an automated send
-- (phase A's automated_send: a broadcast or a reach-out is not a reply). "Has left" is the row becoming sent: inserted as sent
-- (the receptionist's own reply, the voice tool's WhatsApp link) or a queued one finalized (a member's reply, a held draft);
-- a canceled or failed one never is. The trigger is on the message row because that is the one place every sender passes
-- and the one moment the words are known to have gone; the reply verb only queues (a 15 s undo follows) and the
-- receptionist's reply never passes it. Nothing in the reply path, the send door or the webhook is edited.
--
-- message_carries_link is the rule: the link as a person reads it (no scheme, no closing slash, any case) found in the words
-- with a break on each side, so /book is not /booking and a host that merely ends the same is not the host. The link is
-- brain.booking_link of tenant_config, the field every sender already uses. The WHEN keeps the function to outbound sent chat
-- messages with something shaped like a link in them (a dot between two non-space characters), so a plain sentence never
-- enters it; for the rest it is one primary-key read and one regex, inside a subtransaction. Cost, said: this is the only
-- file of the batch whose cost is per message on the hottest table. No backfill.
--
-- It writes only the event and traps its own failure: a message with no event is a warning, never a failed send or ingest.
-- Either deploy order works (nothing reads it yet).
--
-- The lock. Two triggers on messages take SHARE ROW EXCLUSIVE (writers wait, readers do not) until commit: one table, one
-- wait, the 3 s guard of 00259; if it times out nothing was applied and the owner re-runs it when the line is quiet. Every
-- statement re-runs.
set local lock_timeout = '3s';
do $$
begin
  raise notice 'lock_timeout for this migration: %', current_setting('lock_timeout');
  if current_setting('lock_timeout') <> '3s' then
    raise warning 'this file was applied outside a transaction, so SET LOCAL did nothing: run it inside begin/commit, or set lock_timeout yourself before it';
  end if;
end $$;

create or replace function public.message_carries_link(p_body text, p_link text)
returns boolean
language sql
immutable
set search_path = public
as $$
  -- The link as a person reads it: lower case, no scheme, no closing slash. Found in the words with a break on each side.
  select coalesce(
           l.bare <> ''
           and lower(coalesce(p_body, '')) ~
               ('(^|[^a-z0-9.@-])' || regexp_replace(l.bare, '([][*+?(){}|^$.\\])', '\\\1', 'g') || '($|[^a-z0-9_-])'),
           false)
    from (select regexp_replace(regexp_replace(lower(btrim(coalesce(p_link, ''))), '^https?://', ''), '/+$', '') as bare) l
$$;

revoke all on function public.message_carries_link(text, text) from public, anon;
grant execute on function public.message_carries_link(text, text) to authenticated, service_role;
comment on function public.message_carries_link(text, text) is
  'Whether these words carry this link (K7): the link without its scheme or closing slash, in any case, with a break on each side (not inside a longer word, host or path name). False for no words or no link.';

create or replace function public.messages_note_booking_link()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_link text;
begin
  select nullif(btrim(c.config #>> '{brain,booking_link}'), '') into v_link
    from public.tenant_config c
   where c.tenant_id = NEW.tenant_id;
  if public.message_carries_link(NEW.body, v_link) then
    insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
    values (NEW.tenant_id, 'booking_link.sent', 'message', 'message', NEW.id,
            jsonb_build_object('channel', NEW.channel, 'sender', NEW.sender));
  end if;
  return null;
exception when others then
  raise warning 'messages_note_booking_link: %', sqlerrm;
  return null;
end $$;

revoke all on function public.messages_note_booking_link() from public, anon, authenticated;
comment on function public.messages_note_booking_link() is
  'Writes booking_link.sent { channel, sender } when an outbound chat message has left carrying the workspace''s booking link (K7), once: when its row becomes sent. Never fails the message''s writer: a failure is a warning.';

create or replace trigger messages_note_booking_link after insert on public.messages
  for each row
  when (new.direction = 'outbound' and new.status = 'sent' and new.channel in ('whatsapp', 'sms')
        and new.body ~ '\S\.\S' and not public.automated_send(new.meta)
        and coalesce(new.meta ->> 'backfill', 'false') <> 'true')
  execute function public.messages_note_booking_link();

create or replace trigger messages_note_booking_link_on_send after update of status on public.messages
  for each row
  when (new.direction = 'outbound' and new.status = 'sent' and old.status is distinct from 'sent'
        and new.channel in ('whatsapp', 'sms') and new.body ~ '\S\.\S' and not public.automated_send(new.meta)
        and coalesce(new.meta ->> 'backfill', 'false') <> 'true')
  execute function public.messages_note_booking_link();
```

- [ ] **Step 4: Apply it twice, record it, declare the kind, run the tests**

Apply `00295` (twice), `--record`, stack ledger row (`'00295'`, `'a_booking_link_sent_in_chat_is_said_once'`). The predicate table is the proof of the regex: if Postgres refuses the escape class `([][*+?(){}|^$.\\])` (a `[` must never be followed by `.`, `=` or `:` inside a class: that opens a collating element) or a case of the table fails, fix the escape, never the table.

In `enums.ts`, after `"message.send_raced_cancel",` add:

```ts
  /** An outbound chat message carrying the workspace's booking link has left (00295): { channel, sender }. */
  "booking_link.sent",
```

In `activity.ts` add `"booking_link.sent"` to `ACTIVITY_NOISE_KINDS` and `"booking_link.sent": "The booking link was sent",` to `WORDS`. In `activity.test.mjs` add beside the others, and one route-level case modelled on `workspace/activity.test.mjs:368-397` (copy that test, with these rows) proving the three new kinds stay out of the log unless asked for by name while `lead.stage`, `deal.won` and `call.recorded` show:

```js
  assert.equal(activityWords("booking_link.sent", { channel: "whatsapp", sender: "ai" }), "The booking link was sent");
  assert.equal(isActivityNoise("booking_link.sent"), true);
  assert.equal(isActivityNoise("message.sent"), false, "the message's own line still shows");
```

Run: `corepack pnpm --filter "./packages/*" build`; plain `workspace/activity`, `repo/event-kinds`, `messages/deliver`, `messages/outbound-send`; `--db` `messages/a-booking-link-sent-in-chat-is-said-once`, `messages/a-message-moves-from-queued-to-read-through-its-guard`, `messages/a-message-says-what-it-became`, `database/privileges`.
Expected: PASS. Show the trap case red once with the Task 1 drill on `messages_note_booking_link`.

- [ ] **Step 5: Stage**

```bash
corepack pnpm exec prettier --write tooling/scripts/tests/messages/a-booking-link-sent-in-chat-is-said-once.db.test.mjs tooling/scripts/tests/workspace/activity.test.mjs packages/contracts/src/shared/enums.ts packages/contracts/src/workspace/activity.ts
git add supabase/migrations/00295_a_booking_link_sent_in_chat_is_said_once.sql supabase/migrations-ledger.json tooling/scripts/tests/messages/a-booking-link-sent-in-chat-is-said-once.db.test.mjs tooling/scripts/tests/workspace/activity.test.mjs packages/contracts/src
git add packages/contracts/dist
```

---

### Task 6: Regenerate, say it in the reference, prove the batch, hand Ruben his steps

**Files:**
- Regenerate: `supabase/schema.sql`, `packages/db/src/database.types.ts`, `docs/data-model.md` (and confirm `packages/contracts/src/schema-sets.generated.ts` and `tooling/scripts/tests/_unique-keys.generated.json` do not change: nothing here adds a CHECK or a unique key)
- Modify: `docs/system-prd.md` (the paragraph "What the rows keep for the Reports")

- [ ] **Step 1: Regenerate, keeping only this batch's hunks**

With all five migrations applied to the stack: `corepack pnpm gen:schema-sets`, `corepack pnpm gen:db-types`, `corepack pnpm --filter "./packages/*" build`, `corepack pnpm gen:schema-snapshot`, `corepack pnpm gen:data-model`. The shared stack holds what this tree does not (another lane's `remove_template_version` and `save_template_version`, and partition names a regeneration renames), so compare each generated file with its staged version (`git diff -- <file>`) and **keep only the hunks these migrations explain**; restore every other hunk to the staged bytes with the Edit tool, never `git checkout`:
- `supabase/schema.sql` and `database.types.ts`: `leads.stage_at`, `leads.stage_from`; the functions `lead_is_set_aside`, `leads_stamp_stage`, `leads_note_set_aside`, `events_complete_lead_stage`, `events_complete_deal`, `call_transfer_answered`, `calls_note_transfer`, `message_carries_link`, `messages_note_booking_link`, their comments, their ACL lines; the eight triggers (`leads_stamp_stage`, `leads_note_set_aside`, `events_complete_lead_stage`, `events_complete_deal`, `calls_note_transfer`, `calls_note_transfer_on_update`, `messages_note_booking_link`, `messages_note_booking_link_on_send`);
- `docs/data-model.md`: the two `leads` columns;
- `grep -c template_version supabase/schema.sql packages/db/src/database.types.ts` must print 0 for both.

Run: `node tooling/scripts/checks/test.mjs tooling/scripts/tests/database/migrations.test.mjs`, `database/migration-ledger.test.mjs`, `database/generated/check-db-types.test.mjs`, `database/generated/schema-snapshot.test.mjs`, `docs/data-model.test.mjs`, and `--db` `database/migration-head.db.test.mjs`.
Expected: PASS (`schema-snapshot.db` may stay red for the other lane's objects, as it did for batch 1: check object by object that every difference is not this batch's).

- [ ] **Step 2: Say what the rows keep**

In `docs/system-prd.md`, in the paragraph "What the rows keep for the Reports (00287–00290)…", change the heading's range to `(00287–00295)` and add after its last bullet:

```markdown
- a lead: `leads.stage_at` and `stage_from`, when it entered its stage and the stage it left (`leads_stamp_stage`, 00291), `from` on its `lead.stage` events (00292), and a `lead.set_aside` event when the nightly purge sets it aside (00291);
- a deal: `amount_cents` and, for a pass, `lost_reason` on each `deal.*` event, as the deal held them at the move (`events_complete_deal`, 00293);
- a call: a `call.transferred { answered }` event when it ended in a transfer to a person (`call_transfer_answered`, 00294);
- a message: a `booking_link.sent { channel, sender }` event when an outbound chat message, not an automated send, left carrying the workspace's booking link (`message_carries_link`, 00295).
```

- [ ] **Step 3: The checks CI runs, locally, file by file**

Run: `corepack pnpm --filter "./packages/*" build`, `corepack pnpm -r typecheck`, `corepack pnpm lint`, `git status --short packages/*/dist` (every dist file with a real diff is staged), `corepack pnpm check:dead-exports` (nothing exported is added), and the ratchets: `node tooling/scripts/checks/test.mjs tooling/scripts/tests/repo/code-health-ratchets.test.mjs` and `tooling/scripts/tests/types/index-reads-are-counted.test.mjs`.
Expected: clean, except main's own two reds batch 1 recorded (`dashboard-a-v2.css::brief-chip`, `today-brief-words.ts`). No `docs/debt.md` row is owed: nothing here raises a baseline.

- [ ] **Step 4: Every test this batch touched, once more**

One per command (plain): `workspace/activity`, `ops/retention-words`, `repo/{event-kinds,log-events,hygiene,contracts-barrels}`, `database/{migrations,migration-ledger}`, `messages/{deliver,outbound-send}`. With the stack, `--db`: `leads/{a-lead-keeps-when-it-changed-stage,leads,engine/lead-engine}`, `deals/{a-deal-s-events-keep-their-amount-and-reason,deals,person-proposal}`, `voice/calls/{a-transferred-call-says-whether-it-was-answered,call-own-line}`, `messages/{a-booking-link-sent-in-chat-is-said-once,a-person-keeps-how-they-first-reached-us,a-message-says-what-it-became,a-message-moves-from-queued-to-read-through-its-guard}`, `reach-out/email-marketing`, `reach-out-replies/{never-again,reply-read}`, `database/{privileges,event-shapes,migration-head,each-workspace-is-told-what-changed}`, `whatsapp/echo-replay`.
Expected: PASS (`event-shapes` #11 and `schema-snapshot.db` as in Step 1).

- [ ] **Step 5: The one thing the stack cannot show**

No provider and no production database is reached, and no page is drawn, so no browser run is owed. What is Retell's and Meta's alone: that a real warm transfer ends as `transfer_bridged` or `transfer_cancelled` (the docs and the product's own labels say so; the first real transferred call in `events` confirms it), and that a real booking-link template renders the link as `host/path` (as `reply.ts:461` and `retell-fn.ts:318` build it; the table of cases holds both spellings).

- [ ] **Step 6: Hand back**

Tell Ruben, in his words: nothing a customer, an owner or a page shows changes; the receptionist, the Inbox, the phone line and the Activity log read the same, and no line of the reply path, the send door or the Retell webhook was edited. What starts being kept: when each lead entered its stage and which stage it left, and a line when the purge sets one aside; the amount and the reason on each deal's moves; a line for each call that ended in a transfer and whether a person picked up; a line for each chat message that carried the booking link. Then his production steps, none of which this plan takes:

1. **Land in order:** Reports phase A, then batch 1, then this batch (it is stacked on both; if either renumbers, this renumbers above it and `--record` runs again).
2. **Merge first, then apply the migrations** (the merge deploys the dashboard that hides the three new kinds by name; the other order shows a plain extra line in the Activity log until it does): `supabase db push --linked --dry-run` must list `00291` to `00295` and nothing else (never `--include-all`), then `supabase db push --linked --yes`.
3. **Apply when the line is quiet.** Each file takes one table's lock under a 3-second guard and re-runs if it times out: `00291` `leads`, `00292` and `00293` the events ledger (every message and call writes it), `00294` `calls`, `00295` `messages`. `00295` is the only one whose cost is per message: apply it last and look at a few messages' insert times after.
4. Nothing to set, no secret, no agent to converge. Nothing is backfilled: a lead, deal event, call or message from before reads null or has no key, and a tile treats it as absent.

Everything stays staged and uncommitted until he says to commit.

---

## Coverage of §10

| Spec row | Where |
| --- | --- |
| K5 `leads.stage_at` | Task 1 (`stage_at` and `stage_from`, stamped by `leads_stamp_stage` for every writer) |
| K5 `from` on `lead.stage` | Task 2 (`events_complete_lead_stage`; the email-marketing pin updated) |
| K5 an event when the nightly purge sets a lead aside | Task 1 (`lead.set_aside` from `leads_note_set_aside`; the purge is not restated) |
| K6 `amount_cents` and `lost_reason` on `deal.*` | Task 3 (`events_complete_deal`; the deals pin updated) |
| K7 `booking_link.sent` where a chat reply carries the link | Task 5 (the message row becoming sent, `message_carries_link`) |
| K7 `call.transferred {answered}` | Task 4 (the call's ending, `call_transfer_answered`) |

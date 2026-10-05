# Reports phase D3b: start keeping, the third batch, second half (the cost spine) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Start keeping what the operator's cost and margin reading will need from the four live provider doors and the model ledger, and the product does not keep today: what an invoice moved (Stripe's `amount_paid` or `amount_due`, with its currency, on the event's own ledger row); what Meta says a WhatsApp message cost to send (its `pricing`: billable, the pricing model, category and type, kept on the message row); the carrier's segment count of a text where the carrier says it; and which lead-finder round each model call of the lead judge was paid in (a `subject_type` and the round on its ledger rows). Spec D-rule: money and cost are the operator's, never an owner's page, so none of it reaches a member's browser: the thread's reader drops the two cost keys from a message's meta. Nothing a customer or an owner sees changes.

**Architecture:** Every addition is best-effort on a live path and fails alone. The three provider writes (Stripe's invoice, Meta's receipt, Twilio's callback) are each one SQL door, service role only, called after the write that already happens, inside a try that logs and carries on; the door keeps the first answer and writes nothing it cannot validate. The judge's round rides the model port's existing `subjectId`, gaining a `subject_type` column so the id says what it names. The WhatsApp receipts branch leaves `apps/edge/api/whatsapp.ts` for its own module (the door's measured size is a ratchet, and a line added to it is a red build), which also makes it testable without the whole door's world. Nothing is backfilled: a message, event or ledger row from before reads absent, a key with nothing to say is not written, and a real zero (a $0 trial invoice) is kept as the zero it is.

**Tech Stack:** Postgres (plpgsql, forward-only migrations 00300-00302), TypeScript (`apps/edge`, `packages/db`, `packages/channels`, `packages/core`, `packages/contracts`, `apps/dashboard`'s server), `node:test` through `tooling/scripts/checks/test.mjs` (the `--db` files need the local Supabase stack).

**Spec:** `docs/superpowers/specs/2026-10-02-reports-lenses-design.md` (§10 K8; §5 phase D, §13 testing, §15-17 rollout, scope, risks; §16: "developer metrics (latency, concurrency, cost per call) on an owner's page" are not to be built; §18-1, the plan bar's unit). Why each exists: `docs/superpowers/specs/2026-10-02-reports-lenses-data-catalog.md` (§1 row 4; Campaigns' "Cost per message", Leads' "The judge's cost per search", the operator notes under Usage). K8's first clause, `calls.cost` into dollars, is **not** here: it is `platform_metrics.voice_usd` in D3a (`docs/superpowers/plans/2026-10-04-reports-d3a-start-keeping.md`, Task 5), because it is a column of the day's row that the roll writes. This plan is stacked on D3a (its 00296-00299) and on batches 1 and 2.

## Global Constraints

- **No commit, no push, no PR, no stash, no reset, no `git checkout`** until Ruben says so (his standing rule, 2 Oct 2026). Every task ends with `git add`, never a commit. Nothing is applied to production: Task 6 lists Ruben's steps.
- **The tree is `cm-reports-d1`** (branch `feat/reports-d1-start-keeping`): main `32328415f` + Reports phase A (00285-00286) + batch 1 (00287-00290) + batch 2 (00291-00295) + D3a (00296-00299), all staged. Build on it; create no worktree. **Migrations 00300-00302**, contiguous with D3a's. If D3a is not in the tree you are in, stop: this plan's numbers and its `database.types.ts` hunks assume it. Main has since moved (`90be2a94f`) and holds its own 00287-00289 and 00296-00299: the whole run is renumbered above main's head at landing by `dev-tools/reports-renumber.mjs`, before the rebase, so the numbers here stay as written.
- **Never `supabase db reset`, never `supabase migration up`**: the local stack is shared. Apply each migration additively, twice (the second run is the proof it re-runs): `docker exec -i supabase_db_chanlytics-messaging psql -U postgres -d postgres -v ON_ERROR_STOP=1 --single-transaction < supabase/migrations/<file>` (`--single-transaction` is what makes the lock guard's `set local` hold). Then `node tooling/scripts/checks/migration-ledger.mjs --record`, and record the version in the stack's own ledger so `database/migration-head.db.test.mjs` is not red: `docker exec -i supabase_db_chanlytics-messaging psql -U postgres -d postgres -v ON_ERROR_STOP=1 -c "insert into supabase_migrations.schema_migrations (version, name) values ('<NNNNN>', '<name after the number>') on conflict (version) do nothing"`.
- **Never connect to production**, never `--linked`, never print a key. A database test needs the stack's environment: in the same bash command run `source "C:/Users/Ruben/AppData/Local/Temp/claude/C--Users-Ruben-Documents-Claude-Projects-Claude-Video/fb3146c6-45b0-45d3-8336-ef4e473e6ac1/scratchpad/sdd-reports-d1/db-env.sh"` (it exports `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`, `SUPABASE_CLI`), then `node tooling/scripts/checks/test.mjs --db <file>`. **Never run the whole suite locally** (about 20 minutes): each touched file alone, plus `corepack pnpm -r typecheck` and `corepack pnpm lint` (lint holds its baseline in `docs/debt.md`, or fewer).
- **Regenerate once, at the end, keeping only this batch's hunks.** The shared stack holds what this tree does not (another lane's `remove_template_version` and `save_template_version`, and partition names a regeneration renames), so after a generator runs, compare each generated file with its staged version and keep only the hunks this batch's migrations explain, restoring every other hunk with the Edit tool, never `git checkout`; `grep -c template_version` must print 0 for `supabase/schema.sql` and `packages/db/src/database.types.ts`. `supabase/schema.sql` and `docs/data-model.md` are regenerated once, in Task 6. **One exception, and why:** the in-memory database every TypeScript test uses (`tooling/scripts/tests/_fake-db.mjs`) refuses a table, column or function that `packages/db/src/database.types.ts` (and `_unique-keys.generated.json`, and `schema-sets.generated.ts` for a CHECK) does not hold, so a task whose TypeScript tests name a new object runs `corepack pnpm gen:db-types` (and `gen:schema-sets` when it adds a CHECK) right after applying its migration and keeps only its own hunks there. Each task says so.
- **Dists:** tests import the packages' built `dist`: `corepack pnpm --filter "./packages/*" build` after every change to a package. Stage only the dists with a real diff (`git diff --ignore-cr-at-eol --stat -- packages/*/dist`); leave line-ending-only diffs unstaged. `packages/db`'s source changes in this batch, so its `dist/index.d.ts` `agrees` comment hunks are restored by hand, never by `git checkout`.
- **Where the new tests go (a folder holds at most 20 modules; direct modules counted 4 Oct, D3a's additions included):** `tooling/scripts/tests/billing/` (9), `messages/` (15), `whatsapp/` (12). One file each, none past 20. The test root, `database/`, `ops/`, `workspace/`, `edge/`, `repo/` and `conversations/` (19) take no new file here: existing files in them are edited. A helper a file needs is copied into the file.
- **A migration that locks a live table opens with the lock guard** (copy `supabase/migrations/00295_*.sql`'s head: `set local lock_timeout = '3s';` and the DO block that warns when the file was applied outside a transaction). 00300 adds two nullable columns to `billing_events` (the Stripe ledger, one row per delivery) and 00301 one to `ai_usage` (written once per model call): one table each, so none needs a `lock_timeout` below `deadlock_timeout`; 00302 adds a function and locks nothing. **This batch adds no trigger on a live table.** The rule that a trigger or stamp traps its own failure, proved by a committed `rolledBack` test (pattern: `tooling/scripts/tests/database/team-changes-and-their-audit.db.test.mjs:680-725`), has no trigger to bind; its spirit binds every capture here, and its proof is in TypeScript: the double refuses the door (a handler that throws, as the database's error would arrive) and the webhook still lands.
- **A capture never fails, blocks or delays the webhook that carried it.** One extra statement after the existing one, in a try that logs a name from the closed set and carries on; never before the write the provider is waiting on; never an extra provider call; never a throw out of a door. A write the database refuses (an edge ahead of its migration: the function is not there) costs the new fact and nothing else.
- **One predicate per rule.** "A message carries Meta's pricing" is `waPricingOf` (channels), "what an invoice event moved" is `invoiceAmountOf` (edge), "which keys of a message's meta a member may be sent" is `memberMetaOf` (contracts). A first answer stands in SQL (`message_keep_cost`, `billing_event_keep_amount` write once), never in a caller's check.
- **Event kinds** are declared and hidden by exact kind when not owner-facing: this batch writes no event.
- **Stored SQL text cites code by file and function, never by line.**
- **Either deploy order works, said per task, with one order that matters:** **00301 before the edge that writes `subject_type`.** A ledger row naming a column the table lacks is refused whole (PostgREST answers PGRST204), the judge's usage rows would be lost in the gap (the answer is kept, the row is not). 00300 and 00302 are doors the edge calls best-effort, so either order loses at most the new fact. The dashboard that drops the cost keys from a thread's meta must be live no later than the edge that writes them: one merge deploys both.
- **No backfill, absent never zero (spec D9).** A real zero is a fact: a trial's $0 invoice keeps 0; a message with no pricing keeps no key.
- **Money and cost are the operator's (spec D11).** Nothing in this plan is read by a page. The two keys on a message are dropped from every member-facing thread read.
- **Edit existing files byte-exact: almost every file touched here is CRLF** in this checkout. Use the EOL-preserving helper `C:/Users/Ruben/AppData/Local/Temp/claude/C--Users-Ruben-Documents-Claude-Projects-Claude-Video/fb3146c6-45b0-45d3-8336-ef4e473e6ac1/scratchpad/sdd-reports-d1/edit-lib.cjs` (`edit(path, [[old, new], ...]); old and new are written with \n and each match must be unique) from a script, or the Edit tool one line at a time. Never `sed -i`, never a text-mode Python write, never PowerShell `Get-Content`/`Set-Content` on a source file.
- **The ratchets only fall, and a fall must be banked.** Task 4 moves a block out of `apps/edge/api/whatsapp.ts`'s `POST` (a measured function) and takes a cast with it: the numbers fall, and a ratchet fails on a reduction nobody banked. Run `UPDATE_BASELINES=1 node tooling/scripts/checks/test.mjs tooling/scripts/tests/repo/code-health-ratchets.test.mjs` once after that task and stage only the baseline files and the `docs/debt.md` / `docs/takeover.md` blocks it rewrites (a fall, never a rise: if anything rose, fix it instead). A **new** file may not add a table named outside `packages/db`, a cast (`as unknown as`, `as never`, `x!`), an unchecked index read or a function past the limits: every new module here is written to hold none.
- No real customer in a test or a doc: slugs `harbor-*` and `acme-*`, numbers `+1555013xxxx`, ids made up, addresses at example.com. Never call a real provider in a test: Meta, Twilio and Stripe are in-memory doubles, and Stripe's client is `setStripeClient`'s.
- Prettier owns formatting: `corepack pnpm exec prettier --write <files>` on every touched file before staging (`docs/superpowers/` is Prettier-ignored).

## Review Focus

1. **A provider word we did not expect:** a pricing object with no known key, a key whose value is a sentence, a megabyte or a control character, a `billable` that is a string, an `amount` or `currency` Meta never sends; a `NumSegments` of 0, "x", 1001 or "2.5"; an invoice with no amount, a fractional or negative one, a currency in capitals or not three letters: nothing is written, nothing is invented, and the webhook is acknowledged. Tests: Tasks 1, 4, 5.
2. **The database cannot take it:** a door that is missing (an edge ahead of its migration), refuses, or throws: the receipt's status still lands, the Stripe claim still completes and the answer is 200, the carrier's callback still moves the row and answers 200, and one line says which capture was lost. Tests: Tasks 1, 4, 5.
3. **The same word twice:** a receipt delivered again, `delivered` carrying a second pricing, a Stripe event replayed, a callback for `sent` and again for `delivered`: the first answer stands; the replay of an event never touches the ledger row again. Tests: Tasks 1, 3, 4, 5.
4. **What a member's browser is sent:** a message's meta in a thread, a person's page and the Inbox list carries `source`, `confidence`, `handled` and the rest as it does today, and never `pricing` or `segments`. Test: Task 3.
5. **A judge call with no round, and a shadow:** an older caller (a test, a job from before the deploy) that names no round writes a ledger row with no `subject_type` and no `subject_id`, exactly as before; the second model's rows for the same call carry the same round; a `subject_type` the CHECK does not name is refused by the table. Tests: Task 2.

---

## Spec anchors, checked in this tree

| Spec | Found | Moved, missing or decided |
| --- | --- | --- |
| K8 `apps/edge/api/whatsapp.ts:179-195` → `ingest.ts:394-408` | The statuses branch is exactly `whatsapp.ts:179-195`: a `Promise.all` over `v.statuses`, one `wa_status` line each, and for `sent`, `delivered`, `read` and `failed` one `recordStatusByExternalId` inside `pgSafe("status", …)` carrying only `errors`. That function is `ingest.ts:418-433` here (batch 1 moved it 24 lines); it updates `messages.status` (and `error`) and nothing else. Meta's `pricing` is dropped on the floor. **Meta sends no amount and no currency**: `billable`, `pricing_model` (`PMP`, or `CBP` before 1 July 2025), `category` and `type` (`regular`, `free_customer_service`, `free_entry_point`) only, on `sent` and on `delivered` or `read`, never `failed` (Meta's status reference, read 4 Oct) | On main the branch is `lib/whatsapp/webhook.ts:181-195` and `recordStatusByExternalId` is `ingest.ts:520`. **A cost needs Meta's rate card**: the operator prices `category` by recipient country at read time; this batch keeps only what Meta says |
| K8 `lib/sms/sms.ts:173-185` | `send` is `sms.ts:172-191`; the provider call is `packages/channels/src/lines/lines-twilio.ts:380`, which reads only `sid`. **Twilio documents `num_segments` as 0 in the create response when a Messaging Service sends** (their support note, read 4 Oct), and this product sends only through one (`MessagingServiceSid`); the status callback's documented parameters (`MessageStatus`, `ErrorCode`, `From`, `To`, `RawDlrDoneDate` …) do not list `NumSegments` either | Same on main. **Decided:** read `NumSegments` from the status callback where Twilio sends it, and leave the send path (`deliver`, the one door, a complexity-ratchet offender) alone; the capture may keep nothing in production, and the first real text says so (notes, decision 5). Twilio's Message resource holds `num_segments` and `price` for a report to fetch |
| K8 `stripe-webhook.ts:295-303` | `onInvoice` is `stripe-webhook.ts:295-304`: after the claim (`d.keep`), `notePayment(d.db, row, "paid"/"failed", inv.amount_paid)` uses the amount only to decide whether `last_paid_at` is stamped; the ledger row (`billing_events`: id, type, tenant_id, received_at, state, lease_until) holds no amount. **The claim insert must not name a new column** (00194's note: an edge ahead of its migration fails its claim loudly and applies nothing: a Stripe door that 500s) | On main `lib/billing/stripe-event.ts:303-308`. `apps/edge/lib/billing/billing.ts` is 791 lines, so any addition there makes a new file over 800: the amount's code is its own module |
| K8 `lead-wires.ts:76-77` | The judge's client is `callModel({ purpose: "lead_judge", body, … }, { tenantId })` at `lead-wires.ts:75-78`; `subject_id` is null on every judge row. The round is known at both call sites of the judge: `packages/core/src/leads/runner/collect.ts:195-201` and `rejudge.ts:149-162` (`round.id`, `round.tenant_id`) | `lead-wires.ts` differs from main by five lines elsewhere; the same call. The shadow (`startShadow("lead_judge", …)`) writes its own rows for the same call: they carry the round too |
| K8 `voice-retell.ts:181` (the first clause) | `cost: c.call_cost ?? null`, stored whole in `calls.cost`; Retell's `combined_cost` is in cents | **D3a Task 5**: `call_cost_usd` and `platform_metrics.voice_usd`, rolled nightly; no trigger on the live call row |

---

## File Structure

| File | Change | Responsibility |
| --- | --- | --- |
| `supabase/migrations/00300_an_invoice_keeps_what_it_moved.sql` | create | `billing_events.amount_cents`, `currency`; `billing_event_keep_amount` |
| `supabase/migrations/00301_a_judge_call_names_its_round.sql` | create | `ai_usage.subject_type` |
| `supabase/migrations/00302_a_message_keeps_what_it_cost_to_send.sql` | create | `message_keep_cost` |
| `packages/db/src/billing-events.ts`, `packages/db/src/index.ts` | create / modify | `keepInvoiceAmount` |
| `apps/edge/lib/billing/invoice-amount.ts`, `apps/edge/api/stripe-webhook.ts` | create / modify | `invoiceAmountOf`, `noteInvoiceAmount`, one call in `onInvoice` |
| `packages/contracts/src/ai/usage.ts`, `ai/shadow.ts`, `ai/index.ts`, `shared/schema-sets.ts` | modify | `AI_SUBJECT_TYPES`, `subject_type` on the ledger's rows |
| `apps/edge/lib/model.ts`, `shadow.ts`, `leads/lead-wires.ts` | modify | the subject type and the round, through the port and the shadow |
| `packages/channels/src/leads/lead-judge.ts`, `packages/core/src/leads/judge.ts`, `runner/collect.ts`, `runner/rejudge.ts` | modify | the round, from the runner to the client |
| `packages/db/src/repositories/ingest.ts` | modify | `keepMessageCost` |
| `packages/contracts/src/conversations/thread-dto.ts`, `index.ts`, `apps/dashboard/src/server/dto.ts` | modify | `memberMetaOf`: a member's thread never carries the cost keys |
| `packages/channels/src/whatsapp.ts`, `packages/channels/src/index.ts` | modify | `waPricingOf`, `WaPricing`, the status's `pricing` |
| `apps/edge/lib/whatsapp/receipts.ts`, `apps/edge/api/whatsapp.ts`, `apps/edge/lib/whatsapp/persist.ts` | create / modify | the receipts branch, moved, with the pricing; `PgStep` gains `cost` |
| `packages/channels/src/lines/sms.ts`, `apps/edge/lib/sms/sms-cost.ts`, `apps/edge/api/sms-status.ts` | modify / create | `numSegments` on the callback, kept |
| `apps/edge/lib/log-events.ts` | modify | `stripe_amount_unkept`, `pg_cost_failed`, `sms_cost_unkept` |
| `supabase/migrations-ledger.json`, `supabase/schema.sql`, `packages/db/src/database.types.ts`, `docs/data-model.md`, `docs/system-prd.md` | regenerate / modify | Task 6 (types earlier, see the constraint) |
| the tests | create / modify | named in each task |

---

### Task 1: An invoice keeps what it moved (K8, migration 00300)

**Files:**
- Create: `supabase/migrations/00300_an_invoice_keeps_what_it_moved.sql`, `packages/db/src/billing-events.ts`, `apps/edge/lib/billing/invoice-amount.ts`
- Create: `tooling/scripts/tests/billing/an-invoice-keeps-what-it-moved.db.test.mjs`
- Modify: `packages/db/src/index.ts` (one named export), `apps/edge/api/stripe-webhook.ts` (one import, one call in `onInvoice`), `apps/edge/lib/log-events.ts` (`stripe_amount_unkept`), `tooling/scripts/tests/billing/billing-webhook.test.mjs` (new cases)
- Regenerate (types only, see the constraint): `packages/db/src/database.types.ts`

**Interfaces:**
- Produces (SQL): `billing_events.amount_cents integer` (not negative) and `billing_events.currency text` (three lowercase letters), both null for every row from before; `public.billing_event_keep_amount(p_id text, p_amount_cents integer, p_currency text) returns boolean`, SECURITY DEFINER, the service role's alone: sets the two columns on the event row named by `p_id` **once** (a row that already has an amount keeps it) and answers whether it did; answers false, writing nothing, for an amount that is null or negative or a currency that is not three lowercase letters. A real zero is kept.
- Produces (TypeScript): `keepInvoiceAmount(db, eventId, amountCents, currency): Promise<boolean>` in `packages/db/src/billing-events.ts` (a root module named for its domain; a new domain earns a folder at its second module), exported from the barrel; it throws with the database's words on a refusal. In the edge, `invoiceAmountOf(type, inv): { cents: number; currency: string } | null` and `noteInvoiceAmount(db, eventId, type, inv): Promise<void>` in `apps/edge/lib/billing/invoice-amount.ts` (its own module: `billing.ts` is 791 lines and an addition would make a file over 800): the amount is `amount_paid` on `invoice.paid` and `amount_due` on `invoice.payment_failed` (what the invoice moved, or tried to), the currency Stripe's own lowercased; null for no amount, a fraction or a negative, or a currency that is not three letters. `noteInvoiceAmount` never throws: a failure is `L.warn("stripe_amount_unkept")`.
- **Where it is called and why not in the claim.** After `d.keep` returned the claim to this delivery and before `notePayment`, in `onInvoice`, as one more statement. The claim's own insert (`billing.ts` `insertClaim`) is not touched: an edge ahead of its migration that named a new column in it would fail every Stripe claim until the migration, which is a webhook that 500s. A replayed event is answered as a duplicate before this line, so a replay never reaches the ledger row again.
- Amounts are Stripe's cents of the invoice's own currency; a sum across currencies is the reader's to refuse. Kept for the life of the ledger row (the ledger outlives the workspace, `on delete set null`).
- Either deploy order: an edge ahead of 00300 logs `stripe_amount_unkept` for the new fact and applies everything else; a migration ahead of the edge changes nothing anyone reads.

- [ ] **Step 1: Write the failing database test**

Create `tooling/scripts/tests/billing/an-invoice-keeps-what-it-moved.db.test.mjs`: a header comment saying what it proves (the door keeps what an invoice event moved once, writes nothing it cannot validate, keeps a real zero, and the ledger's floor refuses a bad value written any other way), `URL_`, `KEY`, `ANON` and `skip` (the three-way check of `platform/platform-metrics.db.test.mjs:42-52`, saying "this suite writes the Stripe ledger"), then:

```js
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";

const stamp = Date.now().toString(36);
let db;
const ids = [];
const ok = (r, what = "") => {
  assert.equal(r.error, null, `${what}: ${r.error?.message}`);
  return r.data;
};
/** One delivery's ledger row, as the claim leaves it. */
async function event(n, type = "invoice.paid") {
  const id = `evt_k8_${stamp}_${n}`;
  ids.push(id);
  ok(await db.from("billing_events").insert({ id, type }), `event ${n}`);
  return id;
}
const keep = (id, cents, currency) =>
  db.rpc("billing_event_keep_amount", { p_id: id, p_amount_cents: cents, p_currency: currency });
const row = async (id) => ok(await db.from("billing_events").select("amount_cents, currency, state").eq("id", id).single(), "row");

before(() => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
});
after(async () => {
  if (skip) return;
  for (const id of ids) await db.from("billing_events").delete().eq("id", id);
});

test("an invoice's amount and currency are kept on its event once; the first answer stands", { skip }, async () => {
  const id = await event(1);
  assert.deepEqual(await row(id), { amount_cents: null, currency: null, state: "applied" }, "a row from before reads absent");
  assert.equal(ok(await keep(id, 4900, "usd")), true);
  assert.deepEqual(await row(id), { amount_cents: 4900, currency: "usd", state: "applied" });
  assert.equal(ok(await keep(id, 7000, "eur")), false, "a second answer is not kept");
  assert.equal(ok(await keep(id, 4900, "usd")), false);
  assert.deepEqual(await row(id), { amount_cents: 4900, currency: "usd", state: "applied" });
});

test("a real zero is kept: a trial's first invoice moved nothing, and that is what it moved", { skip }, async () => {
  const id = await event(2);
  assert.equal(ok(await keep(id, 0, "usd")), true);
  assert.deepEqual(await row(id), { amount_cents: 0, currency: "usd", state: "applied" });
});

test("what cannot be validated is not written: no amount, a negative, no currency, capitals, two letters, four, a symbol, an id that is no event's", { skip }, async () => {
  const id = await event(3, "invoice.payment_failed");
  for (const [cents, currency] of [[null, "usd"], [-1, "usd"], [100, null], [100, "USD"], [100, "us"], [100, "usdx"], [100, "12$"]])
    assert.equal(ok(await keep(id, cents, currency), `${cents} ${currency}`), false, `${cents} ${currency}`);
  assert.equal(ok(await keep(`evt_k8_${stamp}_nobody`, 100, "usd")), false);
  assert.deepEqual(await row(id), { amount_cents: null, currency: null, state: "applied" });
  assert.ok((await keep(id, 2147483648, "usd")).error, "an amount an integer cannot hold is the database's refusal, which the edge logs");
  assert.deepEqual(await row(id), { amount_cents: null, currency: null, state: "applied" });
});

test("the ledger's own floor refuses a bad value written any other way", { skip }, async () => {
  const id = await event(4);
  assert.equal((await db.from("billing_events").update({ amount_cents: -1 }).eq("id", id)).error?.code, "23514");
  assert.equal((await db.from("billing_events").update({ currency: "USD" }).eq("id", id)).error?.code, "23514");
});

test("the door is the service role's alone", { skip: skip || (!ANON && "no SUPABASE_ANON_KEY in env") }, async () => {
  const id = await event(5);
  const anon = createClient(URL_, ANON, { auth: { persistSession: false } });
  assert.ok((await anon.rpc("billing_event_keep_amount", { p_id: id, p_amount_cents: 100, p_currency: "usd" })).error, "refused");
  assert.deepEqual(await row(id), { amount_cents: null, currency: null, state: "applied" });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run (database environment as in the Global Constraints): `node tooling/scripts/checks/test.mjs --db tooling/scripts/tests/billing/an-invoice-keeps-what-it-moved.db.test.mjs`
Expected: FAIL: `column billing_events.amount_cents does not exist` (the first select).

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/00300_an_invoice_keeps_what_it_moved.sql`:

```sql
-- 00300 · An invoice keeps what it moved.
--
-- The Reports lenses spec, K8. The Stripe webhook keeps each delivery once, by Stripe's event id, in billing_events, and
-- said nothing of what an invoice event was for: the amount of a paid invoice went into one yes-or-no (did the workspace
-- pay anything, last_paid_at) and was dropped. The operator's margin, billing mix and failed payments need it, so the
-- event's own row now keeps what the invoice moved and in what currency: the amount paid on invoice.paid, the amount due on
-- invoice.payment_failed (the event's type, already on the row, says which), by billing_event_keep_amount, once, the first
-- answer standing. A real zero is kept (a trial's first invoice moved nothing). A value that is not an amount or a
-- three-letter lowercase currency is not written, and the columns themselves refuse one written any other way.
--
-- The edge calls the door after the claim, as one more statement, and never in the claim's own insert: an edge ahead of
-- this migration that named a new column there would fail every Stripe claim until the migration was applied. Either
-- deploy order works: an edge ahead of it loses the new fact (a warning in its log) and applies everything else; a
-- migration ahead of the edge changes nothing anyone reads. Nothing is backfilled: a row from before reads null.
--
-- The lock. Two nullable columns are added to billing_events, which the Stripe door writes once per delivery: the guard of
-- 00259 is set, and every statement re-runs.
set local lock_timeout = '3s';
do $$
begin
  raise notice 'lock_timeout for this migration: %', current_setting('lock_timeout');
  if current_setting('lock_timeout') <> '3s' then
    raise warning 'this file was applied outside a transaction, so SET LOCAL did nothing: run it inside begin/commit, or set lock_timeout yourself before it';
  end if;
end $$;

alter table public.billing_events add column if not exists amount_cents integer
  check (amount_cents is null or amount_cents >= 0);
alter table public.billing_events add column if not exists currency text
  check (currency is null or currency ~ '^[a-z]{3}$');
comment on column public.billing_events.amount_cents is
  'What the invoice behind this event moved, in the smallest unit of its currency (K8): the amount paid on invoice.paid, the amount due on invoice.payment_failed. Kept once by billing_event_keep_amount; null for an event from before 00300 or that named no amount. A real zero is a zero.';
comment on column public.billing_events.currency is
  'The invoice''s currency as Stripe spells it, three lowercase letters (K8); null where amount_cents is.';

create or replace function public.billing_event_keep_amount(p_id text, p_amount_cents integer, p_currency text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_amount_cents is null or p_amount_cents < 0 or p_currency is null or p_currency !~ '^[a-z]{3}$' then
    return false;
  end if;
  update public.billing_events
     set amount_cents = p_amount_cents, currency = p_currency
   where id = p_id and amount_cents is null;
  return found;
end $$;
revoke all on function public.billing_event_keep_amount(text, integer, text) from public, anon, authenticated;
grant execute on function public.billing_event_keep_amount(text, integer, text) to service_role;
comment on function public.billing_event_keep_amount(text, integer, text) is
  'Keeps what an invoice event moved on its ledger row (K8), once: the first answer stands. False, writing nothing, for an amount that is null or negative or a currency that is not three lowercase letters, and for an event that already has an amount or is not on record. The Stripe door''s, best-effort, after the claim (apps/edge lib billing invoice-amount).';
```

- [ ] **Step 4: Apply it twice, record it, then the packages and the door**

Apply `00300` twice, then `--record` and the stack's ledger row (`'00300'`, `'an_invoice_keeps_what_it_moved'`). Regenerate the types the door's tests need and keep only this task's hunks: `corepack pnpm gen:db-types`, then `git diff packages/db/src/database.types.ts` and restore every other hunk by hand, keeping `billing_events`' `amount_cents` and `currency` (Row, Insert, Update) and the function `billing_event_keep_amount`; `grep -c template_version packages/db/src/database.types.ts` must print 0. (`_unique-keys.generated.json` must not change: nothing here adds a key.)

`packages/db/src/billing-events.ts`, with a header comment in the package's own voice (what it keeps, that the service role alone calls it, that a write that fails throws with the database's words, and its workspace scope: the ledger is the platform's):

```ts
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

type Db = SupabaseClient<Database>;

export async function keepInvoiceAmount(db: Db, eventId: string, amountCents: number, currency: string): Promise<boolean> {
  const { data, error } = await db.rpc("billing_event_keep_amount", {
    p_id: eventId,
    p_amount_cents: amountCents,
    p_currency: currency,
  });
  if (error) throw new Error(`billing_event_keep_amount: ${error.message}`);
  return data === true;
}
```

In `packages/db/src/index.ts`, add `export { keepInvoiceAmount } from "./billing-events";` after the `./ai-usage` lines. `apps/edge/lib/billing/invoice-amount.ts`, header comment saying what it is (K8, best-effort, why not in the claim) and then:

```ts
import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";
import { keepInvoiceAmount, type Database } from "../packages/db.js";
import { logger, errField } from "../log.js";

type InvoiceEvent = "invoice.paid" | "invoice.payment_failed";
type Moved = Partial<Pick<Stripe.Invoice, "amount_paid" | "amount_due" | "currency">>;

/** What the invoice moved, or tried to: null when Stripe sent no amount, a fraction or a negative, or a currency that is not three letters. */
export function invoiceAmountOf(type: InvoiceEvent, inv: Moved): { cents: number; currency: string } | null {
  const cents = type === "invoice.paid" ? inv.amount_paid : inv.amount_due;
  const currency = typeof inv.currency === "string" ? inv.currency.toLowerCase() : "";
  return typeof cents === "number" && Number.isInteger(cents) && cents >= 0 && /^[a-z]{3}$/.test(currency)
    ? { cents, currency }
    : null;
}

/** Kept beside the claim, best-effort: a failure is one warning, never a thrown error and never a retry for Stripe. */
export async function noteInvoiceAmount(db: SupabaseClient<Database>, eventId: string, type: InvoiceEvent, inv: Moved): Promise<void> {
  const moved = invoiceAmountOf(type, inv);
  if (!moved) return;
  try {
    await keepInvoiceAmount(db, eventId, moved.cents, moved.currency);
  } catch (e) {
    logger({ hook: "stripe" }).warn("stripe_amount_unkept", { event_id: eventId, error: errField(e) });
  }
}
```

In `apps/edge/api/stripe-webhook.ts`: add `import { noteInvoiceAmount } from "../lib/billing/invoice-amount.js";` with the other lib imports, and in `onInvoice`, between `if (dup) return dup;` and the `if (row) await notePayment(…)` line, add `await noteInvoiceAmount(d.db, event.id, event.type, inv);`. In `apps/edge/lib/log-events.ts` add `"stripe_amount_unkept",` in its sorted place (before `stripe_checkout_unrouted`).

- [ ] **Step 5: The door's tests, in `billing-webhook.test.mjs`**

Append after the failed-payment test (the file's `deliver(type, object, id)`, `tables()`, `writes()`, `claims()`, `logged()` and `first()` are used as they are):

```js
/* ------------------------------------------------ what an invoice moved (K8) */

/** The database's door for an invoice's amount, recording each call; `over` makes it answer another way. */
function amountDoor(over = {}) {
  const kept = [];
  return {
    kept,
    rpcs: { billing_event_keep_amount: over.door ?? ((a) => (kept.push([a.p_id, a.p_amount_cents, a.p_currency]), true)) },
  };
}
const withDoor = (door, rows = {}) => {
  const state = tables({ billing_accounts: [row({ status: "active" })], ...rows });
  const db = fakeDb(state, {}, door.rpcs, { unique: ["billing_events"] });
  setPg(db);
  return { state, db };
};
const invoice = (over = {}) => ({ id: "in_1", object: "invoice", customer: "cus_1", metadata: {}, ...over });

test("a paid invoice's amount is kept on its event, once, after the claim: the amount paid, in Stripe's lowercase currency; the workspace is marked paid as before", async () => {
  const door = amountDoor();
  const { db } = withDoor(door);
  const res = await deliver("invoice.paid", invoice({ amount_paid: 4900, amount_due: 4900, currency: "usd" }), "evt_inv_paid");
  assert.deepEqual(await res.json(), { ok: true });
  assert.deepEqual(door.kept, [["evt_inv_paid", 4900, "usd"]]);
  assert.ok(first(writes(db, "billing_accounts").find((s) => s.op === "update")).last_paid_at, "and last_paid_at is stamped as it was");
});

test("a failed payment keeps what was due; a trial's $0 invoice keeps the zero it is and marks nobody paid", async () => {
  const failed = amountDoor();
  withDoor(failed);
  await deliver("invoice.payment_failed", invoice({ amount_paid: 0, amount_due: 4900, currency: "usd" }), "evt_inv_failed");
  assert.deepEqual(failed.kept, [["evt_inv_failed", 4900, "usd"]]);

  const trial = amountDoor();
  const { db } = withDoor(trial);
  await deliver("invoice.paid", invoice({ amount_paid: 0, amount_due: 0, currency: "usd" }), "evt_inv_trial");
  assert.deepEqual(trial.kept, [["evt_inv_trial", 0, "usd"]]);
  assert.equal(writes(db, "billing_accounts").length, 0, "an invoice that took no money stamps no last_paid_at (billing.ts notePayment)");
});

test("an invoice that names no amount we can keep writes nothing: none, a fraction, a negative, a currency that is not three letters, none at all", async () => {
  const door = amountDoor();
  withDoor(door);
  for (const [n, over] of [
    [1, {}],
    [2, { amount_paid: 49.5, currency: "usd" }],
    [3, { amount_paid: -1, currency: "usd" }],
    [4, { amount_paid: 100, currency: "dollars" }],
    [5, { amount_paid: 100 }],
  ]) {
    const res = await deliver("invoice.paid", invoice(over), `evt_inv_odd_${n}`);
    assert.equal(res.status, 200, JSON.stringify(over));
  }
  assert.deepEqual(door.kept, []);
});

test("a database that refuses the amount costs the amount alone: the claim completes, the workspace is marked paid, the answer is 200 and one line says what was lost", async () => {
  const door = amountDoor({ door: () => { throw new Error("function billing_event_keep_amount does not exist"); } });
  const { state, db } = withDoor(door);
  const { result, lines } = await logged(() => deliver("invoice.paid", invoice({ amount_paid: 4900, currency: "usd" }), "evt_inv_refused"));
  assert.equal(result.status, 200);
  assert.deepEqual(await result.json(), { ok: true });
  assert.equal(state.billing_events.find((e) => e.id === "evt_inv_refused").state, "applied", "the claim is completed");
  assert.ok(first(writes(db, "billing_accounts").find((s) => s.op === "update")).last_paid_at);
  assert.deepEqual(lines.filter((l) => l.event === "stripe_amount_unkept").map((l) => l.event_id), ["evt_inv_refused"]);
});

test("a replayed event is answered as a duplicate before the ledger row is touched again", async () => {
  const door = amountDoor();
  withDoor(door);
  await deliver("invoice.paid", invoice({ amount_paid: 4900, currency: "usd" }), "evt_inv_twice");
  const again = await deliver("invoice.paid", invoice({ amount_paid: 4900, currency: "usd" }), "evt_inv_twice");
  assert.deepEqual(await again.json(), { ok: true, duplicate: true });
  assert.equal(door.kept.length, 1);
});
```

(The fake `billing_events` row carries `amount_cents` only where the double's door sets it: the SQL's once-only rule is proved in Step 1's file, and here only the wiring: one call per claim, with these arguments, best-effort.)

- [ ] **Step 6: Build, run the tests**

Run: `corepack pnpm --filter "./packages/*" build` (restore only the `agrees` comment hunks of `packages/db/dist/index.d.ts` by hand); `--db` the Step 1 file; plain `billing/billing-webhook.test.mjs`, `billing/billing.test.mjs`, `partners/partner-ledger.test.mjs`, `repo/log-events.test.mjs`, `repo/hygiene.test.mjs`; `--db` `billing/billing-event-claim.db.test.mjs`, `database/tenancy.db.test.mjs` (`billing_events` stays `none`), `database/privileges.db.test.mjs`, `database/migration-head.db.test.mjs`; then `corepack pnpm -r typecheck`, `corepack pnpm lint`, `corepack pnpm check:dead-exports` (305, unchanged: `keepInvoiceAmount` is read by `invoice-amount.ts`).
Expected: PASS.

- [ ] **Step 7: Stage**

```bash
corepack pnpm exec prettier --write tooling/scripts/tests/billing/an-invoice-keeps-what-it-moved.db.test.mjs tooling/scripts/tests/billing/billing-webhook.test.mjs packages/db/src/billing-events.ts packages/db/src/index.ts apps/edge/lib/billing/invoice-amount.ts apps/edge/api/stripe-webhook.ts apps/edge/lib/log-events.ts
git add supabase/migrations/00300_an_invoice_keeps_what_it_moved.sql supabase/migrations-ledger.json tooling/scripts/tests/billing/an-invoice-keeps-what-it-moved.db.test.mjs tooling/scripts/tests/billing/billing-webhook.test.mjs packages/db/src/billing-events.ts packages/db/src/index.ts packages/db/src/database.types.ts apps/edge/lib/billing/invoice-amount.ts apps/edge/api/stripe-webhook.ts apps/edge/lib/log-events.ts
git add packages/db/dist
```
(Stage the dist files with a real diff only.)

---

### Task 2: A judge call names its round (K8, migration 00301)

**Files:**
- Create: `supabase/migrations/00301_a_judge_call_names_its_round.sql`
- Modify: `packages/contracts/src/ai/usage.ts`, `packages/contracts/src/ai/shadow.ts`, `packages/contracts/src/ai/index.ts`, `packages/contracts/src/shared/schema-sets.ts`; `apps/edge/lib/model.ts`, `apps/edge/lib/shadow.ts`, `apps/edge/lib/leads/lead-wires.ts`; `packages/channels/src/leads/lead-judge.ts`; `packages/core/src/leads/judge.ts`, `packages/core/src/leads/runner/collect.ts`, `packages/core/src/leads/runner/rejudge.ts`
- Modify (tests): `tooling/scripts/tests/ai/ai-usage.db.test.mjs`, `ai/model-ledger.test.mjs`, `ai/shadow.test.mjs`, `leads/engine/lead-judge-call.test.mjs`, `leads/engine/lead-core.test.mjs`, `leads/engine/lead-runner.test.mjs`, `_lead-fixtures.mjs` (the shared `fakeJudge`)
- Regenerate (types only): `packages/db/src/database.types.ts`, `packages/contracts/src/schema-sets.generated.ts`

**Interfaces:**
- Produces (SQL): `ai_usage.subject_type text`, null for every row written before and by every purpose that has not said, otherwise `'lead_round'`: what `subject_id` names. The CHECK is written `= any (array['lead_round'])` so the set generator reads it (a one-value `in (…)` is stored as a plain equality, which `gen:schema-sets` does not see). One value because one writer says it today; the callers that already put a conversation, a contact, a message or a review in `subject_id` are not touched here, and a later one widens the CHECK in its own migration.
- Produces (TypeScript): `AI_SUBJECT_TYPES` and `AiSubjectType` (contracts `ai/usage.ts`, named in `ai/index.ts`, held to the column in `shared/schema-sets.ts`); `AiUsageBody.subject_type?`; `aiUsageBodyOf({ …, subjectType? })` and `ShadowCallFor.subjectType?`, each writing the key only when a type is named (absent, never null, so a row of any other purpose is byte-for-byte what it was); `ModelCallFor.subjectType?` (`apps/edge/lib/model.ts`) and `ShadowFor.subjectType?` (`apps/edge/lib/shadow.ts`); the round passed down the judge's path as one more optional argument: `LeadJudge.judge(plan, places, tenantId?, roundId?)` (channels), `LeadJudgeClient.beta.messages.create(params, call?: { tenantId?, roundId? })`, `judgeBatch(judge, plan, places, opId, tenantId?, roundId?)` (core); `collect.ts` and `rejudge.ts` pass `round.id`. `lead-wires.ts` turns a round id into `{ subjectId, subjectType: "lead_round" }` in one function (`roundOf`) used by the judge's client and by its shadow, so the primary's row and the second model's rows for one call name the same round.
- The judge's cost per search is then the ledger rows with `subject_type = 'lead_round'` joined to `lead_rounds` by `subject_id` and to its search: a read the operator's report makes later. Nothing reads it now.
- **Either deploy order, and the one that matters:** the migration first. A ledger row that names `subject_type` before the column exists is refused whole by PostgREST (PGRST204): the answer is kept and the usage row is lost until the migration is applied (`ai_usage_write_failed` in the log). Only judge rows name it, so only they are exposed in the gap. An older edge ignores the column.

- [ ] **Step 1: Write the failing tests**

(a) Append to `tooling/scripts/tests/ai/ai-usage.db.test.mjs`, using its `call()` and `put()` helpers and its `A`:

```js
test("a row may name what it was about: the lead judge's round; a subject type the table does not know is refused; every other row says none", { skip }, async () => {
  const round = crypto.randomUUID();
  await put([call(A, { purpose: "lead_judge", subject_id: round, subject_type: "lead_round" })]);
  const named = await db.from("ai_usage").select("subject_id, subject_type").eq("subject_id", round);
  assert.equal(named.error, null, named.error?.message);
  assert.deepEqual(named.data, [{ subject_id: round, subject_type: "lead_round" }]);
  const refused = await db.from("ai_usage").insert(call(A, { subject_id: round, subject_type: "conversation" }));
  assert.equal(refused.error?.code, "23514", "the closed set is the table's");
  const plain = await db.from("ai_usage").insert(call(A)).select("subject_type").single();
  assert.equal(plain.error, null, plain.error?.message);
  assert.equal(plain.data.subject_type, null, "a row of any other purpose says none");
});
```

(b) Append to `tooling/scripts/tests/ai/model-ledger.test.mjs`:

```js
test("a call that names what it was about says so on its row: the lead judge's round; a call that names none writes no subject_type at all", async () => {
  const t = world();
  model(said("one"), said("two"));
  const ROUND = "dddddddd-0000-4000-8000-000000000001";
  await callModel({ purpose: "lead_judge", body }, { tenantId: T, subjectId: ROUND, subjectType: "lead_round" });
  await callModel({ purpose: "lead_judge", body }, { tenantId: T });
  assert.deepEqual(
    t.ai_usage.map((r) => [r.subject_id ?? null, r.subject_type ?? null]),
    [[ROUND, "lead_round"], [null, null]],
  );
  assert.ok(!("subject_type" in t.ai_usage[1]), "absent, never null: the row is as it was before 00301");
});
```

(c) In `tooling/scripts/tests/ai/shadow.test.mjs`, change `judgeWorld`'s `judge` to take the round: `const judge = (env = ON, roundId) => logged(() => withEnv({ ...env, APIFY_TOKEN: "apify-token-for-this-file" }, () => leadWires().judge.judge(PLAN, refs.map(place), T, roundId)));` and add after the judge tests:

```js
test("a judge call names its round: the primary's row and every row of the second model's carry it with the subject type; a call that names none carries neither", async () => {
  const ROUND = "dddddddd-0000-4000-8000-000000000002";
  const named = judgeWorld([1, 2]);
  shadowFetch = jev().fetch;
  await named.judge(ON, ROUND);
  assert.equal(shadowRows(named.tables).length, 2 * named.keys.length);
  assert.ok(named.tables.ai_usage.length > 2 * named.keys.length, "a primary row and the shadow's");
  assert.deepEqual(
    [...new Set(named.tables.ai_usage.map((r) => `${r.subject_id}|${r.subject_type}`))],
    [`${ROUND}|lead_round`],
    "every row of the call names the round",
  );
  const bare = judgeWorld([1]);
  shadowFetch = jev().fetch;
  await bare.judge(ON);
  assert.ok(bare.tables.ai_usage.length > 0);
  assert.ok(bare.tables.ai_usage.every((r) => !("subject_type" in r) && r.subject_id == null), "no round named: as before");
});
```

(d) In `tooling/scripts/tests/leads/engine/lead-judge-call.test.mjs`, make `client()` keep the second argument (`const seen = []; const calls = [];` … `create: async (p, call) => { seen.push(p); calls.push(call); return fn(p, seen.length); }`, returning `{ seen, calls, beta }`) and add:

```js
test("the workspace and the round are handed to the client with every call, the retry without the beta included; none named, none handed", async () => {
  const c = client((p) => {
    if (p.fallbacks) throw Object.assign(new Error("fallbacks: unknown beta"), { status: 400 });
    return reply(good);
  });
  await leadJudge(c, "claude-opus-5", true).judge(PLAN, places, "tenant-1", "round-1");
  assert.deepEqual(c.calls, [{ tenantId: "tenant-1", roundId: "round-1" }, { tenantId: "tenant-1", roundId: "round-1" }]);
  const bare = client(() => reply(good));
  await leadJudge(bare, "claude-opus-5", false).judge(PLAN, places, "tenant-1");
  assert.equal(bare.calls[0].tenantId, "tenant-1");
  assert.equal(bare.calls[0].roundId, undefined);
});
```

(e) In `tooling/scripts/tests/leads/engine/lead-core.test.mjs`, after the judge's facts test:

```js
test("a batch is judged in the round it belongs to: the workspace and the round reach the judge, on the retry too; none named, none passed", async () => {
  const seen = [];
  let n = 0;
  const judge = {
    judge: async (plan, places, tenantId, roundId) => {
      seen.push([tenantId, roundId]);
      n += 1;
      return n === 1 ? { refused: true, why: "not JSON" } : fakeJudge().judge(plan, places);
    },
  };
  const f = factsOf(0, cleanPlace(card.mapItem(mapsItem(1))));
  await judgeBatch(judge, PLAN, [f], "op-4", "tenant-1", "round-1");
  assert.deepEqual(seen, [["tenant-1", "round-1"], ["tenant-1", "round-1"]]);
  seen.length = 0;
  n = 1;
  await judgeBatch(judge, PLAN, [f], "op-5");
  assert.deepEqual(seen, [[undefined, undefined]]);
});
```

(f) In `tooling/scripts/tests/_lead-fixtures.mjs`, `fakeJudge` records the round it is asked in: `const rounds = [];` beside `const calls = [];`, `return { calls, rounds, async judge(plan, places, _tenantId, roundId) { calls.push(places.map((p) => p.ref)); rounds.push(roundId); …` (the rest unchanged). In `tooling/scripts/tests/leads/engine/lead-runner.test.mjs`, in the ACCEPTANCE case after the `[13, 11]` assertion: `assert.deepEqual(w.judge.rounds, [w.round().id, w.round().id], "each call names the round it is paid in");` and in "a change that asks something new judges the first places once under it" after its batch-size assertion: `assert.deepEqual(w.judge.rounds.slice(paid), [w.round().id], "and the re-judge names it too");`.

- [ ] **Step 2: Run them to verify they fail**

Run: plain `ai/model-ledger.test.mjs`, `ai/shadow.test.mjs`, `leads/engine/lead-judge-call.test.mjs`, `leads/engine/lead-core.test.mjs`, `leads/engine/lead-runner.test.mjs`; `--db` `ai/ai-usage.db.test.mjs`.
Expected: FAIL: `subject_type` is absent on the rows, the judge's second argument is `undefined`, and the database has no such column.

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/00301_a_judge_call_names_its_round.sql`:

```sql
-- 00301 · A judge call names its round.
--
-- The Reports lenses spec, K8. The lead judge's model calls were written to the ledger (00273) with no subject, so what
-- the judge cost a search could not be told from what it cost another: subject_id is null on every judge row, and on the
-- other purposes it names a conversation, a contact, a message or a review with nothing to say which. Now a row may say
-- what its subject_id names: subject_type, null for every row written before and for every purpose that has not said,
-- and 'lead_round' for the lead judge's calls, whose subject_id is then the round it was paid in. The judge's cost per
-- search is that join, read by the operator's report later; nothing reads it yet.
--
-- The check is written = any (array[...]) so the closed set is generated (gen:schema-sets reads that form; a one-value
-- in (...) is stored as a plain equality it does not see). One value because one writer says it; a later writer widens it in
-- its own migration.
--
-- Either deploy order works, with one that matters: apply this BEFORE the edge that writes subject_type. A ledger row
-- that names a column the table lacks is refused whole, so the judge's usage rows would be lost in the gap (its answers
-- are kept; the log says ai_usage_write_failed). Only judge rows name it. No backfill: a row from before reads null.
--
-- The lock. One nullable column is added to ai_usage, written once per model call: the guard of 00259 is set, and every
-- statement re-runs.
set local lock_timeout = '3s';
do $$
begin
  raise notice 'lock_timeout for this migration: %', current_setting('lock_timeout');
  if current_setting('lock_timeout') <> '3s' then
    raise warning 'this file was applied outside a transaction, so SET LOCAL did nothing: run it inside begin/commit, or set lock_timeout yourself before it';
  end if;
end $$;

alter table public.ai_usage add column if not exists subject_type text
  check (subject_type is null or subject_type = any (array['lead_round']));
comment on column public.ai_usage.subject_type is
  'What subject_id names, where the writer said (K8): lead_round for the lead judge''s calls, whose subject_id is the round they were paid in (contracts AI_SUBJECT_TYPES). Null for every row written before 00301 and for every purpose that has not said: its purpose says what a null one was about.';
```

- [ ] **Step 4: Apply it twice, record it, regenerate the types, then the code**

Apply `00301` twice, then `--record` and the stack's ledger row (`'00301'`, `'a_judge_call_names_its_round'`). Run `corepack pnpm gen:db-types` and `corepack pnpm gen:schema-sets` and keep only this task's hunks: in `database.types.ts` the `ai_usage.subject_type` line of Row, Insert and Update; in `schema-sets.generated.ts` `"ai_usage.subject_type": ["lead_round"]`; `grep -c template_version packages/db/src/database.types.ts` must print 0.

`packages/contracts/src/ai/usage.ts`: after `MODEL_CALL_OUTCOMES`' block add

```ts
/** What an ai_usage row's subject_id names, where the writer said (00301); a purpose that has not said leaves both null. */
export const AI_SUBJECT_TYPES = ["lead_round"] as const;
export type AiSubjectType = (typeof AI_SUBJECT_TYPES)[number];
```

add to `AiUsageBody`, after `subject_id`: `/** What subject_id names, when the writer says: the lead judge's calls name their round. Absent otherwise (00301). */ subject_type?: AiSubjectType | null;`; give `aiUsageBodyOf`'s argument `subjectType?: AiSubjectType | null;` and its returned object `...(call.subjectType ? { subject_type: call.subjectType } : {}),` after `subject_id`. `packages/contracts/src/ai/shadow.ts`: `ShadowCallFor` gains `subjectType?: AiSubjectType | null;` (import the type from `./usage`) and `shadowBodies`' `base` gains `...(call.subjectType ? { subject_type: call.subjectType } : {}),` after `subject_id: call.subjectId,`. `packages/contracts/src/ai/index.ts`: name `AI_SUBJECT_TYPES` in the `./usage` value export and `AiSubjectType` in its type export. `packages/contracts/src/shared/schema-sets.ts`: `import type { AI_SUBJECT_TYPES, MODEL_CALL_OUTCOMES } from "../ai/usage";` and, beside the ledger's three, `Holds<Exactly<Of<typeof AI_SUBJECT_TYPES>, SchemaSet<"ai_usage.subject_type">>>,`.

`apps/edge/lib/model.ts`: `ModelCallFor` gains `/** What subjectId names (00301): the lead judge's round. */ subjectType?: AiSubjectType | null;` (type imported from `./packages/contracts.js`) and `recordCall` passes `subjectType: forWhom.subjectType ?? null` to `aiUsageBodyOf`. `apps/edge/lib/shadow.ts`: `ShadowFor` gains `subjectType?: AiSubjectType | null;` and `settle` passes `subjectType: who.subjectType ?? null` in the `shadowBodies` call. `packages/channels/src/leads/lead-judge.ts`: `LeadJudgeClient.beta.messages.create(params, call?: { tenantId?: string; roundId?: string })`; `LeadJudge.judge(plan, places, tenantId?: string, roundId?: string)`; `leadJudge`'s `judge(plan, places, tenantId, roundId)` passes `{ tenantId, roundId }` to **both** `create` calls (the first and the retry without the beta). `packages/core/src/leads/judge.ts`: `judgeBatch(judge, plan, places, opId, tenantId?: string, roundId?: string)` passes `judge.judge(plan, places, tenantId, roundId)`, and its header says the round is the ledger's subject. In `runner/collect.ts` (the call at 195-201) and `runner/rejudge.ts` (149-162) add `round.id` after `round.tenant_id`.

`apps/edge/lib/leads/lead-wires.ts`: add, above `portJudgeClient`:

```ts
/** The round a judge call was paid in, as the model port and the shadow name a subject (00301); nothing when none is named. */
const roundOf = (roundId?: string) => (roundId ? { subjectId: roundId, subjectType: "lead_round" as const } : {});
```

and make the client's `create(params, call)` pass `{ tenantId: call?.tenantId ?? null, ...roundOf(call?.roundId) }` as `callModel`'s second argument, and `shadowed`'s `judge(plan, places, tenantId, roundId)` pass `{ tenantId: tenantId ?? null, ...roundOf(roundId) }` to `startShadow` and `roundId` on to `inner.judge`.

- [ ] **Step 5: Build, run the tests**

Run: `corepack pnpm --filter "./packages/*" build` (restore only the `agrees` comment hunks of `packages/db/dist/index.d.ts` by hand: this task's source change to `packages/db` is its types only); the Step 2 files again; plain `ai/system-one.test.mjs`, `ai/model-port.test.mjs`, `leads/engine/lead-judge.test.mjs`, `leads/engine/lead-search.test.mjs`, `leads/engine/lead-pipeline.test.mjs`, `repo/hygiene.test.mjs`, `repo/contracts-barrels.test.mjs`; `--db` `database/privileges.db.test.mjs`, `database/tenancy.db.test.mjs`, `database/migration-head.db.test.mjs`, `leads/engine/lead-engine.db.test.mjs`; then `corepack pnpm -r typecheck` (the Holds line must compile), `corepack pnpm lint`, `corepack pnpm check:dead-exports` (305: `AI_SUBJECT_TYPES` is read by `schema-sets.ts`, `AiSubjectType` by the edge).
Expected: PASS.

- [ ] **Step 6: Stage**

```bash
corepack pnpm exec prettier --write packages/contracts/src/ai/usage.ts packages/contracts/src/ai/shadow.ts packages/contracts/src/ai/index.ts packages/contracts/src/shared/schema-sets.ts apps/edge/lib/model.ts apps/edge/lib/shadow.ts apps/edge/lib/leads/lead-wires.ts packages/channels/src/leads/lead-judge.ts packages/core/src/leads/judge.ts packages/core/src/leads/runner/collect.ts packages/core/src/leads/runner/rejudge.ts tooling/scripts/tests/ai/ai-usage.db.test.mjs tooling/scripts/tests/ai/model-ledger.test.mjs tooling/scripts/tests/ai/shadow.test.mjs tooling/scripts/tests/leads/engine/lead-judge-call.test.mjs tooling/scripts/tests/leads/engine/lead-core.test.mjs tooling/scripts/tests/leads/engine/lead-runner.test.mjs tooling/scripts/tests/_lead-fixtures.mjs
git add supabase/migrations/00301_a_judge_call_names_its_round.sql supabase/migrations-ledger.json packages/contracts/src packages/db/src/database.types.ts apps/edge/lib/model.ts apps/edge/lib/shadow.ts apps/edge/lib/leads/lead-wires.ts packages/channels/src/leads/lead-judge.ts packages/core/src/leads tooling/scripts/tests/ai/ai-usage.db.test.mjs tooling/scripts/tests/ai/model-ledger.test.mjs tooling/scripts/tests/ai/shadow.test.mjs tooling/scripts/tests/leads/engine/lead-judge-call.test.mjs tooling/scripts/tests/leads/engine/lead-core.test.mjs tooling/scripts/tests/leads/engine/lead-runner.test.mjs tooling/scripts/tests/_lead-fixtures.mjs
git add packages/contracts/dist packages/channels/dist packages/core/dist packages/db/dist
```
(Stage the dist files with a real diff only.)

---

### Task 3: A message keeps what it cost to send, and a member never sees it (K8, migration 00302)

**Files:**
- Create: `supabase/migrations/00302_a_message_keeps_what_it_cost_to_send.sql`
- Create: `tooling/scripts/tests/messages/a-message-keeps-what-it-cost-to-send.db.test.mjs`
- Modify: `packages/db/src/repositories/ingest.ts` (one function), `packages/db/src/index.ts` (the ingest block's export list), `packages/contracts/src/conversations/thread-dto.ts` and `index.ts`, `apps/dashboard/src/server/dto.ts`, `tooling/scripts/tests/conversations/inbox/inbox-server.test.mjs`
- Regenerate (types only): `packages/db/src/database.types.ts`

**Interfaces:**
- Produces (SQL): `public.message_keep_cost(p_tenant_id uuid, p_external_id text, p_pricing jsonb default null, p_segments integer default null) returns boolean`, SECURITY DEFINER, the service role's alone. It finds the **outbound** message of that workspace by the provider's id and merges into its `meta`: `pricing` (an object of at most 512 characters when written as text; anything else is ignored) and `segments` (an integer from 1 to 1000; anything else is ignored), **each once**: a key the row already has is left as it is, and a call with nothing new to keep touches no row at all. Answers whether it wrote. It never touches `status`, so the status guard's own merge of `meta.status_at` on a later receipt keeps both.
- Produces (TypeScript): `keepMessageCost(db, tenantId, externalId, { pricing?: Json; segments?: number }): Promise<boolean>` in `packages/db/src/repositories/ingest.ts` (the receipts' neighbour; `repositories/` is at its 20-module limit), exported from the barrel; it throws with the database's words on a refusal and its callers catch it. `memberMetaOf(meta: unknown): Record<string, unknown> | null` in contracts `conversations/thread-dto.ts`, named in `conversations/index.ts`: a message's meta without the operator's two keys, `pricing` and `segments`; `groupMessages` (`apps/dashboard/src/server/dto.ts`) builds every member-facing thread's messages through it (the conversations reader, a person's page and the Inbox's list all do).
- **What is kept and what is not.** Meta's `pricing` is `{ billable, pricing_model, category, type }` and **no amount**: the operator prices a `category` by the recipient's country with Meta's rate card at read time, so a number in the row would be a guess. The carrier's `segments` is the carrier's count, and only where it says (Task 5). **Why `messages.meta`:** the spec's place, and where `status_at` already lives; **why the strip:** `meta` goes to the browser whole (`MessageDto.meta`), and spec D11 says cost is never an owner's page. The owner's own data export (`apps/dashboard/app/api/v1/export/route.ts`) says meta as stored and is left alone: it is explicit, it holds no dollars, and no test runs that route.
- Cost, said plainly: one extra `UPDATE` of one row by its unique key per outbound WhatsApp message (Meta puts `pricing` on one of `sent` or `delivered`/`read`), and the realtime notice every message update already sends.
- Either deploy order: nothing reads it; an older edge writes no cost; a dashboard before the edge strips nothing it will meet.

- [ ] **Step 1: Write the failing database test**

Create `tooling/scripts/tests/messages/a-message-keeps-what-it-cost-to-send.db.test.mjs`: header comment (what it proves), `URL_`, `KEY`, `ANON`, `skip` (the three-way check of `platform/platform-metrics.db.test.mjs:42-52`, saying "this suite makes workspaces and messages"), then:

```js
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";

const stamp = Date.now().toString(36);
let db;
let A;
let B;
let thread;
let n = 0;
const ok = (r, what = "") => {
  assert.equal(r.error, null, `${what}: ${r.error?.message}`);
  return r.data;
};
const PRICING = { billable: true, pricing_model: "PMP", category: "utility", type: "regular" };

async function workspace(tag) {
  const id = ok(await db.from("tenants").insert({ slug: `harbor-cost-${tag}-${stamp}`, name: `Harbor Cost ${tag}` }).select("id").single()).id;
  const contact = ok(await db.from("contacts").insert({ tenant_id: id, phone_e164: `+1555013${tag === "a" ? "9101" : "9102"}` }).select("id").single()).id;
  const conversation = ok(await db.from("conversations").insert({ tenant_id: id, contact_id: contact }).select("id").single()).id;
  return { id, th: { tenant_id: id, contact_id: contact, conversation_id: conversation } };
}
const message = async (th, over = {}) =>
  ok(
    await db
      .from("messages")
      .insert({ ...th, channel: "whatsapp", direction: "outbound", sender: "ai", type: "text", body: "made-up words", status: "sent", external_id: `wamid.k8.${stamp}.${++n}`, meta: { source: "ai" }, ...over })
      .select("id, external_id")
      .single(),
    "message",
  );
const keep = (tenant, external, args = {}) => db.rpc("message_keep_cost", { p_tenant_id: tenant, p_external_id: external, ...args });
const metaOf = async (id) => ok(await db.from("messages").select("meta").eq("id", id).single(), "meta").meta;

before(async () => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
  A = await workspace("a");
  B = await workspace("b");
});
after(async () => {
  if (skip) return;
  for (const t of [A, B]) {
    if (!t) continue;
    await db.from("events").delete().eq("tenant_id", t.id);
    await db.from("tenants").delete().eq("id", t.id);
  }
});

test("Meta's pricing and the carrier's segments are merged into the outbound message's meta, each once, beside what was there; the first answer stands", { skip }, async () => {
  const m = await message(A.th);
  assert.equal(ok(await keep(A.id, m.external_id, { p_pricing: PRICING })), true);
  assert.deepEqual(await metaOf(m.id), { source: "ai", pricing: PRICING });
  assert.equal(ok(await keep(A.id, m.external_id, { p_pricing: { ...PRICING, category: "marketing" } })), false, "a second pricing is not kept");
  assert.equal(ok(await keep(A.id, m.external_id, { p_segments: 2 })), true, "the segments, later, are kept beside it");
  assert.equal(ok(await keep(A.id, m.external_id, { p_pricing: PRICING, p_segments: 3 })), false, "nothing new: no row is touched");
  assert.deepEqual(await metaOf(m.id), { source: "ai", pricing: PRICING, segments: 2 });
});

test("both at once land together; segments first and pricing after land the same", { skip }, async () => {
  const both = await message(A.th);
  assert.equal(ok(await keep(A.id, both.external_id, { p_pricing: PRICING, p_segments: 1 })), true);
  assert.deepEqual(await metaOf(both.id), { source: "ai", pricing: PRICING, segments: 1 });
  const late = await message(A.th);
  assert.equal(ok(await keep(A.id, late.external_id, { p_segments: 4 })), true);
  assert.equal(ok(await keep(A.id, late.external_id, { p_pricing: PRICING })), true);
  assert.deepEqual(await metaOf(late.id), { source: "ai", segments: 4, pricing: PRICING });
});

test("what is not a pricing object or a segment count is ignored and writes no row: an array, a word, an oversized object, 0, a negative, a thousand and one, nothing", { skip }, async () => {
  const m = await message(A.th);
  const before_ = await metaOf(m.id);
  for (const args of [
    { p_pricing: [1, 2] },
    { p_pricing: "utility" },
    { p_pricing: { category: "x".repeat(600) } },
    { p_segments: 0 },
    { p_segments: -1 },
    { p_segments: 1001 },
    {},
  ])
    assert.equal(ok(await keep(A.id, m.external_id, args), JSON.stringify(args).slice(0, 40)), false);
  assert.deepEqual(await metaOf(m.id), before_);
  assert.equal(ok(await keep(A.id, m.external_id, { p_segments: 1000 })), true, "the bounds are inclusive");
});

test("only this workspace's outbound message is found: another workspace's under the same id, a customer's own, an id nobody holds", { skip }, async () => {
  const mine = await message(A.th, { external_id: `wamid.k8.${stamp}.shared` });
  const theirs = await message(B.th, { external_id: `wamid.k8.${stamp}.shared` });
  const inbound = await message(A.th, { direction: "inbound", sender: "customer", status: "received" });
  assert.equal(ok(await keep(A.id, `wamid.k8.${stamp}.shared`, { p_pricing: PRICING })), true);
  assert.deepEqual(await metaOf(theirs.id), { source: "ai" }, "another workspace's message with the same provider id is untouched");
  assert.equal(ok(await keep(A.id, inbound.external_id, { p_pricing: PRICING })), false, "a customer's message is nobody's cost");
  assert.equal(ok(await keep(A.id, `wamid.k8.${stamp}.nobody`, { p_pricing: PRICING })), false);
  assert.deepEqual((await metaOf(mine.id)).pricing, PRICING);
});

test("a later receipt keeps the cost: the status guard merges its own time beside it", { skip }, async () => {
  const m = await message(A.th);
  ok(await keep(A.id, m.external_id, { p_pricing: PRICING }));
  ok(await db.from("messages").update({ status: "delivered" }).eq("id", m.id), "delivered");
  const meta = await metaOf(m.id);
  assert.deepEqual([meta.pricing, typeof meta.status_at?.delivered], [PRICING, "string"]);
});

test("the door is the service role's alone", { skip: skip || (!ANON && "no SUPABASE_ANON_KEY in env") }, async () => {
  const m = await message(A.th);
  const anon = createClient(URL_, ANON, { auth: { persistSession: false } });
  assert.ok((await anon.rpc("message_keep_cost", { p_tenant_id: A.id, p_external_id: m.external_id, p_pricing: PRICING })).error, "refused");
  assert.deepEqual(await metaOf(m.id), { source: "ai" });
});
```
(`before_` is a local name that does not shadow node:test's `before`.)

- [ ] **Step 2: Run it to verify it fails**

Run (database environment as in the Global Constraints): `node tooling/scripts/checks/test.mjs --db tooling/scripts/tests/messages/a-message-keeps-what-it-cost-to-send.db.test.mjs`
Expected: FAIL: `Could not find the function public.message_keep_cost`.

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/00302_a_message_keeps_what_it_cost_to_send.sql`:

```sql
-- 00302 · A message keeps what it cost to send.
--
-- The Reports lenses spec, K8. A WhatsApp receipt from Meta says what the message was billed as (its pricing: billable,
-- the pricing model, the category and the type) and the carrier's callback can say how many segments a text took; the edge
-- read the receipt's status and dropped the rest. The operator's cost per message needs both, so message_keep_cost merges
-- them into the outbound row's meta, found by the provider's own id, each once: a key the row has stays as it is, and a call
-- with nothing new to keep touches no row. Meta sends no amount and no currency: the operator prices a category by the
-- recipient's country at read time, so no number is guessed here.
--
-- What is not an object (a pricing) or an integer from 1 to 1000 (segments) is ignored. Only an outbound message of the
-- named workspace is touched, and never its status: messages_guard merges meta.status_at on a later receipt and keeps
-- what is kept here. The row's meta reaches a member's browser as it is stored, so contracts' memberMetaOf drops these
-- two keys from every thread a member reads.
--
-- The edge calls the door after the receipt's own write, best-effort (apps/edge lib whatsapp receipts, lib sms sms-cost);
-- a failure there costs the cost and nothing else. Either deploy order works. Nothing is backfilled.
--
-- The lock. A function only: nothing is locked. The guard of 00259 is set all the same, and every statement re-runs.
set local lock_timeout = '3s';
do $$
begin
  raise notice 'lock_timeout for this migration: %', current_setting('lock_timeout');
  if current_setting('lock_timeout') <> '3s' then
    raise warning 'this file was applied outside a transaction, so SET LOCAL did nothing: run it inside begin/commit, or set lock_timeout yourself before it';
  end if;
end $$;

create or replace function public.message_keep_cost(
  p_tenant_id   uuid,
  p_external_id text,
  p_pricing     jsonb default null,
  p_segments    integer default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pricing  jsonb := case when jsonb_typeof(p_pricing) = 'object' and length(p_pricing::text) <= 512 then p_pricing end;
  v_segments integer := case when p_segments between 1 and 1000 then p_segments end;
begin
  if v_pricing is null and v_segments is null then
    return false;
  end if;
  update public.messages
     set meta = meta || jsonb_strip_nulls(jsonb_build_object(
           'pricing',  case when meta ? 'pricing'  then null else v_pricing  end,
           'segments', case when meta ? 'segments' then null else v_segments end))
   where tenant_id = p_tenant_id and external_id = p_external_id and direction = 'outbound'
     and ((v_pricing is not null and not (meta ? 'pricing')) or (v_segments is not null and not (meta ? 'segments')));
  return found;
end $$;
revoke all on function public.message_keep_cost(uuid, text, jsonb, integer) from public, anon, authenticated;
grant execute on function public.message_keep_cost(uuid, text, jsonb, integer) to service_role;
comment on function public.message_keep_cost(uuid, text, jsonb, integer) is
  'Keeps what a message cost to send on its outbound row (K8): Meta''s pricing (an object: billable, pricing_model, category, type; no amount) and the carrier''s segments (1 to 1000), merged into meta, each once, by the provider''s id in this workspace. Ignores what is not those; touches no row when nothing is new; never touches status. Answers whether it wrote. The receipt doors'' best-effort call (apps/edge lib whatsapp receipts, lib sms sms-cost).';
```

- [ ] **Step 4: Apply it twice, record it, regenerate the types, then the packages**

Apply `00302` twice, then `--record` and the stack's ledger row (`'00302'`, `'a_message_keeps_what_it_cost_to_send'`). Run `corepack pnpm gen:db-types` and keep only the function `message_keep_cost` (Args `p_tenant_id`, `p_external_id`, optional `p_pricing` and `p_segments`; Returns boolean) in `packages/db/src/database.types.ts`; `grep -c template_version packages/db/src/database.types.ts` must print 0.

In `packages/db/src/repositories/ingest.ts`, after `recordStatusByExternalId`:

```ts
/**
 * What it cost to send a message, as the provider said it, kept once on its outbound row (message_keep_cost, 00302):
 * Meta's `pricing` and the carrier's `segments`, the first answer of each standing. A refusal throws with the database's
 * words; the receipt doors that call it catch that and log it, so a cost never costs a receipt. Answers whether a row was
 * written.
 */
export async function keepMessageCost(
  db: Db,
  tenantId: string,
  externalId: string,
  cost: { pricing?: Json; segments?: number },
): Promise<boolean> {
  const { data, error } = await db.rpc("message_keep_cost", {
    p_tenant_id: tenantId,
    p_external_id: externalId,
    ...(cost.pricing !== undefined ? { p_pricing: cost.pricing } : {}),
    ...(cost.segments !== undefined ? { p_segments: cost.segments } : {}),
  });
  if (error) throw new Error(`message_keep_cost: ${error.message}`);
  return data === true;
}
```

and name it in the ingest block of `packages/db/src/index.ts`, after `recordStatusByExternalId,`. In `packages/contracts/src/conversations/thread-dto.ts`, after `messageAt`:

```ts
/** The keys of a message's meta that are the operator's, never a member's: what it cost to send (K8). */
const OPERATOR_META_KEYS = ["pricing", "segments"] as const;

/**
 * A message's meta as a member's browser may be sent it: every key but the operator's. A meta that is not an object (a
 * column the read left out) is null, which is what the DTO already allows.
 */
export function memberMetaOf(meta: unknown): Record<string, unknown> | null {
  if (meta === null || typeof meta !== "object" || Array.isArray(meta)) return null;
  const kept: Record<string, unknown> = { ...meta };
  for (const key of OPERATOR_META_KEYS) delete kept[key];
  return kept;
}
```

and `memberMetaOf` in the barrel line `export { messageAt, isOptedOut } from "./thread-dto";`. In `apps/dashboard/src/server/dto.ts`, import it with the other contracts names and change `meta: m.meta as MessageDto["meta"],` to `meta: memberMetaOf(m.meta),`.

- [ ] **Step 5: The strip's test, then the run**

In `tooling/scripts/tests/conversations/inbox/inbox-server.test.mjs`, add `memberMetaOf` to the file's existing `@chanlytics/contracts` import and append, using its `message()`, `uuid()`, `A`, `ago()` and `HOUR`:

```js
test("a thread's messages carry their meta as a member may be sent it: the operator's cost keys are dropped, every other key stays", () => {
  const cost = {
    pricing: { billable: true, pricing_model: "PMP", category: "utility", type: "regular" },
    segments: 2,
  };
  const meta = { source: "ai", confidence: 0.9, handled: "ai", intent: "pricing", status_at: { sent: "2026-10-03T10:00:00Z" } };
  const rows = [
    message("m1", uuid(1), A, { direction: "outbound", sender: "ai", status: "delivered", created_at: ago(2 * HOUR), channel_ts: ago(2 * HOUR), meta: { ...meta, ...cost } }),
    message("m2", uuid(1), A, { meta: null }),
  ];
  const [out, inbound] = groupMessages(rows).get(uuid(1));
  assert.deepEqual(out.meta, meta, "REGRESSION: a member's browser was sent what it cost to send");
  assert.equal(inbound.meta, null);
  assert.deepEqual(memberMetaOf({ pricing: 1 }), {});
  for (const odd of [undefined, "x", [1], 7]) assert.equal(memberMetaOf(odd), null);
});
```

Run: `corepack pnpm --filter "./packages/*" build` (restore only the `agrees` hunks of `packages/db/dist/index.d.ts` by hand); `--db` the Step 1 file; plain `conversations/inbox/inbox-server.test.mjs`, `conversations/inbox/inbox-words.test.mjs`, `people/threads-people.test.mjs`, `people/person-identity.test.mjs`, `repo/contracts-barrels.test.mjs`, `repo/hygiene.test.mjs`; `--db` `messages/a-message-moves-from-queued-to-read-through-its-guard.db.test.mjs`, `database/privileges.db.test.mjs`, `database/migration-head.db.test.mjs`; then `corepack pnpm -r typecheck`, `corepack pnpm lint`, `corepack pnpm check:dead-exports` (305: `keepMessageCost` is read by Tasks 4 and 5, so until Task 4 lands this one export shows as dead; the check is run again, and must be clean, at the end of Task 4).
Expected: PASS.

- [ ] **Step 6: Stage**

```bash
corepack pnpm exec prettier --write tooling/scripts/tests/messages/a-message-keeps-what-it-cost-to-send.db.test.mjs tooling/scripts/tests/conversations/inbox/inbox-server.test.mjs packages/db/src/repositories/ingest.ts packages/db/src/index.ts packages/contracts/src/conversations/thread-dto.ts packages/contracts/src/conversations/index.ts apps/dashboard/src/server/dto.ts
git add supabase/migrations/00302_a_message_keeps_what_it_cost_to_send.sql supabase/migrations-ledger.json tooling/scripts/tests/messages/a-message-keeps-what-it-cost-to-send.db.test.mjs tooling/scripts/tests/conversations/inbox/inbox-server.test.mjs packages/db/src/repositories/ingest.ts packages/db/src/index.ts packages/db/src/database.types.ts packages/contracts/src/conversations apps/dashboard/src/server/dto.ts
git add packages/db/dist packages/contracts/dist
```
(Stage the dist files with a real diff only.)

---

### Task 4: A WhatsApp receipt keeps what Meta says the message cost (K8, the edge)

**Files:**
- Create: `apps/edge/lib/whatsapp/receipts.ts`, `tooling/scripts/tests/whatsapp/a-receipt-keeps-what-meta-says-it-cost.test.mjs`
- Modify: `packages/channels/src/whatsapp.ts` (the status's `pricing`, `WaPricing`, `waPricingOf`), `packages/channels/src/index.ts`, `apps/edge/api/whatsapp.ts` (the statuses branch moves out; imports; the header's one sentence), `apps/edge/lib/whatsapp/persist.ts` (`PgStep`), `apps/edge/lib/log-events.ts` (`pg_cost_failed`), `tooling/scripts/tests/whatsapp/whatsapp-door.test.mjs`
- Bank: `tooling/scripts/tests/baselines/*.json` and the `docs/debt.md` / `docs/takeover.md` blocks the ratchets rewrite, **falls only**

**Interfaces:**
- Consumes: `keepMessageCost` and `message_keep_cost` (Task 3), `recordStatusByExternalId`, `pgSafe` (`persist.ts`).
- Produces: `WaPricing = { billable?: boolean; pricing_model?: string; category?: string; type?: string }` (a type alias, not an interface, so it is a `Json` without a cast) and `waPricingOf(raw: unknown): WaPricing | null` in `packages/channels/src/whatsapp.ts`: `billable` only when it is a boolean; `pricing_model`, `category` and `type` only when each is one word of letters, digits, `_` and `-`, at most 40 characters (Meta's documented values: `PMP`/`CBP`; `marketing`, `utility`, `authentication`, `authentication-international`, `service`, `marketing_lite`, `referral_conversion`; `regular`, `free_customer_service`, `free_entry_point`); every other key, an amount or a currency among them, is dropped; null when nothing is left. `recordReceipts(db: SupabaseClient<Database> | null, tenantId: string | null, statuses: Receipt[]): Promise<void>` in `apps/edge/lib/whatsapp/receipts.ts`: the statuses branch of the door, moved whole (a `wa_status` line for every receipt whether or not it is recorded, then for `sent`, `delivered`, `read` and `failed` the status write under `pgSafe("status")`, in parallel across receipts) with one addition: when the receipt carries a pricing, `keepMessageCost` under `pgSafe("cost")`, after the status and in its own guard. `PgStep` gains `"cost"` (log name `pg_cost_failed`). `WaChangeValue.statuses` items gain `pricing?: unknown`.
- **Why the branch moves.** `apps/edge/api/whatsapp.ts::POST` is a measured function (185 lines, 52 branches, depth 8 in `complexity.json`), and a line added to it is a red build. Moving the branch lowers the door's numbers and takes its one `as unknown as Json` cast with it (`casts.json`): both falls must be banked. The new module holds no cast (`asJson` is a JSON round trip, which is what the compiler is being told the parse already knew), names no table and keeps no index read, so it adds nothing to a ratchet. The existing door test (`whatsapp-door.test.mjs`) runs the real door over this code unchanged and must stay green: it is the proof the move changed nothing.
- **Best-effort, said precisely.** The cost is one `UPDATE` after the receipt's own, never before it, never an extra provider call, never a throw out of the door: a refused or missing door is `pg_cost_failed` and nothing else (the receipt's status has landed, and the 200 is the same). Meta puts `pricing` on one of `sent` or `delivered`/`read` for a message; a second one (a retry, a delivered after a sent that carried it) finds the key there and writes nothing.
- Either deploy order: an edge ahead of 00302 logs `pg_cost_failed` per priced receipt and records every status as before; a migration ahead of the edge changes nothing. The dashboard (Task 3's strip) goes with or before this edge.

- [ ] **Step 1: Write the failing tests**

Create `tooling/scripts/tests/whatsapp/a-receipt-keeps-what-meta-says-it-cost.test.mjs`:

```js
/**
 * What Meta says a message cost to send (the Reports lenses spec, K8): its pricing is read as Meta documents it and
 * nothing else of it is kept, and the receipts of one delivery land as they always did with the cost kept beside the
 * status, in its own guard: a database that refuses the cost costs the receipt nothing.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { waPricingOf } from "@chanlytics/channels";
import { fakeDb } from "../_fake-db.mjs";
import { at } from "../_cron-doors-world.mjs";
import { logLineOf } from "../_log-lines.mjs";

for (const k of ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]) delete process.env[k];
const { recordReceipts } = await import(at("apps/edge/lib/whatsapp/receipts.ts"));

const T = "aaaaaaaa-0000-4000-8000-0000000000c1";
const PRICING = { billable: true, pricing_model: "PMP", category: "utility", type: "regular" };

test("Meta's pricing is kept as Meta says it, in the words it documents, and nothing else: no amount, no currency, no key of ours", () => {
  assert.deepEqual(waPricingOf(PRICING), PRICING);
  assert.deepEqual(
    waPricingOf({ billable: false, pricing_model: "PMP", category: "service", type: "free_customer_service" }),
    { billable: false, pricing_model: "PMP", category: "service", type: "free_customer_service" },
  );
  assert.deepEqual(waPricingOf({ billable: true, pricing_model: "CBP", category: "authentication-international" }), {
    billable: true,
    pricing_model: "CBP",
    category: "authentication-international",
  });
  assert.deepEqual(
    waPricingOf({ billable: true, category: "utility", amount: 0.0136, currency: "USD", note: "x" }),
    { billable: true, category: "utility" },
    "Meta sends no amount; if one ever came it is not ours to keep",
  );
});

test("what is not a pricing is none, and a bad key costs only itself: no object, no known key, a sentence, a control character, a megabyte, a billable that is a word", () => {
  for (const bad of [
    undefined, null, "utility", 7, [], [{ category: "utility" }], {}, { amount: 1 },
    { category: "two words" }, { category: "a;b" }, { category: "x".repeat(41) }, { category: "\u0000" },
    { category: "x".repeat(1_000_000) }, { billable: "true" }, { category: 5 },
  ])
    assert.equal(waPricingOf(bad), null, `${JSON.stringify(bad)?.slice(0, 40)}`);
  assert.deepEqual(waPricingOf({ billable: "true", category: "utility" }), { category: "utility" });
});

/** Three messages of one workspace, the door's database, and the cost door as the database models it. */
function world(over = {}) {
  const tables = {
    messages: ["queued", "sent", "sent"].map((status, i) => ({
      id: `m${i + 1}`, tenant_id: T, external_id: `wamid.${i + 1}`, status, direction: "outbound", meta: {},
    })),
  };
  const kept = [];
  const db = fakeDb(tables, {}, {
    message_keep_cost: (a) => {
      if (over.refuse) throw new Error("function message_keep_cost does not exist");
      kept.push([a.p_tenant_id, a.p_external_id, a.p_pricing]);
      return true;
    },
  });
  return { tables, db, kept };
}
const receipt = (id, status, over = {}) => ({ id, status, recipient_id: "15550139999", ...over });
async function logged(fn) {
  const lines = [];
  const real = { log: console.log, warn: console.warn, error: console.error };
  for (const k of Object.keys(real)) console[k] = (...args) => lines.push(args);
  try {
    return { result: await fn(), lines };
  } finally {
    Object.assign(console, real);
  }
}
const events = (lines) => lines.map(logLineOf).filter(Boolean).map((l) => l.event);

test("receipts land as they always did, a failure with what Meta said, and a receipt that carries a pricing has it kept beside its status", async () => {
  const w = world();
  const errors = [{ code: 131047, title: "Re-engagement message", message: "Re-engagement message" }];
  await recordReceipts(w.db, T, [
    receipt("wamid.1", "sent", { pricing: PRICING }),
    receipt("wamid.2", "delivered"),
    receipt("wamid.3", "failed", { errors }),
    receipt("wamid.1", "deleted"),
  ]);
  assert.deepEqual(w.tables.messages.map((m) => m.status), ["sent", "delivered", "failed"]);
  assert.deepEqual(w.tables.messages[2].error, { errors }, "a failure keeps what Meta said about it");
  assert.ok(!("error" in w.tables.messages[1]), "and a receipt without errors writes none");
  assert.deepEqual(w.kept, [[T, "wamid.1", PRICING]]);
});

test("a receipt with no pricing, or a pricing that is nothing, keeps nothing", async () => {
  const w = world();
  await recordReceipts(w.db, T, [
    receipt("wamid.1", "delivered"),
    receipt("wamid.2", "read", { pricing: {} }),
    receipt("wamid.3", "sent", { pricing: "utility" }),
  ]);
  assert.deepEqual(w.kept, []);
  assert.deepEqual(w.tables.messages.map((m) => m.status), ["delivered", "read", "sent"]);
});

test("a database that refuses the cost costs the receipt nothing: its status has landed, nothing is thrown, and one line per lost cost says so", async () => {
  const w = world({ refuse: true });
  const { lines } = await logged(() =>
    recordReceipts(w.db, T, [receipt("wamid.1", "sent", { pricing: PRICING }), receipt("wamid.2", "delivered", { pricing: PRICING })]),
  );
  assert.deepEqual(w.tables.messages.map((m) => m.status), ["sent", "delivered", "sent"]);
  assert.deepEqual(events(lines).filter((e) => e.startsWith("pg_")), ["pg_cost_failed", "pg_cost_failed"]);
});

test("with no database or no workspace nothing is written, and every receipt is still said on the log", async () => {
  const w = world();
  const all = [receipt("wamid.1", "sent", { pricing: PRICING }), receipt("wamid.9", "deleted")];
  const { lines } = await logged(async () => {
    await recordReceipts(null, T, all);
    await recordReceipts(w.db, null, all);
  });
  assert.deepEqual(events(lines), ["wa_status", "wa_status", "wa_status", "wa_status"]);
  assert.deepEqual([w.kept, w.tables.messages.map((m) => m.status)], [[], ["queued", "sent", "sent"]]);
});
```

In `tooling/scripts/tests/whatsapp/whatsapp-door.test.mjs`, in `world()`'s `open`, replace `const db = fakeDb(tables, faults, { runtime_stamp: () => `stamp-${i}` });` by

```js
      const db = fakeDb(tables, faults, {
        runtime_stamp: () => `stamp-${i}`,
        message_keep_cost: ({ p_tenant_id, p_external_id, p_pricing }) => {
          const row = tables.messages.find((m) => m.tenant_id === p_tenant_id && m.external_id === p_external_id);
          if (!row || row.meta?.pricing) return false;
          row.meta = { ...(row.meta ?? {}), pricing: p_pricing };
          return true;
        },
      });
```

and add after the receipts test:

```js
test("a receipt that carries Meta's pricing has it kept on the message it is about, once, through the real door; the status moves as always and the answer is 200", async () => {
  const w = world();
  const to = w.customer();
  const wamid = `wamid.${w.i}.price`;
  w.tables.messages.push({ id: "out", tenant_id: w.T, external_id: wamid, status: "queued", direction: "outbound", meta: {} });
  w.open();
  receptionist();
  const pricing = { billable: true, pricing_model: "PMP", category: "utility", type: "regular" };
  const receipt = (status, over = {}) => ({ id: wamid, status, timestamp: now(), recipient_id: to, ...over });
  assert.deepEqual(await answer(await deliver(w.change({ statuses: [receipt("sent", { pricing })] }))), [200, { ok: true }]);
  const row = w.tables.messages.find((m) => m.id === "out");
  assert.deepEqual([row.status, row.meta.pricing], ["sent", pricing]);
  // Meta says it once; a second pricing (a retry, a delivered after a sent that carried it) finds the key there.
  await deliver(w.change({ statuses: [receipt("delivered", { pricing: { ...pricing, category: "marketing" } })] }));
  assert.deepEqual([row.status, row.meta.pricing.category], ["delivered", "utility"]);
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: plain `whatsapp/a-receipt-keeps-what-meta-says-it-cost.test.mjs`, `whatsapp/whatsapp-door.test.mjs`.
Expected: FAIL: `waPricingOf` is not exported, the receipts module is not found, and the door keeps no pricing.

- [ ] **Step 3: Write `waPricingOf`**

In `packages/channels/src/whatsapp.ts`: `WaChangeValue.statuses` becomes `Array<{ id?: string; status?: string; recipient_id?: string; errors?: unknown; pricing?: unknown }>`, and beside the inbound normalisers add:

```ts
/**
 * What Meta says a message was billed as, on a `sent`, `delivered` or `read` receipt (K8): whether it is billable, the
 * model that priced it and its category and type. Meta sends no amount and no currency, so none is kept: the operator
 * prices a category by the recipient's country with Meta's rate card. A type alias, so it is a Json without a cast.
 */
export type WaPricing = { billable?: boolean; pricing_model?: string; category?: string; type?: string };

/** A word of Meta's: letters, digits, `_` and `-`, at most 40. Anything else (a sentence, a control character, a megabyte) is not one. */
const PRICING_WORD = /^[A-Za-z][A-Za-z0-9_-]{0,39}$/;

/** Meta's `pricing` as kept, read without trusting any of it; null when nothing of it is kept. */
export function waPricingOf(raw: unknown): WaPricing | null {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const out: WaPricing = {};
  if (typeof r.billable === "boolean") out.billable = r.billable;
  for (const key of ["pricing_model", "category", "type"] as const) {
    const word = r[key];
    if (typeof word === "string" && PRICING_WORD.test(word)) out[key] = word;
  }
  return Object.keys(out).length ? out : null;
}
```

and in `packages/channels/src/index.ts` add `waPricingOf` to the `./whatsapp` value export and `WaPricing` to its type export.

- [ ] **Step 4: The receipts module, the door, the guard's name**

Create `apps/edge/lib/whatsapp/receipts.ts`:

```ts
/**
 * A delivery's receipts, the statuses Meta posts for the messages we sent, one by one: each is said on the log, each of
 * sent, delivered, read and failed moves its message by the provider's id (recordStatusByExternalId), and what Meta says
 * the message cost to send is kept beside the status, once (K8, keepMessageCost). Moved out of the webhook whole: its
 * order, its log line and its failure rules are the ones it had, and the cost is one more statement after the status in
 * its own guard, so a cost the database refuses never costs a receipt its status.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { waPricingOf, type WaChangeValue } from "../packages/channels.js";
import { keepMessageCost, recordStatusByExternalId, type Database, type Json } from "../packages/db.js";
import { phoneTail } from "../packages/contracts.js";
import { logger } from "../log.js";
import { pgSafe } from "./persist.js";

type Receipt = NonNullable<WaChangeValue["statuses"]>[number];

/** The receipt's word, when it is one the ledger keeps: a status that is none of these (deleted, played) lands nowhere. */
function receiptStatusOf(s: string | undefined): "sent" | "delivered" | "read" | "failed" | null {
  return s === "sent" || s === "delivered" || s === "read" || s === "failed" ? s : null;
}

/** What Meta sent as `errors`, as the JSON it is: the body was parsed from JSON, so the round trip changes nothing and tells the compiler what the parse knew. */
const asJson = (v: unknown): Json => JSON.parse(JSON.stringify(v));

export async function recordReceipts(
  db: SupabaseClient<Database> | null,
  tenantId: string | null,
  statuses: Receipt[],
): Promise<void> {
  const L = logger();
  await Promise.all(
    statuses.map(async (s) => {
      L.info("wa_status", { id: s.id, status: s.status, to_tail: phoneTail(s.recipient_id), errors: s.errors });
      const status = receiptStatusOf(s.status);
      if (!db || !tenantId || !s.id || !status) return;
      const id = s.id;
      await pgSafe("status", () =>
        recordStatusByExternalId(db, tenantId, id, status, s.errors ? asJson({ errors: s.errors }) : undefined),
      );
      const pricing = waPricingOf(s.pricing);
      if (pricing) await pgSafe("cost", () => keepMessageCost(db, tenantId, id, { pricing }));
    }),
  );
}
```

In `apps/edge/api/whatsapp.ts`: replace the whole `} else if (field === "messages" && v.statuses) { … }` branch (lines 179-195 in this tree: the `await Promise.all(...)` over `v.statuses`) by `await recordReceipts(db, tenantId, v.statuses);`; add `import { recordReceipts } from "../lib/whatsapp/receipts.js";` with the other `lib/whatsapp` imports; drop `recordStatusByExternalId` from the db import and `Json` from the type import (both are now unused; `RoutedChannel` stays, and so do `pgSafe` and `IngestFailed`); in the header's "Shape" sentence say that the statuses are `lib/whatsapp/receipts.ts`. In `apps/edge/lib/whatsapp/persist.ts` add `| "cost"` to `PgStep` between `"allowlist_evt"` and `"echo"`; in `apps/edge/lib/log-events.ts` add `"pg_cost_failed",` in its sorted place.

- [ ] **Step 5: Build, run, bank**

Run: `corepack pnpm --filter "./packages/*" build` (restore only the `agrees` hunks of `packages/db/dist/index.d.ts` by hand); the two test files of Step 2; plain `whatsapp/ad-referral.test.mjs`, `whatsapp/ingest-failed.test.mjs`, `whatsapp/inbound-executed.test.mjs`, `whatsapp/sink-says-what-a-message-became.test.mjs`, `repo/log-events.test.mjs`, `repo/hygiene.test.mjs`; `corepack pnpm -r typecheck`, `corepack pnpm lint`, `corepack pnpm check:dead-exports` (305: `keepMessageCost` is read now).
Then the ratchets: `node tooling/scripts/checks/test.mjs tooling/scripts/tests/repo/code-health-ratchets.test.mjs` is expected to fail on **falls** (`apps/edge/api/whatsapp.ts::POST#1` and the door's cast count, possibly `route-doors.json`); bank them with `UPDATE_BASELINES=1 node tooling/scripts/checks/test.mjs tooling/scripts/tests/repo/code-health-ratchets.test.mjs`, check with `git diff --stat tooling/scripts/tests/baselines docs/debt.md docs/takeover.md` that every changed number went down and nothing else moved, and run it again plain. Also `tooling/scripts/tests/types/index-reads-are-counted.test.mjs`.
Expected: PASS, except main's own two reds the earlier batches recorded (`dashboard-a-v2.css::brief-chip`, `today-brief-words.ts`).

- [ ] **Step 6: Stage**

```bash
corepack pnpm exec prettier --write packages/channels/src/whatsapp.ts packages/channels/src/index.ts apps/edge/lib/whatsapp/receipts.ts apps/edge/api/whatsapp.ts apps/edge/lib/whatsapp/persist.ts apps/edge/lib/log-events.ts tooling/scripts/tests/whatsapp/a-receipt-keeps-what-meta-says-it-cost.test.mjs tooling/scripts/tests/whatsapp/whatsapp-door.test.mjs
git add packages/channels/src/whatsapp.ts packages/channels/src/index.ts apps/edge/lib/whatsapp/receipts.ts apps/edge/api/whatsapp.ts apps/edge/lib/whatsapp/persist.ts apps/edge/lib/log-events.ts tooling/scripts/tests/whatsapp/a-receipt-keeps-what-meta-says-it-cost.test.mjs tooling/scripts/tests/whatsapp/whatsapp-door.test.mjs tooling/scripts/tests/baselines docs/debt.md docs/takeover.md
git add packages/channels/dist
```
(Stage the dist files with a real diff only, and only the baseline hunks that fell.)

---

### Task 5: A text's callback keeps the carrier's segment count where it says one (K8, the edge)

**Files:**
- Create: `apps/edge/lib/sms/sms-cost.ts`
- Modify: `packages/channels/src/lines/sms.ts` (`SmsStatus`, `smsStatusFrom`), `apps/edge/api/sms-status.ts` (one import, one call), `apps/edge/lib/log-events.ts` (`sms_cost_unkept`), `tooling/scripts/tests/sms/sms-status-door.test.mjs`

**Interfaces:**
- Consumes: `keepMessageCost` and `message_keep_cost` (Task 3).
- Produces: `SmsStatus.numSegments: number | null` (`smsStatusFrom` reads the callback's `NumSegments`: a whole number from 1 to 1000, else null: absent is not zero); `keepSmsSegments(db, tenantId, s: Pick<SmsStatus, "messageSid" | "numSegments">): Promise<void>` in `apps/edge/lib/sms/sms-cost.ts`: nothing when the callback named no count, otherwise `keepMessageCost(db, tenantId, sid, { segments })` in a try, a failure is `L.warn("sms_cost_unkept")` and never a throw. The door calls it after the status it recorded (a recorded word: `sent`, `delivered`, `read`, `failed`), before its closing log line; an interim word (queued, accepted, sending) returns earlier as it always did and keeps nothing.
- **What this will and will not keep, said before anyone builds on it.** Twilio documents `num_segments` as **0 in the create response when a Messaging Service sends**, and this product sends only through one; the status callback's documented parameters do not list `NumSegments` either (Twilio's own pages, read 4 Oct). So this capture may keep **nothing** in production, and it is shipped because it costs nothing when the count is absent and is right when Twilio sends one. The send path (`deliver`, the one door) is deliberately not touched: reading the count off the create response would be zero, and the door is a measured function that may not grow. Twilio's Message resource holds `num_segments` and `price` for each text, and a later operator report can fetch them by the sid the row already holds; the first real text after deploy says whether the callback carries a count (notes, decision 5).
- Either deploy order: an edge ahead of 00302 logs `sms_cost_unkept` for a count that came and records every status as before.

- [ ] **Step 1: Write the failing tests**

In `tooling/scripts/tests/sms/sms-status-door.test.mjs`, give `world()` a parameter and the cost door: change `function world() {` to `function world({ refuse = false } = {}) {`, add `const kept = [];` after `const tables = …`, replace the `fakeDb(tables, {}, { get_line_credentials: … })` call by

```js
  const db = fakeDb(
    tables,
    {},
    {
      get_line_credentials: ({ p_line_id }) => (p_line_id === line.id ? { auth_token: TOKEN } : {}),
      message_keep_cost: ({ p_tenant_id, p_external_id, p_segments }) => {
        if (refuse) throw new Error("function message_keep_cost does not exist");
        kept.push([p_tenant_id, p_external_id, p_segments]);
        if (row.meta?.segments) return false;
        row.meta = { ...(row.meta ?? {}), segments: p_segments };
        return true;
      },
    },
  );
```

and return `kept` from `world()` (`return { T, LINE, TOKEN, line, row, tables, kept, form, post };`). Append:

```js
test("a callback that carries the carrier's segment count has it kept on the text, once, beside the status", async () => {
  const w = world();
  assert.equal(await w.post(w.form({ MessageStatus: "delivered", NumSegments: "3" })), 200);
  assert.deepEqual([w.row.status, w.row.meta], ["delivered", { segments: 3 }]);
  assert.equal(await w.post(w.form({ MessageStatus: "read", NumSegments: "5" })), 200);
  assert.deepEqual([w.row.status, w.row.meta.segments], ["read", 3], "the first answer stands");
  assert.equal(w.kept[0][0], w.T);
  assert.equal(w.kept[0][1], w.row.external_id);
});

test("a callback with no count, or with one that is not a count, keeps nothing and lands as ever: absent, 0, a word, 1001, a fraction, empty; an interim word keeps nothing either", async () => {
  const w = world();
  for (const n of [undefined, "0", "x", "1001", "2.5", ""]) {
    assert.equal(await w.post(w.form({ MessageStatus: "delivered", ...(n === undefined ? {} : { NumSegments: n }) })), 200, `${n}`);
  }
  assert.equal(await w.post(w.form({ MessageStatus: "queued", NumSegments: "2" })), 200);
  assert.deepEqual([w.kept, w.row.meta, w.row.status], [[], undefined, "delivered"]);
});

test("a database that refuses the count costs the callback nothing: the status has landed, the answer is 200, and one line says what was lost", async () => {
  const w = world({ refuse: true });
  const lines = [];
  const real = { log: console.log, warn: console.warn, error: console.error };
  for (const k of Object.keys(real)) console[k] = (...args) => lines.push(args);
  let status;
  try {
    status = await w.post(w.form({ MessageStatus: "delivered", NumSegments: "2" }));
  } finally {
    Object.assign(console, real);
  }
  assert.equal(status, 200);
  assert.equal(w.row.status, "delivered");
  const said = lines.map((l) => {
    try {
      return JSON.parse(l[0]).event;
    } catch {
      return null;
    }
  });
  assert.ok(said.includes("sms_cost_unkept"), "the loss is on the log");
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `node tooling/scripts/checks/test.mjs tooling/scripts/tests/sms/sms-status-door.test.mjs`
Expected: FAIL: the first case finds no `meta` on the row (nothing reads `NumSegments`).

- [ ] **Step 3: The callback's field, and the keeping**

In `packages/channels/src/lines/sms.ts`: `SmsStatus` gains

```ts
  /** The carrier's segment count where the callback carries one (K8): a whole number from 1 to 1000. Twilio's documented callback does not list it, so this is often null; null is absent, never zero. */
  numSegments: number | null;
```

and `smsStatusFrom` computes `const segments = Number(form.NumSegments);` and returns `numSegments: Number.isInteger(segments) && segments >= 1 && segments <= 1000 ? segments : null,`. Create `apps/edge/lib/sms/sms-cost.ts`:

```ts
/**
 * What a text took, as the carrier's callback says it (the Reports lenses spec, K8): the segment count, kept once on the
 * message by its sid, best-effort. Twilio's documented callback does not list NumSegments, and the create response is 0
 * for a Messaging Service send, so this may keep nothing in production: absent is not zero, and a text with no count has
 * none. It never throws: a failure is one warning, and the status the callback carried has landed already.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { SmsStatus } from "../packages/channels.js";
import { keepMessageCost, type Database } from "../packages/db.js";
import { logger, errField } from "../log.js";

export async function keepSmsSegments(
  db: SupabaseClient<Database>,
  tenantId: string,
  s: Pick<SmsStatus, "messageSid" | "numSegments">,
): Promise<void> {
  if (s.numSegments === null) return;
  try {
    await keepMessageCost(db, tenantId, s.messageSid, { segments: s.numSegments });
  } catch (e) {
    logger({ tenant_id: tenantId }).warn("sms_cost_unkept", { sid: s.messageSid, error: errField(e) });
  }
}
```

In `apps/edge/api/sms-status.ts`: `import { keepSmsSegments } from "../lib/sms/sms-cost.js";` with the other lib imports, and after the `try { await recordStatusByExternalId(…) } catch (e) { …return empty(503); }` block, before `L.info("sms_status", …)`: `await keepSmsSegments(db, line.tenant_id, s);`. In `apps/edge/lib/log-events.ts` add `"sms_cost_unkept",` in its sorted place.

- [ ] **Step 4: Build, run the tests**

Run: `corepack pnpm --filter "./packages/*" build`; the Step 2 file; plain `sms/sms.test.mjs`, `sms/sms-door.test.mjs`, `sms/sms-ingress.test.mjs`, `lines/lines-twilio.test.mjs`, `repo/log-events.test.mjs`, `repo/hygiene.test.mjs`; `corepack pnpm -r typecheck`, `corepack pnpm lint`, `corepack pnpm check:dead-exports` (305), and the ratchets `repo/code-health-ratchets.test.mjs` and `types/index-reads-are-counted.test.mjs` (a plain run: this task adds no fall and no rise).
Expected: PASS.

- [ ] **Step 5: Stage**

```bash
corepack pnpm exec prettier --write packages/channels/src/lines/sms.ts apps/edge/lib/sms/sms-cost.ts apps/edge/api/sms-status.ts apps/edge/lib/log-events.ts tooling/scripts/tests/sms/sms-status-door.test.mjs
git add packages/channels/src/lines/sms.ts apps/edge/lib/sms/sms-cost.ts apps/edge/api/sms-status.ts apps/edge/lib/log-events.ts tooling/scripts/tests/sms/sms-status-door.test.mjs
git add packages/channels/dist
```
(Stage the dist files with a real diff only.)

---

### Task 6: Regenerate, say it in the reference, prove the batch, hand Ruben his steps

**Files:**
- Regenerate: `supabase/schema.sql`, `docs/data-model.md`; confirm `packages/db/src/database.types.ts`, `packages/contracts/src/schema-sets.generated.ts` and `tooling/scripts/tests/_unique-keys.generated.json` hold only what Tasks 1-3 kept
- Modify: `docs/system-prd.md` (the paragraph "What the rows keep for the Reports")

- [ ] **Step 1: Regenerate, keeping only this batch's hunks**

With 00296-00302 applied to the stack: `corepack pnpm gen:schema-sets`, `corepack pnpm gen:db-types`, `corepack pnpm --filter "./packages/*" build`, `corepack pnpm gen:schema-snapshot`, `corepack pnpm gen:data-model`. The shared stack holds what this tree does not, so compare each generated file with its staged version (`git diff -- <file>`) and **keep only the hunks these three migrations explain** (D3a's hunks are already staged and stay), restoring every other hunk to the staged bytes with the Edit tool, never `git checkout`:
- `supabase/schema.sql` and `database.types.ts`: the columns `amount_cents` and `currency` on `billing_events` (with their checks and comments) and the function `billing_event_keep_amount`; the column `subject_type` on `ai_usage` (its CHECK and comment); the function `message_keep_cost` (with its comment and ACL lines);
- `docs/data-model.md`: the two columns of `billing_events` and the one of `ai_usage`;
- `schema-sets.generated.ts`: `ai_usage.subject_type` only (`["lead_round"]`); `_unique-keys.generated.json`: no change (this batch adds no unique key);
- `grep -c template_version supabase/schema.sql packages/db/src/database.types.ts` must print 0 for both, and no `events_y20…` partition name may have moved.

Run: plain `database/migrations.test.mjs`, `database/migration-ledger.test.mjs`, `database/generated/check-db-types.test.mjs`, `database/generated/schema-snapshot.test.mjs`, `database/generated/a-function-lives-as-its-newest-migration-wrote-it.test.mjs` (`billing_event_keep_amount` and `message_keep_cost` live as 00300 and 00302 wrote them, byte for byte in `schema.sql`), `docs/data-model.test.mjs`; `--db` `database/migration-head.db.test.mjs`, `database/generated/unique-keys.db.test.mjs`.
Expected: PASS (`schema-snapshot.db` may stay red for the other lane's objects, as for the earlier batches: check object by object that no difference is this batch's).

- [ ] **Step 2: Say what the rows keep**

In `docs/system-prd.md`, in the paragraph "What the rows keep for the Reports (00287–00299)…", change the range in its heading to `(00287–00302)` and add after its last bullet:

```markdown
- an invoice event: what it moved, `amount_cents` and `currency` on its own `billing_events` row (Stripe's `amount_paid` for a paid invoice, `amount_due` for a failed one), written once after the claim by `billing_event_keep_amount` (00300) and best-effort: a replay of the event never touches it, a real zero is kept as a zero, and an event from before reads absent;
- a model call of the lead judge: `subject_type = 'lead_round'` with the round as `subject_id` on its `ai_usage` rows, the shadow's included (00301), so the cost of a search is a sum by round; a call that names no round keeps neither;
- a WhatsApp message: Meta's `pricing` (`billable`, `pricing_model`, `category`, `type`) in `messages.meta.pricing`, kept once by `message_keep_cost` (00302) from the first receipt that carries it; Meta sends no amount and no currency, so a cost is the operator's rate card read against this category at report time;
- a text: the carrier's segment count in `messages.meta.segments`, where its status callback carries one (Twilio's documented callback does not list it, so a text may keep none);
- none of these is a member's: `memberMetaOf` drops `pricing` and `segments` from every thread the dashboard sends (money and cost are the operator's), and no page reads them yet.
```

The file is CRLF: use the byte-exact helper.

- [ ] **Step 3: The checks CI runs, locally, file by file**

Run: `corepack pnpm --filter "./packages/*" build`, `corepack pnpm -r typecheck`, `corepack pnpm lint` (holds its baseline in `docs/debt.md`, or fewer), `git status --short packages/*/dist` (every dist file with a real diff staged; the `agrees` hunks of `packages/db/dist/index.d.ts` restored by hand), `corepack pnpm check:dead-exports` (305, unchanged: every export this batch adds is read by the end of Task 4 and Task 5), and the ratchets `node tooling/scripts/checks/test.mjs tooling/scripts/tests/repo/code-health-ratchets.test.mjs` and `tooling/scripts/tests/types/index-reads-are-counted.test.mjs`.
Expected: clean, except main's own two reds the earlier batches recorded (`dashboard-a-v2.css::brief-chip`, `today-brief-words.ts`). What Task 4 banked (the falls in `apps/edge/api/whatsapp.ts`: `POST#1` and a cast) is already staged with its `docs/debt.md` and `docs/takeover.md` blocks; nothing here raises a baseline.

- [ ] **Step 4: Every test this batch touched, once more**

One per command (plain): `billing/billing-webhook`, `ai/{model-ledger,shadow}`, `leads/engine/{lead-judge-call,lead-core,lead-runner}`, `conversations/inbox/inbox-server`, `whatsapp/{a-receipt-keeps-what-meta-says-it-cost,whatsapp-door,ad-referral,ingest-failed,inbound-executed,sink-says-what-a-message-became}`, `sms/{sms-status-door,sms,sms-door,sms-ingress}`, `lines/lines-twilio`, `repo/{event-kinds,log-events,hygiene,contracts-barrels,ops-hygiene}`. With the stack, `--db`: `billing/an-invoice-keeps-what-it-moved`, `ai/ai-usage`, `messages/a-message-keeps-what-it-cost-to-send`, `database/{tenancy,privileges,migration-head,event-shapes}`, `ops/sweep-registry`.
Expected: PASS (`event-shapes` #11 and `schema-snapshot.db` as in Step 1).

- [ ] **Step 5: The three things the stack cannot show**

No provider and no production database is reached, and no page is drawn, so no browser run is owed. What is Stripe's, Meta's, Twilio's and production's alone, each a read and never an action: that a real invoice event keeps its amount (the production Stripe key is a `sk_test_` key, so the first test-mode invoice says so); that a real WhatsApp receipt carries `pricing` (the first `sent` receipt after deploy, the next template or reply a customer's number is sent); and whether Twilio's status callback carries `NumSegments` at all (the first real text). Step 6, item 4, holds the reads (and a fourth, which says the judge's round landed).

- [ ] **Step 6: Hand back**

Tell Ruben, in his words: nothing a customer or an owner sees changes, and no page shows any of this. What starts being kept, for the operator's cost and margin reading when it is built: what each invoice moved and in which currency; which search round each lead-judge model call was paid in; what Meta says each WhatsApp message cost to send (its category and whether it is billable, not an amount: Meta sends none); and the segments of a text, where the carrier says them. Then his production steps, none of which this plan takes:

1. **Land after D3a, in order:** Reports phase A, batch 1, batch 2, D3a, then this batch (stacked on all of them). Main has moved and holds its own 00287-00289 and 00296-00299: `dev-tools/reports-renumber.mjs` on the stack (dry run, then `--apply`) **before** rebasing renumbers the run above main's head, as batch 2's hand-back says; delete the old ledger keys and `--record`.
2. **Migrations first, then the apps, and 00301 is the one that must come first.** `supabase db push --linked --dry-run` must list exactly the renumbered files and nothing else (never `--include-all`), then `--yes`. The edge writes `subject_type` on every lead-judge ledger row after this merges: a table without the column refuses the whole row, so a judge call made in the gap keeps its answer and loses its usage row. 00300 and 00302 either side: the edge calls their doors best-effort, and an edge ahead of them loses at most the new fact and logs it (`stripe_amount_unkept`, `pg_cost_failed`, `sms_cost_unkept`). The dashboard that hides the cost keys from a thread ships in the same merge as the edge that writes them.
3. **Nothing to set:** no environment variable, no secret, no provider setting. Stripe, Meta and Twilio already send what is read; the Stripe webhook's secret and the pilot number's token are the ones already in use.
4. **To look at afterwards (reads, not actions):** after the first test-mode invoice, `select id, type, amount_cents, currency from billing_events order by received_at desc limit 5`; after the next WhatsApp message a workspace sends, `select meta->'pricing', status from messages where channel = 'whatsapp' and direction = 'outbound' order by created_at desc limit 5`; after the next text, `select meta->>'segments', status from messages where channel = 'sms' and direction = 'outbound' order by created_at desc limit 5` (empty is an answer: it means Twilio's callback does not carry the count, and the segments are then read from Twilio's Message resource by the sid the row already holds, which a later report may do); after the next lead search, `select subject_type, subject_id, count(*) from ai_usage where purpose = 'lead_judge' and subject_type is not null group by 1, 2 order by max(created_at) desc limit 5`. An empty `pg_cost_failed` or `stripe_amount_unkept` log family says the doors were there.
5. **Decided by Ruben, after the first texts:** whether to keep the SMS leg if they show no segment count (one small module and one call to remove). The notes say what that costs.

Everything stays staged and uncommitted until he says to commit.

---

## Coverage of §10

| Spec row | Where |
| --- | --- |
| K8 `calls.cost` into the ledger's dollars | D3a Task 5 (`call_cost_usd`, `platform_metrics.voice_usd`); not here, and why in the anchors table |
| K8 Meta `pricing` from WhatsApp statuses, kept in `messages.meta` | Tasks 3 and 4 (`message_keep_cost`, `waPricingOf`, `recordReceipts`); Meta sends no amount, said in the anchors table |
| K8 SMS `num_segments` | Task 5 (the callback's `NumSegments`, `keepSmsSegments`); may keep nothing in production, said in the task and in the hand-back |
| K8 invoice `amount_cents` on `billing_events` | Task 1 (`billing_event_keep_amount`, `invoiceAmountOf`, `noteInvoiceAmount`) |
| K8 `subject_type` and the round on lead judge `ai_usage` rows | Task 2 (`AI_SUBJECT_TYPES`, `ai_usage.subject_type`, the round from the runner to the ledger) |
| D-rule: best-effort on live provider webhooks, never fail, block or delay | Tasks 1, 4 and 5, each with a test that the door refusing the capture still lands the webhook; Task 2's judge call keeps its answer when the ledger row is refused |
| D-rule: money and cost are the operator's, never an owner's page | Task 3 (`memberMetaOf` drops the two keys from every member-facing thread read); no other task adds a reader |
| D9: no backfill, absent never zero | Global Constraints; Tasks 1 and 3 (a real zero kept, a missing key not written) |



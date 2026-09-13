/**
 * The Stripe webhook, run: a delivery signed with the SDK's own test helper,
 * over a database in memory, with the Stripe calls it makes faked. Until 12
 * Sep 2026 the handler's text was pinned and nothing had ever run it.
 *
 * A bad signature is refused before anything is read. A subscription event
 * is kept once and applied: the row, the workspace's status, the bell. A
 * replay writes nothing. A failed payment marks the row and rings. A
 * deleted customer is forgotten so Checkout can start again. A type nobody
 * acts on is still kept once; an event about no workspace is answered and
 * left.
 */
import { test, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import Stripe from "stripe";
import { fakeDb } from "./_fake-db.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
process.env.STRIPE_WEBHOOK_SECRET = "whsec_test_only";
const { setStripeClient } = await import(at("apps/edge/lib/billing.ts"));
const { setPg } = await import(at("apps/edge/lib/pg.ts"));
const hook = await import(at("apps/edge/api/stripe-webhook.ts"));

const sdk = new Stripe("sk_test_only");
const SECRET = process.env.STRIPE_WEBHOOK_SECRET;
const T = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const subs = new Map();
setStripeClient({ webhooks: sdk.webhooks, subscriptions: { retrieve: async (id) => { const s = subs.get(id); if (!s) throw new Error(`no such subscription ${id}`); return s; } } });
after(() => { setStripeClient(null); setPg(null); });

const row = (over = {}) => ({
  tenant_id: T, mode: "stripe", status: "trialing", price_id: "price_1", stripe_customer_id: "cus_1", stripe_subscription_id: "sub_1",
  trial_end: "2026-09-20T00:00:00Z", current_period_end: "2026-09-20T00:00:00Z", cancel_at: null, cancel_at_period_end: false,
  card_brand: "visa", card_last4: "4242", last_payment_failed_at: null, last_paid_at: null, facts: {}, created_at: "2026-09-01T00:00:00Z", updated_at: "2026-09-01T00:00:00Z", ...over,
});
const tables = (over = {}) => ({
  tenants: [{ id: T, slug: "harbor", name: "Harbor", status: "active", timezone: "America/New_York" }],
  billing_accounts: [row()], billing_events: [], notifications: [], events: [],
  ...over,
});
const sub = (over = {}) => ({
  id: "sub_1", object: "subscription", customer: "cus_1", metadata: { tenant_id: T }, status: "active",
  items: { data: [{ price: { id: "price_1" }, current_period_end: 1758326400 }] },
  trial_end: null, cancel_at: null, cancel_at_period_end: false, default_payment_method: { card: { brand: "visa", last4: "4242" } },
  ...over,
});
let seq = 0;
function deliver(type, object, id = `evt_${++seq}`) {
  const payload = JSON.stringify({ id, object: "event", type, data: { object }, created: Math.floor(Date.now() / 1000), api_version: "2024-06-20" });
  const sig = sdk.webhooks.generateTestHeaderString({ payload, secret: SECRET });
  return hook.POST(new Request("http://localhost/api/stripe-webhook", { method: "POST", headers: { "stripe-signature": sig }, body: payload }));
}
const first = (s) => (Array.isArray(s.values) ? s.values[0] : s.values);
const writes = (db, table) => db.seen.filter((s) => s.table === table && ["insert", "update", "upsert", "delete"].includes(s.op));

beforeEach(() => { subs.clear(); subs.set("sub_1", sub()); });

test("a bad signature is refused before anything is read", async () => {
  const db = fakeDb(tables());
  setPg(db);
  const res = await hook.POST(new Request("http://localhost/api/stripe-webhook", { method: "POST", headers: { "stripe-signature": "t=1,v1=nope" }, body: JSON.stringify({ id: "evt_x", type: "customer.subscription.updated" }) }));
  assert.equal(res.status, 400);
  assert.deepEqual(await res.json(), { ok: false, error: "signature" });
  assert.equal(db.seen.length, 0, "nothing read, nothing written");
});

test("a subscription event is kept once and applied: the row follows Stripe's reading, the card comes from the full read, the ledger says so", async () => {
  const db = fakeDb(tables());
  setPg(db);
  subs.set("sub_1", sub({ default_payment_method: { card: { brand: "mastercard", last4: "0005" } } }));
  const res = await deliver("customer.subscription.updated", sub({ default_payment_method: null }));
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true, status: "active", switched: null });
  const kept = writes(db, "billing_events");
  assert.equal(kept.length, 1);
  assert.equal(first(kept[0]).type, "customer.subscription.updated");
  assert.equal(first(kept[0]).tenant_id, T);
  const up = writes(db, "billing_accounts").find((s) => s.op === "update");
  assert.ok(up, "the row is written");
  assert.deepEqual([first(up).status, first(up).card_brand, first(up).card_last4], ["active", "mastercard", "0005"], "the status, and the card from the full read, not the event's copy");
  assert.ok(up.filters.some(([op, col]) => op === "eq" && col === "updated_at"), "written only if the row is still what the reading was planned against");
  assert.equal(writes(db, "events").length, 1);
  assert.equal(first(writes(db, "events")[0]).kind, "billing.updated");
  assert.equal(writes(db, "tenants").length, 0, "trialing to active: the receptionist was on and stays on");
});

test("a replay changes nothing: the id hits the primary key, the answer is 200, and the row is not written", async () => {
  const db = fakeDb(tables(), { "billing_events.insert": { message: "duplicate key value violates unique constraint", code: "23505" } });
  setPg(db);
  const res = await deliver("customer.subscription.updated", sub(), "evt_seen_before");
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true, duplicate: true });
  assert.equal(writes(db, "billing_accounts").length, 0);
  assert.equal(writes(db, "events").length, 0);
});

test("an apply that fails gives the claim back, so Stripe's retry is not answered with its own half-finished attempt", async () => {
  // The dedupe row is written BEFORE the work it guards, which is what keeps
  // two concurrent deliveries of one event from both acting. It also meant a
  // failed apply kept the claim: the 500 asked Stripe to try again, the retry
  // read our own row and answered "duplicate", and the change — a pause, a
  // failed payment, a cancellation — was lost for good.
  const state = tables();
  const broken = fakeDb(state, { "billing_accounts.update": { message: "connection reset" } });
  setPg(broken);
  const failed = await deliver("customer.subscription.updated", sub({ status: "paused" }), "evt_retried");
  assert.equal(failed.status, 500, "the write failed, so Stripe is asked to try again");
  assert.deepEqual(state.billing_events, [], "and the claim is given back, not left standing");
  assert.ok(broken.seen.some((q) => q.table === "billing_events" && q.op === "delete"), "given back explicitly");

  // The same delivery again, against the same ledger, with the database well.
  subs.set("sub_1", sub({ status: "paused" }));
  const healthy = fakeDb(state);
  setPg(healthy);
  const retried = await deliver("customer.subscription.updated", sub({ status: "paused" }), "evt_retried");
  assert.equal(retried.status, 200);
  assert.deepEqual(await retried.json(), { ok: true, status: "paused", switched: "paused" }, "the retry APPLIES the change, rather than reporting a duplicate");
  assert.equal(first(writes(healthy, "tenants").at(-1)).status, "paused", "the receptionist is actually stopped");
  assert.equal(state.billing_events.length, 1, "and now the event is on record once");
});

test("a late word about a subscription the workspace has already left does not overwrite the one it is on", async () => {
  // Stripe retries for days and promises no order, so a `deleted` for a
  // subscription that was cancelled and replaced arrives long after the
  // replacement is live. Routed by customer, it used to be applied: the row
  // took the dead id and the paused status, the receptionist went quiet on a
  // paying customer, and Refresh followed the dead id and did it again.
  const db = fakeDb(tables({ billing_accounts: [row({ status: "active", stripe_subscription_id: "sub_1" })] }));
  setPg(db);
  const stale = await deliver("customer.subscription.deleted", sub({ id: "sub_0", status: "canceled" }));
  assert.equal(stale.status, 200);
  assert.deepEqual(await stale.json(), { ok: true, superseded: true });
  assert.equal(writes(db, "billing_accounts").length, 0, "the live subscription is left alone");
  assert.equal(writes(db, "tenants").length, 0, "the receptionist keeps answering");
  assert.equal(writes(db, "notifications").length, 0, "and nobody is told a subscription ended");
  assert.equal(writes(db, "billing_events").length, 1, "the delivery is still kept once, so it is not reconsidered");

  // A subscription that would keep the receptionist ON is a genuine
  // replacement — one made outside Checkout, say — and is applied.
  const db2 = fakeDb(tables({ billing_accounts: [row({ status: "canceled", stripe_subscription_id: "sub_1" })] }));
  setPg(db2);
  subs.set("sub_2", sub({ id: "sub_2", status: "trialing" }));
  const fresh = await deliver("customer.subscription.created", sub({ id: "sub_2", status: "trialing" }));
  assert.equal(fresh.status, 200);
  const up = writes(db2, "billing_accounts").find((q) => q.op === "update");
  assert.equal(first(up).stripe_subscription_id, "sub_2", "the row follows the live subscription");
});

test("a paused subscription pauses the workspace and rings once; resuming turns it back on and rings again", async () => {
  const db = fakeDb(tables({ billing_accounts: [row({ status: "active" })] }));
  setPg(db);
  // Stripe's own copy, not the event's: the handler re-reads the subscription,
  // which is how the card survives an event that carries none.
  subs.set("sub_1", sub({ status: "paused" }));
  const paused = await deliver("customer.subscription.paused", sub({ status: "paused" }));
  assert.deepEqual(await paused.json(), { ok: true, status: "paused", switched: "paused" });
  const stopped = writes(db, "tenants").filter((s) => s.op === "update");
  assert.equal(first(stopped.at(-1)).status, "paused", "the workspace is paused");
  assert.equal(writes(db, "notifications").length, 1);
  assert.match(first(writes(db, "notifications")[0]).title, /paused/i);
  assert.equal(first(writes(db, "notifications")[0]).kind, "billing");
  assert.equal(first(writes(db, "events")[0]).kind, "billing.paused");

  subs.set("sub_1", sub({ status: "active" }));
  const back = await deliver("customer.subscription.resumed", sub({ status: "active" }));
  assert.deepEqual(await back.json(), { ok: true, status: "active", switched: "resumed" });
  assert.equal(first(writes(db, "tenants").filter((s) => s.op === "update").at(-1)).status, "active", "the receptionist answers again");
  assert.equal(writes(db, "notifications").length, 2, "one bell each way, never twice for one change");
  assert.equal(first(writes(db, "events").at(-1)).kind, "billing.resumed");
});

test("a failed payment marks the row and rings, and the receptionist keeps answering", async () => {
  const db = fakeDb(tables({ billing_accounts: [row({ status: "past_due" })] }));
  setPg(db);
  const res = await deliver("invoice.payment_failed", { id: "in_1", object: "invoice", customer: "cus_1", metadata: {} });
  assert.deepEqual(await res.json(), { ok: true });
  const up = writes(db, "billing_accounts").find((s) => s.op === "update");
  assert.ok(first(up).last_payment_failed_at, "the row keeps when it failed");
  assert.equal(writes(db, "notifications").length, 1);
  assert.equal(first(writes(db, "notifications")[0]).title, "A payment did not go through");
  assert.equal(writes(db, "tenants").length, 0, "a failed card never silences the receptionist");
});

test("a deleted customer is forgotten: the ids point at nothing, the row says nothing is on record, and Checkout may start again", async () => {
  const db = fakeDb(tables({ billing_accounts: [row({ status: "canceled" })] }));
  setPg(db);
  const res = await deliver("customer.deleted", { id: "cus_1", object: "customer", metadata: { tenant_id: T } });
  assert.deepEqual(await res.json(), { ok: true, forgotten: true });
  const up = writes(db, "billing_accounts").find((s) => s.op === "update");
  assert.deepEqual([first(up).stripe_customer_id, first(up).stripe_subscription_id, first(up).status, first(up).card_brand], [null, null, "none", null]);
  assert.deepEqual(first(writes(db, "events")[0]).data, { source: "customer.deleted", status: "none" });
});

test("a type nobody acts on is kept once and said to be ignored; an event about no workspace is answered and left", async () => {
  const db = fakeDb(tables());
  setPg(db);
  const ignored = await deliver("charge.refunded", { id: "ch_1", object: "charge", customer: "cus_1", metadata: {} });
  assert.deepEqual(await ignored.json(), { ok: true, ignored: "charge.refunded" });
  assert.equal(writes(db, "billing_events").length, 1);
  assert.equal(writes(db, "billing_accounts").length, 0);
  const stranger = await deliver("customer.subscription.updated", sub({ id: "sub_9", customer: "cus_9", metadata: {} }));
  assert.deepEqual(await stranger.json(), { ok: true, unrouted: true });
  assert.equal(writes(db, "billing_accounts").length, 0, "nobody's row is written for a subscription nobody owns");
});

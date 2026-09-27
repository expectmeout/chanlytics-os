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
 *
 * The claim is a lease (00194): a retry inside it is told to come back (503,
 * never a 2xx, which would end Stripe's retries), a retry after it takes the
 * claim over and applies the event once, and a completed claim is a
 * duplicate for ever. And a read of Stripe that FAILS is not
 * Stripe saying the subscription is gone: nothing is written, the claim goes
 * back, and the answer is 503 so Stripe tries again.
 */
import { test, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import Stripe from "stripe";
import { fakeDb } from "../_fake-db.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
process.env.STRIPE_WEBHOOK_SECRET = "whsec_test_only";
const { setStripeClient } = await import(at("apps/edge/lib/billing/billing.ts"));
const { setPg } = await import(at("apps/edge/lib/pg.ts"));
const hook = await import(at("apps/edge/api/stripe-webhook.ts"));

const sdk = new Stripe("sk_test_only");
const SECRET = process.env.STRIPE_WEBHOOK_SECRET;
const T = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const subs = new Map();
/** A read that Stripe cannot answer: the error the SDK would throw, by subscription id. */
const fails = new Map();
/** Every read the door asked for -- the id and the request options it sent with it. */
const reads = [];
setStripeClient({
  webhooks: sdk.webhooks,
  subscriptions: {
    retrieve: async (id, params, options) => {
      reads.push({ id, options });
      const refusal = fails.get(id);
      if (refusal) throw refusal;
      const s = subs.get(id);
      // Stripe's own answer for an id it does not hold: a 404, invalid_request_error, resource_missing.
      if (!s)
        throw new Stripe.errors.StripeInvalidRequestError({
          statusCode: 404,
          type: "invalid_request_error",
          code: "resource_missing",
          param: "id",
          message: `No such subscription: '${id}'`,
        });
      return s;
    },
  },
});
after(() => {
  setStripeClient(null);
  setPg(null);
});

const row = (over = {}) => ({
  tenant_id: T,
  mode: "stripe",
  status: "trialing",
  price_id: "price_1",
  stripe_customer_id: "cus_1",
  stripe_subscription_id: "sub_1",
  trial_end: "2026-09-20T00:00:00Z",
  current_period_end: "2026-09-20T00:00:00Z",
  cancel_at: null,
  cancel_at_period_end: false,
  card_brand: "visa",
  card_last4: "4242",
  last_payment_failed_at: null,
  last_paid_at: null,
  facts: {},
  created_at: "2026-09-01T00:00:00Z",
  updated_at: "2026-09-01T00:00:00Z",
  ...over,
});
const tables = (over = {}) => ({
  tenants: [{ id: T, slug: "harbor", name: "Harbor", status: "active", timezone: "America/New_York" }],
  billing_accounts: [row()],
  billing_events: [],
  notifications: [],
  events: [],
  ...over,
});
const sub = (over = {}) => ({
  id: "sub_1",
  object: "subscription",
  customer: "cus_1",
  metadata: { tenant_id: T },
  status: "active",
  items: { data: [{ price: { id: "price_1" }, current_period_end: 1758326400 }] },
  trial_end: null,
  cancel_at: null,
  cancel_at_period_end: false,
  default_payment_method: { card: { brand: "visa", last4: "4242" } },
  ...over,
});
let seq = 0;
function deliver(type, object, id = `evt_${++seq}`) {
  const payload = JSON.stringify({
    id,
    object: "event",
    type,
    data: { object },
    created: Math.floor(Date.now() / 1000),
    api_version: "2024-06-20",
  });
  const sig = sdk.webhooks.generateTestHeaderString({ payload, secret: SECRET });
  return hook.POST(
    new Request("http://localhost/api/stripe-webhook", {
      method: "POST",
      headers: { "stripe-signature": sig },
      body: payload,
    }),
  );
}
const first = (s) => (Array.isArray(s.values) ? s.values[0] : s.values);
const writes = (db, table) =>
  db.seen.filter((s) => s.table === table && ["insert", "update", "upsert", "delete"].includes(s.op));
/** The claims taken: the ledger's inserts, not the completion that follows each one. */
const claims = (db) => writes(db, "billing_events").filter((s) => s.op === "insert");
const ago = (s) => new Date(Date.now() - s * 1000).toISOString();
const ahead = (s) => new Date(Date.now() + s * 1000).toISOString();
/** The door's log while `run` runs: lib/log.ts writes one JSON object per line to the console. */
async function logged(run) {
  const lines = [];
  const keep = (line) => {
    try {
      lines.push(JSON.parse(line));
    } catch {
      /* not one of ours */
    }
  };
  const real = { log: console.log, warn: console.warn, error: console.error };
  console.log = keep;
  console.warn = keep;
  console.error = keep;
  try {
    return { result: await run(), lines };
  } finally {
    Object.assign(console, real);
  }
}

beforeEach(() => {
  subs.clear();
  subs.set("sub_1", sub());
  fails.clear();
  reads.length = 0;
});

test("a bad signature is refused before anything is read", async () => {
  const db = fakeDb(tables());
  setPg(db);
  const res = await hook.POST(
    new Request("http://localhost/api/stripe-webhook", {
      method: "POST",
      headers: { "stripe-signature": "t=1,v1=nope" },
      body: JSON.stringify({ id: "evt_x", type: "customer.subscription.updated" }),
    }),
  );
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
  const kept = claims(db);
  assert.equal(kept.length, 1);
  assert.equal(first(kept[0]).type, "customer.subscription.updated");
  assert.equal(first(kept[0]).tenant_id, T);
  const up = writes(db, "billing_accounts").find((s) => s.op === "update");
  assert.ok(up, "the row is written");
  assert.deepEqual(
    [first(up).status, first(up).card_brand, first(up).card_last4],
    ["active", "mastercard", "0005"],
    "the status, and the card from the full read, not the event's copy",
  );
  assert.ok(
    up.filters.some(([op, col]) => op === "eq" && col === "updated_at"),
    "written only if the row is still what the reading was planned against",
  );
  assert.equal(writes(db, "events").length, 1);
  assert.equal(first(writes(db, "events")[0]).kind, "billing.updated");
  assert.equal(writes(db, "tenants").length, 0, "trialing to active: the receptionist was on and stays on");
});

test("a replay changes nothing: the id hits the primary key, the answer is 200, and the row is not written", async () => {
  const seen = {
    id: "evt_seen_before",
    type: "customer.subscription.updated",
    tenant_id: T,
    received_at: ago(3600),
    state: "applied",
    lease_until: null,
  };
  const state = tables({ billing_events: [{ ...seen }] });
  const db = fakeDb(state, {}, {}, { unique: ["billing_events"] });
  setPg(db);
  const res = await deliver("customer.subscription.updated", sub(), "evt_seen_before");
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true, duplicate: true });
  assert.equal(writes(db, "billing_accounts").length, 0);
  assert.equal(writes(db, "events").length, 0);
  assert.deepEqual(state.billing_events, [seen], "and the ledger is not touched");
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
  assert.ok(
    broken.seen.some((q) => q.table === "billing_events" && q.op === "delete"),
    "given back explicitly",
  );

  // The same delivery again, against the same ledger, with the database well.
  subs.set("sub_1", sub({ status: "paused" }));
  const healthy = fakeDb(state);
  setPg(healthy);
  const retried = await deliver("customer.subscription.updated", sub({ status: "paused" }), "evt_retried");
  assert.equal(retried.status, 200);
  assert.deepEqual(
    await retried.json(),
    { ok: true, status: "paused", switched: "paused" },
    "the retry APPLIES the change, rather than reporting a duplicate",
  );
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
  assert.equal(claims(db).length, 1, "the delivery is still kept once, so it is not reconsidered");

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
  assert.equal(
    first(
      writes(db, "tenants")
        .filter((s) => s.op === "update")
        .at(-1),
    ).status,
    "active",
    "the receptionist answers again",
  );
  assert.equal(writes(db, "notifications").length, 2, "one bell each way, never twice for one change");
  assert.equal(first(writes(db, "events").at(-1)).kind, "billing.resumed");
});

test("a failed payment marks the row and rings, and the receptionist keeps answering", async () => {
  const db = fakeDb(tables({ billing_accounts: [row({ status: "past_due" })] }));
  setPg(db);
  const res = await deliver("invoice.payment_failed", {
    id: "in_1",
    object: "invoice",
    customer: "cus_1",
    metadata: {},
  });
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
  assert.deepEqual(
    [first(up).stripe_customer_id, first(up).stripe_subscription_id, first(up).status, first(up).card_brand],
    [null, null, "none", null],
  );
  assert.deepEqual(first(writes(db, "events")[0]).data, { source: "customer.deleted", status: "none" });
});

test("a type nobody acts on is kept once and said to be ignored; an event about no workspace is answered and left", async () => {
  const db = fakeDb(tables());
  setPg(db);
  // charge.refunded is acted on now, for a partner's share (0012; partner-ledger.test.mjs): the type nobody acts on
  // is one Stripe sends every workspace and nothing here reads.
  const ignored = await deliver("customer.updated", { id: "cus_1", object: "customer", metadata: {} });
  assert.deepEqual(await ignored.json(), { ok: true, ignored: "customer.updated" });
  assert.equal(claims(db).length, 1);
  assert.equal(writes(db, "billing_accounts").length, 0);
  const stranger = await deliver(
    "customer.subscription.updated",
    sub({ id: "sub_9", customer: "cus_9", metadata: {} }),
  );
  assert.deepEqual(await stranger.json(), { ok: true, unrouted: true });
  assert.equal(writes(db, "billing_accounts").length, 0, "nobody's row is written for a subscription nobody owns");
});

test("a Stripe read that fails is not the subscription being gone: nothing is written, the claim goes back, and the answer is 503 so Stripe tries again", async () => {
  // The guard read -- is the subscription the row names still live? -- used
  // to swallow every failure as null, and null read as "gone": on a network
  // blip a late `deleted` about a subscription the workspace had replaced was
  // applied over the live one, and a paying workspace's receptionist went
  // quiet. Stripe retries a non-2xx for up to three days, so the honest
  // answer to "could not read" is 503, and the retry reads again.
  const refusals = [
    new Stripe.errors.StripeConnectionError({ message: "Request aborted due to timeout being reached (8000ms)" }),
    new Stripe.errors.StripeAPIError({
      statusCode: 503,
      type: "api_error",
      message: "Stripe is temporarily unavailable",
    }),
    new Stripe.errors.StripeRateLimitError({
      statusCode: 429,
      type: "rate_limit_error",
      code: "rate_limit",
      message: "Request rate limit exceeded",
    }),
    new Stripe.errors.StripeAuthenticationError({
      statusCode: 401,
      type: "invalid_request_error",
      message: "Invalid API Key provided",
    }),
    new TypeError("fetch failed"),
    // A 404 that is not Stripe's word on the subscription -- no resource_missing
    // on it: an unrecognised URL, a proxy's page. Not gone; not answered.
    new Stripe.errors.StripeInvalidRequestError({
      statusCode: 404,
      type: "invalid_request_error",
      message: "Unrecognized request URL (GET: /v1/subscriptions/sub_1).",
    }),
  ];
  for (const refusal of refusals) {
    const state = tables({ billing_accounts: [row({ status: "active", stripe_subscription_id: "sub_1" })] });
    const db = fakeDb(state, {}, {}, { unique: ["billing_events"] });
    setPg(db);
    fails.set("sub_1", refusal);
    const { result: res, lines } = await logged(() =>
      deliver("customer.subscription.deleted", sub({ id: "sub_0", status: "canceled" }), "evt_unreadable"),
    );
    assert.equal(res.status, 503, refusal.message);
    assert.deepEqual(await res.json(), { ok: false, error: "stripe_unreadable" });
    assert.equal(writes(db, "billing_accounts").length, 0, "the live subscription is left alone");
    assert.equal(writes(db, "tenants").length, 0, "the receptionist keeps answering");
    assert.equal(writes(db, "notifications").length, 0, "and nobody is told anything");
    assert.deepEqual(state.billing_events, [], "the claim is given back, so the retry is not a duplicate");
    const why = lines.find((l) => l.event === "stripe_read_failed");
    assert.ok(why, `the log says the read failed: ${refusal.message}`);
    assert.equal(why.error, refusal.message, "and why");
    // The SDK sets no `name` on its errors, so the class is its `type`, and Stripe's status rides beside it.
    assert.equal(why.stripe_type, refusal.type ?? refusal.name, "which kind of failure");
    assert.equal(why.status, refusal.statusCode ?? null, "and Stripe's status, when there was one");
    assert.equal(why.named_by_row, "sub_1");
  }
  // The read has a budget of its own inside the door's thirty seconds, and no
  // retry of its own: the 503 is the retry.
  const guard = reads.find((r) => r.id === "sub_1");
  assert.ok(
    Number.isInteger(guard?.options?.timeout) && guard.options.timeout > 0 && guard.options.timeout < 30_000,
    `the guard read carries a timeout: ${JSON.stringify(guard?.options)}`,
  );
  assert.equal(guard.options.maxNetworkRetries, 0);
});

test("Stripe answering that the subscription the row names does not exist is still the row being stale: the event is applied, as before", async () => {
  const db = fakeDb(
    tables({ billing_accounts: [row({ status: "active", stripe_subscription_id: "sub_1" })] }),
    {},
    {},
    { unique: ["billing_events"] },
  );
  setPg(db);
  subs.delete("sub_1"); // Stripe no longer holds it: the read answers 404, resource_missing.
  subs.set("sub_0", sub({ id: "sub_0", status: "canceled" }));
  const { result: res, lines } = await logged(() =>
    deliver("customer.subscription.deleted", sub({ id: "sub_0", status: "canceled" })),
  );
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true, status: "canceled", switched: "paused" });
  const stale = lines.find((l) => l.event === "stripe_event_stale_row");
  assert.equal(stale?.row_status, "gone", "the row named a subscription Stripe does not hold");
  // Both reads -- the guard's, and the full one the row is written from -- run
  // under the same budget: no retry of the SDK's own, a timeout inside the
  // door's thirty seconds. The client's default (twenty seconds, retried once)
  // could outlive the function: a kill, rather than an answer Stripe retries.
  assert.deepEqual(
    reads.map((r) => r.id),
    ["sub_1", "sub_0"],
  );
  for (const r of reads) {
    assert.equal(r.options?.maxNetworkRetries, 0, `${r.id}: no retry of the SDK's own`);
    assert.ok(Number.isInteger(r.options?.timeout) && r.options.timeout < 30_000, `${r.id}: a timeout of its own`);
  }
  const up = writes(db, "billing_accounts").find((q) => q.op === "update");
  assert.equal(first(up).stripe_subscription_id, "sub_0", "the row follows the event");
  assert.equal(
    first(writes(db, "tenants").at(-1)).status,
    "paused",
    "and the receptionist is stopped, since nothing live is billing it",
  );
});

test("a retry inside the lease is told to come back, never answered 2xx: the delivery that holds the claim may still be running", async () => {
  // A 2xx ends Stripe's retries of the event, and Stripe does not publish how
  // soon its first retry comes. A retry inside the lease of a DEAD delivery
  // answered "duplicate" would therefore lose the change for good -- the very
  // thing the lease exists to prevent. Told to come back, it finds the claim
  // applied, or its lease run out and takes it over (the next test).
  const held = {
    id: "evt_held",
    type: "customer.subscription.paused",
    tenant_id: T,
    received_at: ago(10),
    state: "claimed",
    lease_until: ahead(110),
  };
  const state = tables({ billing_accounts: [row({ status: "active" })], billing_events: [{ ...held }] });
  const db = fakeDb(state, {}, {}, { unique: ["billing_events"] });
  setPg(db);
  subs.set("sub_1", sub({ status: "paused" }));
  const { result: res, lines } = await logged(() =>
    deliver("customer.subscription.paused", sub({ status: "paused" }), "evt_held"),
  );
  assert.equal(res.status, 503);
  assert.deepEqual(await res.json(), { ok: false, error: "in_flight" });
  assert.equal(writes(db, "billing_accounts").length, 0);
  assert.equal(writes(db, "tenants").length, 0);
  assert.deepEqual(state.billing_events, [held], "the claim is left exactly as the running delivery holds it");
  assert.ok(
    lines.some((l) => l.event === "stripe_event_in_flight"),
    `said so on the log: ${lines.map((l) => l.event)}`,
  );
});

test("a retry after the lease has run out takes the claim over and applies the event once: a delivery killed after its claim no longer loses the change for good", async () => {
  // The claim row was written first and never said whether the apply had
  // happened. A function that died between the two -- its thirty seconds up,
  // a deploy -- left a row that read as done, and every retry Stripe sent for
  // three days was answered "duplicate": a pause, a failed payment, a
  // cancellation, lost for good.
  const dead = {
    id: "evt_orphan",
    type: "customer.subscription.paused",
    tenant_id: T,
    received_at: ago(600),
    state: "claimed",
    lease_until: ago(480),
  };
  const state = tables({ billing_accounts: [row({ status: "active" })], billing_events: [{ ...dead }] });
  const db = fakeDb(state, {}, {}, { unique: ["billing_events"] });
  setPg(db);
  subs.set("sub_1", sub({ status: "paused" }));
  const { result: res, lines } = await logged(() =>
    deliver("customer.subscription.paused", sub({ status: "paused" }), "evt_orphan"),
  );
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true, status: "paused", switched: "paused" });
  assert.equal(first(writes(db, "tenants").at(-1)).status, "paused", "the pause is applied");
  const reclaimed = lines.find((l) => l.event === "stripe_event_reclaimed");
  assert.ok(reclaimed, `the takeover is on the log, since it means a delivery died: ${lines.map((l) => l.event)}`);
  assert.equal(reclaimed.event_id, "evt_orphan", "named by the event, under a field that is not the line's own name");
  assert.equal(state.billing_events.length, 1, "one row, not a second claim");
  assert.equal(state.billing_events[0].state, "applied", "the claim is completed");
  assert.ok(state.billing_events[0].lease_until > dead.lease_until, "under a lease of the retry's own");

  // The same delivery again: applied is a duplicate for ever.
  const again = await deliver("customer.subscription.paused", sub({ status: "paused" }), "evt_orphan");
  assert.deepEqual(await again.json(), { ok: true, duplicate: true });
  assert.equal(writes(db, "tenants").length, 1, "nothing is applied twice");
});

test("a completed claim is a duplicate for ever: the lease is for a claim that was never completed, not for one that was", async () => {
  const state = tables({ billing_accounts: [row({ status: "active" })] });
  const db = fakeDb(state, {}, {}, { unique: ["billing_events"] });
  setPg(db);
  subs.set("sub_1", sub({ status: "paused" }));
  const applied = await deliver("customer.subscription.paused", sub({ status: "paused" }), "evt_done");
  assert.deepEqual(await applied.json(), { ok: true, status: "paused", switched: "paused" });
  assert.equal(state.billing_events.length, 1);
  assert.equal(state.billing_events[0].state, "applied", "completed once the change was made");
  const order = db.seen.map((q) => `${q.table}.${q.op}`);
  assert.ok(
    order.lastIndexOf("billing_events.update") > order.lastIndexOf("tenants.update"),
    "completed AFTER the change, never before: a death in between leaves a claim, not a done",
  );

  // Long after: the lease is past, and the row still says applied.
  state.billing_events[0].lease_until = ago(3600);
  const late = await deliver("customer.subscription.paused", sub({ status: "paused" }), "evt_done");
  assert.deepEqual(await late.json(), { ok: true, duplicate: true });
  assert.equal(writes(db, "tenants").length, 1);
  assert.equal(writes(db, "notifications").length, 1, "one bell, not two");
});

test("a finished Checkout is read back from Stripe under the same budget, and applied", async () => {
  const state = tables({ billing_accounts: [row({ status: "none", stripe_subscription_id: null })] });
  const db = fakeDb(state, {}, {}, { unique: ["billing_events"] });
  setPg(db);
  subs.set("sub_1", sub({ status: "trialing" }));
  const res = await deliver("checkout.session.completed", {
    id: "cs_1",
    object: "checkout.session",
    customer: "cus_1",
    subscription: "sub_1",
    metadata: { tenant_id: T },
  });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true, status: "trialing" });
  const up = writes(db, "billing_accounts").find((q) => q.op === "update");
  assert.equal(first(up).stripe_subscription_id, "sub_1", "the row follows the subscription Checkout made");
  assert.equal(state.billing_events[0].state, "applied", "and the claim is completed");
  assert.deepEqual(
    reads.map((r) => [
      r.id,
      Number.isInteger(r.options?.timeout) && r.options.timeout < 30_000,
      r.options?.maxNetworkRetries,
    ]),
    [["sub_1", true, 0]],
    "one read, under the door's own budget",
  );
});

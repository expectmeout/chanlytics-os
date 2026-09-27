/**
 * A partner's ledger (decision 0012, P3), run: the Stripe webhook's deliveries signed with the SDK's own helper, over a
 * database in memory, the Stripe calls faked. What a share is and what a reversal takes are the database's (00203,
 * proved against the stack in partner.db.test.mjs); this proves the transport: which invoice, which door, which
 * amount, when a call to Stripe is spent and when it is not, and that a database without the doors never costs the
 * webhook its own work. Then the clock: the key, the one door, the counts.
 */
import { test, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import Stripe from "stripe";
import { fakeDb } from "../_fake-db.mjs";
import { at, knock, answer, vault } from "../_cron-doors-world.mjs";

process.env.STRIPE_WEBHOOK_SECRET = "whsec_test_only";
const { setStripeClient } = await import(at("apps/edge/lib/billing.ts"));
const { setPg } = await import(at("apps/edge/lib/pg.ts"));
const hook = await import(at("apps/edge/api/stripe-webhook.ts"));
const clock = await import(at("apps/edge/api/cron/partners.ts"));
const { planInvoice, cardFingerprintOf } = await import(at("apps/edge/lib/partner-earnings.ts"));

const sdk = new Stripe("sk_test_only");
const T = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
/** Which invoice each payment intent paid, as Stripe's invoice payments say it; and every time it was asked. */
const paidBy = new Map();
const asked = [];
const subs = new Map();
setStripeClient({
  webhooks: sdk.webhooks,
  subscriptions: {
    retrieve: async (id) => {
      const s = subs.get(id);
      if (!s) throw new Error(`no such subscription ${id}`);
      return s;
    },
  },
  invoicePayments: {
    list: async (params) => {
      asked.push(params);
      const inv = paidBy.get(params.payment?.payment_intent);
      return { data: inv ? [{ invoice: inv }] : [] };
    },
  },
});
after(() => {
  setStripeClient(null);
  setPg(null);
});

const billingRow = {
  tenant_id: T,
  mode: "stripe",
  status: "active",
  price_id: "price_1",
  stripe_customer_id: "cus_1",
  stripe_subscription_id: "sub_1",
  trial_end: null,
  current_period_end: "2026-10-20T00:00:00Z",
  cancel_at: null,
  cancel_at_period_end: false,
  card_brand: "visa",
  card_last4: "4242",
  last_payment_failed_at: null,
  last_paid_at: null,
  facts: {},
  created_at: "2026-09-01T00:00:00Z",
  updated_at: "2026-09-01T00:00:00Z",
};
const tables = (attributed) => ({
  tenants: [{ id: T, slug: "harbor", name: "Harbor", status: "active", timezone: "America/New_York" }],
  billing_accounts: [{ ...billingRow }],
  billing_events: [],
  notifications: [],
  events: [],
  partner_tenants: attributed ? [{ tenant_id: T, partner_id: "p1", code_used: "ada", standing: null }] : [],
});
/** The doors, as the database answers them, and every call made to them. */
function doors(over = {}) {
  const calls = [];
  const rec = (name, answerWith) => (a) => {
    calls.push([name, a]);
    return typeof answerWith === "function" ? answerWith(a) : answerWith;
  };
  return {
    calls,
    rpcs: {
      partner_earn: rec("partner_earn", (a) => ({
        id: "e1",
        earned_cents: Math.floor((a.p_amount_cents * 2500) / 10000),
      })),
      partner_reverse: rec("partner_reverse", (a) => ({
        id: "r1",
        earned_cents: -Math.floor((a.p_amount_cents * 2500) / 10000),
      })),
      billing_card_mark: rec("billing_card_mark", null),
      ...over,
    },
  };
}
let seq = 0;
function deliver(type, object) {
  const id = `evt_${++seq}`;
  const payload = JSON.stringify({
    id,
    object: "event",
    type,
    data: { object },
    created: 1758326400,
    api_version: "2025-09-30",
  });
  const sig = sdk.webhooks.generateTestHeaderString({ payload, secret: process.env.STRIPE_WEBHOOK_SECRET });
  return hook
    .POST(
      new Request("http://localhost/api/stripe-webhook", {
        method: "POST",
        headers: { "stripe-signature": sig },
        body: payload,
      }),
    )
    .then(async (r) => ({ id, status: r.status, body: await r.json() }));
}
const invoice = (over = {}) => ({
  id: "in_1",
  object: "invoice",
  customer: "cus_1",
  metadata: {},
  amount_paid: 40000,
  currency: "usd",
  created: 1758326000,
  status_transitions: { paid_at: 1758326400 },
  parent: { type: "subscription_details", subscription_details: { subscription: "sub_1", metadata: {} } },
  ...over,
});

beforeEach(() => {
  paidBy.clear();
  asked.length = 0;
  subs.clear();
});

test("a plan invoice is one a subscription raised; a one-time payment is not", () => {
  assert.equal(planInvoice(invoice()), true);
  assert.equal(planInvoice(invoice({ parent: null })), false);
  assert.equal(planInvoice(invoice({ parent: { type: "quote_details", quote_details: {} } })), false);
  assert.equal(cardFingerprintOf({ default_payment_method: { card: { fingerprint: "fp_1" } } }), "fp_1");
  assert.equal(cardFingerprintOf({ default_payment_method: "pm_1" }), null, "not expanded, not known");
});

test("invoice.paid: the webhook's own work, then the share, at what Stripe collected and when it was paid", async () => {
  const d = doors();
  const db = fakeDb(tables(true), {}, d.rpcs);
  setPg(db);
  const r = await deliver("invoice.paid", invoice());
  assert.equal(r.status, 200);
  assert.deepEqual(r.body, { ok: true, partner_earned: 10000 });
  assert.deepEqual(d.calls, [
    [
      "partner_earn",
      {
        p_tenant_id: T,
        p_invoice_id: "in_1",
        p_event_id: r.id,
        p_amount_cents: 40000,
        p_currency: "usd",
        p_paid_at: "2025-09-20T00:00:00.000Z",
      },
    ],
  ]);
  assert.ok(
    db.seen.some((s) => s.table === "billing_accounts" && s.op === "update"),
    "last_paid_at, as before",
  );
});

test("invoice.paid that earns nothing: a one-time payment, a zero, and a payment that failed ask no door", async () => {
  const d = doors();
  setPg(fakeDb(tables(true), {}, d.rpcs));
  assert.deepEqual((await deliver("invoice.paid", invoice({ parent: null }))).body, { ok: true });
  assert.deepEqual((await deliver("invoice.paid", invoice({ id: "in_2", amount_paid: 0 }))).body, { ok: true });
  assert.deepEqual((await deliver("invoice.payment_failed", invoice({ id: "in_3" }))).body, { ok: true });
  assert.deepEqual(d.calls, []);
});

test("a database without the ledger's doors: the share is skipped and said, the webhook's own work still answered 200, and the claim given back for a resend", async () => {
  const d = doors({
    partner_earn: () => {
      throw Object.assign(new Error("Could not find the function public.partner_earn"), { code: "PGRST202" });
    },
  });
  const db = fakeDb(tables(true), {}, d.rpcs);
  setPg(db);
  const r = await deliver("invoice.paid", invoice());
  assert.deepEqual(
    [r.status, r.body],
    [200, { ok: true, partner_skipped: true }],
    "never a 500 Stripe would retry for days",
  );
  assert.ok(db.seen.some((s) => s.table === "billing_accounts" && s.op === "update"));
  assert.ok(
    db.seen.some((s) => s.table === "billing_events" && s.op === "delete"),
    "the claim is forgotten, so the event resent once the migration is in writes the share",
  );
});

test("a door that fails for any other reason is a 500, and the delivery is given back so Stripe's retry is not a duplicate", async () => {
  const d = doors({
    partner_earn: () => {
      throw Object.assign(new Error("deadlock detected"), { code: "40P01" });
    },
  });
  const db = fakeDb(tables(true), {}, d.rpcs);
  setPg(db);
  const r = await deliver("invoice.paid", invoice());
  assert.equal(r.status, 500);
  assert.ok(
    db.seen.some((s) => s.table === "billing_events" && s.op === "delete"),
    "the claim is forgotten",
  );
});

test("charge.refunded: nobody brought the workspace, and Stripe is not asked; one did, and the invoice is found through its payment", async () => {
  const d = doors();
  setPg(fakeDb(tables(false), {}, d.rpcs));
  paidBy.set("pi_1", "in_1");
  const charge = {
    id: "ch_1",
    object: "charge",
    customer: "cus_1",
    metadata: {},
    payment_intent: "pi_1",
    amount_refunded: 10000,
  };
  assert.deepEqual((await deliver("charge.refunded", charge)).body, { ok: true });
  assert.equal(asked.length, 0, "no call to Stripe for a workspace nobody brought");
  assert.deepEqual(d.calls, []);

  setPg(fakeDb(tables(true), {}, d.rpcs));
  const r = await deliver("charge.refunded", charge);
  assert.deepEqual(r.body, { ok: true, partner_reversed: -2500 });
  assert.deepEqual(asked, [{ payment: { type: "payment_intent", payment_intent: "pi_1" }, limit: 1 }]);
  assert.deepEqual(d.calls, [
    ["partner_reverse", { p_invoice_id: "in_1", p_event_id: r.id, p_kind: "refund", p_amount_cents: 10000 }],
  ]);
});

test("a refund of a payment that paid no invoice asks no door", async () => {
  const d = doors();
  setPg(fakeDb(tables(true), {}, d.rpcs));
  const charge = {
    id: "ch_2",
    object: "charge",
    customer: "cus_1",
    metadata: {},
    payment_intent: "pi_none",
    amount_refunded: 500,
  };
  assert.deepEqual((await deliver("charge.refunded", charge)).body, { ok: true });
  assert.deepEqual(d.calls, []);
});

test("a dispute takes the share while it is open; won, it gives it back; lost, nothing more is written", async () => {
  const d = doors({
    partner_reverse: (a) => {
      d.calls.push(["partner_reverse", a]);
      return { id: "r", earned_cents: a.p_kind === "dispute_won" ? 10000 : -10000 };
    },
  });
  setPg(fakeDb(tables(true), {}, d.rpcs));
  paidBy.set("pi_1", "in_1");
  const dispute = (status) => ({
    id: "dp_1",
    object: "dispute",
    charge: "ch_1",
    payment_intent: "pi_1",
    amount: 40000,
    currency: "usd",
    status,
  });
  const opened = await deliver("charge.dispute.created", dispute("needs_response"));
  assert.deepEqual(opened.body, { ok: true, partner_reversed: -10000 });
  // An inquiry takes no money, so it takes no share, and its close gives nothing back.
  const inquiry = await deliver("charge.dispute.created", dispute("warning_needs_response"));
  assert.deepEqual(inquiry.body, { ok: true });
  const settled = await deliver("charge.dispute.closed", dispute("warning_closed"));
  assert.deepEqual(settled.body, { ok: true });
  const lost = await deliver("charge.dispute.closed", dispute("lost"));
  assert.deepEqual(lost.body, { ok: true });
  const won = await deliver("charge.dispute.closed", dispute("won"));
  assert.deepEqual(won.body, { ok: true, partner_reversed: 10000 });
  assert.deepEqual(
    d.calls.map(([, a]) => [a.p_kind, a.p_amount_cents]),
    [
      ["dispute", 40000],
      ["dispute_won", 40000],
    ],
  );
});

test("a subscription applied keeps its card's mark, apart from the row every member reads; a card not expanded leaves none", async () => {
  const d = doors();
  const db = fakeDb(tables(false), {}, d.rpcs);
  setPg(db);
  const sub = {
    id: "sub_1",
    object: "subscription",
    customer: "cus_1",
    metadata: { tenant_id: T },
    status: "active",
    items: { data: [{ price: { id: "price_1" }, current_period_end: 1760918400 }] },
    trial_end: null,
    cancel_at: null,
    cancel_at_period_end: false,
    default_payment_method: { card: { brand: "visa", last4: "4242", fingerprint: "fp_card_1" } },
  };
  subs.set("sub_1", sub);
  await deliver("customer.subscription.updated", { ...sub, default_payment_method: null });
  assert.deepEqual(d.calls, [["billing_card_mark", { p_tenant_id: T, p_fingerprint: "fp_card_1" }]]);
  const written = db.seen.filter((s) => s.table === "billing_accounts" && s.op === "update");
  assert.ok(
    written.length && written.every((s) => !JSON.stringify(s.values).includes("fp_card_1")),
    "never on the row",
  );

  d.calls.length = 0;
  subs.set("sub_1", { ...sub, default_payment_method: "pm_1" });
  await deliver("customer.subscription.updated", sub);
  assert.deepEqual(d.calls, []);
});

/* ------------------------------------------------------------------ the clock */

test("the clock: the cron key or nothing, then the one door, its counts answered and a review said at warn", async () => {
  const swept = [];
  setPg(
    fakeDb(
      {},
      {},
      {
        ...vault,
        partner_earnings_sweep: (a) => (swept.push(a), { judged: 2, review: 1, payable: 3, void: 0 }),
      },
    ),
  );
  const [refused] = await answer(await knock(clock.POST, "partners", "wrong-key"));
  assert.equal(refused, 401);
  assert.equal(swept.length, 0, "nothing is asked of a caller without the key");
  const [status, body] = await answer(await knock(clock.POST, "partners"));
  assert.deepEqual([status, body], [200, { ok: true, judged: 2, review: 1, payable: 3, void: 0 }]);
  assert.equal(swept.length, 1);
  assert.ok(!Number.isNaN(Date.parse(swept[0].p_now)), "the clock's own now");
});

test("the clock: a door that fails is the tick's 500, which sweep_health reads as the clock's", async () => {
  setPg(
    fakeDb(
      {},
      {},
      {
        ...vault,
        partner_earnings_sweep: () => {
          throw new Error("statement timeout");
        },
      },
    ),
  );
  const [status, body] = await answer(await knock(clock.POST, "partners"));
  assert.deepEqual([status, body], [500, { ok: false }]);
});

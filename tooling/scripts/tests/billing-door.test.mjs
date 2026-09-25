/**
 * The billing door, run: POST /api/admin/billing over a database in memory
 * and a Stripe client handed in (setStripeClient), so every op runs without
 * a key or a network. Until 13 Sep 2026 its text was pinned by two
 * assertions in billing.test.mjs and its POST had never been called.
 *
 * This is the door behind Settings › Billing: the way to Checkout and to
 * Stripe's portal, the invoices, a refresh of the subscription when a
 * delivery was missed, and a paused subscription resumed. The secret key
 * lives on the edge and nowhere else, so the dashboard comes here for
 * everything that spends it or reads through it.
 *
 * Executed here: the knock; status -- what this deployment can do, the plan
 * as Stripe states it (read once, kept five minutes, never a literal), the
 * trial length as the environment sets it; each op against the fake -- what
 * it asked Stripe, the billing_accounts row after it, the workspace's own
 * status, the bell, the ledger; and every refusal in the door's own words
 * and status, with nothing written for any of them.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { signEdgeToken } from "@chanlytics/channels";
import { fakeDb } from "./_fake-db.mjs";

// Each test file is its own process: this is the whole environment. The three
// Stripe variables open the door; the client itself is the fake handed to
// setStripeClient, so the key is never used for anything. BILLING_TRIAL_DAYS
// is unset here and set per case. No Supabase credentials, so `setPg(null)`
// really is no database.
process.env.EDGE_CALL_SECRET = "edge-secret-for-this-file";
process.env.STRIPE_SECRET_KEY = "sk_test_only";
process.env.STRIPE_PRICE_ID = "price_1";
process.env.STRIPE_WEBHOOK_SECRET = "whsec_test_only";
process.env.DASHBOARD_ORIGIN = "https://dash.test";
for (const k of [
  "BILLING_TRIAL_DAYS",
  "DIAG_KEY",
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "WHATSAPP_PHONE_ID",
  "RESEND_API_KEY",
  "LEAD_TO",
  "LEAD_FROM",
])
  delete process.env[k];

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { setStripeClient } = await import(at("apps/edge/lib/billing.ts"));
const { setPg } = await import(at("apps/edge/lib/pg.ts"));
const door = await import(at("apps/edge/api/admin/billing.ts"));
after(() => {
  setStripeClient(null);
  setPg(null);
});

const AUD = "/api/admin/billing";
/** Harbor Moving: the workspace every token below is about. */
const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
/** Another workspace, which a token about A must never pay for. */
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
/** A workspace that does not exist. */
const GHOST = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const KEY = "diag-key-for-this-file";

/* ------------------------------- the knock -------------------------------- */

const token = (o = {}) =>
  signEdgeToken(o.secret ?? process.env.EDGE_CALL_SECRET, o.aud ?? AUD, {
    workspace: "workspace" in o ? o.workspace : A,
    user: "u1",
  });
const knock = (body, headers = { "x-edge-token": token() }) =>
  door.POST(
    new Request(`http://edge${AUD}`, {
      method: "POST",
      headers: { ...headers, "content-type": "application/json" },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );
const answer = async (res) => [res.status, await res.json()];

/** Set variables for one call and put every one of them back afterwards; `undefined` unsets. */
async function withEnv(vars, fn) {
  const before = Object.fromEntries(Object.keys(vars).map((k) => [k, process.env[k]]));
  for (const [k, v] of Object.entries(vars)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  try {
    return await fn();
  } finally {
    for (const [k, v] of Object.entries(before)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}
/** The edge before it has the secret: the key decides, and a key holder is about no workspace. */
const keyed = (fn) => withEnv({ EDGE_CALL_SECRET: undefined, DIAG_KEY: KEY }, fn);

/* -------------------------------- the world ------------------------------- */

/** A billing row as the database holds it: a workspace that has never paid. */
const row = (over = {}) => ({
  tenant_id: A,
  mode: "stripe",
  status: "none",
  price_id: null,
  stripe_customer_id: null,
  stripe_subscription_id: null,
  trial_end: null,
  current_period_end: null,
  cancel_at: null,
  cancel_at_period_end: false,
  card_brand: null,
  card_last4: null,
  last_payment_failed_at: null,
  last_paid_at: null,
  facts: {},
  created_at: "2026-09-01T00:00:00Z",
  updated_at: "2026-09-01T00:00:00Z",
  ...over,
});
/** The same row with a customer and a subscription on Stripe, in its trial. */
const subscribed = (over = {}) =>
  row({
    status: "trialing",
    price_id: "price_1",
    stripe_customer_id: "cus_1",
    stripe_subscription_id: "sub_1",
    trial_end: "2026-09-20T00:00:00Z",
    current_period_end: "2026-09-20T00:00:00Z",
    card_brand: "visa",
    card_last4: "4242",
    ...over,
  });
const tables = (over = {}) => ({
  tenants: [
    { id: A, slug: "harbor", name: "Harbor Moving", status: "active", timezone: "America/New_York" },
    { id: B, slug: "probe", name: "Billing probe", status: "active" },
  ],
  billing_accounts: [row()],
  notifications: [],
  events: [],
  ...over,
});
/** A subscription as Stripe answers it, active on the plan, a card on file. */
const PERIOD_END = 1758326400;
const sub = (over = {}) => ({
  id: "sub_1",
  object: "subscription",
  customer: "cus_1",
  metadata: { tenant_id: A },
  status: "active",
  items: { data: [{ price: { id: "price_1" }, current_period_end: PERIOD_END }] },
  trial_end: null,
  cancel_at: null,
  cancel_at_period_end: false,
  default_payment_method: { card: { brand: "visa", last4: "4242" } },
  ...over,
});
const unix = (n) => new Date(n * 1000).toISOString();
function use(t, faults = {}) {
  const db = fakeDb(t, faults);
  setPg(db);
  return db;
}
const writes = (db, table) =>
  db.seen.filter((s) => s.table === table && ["insert", "update", "upsert", "delete"].includes(s.op));
/** Settings › Billing on the workspace's own page, with the outcome in a word the pane reads once. */
const BILLING_PAGE = (slug, outcome) => `https://dash.test/w/${slug}?billing=${outcome}#/admin/billing`;

/**
 * A Stripe client that answers what the case says and records what it was
 * asked. A call the case did not answer throws by name -- which the ops
 * report as `stripe_refused` with that name as the detail, so an op that
 * quietly reached Stripe for something unexpected fails in the open.
 */
function stripe(answers = {}) {
  const calls = [];
  const method =
    (name) =>
    async (...args) => {
      calls.push([name, ...args]);
      const fn = answers[name];
      if (!fn) throw new Error(`stripe.${name} was not expected by this case`);
      return fn(...args);
    };
  setStripeClient({
    prices: { retrieve: method("prices.retrieve") },
    customers: { create: method("customers.create") },
    checkout: { sessions: { create: method("checkout.sessions.create") } },
    billingPortal: { sessions: { create: method("billingPortal.sessions.create") } },
    invoices: { list: method("invoices.list") },
    subscriptions: {
      retrieve: method("subscriptions.retrieve"),
      list: method("subscriptions.list"),
      resume: method("subscriptions.resume"),
      update: method("subscriptions.update"),
    },
  });
  return { calls, asked: (name) => calls.filter((c) => c[0] === name).map((c) => c.slice(1)) };
}

/* ---------------------------------- status -------------------------------- */

// First in the file on purpose: the plan's price is cached per instance for
// five minutes once read, and this is the case that proves the read.
test("status: what this deployment can do, the plan as Stripe states it -- read once with the product's name, kept five minutes, never a literal here -- and the trial as the environment sets it, blank meaning the default", async () => {
  const db = use(tables());
  const s = stripe({
    "prices.retrieve": async () => ({
      id: "price_1",
      object: "price",
      currency: "usd",
      unit_amount: 9900,
      recurring: { interval: "month", interval_count: 1 },
      product: { id: "prod_1", object: "product", name: "Chanlytics" },
    }),
  });
  assert.deepEqual(await answer(await knock({ op: "status" })), [
    200,
    {
      ok: true,
      ready: true,
      livemode: false,
      doors: { ready: true, key: true, price: true, webhook: true },
      price: { id: "price_1", currency: "usd", unit_amount: 9900, interval: "month", product_name: "Chanlytics" },
      trial_days: 14,
    },
  ]);
  assert.deepEqual(
    s.asked("prices.retrieve"),
    [["price_1", { expand: ["product"] }]],
    "the amount comes from Stripe, with the product expanded for its name",
  );
  assert.equal((await knock({ op: "status" })).status, 200);
  assert.equal(
    s.asked("prices.retrieve").length,
    1,
    "read once; the next five minutes of status calls answer from memory",
  );
  const trial = async () => (await (await knock({ op: "status" })).json()).trial_days;
  await withEnv({ BILLING_TRIAL_DAYS: "" }, async () =>
    assert.equal(await trial(), 14, "blank is unset: Number('') is 0, and 0 would have charged the card on the spot"),
  );
  await withEnv({ BILLING_TRIAL_DAYS: " 7 " }, async () =>
    assert.equal(await trial(), 7, "trimmed first, parsed second"),
  );
  await withEnv({ BILLING_TRIAL_DAYS: "0" }, async () =>
    assert.equal(await trial(), 0, "zero is a legitimate setting: no trial"),
  );
  await withEnv({ BILLING_TRIAL_DAYS: "120" }, async () =>
    assert.equal(await trial(), 14, "out of range: the default"),
  );
  await withEnv({ BILLING_TRIAL_DAYS: "soon" }, async () => assert.equal(await trial(), 14));
  await withEnv({ STRIPE_WEBHOOK_SECRET: undefined }, async () => {
    assert.deepEqual(
      await answer(await knock({ op: "status" })),
      [
        200,
        {
          ok: true,
          ready: false,
          livemode: false,
          doors: { ready: false, key: true, price: true, webhook: false },
          price: null,
          trial_days: 14,
        },
      ],
      "without the webhook secret the door is shut, and no amount is shown for a button that cannot charge",
    );
  });
  await withEnv({ STRIPE_PRICE_ID: undefined }, async () => {
    const [, body] = await answer(await knock({ op: "status" }));
    assert.deepEqual([body.ready, body.doors.price, body.price], [false, false, null]);
  });
  assert.equal(db.seen.length, 0, "status reads no database");
});

test("REGRESSION (S9): status says which of Stripe's two worlds the key opens, by the key's own prefix, and guesses nothing -- Billing and Setup could not tell a test card from a real one", async () => {
  use(tables());
  stripe({
    "prices.retrieve": async () => ({
      id: "price_1",
      object: "price",
      currency: "usd",
      unit_amount: 9900,
      recurring: { interval: "month", interval_count: 1 },
      product: { id: "prod_1", object: "product", name: "Chanlytics" },
    }),
  });
  const said = async () => (await (await knock({ op: "status" })).json()).livemode;
  assert.equal(await said(), false, "REGRESSION: sk_test_ is test mode, and status never said so");
  // Short fakes on purpose: a prefix followed by ten letters or more is what the secret scan reads as a real Stripe key.
  await withEnv({ STRIPE_SECRET_KEY: "rk_test_fake" }, async () =>
    assert.equal(await said(), false, "a restricted test key is test mode too"),
  );
  await withEnv({ STRIPE_SECRET_KEY: "sk_live_fake" }, async () =>
    assert.equal(await said(), true, "sk_live_ is live"),
  );
  await withEnv({ STRIPE_SECRET_KEY: "rk_live_fake" }, async () =>
    assert.equal(await said(), true, "and so is a restricted live key"),
  );
  await withEnv({ STRIPE_SECRET_KEY: "pk_live_fake" }, async () =>
    assert.equal(await said(), null, "a key that is not a secret key is not guessed at"),
  );
  await withEnv({ STRIPE_SECRET_KEY: undefined }, async () => assert.equal(await said(), null, "no key: neither"));
});

/* ---------------------------------- the door ------------------------------ */

test("the door: a token for another door, a forgery and no credential are 403; a body naming another workspace than the token is refused; nothing is read and Stripe is not asked; without the secret the key decides and the body names the workspace", async () => {
  const t = tables({ billing_accounts: [row(), row({ tenant_id: B })] });
  const db = use(t);
  const s = stripe();
  assert.deepEqual(
    await answer(await knock({ op: "invoices" }, { "x-edge-token": token({ aud: "/api/admin/lines" }) })),
    [403, { ok: false, error: "token_audience" }],
    "a token for another door opens nothing here",
  );
  assert.deepEqual(
    await answer(await knock({ op: "invoices" }, { "x-edge-token": token({ secret: "not-the-secret" }) })),
    [403, { ok: false, error: "token_signature" }],
  );
  assert.deepEqual(await answer(await knock({ op: "invoices" }, {})), [403, { ok: false }]);
  assert.deepEqual(
    await answer(await knock({ op: "invoices" }, { "x-edge-token": "garbage", "x-diag-key": KEY })),
    [403, { ok: false, error: "token_malformed" }],
    "no falling back from a bad token to a key",
  );
  assert.deepEqual(
    await answer(await knock({ op: "checkout", tenant_id: B })),
    [403, { ok: false, error: "workspace_mismatch" }],
    "a token about A may not open Checkout for B",
  );
  assert.equal(db.seen.length, 0, "nothing was read for any of it");
  await keyed(async () => {
    assert.deepEqual(await answer(await knock({ op: "invoices", tenant_id: B }, { "x-diag-key": "not-the-key" })), [
      403,
      { ok: false },
    ]);
    assert.deepEqual(
      await answer(await knock({ op: "invoices", tenant_id: B }, { "x-diag-key": KEY })),
      [200, { ok: true, invoices: [] }],
      "a key holder's body is believed: B's row, which has no customer and so no invoices",
    );
  });
  assert.deepEqual(
    db.seen.map((q) => [q.table, q.filters.find(([, c]) => c === "tenant_id")?.[2]]),
    [["billing_accounts", B]],
    "one read, B's",
  );
  assert.equal(s.calls.length, 0, "Stripe heard none of it");
});

test("past status every op needs a database and a workspace id; an unknown op is named back with the six", async () => {
  setPg(null);
  stripe();
  assert.deepEqual(await answer(await knock({ op: "checkout" })), [503, { ok: false, error: "no_database" }]);
  const db = use(tables());
  await keyed(async () => {
    assert.deepEqual(
      await answer(await knock({ op: "portal" }, { "x-diag-key": KEY })),
      [400, { ok: false, error: "tenant_id (a workspace id) is required" }],
      "a key holder is about no workspace",
    );
    assert.deepEqual(
      await answer(await knock({ op: "portal", tenant_id: "harbor" }, { "x-diag-key": KEY })),
      [400, { ok: false, error: "tenant_id (a workspace id) is required" }],
      "and must name it by id",
    );
  });
  const list = { ok: false, error: "op must be status, checkout, portal, invoices, sync, resume or start_now" };
  assert.deepEqual(await answer(await knock({ op: "dance" })), [400, list]);
  assert.deepEqual(await answer(await knock({})), [400, list]);
  assert.deepEqual(await answer(await knock("not json")), [400, list]);
  assert.equal(db.seen.length, 0);
});

/* --------------------------------- checkout ------------------------------- */

test("checkout: a fresh workspace gets a customer made in its name and a Checkout session in subscription mode with the trial, back to its own Billing page after; the customer id is kept on the row, the status waits for Stripe's word", async () => {
  const t = tables();
  const db = use(t);
  const s = stripe({
    "customers.create": async () => ({ id: "cus_new", object: "customer" }),
    "checkout.sessions.create": async () => ({
      id: "cs_1",
      object: "checkout.session",
      url: "https://checkout.stripe.test/cs_1",
    }),
  });
  const [status, body] = await answer(await knock({ op: "checkout", email: "  ada@example.com  " }));
  assert.deepEqual([status, body], [200, { ok: true, url: "https://checkout.stripe.test/cs_1" }]);
  assert.deepEqual(
    s.asked("customers.create"),
    [[{ name: "Harbor Moving", email: "ada@example.com", metadata: { tenant_id: A } }]],
    "the customer is the workspace, in its name, with the owner's address and the workspace on it",
  );
  assert.deepEqual(
    s.asked("checkout.sessions.create"),
    [
      [
        {
          mode: "subscription",
          customer: "cus_new",
          client_reference_id: A,
          line_items: [{ price: "price_1", quantity: 1 }],
          subscription_data: { metadata: { tenant_id: A }, trial_period_days: 14 },
          allow_promotion_codes: true,
          success_url: BILLING_PAGE("harbor", "success"),
          cancel_url: BILLING_PAGE("harbor", "cancel"),
          metadata: { tenant_id: A },
        },
      ],
    ],
    "subscription mode, the trial applied, the workspace on the subscription and the session, and back to Billing with the outcome in a word",
  );
  assert.equal(
    t.billing_accounts[0].stripe_customer_id,
    "cus_new",
    "kept, so the portal and a second Checkout find the same customer",
  );
  assert.equal(t.billing_accounts[0].status, "none", "the status is Stripe's to say: the webhook or a sync writes it");
  const order = db.seen.map((q) => `${q.table}.${q.op}`);
  assert.ok(
    order.indexOf("billing_accounts.select") < order.indexOf("billing_accounts.update") &&
      order.indexOf("billing_accounts.update") >= 0,
    "the row is read, then the customer written onto it",
  );
  assert.deepEqual(
    [t.notifications, t.events],
    [[], []],
    "nothing rings and nothing is on the ledger until Stripe says the subscription exists",
  );

  // A customer already on the row, no address given, and a subscription in the past: reused, no email, no trial.
  const t2 = tables({
    billing_accounts: [row({ stripe_customer_id: "cus_1", stripe_subscription_id: "sub_0", status: "canceled" })],
  });
  const db2 = use(t2);
  const s2 = stripe({ "checkout.sessions.create": async () => ({ url: "https://checkout.stripe.test/cs_2" }) });
  assert.deepEqual(await answer(await knock({ op: "checkout", email: "not an address" })), [
    200,
    { ok: true, url: "https://checkout.stripe.test/cs_2" },
  ]);
  assert.equal(s2.asked("customers.create").length, 0, "no second customer");
  const [[session]] = s2.asked("checkout.sessions.create");
  assert.equal(session.customer, "cus_1");
  assert.deepEqual(
    session.subscription_data,
    { metadata: { tenant_id: A } },
    "the trial applies once: a workspace that had a subscription starts again without one",
  );
  assert.equal(writes(db2, "billing_accounts").length, 0, "nothing to keep that was not on the row");

  // With no trial configured, none is offered even to a first subscriber.
  await withEnv({ BILLING_TRIAL_DAYS: "0" }, async () => {
    use(tables({ billing_accounts: [row({ stripe_customer_id: "cus_1" })] }));
    const s3 = stripe({ "checkout.sessions.create": async () => ({ url: "https://checkout.stripe.test/cs_3" }) });
    assert.equal((await knock({ op: "checkout" })).status, 200);
    assert.deepEqual(
      s3.asked("checkout.sessions.create")[0][0].subscription_data,
      { metadata: { tenant_id: A } },
      "no trial_period_days at all, rather than zero",
    );
  });
});

test("F4: checkout comes back to the first run when it is asked to, from a closed list -- anything else is Billing", async () => {
  const back = async (ret) => {
    use(tables());
    const s = stripe({
      "customers.create": async () => ({ id: "cus_new", object: "customer" }),
      "checkout.sessions.create": async () => ({ url: "https://checkout.stripe.test/cs_f4" }),
    });
    assert.equal(
      (await knock({ op: "checkout", email: "ada@example.com", ...(ret ? { return: ret } : {}) })).status,
      200,
    );
    const [[session]] = s.asked("checkout.sessions.create");
    return [session.success_url, session.cancel_url];
  };
  assert.deepEqual(
    await back("start"),
    ["https://dash.test/w/harbor?billing=success#/start", "https://dash.test/w/harbor?billing=cancel#/start"],
    "the first run that asked for the card, with the outcome in the same word",
  );
  assert.deepEqual(await back("billing"), [BILLING_PAGE("harbor", "success"), BILLING_PAGE("harbor", "cancel")]);
  assert.deepEqual(
    await back("https://evil.example/steal"),
    [BILLING_PAGE("harbor", "success"), BILLING_PAGE("harbor", "cancel")],
    "a place that is not on the list is Billing, never a path taken on the caller's word",
  );
  assert.deepEqual(await back(null), [BILLING_PAGE("harbor", "success"), BILLING_PAGE("harbor", "cancel")]);
});

test("the first run's checkout takes no trial: it is the phone step's, and a number starts the plan -- Billing's own still offers the trial", async () => {
  const sessionFor = async (ret) => {
    use(tables());
    const s = stripe({
      "customers.create": async () => ({ id: "cus_new", object: "customer" }),
      "checkout.sessions.create": async () => ({ url: "https://checkout.stripe.test/cs_plan" }),
    });
    assert.equal((await knock({ op: "checkout", email: "ada@example.com", return: ret })).status, 200);
    return s.asked("checkout.sessions.create")[0][0];
  };
  const plan = await sessionFor("start");
  assert.deepEqual(plan.subscription_data, { metadata: { tenant_id: A } }, "no trial_period_days: charged today");
  const billing = await sessionFor("billing");
  assert.deepEqual(billing.subscription_data, { metadata: { tenant_id: A }, trial_period_days: 14 });
});

test("checkout is refused in the door's words -- no such workspace, no billing row, a workspace invoiced by hand, one already subscribed in any live state, a deployment not ready, and Stripe saying no -- and nothing is written for any of them", async () => {
  const s = stripe({
    "customers.create": async () => {
      throw new Error("Invalid API Key provided: sk_test_****only");
    },
  });
  let t = tables();
  let db = use(t);
  assert.deepEqual(await answer(await knock({ op: "checkout" }, { "x-edge-token": token({ workspace: GHOST }) })), [
    404,
    { ok: false, error: "no such workspace" },
  ]);
  assert.equal(writes(db, "billing_accounts").length, 0);

  db = use(tables({ billing_accounts: [] }));
  assert.deepEqual(
    await answer(await knock({ op: "checkout" })),
    [404, { ok: false, error: "no_account" }],
    "no row: provisioning makes one, so this is a workspace half made",
  );
  db = use(tables({ billing_accounts: [row({ mode: "direct" })] }));
  assert.deepEqual(
    await answer(await knock({ op: "checkout" })),
    [409, { ok: false, error: "direct" }],
    "invoiced by hand: never asked for a card",
  );
  for (const status of ["trialing", "active", "past_due", "paused", "unpaid"]) {
    db = use(tables({ billing_accounts: [subscribed({ status })] }));
    assert.deepEqual(
      await answer(await knock({ op: "checkout" })),
      [409, { ok: false, error: "already_subscribed" }],
      status,
    );
    assert.equal(writes(db, "billing_accounts").length, 0, status);
  }
  for (const gone of [{ STRIPE_WEBHOOK_SECRET: undefined }, { STRIPE_PRICE_ID: undefined }]) {
    await withEnv(gone, async () => {
      db = use(tables());
      assert.deepEqual(
        await answer(await knock({ op: "checkout" })),
        [503, { ok: false, error: "not_ready" }],
        JSON.stringify(gone),
      );
      assert.equal(
        db.seen.length,
        1,
        "the workspace was read, the row was not: the door is shut before the row matters",
      );
    });
  }
  assert.equal(s.calls.length, 0, "Stripe heard none of it");

  t = tables();
  db = use(t);
  assert.deepEqual(
    await answer(await knock({ op: "checkout", email: "ada@example.com" })),
    [502, { ok: false, error: "stripe_refused", detail: "Invalid API Key provided: sk_test_****only" }],
    "Stripe's own words travel",
  );
  assert.equal(s.asked("customers.create").length, 1);
  assert.equal(s.asked("checkout.sessions.create").length, 0, "no session for a customer that was not made");
  assert.equal(t.billing_accounts[0].stripe_customer_id, null, "nothing kept from a call Stripe refused");
  assert.equal(writes(db, "billing_accounts").length, 0);
});

/* ------------------------------ portal, invoices -------------------------- */

test("portal: the way to Stripe's own page for the customer on the row, back to Billing after; without a customer there is no page to go to", async () => {
  use(tables({ billing_accounts: [subscribed()] }));
  const s = stripe({
    "billingPortal.sessions.create": async () => ({ id: "bps_1", url: "https://billing.stripe.test/p_1" }),
  });
  assert.deepEqual(await answer(await knock({ op: "portal" })), [
    200,
    { ok: true, url: "https://billing.stripe.test/p_1" },
  ]);
  assert.deepEqual(
    s.asked("billingPortal.sessions.create"),
    [[{ customer: "cus_1", return_url: BILLING_PAGE("harbor", "portal") }]],
    "the customer on the row, and back to the workspace's own Billing page",
  );

  for (const [r, status, error] of [
    [row(), 409, "no_customer"],
    [row({ mode: "direct", stripe_customer_id: "cus_1" }), 409, "direct"],
    [null, 404, "no_account"],
  ]) {
    use(tables({ billing_accounts: r ? [r] : [] }));
    const s2 = stripe();
    assert.deepEqual(await answer(await knock({ op: "portal" })), [status, { ok: false, error }], error);
    assert.equal(s2.calls.length, 0, `${error}: Stripe is not asked`);
  }
  use(tables({ billing_accounts: [subscribed()] }));
  stripe({
    "billingPortal.sessions.create": async () => {
      throw new Error("No such customer: 'cus_1'");
    },
  });
  assert.deepEqual(await answer(await knock({ op: "portal" })), [
    502,
    { ok: false, error: "stripe_refused", detail: "No such customer: 'cus_1'" },
  ]);
});

test("invoices: the last twelve for the customer on the row, flattened to what the pane shows; a workspace invoiced by hand or without a customer has none, and Stripe is not asked", async () => {
  use(tables({ billing_accounts: [subscribed()] }));
  const s = stripe({
    "invoices.list": async () => ({
      object: "list",
      data: [
        {
          id: "in_2",
          object: "invoice",
          number: "HARBOR-0002",
          status: "paid",
          amount_due: 9900,
          amount_paid: 9900,
          currency: "usd",
          created: 1757500000,
          hosted_invoice_url: "https://invoice.stripe.test/in_2",
          invoice_pdf: "https://invoice.stripe.test/in_2.pdf",
        },
        {
          id: "in_1",
          object: "invoice",
          number: null,
          status: "open",
          amount_due: 9900,
          amount_paid: 0,
          currency: "usd",
          created: 1754800000,
        },
      ],
    }),
  });
  assert.deepEqual(
    await answer(await knock({ op: "invoices" })),
    [
      200,
      {
        ok: true,
        invoices: [
          {
            id: "in_2",
            number: "HARBOR-0002",
            status: "paid",
            amount_due: 9900,
            amount_paid: 9900,
            currency: "usd",
            created_at: unix(1757500000),
            hosted_url: "https://invoice.stripe.test/in_2",
            pdf_url: "https://invoice.stripe.test/in_2.pdf",
          },
          {
            id: "in_1",
            number: null,
            status: "open",
            amount_due: 9900,
            amount_paid: 0,
            currency: "usd",
            created_at: unix(1754800000),
            hosted_url: null,
            pdf_url: null,
          },
        ],
      },
    ],
    "Stripe's list in the pane's shape: an invoice without a number or a page yet says so with null",
  );
  assert.deepEqual(s.asked("invoices.list"), [[{ customer: "cus_1", limit: 12 }]]);

  for (const r of [row({ mode: "direct", stripe_customer_id: "cus_1" }), row()]) {
    use(tables({ billing_accounts: [r] }));
    const s2 = stripe();
    assert.deepEqual(await answer(await knock({ op: "invoices" })), [200, { ok: true, invoices: [] }], r.mode);
    assert.equal(s2.calls.length, 0);
  }
  use(tables({ billing_accounts: [] }));
  assert.deepEqual(await answer(await knock({ op: "invoices" })), [404, { ok: false, error: "no_account" }]);
  use(tables({ billing_accounts: [subscribed()] }));
  stripe({
    "invoices.list": async () => {
      throw new Error("Rate limit");
    },
  });
  assert.deepEqual(await answer(await knock({ op: "invoices" })), [
    502,
    { ok: false, error: "stripe_refused", detail: "Rate limit" },
  ]);
});

/* ----------------------------------- sync --------------------------------- */

test("sync reads the subscription from Stripe now and applies it: the row follows Stripe's reading with the card from the full read, the ledger says so, and a receptionist still on stays on; a paused reading pauses the workspace and rings once; a Checkout that finished before its delivery arrived is found as the customer's newest subscription", async () => {
  const t = tables({ billing_accounts: [subscribed()] });
  const db = use(t);
  const s = stripe({
    "subscriptions.retrieve": async () =>
      sub({ default_payment_method: { card: { brand: "mastercard", last4: "0005" } } }),
  });
  assert.deepEqual(await answer(await knock({ op: "sync" })), [200, { ok: true, status: "active" }]);
  assert.deepEqual(
    s.asked("subscriptions.retrieve"),
    [["sub_1", { expand: ["default_payment_method"] }]],
    "the subscription on the row, with the card expanded",
  );
  const r = t.billing_accounts[0];
  assert.deepEqual(
    [
      r.status,
      r.card_brand,
      r.card_last4,
      r.price_id,
      r.stripe_subscription_id,
      r.stripe_customer_id,
      r.current_period_end,
      r.trial_end,
    ],
    ["active", "mastercard", "0005", "price_1", "sub_1", "cus_1", unix(PERIOD_END), null],
    "the row follows Stripe's reading",
  );
  const up = writes(db, "billing_accounts").find((q) => q.op === "update");
  assert.ok(
    up.filters.some(([op, col, val]) => op === "eq" && col === "updated_at" && val === "2026-09-01T00:00:00Z"),
    "written only if the row is still what the reading was planned against",
  );
  assert.deepEqual(
    t.events.map((e) => [e.tenant_id, e.kind, e.category, e.subject_type, e.data]),
    [
      [
        A,
        "billing.updated",
        "billing",
        "subscription",
        { source: "sync", status: "active", subscription: "sub_1", price_id: "price_1" },
      ],
    ],
  );
  assert.equal(writes(db, "tenants").length, 0, "trialing to active: the receptionist was on and stays on");
  assert.deepEqual(t.notifications, [], "no change of state, no bell");

  // Stripe says paused (the trial ended without a card): the workspace is paused and told, once.
  const t2 = tables({ billing_accounts: [subscribed({ status: "active" })] });
  use(t2);
  stripe({ "subscriptions.retrieve": async () => sub({ status: "paused" }) });
  assert.deepEqual(await answer(await knock({ op: "sync" })), [200, { ok: true, status: "paused" }]);
  assert.equal(t2.billing_accounts[0].status, "paused");
  assert.equal(t2.tenants[0].status, "paused", "the receptionist stops answering");
  assert.deepEqual(
    t2.notifications.map((n) => [n.tenant_id, n.kind, n.title, n.route]),
    [[A, "billing", "Your receptionist is paused", "admin/billing"]],
  );
  assert.match(t2.notifications[0].body, /^The trial ended without a card on file\./);
  assert.deepEqual(
    t2.events.map((e) => e.kind),
    ["billing.paused"],
  );

  // No subscription id yet, a customer: the newest subscription on the customer is the one.
  const t3 = tables({ billing_accounts: [row({ stripe_customer_id: "cus_1" })] });
  use(t3);
  const s3 = stripe({
    "subscriptions.list": async () => ({ object: "list", data: [sub({ status: "trialing", trial_end: 1758931200 })] }),
  });
  assert.deepEqual(await answer(await knock({ op: "sync" })), [200, { ok: true, status: "trialing" }]);
  assert.deepEqual(s3.asked("subscriptions.list"), [
    [{ customer: "cus_1", limit: 1, status: "all", expand: ["data.default_payment_method"] }],
  ]);
  assert.deepEqual(
    [t3.billing_accounts[0].stripe_subscription_id, t3.billing_accounts[0].status, t3.billing_accounts[0].trial_end],
    ["sub_1", "trialing", unix(1758931200)],
    "the row takes the subscription it did not know about",
  );
  assert.deepEqual(
    t3.notifications.map((n) => [n.kind, n.title]),
    [["billing", "Your trial has started"]],
    "none to trialing: the trial's own bell",
  );
  assert.equal(t3.tenants[0].status, "active", "on before, on after");

  // Nothing on Stripe's side to read.
  for (const [r, list] of [
    [row(), null],
    [row({ stripe_customer_id: "cus_1" }), async () => ({ data: [] })],
  ]) {
    use(tables({ billing_accounts: [r] }));
    const s4 = stripe(list ? { "subscriptions.list": list } : {});
    assert.deepEqual(await answer(await knock({ op: "sync" })), [409, { ok: false, error: "no_subscription" }]);
    assert.equal(s4.asked("subscriptions.retrieve").length, 0);
  }
  use(tables({ billing_accounts: [subscribed({ mode: "direct" })] }));
  const s5 = stripe();
  assert.deepEqual(
    await answer(await knock({ op: "sync" })),
    [409, { ok: false, error: "direct" }],
    "a direct-arrangement workspace is never touched from here",
  );
  assert.equal(s5.calls.length, 0);
  use(tables({ billing_accounts: [] }));
  assert.deepEqual(await answer(await knock({ op: "sync" })), [404, { ok: false, error: "no_account" }]);
  const t6 = tables({ billing_accounts: [subscribed()] });
  use(t6);
  stripe({
    "subscriptions.retrieve": async () => {
      throw new Error("No such subscription: 'sub_1'");
    },
  });
  assert.deepEqual(await answer(await knock({ op: "sync" })), [
    502,
    { ok: false, error: "stripe_refused", detail: "No such subscription: 'sub_1'" },
  ]);
  assert.equal(t6.billing_accounts[0].status, "trialing", "the row keeps what it had");
});

/* ---------------------------------- resume -------------------------------- */

test("start_now: a free trial's plan starts today -- Stripe ends the trial and charges the card, the answer applied at once so what the trial did not cover opens; anything but a live trial is refused in words, and Stripe is not asked", async () => {
  const t = tables({ billing_accounts: [subscribed({ status: "trialing" })] });
  use(t);
  const s = stripe({ "subscriptions.update": async () => sub({ status: "active" }) });
  assert.deepEqual(await answer(await knock({ op: "start_now" })), [200, { ok: true, status: "active" }]);
  assert.deepEqual(
    s.asked("subscriptions.update"),
    [["sub_1", { trial_end: "now", expand: ["default_payment_method"] }]],
    "the trial ended now, and the card read with it",
  );
  assert.equal(t.billing_accounts[0].status, "active", "without waiting for the webhook");
  assert.deepEqual(
    t.events.map((e) => [e.kind, e.data.source, e.data.status]),
    [["billing.updated", "start_now", "active"]],
  );
  assert.deepEqual(t.notifications, [], "the receptionist was on and stays on: no bell");

  // A card that did not pay: Stripe's word, applied and answered, for the page to say.
  const t2 = tables({ billing_accounts: [subscribed({ status: "trialing" })] });
  use(t2);
  stripe({ "subscriptions.update": async () => sub({ status: "past_due" }) });
  assert.deepEqual(await answer(await knock({ op: "start_now" })), [200, { ok: true, status: "past_due" }]);
  assert.equal(t2.billing_accounts[0].status, "past_due");

  for (const [r, error] of [
    [subscribed({ status: "active" }), "not_trialing"],
    [subscribed({ status: "paused" }), "not_trialing"],
    [row({ status: "trialing" }), "no_subscription"],
    [subscribed({ mode: "direct", status: "trialing" }), "direct"],
  ]) {
    use(tables({ billing_accounts: [r] }));
    const s2 = stripe();
    assert.deepEqual(await answer(await knock({ op: "start_now" })), [409, { ok: false, error }], error);
    assert.equal(s2.calls.length, 0, `${error}: Stripe is not asked`);
  }
  const t3 = tables({ billing_accounts: [subscribed({ status: "trialing" })] });
  use(t3);
  stripe({
    "subscriptions.update": async () => {
      throw new Error("Your card was declined.");
    },
  });
  assert.deepEqual(await answer(await knock({ op: "start_now" })), [
    502,
    { ok: false, error: "stripe_refused", detail: "Your card was declined." },
  ]);
  assert.equal(t3.billing_accounts[0].status, "trialing", "the row keeps what it had");
});

test("resume: a paused subscription is resumed on Stripe, billing from now, and applied at once -- the receptionist answers again, the bell says so, the ledger says resumed; anything but a paused subscription is refused in words, and Stripe is not asked", async () => {
  const t = tables({
    tenants: [{ id: A, slug: "harbor", name: "Harbor Moving", status: "paused", timezone: "America/New_York" }],
    billing_accounts: [subscribed({ status: "paused" })],
  });
  use(t);
  const s = stripe({ "subscriptions.resume": async () => sub({ status: "active" }) });
  assert.deepEqual(await answer(await knock({ op: "resume" })), [200, { ok: true, status: "active" }]);
  assert.deepEqual(
    s.asked("subscriptions.resume"),
    [["sub_1", { billing_cycle_anchor: "now", expand: ["default_payment_method"] }]],
    "billed from now, not back to the pause; the card read with it",
  );
  assert.equal(t.billing_accounts[0].status, "active");
  assert.equal(
    t.tenants[0].status,
    "active",
    "the receptionist answers again -- here, without waiting for the webhook",
  );
  assert.deepEqual(
    t.notifications.map((n) => [n.tenant_id, n.kind, n.title, n.body, n.route]),
    [
      [
        A,
        "billing",
        "Your receptionist is back",
        "Billing is in order; the receptionist answers again.",
        "admin/billing",
      ],
    ],
  );
  assert.deepEqual(
    t.events.map((e) => [e.kind, e.data]),
    [["billing.resumed", { source: "resume", status: "active", subscription: "sub_1", price_id: "price_1" }]],
  );

  for (const [r, error] of [
    [subscribed({ status: "active" }), "not_paused"],
    [subscribed({ status: "canceled" }), "not_paused"],
    [row({ status: "paused" }), "no_subscription"],
    [subscribed({ mode: "direct", status: "paused" }), "direct"],
  ]) {
    use(tables({ billing_accounts: [r] }));
    const s2 = stripe();
    assert.deepEqual(await answer(await knock({ op: "resume" })), [409, { ok: false, error }], error);
    assert.equal(s2.calls.length, 0, `${error}: Stripe is not asked`);
  }
  use(tables({ billing_accounts: [] }));
  assert.deepEqual(await answer(await knock({ op: "resume" })), [404, { ok: false, error: "no_account" }]);
  const t2 = tables({ billing_accounts: [subscribed({ status: "paused" })] });
  use(t2);
  stripe({
    "subscriptions.resume": async () => {
      throw new Error("This subscription is not paused.");
    },
  });
  assert.deepEqual(await answer(await knock({ op: "resume" })), [
    502,
    { ok: false, error: "stripe_refused", detail: "This subscription is not paused." },
  ]);
  assert.equal(t2.billing_accounts[0].status, "paused", "the row keeps what it had");
  assert.deepEqual(t2.notifications, []);
});

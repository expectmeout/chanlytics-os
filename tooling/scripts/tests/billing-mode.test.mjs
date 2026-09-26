/**
 * Stripe's test mode, carried from the edge's key to the words on Billing and Setup (the wiring audit's S9).
 *
 * Production ran Stripe's test keys while Billing said "Card on file: Visa ending 4242" and Setup "The card on file is
 * charged when the trial ends", and nothing on either page said that only Stripe's test cards work and no money moves.
 * The edge reads which of Stripe's two worlds its key opens (run in billing-door.test.mjs). Run here: the billing route
 * and Setup's facts over a fake edge, with the production guard open (EDGE_PROVIDERS=live), then the view model and
 * Setup's row. The pane itself is run in settings-doors.test.mjs.
 */
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { toBillingVM, setupSteps, billingAccountDto } from "@chanlytics/contracts";
import { fakeDb } from "./_fake-db.mjs";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";
// The guard is read once, as its module loads: open it before the route is imported. The secret lets the dashboard
// knock at all; what answers is the fake edge below.
process.env.EDGE_PROVIDERS = "live";
process.env.EDGE_URL = "https://edge.example";
process.env.EDGE_CALL_SECRET = "edge-secret-for-this-file";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { setRateStore, memoryStore } = await import(at("apps/dashboard/src/server/rate-limit.ts"));
const { forgetBillingReadiness } = await import(at("apps/dashboard/src/server/workspace/billing.ts"));
const { setupDtoFor } = await import(at("apps/dashboard/src/server/workspace/setup.ts"));
const billing = await import(at("apps/dashboard/app/api/v1/billing/route.ts"));
beforeEach(() => {
  setRateStore(memoryStore());
  forgetBillingReadiness();
});

const T = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const USER = "u1";
const NOW = Date.parse("2026-09-15T15:00:00Z");
const PRICE = { id: "price_1", currency: "usd", unit_amount: 4900, interval: "month", product_name: "Chanlytics OS" };
/** What Billing and Setup say on test keys, as the owner reads it. */
const SAID = "Billing is in test mode, so only Stripe's test cards work and no real money moves";

/* ------------------------------ the fake edge ------------------------------ */

/** Billing's status as a deployment's key makes it; every other door answers that it is shut. */
const edge = { billing: null };
globalThis.fetch = async (url) => {
  const body = String(url).endsWith("/api/admin/billing") && edge.billing ? edge.billing : { ok: false, error: "shut" };
  return new Response(JSON.stringify(body), {
    status: body.ok ? 200 : 503,
    headers: { "content-type": "application/json" },
  });
};
/** The edge's status answer (billing-door.test.mjs) on a key of `livemode`'s world; undefined is an edge that does not say. */
const status = (livemode) => ({
  ok: true,
  ready: true,
  ...(livemode === undefined ? {} : { livemode }),
  doors: { ready: true, key: true, price: true, webhook: true },
  price: PRICE,
  trial_days: 14,
});

/* ------------------------------ the workspace ------------------------------ */

/** A workspace in its trial, a card on file, as billing-routes.test.mjs keeps it. */
const account = (over = {}) => ({
  tenant_id: T,
  mode: "stripe",
  status: "trialing",
  price_id: "price_1",
  stripe_customer_id: "cus_1",
  stripe_subscription_id: "sub_1",
  trial_end: "2026-09-25T15:00:00Z",
  current_period_end: "2026-09-25T15:00:00Z",
  cancel_at: null,
  cancel_at_period_end: false,
  card_brand: "visa",
  card_last4: "4242",
  last_payment_failed_at: null,
  last_paid_at: null,
  updated_at: "2026-09-01T00:00:00Z",
  ...over,
});
const tables = () => ({
  memberships: [
    { user_id: USER, tenant_id: T, role: "owner", tenants: { slug: "harbor" }, created_at: "2026-01-01T00:00:00Z" },
  ],
  tenants: [{ id: T, slug: "harbor", name: "Harbor", status: "active", timezone: "America/New_York" }],
  billing_accounts: [account()],
  tenant_config: [],
  tenant_channels: [],
  messages: [],
  calls: [],
  templates: [],
  invitations: [],
  contacts: [],
  notifications: [],
  lines: [],
  google_listings: [],
  google_connections: [],
  capability_activations: [],
});
const get = () => new Request(`http://localhost/api/v1/billing?workspace=${T}`);
const read = async () =>
  (await billing.GET.run(get(), { supabase: fakeDb(tables()), userId: USER, email: "ada@example.com", params: {} }))
    .billing;
// The back office's viewer: a member's roster is an RPC this double does not answer, and billing reads the same either way.
const setupFacts = async () => (await setupDtoFor(fakeDb(tables()), T, { kind: "back_office" }, new Date(NOW))).billing;

/* ------------------------------ carried ------------------------------ */

test("REGRESSION (S9): the billing route hands the page which of Stripe's worlds the edge's key opens -- it said whether billing could charge, never whether a card was real", async () => {
  edge.billing = status(false);
  const onTest = await read();
  assert.equal(onTest.livemode, false, "REGRESSION: test keys never reached the page");
  assert.deepEqual(
    [onTest.ready, onTest.account.card_last4, onTest.trial_days],
    [true, "4242", 14],
    "and the rest of the answer is as it was",
  );

  forgetBillingReadiness();
  edge.billing = status(true);
  assert.equal((await read()).livemode, true, "live keys say so");

  forgetBillingReadiness();
  edge.billing = status(undefined);
  assert.equal((await read()).livemode, null, "an edge that does not say is taken for neither");

  forgetBillingReadiness();
  edge.billing = status("false");
  assert.equal((await read()).livemode, null, "nor is a word that is not a yes or a no");

  forgetBillingReadiness();
  edge.billing = null;
  const unread = await read();
  assert.deepEqual(
    [unread.ready, unread.livemode],
    [false, null],
    "an edge that cannot be read: not ready, and nothing said about the keys",
  );
});

test("REGRESSION (S9): Setup's billing facts carry the same answer -- its row said the card on file is charged, on test keys", async () => {
  edge.billing = status(false);
  const facts = await setupFacts();
  assert.equal(facts.livemode, false, "REGRESSION: Setup never heard which keys were on");
  assert.deepEqual([facts.ready, facts.mode, facts.status], [true, "stripe", "trialing"]);

  forgetBillingReadiness();
  edge.billing = status(true);
  assert.equal((await setupFacts()).livemode, true, "live keys say so");

  forgetBillingReadiness();
  edge.billing = null;
  assert.equal((await setupFacts()).livemode, null, "an edge that cannot be read says neither");
});

/* ------------------------------ said ------------------------------ */

test("REGRESSION (S9): the view model says test mode for a workspace that pays by card on test keys, in every state, and never otherwise", () => {
  const acct = (over = {}) => billingAccountDto({ ...account(), ...over });
  const vm = (livemode, a = acct()) =>
    toBillingVM({ ready: true, livemode, account: a, price: PRICE, trial_days: 14 }, NOW);
  assert.equal(vm(false).testMode, `${SAID}.`, "REGRESSION: the card was said with nothing about the keys");
  assert.equal(vm(false).card, "Visa ending 4242", "the card is still said");
  for (const status of [
    "none",
    "incomplete",
    "incomplete_expired",
    "trialing",
    "active",
    "past_due",
    "canceled",
    "unpaid",
    "paused",
  ]) {
    assert.equal(vm(false, acct({ status })).testMode, `${SAID}.`, status);
    assert.equal(vm(true, acct({ status })).testMode, null, `${status}, live keys: nothing to say`);
    assert.equal(vm(null, acct({ status })).testMode, null, `${status}, keys not said: nothing claimed either way`);
  }
  assert.equal(vm(false, acct({ cancel_at: "2026-09-25T15:00:00Z" })).testMode, `${SAID}.`, "a cancelled trial too");
  assert.equal(
    vm(false, acct({ mode: "direct", status: "active" })).testMode,
    null,
    "a direct arrangement charges nothing on this screen",
  );
  assert.equal(vm(false, null).testMode, null, "no row reads as the arrangement");
});

test("REGRESSION (S9): Setup's billing row says test mode before anything it says about a card, in every state, and only on test keys", () => {
  const base = {
    business: {
      name: "Luna",
      hours: true,
      services: 3,
      bookingLink: true,
      address: true,
      handoff: null,
      broken: false,
    },
    channels: {
      whatsapp: { present: false, active: false, number: null, quality: null, lastInboundAt: null },
      voice: { present: false, active: false, number: null, lastInboundAt: null },
    },
    templates: { approved: 0, pending: 0, startersApproved: 0 },
    calendar: { state: "none" },
    team: { members: 1, invitesOpen: 0, alertEmails: 0 },
    consent: { yes: 0 },
    requests: { line: null },
  };
  const rowOf = (status, livemode, over = {}) =>
    setupSteps(
      {
        ...base,
        billing: {
          ready: true,
          livemode,
          mode: "stripe",
          status,
          trial_end: "2026-09-25T15:00:00Z",
          current_period_end: "2026-10-15T15:00:00Z",
          trial_days: 14,
          ...over,
        },
      },
      NOW,
    ).rows.find((r) => r.id === "billing");
  assert.deepEqual(
    rowOf("trialing", false).details,
    [
      SAID,
      "The card on file is charged when the trial ends; cancel from Billing before then if you'd rather not",
      "A phone number, texting and lead searches start with the plan.",
    ],
    "REGRESSION: the charge was said with nothing about the keys",
  );
  for (const status of [
    "none",
    "incomplete",
    "incomplete_expired",
    "trialing",
    "active",
    "past_due",
    "canceled",
    "unpaid",
    "paused",
  ]) {
    assert.equal(rowOf(status, false).details[0], SAID, status);
    assert.ok(!rowOf(status, true).details.includes(SAID), `${status}, live keys`);
    assert.ok(!rowOf(status, null).details.includes(SAID), `${status}, keys not said`);
  }
  assert.equal(
    rowOf("trialing", false, { cancel_at: "2026-09-25T15:00:00Z" }).details[0],
    SAID,
    "a cancelled trial too",
  );
  assert.deepEqual(rowOf("active", false).details, [SAID], "a subscription with nothing else to add says only this");
  assert.equal(rowOf("active", false, { mode: "direct" }), undefined, "a direct arrangement still has no row");
});

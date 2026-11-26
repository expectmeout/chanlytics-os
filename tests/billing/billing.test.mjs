/**
 * Billing: what one Stripe reading means for the row, the switch and the
 * bell (planBilling's truth table), the words the pane and the Setup row
 * say, and the wiring — the migration's grants and the direct rows, the
 * webhook's order (signature, then the id, then the write), the ops, the
 * routes' roles and bucket, the bridge, the pane, the watch list, the kinds.
 */
import "../fixtures/pin-utc.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  planBilling,
  receptionistOn,
  tenantStatusFor,
  toBillingVM,
  trialWords,
  trialOffer,
  priceWords,
  billingDayWords,
  moneyWords,
  billingAccountDto,
  setupSteps,
  BILLING_STATUSES,
  BILLING_TRIAL_DAYS,
  ESCALATION_REASONS,
  EVENT_KINDS,
  SERVER_NOTIFICATION_KINDS,
  kindListDoor,
  noticeRoute,
  verbForRoute,
} from "@chanlytics/contracts";
import { importSrc, readRaw } from "../_source.mjs";
import { edgeFunctions } from "../../tooling/scripts/edge-functions.mjs";
import { EVERY_EVENT, toldFor } from "../_live-feed.mjs";
import { fromDashboard, listedTogether, stepRunning } from "../shell/boot/_frame-boot.mjs";

const NOW = Date.parse("2026-09-07T15:00:00Z");
const SUB = {
  id: "sub_1",
  status: "trialing",
  price_id: "price_1",
  current_period_end: "2026-09-21T15:00:00Z",
  trial_end: "2026-09-21T15:00:00Z",
  cancel_at: null,
  cancel_at_period_end: false,
  card_brand: "visa",
  card_last4: "4242",
};

test("AI is on for trialing, active, past_due, incomplete and none; off for paused, unpaid, canceled, incomplete_expired", () => {
  for (const s of ["trialing", "active", "past_due", "incomplete", "none"]) assert.equal(receptionistOn(s), true, s);
  for (const s of ["paused", "unpaid", "canceled", "incomplete_expired"]) assert.equal(receptionistOn(s), false, s);
  assert.equal(tenantStatusFor("stripe", "paused"), "paused");
  assert.equal(tenantStatusFor("stripe", "active"), "active");
  assert.equal(tenantStatusFor("direct", "canceled"), null, "a direct arrangement is never switched by billing");
  assert.deepEqual(
    [...BILLING_STATUSES],
    ["none", "incomplete", "incomplete_expired", "trialing", "active", "past_due", "canceled", "unpaid", "paused"],
  );
  assert.equal(BILLING_TRIAL_DAYS, 14);
});

test("planBilling: the status is copied verbatim, the switch follows AI, the bell rings on a change of state", () => {
  const started = planBilling({ mode: "stripe", status: "none", tenant_status: "active" }, SUB, NOW);
  assert.equal(started.row.status, "trialing");
  assert.equal(started.row.card_last4, "4242");
  assert.equal(started.tenantStatus, null, "already active: nothing to write");
  assert.equal(started.switched, null);
  assert.equal(started.bell.title, "The trial has started");
  assert.ok(started.bell.body.startsWith("14 days left on the trial, until Sep 21"));

  const paused = planBilling(
    { mode: "stripe", status: "trialing", tenant_status: "active" },
    { ...SUB, status: "paused", card_brand: null, card_last4: null },
    NOW,
  );
  assert.equal(paused.tenantStatus, "paused");
  assert.equal(paused.switched, "paused");
  assert.ok(paused.bell.body.includes("without a card on file"));

  const ended = planBilling(
    { mode: "stripe", status: "active", tenant_status: "active" },
    { ...SUB, status: "canceled" },
    NOW,
  );
  assert.equal(ended.tenantStatus, "paused");
  assert.ok(ended.bell.body.startsWith("The subscription ended."));

  const back = planBilling(
    { mode: "stripe", status: "paused", tenant_status: "paused" },
    { ...SUB, status: "active" },
    NOW,
  );
  assert.equal(back.tenantStatus, "active");
  assert.equal(back.switched, "resumed");
  assert.equal(back.bell.title, "AI is back");

  const late = planBilling(
    { mode: "stripe", status: "active", tenant_status: "active" },
    { ...SUB, status: "past_due" },
    NOW,
  );
  assert.equal(late.tenantStatus, null, "past due keeps answering while Stripe retries");
  assert.equal(late.bell, null, "the payment event rings its own bell");

  const same = planBilling(
    { mode: "stripe", status: "active", tenant_status: "active" },
    { ...SUB, status: "active" },
    NOW,
  );
  assert.equal(same.bell, null, "the same reading twice rings nothing");

  const direct = planBilling(
    { mode: "direct", status: "active", tenant_status: "active" },
    { ...SUB, status: "canceled" },
    NOW,
  );
  assert.equal(direct.tenantStatus, null);
  assert.equal(direct.switched, null);
  assert.equal(direct.bell, null);
});

test("the words: the trial, the price as Stripe states it, a day, an amount", () => {
  assert.equal(trialWords("2026-09-21T15:00:00Z", NOW), "14 days left on the trial, until Sep 21");
  assert.equal(trialWords("2026-09-08T10:00:00Z", NOW), "1 day left on the trial, until Sep 8");
  assert.equal(trialWords("2026-09-07T10:00:00Z", NOW), "Trial ends today");
  assert.equal(trialWords(null, NOW), "");
  assert.equal(
    priceWords({ id: "price_1", currency: "usd", unit_amount: 4900, interval: "month", product_name: "Chanlytics OS" }),
    "$49.00 a month",
  );
  assert.equal(
    priceWords({ id: "price_1", currency: "usd", unit_amount: null, interval: "month", product_name: null }),
    "",
  );
  assert.equal(billingDayWords("2026-09-21T15:00:00Z"), "Sep 21");
  assert.equal(moneyWords(4900, "usd"), "$49.00");
});

test("zero trial days is a real setting, so the offer stays true at zero", () => {
  // 0 is inside the accepted range, so the words have to hold there as well as
  // at fourteen. They did not: the pane offered a "0-day trial" during which
  // "nothing is charged until it ends", while Checkout took the card at once.
  assert.equal(
    trialOffer(14),
    "Start the 14-day trial with a card · nothing is charged until it ends, and you can cancel from here any time.",
  );
  assert.equal(trialOffer(14, true), "Start again with a card · the 14-day trial applies once.");
  for (const n of [0, -1, Number.NaN]) {
    assert.ok(!trialOffer(n).includes("trial"), `${n} must not offer a trial`);
    assert.ok(trialOffer(n).includes("the first charge is today"), `${n} must say when the charge lands`);
    assert.ok(!trialOffer(n, true).includes("trial"), `${n} again`);
  }
});

test("the view model per status: what the pane says and what an owner may do", () => {
  const price = { id: "price_1", currency: "usd", unit_amount: 4900, interval: "month", product_name: "Chanlytics OS" };
  const acct = (over) => ({
    mode: "stripe",
    status: "none",
    price_id: null,
    current_period_end: null,
    trial_end: null,
    cancel_at: null,
    cancel_at_period_end: false,
    card_brand: null,
    card_last4: null,
    last_payment_failed_at: null,
    last_paid_at: null,
    updated_at: "2026-09-07T14:00:00Z",
    ...over,
  });
  const dto = (account, ready = true) => ({ ready, account, price, trial_days: 14, role: "owner" });
  const none = toBillingVM(dto(acct({})), NOW);
  assert.equal(none.headline, "No subscription yet");
  assert.deepEqual(none.actions, { checkout: true, portal: false, resume: false, startNow: false });
  assert.equal(none.plan, "Chanlytics OS · $49.00 a month");
  assert.deepEqual(
    toBillingVM(dto(acct({}), false), NOW).actions,
    { checkout: false, portal: false, resume: false, startNow: false },
    "no door, no button",
  );
  const trial = toBillingVM(
    dto(acct({ status: "trialing", trial_end: "2026-09-21T15:00:00Z", card_brand: "visa", card_last4: "4242" })),
    NOW,
  );
  assert.equal(trial.headline, "On trial");
  assert.equal(
    trial.detail,
    "14 days left on the trial, until Sep 21, then Chanlytics OS · $49.00 a month on Visa ending 4242. Your trial includes everything: your number, texting and every channel, up to 150 call minutes, 1,000 replies and 50 leads.",
  );
  assert.deepEqual(
    trial.actions,
    { checkout: false, portal: true, resume: false, startNow: true },
    "a live trial may start its plan now, for what it does not cover",
  );
  const ending = toBillingVM(
    dto(
      acct({
        status: "trialing",
        trial_end: "2026-09-21T15:00:00Z",
        cancel_at: "2026-09-21T15:00:00Z",
        card_brand: "visa",
        card_last4: "4242",
      }),
    ),
    NOW,
  );
  assert.equal(ending.headline, "On trial, ending");
  assert.ok(ending.detail.startsWith("Cancelled: AI answers until Sep 21, then stops"));
  assert.equal(ending.tone, "warn");
  const paused = toBillingVM(dto(acct({ status: "paused" })), NOW);
  assert.equal(paused.paused, true);
  assert.deepEqual(paused.actions, { checkout: false, portal: true, resume: true, startNow: false });
  const ended = toBillingVM(dto(acct({ status: "canceled", card_brand: "visa", card_last4: "4242" })), NOW);
  assert.equal(ended.headline, "Subscription ended");
  assert.deepEqual(ended.actions, { checkout: true, portal: true, resume: false, startNow: false });
  const direct = toBillingVM(dto(acct({ mode: "direct", status: "active" })), NOW);
  assert.equal(direct.headline, "Direct arrangement");
  assert.deepEqual(direct.actions, { checkout: false, portal: false, resume: false, startNow: false });
  assert.equal(
    toBillingVM(dto(null), NOW).headline,
    "Direct arrangement",
    "no row reads as the arrangement, never as a debt",
  );
  const row = billingAccountDto({
    mode: "direct",
    status: "active",
    price_id: null,
    current_period_end: null,
    trial_end: null,
    cancel_at: null,
    cancel_at_period_end: false,
    card_brand: null,
    card_last4: null,
    last_payment_failed_at: null,
    last_paid_at: null,
    updated_at: "x",
  });
  assert.equal(row.mode, "direct");
  assert.equal(
    billingAccountDto({ mode: "stripe", status: "weird", updated_at: "x" }).status,
    "none",
    "an unknown word reads as none",
  );
});

test("the Setup row: first, for a workspace that pays by card, in each state; absent for a direct arrangement or a closed door", () => {
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
      whatsapp: { present: false, active: false, number: null, quality: null, last_inbound_at: null },
      voice: { present: false, active: false, number: null, last_inbound_at: null },
    },
    templates: { approved: 0, pending: 0, starters_approved: 0 },
    calendar: { state: "none" },
    team: { members: 1, invites_open: 0, alert_emails: 0 },
    consent: { yes: 0 },
    requests: { line: null },
  };
  const rowOf = (billing) => setupSteps({ ...base, billing }, NOW).rows.find((r) => r.id === "billing");
  const first = setupSteps(
    {
      ...base,
      billing: {
        ready: true,
        mode: "stripe",
        status: "none",
        trial_end: null,
        current_period_end: null,
        trial_days: 14,
      },
    },
    NOW,
  ).rows[0];
  assert.equal(first.id, "billing", "first: the door before the desk");
  assert.equal(first.state, "not_started");
  assert.equal(first.verb.to, "verb:billing-checkout");
  assert.ok(first.sentence.includes("14-day trial"));
  // Zero is inside the accepted range, and the row is the other place the
  // number is quoted, so it has to stay true there too.
  const none = rowOf({
    ready: true,
    mode: "stripe",
    status: "none",
    trial_end: null,
    current_period_end: null,
    trial_days: 0,
  });
  assert.ok(!none.sentence.includes("trial") && none.sentence.includes("the first charge is today"));
  assert.equal(none.verb.label, "Subscribe", "the button says what pressing it does");
  assert.equal(
    rowOf({
      ready: true,
      mode: "stripe",
      status: "trialing",
      trial_end: "2026-09-21T15:00:00Z",
      current_period_end: null,
      trial_days: 14,
    }).state,
    "ready",
  );
  assert.ok(
    rowOf({
      ready: true,
      mode: "stripe",
      status: "trialing",
      trial_end: "2026-09-21T15:00:00Z",
      current_period_end: null,
      trial_days: 14,
      cancel_at: "2026-09-21T15:00:00Z",
    }).sentence.startsWith("On trial, cancelled: AI answers until Sep 21"),
  );
  assert.equal(
    rowOf({
      ready: true,
      mode: "stripe",
      status: "past_due",
      trial_end: null,
      current_period_end: null,
      trial_days: 14,
    }).verb.to,
    "verb:billing-portal",
  );
  assert.equal(
    rowOf({ ready: true, mode: "stripe", status: "paused", trial_end: null, current_period_end: null, trial_days: 14 })
      .state,
    "waiting_you",
  );
  assert.equal(
    rowOf({ ready: true, mode: "direct", status: "active", trial_end: null, current_period_end: null, trial_days: 14 }),
    undefined,
    "a direct arrangement has no row",
  );
  assert.equal(
    rowOf({ ready: false, mode: "stripe", status: "none", trial_end: null, current_period_end: null, trial_days: 14 }),
    undefined,
    "a closed door draws nothing",
  );
  assert.equal(rowOf(undefined), undefined);
});

test("the table: the migration's grants and the direct rows", () => {
  const sql = readRaw("supabase/migrations/00073_billing.sql");
  assert.ok(
    sql.includes("create table public.billing_accounts") && sql.includes("check (mode in ('stripe', 'direct'))"),
  );
  assert.ok(
    sql.includes("select t.id, 'direct', 'active' from public.tenants t"),
    "every workspace on record keeps its direct arrangement",
  );
  assert.ok(
    sql.includes("values (p_tenant_id, 'stripe', 'none')"),
    "a new workspace pays by card, nothing subscribed yet",
  );
  assert.ok(
    sql.includes("create table public.billing_events (") && sql.includes("id           text primary key"),
    "a delivery is kept once, by Stripe's id",
  );
  assert.ok(
    sql.includes("create policy billing_accounts_member_select") && !sql.includes("billing_events_member"),
    "members read their row; the ledger is the edge's alone",
  );
  assert.ok(sql.includes("'callback','paused'") && sql.includes("'alert','review','billing'"));
  assert.ok(sql.includes("alter publication supabase_realtime add table public.billing_accounts;"));
  assert.ok(ESCALATION_REASONS.includes("paused") && SERVER_NOTIFICATION_KINDS.includes("billing"));
  for (const k of ["billing.updated", "billing.paused", "billing.resumed"]) assert.ok(EVENT_KINDS.includes(k), k);
});

test("the wiring: the webhook, the ops, the keys on the edge alone, the bucket, the bridge, the pane, the watch list, the kinds", async () => {
  // The webhook's order, run over Stripe's own signing in billing-webhook.test.mjs: a bad signature is refused before
  // anything is read ("a bad signature is refused"), a delivery is kept once by its id and a replay is 200 without a
  // write ("a replay changes nothing"), a failed write is 503 so Stripe retries ("an apply that fails gives the claim
  // back"), and each event the product reads is applied (a subscription updated or paused, a Checkout completed, a trial
  // about to end, a payment that failed). The loser of two events for one change writes and rings nothing ("two events
  // for one change"); the row and the switch are one write through their door (billing_apply, 00382:
  // a-reading-and-the-switch-are-one-write.db.test.mjs), and a table written outside packages/db is the table-names
  // measure's (check:debt). The ops over a fake Stripe, in billing-door.test.mjs: Checkout in subscription mode with the
  // trial and the workspace on the subscription, the trial once from every door (decision 0090), the trial as the
  // environment sets it with blank meaning the default, a resume billing from now. Pinned as stripe-event.ts's,
  // subscription.ts's and billing.ts's text until 26 Nov 2026.

  // The key, the price and the secret are the edge's to read, and the dashboard holds none of them: each reads its own
  // environment through its one module (edge lib/shared/env.ts, dashboard server/shared/env.ts), and the edge's
  // manifest names each (tests/repo/env-manifest.test.mjs holds .env.example to the edge's getters).
  const { env: edgeEnv } = await importSrc("apps/edge/lib/shared/env.ts");
  const { env: dashboardEnv } = await importSrc("apps/dashboard/src/server/shared/env.ts");
  const keys = {
    STRIPE_SECRET_KEY: "sk_test_x",
    STRIPE_PRICE_ID: "price_x",
    STRIPE_WEBHOOK_SECRET: "whsec_x",
    BILLING_TRIAL_DAYS: "21",
  };
  const kept = Object.fromEntries(Object.keys(keys).map((k) => [k, process.env[k]]));
  Object.assign(process.env, keys);
  try {
    for (const [k, v] of Object.entries(keys)) {
      assert.equal(edgeEnv[k], v, `${k}: the edge reads it`);
      assert.equal(k in dashboardEnv, false, `${k}: the dashboard never holds it`);
    }
  } finally {
    for (const [k, v] of Object.entries(kept))
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
  }
  assert.equal(edgeFunctions()["api/stripe-webhook.ts"].maxDuration, 30);
  // The edge keeps contracts' list rather than a copy (a copy turned 00134's new kinds into "alert"); that every
  // listed kind is stored as itself is run in notify-transport.test.mjs.
  assert.ok(SERVER_NOTIFICATION_KINDS.includes("billing"), "the bell's kind");

  // GET billing answers the row as a member may read it, with whether this deployment can charge, and never a
  // customer or subscription id; each door declares who may press it and spends its own bucket, the invoices a read's:
  // run through the routes in billing/billing-routes.test.mjs.
  const { RATE } = await importSrc("apps/dashboard/src/server/shared/rate-limit.ts");
  assert.ok(RATE.billing, "the billing bucket");
  // The plan comes with Setup's rows (setup_rows, 00700), read by the one assembly the back office reads another
  // workspace's through too: setup/setup.test.mjs and setup/setup-reads.test.mjs run it.

  // Billing is TSX since decision 0015's step 11 (surfaces/settings/billing): the surface, read once and repainted on
  // every event the webhook writes, and its verbs, each through its door; the pane is drawn in
  // workspace/settings-doors.test.mjs ("Billing is the real pane", and its doors to Stripe for each role), and Settings
  // draws it, not a mockup's twin, in workspace/settings-owner-panes/ ("Billing draws the real pane").
  const { billingOverride, billingVerbs, installBilling } = fromDashboard("surfaces/settings/billing/surface.ts");
  assert.deepEqual([billingOverride.key, billingOverride.value], ["billing", "billing"]);
  assert.deepEqual(
    [billingOverride.reads, billingOverride.fresh],
    [["billing"], "live"],
    "the webhook's every write repaints Billing",
  );
  // Read beside Google's, and its verbs installed as the frame loads (bridge/boot).
  assert.ok(listedTogether("google", "billing"));
  assert.ok(stepRunning(installBilling), "installed at boot");
  // Checkout and the portal are Stripe's own pages: the browser is sent to the address the door answers.
  const went = [];
  const asked = [];
  const was = { window: globalThis.window };
  globalThis.window = {
    location: {
      origin: "https://app.chanlytics.com",
      pathname: "/w/harbor/settings/billing",
      hash: "",
      assign: (u) => went.push(u),
    },
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent() {},
    fetch: async (url, init = {}) => {
      asked.push([init.method ?? "GET", new URL(String(url), "https://app.chanlytics.com").pathname]);
      return Response.json({ ok: true, data: { url: "https://checkout.stripe.com/c/pay/cs_1" } });
    },
  };
  try {
    assert.deepEqual(await billingVerbs.checkout(), { ok: true, message: "" });
    assert.deepEqual(await billingVerbs.portal(), { ok: true, message: "" });
  } finally {
    globalThis.window = was.window;
  }
  assert.deepEqual(asked, [
    ["POST", "/api/v1/billing/checkout"],
    ["POST", "/api/v1/billing/portal"],
  ]);
  assert.deepEqual(went, ["https://checkout.stripe.com/c/pay/cs_1", "https://checkout.stripe.com/c/pay/cs_1"]);
  // Setup's rows press them: setup/setup-page-activate.test.mjs ("the billing row's Start the trial and Update the card").
  assert.deepEqual(
    toldFor("billing_accounts"),
    EVERY_EVENT,
    "Stripe's answer, applied by the webhook, repaints Billing",
  );
  // The bell's billing row opens Billing, in its words, by its kind and by its route.
  assert.deepEqual(kindListDoor("billing"), { to: "admin/billing", action: "Open Billing" });
  assert.equal(noticeRoute("billing", null), "admin/billing");
  assert.equal(verbForRoute("admin/billing/invoices"), "Open Billing");
});

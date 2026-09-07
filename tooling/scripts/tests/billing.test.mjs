/**
 * Billing: what one Stripe reading means for the row, the switch and the
 * bell (planBilling's truth table), the words the pane and the Setup row
 * say, and the wiring — the migration's grants and the direct rows, the
 * webhook's order (signature, then the id, then the write), the ops, the
 * routes' roles and bucket, the bridge, the pane, the watch list, the kinds.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  planBilling, receptionistOn, tenantStatusFor, toBillingVM, trialWords, priceWords, dayWords, moneyWords, billingAccountDto,
  setupSteps, BILLING_STATUSES, BILLING_TRIAL_DAYS, ESCALATION_REASONS, EVENT_KINDS, SERVER_NOTIFICATION_KINDS,
} from "@chanlytics/contracts";
import { readCode, readRaw } from "./_source.mjs";

const NOW = Date.parse("2026-09-07T15:00:00Z");
const SUB = { id: "sub_1", status: "trialing", price_id: "price_1", current_period_end: "2026-09-21T15:00:00Z", trial_end: "2026-09-21T15:00:00Z", cancel_at: null, cancel_at_period_end: false, card_brand: "visa", card_last4: "4242" };

test("the receptionist is on for trialing, active, past_due, incomplete and none; off for paused, unpaid, canceled, incomplete_expired", () => {
  for (const s of ["trialing", "active", "past_due", "incomplete", "none"]) assert.equal(receptionistOn(s), true, s);
  for (const s of ["paused", "unpaid", "canceled", "incomplete_expired"]) assert.equal(receptionistOn(s), false, s);
  assert.equal(tenantStatusFor("stripe", "paused"), "paused");
  assert.equal(tenantStatusFor("stripe", "active"), "active");
  assert.equal(tenantStatusFor("direct", "canceled"), null, "a direct arrangement is never switched by billing");
  assert.deepEqual([...BILLING_STATUSES], ["none", "incomplete", "incomplete_expired", "trialing", "active", "past_due", "canceled", "unpaid", "paused"]);
  assert.equal(BILLING_TRIAL_DAYS, 14);
});

test("planBilling: the status is copied verbatim, the switch follows the receptionist, the bell rings on a change of state", () => {
  const started = planBilling({ mode: "stripe", status: "none", tenant_status: "active" }, SUB, NOW);
  assert.equal(started.row.status, "trialing");
  assert.equal(started.row.card_last4, "4242");
  assert.equal(started.tenantStatus, null, "already active: nothing to write");
  assert.equal(started.switched, null);
  assert.equal(started.bell.title, "Your trial has started");
  assert.ok(started.bell.body.startsWith("14 days left on the trial, until Sep 21"));

  const paused = planBilling({ mode: "stripe", status: "trialing", tenant_status: "active" }, { ...SUB, status: "paused", card_brand: null, card_last4: null }, NOW);
  assert.equal(paused.tenantStatus, "paused");
  assert.equal(paused.switched, "paused");
  assert.ok(paused.bell.body.includes("without a card on file"));

  const ended = planBilling({ mode: "stripe", status: "active", tenant_status: "active" }, { ...SUB, status: "canceled" }, NOW);
  assert.equal(ended.tenantStatus, "paused");
  assert.ok(ended.bell.body.startsWith("The subscription ended."));

  const back = planBilling({ mode: "stripe", status: "paused", tenant_status: "paused" }, { ...SUB, status: "active" }, NOW);
  assert.equal(back.tenantStatus, "active");
  assert.equal(back.switched, "resumed");
  assert.equal(back.bell.title, "Your receptionist is back");

  const late = planBilling({ mode: "stripe", status: "active", tenant_status: "active" }, { ...SUB, status: "past_due" }, NOW);
  assert.equal(late.tenantStatus, null, "past due keeps answering while Stripe retries");
  assert.equal(late.bell, null, "the payment event rings its own bell");

  const same = planBilling({ mode: "stripe", status: "active", tenant_status: "active" }, { ...SUB, status: "active" }, NOW);
  assert.equal(same.bell, null, "the same reading twice rings nothing");

  const direct = planBilling({ mode: "direct", status: "active", tenant_status: "active" }, { ...SUB, status: "canceled" }, NOW);
  assert.equal(direct.tenantStatus, null);
  assert.equal(direct.switched, null);
  assert.equal(direct.bell, null);
});

test("the words: the trial, the price as Stripe states it, a day, an amount", () => {
  assert.equal(trialWords("2026-09-21T15:00:00Z", NOW), "14 days left on the trial, until Sep 21");
  assert.equal(trialWords("2026-09-08T10:00:00Z", NOW), "1 day left on the trial, until Sep 8");
  assert.equal(trialWords("2026-09-07T10:00:00Z", NOW), "Trial ends today");
  assert.equal(trialWords(null, NOW), "");
  assert.equal(priceWords({ id: "price_1", currency: "usd", unit_amount: 4900, interval: "month", product_name: "Chanlytics OS" }), "$49.00 a month");
  assert.equal(priceWords({ id: "price_1", currency: "usd", unit_amount: null, interval: "month", product_name: null }), "");
  assert.equal(dayWords("2026-09-21T15:00:00Z"), "Sep 21");
  assert.equal(moneyWords(4900, "usd"), "$49.00");
});

test("the view model per status: what the pane says and what an owner may do", () => {
  const price = { id: "price_1", currency: "usd", unit_amount: 4900, interval: "month", product_name: "Chanlytics OS" };
  const acct = (over) => ({ mode: "stripe", status: "none", price_id: null, current_period_end: null, trial_end: null, cancel_at: null, cancel_at_period_end: false, card_brand: null, card_last4: null, last_payment_failed_at: null, last_paid_at: null, updated_at: "2026-09-07T14:00:00Z", ...over });
  const dto = (account, ready = true) => ({ ready, account, price, trial_days: 14, role: "owner" });
  const none = toBillingVM(dto(acct({})), NOW);
  assert.equal(none.headline, "No subscription yet");
  assert.deepEqual(none.actions, { checkout: true, portal: false, resume: false });
  assert.equal(none.plan, "Chanlytics OS · $49.00 a month");
  assert.deepEqual(toBillingVM(dto(acct({}), false), NOW).actions, { checkout: false, portal: false, resume: false }, "no door, no button");
  const trial = toBillingVM(dto(acct({ status: "trialing", trial_end: "2026-09-21T15:00:00Z", card_brand: "visa", card_last4: "4242" })), NOW);
  assert.equal(trial.headline, "On trial");
  assert.equal(trial.detail, "14 days left on the trial, until Sep 21, then Chanlytics OS · $49.00 a month on Visa ending 4242.");
  assert.deepEqual(trial.actions, { checkout: false, portal: true, resume: false });
  const paused = toBillingVM(dto(acct({ status: "paused" })), NOW);
  assert.equal(paused.paused, true);
  assert.deepEqual(paused.actions, { checkout: false, portal: true, resume: true });
  const ended = toBillingVM(dto(acct({ status: "canceled", card_brand: "visa", card_last4: "4242" })), NOW);
  assert.equal(ended.headline, "Subscription ended");
  assert.deepEqual(ended.actions, { checkout: true, portal: true, resume: false });
  const direct = toBillingVM(dto(acct({ mode: "direct", status: "active" })), NOW);
  assert.equal(direct.headline, "Direct arrangement");
  assert.deepEqual(direct.actions, { checkout: false, portal: false, resume: false });
  assert.equal(toBillingVM(dto(null), NOW).headline, "Direct arrangement", "no row reads as the arrangement, never as a debt");
  const row = billingAccountDto({ mode: "direct", status: "active", price_id: null, current_period_end: null, trial_end: null, cancel_at: null, cancel_at_period_end: false, card_brand: null, card_last4: null, last_payment_failed_at: null, last_paid_at: null, updated_at: "x" });
  assert.equal(row.mode, "direct");
  assert.equal(billingAccountDto({ mode: "stripe", status: "weird", updated_at: "x" }).status, "none", "an unknown word reads as none");
});

test("the Setup row: first, for a workspace that pays by card, in each state; absent for a direct arrangement or a closed door", () => {
  const base = {
    business: { name: "Luna", hours: true, services: 3, bookingLink: true, address: true, handoff: null, broken: false },
    channels: { whatsapp: { present: false, active: false, number: null, quality: null, lastInboundAt: null }, voice: { present: false, active: false, number: null, lastInboundAt: null } },
    templates: { approved: 0, pending: 0, startersApproved: 0 }, calendar: { state: "none" }, team: { members: 1, invitesOpen: 0, alertEmails: 0 }, consent: { yes: 0 }, requests: { line: null },
  };
  const rowOf = (billing) => setupSteps({ ...base, billing }, NOW).rows.find((r) => r.id === "billing");
  const first = setupSteps({ ...base, billing: { ready: true, mode: "stripe", status: "none", trial_end: null, current_period_end: null, trial_days: 14 } }, NOW).rows[0];
  assert.equal(first.id, "billing", "first: the door before the desk");
  assert.equal(first.state, "not_started");
  assert.equal(first.verb.to, "verb:billing-checkout");
  assert.ok(first.sentence.includes("14-day trial"));
  assert.equal(rowOf({ ready: true, mode: "stripe", status: "trialing", trial_end: "2026-09-21T15:00:00Z", current_period_end: null, trial_days: 14 }).state, "ready");
  assert.equal(rowOf({ ready: true, mode: "stripe", status: "past_due", trial_end: null, current_period_end: null, trial_days: 14 }).verb.to, "verb:billing-portal");
  assert.equal(rowOf({ ready: true, mode: "stripe", status: "paused", trial_end: null, current_period_end: null, trial_days: 14 }).state, "waiting_you");
  assert.equal(rowOf({ ready: true, mode: "direct", status: "active", trial_end: null, current_period_end: null, trial_days: 14 }), undefined, "a direct arrangement has no row");
  assert.equal(rowOf({ ready: false, mode: "stripe", status: "none", trial_end: null, current_period_end: null, trial_days: 14 }), undefined, "a closed door draws nothing");
  assert.equal(rowOf(undefined), undefined);
});

test("the wiring: the migration, the webhook's order, the ops, the routes, the bridge, the pane, the watch list, the kinds", () => {
  const sql = readRaw("supabase/migrations/00073_billing.sql");
  assert.ok(sql.includes("create table public.billing_accounts") && sql.includes("check (mode in ('stripe', 'direct'))"));
  assert.ok(sql.includes("select t.id, 'direct', 'active' from public.tenants t"), "every workspace on record keeps its direct arrangement");
  assert.ok(sql.includes("values (p_tenant_id, 'stripe', 'none')"), "a new workspace pays by card, nothing subscribed yet");
  assert.ok(sql.includes("create table public.billing_events (") && sql.includes("id           text primary key"), "a delivery is kept once, by Stripe's id");
  assert.ok(sql.includes("create policy billing_accounts_member_select") && !sql.includes("billing_events_member"), "members read their row; the ledger is the edge's alone");
  assert.ok(sql.includes("'callback','paused'") && sql.includes("'alert','review','billing'"));
  assert.ok(sql.includes("alter publication supabase_realtime add table public.billing_accounts;"));
  assert.ok(ESCALATION_REASONS.includes("paused") && SERVER_NOTIFICATION_KINDS.includes("billing"));
  for (const k of ["billing.updated", "billing.paused", "billing.resumed"]) assert.ok(EVENT_KINDS.includes(k), k);

  const hook = readCode("apps/edge/api/stripe-webhook.ts");
  assert.ok(hook.includes("s.webhooks.constructEvent(raw, sig, secret)"), "the signature, on the raw body");
  assert.ok(hook.indexOf("constructEvent(") < hook.indexOf("keepEvent(") && hook.indexOf("keepEvent(") < hook.indexOf("applySubscription("), "signature, then the id, then the write");
  assert.ok(hook.includes('return json(200, { ok: true, duplicate: true })') && hook.includes('return json(500, { ok: false, error: "write_failed" })'), "a duplicate is 200 without a write; a failed write is 500 so Stripe retries");
  for (const t of ['"customer.subscription.updated"', '"customer.subscription.paused"', '"checkout.session.completed"', '"customer.subscription.trial_will_end"', '"invoice.payment_failed"']) assert.ok(hook.includes(t), t);
  const lib = readCode("apps/edge/lib/billing.ts");
  assert.ok(lib.includes("process.env.STRIPE_SECRET_KEY") && lib.includes("process.env.STRIPE_PRICE_ID") && lib.includes("process.env.STRIPE_WEBHOOK_SECRET"), "the key, the price and the secret on the edge alone");
  assert.ok(lib.includes('mode: "subscription"') && lib.includes("trial_period_days: trial") && lib.includes("metadata: { tenant_id: tenantId }"), "Checkout in subscription mode, the trial applied, the workspace on the subscription");
  assert.ok(lib.includes("const trial = row.stripe_subscription_id ? 0 : trialDays();"), "the trial applies once");
  assert.ok(lib.includes('s.subscriptions.resume(row.stripe_subscription_id, { billing_cycle_anchor: "now"'));
  assert.ok(lib.includes('if (error.code === "23505") return false;'), "a second delivery hits the primary key");
  assert.ok(lib.includes("planBilling(") && lib.includes('kind: "billing"'), "the plan decides, the edge writes and rings");
  assert.ok(lib.includes('.eq("updated_at", row.updated_at)') && lib.includes('L.info("billing_apply_raced"'), "two events for one change: the loser writes nothing and rings nothing");
  const admin = readCode("apps/edge/api/admin/billing.ts");
  for (const op of ['op === "status"', 'op === "checkout"', 'op === "portal"', 'op === "invoices"', 'op === "sync"', 'op === "resume"']) assert.ok(admin.includes(op), op);
  assert.ok(admin.includes('request.headers.get("x-diag-key") !== process.env.DIAG_KEY'));
  const env = readRaw("apps/edge/.env.example");
  for (const v of ["STRIPE_SECRET_KEY=", "STRIPE_WEBHOOK_SECRET=", "STRIPE_PRICE_ID=", "BILLING_TRIAL_DAYS="]) assert.ok(env.includes(v), v);
  const vercel = JSON.parse(readRaw("apps/edge/vercel.json"));
  assert.equal(vercel.functions["api/stripe-webhook.ts"].maxDuration, 30);
  assert.ok(readCode("apps/edge/lib/notify.ts").includes('"alert", "review", "billing"]'), "the kind is kept, not folded into alert");

  const get = readCode("apps/dashboard/app/api/v1/billing/route.ts");
  assert.ok(get.includes("billingFor(ctx.supabase, member.tenantId), billingReadiness()"));
  for (const [file, role] of [["checkout", "owner"], ["portal", "owner"], ["invoices", "owner"], ["resume", "owner"], ["sync", "operator"]]) {
    const r = readCode(`apps/dashboard/app/api/v1/billing/${file}/route.ts`);
    assert.ok(r.includes(`requireRole(member, "${role}")`) && r.includes('takeRate(ctx.userId, "billing")'), file);
  }
  const server = readCode("apps/dashboard/src/server/billing.ts");
  assert.ok(server.includes('export const BILLING_COLUMNS = "mode, status, price_id, current_period_end, trial_end, cancel_at, cancel_at_period_end, card_brand, card_last4, last_payment_failed_at, last_paid_at, updated_at";'), "never a customer or subscription id");
  assert.ok(!server.includes("STRIPE_SECRET_KEY"), "the dashboard never holds the key");
  assert.ok(readCode("apps/dashboard/src/server/rate-limit.ts").includes("billing: {"));
  const setup = readCode("apps/dashboard/app/api/v1/setup/route.ts");
  assert.ok(setup.includes("billingFor(supabase, tenantId),") && setup.includes("billingReadiness(),") && setup.includes("trial_days: billingReady.trial_days"));
  const bridge = readCode("apps/dashboard/src/legacy-bridge/billing.ts");
  assert.ok(bridge.includes('key: "billing",') && bridge.includes('refreshOnTables: ["billing_accounts"],') && bridge.includes("win.location.assign(r.data.url)"));
  const app = readCode("apps/dashboard/src/legacy-bridge/LegacyApp.tsx");
  assert.ok(app.includes("googleOverride, billingOverride]") && app.includes("installBilling();"));
  assert.ok(readCode("apps/dashboard/src/legacy-bridge/manifest.ts").includes('import "@/legacy/pages/billing-real.jsx";'));
  const pane = readCode("apps/dashboard/src/legacy/pages/billing-real.jsx");
  for (const t of ["billing-real", "billing-headline", "billing-checkout", "billing-portal", "billing-resume", "billing-sync", "billing-invoices", "billing-note"]) assert.ok(pane.includes(`data-testid="${t}"`), t);
  const settings = readCode("apps/dashboard/src/legacy/pages/settings.jsx");
  assert.ok(settings.includes("<window.PaneBillingReal flash={flash} />") && !settings.includes('which="billing"'), "the pane is real; nothing says not built");
  const page = readCode("apps/dashboard/src/legacy/pages/setup.jsx");
  assert.ok(page.includes('verb.to === "verb:billing-checkout"') && page.includes('verb.to === "verb:billing-portal"'));
  assert.ok(readCode("packages/db/src/realtime.ts").includes('{ table: "billing_accounts", event: "*" }'));
  const kinds = readCode("packages/contracts/src/notifications.ts");
  assert.ok(kinds.includes('billing: { icon: "money", tone: "warn", action: "Open Billing", to: "admin/billing" }') && kinds.includes('[/^admin\\/billing/, "Open Billing"]'));
});

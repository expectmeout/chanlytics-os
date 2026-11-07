/** Billing: subscription. */

import Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@chanlytics/db/types";
import { applyBilling, type BillingPatch } from "@chanlytics/db/billing";
import { emitEvent } from "@chanlytics/db/events";
import {
  BILLING_STATUSES,
  BILLING_TRIAL_DAYS,
  CHECKOUT_RETURN_ROUTE,
  DEFAULT_TIMEZONE,
  planBilling,
  trialDaysFor,
  type BillingPlan,
  type CheckoutReturn,
  type BillingPriceDto,
  type BillingStatus,
  type SubscriptionFacts,
  MIN_MS,
  UUID,
} from "@chanlytics/contracts";
import { ringOnce, tellOnce } from "./notices.js";
import { logger, errField } from "../shared/log.js";
import { env } from "../shared/env.js";
import { dashboardOrigin } from "../shared/dashboard-origin.js";
import { cardFingerprintOf, markCard } from "../partners/earnings.js";
import { checkoutKeyOf, checkoutMadeOf, sessionReturn, type CheckoutMade } from "./checkout-session.js";

export type Db = SupabaseClient<Database>;

export type BillingRow = Database["public"]["Tables"]["billing_accounts"]["Row"];

/** A write nothing races (a customer's id, a stamp, a customer Stripe forgot): the row's one door, with no expectation. */
export const keepOnRow = (db: Db, tenantId: string, row: BillingPatch) =>
  applyBilling(db, { tenantId, row, expect: null, tenantStatus: null });

/**
 * Back on the workspace's own page (/w/<slug>, plan 3.5), with the outcome in a word the page reads once: Settings ›
 * Billing, or the first run that asked for the card (contracts CHECKOUT_RETURNS, a closed list); the home when the
 * slug is unknown.
 */
function billingReturnUrl(slug: string | null, outcome: "success" | "cancel" | "portal", back: CheckoutReturn): string {
  const page = slug ? `/w/${encodeURIComponent(slug)}` : "/";
  return `${dashboardOrigin()}${page}?billing=${outcome}#/${CHECKOUT_RETURN_ROUTE[back]}`;
}

let stripeClient: Stripe | null = null;

let injectedStripe: Stripe | null = null;

/** Tests: a Stripe client handed in (the SDK's own webhooks helper beside fakes for the calls), so the webhook and the ops run without a key or a network. */
export function setStripeClient(stripe: Stripe | null): void {
  injectedStripe = stripe;
}

/** How long one call through the shared Stripe client may take. */
const STRIPE_TIMEOUT_MS = 20_000;

export function stripe(): Stripe | null {
  if (injectedStripe) return injectedStripe;
  const key = env.STRIPE_SECRET_KEY;
  if (!key) return null;
  // Built on first use, not at import: the webhook and the ops share it, and
  // a deployment without a key must still answer "not ready".
  stripeClient ??= new Stripe(key, { timeout: STRIPE_TIMEOUT_MS, maxNetworkRetries: 1 });
  return stripeClient;
}

function priceId(): string | null {
  return env.STRIPE_PRICE_ID || null;
}

export function trialDays(): number {
  // Trimmed and checked for emptiness FIRST, because Number("") is 0, not NaN.
  // Creating the variable in the console and leaving the value blank — which is
  // what copying .env.example into Vercel does — therefore passed every guard
  // below as a deliberate zero: Checkout omitted trial_period_days and took the
  // card on the spot, while Billing and Setup went on offering "the 0-day trial
  // with a card; nothing is charged until it ends".
  const raw = (env.BILLING_TRIAL_DAYS ?? "").trim();
  if (!raw) return BILLING_TRIAL_DAYS;
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed >= 0 && parsed <= 90 ? parsed : BILLING_TRIAL_DAYS;
}

/** The door is open when the key, the price and the webhook secret are all on the edge. */
export function billingReadiness(): { ready: boolean; key: boolean; price: boolean; webhook: boolean } {
  const key = !!env.STRIPE_SECRET_KEY;
  const price = !!priceId();
  const webhook = !!env.STRIPE_WEBHOOK_SECRET;
  return { ready: key && price && webhook, key, price, webhook };
}

/**
 * Which of Stripe's two worlds the key opens, by its own prefix: sk_live_ and rk_live_ are live; sk_test_ and rk_test_
 * are test, where only Stripe's test cards work and no money moves. Null with no key, or one that says neither: not
 * guessed. Billing and Setup say test mode from it (the wiring audit's S9).
 */
export function stripeLivemode(): boolean | null {
  const key = env.STRIPE_SECRET_KEY ?? "";
  if (key.startsWith("sk_live_") || key.startsWith("rk_live_")) return true;
  if (key.startsWith("sk_test_") || key.startsWith("rk_test_")) return false;
  return null;
}

export async function accountOf(db: Db, tenantId: string): Promise<BillingRow | null> {
  const { data, error } = await db.from("billing_accounts").select("*").eq("tenant_id", tenantId).maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

/** The workspace's switch, when its last member left it (00262), and the zone its bells say a day in; null for none. */
async function tenantState(db: Db, tenantId: string) {
  const read = db.from("tenants").select("status, left_empty_at, timezone").eq("id", tenantId);
  const { data, error } = await read.maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

/** Whether the workspace's last member left it (00262): ended, so no plan is bought, resumed or started for it. */
export async function leftEmpty(db: Db, tenantId: string): Promise<boolean> {
  return !!(await tenantState(db, tenantId))?.left_empty_at;
}

export const ENDED_WORDS = "Nobody is in this workspace any more: it was ended when its last member left.";

/** The plan as Stripe states it, cached a few minutes per instance: the amount is never a literal here. */
let priceCache: { at: number; value: BillingPriceDto | null } | null = null;

const PRICE_TTL_MS = 5 * MIN_MS;

function cachedPrice(): BillingPriceDto | null | undefined {
  return priceCache && Date.now() - priceCache.at < PRICE_TTL_MS ? priceCache.value : undefined;
}

async function readPrice(stripe: Stripe, id: string): Promise<BillingPriceDto | null> {
  try {
    const p = await stripe.prices.retrieve(id, { expand: ["product"] });
    const product = p.product && typeof p.product === "object" && "name" in p.product ? p.product.name : null;
    const iv = String(p.recurring?.interval ?? "");
    const interval =
      iv === "day" || iv === "week" || iv === "month" || iv === "year" ? (iv as BillingPriceDto["interval"]) : null;
    return { id: p.id, currency: p.currency, unit_amount: p.unit_amount, interval, product_name: product };
  } catch (e) {
    logger().error("billing_price_unreadable", { error: errField(e) });
    return null;
  }
}

export async function findPriceForClient(): Promise<BillingPriceDto | null> {
  const s = stripe();
  const id = priceId();
  if (!s || !id) return null;
  const hit = cachedPrice();
  if (hit !== undefined) return hit;
  const value = await readPrice(s, id);
  priceCache = { at: Date.now(), value };
  return value;
}

const unixIso = (n: number | null | undefined): string | null =>
  typeof n === "number" ? new Date(n * 1000).toISOString() : null;

const idOf = (x: string | { id: string } | null | undefined): string | null =>
  typeof x === "string" ? x : (x?.id ?? null);

/** A subscription, flattened to what the row keeps. The card comes from the expanded default payment method when Stripe sent it. */
export function subscriptionFacts(sub: Stripe.Subscription): SubscriptionFacts {
  const item = sub.items.data[0];
  const pm =
    sub.default_payment_method && typeof sub.default_payment_method === "object" ? sub.default_payment_method : null;
  return {
    id: sub.id,
    status: (BILLING_STATUSES as readonly string[]).includes(sub.status) ? (sub.status as BillingStatus) : "none",
    price_id: item?.price?.id ?? null,
    current_period_end: unixIso(item?.current_period_end),
    trial_end: unixIso(sub.trial_end),
    cancel_at: unixIso(sub.cancel_at),
    cancel_at_period_end: !!sub.cancel_at_period_end,
    card_brand: pm?.card?.brand ?? null,
    card_last4: pm?.card?.last4 ?? null,
  };
}

/** The workspace a Stripe object belongs to: its metadata first, then the customer on the row. */
export async function findTenant(
  db: Db,
  meta: Record<string, string> | null | undefined,
  customerId: string | null,
): Promise<BillingRow | null> {
  const fromMeta = meta?.tenant_id;
  if (fromMeta && UUID.test(fromMeta)) {
    const row = await accountOf(db, fromMeta);
    if (row) return row;
  }
  if (!customerId) return null;
  const { data, error } = await db
    .from("billing_accounts")
    .select("*")
    .eq("stripe_customer_id", customerId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

/**
 * One subscription reading, applied: the bell, the row, the switch, the
 * event. Idempotent — applying the same reading twice writes the same row
 * and rings nothing the second time, because the bell follows a CHANGE of
 * the receptionist's state.
 */
export async function applySubscription(
  db: Db,
  row: BillingRow,
  sub: Stripe.Subscription,
  source: string,
  now = new Date(),
  by: string | null = null,
): Promise<{ switched: "paused" | "resumed" | null; status: BillingStatus }> {
  const log = logger({ tenant_id: row.tenant_id, subscription: sub.id });
  const tenant = await tenantState(db, row.tenant_id);
  // A workspace its last member left (00262) is ended: billing never resumes it, and a plan still live is ended now.
  const ended = !!tenant?.left_empty_at;
  const facts = subscriptionFacts(sub);
  // The card's mark for the partner sweep (0012): kept apart from the row every member reads, and before the
  // compare-and-set below, so a reading that loses the race still leaves it.
  await markCard(db, row.tenant_id, cardFingerprintOf(sub), log);
  const planned = planBilling(
    {
      mode: row.mode === "direct" ? "direct" : "stripe",
      status: (row.status as BillingStatus) ?? "none",
      tenant_status: tenant?.status ?? "active",
    },
    facts,
    now.getTime(),
    tenant?.timezone || DEFAULT_TIMEZONE,
  );
  const plan = ended ? keptEnded(planned) : planned;
  // The bell before the row (S6-12): told after it, a bell that could not be kept was lost, as the retry reads the row
  // already moved and plans no change. It is kept under the change, not the delivery: the row's version this reading was
  // planned against and the status it moves to. Stripe sends several events for one change within milliseconds, each
  // reading the subscription afresh, so each plans the same move from the same row and finds the one bell kept; the
  // compare-and-set below lets one of them write the row.
  if (plan.bell) {
    const key = `billing:${row.tenant_id}:${row.updated_at ?? "new"}:${facts.status}`;
    // A pause is mailed too (tellOnce, S6-11): the receptionist stops answering. Its mail never holds the row back: a
    // mail provider that is down must not leave a workspace answering on a plan that has stopped, so a mail still owed
    // is said and the row is written; the bell and the phones are the notice that must be kept first.
    if (plan.switched === "paused") {
      const { mailOwed } = await tellOnce(db, row.tenant_id, plan.bell, key);
      if (mailOwed) log.warn("billing_mail_owed", { source, status: facts.status });
    } else await ringOnce(db, row.tenant_id, plan.bell, key);
  }
  const customerId = idOf(sub.customer);
  // Written only if the row is still what this reading was planned against,
  // and with the switch it throws, in one write (00382): a death between the
  // row and the switch left a workspace paid and paused until Stripe's next
  // event about it. Stripe sends several events for one change within
  // milliseconds (subscription.created, checkout.session.completed,
  // invoice.paid), and two of them applied side by side each saw the old row
  // and rang the same bell twice. The loser writes nothing and rings nothing;
  // the row already holds the same reading.
  const won = await applyBilling(db, {
    tenantId: row.tenant_id,
    row: { ...plan.row, ...(customerId ? { stripe_customer_id: customerId } : {}) },
    expect: { status: row.status, updated_at: row.updated_at },
    tenantStatus: plan.tenantStatus,
  });
  if (!won) {
    log.info("billing_apply_raced", { source, status: facts.status });
    return { switched: null, status: facts.status };
  }
  if (ended && !PLAN_ENDED.has(facts.status)) await endLeftEmpty(sub.id, log);
  await emitEvent(
    db,
    row.tenant_id,
    plan.switched === "paused" ? "billing.paused" : plan.switched === "resumed" ? "billing.resumed" : "billing.updated",
    "subscription",
    null,
    { source, status: facts.status, subscription: sub.id, price_id: facts.price_id, ...(by ? { by } : {}) },
  ).catch(() => {});
  log.info("billing_applied", {
    source,
    status: facts.status,
    switched: plan.switched,
    tenant_status: plan.tenantStatus,
  });
  return { switched: plan.switched, status: facts.status };
}

async function customerFor(
  stripe: Stripe,
  db: Db,
  row: BillingRow,
  tenantName: string,
  email: string | null,
): Promise<string> {
  if (row.stripe_customer_id) return row.stripe_customer_id;
  const c = await stripe.customers.create({
    name: tenantName,
    ...(email ? { email } : {}),
    metadata: { tenant_id: row.tenant_id },
  });
  await keepOnRow(db, row.tenant_id, { stripe_customer_id: c.id });
  return c.id;
}

/** A workspace its last member left stays paused: a reading never turns it on, nor rings or records that it did. */
function keptEnded(p: BillingPlan): BillingPlan {
  const resumed = p.switched === "resumed";
  return {
    ...p,
    tenantStatus: p.tenantStatus === "active" ? null : p.tenantStatus,
    switched: resumed ? null : p.switched,
    bell: resumed ? null : p.bell,
  };
}

/** A plan in one of these states charges nothing more: nothing to end. */
const PLAN_ENDED: ReadonlySet<string> = new Set(["none", "canceled", "incomplete_expired"]);

/**
 * The plan of a workspace its last member left, ended at once (00262): a card whose holder can no longer sign in is
 * charged nothing more. Never throws: the plan's next event asks again (applySubscription), and the log says why.
 */
async function endLeftEmpty(subscriptionId: string, log: ReturnType<typeof logger>): Promise<void> {
  const s = stripe();
  if (!s) return;
  try {
    await s.subscriptions.cancel(subscriptionId);
    log.info("billing_ended", { status: "canceled", left_empty: true });
  } catch (e) {
    log.error("billing_end_refused", { error: errField(e) });
  }
}

/**
 * A workspace nobody is in any more (delete_my_account, 00262): its plan ended now, and the ending applied at once, so
 * a card whose holder can no longer sign in is charged nothing more. Nothing to end is an answer, not a refusal: a
 * workspace with no billing row, a direct one, one with no plan, one whose plan already ended. A workspace someone is
 * still in is refused: its plan is its owner's to end, from Billing.
 */
export async function endFor(
  db: Db,
  tenantId: string,
  now = new Date(),
): Promise<{ ok: true; status: BillingStatus } | { ok: false; error: BillingFailure; detail?: string }> {
  const result = stripe();
  if (!result) return { ok: false, error: "not_ready" };
  if (!(await leftEmpty(db, tenantId)))
    return { ok: false, error: "not_paused", detail: "Someone is still in this workspace: its owner ends its plan." };
  const row = await accountOf(db, tenantId);
  const status = (row?.status as BillingStatus | undefined) ?? "none";
  if (!row || row.mode === "direct" || !row.stripe_subscription_id || PLAN_ENDED.has(status))
    return { ok: true, status };
  try {
    const sub = await result.subscriptions.cancel(row.stripe_subscription_id, { expand: ["default_payment_method"] });
    const r = await applySubscription(db, row, sub, "end", now);
    return { ok: true, status: r.status };
  } catch (e) {
    return { ok: false, error: "stripe_refused", detail: e instanceof Error ? e.message : String(e) };
  }
}

export type BillingFailure =
  | "not_ready"
  | "no_account"
  | "direct"
  | "already_subscribed"
  | "no_customer"
  | "no_subscription"
  | "not_paused"
  | "not_trialing"
  | "platform_hold"
  | "stripe_refused";

/** The way to Checkout: a card, the trial, and back to Billing (or the first run that asked) with the outcome. */
export async function getCheckout(
  db: Db,
  tenantId: string,
  tenantName: string,
  email: string | null,
  slug: string | null,
  back: CheckoutReturn,
  embedded = false,
): Promise<CheckoutMade | { ok: false; error: BillingFailure; detail?: string }> {
  const result = stripe();
  const price = priceId();
  if (!result || !price || !billingReadiness().ready) return { ok: false, error: "not_ready" };
  if (await leftEmpty(db, tenantId)) return { ok: false, error: "platform_hold", detail: ENDED_WORDS };
  const row = await accountOf(db, tenantId);
  if (!row) return { ok: false, error: "no_account" };
  if (row.mode === "direct") return { ok: false, error: "direct" };
  if (
    row.status === "trialing" ||
    row.status === "active" ||
    row.status === "past_due" ||
    row.status === "paused" ||
    row.status === "unpaid"
  )
    return { ok: false, error: "already_subscribed" };
  try {
    const customer = await customerFor(result, db, row, tenantName, email);
    // The trial applies once, and is the same from every door (contracts trialDaysFor, decision 0090: the trial covers
    // everything, Ruben 3 Nov 2026), which every screen says.
    const trial = trialDaysFor({ hadSubscription: !!row.stripe_subscription_id, deploymentDays: trialDays() });
    const publishable = env.STRIPE_PUBLISHABLE_KEY;
    const inPage = embedded && !!publishable;
    const session = await result.checkout.sessions.create(
      {
        mode: "subscription",
        customer,
        client_reference_id: tenantId,
        line_items: [{ price, quantity: 1 }],
        subscription_data: { metadata: { tenant_id: tenantId }, ...(trial > 0 ? { trial_period_days: trial } : {}) },
        allow_promotion_codes: true,
        ...sessionReturn(inPage, billingReturnUrl(slug, "success", back), billingReturnUrl(slug, "cancel", back)),
        metadata: { tenant_id: tenantId },
      },
      { idempotencyKey: checkoutKeyOf(tenantId, back, inPage, Date.now()) },
    );
    return checkoutMadeOf(session, inPage ? publishable : null);
  } catch (e) {
    return { ok: false, error: "stripe_refused", detail: e instanceof Error ? e.message : String(e) };
  }
}

/** The way to Stripe's portal: the card, the invoices, cancel — Stripe's page, in Stripe's words. */
export async function getPortal(
  db: Db,
  tenantId: string,
  slug: string | null = null,
): Promise<{ ok: true; url: string } | { ok: false; error: BillingFailure; detail?: string }> {
  const result = stripe();
  if (!result) return { ok: false, error: "not_ready" };
  const row = await accountOf(db, tenantId);
  if (!row) return { ok: false, error: "no_account" };
  if (row.mode === "direct") return { ok: false, error: "direct" };
  if (!row.stripe_customer_id) return { ok: false, error: "no_customer" };
  try {
    const session = await result.billingPortal.sessions.create({
      customer: row.stripe_customer_id,
      return_url: billingReturnUrl(slug, "portal", "billing"),
    });
    return { ok: true, url: session.url };
  } catch (e) {
    return { ok: false, error: "stripe_refused", detail: e instanceof Error ? e.message : String(e) };
  }
}

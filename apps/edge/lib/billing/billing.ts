/**
 * Billing on the edge: the Stripe client, the readiness, and the routines
 * that turn a subscription reading into the row, the switch and the bell.
 * The decisions are pure (contracts/billing.ts planBilling); this file is
 * the only place the secret key is handled and the only writer of
 * billing_accounts, billing_events and tenants.status for a stripe-mode
 * workspace. A direct-arrangement workspace is never touched from here.
 */
import Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "../packages/db.js";
import { emitEvent } from "../packages/db.js";
import {
  BILLING_STATUSES,
  BILLING_TRIAL_DAYS,
  CHECKOUT_RETURN_ROUTE,
  planBilling,
  type BillingPlan,
  type CheckoutReturn,
  type BillingInvoiceDto,
  type BillingPriceDto,
  type BillingStatus,
  type SchemaSet,
  type SubscriptionFacts,
  MIN_MS,
} from "../packages/contracts.js";
import { recordNotification } from "../ops/notify.js";
import { logger, errField } from "../log.js";
import { env } from "../env.js";
import { dashboardOrigin } from "../dashboard-origin.js";
import { cardFingerprintOf, markCard } from "../partners/earnings.js";

type Db = SupabaseClient<Database>;
type BillingRow = Database["public"]["Tables"]["billing_accounts"]["Row"];

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
export function setStripeClient(c: Stripe | null): void {
  injectedStripe = c;
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
  const n = Number(raw);
  return Number.isInteger(n) && n >= 0 && n <= 90 ? n : BILLING_TRIAL_DAYS;
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

async function accountOf(db: Db, tenantId: string): Promise<BillingRow | null> {
  const { data, error } = await db.from("billing_accounts").select("*").eq("tenant_id", tenantId).maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

/** The workspace's switch, and when its last member left it (00248); null for no such workspace. */
async function tenantState(db: Db, tenantId: string): Promise<{ status: string; left_empty_at: string | null } | null> {
  const { data, error } = await db.from("tenants").select("status, left_empty_at").eq("id", tenantId).maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

/** Whether the workspace's last member left it (00248): ended, so no plan is bought, resumed or started for it. */
async function leftEmpty(db: Db, tenantId: string): Promise<boolean> {
  return !!(await tenantState(db, tenantId))?.left_empty_at;
}
const ENDED_WORDS = "Nobody is in this workspace any more: it was ended when its last member left.";

/** The plan as Stripe states it, cached a few minutes per instance: the amount is never a literal here. */
let priceCache: { at: number; value: BillingPriceDto | null } | null = null;
const PRICE_TTL_MS = 5 * MIN_MS;
function cachedPrice(): BillingPriceDto | null | undefined {
  return priceCache && Date.now() - priceCache.at < PRICE_TTL_MS ? priceCache.value : undefined;
}
async function readPrice(s: Stripe, id: string): Promise<BillingPriceDto | null> {
  try {
    const p = await s.prices.retrieve(id, { expand: ["product"] });
    const product =
      p.product && typeof p.product === "object" && "name" in p.product ? (p.product as Stripe.Product).name : null;
    const iv = String(p.recurring?.interval ?? "");
    const interval =
      iv === "day" || iv === "week" || iv === "month" || iv === "year" ? (iv as BillingPriceDto["interval"]) : null;
    return { id: p.id, currency: p.currency, unit_amount: p.unit_amount, interval, product_name: product };
  } catch (e) {
    logger().error("billing_price_unreadable", { error: errField(e) });
    return null;
  }
}
export async function priceForClient(): Promise<BillingPriceDto | null> {
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
export async function tenantOf(
  db: Db,
  meta: Record<string, string> | null | undefined,
  customerId: string | null,
): Promise<BillingRow | null> {
  const fromMeta = meta?.tenant_id;
  if (fromMeta && /^[0-9a-f-]{36}$/i.test(fromMeta)) {
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
 * One subscription reading, applied: the row, the switch, the bell, the
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
): Promise<{ switched: "paused" | "resumed" | null; status: BillingStatus }> {
  const L = logger({ tenant: row.tenant_id, subscription: sub.id });
  const tenant = await tenantState(db, row.tenant_id);
  // A workspace its last member left (00248) is ended: billing never resumes it, and a plan still live is ended now.
  const ended = !!tenant?.left_empty_at;
  const facts = subscriptionFacts(sub);
  // The card's mark for the partner sweep (0012): kept apart from the row every member reads, and before the
  // compare-and-set below, so a reading that loses the race still leaves it.
  await markCard(db, row.tenant_id, cardFingerprintOf(sub), L);
  const planned = planBilling(
    {
      mode: row.mode === "direct" ? "direct" : "stripe",
      status: (row.status as BillingStatus) ?? "none",
      tenant_status: tenant?.status ?? "active",
    },
    facts,
    now.getTime(),
  );
  const plan = ended ? keptEnded(planned) : planned;
  const customerId = idOf(sub.customer);
  // Written only if the row is still what this reading was planned against.
  // Stripe sends several events for one change within milliseconds
  // (subscription.created, checkout.session.completed, invoice.paid), and
  // two of them applied side by side each saw the old row and rang the
  // same bell twice. The loser writes nothing and rings nothing; the row
  // already holds the same reading.
  const up = await db
    .from("billing_accounts")
    .update({ ...plan.row, ...(customerId ? { stripe_customer_id: customerId } : {}) })
    .eq("tenant_id", row.tenant_id)
    .eq("status", row.status)
    .eq("updated_at", row.updated_at)
    .select("tenant_id");
  if (up.error) throw new Error(up.error.message);
  if (!up.data?.length) {
    L.info("billing_apply_raced", { source, status: facts.status });
    return { switched: null, status: facts.status };
  }
  if (plan.tenantStatus) {
    const t = await db.from("tenants").update({ status: plan.tenantStatus }).eq("id", row.tenant_id);
    if (t.error) throw new Error(t.error.message);
  }
  if (ended && !PLAN_ENDED.has(facts.status)) await endLeftEmpty(sub.id, L);
  if (plan.bell) {
    await recordNotification(row.tenant_id, {
      kind: "billing",
      title: plan.bell.title,
      body: plan.bell.body,
      route: "admin/billing",
      about: null,
    });
  }
  await emitEvent(
    db,
    row.tenant_id,
    plan.switched === "paused" ? "billing.paused" : plan.switched === "resumed" ? "billing.resumed" : "billing.updated",
    "billing",
    "subscription",
    null,
    { source, status: facts.status, subscription: sub.id, price_id: facts.price_id } as Json,
  ).catch(() => {});
  L.info("billing_applied", {
    source,
    status: facts.status,
    switched: plan.switched,
    tenant_status: plan.tenantStatus,
  });
  return { switched: plan.switched, status: facts.status };
}

async function customerFor(
  s: Stripe,
  db: Db,
  row: BillingRow,
  tenantName: string,
  email: string | null,
): Promise<string> {
  if (row.stripe_customer_id) return row.stripe_customer_id;
  const c = await s.customers.create({
    name: tenantName,
    ...(email ? { email } : {}),
    metadata: { tenant_id: row.tenant_id },
  });
  const up = await db.from("billing_accounts").update({ stripe_customer_id: c.id }).eq("tenant_id", row.tenant_id);
  if (up.error) throw new Error(up.error.message);
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
 * The plan of a workspace its last member left, ended at once (00248): a card whose holder can no longer sign in is
 * charged nothing more. Never throws: the plan's next event asks again (applySubscription), and the log says why.
 */
async function endLeftEmpty(subscriptionId: string, L: ReturnType<typeof logger>): Promise<void> {
  const s = stripe();
  if (!s) return;
  try {
    await s.subscriptions.cancel(subscriptionId);
    L.info("billing_ended", { status: "canceled", left_empty: true });
  } catch (e) {
    L.error("billing_end_refused", { error: errField(e) });
  }
}

/**
 * A workspace nobody is in any more (delete_my_account, 00248): its plan ended now, and the ending applied at once, so
 * a card whose holder can no longer sign in is charged nothing more. Nothing to end is an answer, not a refusal: a
 * workspace with no billing row, a direct one, one with no plan, one whose plan already ended. A workspace someone is
 * still in is refused: its plan is its owner's to end, from Billing.
 */
export async function endFor(
  db: Db,
  tenantId: string,
  now = new Date(),
): Promise<{ ok: true; status: BillingStatus } | { ok: false; error: BillingFailure; detail?: string }> {
  const s = stripe();
  if (!s) return { ok: false, error: "not_ready" };
  if (!(await leftEmpty(db, tenantId)))
    return { ok: false, error: "not_paused", detail: "Someone is still in this workspace: its owner ends its plan." };
  const row = await accountOf(db, tenantId);
  const status = (row?.status as BillingStatus | undefined) ?? "none";
  if (!row || row.mode === "direct" || !row.stripe_subscription_id || PLAN_ENDED.has(status))
    return { ok: true, status };
  try {
    const sub = await s.subscriptions.cancel(row.stripe_subscription_id, { expand: ["default_payment_method"] });
    const r = await applySubscription(db, row, sub, "end", now);
    return { ok: true, status: r.status };
  } catch (e) {
    return { ok: false, error: "stripe_refused", detail: e instanceof Error ? e.message : String(e) };
  }
}

type BillingFailure =
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
export async function checkoutFor(
  db: Db,
  tenantId: string,
  tenantName: string,
  email: string | null,
  slug: string | null,
  back: CheckoutReturn,
): Promise<{ ok: true; url: string } | { ok: false; error: BillingFailure; detail?: string }> {
  const s = stripe();
  const price = priceId();
  if (!s || !price || !billingReadiness().ready) return { ok: false, error: "not_ready" };
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
    const customer = await customerFor(s, db, row, tenantName, email);
    // The trial applies once: a workspace that already had a subscription starts again without one. And never from the
    // first run (`start`): its checkout is the phone step's, and a number starts the plan, since a number is a cost on
    // our account whether or not a trial ever pays (maySpend; Ruben, 25 Sep 2026).
    const trial = row.stripe_subscription_id || back === "start" ? 0 : trialDays();
    const session = await s.checkout.sessions.create({
      mode: "subscription",
      customer,
      client_reference_id: tenantId,
      line_items: [{ price, quantity: 1 }],
      subscription_data: { metadata: { tenant_id: tenantId }, ...(trial > 0 ? { trial_period_days: trial } : {}) },
      allow_promotion_codes: true,
      success_url: billingReturnUrl(slug, "success", back),
      cancel_url: billingReturnUrl(slug, "cancel", back),
      metadata: { tenant_id: tenantId },
    });
    if (!session.url) return { ok: false, error: "stripe_refused", detail: "no url on the session" };
    return { ok: true, url: session.url };
  } catch (e) {
    return { ok: false, error: "stripe_refused", detail: e instanceof Error ? e.message : String(e) };
  }
}

/** The way to Stripe's portal: the card, the invoices, cancel — Stripe's page, in Stripe's words. */
export async function portalFor(
  db: Db,
  tenantId: string,
  slug: string | null = null,
): Promise<{ ok: true; url: string } | { ok: false; error: BillingFailure; detail?: string }> {
  const s = stripe();
  if (!s) return { ok: false, error: "not_ready" };
  const row = await accountOf(db, tenantId);
  if (!row) return { ok: false, error: "no_account" };
  if (row.mode === "direct") return { ok: false, error: "direct" };
  if (!row.stripe_customer_id) return { ok: false, error: "no_customer" };
  try {
    const session = await s.billingPortal.sessions.create({
      customer: row.stripe_customer_id,
      return_url: billingReturnUrl(slug, "portal", "billing"),
    });
    return { ok: true, url: session.url };
  } catch (e) {
    return { ok: false, error: "stripe_refused", detail: e instanceof Error ? e.message : String(e) };
  }
}

export async function invoicesFor(
  db: Db,
  tenantId: string,
): Promise<{ ok: true; invoices: BillingInvoiceDto[] } | { ok: false; error: BillingFailure; detail?: string }> {
  const s = stripe();
  if (!s) return { ok: false, error: "not_ready" };
  const row = await accountOf(db, tenantId);
  if (!row) return { ok: false, error: "no_account" };
  if (row.mode === "direct" || !row.stripe_customer_id) return { ok: true, invoices: [] };
  try {
    const list = await s.invoices.list({ customer: row.stripe_customer_id, limit: 12 });
    return {
      ok: true,
      invoices: list.data.map((i) => ({
        id: i.id ?? "",
        number: i.number ?? null,
        status: i.status ?? null,
        amount_due: i.amount_due,
        amount_paid: i.amount_paid,
        currency: i.currency,
        created_at: new Date(i.created * 1000).toISOString(),
        hosted_url: i.hosted_invoice_url ?? null,
        pdf_url: i.invoice_pdf ?? null,
      })),
    };
  } catch (e) {
    return { ok: false, error: "stripe_refused", detail: e instanceof Error ? e.message : String(e) };
  }
}

/** Read the subscription from Stripe now and apply it: the Refresh button, and the safety net when a delivery was missed. */
export async function syncFor(
  db: Db,
  tenantId: string,
  now = new Date(),
): Promise<{ ok: true; status: BillingStatus } | { ok: false; error: BillingFailure; detail?: string }> {
  const s = stripe();
  if (!s) return { ok: false, error: "not_ready" };
  const row = await accountOf(db, tenantId);
  if (!row) return { ok: false, error: "no_account" };
  if (row.mode === "direct") return { ok: false, error: "direct" };
  try {
    let sub: Stripe.Subscription | null = null;
    if (row.stripe_subscription_id) {
      sub = await s.subscriptions.retrieve(row.stripe_subscription_id, { expand: ["default_payment_method"] });
    } else if (row.stripe_customer_id) {
      // A Checkout finished before its delivery arrived: the newest subscription on the customer is the one.
      const list = await s.subscriptions.list({
        customer: row.stripe_customer_id,
        limit: 1,
        status: "all",
        expand: ["data.default_payment_method"],
      });
      sub = list.data[0] ?? null;
    }
    if (!sub) return { ok: false, error: "no_subscription" };
    const r = await applySubscription(db, row, sub, "sync", now);
    return { ok: true, status: r.status };
  } catch (e) {
    return { ok: false, error: "stripe_refused", detail: e instanceof Error ? e.message : String(e) };
  }
}

/** A paused subscription, resumed: Stripe bills from now; the webhook turns the receptionist back on, and the sync here does not wait for it. */
export async function resumeFor(
  db: Db,
  tenantId: string,
  now = new Date(),
): Promise<{ ok: true; status: BillingStatus } | { ok: false; error: BillingFailure; detail?: string }> {
  const s = stripe();
  if (!s) return { ok: false, error: "not_ready" };
  const row = await accountOf(db, tenantId);
  if (!row) return { ok: false, error: "no_account" };
  if (row.mode === "direct") return { ok: false, error: "direct" };
  if (!row.stripe_subscription_id) return { ok: false, error: "no_subscription" };
  if (await leftEmpty(db, tenantId)) return { ok: false, error: "platform_hold", detail: ENDED_WORDS };
  if (row.status !== "paused") return { ok: false, error: "not_paused" };
  try {
    const sub = await s.subscriptions.resume(row.stripe_subscription_id, {
      billing_cycle_anchor: "now",
      expand: ["default_payment_method"],
    });
    const r = await applySubscription(db, row, sub, "resume", now);
    return { ok: true, status: r.status };
  } catch (e) {
    return { ok: false, error: "stripe_refused", detail: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * A free trial's plan started now: Stripe ends the trial, invoices the first period and charges the card on file,
 * and its answer is applied at once, as resume's is, so what the trial did not cover (a number, texting, a lead
 * search: maySpend) opens before the webhook confirms it. The status says whether the charge went through: `active`,
 * or what Stripe made of a card that did not pay.
 */
export async function startPlanNowFor(
  db: Db,
  tenantId: string,
  now = new Date(),
): Promise<{ ok: true; status: BillingStatus } | { ok: false; error: BillingFailure; detail?: string }> {
  const s = stripe();
  if (!s) return { ok: false, error: "not_ready" };
  const row = await accountOf(db, tenantId);
  if (!row) return { ok: false, error: "no_account" };
  if (row.mode === "direct") return { ok: false, error: "direct" };
  if (!row.stripe_subscription_id) return { ok: false, error: "no_subscription" };
  if (await leftEmpty(db, tenantId)) return { ok: false, error: "platform_hold", detail: ENDED_WORDS };
  if (row.status !== "trialing") return { ok: false, error: "not_trialing" };
  try {
    const sub = await s.subscriptions.update(row.stripe_subscription_id, {
      trial_end: "now",
      expand: ["default_payment_method"],
    });
    const r = await applySubscription(db, row, sub, "start_now", now);
    return { ok: true, status: r.status };
  } catch (e) {
    return { ok: false, error: "stripe_refused", detail: e instanceof Error ? e.message : String(e) };
  }
}

/** What a forgotten customer's ledger row names as its source. A constant, not a literal in the call: the event-kinds lint reads every dotted literal inside an emitEvent. */
const DELETED_CUSTOMER = "customer.deleted";

/**
 * Stripe deleted the customer: the ids the row kept point at nothing, so the
 * portal would refuse and Checkout would reuse a customer that is gone. The
 * row says nothing is on record, and Checkout may start again with a fresh
 * customer. The workspace's own status is not touched here: the
 * subscription's own deleted event, which Stripe sends first, decided it.
 */
export async function forgetCustomer(db: Db, row: BillingRow): Promise<void> {
  const up = await db
    .from("billing_accounts")
    .update({
      stripe_customer_id: null,
      stripe_subscription_id: null,
      status: "none",
      price_id: null,
      current_period_end: null,
      trial_end: null,
      cancel_at: null,
      cancel_at_period_end: false,
      card_brand: null,
      card_last4: null,
    })
    .eq("tenant_id", row.tenant_id);
  if (up.error) throw new Error(up.error.message);
  // The reason is built outside the call: the event-kinds lint reads every
  // dotted literal inside an emitEvent to its closing paren, and Stripe's own
  // event names look exactly like ours.
  const why = { source: DELETED_CUSTOMER, status: "none" } as Json;
  await emitEvent(db, row.tenant_id, "billing.updated", "billing", "subscription", null, why).catch(() => {});
}

/**
 * How long a delivery holds its claim on an event before a retry may take it
 * over: longer than the door's whole budget (vercel.json gives it thirty
 * seconds), so only a delivery that is gone ever loses one.
 */
export const BILLING_EVENT_LEASE_MS = 2 * MIN_MS;
/**
 * A webhook read of Stripe's own budget: a timeout inside the door's thirty
 * seconds, and no retry of the SDK's own -- the door's 503 is the retry. The
 * client's default (twenty seconds, retried once) could outlive the function,
 * which is a kill mid-delivery rather than an answer Stripe retries.
 */
export const STRIPE_READ_OPTIONS: Stripe.RequestOptions = { timeout: 8_000, maxNetworkRetries: 0 };

/** Why a read of Stripe did not answer: the SDK's class (its `type`; it sets no `name`), Stripe's status when there was one, and the message. */
type StripeFailure = { type: string; status: number | null; message: string };

/** What a read of Stripe came back with: the object; Stripe's word that there is no such object; or no answer at all. */
type StripeRead<T> = { read: "found"; value: T } | { read: "gone" } | { read: "unreadable"; why: StripeFailure };

/**
 * Stripe's "No such subscription": a 404 AND code resource_missing, which a
 * bare retrieve never answers one without the other. Every other failure --
 * the network, a timeout, a 429, a 5xx, a refused key, a 404 that is not
 * Stripe's word on the object (an unrecognised URL, a proxy's page) -- is
 * Stripe not answering, which says nothing about the subscription. A false
 * "gone" applies a dead event, so the test is as narrow as it can be.
 */
function saysGone(e: unknown): boolean {
  if (!e || typeof e !== "object") return false;
  const { statusCode, code } = e as { statusCode?: unknown; code?: unknown };
  return statusCode === 404 && code === "resource_missing";
}

function stripeFailure(e: unknown): StripeFailure {
  const err = e && typeof e === "object" ? (e as { type?: unknown; statusCode?: unknown; message?: unknown }) : null;
  return {
    type: typeof err?.type === "string" ? err.type : e instanceof Error ? e.name : "Error",
    status: typeof err?.statusCode === "number" ? err.statusCode : null,
    message: typeof err?.message === "string" ? err.message : String(e),
  };
}

/**
 * A subscription read from Stripe, with the two ways of not getting one told
 * apart. The webhook's guard used to read a failed call as "the subscription
 * is gone" and apply a late event over the live one: a network blip paused a
 * paying workspace. A read that does not answer is answered 503 by the door,
 * and Stripe delivers the event again (for up to three days, backing off).
 * The read runs under STRIPE_READ_OPTIONS, so it fails inside the door's
 * budget rather than with it.
 */
export async function readSubscription(s: Stripe, id: string): Promise<StripeRead<Stripe.Subscription>> {
  try {
    const value = await s.subscriptions.retrieve(id, {}, STRIPE_READ_OPTIONS);
    return { read: "found", value };
  } catch (e) {
    return saysGone(e) ? { read: "gone" } : { read: "unreadable", why: stripeFailure(e) };
  }
}

type ClaimState = SchemaSet<"billing_events.state">;
const CLAIMED: ClaimState = "claimed";
const APPLIED: ClaimState = "applied";

/** The id written: true when this delivery is the first, false when the id is on record. */
async function insertClaim(db: Db, id: string, type: string, tenantId: string | null, lease: string): Promise<boolean> {
  const { error } = await db
    .from("billing_events")
    .insert({ id, type, tenant_id: tenantId, state: CLAIMED, lease_until: lease });
  if (!error) return true;
  if (error.code === "23505") return false;
  throw new Error(error.message);
}

/** What a delivery gets for its claim: the lease it now holds; the event applied already; or held by a delivery still inside its lease. */
type EventClaim = { claim: "taken"; lease: string } | { claim: "applied" } | { claim: "held" };

/**
 * A delivery kept by its id, under a lease.
 *
 * The row is written BEFORE the work it guards, so two deliveries of one
 * event cannot both act. Until 00194 the row said nothing about whether the
 * work had happened: a delivery killed between its claim and its apply (the
 * function's thirty seconds up, a deploy) left a row that read as done, and
 * every retry Stripe sent for three days was answered "duplicate" -- a pause,
 * a failed payment, a cancellation, lost for good. A claim now runs out: one
 * whose lease has passed and was never completed belongs to a delivery that
 * is gone, and the retry takes it over here, under a lease of its own. One
 * still inside its lease is HELD, and the door answers that with a 503,
 * never a 2xx: a 2xx ends Stripe's retries, and Stripe does not say how soon
 * its first one comes, so "duplicate" inside a dead delivery's lease would
 * lose the change all the same. Told to come back, the retry finds the claim
 * applied, or its lease run out. The takeover is a compare-and-swap on the
 * state it expects -- claimed, lease passed -- and counts its rows, because
 * a forbidden or stale UPDATE does not raise. An edge ahead of its migration
 * fails here, loudly, before it applies anything: the column it names is not
 * there.
 */
export async function keepEvent(
  db: Db,
  id: string,
  type: string,
  tenantId: string | null,
  now = new Date(),
): Promise<EventClaim> {
  const lease = new Date(now.getTime() + BILLING_EVENT_LEASE_MS).toISOString();
  if (await insertClaim(db, id, type, tenantId, lease)) return { claim: "taken", lease };
  const seen = await db.from("billing_events").select("state").eq("id", id).maybeSingle();
  if (seen.error) throw new Error(seen.error.message);
  if (seen.data?.state === APPLIED) return { claim: "applied" };
  const up = await db
    .from("billing_events")
    .update({ state: CLAIMED, lease_until: lease })
    .eq("id", id)
    .eq("state", CLAIMED)
    .lt("lease_until", now.toISOString())
    .select("id");
  if (up.error) throw new Error(up.error.message);
  if (!up.data?.length) return { claim: "held" };
  // The id's field is not called `event`: that is the line's own name (log.ts), and a field of that name replaces it.
  logger({ hook: "stripe" }).warn("stripe_event_reclaimed", { event_id: id, type, tenant_id: tenantId });
  return { claim: "taken", lease };
}

/**
 * The claim completed, once the change is made: applied, a duplicate for
 * ever. A compare-and-swap on the lease this delivery holds; false when the
 * lease had run out and a retry took the claim over meanwhile -- both applied
 * the same reading (applySubscription is idempotent, and its own compare-and-
 * set absorbs the race), so the row is left to the retry.
 */
export async function completeEvent(db: Db, id: string, lease: string, tenantId: string | null): Promise<boolean> {
  const up = await db
    .from("billing_events")
    .update({ state: APPLIED })
    .eq("id", id)
    .eq("state", CLAIMED)
    .eq("lease_until", lease)
    .select("id");
  if (up.error) throw new Error(up.error.message);
  if (up.data?.length) return true;
  logger({ hook: "stripe" }).warn("stripe_event_claim_lost", { event_id: id, tenant_id: tenantId });
  return false;
}

/**
 * The claim given back, because the work it guarded did not happen.
 *
 * The row is written BEFORE the apply, so two deliveries of one event racing
 * each other cannot both act. That ordering also meant a failed apply kept
 * the claim: the 500 asked Stripe to try again, and the retry read its own
 * row and answered "duplicate" without applying anything, so a paused
 * subscription or a failed payment was lost for good. Only a delivery that
 * was ACTED ON keeps its claim -- and only its own claim goes back: a lease
 * that has run out may already be another delivery's, and that one stands.
 */
export async function forgetEvent(db: Db, id: string, lease: string): Promise<void> {
  const { error } = await db.from("billing_events").delete().eq("id", id).eq("state", CLAIMED).eq("lease_until", lease);
  if (error) logger({ hook: "stripe" }).error("stripe_event_unclaim_failed", { event_id: id, error: error.message });
}

/**
 * The bells a payment event rings, beside the row facts it keeps. A paid invoice that took no money (a trial's $0 first
 * invoice, a full discount) is not a payment and stamps nothing: last_paid_at says the workspace has paid, which
 * Billing shows and 0020 reads to decide whether a partner joining it earns. `amountPaid` absent is a payment.
 */
export async function notePayment(
  db: Db,
  row: BillingRow,
  kind: "failed" | "paid",
  amountPaid?: number,
  now = new Date(),
): Promise<void> {
  if (kind === "failed") {
    const up = await db
      .from("billing_accounts")
      .update({ last_payment_failed_at: now.toISOString() })
      .eq("tenant_id", row.tenant_id);
    if (up.error) throw new Error(up.error.message);
    await recordNotification(row.tenant_id, {
      kind: "billing",
      title: "A payment did not go through",
      body: "The card on file was declined. Stripe tries again over the next days; update the card from Billing to keep the receptionist answering.",
      route: "admin/billing",
      about: null,
    });
  } else if (amountPaid === undefined || amountPaid > 0) {
    const up = await db
      .from("billing_accounts")
      .update({ last_paid_at: now.toISOString() })
      .eq("tenant_id", row.tenant_id);
    if (up.error) throw new Error(up.error.message);
  }
}

export async function noteTrialEnding(db: Db, row: BillingRow, trialEnd: string | null): Promise<void> {
  await recordNotification(row.tenant_id, {
    kind: "billing",
    title: "Your trial ends in three days",
    body: `The card on file is charged when the trial ends${trialEnd ? ` on ${new Date(trialEnd).toLocaleDateString("en-US", { month: "short", day: "numeric" })}` : ""}. Cancel from Billing before then if you'd rather not.`,
    route: "admin/billing",
    about: null,
  });
}

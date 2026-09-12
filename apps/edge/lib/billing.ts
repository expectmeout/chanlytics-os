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
import type { Database, Json } from "./workspace/db.js";
import { emitEvent } from "./workspace/db.js";
import {
  BILLING_STATUSES, BILLING_TRIAL_DAYS, billingAccountDto, planBilling,
  type BillingAccountDto, type BillingInvoiceDto, type BillingPriceDto, type BillingStatus, type SubscriptionFacts,
} from "./workspace/contracts.js";
import { recordNotification } from "./notify.js";
import { logger } from "./log.js";

type Db = SupabaseClient<Database>;
export type BillingRow = Database["public"]["Tables"]["billing_accounts"]["Row"];

/** The dashboard's address; what Stripe returns the browser to when DASHBOARD_ORIGIN is not set. */
export const DEFAULT_DASHBOARD_ORIGIN = "https://app.chanlytics.com";

/** Where the browser lands after Stripe: Settings › Billing on the dashboard's origin, with the outcome in a word the pane reads once. An origin only — no path, no trailing slash — or the default. */
export function dashboardOrigin(): string {
  const o = process.env.DASHBOARD_ORIGIN;
  return o && /^https:\/\/[a-z0-9.-]+$/i.test(o) ? o : DEFAULT_DASHBOARD_ORIGIN;
}

/** Settings › Billing on the workspace's own page (/w/<slug>, plan 3.5), with the outcome in a word the pane reads once; the home when the slug is unknown. */
export function billingReturnUrl(slug: string | null, outcome: "success" | "cancel" | "portal"): string {
  const page = slug ? `/w/${encodeURIComponent(slug)}` : "/";
  return `${dashboardOrigin()}${page}?billing=${outcome}#/admin/billing`;
}

let client: Stripe | null = null;
let injected: Stripe | null = null;
/** Tests: a Stripe client handed in (the SDK's own webhooks helper beside fakes for the calls), so the webhook and the ops run without a key or a network. */
export function setStripeClient(c: Stripe | null): void {
  injected = c;
}
export function stripe(): Stripe | null {
  if (injected) return injected;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  // Built on first use, not at import: the webhook and the ops share it, and
  // a deployment without a key must still answer "not ready".
  client ??= new Stripe(key, { timeout: 20_000, maxNetworkRetries: 1 });
  return client;
}

export function priceId(): string | null {
  return process.env.STRIPE_PRICE_ID || null;
}

export function trialDays(): number {
  // Trimmed and checked for emptiness FIRST, because Number("") is 0, not NaN.
  // Creating the variable in the console and leaving the value blank — which is
  // what copying .env.example into Vercel does — therefore passed every guard
  // below as a deliberate zero: Checkout omitted trial_period_days and took the
  // card on the spot, while Billing and Setup went on offering "the 0-day trial
  // with a card; nothing is charged until it ends".
  const raw = (process.env.BILLING_TRIAL_DAYS ?? "").trim();
  if (!raw) return BILLING_TRIAL_DAYS;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 0 && n <= 90 ? n : BILLING_TRIAL_DAYS;
}

/** The door is open when the key, the price and the webhook secret are all on the edge. */
export function billingReadiness(): { ready: boolean; key: boolean; price: boolean; webhook: boolean } {
  const key = !!process.env.STRIPE_SECRET_KEY;
  const price = !!priceId();
  const webhook = !!process.env.STRIPE_WEBHOOK_SECRET;
  return { ready: key && price && webhook, key, price, webhook };
}

export function accountForClient(r: BillingRow): BillingAccountDto {
  return billingAccountDto(r);
}

async function accountOf(db: Db, tenantId: string): Promise<BillingRow | null> {
  const { data, error } = await db.from("billing_accounts").select("*").eq("tenant_id", tenantId).maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

/** The plan as Stripe states it, cached a few minutes per instance: the amount is never a literal here. */
let priceCache: { at: number; value: BillingPriceDto | null } | null = null;
const PRICE_TTL_MS = 5 * 60_000;
function cachedPrice(): BillingPriceDto | null | undefined {
  return priceCache && Date.now() - priceCache.at < PRICE_TTL_MS ? priceCache.value : undefined;
}
async function readPrice(s: Stripe, id: string): Promise<BillingPriceDto | null> {
  try {
    const p = await s.prices.retrieve(id, { expand: ["product"] });
    const product = p.product && typeof p.product === "object" && "name" in p.product ? (p.product as Stripe.Product).name : null;
    const iv = String(p.recurring?.interval ?? "");
    const interval = iv === "day" || iv === "week" || iv === "month" || iv === "year" ? (iv as BillingPriceDto["interval"]) : null;
    return { id: p.id, currency: p.currency, unit_amount: p.unit_amount, interval, product_name: product };
  } catch (e) {
    console.error("billing_price_unreadable", JSON.stringify({ error: e instanceof Error ? e.message : String(e) }));
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

const unixIso = (n: number | null | undefined): string | null => (typeof n === "number" ? new Date(n * 1000).toISOString() : null);
const idOf = (x: string | { id: string } | null | undefined): string | null => (typeof x === "string" ? x : x?.id ?? null);

/** A subscription, flattened to what the row keeps. The card comes from the expanded default payment method when Stripe sent it. */
export function subscriptionFacts(sub: Stripe.Subscription): SubscriptionFacts {
  const item = sub.items.data[0];
  const pm = sub.default_payment_method && typeof sub.default_payment_method === "object" ? sub.default_payment_method : null;
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
export async function tenantOf(db: Db, meta: Record<string, string> | null | undefined, customerId: string | null): Promise<BillingRow | null> {
  const fromMeta = meta?.tenant_id;
  if (fromMeta && /^[0-9a-f-]{36}$/i.test(fromMeta)) {
    const row = await accountOf(db, fromMeta);
    if (row) return row;
  }
  if (!customerId) return null;
  const { data, error } = await db.from("billing_accounts").select("*").eq("stripe_customer_id", customerId).maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

/**
 * One subscription reading, applied: the row, the switch, the bell, the
 * event. Idempotent — applying the same reading twice writes the same row
 * and rings nothing the second time, because the bell follows a CHANGE of
 * the receptionist's state.
 */
export async function applySubscription(db: Db, row: BillingRow, sub: Stripe.Subscription, source: string, now = new Date()): Promise<{ switched: "paused" | "resumed" | null; status: BillingStatus }> {
  const L = logger({ tenant: row.tenant_id, subscription: sub.id });
  const tenant = await db.from("tenants").select("status").eq("id", row.tenant_id).maybeSingle();
  if (tenant.error) throw new Error(tenant.error.message);
  const facts = subscriptionFacts(sub);
  const plan = planBilling(
    { mode: row.mode === "direct" ? "direct" : "stripe", status: (row.status as BillingStatus) ?? "none", tenant_status: tenant.data?.status ?? "active" },
    facts,
    now.getTime(),
  );
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
  if (plan.bell) {
    await recordNotification(row.tenant_id, { kind: "billing", title: plan.bell.title, body: plan.bell.body, route: "admin/billing", about: null });
  }
  await emitEvent(db, row.tenant_id, plan.switched === "paused" ? "billing.paused" : plan.switched === "resumed" ? "billing.resumed" : "billing.updated", "billing", "subscription", null, { source, status: facts.status, subscription: sub.id, price_id: facts.price_id } as Json).catch(() => {});
  L.info("billing_applied", { source, status: facts.status, switched: plan.switched, tenant_status: plan.tenantStatus });
  return { switched: plan.switched, status: facts.status };
}

async function customerFor(s: Stripe, db: Db, row: BillingRow, tenantName: string, email: string | null): Promise<string> {
  if (row.stripe_customer_id) return row.stripe_customer_id;
  const c = await s.customers.create({ name: tenantName, ...(email ? { email } : {}), metadata: { tenant_id: row.tenant_id } });
  const up = await db.from("billing_accounts").update({ stripe_customer_id: c.id }).eq("tenant_id", row.tenant_id);
  if (up.error) throw new Error(up.error.message);
  return c.id;
}

export type BillingFailure = "not_ready" | "no_account" | "direct" | "already_subscribed" | "no_customer" | "no_subscription" | "not_paused" | "stripe_refused";

/** The way to Checkout: a card, the trial, and back to Billing with the outcome. */
export async function checkoutFor(db: Db, tenantId: string, tenantName: string, email: string | null, slug: string | null = null): Promise<{ ok: true; url: string } | { ok: false; error: BillingFailure; detail?: string }> {
  const s = stripe();
  const price = priceId();
  if (!s || !price || !billingReadiness().ready) return { ok: false, error: "not_ready" };
  const row = await accountOf(db, tenantId);
  if (!row) return { ok: false, error: "no_account" };
  if (row.mode === "direct") return { ok: false, error: "direct" };
  if (row.status === "trialing" || row.status === "active" || row.status === "past_due" || row.status === "paused" || row.status === "unpaid") return { ok: false, error: "already_subscribed" };
  try {
    const customer = await customerFor(s, db, row, tenantName, email);
    // The trial applies once: a workspace that already had a subscription starts again without one.
    const trial = row.stripe_subscription_id ? 0 : trialDays();
    const session = await s.checkout.sessions.create({
      mode: "subscription",
      customer,
      client_reference_id: tenantId,
      line_items: [{ price, quantity: 1 }],
      subscription_data: { metadata: { tenant_id: tenantId }, ...(trial > 0 ? { trial_period_days: trial } : {}) },
      allow_promotion_codes: true,
      success_url: billingReturnUrl(slug, "success"),
      cancel_url: billingReturnUrl(slug, "cancel"),
      metadata: { tenant_id: tenantId },
    });
    if (!session.url) return { ok: false, error: "stripe_refused", detail: "no url on the session" };
    return { ok: true, url: session.url };
  } catch (e) {
    return { ok: false, error: "stripe_refused", detail: e instanceof Error ? e.message : String(e) };
  }
}

/** The way to Stripe's portal: the card, the invoices, cancel — Stripe's page, in Stripe's words. */
export async function portalFor(db: Db, tenantId: string, slug: string | null = null): Promise<{ ok: true; url: string } | { ok: false; error: BillingFailure; detail?: string }> {
  const s = stripe();
  if (!s) return { ok: false, error: "not_ready" };
  const row = await accountOf(db, tenantId);
  if (!row) return { ok: false, error: "no_account" };
  if (row.mode === "direct") return { ok: false, error: "direct" };
  if (!row.stripe_customer_id) return { ok: false, error: "no_customer" };
  try {
    const session = await s.billingPortal.sessions.create({ customer: row.stripe_customer_id, return_url: billingReturnUrl(slug, "portal") });
    return { ok: true, url: session.url };
  } catch (e) {
    return { ok: false, error: "stripe_refused", detail: e instanceof Error ? e.message : String(e) };
  }
}

export async function invoicesFor(db: Db, tenantId: string): Promise<{ ok: true; invoices: BillingInvoiceDto[] } | { ok: false; error: BillingFailure; detail?: string }> {
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
export async function syncFor(db: Db, tenantId: string, now = new Date()): Promise<{ ok: true; status: BillingStatus } | { ok: false; error: BillingFailure; detail?: string }> {
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
      const list = await s.subscriptions.list({ customer: row.stripe_customer_id, limit: 1, status: "all", expand: ["data.default_payment_method"] });
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
export async function resumeFor(db: Db, tenantId: string, now = new Date()): Promise<{ ok: true; status: BillingStatus } | { ok: false; error: BillingFailure; detail?: string }> {
  const s = stripe();
  if (!s) return { ok: false, error: "not_ready" };
  const row = await accountOf(db, tenantId);
  if (!row) return { ok: false, error: "no_account" };
  if (row.mode === "direct") return { ok: false, error: "direct" };
  if (!row.stripe_subscription_id) return { ok: false, error: "no_subscription" };
  if (row.status !== "paused") return { ok: false, error: "not_paused" };
  try {
    const sub = await s.subscriptions.resume(row.stripe_subscription_id, { billing_cycle_anchor: "now", expand: ["default_payment_method"] });
    const r = await applySubscription(db, row, sub, "resume", now);
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
    .update({ stripe_customer_id: null, stripe_subscription_id: null, status: "none", price_id: null, current_period_end: null, trial_end: null, cancel_at: null, cancel_at_period_end: false, card_brand: null, card_last4: null })
    .eq("tenant_id", row.tenant_id);
  if (up.error) throw new Error(up.error.message);
  // The reason is built outside the call: the event-kinds lint reads every
  // dotted literal inside an emitEvent to its closing paren, and Stripe's own
  // event names look exactly like ours.
  const why = { source: DELETED_CUSTOMER, status: "none" } as Json;
  await emitEvent(db, row.tenant_id, "billing.updated", "billing", "subscription", null, why).catch(() => {});
}

/** A delivery kept by its id; false when it was already on record. */
export async function keepEvent(db: Db, id: string, type: string, tenantId: string | null): Promise<boolean> {
  const { error } = await db.from("billing_events").insert({ id, type, tenant_id: tenantId });
  if (!error) return true;
  if (error.code === "23505") return false;
  throw new Error(error.message);
}

/** The bells a payment event rings, beside the row facts it keeps. */
export async function notePayment(db: Db, row: BillingRow, kind: "failed" | "paid", now = new Date()): Promise<void> {
  if (kind === "failed") {
    const up = await db.from("billing_accounts").update({ last_payment_failed_at: now.toISOString() }).eq("tenant_id", row.tenant_id);
    if (up.error) throw new Error(up.error.message);
    await recordNotification(row.tenant_id, { kind: "billing", title: "A payment did not go through", body: "The card on file was declined. Stripe tries again over the next days; update the card from Billing to keep the receptionist answering.", route: "admin/billing", about: null });
  } else {
    const up = await db.from("billing_accounts").update({ last_paid_at: now.toISOString() }).eq("tenant_id", row.tenant_id);
    if (up.error) throw new Error(up.error.message);
  }
}

export async function noteTrialEnding(db: Db, row: BillingRow, trialEnd: string | null): Promise<void> {
  await recordNotification(row.tenant_id, { kind: "billing", title: "Your trial ends in three days", body: `The card on file is charged when the trial ends${trialEnd ? ` on ${new Date(trialEnd).toLocaleDateString("en-US", { month: "short", day: "numeric" })}` : ""}. Cancel from Billing before then if you'd rather not.`, route: "admin/billing", about: null });
}

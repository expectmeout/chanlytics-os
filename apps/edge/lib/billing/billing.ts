/** Billing: billing. */

import type Stripe from "stripe";
import {
  applyBilling,
  completeBillingEvent,
  findBillingEventState,
  forgetBillingEvent,
  insertBillingClaim,
  reclaimBillingEvent,
} from "@chanlytics/db/billing";
import { emitEvent } from "@chanlytics/db/events";
import { type BillingInvoiceDto, type BillingStatus, type SchemaSet, MIN_MS } from "@chanlytics/contracts";
import { mendWarnings } from "../shared/alerts/notify.js";
import { tellOnce } from "./notices.js";
import { logger } from "../shared/log.js";
import {
  ENDED_WORDS,
  accountOf,
  applySubscription,
  keepOnRow,
  leftEmpty,
  stripe,
  type BillingFailure,
  type BillingRow,
  type Db,
} from "./subscription.js";
import type { TenantId } from "@chanlytics/contracts";

export async function getInvoices(
  db: Db,
  tenantId: TenantId,
): Promise<{ ok: true; invoices: BillingInvoiceDto[] } | { ok: false; error: BillingFailure; detail?: string }> {
  const client = stripe();
  if (!client) return { ok: false, error: "not_ready" };
  const row = await accountOf(db, tenantId);
  if (!row) return { ok: false, error: "no_account" };
  if (row.mode === "direct" || !row.stripe_customer_id) return { ok: true, invoices: [] };
  try {
    const list = await client.invoices.list({ customer: row.stripe_customer_id, limit: 12 });
    return {
      ok: true,
      invoices: list.data.map((index) => ({
        id: index.id ?? "",
        number: index.number ?? null,
        status: index.status ?? null,
        amount_due: index.amount_due,
        amount_paid: index.amount_paid,
        currency: index.currency,
        created_at: new Date(index.created * 1000).toISOString(),
        hosted_url: index.hosted_invoice_url ?? null,
        pdf_url: index.invoice_pdf ?? null,
      })),
    };
  } catch (e) {
    return { ok: false, error: "stripe_refused", detail: e instanceof Error ? e.message : String(e) };
  }
}

/** Read the subscription from Stripe now and apply it: the Refresh button, and the safety net when a delivery was missed. */
export async function syncFor(
  db: Db,
  tenantId: TenantId,
  now = new Date(),
): Promise<{ ok: true; status: BillingStatus } | { ok: false; error: BillingFailure; detail?: string }> {
  const client = stripe();
  if (!client) return { ok: false, error: "not_ready" };
  const row = await accountOf(db, tenantId);
  if (!row) return { ok: false, error: "no_account" };
  if (row.mode === "direct") return { ok: false, error: "direct" };
  try {
    let sub: Stripe.Subscription | null = null;
    if (row.stripe_subscription_id) {
      sub = await client.subscriptions.retrieve(row.stripe_subscription_id, { expand: ["default_payment_method"] });
    } else if (row.stripe_customer_id) {
      // A Checkout finished before its delivery arrived: the newest subscription on the customer is the one.
      const list = await client.subscriptions.list({
        customer: row.stripe_customer_id,
        limit: 1,
        status: "all",
        expand: ["data.default_payment_method"],
      });
      sub = list.data[0] ?? null;
    }
    if (!sub) return { ok: false, error: "no_subscription" };
    const otherApplySubscription = await applySubscription(db, row, sub, "sync", now);
    return { ok: true, status: otherApplySubscription.status };
  } catch (e) {
    return { ok: false, error: "stripe_refused", detail: e instanceof Error ? e.message : String(e) };
  }
}

/** A paused subscription, resumed: Stripe bills from now; the webhook turns the receptionist back on, and the sync here does not wait for it. */
export async function resumeFor(
  db: Db,
  tenantId: TenantId,
  now = new Date(),
  by: string | null = null,
): Promise<{ ok: true; status: BillingStatus } | { ok: false; error: BillingFailure; detail?: string }> {
  const client = stripe();
  if (!client) return { ok: false, error: "not_ready" };
  const row = await accountOf(db, tenantId);
  if (!row) return { ok: false, error: "no_account" };
  if (row.mode === "direct") return { ok: false, error: "direct" };
  if (!row.stripe_subscription_id) return { ok: false, error: "no_subscription" };
  if (await leftEmpty(db, tenantId)) return { ok: false, error: "platform_hold", detail: ENDED_WORDS };
  if (row.status !== "paused") return { ok: false, error: "not_paused" };
  try {
    const sub = await client.subscriptions.resume(row.stripe_subscription_id, {
      billing_cycle_anchor: "now",
      expand: ["default_payment_method"],
    });
    const r = await applySubscription(db, row, sub, "resume", now, by);
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
  tenantId: TenantId,
  now = new Date(),
  by: string | null = null,
): Promise<{ ok: true; status: BillingStatus } | { ok: false; error: BillingFailure; detail?: string }> {
  const client = stripe();
  if (!client) return { ok: false, error: "not_ready" };
  const row = await accountOf(db, tenantId);
  if (!row) return { ok: false, error: "no_account" };
  if (row.mode === "direct") return { ok: false, error: "direct" };
  if (!row.stripe_subscription_id) return { ok: false, error: "no_subscription" };
  if (await leftEmpty(db, tenantId)) return { ok: false, error: "platform_hold", detail: ENDED_WORDS };
  if (row.status !== "trialing") return { ok: false, error: "not_trialing" };
  try {
    const sub = await client.subscriptions.update(row.stripe_subscription_id, {
      trial_end: "now",
      expand: ["default_payment_method"],
    });
    const r = await applySubscription(db, row, sub, "start_now", now, by);
    return { ok: true, status: r.status };
  } catch (e) {
    return { ok: false, error: "stripe_refused", detail: e instanceof Error ? e.message : String(e) };
  }
}

/** What a forgotten customer's ledger row names as its source. A constant, not a literal in the call: the event-kinds lint reads every dotted literal inside an emitEvent. */
const DELETED_CUSTOMER = "customer.deleted";

/**
 * Stripe deleted the customer: the ids the row kept point at nothing, so the portal would refuse and Checkout would
 * reuse a customer that is gone. The row says nothing is on record, and Checkout may start again with a fresh customer.
 * Only the row's own customer is forgotten (false, and nothing written, for any other): one routed here by its metadata
 * may be a customer the workspace has left. The workspace's own status is not touched here: the subscription's own
 * deleted event, which Stripe sends first, decided it.
 */
export async function forgetCustomer(db: Db, row: BillingRow, customerId: string): Promise<boolean> {
  const forgotten = await applyBilling(db, {
    tenantId: row.tenant_id,
    row: {
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
    },
    expect: { stripe_customer_id: customerId },
    tenantStatus: null,
  });
  if (!forgotten) return false;
  const reason = { source: DELETED_CUSTOMER, status: "none" };
  await emitEvent(db, row.tenant_id, "billing.updated", "subscription", null, reason).catch(() => {});
  return true;
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
export function saysGone(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const { statusCode, code } = error as { statusCode?: unknown; code?: unknown };
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
export async function readSubscription(stripe: Stripe, id: string): Promise<StripeRead<Stripe.Subscription>> {
  try {
    const value = await stripe.subscriptions.retrieve(id, {}, STRIPE_READ_OPTIONS);
    return { read: "found", value };
  } catch (e) {
    return saysGone(e) ? { read: "gone" } : { read: "unreadable", why: stripeFailure(e) };
  }
}

type ClaimState = SchemaSet<"billing_events.state">;

const CLAIMED: ClaimState = "claimed";

const APPLIED: ClaimState = "applied";

/** The id written: true when this delivery is the first, false when the id is on record. */
async function insertClaim(
  db: Db,
  id: string,
  type: string,
  tenantId: TenantId | null,
  lease: string,
): Promise<boolean> {
  const { error } = await insertBillingClaim(db, { id, type, tenant_id: tenantId, state: CLAIMED, lease_until: lease });
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
  tenantId: TenantId | null,
  now = new Date(),
): Promise<EventClaim> {
  const lease = new Date(now.getTime() + BILLING_EVENT_LEASE_MS).toISOString();
  if (await insertClaim(db, id, type, tenantId, lease)) return { claim: "taken", lease };
  // Stripe's own ledger, keyed by its event's id before the workspace is known: read across workspaces by design.
  const seen = await findBillingEventState(db, id);
  if (seen.error) throw new Error(seen.error.message);
  if (seen.data?.state === APPLIED) return { claim: "applied" };
  const up = await reclaimBillingEvent(db, id, lease, now.toISOString());
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
export async function completeEvent(db: Db, id: string, lease: string, tenantId: TenantId | null): Promise<boolean> {
  const up = await completeBillingEvent(db, id, lease);
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
  const { error } = await forgetBillingEvent(db, id, lease);
  if (error) logger({ hook: "stripe" }).error("stripe_event_unclaim_failed", { event_id: id, error: error.message });
}

/** A payment event, as its bells read it: what it says, what the invoice took (absent is a payment), and Stripe's id of it. */
interface PaymentNote {
  kind: "failed" | "paid";
  amountPaid?: number;
  /** The Stripe event: a bell it rings is kept once under it, so its retry tells nothing twice (S6-12). */
  eventId: string;
}

/**
 * The bells a payment event rings, beside the row facts it keeps. A paid invoice that took no money (a trial's $0 first
 * invoice, a full discount) is not a payment and stamps nothing: last_paid_at says the workspace has paid, which
 * Billing shows and 0020 reads to decide whether a partner joining it earns. A declined card is mailed as well as rung
 * (tellOnce, S6-11), once under the event; a bell not kept, or a mail still owed, is thrown, so Stripe's retry tells it,
 * the mail alone when the bell was kept. Nothing waits on it here: the stamp is the same on every try.
 */
export async function notePayment(db: Db, row: BillingRow, paymentNote: PaymentNote, now = new Date()): Promise<void> {
  if (paymentNote.kind === "failed") {
    await keepOnRow(db, row.tenant_id, { last_payment_failed_at: now.toISOString() });
    const { mailOwed } = await tellOnce(
      db,
      row.tenant_id,
      {
        title: "A payment did not go through",
        body: "The card on file was declined. Stripe tries again over the next days; update the card from Billing to keep the receptionist answering.",
      },
      `stripe:${paymentNote.eventId}`,
    );
    if (mailOwed) throw new Error("the declined card's mail did not go; it goes on the retry");
    await emitEvent(db, row.tenant_id, "billing.payment_failed", "subscription", null, {}).catch(() => {});
  } else if (paymentNote.amountPaid === undefined || paymentNote.amountPaid > 0) {
    await keepOnRow(db, row.tenant_id, { last_paid_at: now.toISOString() });
    await emitEvent(db, row.tenant_id, "billing.paid", "subscription", null, {}).catch(() => {});
    // A paid invoice mends "A payment did not go through" and the trial's warning (contracts NOTICE_MENDS).
    await mendWarnings(db, { tenantId: row.tenant_id, by: { change: "billing.paid" }, subject: null, keptId: null });
  }
}

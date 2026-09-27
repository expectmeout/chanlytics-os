/**
 * POST /api/stripe-webhook — what Stripe tells us, verified, kept once, applied.
 *
 * The signature is checked against the raw body before anything is read
 * (Stripe-Signature, the endpoint's secret). A delivery is kept by its
 * event id under a lease (lib/billing/billing.ts keepEvent), so a retry or a replay
 * changes nothing while a delivery that died mid-way is retried. Subscription
 * events carry the subscription itself and are applied through the one
 * routine the ops use (lib/billing/billing.ts applySubscription); a finished Checkout
 * is read back from Stripe so the row is right when the browser returns;
 * payment events ring their bells. The answer is 200 once the change is made
 * and the claim completed; a failure to write is a 500, and a Stripe that
 * could not be read, or a claim another delivery still holds, is a 503, so
 * Stripe tries again either way.
 *
 * A partner's ledger (0012) rides on the same deliveries: a paid plan
 * invoice writes the share of the partner who brought the workspace, and a
 * refund or a dispute of it writes what that does to the share
 * (lib/partners/earnings.ts). A workspace nobody brought costs one read and
 * no call to Stripe.
 */
import type Stripe from "stripe";
import { json } from "../lib/http.js";
import { pg } from "../lib/pg.js";
import { logger } from "../lib/log.js";
import {
  applySubscription,
  completeEvent,
  forgetCustomer,
  forgetEvent,
  keepEvent,
  notePayment,
  noteTrialEnding,
  readSubscription,
  STRIPE_READ_OPTIONS,
  stripe,
  subscriptionFacts,
  tenantOf,
} from "../lib/billing/billing.js";
import {
  earnFromInvoice,
  invoiceOfPayment,
  isAttributed,
  reverseForInvoice,
  type LedgerOutcome,
} from "../lib/partners/earnings.js";
import { receptionistOn } from "../lib/packages/contracts.js";
import { env } from "../lib/env.js";

const idOf = (x: string | { id: string } | null | undefined): string | null =>
  typeof x === "string" ? x : (x?.id ?? null);

export async function POST(request: Request): Promise<Response> {
  const L = logger({ hook: "stripe" });
  const s = stripe();
  const secret = env.STRIPE_WEBHOOK_SECRET;
  if (!s || !secret) return json(503, { ok: false, error: "not_ready" });
  const raw = await request.text();
  const sig = request.headers.get("stripe-signature") ?? "";
  let event: Stripe.Event;
  try {
    event = s.webhooks.constructEvent(raw, sig, secret);
  } catch (e) {
    L.warn("stripe_signature_rejected", { error: e instanceof Error ? e.message : String(e) });
    return json(400, { ok: false, error: "signature" });
  }
  const db = pg();
  if (!db) return json(503, { ok: false, error: "no_database" });

  // The claim, and the lease THIS delivery holds on it. A delivery that took
  // the claim and then failed gives it back below, so the retry the 500 asks
  // for is not answered "duplicate" by our own half-finished attempt; one
  // that is killed outright cannot, and its lease runs out instead.
  let lease: string | null = null;
  let tenant: string | null = null;
  /** The claim taken (null), or the answer for a delivery that did not get it. */
  const keep = async (tenantId: string | null): Promise<Response | null> => {
    const c = await keepEvent(db, event.id, event.type, tenantId);
    if (c.claim === "taken") {
      lease = c.lease;
      tenant = tenantId;
      return null;
    }
    if (c.claim === "applied") return json(200, { ok: true, duplicate: true });
    // Held by a delivery still inside its lease. Not a 2xx: Stripe stops
    // retrying on one, and were that delivery dead, the change would be lost
    // for good -- Stripe does not publish how soon its first retry comes.
    // Told to come back, the retry finds the claim applied, or its lease run
    // out, and takes it over.
    L.info("stripe_event_in_flight", { type: event.type, event_id: event.id });
    return json(503, { ok: false, error: "in_flight" });
  };
  // The answer once the work is done, the claim completed first: from here a
  // retry is a duplicate for ever. Nothing before this makes it one.
  const done = async (res: Response): Promise<Response> => {
    if (lease) await completeEvent(db, event.id, lease, tenant);
    return res;
  };
  const giveBack = async (): Promise<void> => {
    if (lease) await forgetEvent(db, event.id, lease);
  };
  // A ledger door the database does not have yet (either deploy order, 0012): the webhook's own work is done and
  // answered 200, but the claim is given back, so the event resent from Stripe's dashboard once the migration is in
  // writes the share, where a completed claim would answer it as a duplicate.
  const ledgerAnswer = async (out: LedgerOutcome, key: "partner_earned" | "partner_reversed"): Promise<Response> => {
    if (out && "skipped" in out) {
      await giveBack();
      return json(200, { ok: true, partner_skipped: true });
    }
    return done(json(200, { ok: true, ...(out ? { [key]: out.earned } : {}) }));
  };
  // The invoice a payment paid (0012): read as every Stripe read here is, under STRIPE_READ_OPTIONS; a read that does
  // not answer gives the claim back, and the door's 503 has Stripe deliver the event again.
  const UNREADABLE = Symbol("unreadable");
  const invoiceOf = async (paymentIntent: string | null): Promise<string | null | typeof UNREADABLE> => {
    try {
      return await invoiceOfPayment(s, paymentIntent, STRIPE_READ_OPTIONS);
    } catch (e) {
      L.warn("stripe_read_failed", {
        type: event.type,
        payment_intent: paymentIntent,
        error: e instanceof Error ? e.message : String(e),
      });
      await giveBack();
      return UNREADABLE;
    }
  };

  try {
    switch (event.type) {
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
      case "customer.subscription.paused":
      case "customer.subscription.resumed": {
        const sub = event.data.object;
        const row = await tenantOf(db, sub.metadata, idOf(sub.customer));
        const dup = await keep(row?.tenant_id ?? null);
        if (dup) return dup;
        if (!row) {
          L.warn("stripe_event_unrouted", { type: event.type, subscription: sub.id });
          return done(json(200, { ok: true, unrouted: true }));
        }
        // Not the subscription this workspace is on. Stripe retries for days
        // and does not promise order, so a late word about a subscription the
        // workspace has already left — cancelled, then replaced through
        // Checkout — used to be written over the live one: the row took the
        // dead id and the paused status, the receptionist went quiet on a
        // paying customer, and Refresh then followed the dead id and did it
        // again. A reading that would keep the receptionist ON is a genuine
        // replacement and is applied; a dead one about a subscription we no
        // longer hold can never be right.
        if (
          row.stripe_subscription_id &&
          row.stripe_subscription_id !== sub.id &&
          !receptionistOn(subscriptionFacts(sub).status)
        ) {
          // The row is the reason to skip, so the row has to be worth trusting,
          // and it is not always: applySubscription writes under a compare-and-
          // set and DOES NOT WRITE when it loses (billing_apply_raced), which
          // Stripe's own burst of three events for one Checkout can cause. A
          // row left naming a subscription the workspace has already replaced
          // would then make this guard discard every later "the subscription
          // ended" about the live one — answered 200, never retried, the
          // receptionist answering unbilled for good. So the row's claim is
          // checked against Stripe before it is believed: if what the row
          // names is gone or already dead, the row is the stale one and this
          // event is the truth.
          const current = await readSubscription(s, row.stripe_subscription_id);
          if (current.read === "unreadable") {
            // Not "gone": Stripe did not answer, and the row cannot be judged.
            // A failed read used to count as gone, and a network blip then
            // applied this dead event over the live subscription. Nothing is
            // written; the claim goes back; the 503 has Stripe deliver the
            // event again, and the read is tried again then.
            L.warn("stripe_read_failed", {
              type: event.type,
              subscription: sub.id,
              named_by_row: row.stripe_subscription_id,
              error: current.why.message,
              stripe_type: current.why.type,
              status: current.why.status,
            });
            await giveBack();
            return json(503, { ok: false, error: "stripe_unreadable" });
          }
          const rowStillLive = current.read === "found" && receptionistOn(subscriptionFacts(current.value).status);
          if (rowStillLive) {
            L.warn("stripe_event_superseded", {
              type: event.type,
              subscription: sub.id,
              current: row.stripe_subscription_id,
            });
            return done(json(200, { ok: true, superseded: true }));
          }
          L.warn("stripe_event_stale_row", {
            type: event.type,
            subscription: sub.id,
            named_by_row: row.stripe_subscription_id,
            row_status: current.read === "found" ? subscriptionFacts(current.value).status : "gone",
          });
        }
        // The event's copy has no expanded card; the row keeps the card from
        // the last full read (sync) when this one has none. A read that fails
        // is a 500, never the event's stale copy applied as if it were fresh;
        // it runs under the guard's budget too, so a slow Stripe is a 500
        // Stripe retries, not a kill inside the function's thirty seconds.
        const full = await s.subscriptions.retrieve(
          sub.id,
          { expand: ["default_payment_method"] },
          STRIPE_READ_OPTIONS,
        );
        const r = await applySubscription(db, row, full, event.type);
        return done(json(200, { ok: true, status: r.status, switched: r.switched }));
      }
      case "checkout.session.completed": {
        const session = event.data.object;
        const subId = idOf(session.subscription);
        const row = await tenantOf(db, session.metadata, idOf(session.customer));
        const dup = await keep(row?.tenant_id ?? null);
        if (dup) return dup;
        if (!row || !subId) {
          L.warn("stripe_checkout_unrouted", { session: session.id });
          return done(json(200, { ok: true, unrouted: true }));
        }
        const sub = await s.subscriptions.retrieve(subId, { expand: ["default_payment_method"] }, STRIPE_READ_OPTIONS);
        const r = await applySubscription(db, row, sub, event.type);
        return done(json(200, { ok: true, status: r.status }));
      }
      case "customer.subscription.trial_will_end": {
        const sub = event.data.object;
        const row = await tenantOf(db, sub.metadata, idOf(sub.customer));
        const dup = await keep(row?.tenant_id ?? null);
        if (dup) return dup;
        if (row)
          await noteTrialEnding(
            db,
            row,
            typeof sub.trial_end === "number" ? new Date(sub.trial_end * 1000).toISOString() : null,
          );
        return done(json(200, { ok: true }));
      }
      case "invoice.payment_failed":
      case "invoice.paid": {
        const inv = event.data.object;
        const row = await tenantOf(db, inv.metadata, idOf(inv.customer));
        const dup = await keep(row?.tenant_id ?? null);
        if (dup) return dup;
        if (row) await notePayment(db, row, event.type === "invoice.paid" ? "paid" : "failed", inv.amount_paid);
        const earned =
          row && event.type === "invoice.paid" ? await earnFromInvoice(db, row.tenant_id, inv, event.id, L) : null;
        return ledgerAnswer(earned, "partner_earned");
      }
      case "charge.refunded": {
        // A partner's share gives back what the refund takes (0012). Stripe says the charge's refunded total so far;
        // the door takes the difference from what earlier refunds took.
        const charge = event.data.object;
        const row = await tenantOf(db, charge.metadata, idOf(charge.customer));
        const dup = await keep(row?.tenant_id ?? null);
        if (dup) return dup;
        if (!row || !(await isAttributed(db, row.tenant_id))) return done(json(200, { ok: true }));
        const invoice = await invoiceOf(idOf(charge.payment_intent));
        if (invoice === UNREADABLE) return json(503, { ok: false, error: "stripe_unreadable" });
        const r = invoice ? await reverseForInvoice(db, invoice, event.id, "refund", charge.amount_refunded, L) : null;
        return ledgerAnswer(r, "partner_reversed");
      }
      case "charge.dispute.created":
      case "charge.dispute.closed": {
        // A dispute takes the share while it is open; a dispute won gives it back, and one lost leaves it taken.
        const dispute = event.data.object;
        const dup = await keep(null);
        if (dup) return dup;
        // An inquiry (warning_*) takes no money, so it takes no share, and its close gives nothing back. A dispute
        // closed won, or prevented, gives back what its dispute took; lost leaves it taken.
        if (event.type === "charge.dispute.created" && dispute.status.startsWith("warning_"))
          return done(json(200, { ok: true }));
        if (event.type === "charge.dispute.closed" && dispute.status !== "won" && dispute.status !== "prevented")
          return done(json(200, { ok: true }));
        const invoice = await invoiceOf(idOf(dispute.payment_intent));
        if (invoice === UNREADABLE) return json(503, { ok: false, error: "stripe_unreadable" });
        const kind = event.type === "charge.dispute.created" ? "dispute" : "dispute_won";
        const r = invoice ? await reverseForInvoice(db, invoice, event.id, kind, dispute.amount, L) : null;
        return ledgerAnswer(r, "partner_reversed");
      }
      case "customer.deleted": {
        // The ids the row kept point at nothing now: forgotten, so the portal
        // does not trip on them and Checkout starts a fresh customer.
        const c = event.data.object;
        const row = await tenantOf(db, c.metadata, c.id);
        const dup = await keep(row?.tenant_id ?? null);
        if (dup) return dup;
        if (row) await forgetCustomer(db, row);
        return done(json(200, { ok: true, forgotten: !!row }));
      }
      default:
        // Kept, so a type we do not act on is still on record once; a second
        // delivery of one is answered the same, since there is nothing to lose.
        await keep(null);
        return done(json(200, { ok: true, ignored: event.type }));
    }
  } catch (e) {
    L.error("stripe_webhook_failed", { type: event.type, error: e instanceof Error ? e.message : String(e) });
    // The claim goes back before the 500 does: Stripe's retry has to find the
    // event unspent, or the change this delivery failed to apply is lost.
    await giveBack();
    return json(500, { ok: false, error: "write_failed" });
  }
}

/**
 * POST /api/stripe-webhook — what Stripe tells us, verified, kept once, applied.
 *
 * The signature is checked against the raw body before anything is read
 * (Stripe-Signature, the endpoint's secret). A delivery is kept by its
 * event id, so a retry or a replay changes nothing. Subscription events
 * carry the subscription itself and are applied through the one routine
 * the ops use (lib/billing.ts applySubscription); a finished Checkout is
 * read back from Stripe so the row is right when the browser returns;
 * payment events ring their bells. The answer is 200 as soon as the row
 * is written; a failure to write is a 500 so Stripe tries again.
 */
import type Stripe from "stripe";
import { json } from "../lib/http.js";
import { pg } from "../lib/pg.js";
import { logger } from "../lib/log.js";
import {
  applySubscription,
  forgetCustomer,
  forgetEvent,
  keepEvent,
  notePayment,
  noteTrialEnding,
  stripe,
  subscriptionFacts,
  tenantOf,
} from "../lib/billing.js";
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

  // The claim, and whether THIS delivery took it. A delivery that took the
  // claim and then failed gives it back below, so the retry the 500 asks for
  // is not answered "duplicate" by our own half-finished attempt.
  let claimed = false;
  const keep = async (tenantId: string | null): Promise<boolean> => {
    const first = await keepEvent(db, event.id, event.type, tenantId);
    if (first) claimed = true;
    return first;
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
        if (!(await keep(row?.tenant_id ?? null))) return json(200, { ok: true, duplicate: true });
        if (!row) {
          L.warn("stripe_event_unrouted", { type: event.type, subscription: sub.id });
          return json(200, { ok: true, unrouted: true });
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
          const current = await s.subscriptions.retrieve(row.stripe_subscription_id).catch(() => null);
          const rowStillLive = current !== null && receptionistOn(subscriptionFacts(current).status);
          if (rowStillLive) {
            L.warn("stripe_event_superseded", {
              type: event.type,
              subscription: sub.id,
              current: row.stripe_subscription_id,
            });
            return json(200, { ok: true, superseded: true });
          }
          L.warn("stripe_event_stale_row", {
            type: event.type,
            subscription: sub.id,
            named_by_row: row.stripe_subscription_id,
            row_status: current ? subscriptionFacts(current).status : "gone",
          });
        }
        // The event's copy has no expanded card; the row keeps the card from
        // the last full read (sync) when this one has none. A read that fails
        // is a 500, never the event's stale copy applied as if it were fresh.
        const full = await s.subscriptions.retrieve(sub.id, { expand: ["default_payment_method"] });
        const r = await applySubscription(db, row, full, event.type);
        return json(200, { ok: true, status: r.status, switched: r.switched });
      }
      case "checkout.session.completed": {
        const session = event.data.object;
        const subId = idOf(session.subscription);
        const row = await tenantOf(db, session.metadata, idOf(session.customer));
        if (!(await keep(row?.tenant_id ?? null))) return json(200, { ok: true, duplicate: true });
        if (!row || !subId) {
          L.warn("stripe_checkout_unrouted", { session: session.id });
          return json(200, { ok: true, unrouted: true });
        }
        const sub = await s.subscriptions.retrieve(subId, { expand: ["default_payment_method"] });
        const r = await applySubscription(db, row, sub, event.type);
        return json(200, { ok: true, status: r.status });
      }
      case "customer.subscription.trial_will_end": {
        const sub = event.data.object;
        const row = await tenantOf(db, sub.metadata, idOf(sub.customer));
        if (!(await keep(row?.tenant_id ?? null))) return json(200, { ok: true, duplicate: true });
        if (row)
          await noteTrialEnding(
            db,
            row,
            typeof sub.trial_end === "number" ? new Date(sub.trial_end * 1000).toISOString() : null,
          );
        return json(200, { ok: true });
      }
      case "invoice.payment_failed":
      case "invoice.paid": {
        const inv = event.data.object;
        const row = await tenantOf(db, inv.metadata, idOf(inv.customer));
        if (!(await keep(row?.tenant_id ?? null))) return json(200, { ok: true, duplicate: true });
        if (row) await notePayment(db, row, event.type === "invoice.paid" ? "paid" : "failed");
        return json(200, { ok: true });
      }
      case "customer.deleted": {
        // The ids the row kept point at nothing now: forgotten, so the portal
        // does not trip on them and Checkout starts a fresh customer.
        const c = event.data.object;
        const row = await tenantOf(db, c.metadata, c.id);
        if (!(await keep(row?.tenant_id ?? null))) return json(200, { ok: true, duplicate: true });
        if (row) await forgetCustomer(db, row);
        return json(200, { ok: true, forgotten: !!row });
      }
      default:
        // Kept, so a type we do not act on is still on record once.
        await keep(null);
        return json(200, { ok: true, ignored: event.type });
    }
  } catch (e) {
    L.error("stripe_webhook_failed", { type: event.type, error: e instanceof Error ? e.message : String(e) });
    // The claim goes back before the 500 does: Stripe's retry has to find the
    // event unspent, or the change this delivery failed to apply is lost.
    if (claimed) await forgetEvent(db, event.id);
    return json(500, { ok: false, error: "write_failed" });
  }
}

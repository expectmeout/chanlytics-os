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
import { applySubscription, forgetCustomer, keepEvent, notePayment, noteTrialEnding, stripe, tenantOf } from "../lib/billing.js";

export const config = { maxDuration: 30 };

const idOf = (x: string | { id: string } | null | undefined): string | null => (typeof x === "string" ? x : x?.id ?? null);

export async function POST(request: Request): Promise<Response> {
  const L = logger({ hook: "stripe" });
  const s = stripe();
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
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

  try {
    switch (event.type) {
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
      case "customer.subscription.paused":
      case "customer.subscription.resumed": {
        const sub = event.data.object;
        const row = await tenantOf(db, sub.metadata, idOf(sub.customer));
        if (!(await keepEvent(db, event.id, event.type, row?.tenant_id ?? null))) return json(200, { ok: true, duplicate: true });
        if (!row) { L.warn("stripe_event_unrouted", { type: event.type, subscription: sub.id }); return json(200, { ok: true, unrouted: true }); }
        // The event's copy has no expanded card; the row keeps the card from the last full read (sync) when this one has none.
        const full = await s.subscriptions.retrieve(sub.id, { expand: ["default_payment_method"] }).catch(() => sub);
        const r = await applySubscription(db, row, full, event.type);
        return json(200, { ok: true, status: r.status, switched: r.switched });
      }
      case "checkout.session.completed": {
        const session = event.data.object;
        const subId = idOf(session.subscription);
        const row = await tenantOf(db, session.metadata, idOf(session.customer));
        if (!(await keepEvent(db, event.id, event.type, row?.tenant_id ?? null))) return json(200, { ok: true, duplicate: true });
        if (!row || !subId) { L.warn("stripe_checkout_unrouted", { session: session.id }); return json(200, { ok: true, unrouted: true }); }
        const sub = await s.subscriptions.retrieve(subId, { expand: ["default_payment_method"] });
        const r = await applySubscription(db, row, sub, event.type);
        return json(200, { ok: true, status: r.status });
      }
      case "customer.subscription.trial_will_end": {
        const sub = event.data.object;
        const row = await tenantOf(db, sub.metadata, idOf(sub.customer));
        if (!(await keepEvent(db, event.id, event.type, row?.tenant_id ?? null))) return json(200, { ok: true, duplicate: true });
        if (row) await noteTrialEnding(db, row, typeof sub.trial_end === "number" ? new Date(sub.trial_end * 1000).toISOString() : null);
        return json(200, { ok: true });
      }
      case "invoice.payment_failed":
      case "invoice.paid": {
        const inv = event.data.object;
        const row = await tenantOf(db, inv.metadata, idOf(inv.customer));
        if (!(await keepEvent(db, event.id, event.type, row?.tenant_id ?? null))) return json(200, { ok: true, duplicate: true });
        if (row) await notePayment(db, row, event.type === "invoice.paid" ? "paid" : "failed");
        return json(200, { ok: true });
      }
      case "customer.deleted": {
        // The ids the row kept point at nothing now: forgotten, so the portal
        // does not trip on them and Checkout starts a fresh customer.
        const c = event.data.object;
        const row = await tenantOf(db, c.metadata, c.id);
        if (!(await keepEvent(db, event.id, event.type, row?.tenant_id ?? null))) return json(200, { ok: true, duplicate: true });
        if (row) await forgetCustomer(db, row);
        return json(200, { ok: true, forgotten: !!row });
      }
      default:
        // Kept, so a type we do not act on is still on record once.
        await keepEvent(db, event.id, event.type, null);
        return json(200, { ok: true, ignored: event.type });
    }
  } catch (e) {
    L.error("stripe_webhook_failed", { type: event.type, error: e instanceof Error ? e.message : String(e) });
    return json(500, { ok: false, error: "write_failed" });
  }
}

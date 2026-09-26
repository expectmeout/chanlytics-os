/**
 * A partner's ledger, from what Stripe says (decision 0011, P3). The webhook's transport: which invoice a payment,
 * a refund or a dispute is about, read off Stripe's objects, and the one door each writes through. What a share is,
 * what a reversal takes, and when either matures is the database's (00191 partner_earn, partner_reverse), so a
 * delivery replayed writes nothing and two deliveries about one invoice are written one after the other.
 *
 * On a database 00191 has not reached the doors do not exist: the write is skipped and said
 * (`partner_earning_skipped`), never a 500, so the webhook's own work goes on whichever deploys first. A share
 * skipped that way is Stripe's to replay from the dashboard once the migration is in.
 */
import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./packages/db.js";
import { logger } from "./log.js";

type Db = SupabaseClient<Database>;
type Log = ReturnType<typeof logger>;

const idOf = (x: string | { id: string } | null | undefined): string | null =>
  typeof x === "string" ? x : (x?.id ?? null);

/** The error a call to a function or a read of a table the database does not have yet comes back with. */
const notYet = (e: { code?: string | null; message: string }): boolean =>
  e.code === "PGRST202" ||
  e.code === "PGRST205" ||
  e.code === "42883" ||
  e.code === "42P01" ||
  /could not find the (function|table)|does not exist/i.test(e.message);

/** The card a subscription pays with, as Stripe fingerprints it: the same card on two customers has the same one. */
export function cardFingerprintOf(sub: Stripe.Subscription): string | null {
  const pm =
    sub.default_payment_method && typeof sub.default_payment_method === "object" ? sub.default_payment_method : null;
  return pm?.card?.fingerprint ?? null;
}

/** Keep the workspace's card mark (00191 billing_card_marks), for the sweep's one check that needs it. */
export async function markCard(db: Db, tenantId: string, fingerprint: string | null, L: Log): Promise<void> {
  if (!fingerprint) return;
  const { error } = await db.rpc("billing_card_mark", { p_tenant_id: tenantId, p_fingerprint: fingerprint });
  if (!error) return;
  if (notYet(error)) {
    L.warn("partner_card_mark_skipped", { tenant_id: tenantId, error: error.message });
    return;
  }
  throw new Error(`billing_card_mark: ${error.message}`);
}

/** Whether a partner brought this workspace: the question asked before anything costs a call to Stripe. */
export async function isAttributed(db: Db, tenantId: string): Promise<boolean> {
  const { data, error } = await db.from("partner_tenants").select("tenant_id").eq("tenant_id", tenantId).maybeSingle();
  if (error) {
    if (notYet(error)) return false;
    throw new Error(`partner_tenants: ${error.message}`);
  }
  return !!data;
}

/** A plan invoice: one a subscription raised. A one-time payment (a lead pack) earns nothing in this version. */
export function planInvoice(inv: Stripe.Invoice): boolean {
  return inv.parent?.type === "subscription_details" && !!inv.parent.subscription_details?.subscription;
}

/** invoice.paid: a share for the partner who brought the workspace, if one did. */
export async function earnFromInvoice(
  db: Db,
  tenantId: string,
  inv: Stripe.Invoice,
  eventId: string,
  L: Log,
): Promise<{ earned: number } | null> {
  if (!inv.id || !planInvoice(inv) || !(inv.amount_paid > 0)) return null;
  const paidAt = inv.status_transitions?.paid_at ?? inv.created;
  const { data, error } = await db.rpc("partner_earn", {
    p_tenant_id: tenantId,
    p_invoice_id: inv.id,
    p_event_id: eventId,
    p_amount_cents: inv.amount_paid,
    p_currency: inv.currency,
    p_paid_at: new Date(paidAt * 1000).toISOString(),
  });
  if (error) {
    if (notYet(error)) {
      L.warn("partner_earning_skipped", { tenant_id: tenantId, invoice: inv.id, error: error.message });
      return null;
    }
    throw new Error(`partner_earn: ${error.message}`);
  }
  if (!data) return null;
  const earned = Number((data as { earned_cents?: number }).earned_cents ?? 0);
  L.info("partner_earned", { tenant_id: tenantId, invoice: inv.id, earned_cents: earned });
  return { earned };
}

/**
 * The invoice a payment intent paid. This API version links a charge or a dispute to its invoice only through the
 * payment intent (an invoice's payments); a payment that paid no invoice answers null.
 */
export async function invoiceOfPayment(s: Stripe, paymentIntent: string | null): Promise<string | null> {
  if (!paymentIntent) return null;
  const list = await s.invoicePayments.list({
    payment: { type: "payment_intent", payment_intent: paymentIntent },
    limit: 1,
  });
  return idOf(list.data[0]?.invoice as string | { id: string } | undefined);
}

export type ReversalKind = "refund" | "dispute" | "dispute_won";

/** charge.refunded, charge.dispute.created, charge.dispute.closed (won): what it does to the invoice's share. */
export async function reverseForInvoice(
  db: Db,
  invoiceId: string,
  eventId: string,
  kind: ReversalKind,
  amountCents: number,
  L: Log,
): Promise<{ earned: number } | null> {
  const { data, error } = await db.rpc("partner_reverse", {
    p_invoice_id: invoiceId,
    p_event_id: eventId,
    p_kind: kind,
    p_amount_cents: Math.max(0, Math.trunc(amountCents)),
  });
  if (error) {
    if (notYet(error)) {
      L.warn("partner_earning_skipped", { invoice: invoiceId, kind, error: error.message });
      return null;
    }
    throw new Error(`partner_reverse: ${error.message}`);
  }
  if (!data) return null;
  const earned = Number((data as { earned_cents?: number }).earned_cents ?? 0);
  L.info("partner_reversed", { invoice: invoiceId, kind, earned_cents: earned });
  return { earned };
}

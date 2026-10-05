/**
 * What an invoice moved, kept on its event's ledger row (K8, 00300): the amount paid on invoice.paid, the amount due on
 * invoice.payment_failed (what the invoice moved, or tried to), and Stripe's currency, lowercased. The operator's
 * margin, billing mix and failed payments read it from billing_events; the door had said only whether anything was paid
 * (last_paid_at, lib/billing/billing.ts notePayment) and dropped the amount.
 *
 * Best-effort, and the last statement of the invoice's handler (api/stripe-webhook.ts onInvoice), after the payment's mark
 * and the partner's share: a failure to keep it is one warning (`stripe_amount_unkept`) and never an error, a retry or a
 * 500 for Stripe, and never a change to the work the door did before it. It is not in the claim's own insert
 * (billing.ts insertClaim) either: an edge ahead of its migration that named a new column there would fail every Stripe
 * claim until the migration was applied, so the amount is a statement of its own, which an older database refuses
 * without costing the delivery anything else. A replay is answered as a duplicate before this runs, so it never reaches
 * the row again; the database keeps the first answer in any case (billing_event_keep_amount).
 */
import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";
import { keepInvoiceAmount, type Database } from "../packages/db.js";
import { logger, errField } from "../log.js";

type InvoiceEvent = "invoice.paid" | "invoice.payment_failed";
type Moved = Partial<Pick<Stripe.Invoice, "amount_paid" | "amount_due" | "currency">>;

/** What the invoice moved, or tried to: null when Stripe sent no amount, a fraction or a negative, or a currency that is not three letters. */
function invoiceAmountOf(type: InvoiceEvent, inv: Moved): { cents: number; currency: string } | null {
  const cents = type === "invoice.paid" ? inv.amount_paid : inv.amount_due;
  const currency = typeof inv.currency === "string" ? inv.currency.toLowerCase() : "";
  return typeof cents === "number" && Number.isInteger(cents) && cents >= 0 && /^[a-z]{3}$/.test(currency)
    ? { cents, currency }
    : null;
}

/** Kept beside the claim, best-effort: a failure is one warning, never a thrown error and never a retry for Stripe. */
export async function noteInvoiceAmount(
  db: SupabaseClient<Database>,
  eventId: string,
  type: InvoiceEvent,
  inv: Moved,
): Promise<void> {
  try {
    const moved = invoiceAmountOf(type, inv);
    if (moved) await keepInvoiceAmount(db, eventId, moved.cents, moved.currency);
  } catch (e) {
    logger({ hook: "stripe" }).warn("stripe_amount_unkept", { event_id: eventId, error: errField(e) });
  }
}

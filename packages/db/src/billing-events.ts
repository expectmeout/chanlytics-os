/**
 * The Stripe ledger (00073 billing_events): the one row each delivery leaves, by Stripe's event id. The amount's door
 * only; the claim itself is apps/edge/lib/billing/billing.ts's.
 *
 *   keepInvoiceAmount  what an invoice event moved, kept on its own row (00318 billing_event_keep_amount): the amount in
 *                      the smallest unit of the invoice's currency and the currency, once, the first answer standing. A
 *                      real zero is kept. False when the door wrote nothing: a value it cannot validate, an event that
 *                      already has an amount, an id that is no event's. A write that fails throws, with the database's
 *                      words; the Stripe door (apps/edge/lib/billing/invoice-amount.ts) logs it and goes on.
 *
 * The service role's alone: the database's door is granted to it and to no other role, so the client is the service one.
 *
 * Workspace scope: none, by design. The ledger is the platform's: it outlives the workspace it was about (`tenant_id`
 * is set null when the workspace is deleted), so the door is keyed by the event's id and no function here takes a
 * workspace.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

type Db = SupabaseClient<Database>;

export async function keepInvoiceAmount(
  db: Db,
  eventId: string,
  amountCents: number,
  currency: string,
): Promise<boolean> {
  const { data, error } = await db.rpc("billing_event_keep_amount", {
    p_id: eventId,
    p_amount_cents: amountCents,
    p_currency: currency,
  });
  if (error) throw new Error(`billing_event_keep_amount: ${error.message}`);
  return data === true;
}

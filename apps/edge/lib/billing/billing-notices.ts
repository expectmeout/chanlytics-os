/**
 * The billing bells told once (the wiring's second audit, S6-12): a bell kept under the name of what it tells, or thrown,
 * so a Stripe delivery is given back and its retry tells it, and the trial's three days' warning, rung that way. Moved
 * from billing.ts, which applies the readings and rings them through here.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../packages/db.js";
import { emitEvent } from "../packages/db.js";
import { keepOnce } from "../ops/notify.js";

type Db = SupabaseClient<Database>;

/**
 * A billing bell, kept once under `key` with the phones told (notify keepOnce), or thrown: kept beside a fact already
 * written, a bell that could not be written was lost for good, since a later reading finds nothing changed to tell (the
 * wiring's second audit, S6-12). Thrown, a Stripe delivery is given back and tried again (stripe-event.ts), and the
 * retry finds the bell kept or keeps it; an op is refused and its retry plans the same change again.
 */
export async function ringOnce(
  db: Db,
  tenantId: string,
  bell: { title: string; body: string },
  key: string,
): Promise<void> {
  const kept = await keepOnce(
    tenantId,
    { kind: "billing", title: bell.title, body: bell.body, route: "admin/billing", about: null, onceKey: key },
    { push: true },
    db,
  );
  if (!kept) throw new Error(`the billing notice "${bell.title}" could not be kept; it is told on the retry`);
}

/**
 * A trial's three days' warning: its bell kept once under the Stripe event (ringOnce), then its event, so a retry of a
 * delivery whose bell could not be kept writes neither twice.
 */
export async function noteTrialEnding(
  db: Db,
  row: { tenant_id: string },
  trialEnd: string | null,
  eventId: string,
): Promise<void> {
  await ringOnce(
    db,
    row.tenant_id,
    {
      title: "Your trial ends in three days",
      body: `The card on file is charged when the trial ends${trialEnd ? ` on ${new Date(trialEnd).toLocaleDateString("en-US", { month: "short", day: "numeric" })}` : ""}. Cancel from Billing before then if you'd rather not.`,
    },
    `stripe:${eventId}`,
  );
  await emitEvent(db, row.tenant_id, "billing.trial_ending", "subscription", null, { trial_end: trialEnd }).catch(
    () => {},
  );
}

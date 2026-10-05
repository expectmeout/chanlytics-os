/**
 * A delivery's receipts, the statuses Meta posts for the messages we sent, one by one: each is said on the log, each of
 * sent, delivered, read and failed moves its message by the provider's id (recordStatusByExternalId), and what Meta says
 * the message cost to send is kept beside the status, once (K8, keepMessageCost). Moved out of the webhook whole: its
 * order, its log line and its failure rules are the ones it had, and the cost is one more statement after the status in
 * its own guard, so a cost the database refuses never costs a receipt its status. A failed receipt that says the person
 * stopped marketing messages from this business (131050) is their no to offers, recorded as one in a guard of its own
 * too (recordWhatsAppOffersStop): the refusal was stored and nothing learned from it, so the next offer went to them again.
 *
 * Any other receipt that says `failed` is news to the owner (core raiseLateFailure): the message was accepted, and then it
 * did not arrive, so the thread is flagged and the bell rings before the row moves, once per message. A person's no to
 * offers is not: it is their answer, recorded as one, and not a send the owner has to fix (waStoppedMarketing, the one
 * statement of it). A flag the database would not take leaves the row as it was and the receipt unrecorded, which the
 * door answers with a 503 so Meta sends it again.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { waPricingOf, waStoppedMarketing, type WaChangeValue } from "../packages/channels.js";
import {
  keepMessageCost,
  recordStatusByExternalId,
  recordWhatsAppOffersStop,
  type Database,
  type Json,
} from "../packages/db.js";
import { phoneTail } from "../packages/contracts.js";
import { logger, type Logger } from "../log.js";
import { flagLateFailure } from "../receptionist/late-failure.js";
import { pgSafe } from "./persist.js";

type Receipt = NonNullable<WaChangeValue["statuses"]>[number];

/** The receipt's word, when it is one the ledger keeps: a status that is none of these (deleted, played) lands nowhere. */
function receiptStatusOf(s: string | undefined): "sent" | "delivered" | "read" | "failed" | null {
  return s === "sent" || s === "delivered" || s === "read" || s === "failed" ? s : null;
}

/** What Meta sent as `errors`, as the JSON it is: the body was parsed from JSON, so the round trip changes nothing and tells the compiler what the parse knew. */
const asJson = (v: unknown): Json => JSON.parse(JSON.stringify(v)) as Json;

/**
 * What Meta says the message cost, kept beside the status the receipt just moved. The pricing is read here, key by key,
 * and a pricing that is none is said on the log and never sent: the database's answer is only whether a row was written,
 * which cannot tell a pricing it refused from one it already holds, so the refusal is this door's to say. The write is
 * best-effort in a guard of its own: a database that refuses it is `pg_cost_failed`, and the receipt is as it was.
 */
async function keepCost(
  L: Logger,
  db: SupabaseClient<Database>,
  tenantId: string,
  id: string,
  s: Receipt,
): Promise<void> {
  if (s.pricing === undefined || s.pricing === null) return;
  const pricing = waPricingOf(s.pricing);
  if (!pricing) {
    L.warn("wa_pricing_dropped", { id, status: s.status });
    return;
  }
  await pgSafe("cost", () => keepMessageCost(db, tenantId, id, pricing));
}

/** How many receipts the database would not take, which must come again (0 when every one was recorded). */
export async function recordReceipts(
  db: SupabaseClient<Database> | null,
  tenantId: string | null,
  statuses: Receipt[],
): Promise<number> {
  const L = logger();
  let again = 0;
  await Promise.all(
    statuses.map(async (s) => {
      L.info("wa_status", { id: s.id, status: s.status, to_tail: phoneTail(s.recipient_id), errors: s.errors });
      const status = receiptStatusOf(s.status);
      if (!db || !tenantId || !s.id || !status) return;
      const id = s.id;
      const error = s.errors ? asJson({ errors: s.errors }) : undefined;
      // The person stopped marketing messages from this business: their answer (recorded below), never a failed send.
      const stopped = status === "failed" && waStoppedMarketing(s.errors);
      if (status === "failed" && !stopped) {
        // Before the row moves: a flag that could not be written leaves it as it was, so the redelivery flags it.
        const flagged = await pgSafe("escalation", () =>
          flagLateFailure(db, tenantId, {
            externalId: id,
            channel: "whatsapp",
            error: s.errors ? { errors: s.errors } : {},
          }),
        );
        if (flagged === undefined) {
          again += 1;
          return;
        }
      }
      await pgSafe("status", () => recordStatusByExternalId(db, tenantId, id, status, error));
      await keepCost(L, db, tenantId, id, s);
      if (stopped) {
        const recorded = await pgSafe("offers_stop", () => recordWhatsAppOffersStop(db, { tenantId, externalId: id }));
        // A write that threw has said so itself (pg_offers_stop_failed): this line is for an answer the database gave.
        if (recorded !== undefined) L.info("wa_marketing_stopped", { id, recorded });
      }
    }),
  );
  return again;
}

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
import { waPricingOf, waStoppedMarketing, type WaChangeValue } from "@chanlytics/channels/whatsapp";
import { keepMessageCost, recordStatusByExternalId } from "@chanlytics/db/channels";
import { recordWhatsAppOffersStop } from "@chanlytics/db/campaigns";
import type { Database } from "@chanlytics/db/types";
import { phoneTail } from "@chanlytics/contracts";
import { logger, type Logger } from "../shared/log.js";
import { flagLateFailure } from "../shared/late-failure.js";
import { runPgSafe } from "./persist.js";
import { jsonCopyOf } from "@chanlytics/db/shared";
import type { TenantId } from "@chanlytics/contracts";

type Receipt = NonNullable<WaChangeValue["statuses"]>[number];

/** The receipt's word, when it is one the ledger keeps: a status that is none of these (deleted, played) lands nowhere. */
function receiptStatusOf(s: string | undefined): "sent" | "delivered" | "read" | "failed" | null {
  return s === "sent" || s === "delivered" || s === "read" || s === "failed" ? s : null;
}

/** What Meta sent as `errors`, as the JSON it is: the body was parsed from JSON, so the round trip changes nothing and tells the compiler what the parse knew. */

/**
 * What Meta says the message cost, kept beside the status the receipt just moved. The pricing is read here, key by key,
 * and a pricing that is none is said on the log and never sent: the database's answer is only whether a row was written,
 * which cannot tell a pricing it refused from one it already holds, so the refusal is this door's to say. The write is
 * best-effort in a guard of its own: a database that refuses it is `pg_cost_failed`, and the receipt is as it was.
 */
async function keepCost(
  log: Logger,
  db: SupabaseClient<Database>,
  tenantId: TenantId,
  id: string,
  receipt: Receipt,
): Promise<void> {
  if (receipt.pricing === undefined || receipt.pricing === null) return;
  const pricing = waPricingOf(receipt.pricing);
  if (!pricing) {
    log.warn("wa_pricing_dropped", { id, status: receipt.status });
    return;
  }
  await runPgSafe("cost", () => keepMessageCost(db, tenantId, id, pricing));
}

/** How many receipts the database would not take, which must come again (0 when every one was recorded). */
/** One receipt's writes. True when it must be delivered again: a flag that could not be written leaves the row as it was. */
async function recordOneReceipt(
  db: SupabaseClient<Database> | null,
  tenantId: TenantId | null,
  statusEntry: Receipt,
  log: Logger,
): Promise<boolean> {
  log.info("wa_status", {
    id: statusEntry.id,
    status: statusEntry.status,
    to_tail: phoneTail(statusEntry.recipient_id),
    errors: statusEntry.errors,
  });
  const status = receiptStatusOf(statusEntry.status);
  if (!db || !tenantId || !statusEntry.id || !status) return false;
  const id = statusEntry.id;
  const error = statusEntry.errors ? jsonCopyOf({ errors: statusEntry.errors }) : undefined;
  // The person stopped marketing messages from this business: their answer (recorded below), never a failed send.
  const stopped = status === "failed" && waStoppedMarketing(statusEntry.errors);
  if (status === "failed" && !stopped) {
    // Before the row moves: a flag that could not be written leaves it as it was, so the redelivery flags it.
    const flagged = await runPgSafe("escalation", () =>
      flagLateFailure(db, tenantId, {
        externalId: id,
        channel: "whatsapp",
        error: statusEntry.errors ? { errors: statusEntry.errors } : {},
      }),
    );
    if (flagged === undefined) {
      return true;
    }
  }
  await runPgSafe("status", () => recordStatusByExternalId(db, tenantId, id, status, error));
  await keepCost(log, db, tenantId, id, statusEntry);
  if (stopped) {
    const recorded = await runPgSafe("offers_stop", () => recordWhatsAppOffersStop(db, { tenantId, externalId: id }));
    // A write that threw has said so itself (pg_offers_stop_failed): this line is for an answer the database gave.
    if (recorded !== undefined) log.info("wa_marketing_stopped", { id, recorded });
  }
  return false;
}

/** How many of one delivery's receipts are written at a time: a big send can bring hundreds together, each several writes. */
const RECEIPTS_AT_ONCE = 10;

export async function recordReceipts(
  db: SupabaseClient<Database> | null,
  tenantId: TenantId | null,
  statuses: Receipt[],
): Promise<number> {
  const log = logger();
  let again = 0;
  // One receipt per message and status: Meta can repeat one in a single delivery, and the copies, read together, each
  // found the row still sent and each raised the failure.
  const once = [...new Map(statuses.map((s) => [`${s.id}\u0000${s.status}`, s])).values()];
  for (let at = 0; at < once.length; at += RECEIPTS_AT_ONCE) {
    const answers = await Promise.all(
      once.slice(at, at + RECEIPTS_AT_ONCE).map((statusEntry) => recordOneReceipt(db, tenantId, statusEntry, log)),
    );
    again += answers.filter(Boolean).length;
  }
  return again;
}

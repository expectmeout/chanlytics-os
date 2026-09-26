/**
 * What became of an email we sent: one signed receipt, applied.
 *
 * Handled inside the webhook's own request, the way a text's status callback
 * is (api/sms-status.ts): a receipt is small, names its row by the tags the
 * request left with, and every write here is idempotent, so the provider's
 * at-least-once delivery and its lack of any order cost nothing.
 *
 *   every receipt   the row learns the provider's id and the Message-ID the
 *                   email left with (00128), whichever receipt arrives first.
 *   delivered       the row moves forward. messages_guard refuses a move
 *                   backwards or off a terminal state, which is a receipt out
 *                   of order and not an error.
 *   bounced, failed, suppressed
 *                   a reply that never arrived is a customer with no answer, so
 *                   the thread is flagged for a person in words that say what
 *                   to do, and THEN the row fails. A campaign's email (it
 *                   carries its unsubscribe) flags nothing: its row fails, and
 *                   counts toward the domain it left from. In that order: a flag that
 *                   could not be written sends the receipt back with the row
 *                   untouched, and a row that already says failed is a receipt
 *                   seen before, which flags nothing twice.
 *   a permanent bounce, a complaint, the provider's own list
 *                   the ADDRESS stops being sent to (00126), when it is still
 *                   the person's address. A complaint arrives after delivery
 *                   and leaves the row delivered.
 *
 * A receipt whose tags name no row of ours is the platform's own notification
 * email, or a forged tag: acknowledged and dropped. A database that cannot take
 * the write throws, the door answers 503, and the receipt comes again.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  emitEvent,
  recordEmailNo,
  recordEmailStatus,
  sentEmailRequestOf,
  stampEmailComplaint,
  stampEmailSent,
  suppressEmailOf,
  type Database,
  type Json,
} from "../packages/db.js";
import { addressOf, emailReceiptEffect, type EmailReceipt, type EmailReceiptType } from "../packages/channels.js";
import { isCampaignEmail } from "../packages/contracts.js";
import { holdForComplaint } from "./sending-domains.js";
import { logger, errField } from "../log.js";
import { upsertEscalation } from "../packages/jobs.js";

type Db = SupabaseClient<Database>;

export type ReceiptOutcome = "not_a_workspace_email" | "no_such_row" | "applied";

/** Why a reply never arrived, for the person who has to do something about it. Names no address. */
export const EMAIL_FAILED_WORDS: Partial<Record<EmailReceiptType, string>> = {
  bounced:
    "An email reply bounced: their address did not accept it. Check the address on their page, or reach them another way.",
  failed: "An email reply could not be sent by the mail provider. Send it again, or reach them another way.",
  suppressed:
    "An email reply was not sent: the mail provider has stopped sending to this address after an earlier bounce or complaint.",
};

export async function applyEmailReceipt(db: Db, r: EmailReceipt, nowIso: string): Promise<ReceiptOutcome> {
  if (!r.messageId || !r.tenantId) return "not_a_workspace_email";
  const row = { tenantId: r.tenantId, messageId: r.messageId };
  const stands = await stampEmailSent(db, { ...row, providerId: r.providerId, rfcMessageId: r.rfcMessageId });
  if (!stands) return "no_such_row";

  const effect = emailReceiptEffect(r);
  const words = EMAIL_FAILED_WORDS[r.type];
  // A campaign's email that bounced (a broadcast, a reach-out) is the campaign's to count, on its row: it flags no
  // thread, since nobody there wrote and is waiting (Reach out D4). Read only on the way to a flag.
  if (
    effect.status === "failed" &&
    words &&
    stands.status !== "failed" &&
    !isCampaignEmail(await sentEmailRequestOf(db, row))
  ) {
    const flagged = await upsertEscalation(db, r.tenantId, stands.conversationId, "send_failed", words);
    if (flagged === "failed")
      throw new Error(`email receipt: message ${r.messageId} failed and its thread could not be flagged`);
  }
  if (effect.status) await recordEmailStatus(db, { ...row, status: effect.status, error: effect.error as Json | null });
  // A complaint arrives after delivery and moves no status: the row is stamped, so the domain it left from counts it
  // (00176). Before the suppression, so a retry of a half-applied receipt still counts it once.
  if (r.type === "complained") await stampEmailComplaint(db, { ...row, at: nowIso });
  if (effect.suppress) {
    const contactId = await suppressEmailOf(db, { ...row, addresses: r.to, reason: effect.suppress, at: nowIso });
    const stopped = { reason: effect.suppress };
    if (contactId)
      await emitEvent(db, r.tenantId, "contact.email_suppressed", "contact", "contact", contactId, stopped);
  }
  if (r.type === "complained") {
    // A complaint is the person's no, as an unsubscribe is (00177): their address on the never-again list, their
    // leads closed. After the address stops (above), so a no that cannot be recorded -- the receipt then comes again --
    // has already stopped what it could. Then the domain it left from is judged now, not at the next sweep.
    const no = await recordEmailNo(db, { ...row, source: "complaint" });
    const host = addressOf(no.from)?.address.split("@")[1] ?? null;
    if (host) {
      const log = logger({ tenant: r.tenantId });
      await holdForComplaint({ db, log, now: () => Date.parse(nowIso) }, r.tenantId, host).catch((e) =>
        log.error("sending_domain_complaint_hold_failed", { host, error: errField(e) }),
      );
    }
  }
  return "applied";
}

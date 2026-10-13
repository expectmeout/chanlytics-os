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
 *                   counts toward the mailbox it left from. In that order: a flag that
 *                   could not be written sends the receipt back with the row
 *                   untouched, and a row that already says failed is a receipt
 *                   seen before, which flags nothing twice.
 *   a permanent bounce, a complaint, the provider's own list
 *                   the ADDRESS stops being sent to (00126), when it is still
 *                   the person's address. A complaint arrives after delivery
 *                   and leaves the row delivered.
 *   a permanent bounce of a reach-out's email
 *                   the LEAD it was written for is marked, its address
 *                   invalid (Reach out C11): the Leads page says so, and no
 *                   step or run writes to it again.
 *   a complaint or a permanent bounce of an OFFER (an email that left from the
 *                   campaigns domain)
 *                   the workspace's offers by email are judged against their
 *                   gates (offer-gates.ts): over a limit, they are paused.
 *
 * A receipt whose tags name no row of ours is the platform's own notification
 * email, or a forged tag: acknowledged and dropped. A database that cannot take
 * the write throws, the door answers 503, and the receipt comes again.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  emitEvent,
  leadAddressBounced,
  recordEmailNo,
  recordEmailStatus,
  sentEmailOf,
  stampEmailComplaint,
  stampEmailSent,
  suppressEmailOf,
  type Database,
} from "../packages/db.js";
import { emailReceiptEffect, type EmailReceipt, type EmailReceiptType } from "../packages/channels.js";
import { isCampaignEmail } from "../packages/contracts.js";
import { judgeOfferGates } from "./offer-gates.js";
import { upsertEscalation } from "../packages/jobs.js";

type Db = SupabaseClient<Database>;

type ReceiptOutcome = "not_a_workspace_email" | "no_such_row" | "applied";

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
  // What the email was, read once and only when it matters: whether it was a campaign's (a flag is only a reply's),
  // and the lead a reach-out wrote it for (a permanent bounce marks that lead).
  const flagging = effect.status === "failed" && !!words && stands.status !== "failed";
  const sent = flagging || effect.suppress === "hard_bounce" ? await sentEmailOf(db, row) : null;
  // A campaign's email that bounced (a broadcast, a reach-out) is the campaign's to count, on its row: it flags no
  // thread, since nobody there wrote and is waiting (Reach out D4).
  if (flagging && !isCampaignEmail(sent?.request ?? null)) {
    const flagged = await upsertEscalation(db, r.tenantId, stands.conversationId, "send_failed", words);
    if (flagged === "failed")
      throw new Error(`email receipt: message ${r.messageId} failed and its thread could not be flagged`);
  }
  // The domain an email left from, read off its frozen request, for what a complaint or a permanent bounce may trip.
  let leftFrom: string | null = effect.suppress === "hard_bounce" ? requestFromOf(sent?.request) : null;
  if (effect.status) await recordEmailStatus(db, { ...row, status: effect.status, error: effect.error });
  // A complaint arrives after delivery and moves no status: the row is stamped, so the mailbox it left from counts it
  // (00176, 00422). Before the suppression, so a retry of a half-applied receipt still counts it once.
  if (r.type === "complained") await stampEmailComplaint(db, { ...row, at: nowIso });
  if (effect.suppress) {
    const contactId = await suppressEmailOf(db, { ...row, addresses: r.to, reason: effect.suppress, at: nowIso });
    const stopped = { reason: effect.suppress };
    if (contactId) await emitEvent(db, r.tenantId, "contact.email_suppressed", "contact", contactId, stopped);
    // A reach-out's email that bounced for good: its lead's address is invalid, as the finder's own check would say
    // (C11). After the address stops, so a lead that cannot be marked (the receipt comes again) is already not written to.
    if (effect.suppress === "hard_bounce" && sent?.leadId)
      await leadAddressBounced(db, { tenantId: r.tenantId, leadId: sent.leadId, at: nowIso });
  }
  if (r.type === "complained") {
    // A complaint is the person's no, as an unsubscribe is (00177): their address on the never-again list, their
    // leads closed. After the address stops (above), so a no that cannot be recorded -- the receipt then comes again --
    // has already stopped what it could. A mailbox it left from is judged by the mailboxes clock, within the hour.
    const no = await recordEmailNo(db, { ...row, source: "complaint" });
    leftFrom = no.from;
  }
  // Last: the receipt is applied, so a judgement that fails is logged there and never refuses it. Only an offer is judged.
  if (leftFrom) await judgeOfferGates(db, r.tenantId, leftFrom);
  return "applied";
}

/** The From of a frozen request as a row keeps it; null when it keeps none. */
function requestFromOf(request: unknown): string | null {
  const from = (request as { from?: unknown } | null | undefined)?.from;
  return typeof from === "string" ? from : null;
}

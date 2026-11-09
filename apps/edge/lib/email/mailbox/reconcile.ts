/**
 * An email a mailbox may have sent, settled (decision 0056). A send whose provider call timed out after the provider
 * may have taken it is recorded failed with its outcome unknown (core deliver.ts): nobody sends it again blind, and no
 * receipt ever comes from a mailbox to say what became of it. Left alone, the reach-out clock fails its send a day on
 * (clock.ts UNKNOWN_OUTCOME_MS), and the lead's sequence ends, even when the email went and the lead may answer it.
 *
 * So the mailboxes clock looks, for each of a mailbox's unsettled emails between ten minutes and a day old (time for
 * the provider to file it under Sent): by the Message-ID it was sent under (minted from its row, mailbox/mime.ts), then
 * among what the mailbox sent to that address since, by its subject (the provider may have put its own Message-ID in
 * place of ours).
 *
 *   found       the email is sent, stamped with the id, Message-ID and thread it went under, so its replies are read
 *               (packages/db getEmailFoundSent); the clock counts its send sent on its next tick.
 *   not there   it never left: its send is planned again (getEmailNeverLeft, the clock's never_delivered), as a new email.
 *               A draft Graph left of it is deleted first.
 *   unsure      the provider could not be asked: it waits for the next tick, and the clock's day still stands.
 */
import { findGmailSent, deleteGraphMessage, findGraphSent, mailboxMessageId } from "@chanlytics/channels/email";
import { MIN_MS } from "@chanlytics/contracts";
import {
  getEmailFoundSent,
  getEmailNeverLeft,
  listUnknownMailboxEmails,
  type MailboxConnectionRow,
} from "@chanlytics/db/email";
import type { Database } from "@chanlytics/db/types";
import { UNKNOWN_OUTCOME_MS } from "../../shared/unknown-outcome.js";
import { getToken } from "./credentials.js";
import { errField, type Logger } from "../../shared/log.js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { logAndGoOn } from "@chanlytics/log";

type Db = SupabaseClient<Database>;

/** How long an unsettled email waits before it is looked for: its provider files a sent email under Sent by then. */
const LOOK_AFTER_MS = 10 * MIN_MS;

/** What one mailbox's look settled. */
interface Reconciled {
  sent: number;
  never: number;
}

/**
 * Settle the mailbox's unsettled emails, while there is time before `until` (the sweep's line). Never throws: what
 * cannot be settled now waits for the next tick.
 */
export async function reconcileMailbox(
  db: Db,
  row: MailboxConnectionRow,
  log: Logger,
  now = Date.now(),
  until = Number.POSITIVE_INFINITY,
): Promise<Reconciled> {
  const out: Reconciled = { sent: 0, never: 0 };
  try {
    const emails = await listUnknownMailboxEmails(db, row.id, {
      since: new Date(now - UNKNOWN_OUTCOME_MS),
      before: new Date(now - LOOK_AFTER_MS),
    });
    if (emails.length === 0) return out;
    const token = await getToken(db, row, now);
    if (!token.ok) return out;
    for (const email of emails) {
      if (Date.now() >= until) break;
      if (!email.to) continue;
      const want = {
        messageId: mailboxMessageId(email.id, row.host),
        to: email.to,
        subject: email.subject,
        sinceMs: Date.parse(email.writtenAt),
      };
      try {
        const found =
          row.provider === "microsoft"
            ? await findGraphSent(token.token, want)
            : await findGmailSent(token.token, want);
        if (found.found) {
          const moved = await getEmailFoundSent(db, {
            tenantId: email.tenantId,
            id: email.id,
            mailboxId: row.id,
            providerId: found.id,
            rfcMessageId: found.messageId ?? want.messageId,
            threadId: found.threadId,
          });
          if (moved) out.sent += 1;
          continue;
        }
        if (found.draftId)
          await deleteGraphMessage(token.token, found.draftId).catch(logAndGoOn("deleteGraphMessage", null));
        if (
          await getEmailNeverLeft(db, {
            tenantId: email.tenantId,
            id: email.id,
            note: "not in the mailbox's sent mail",
          })
        )
          out.never += 1;
      } catch (err) {
        log.warn("mailbox_sync_failed", {
          mailbox: row.id,
          stage: "reconcile",
          message: email.id,
          error: errField(err),
        });
      }
    }
    if (out.sent || out.never) log.info("mailbox_reconciled", { mailbox: row.id, ...out });
  } catch (err) {
    log.warn("mailbox_sync_failed", { mailbox: row.id, stage: "reconcile", error: errField(err) });
  }
  return out;
}

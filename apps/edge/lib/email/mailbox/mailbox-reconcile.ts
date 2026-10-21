/**
 * An email a mailbox may have sent, settled (decision 0056). A send whose provider call timed out after the provider
 * may have taken it is recorded failed with its outcome unknown (core deliver.ts): nobody sends it again blind, and no
 * receipt ever comes from a mailbox to say what became of it. Left alone, the reach-out clock fails its send a day on
 * (clock.ts UNKNOWN_OUTCOME_MS), and the lead's sequence ends, even when the email went and the lead may answer it.
 *
 * So the mailboxes clock looks, for each of a mailbox's unsettled emails between ten minutes and a day old (time for
 * the provider to file it under Sent): by the Message-ID it was sent under (minted from its row, mailbox-mime.ts), then
 * among what the mailbox sent to that address since, by its subject (the provider may have put its own Message-ID in
 * place of ours).
 *
 *   found       the email is sent, stamped with the id, Message-ID and thread it went under, so its replies are read
 *               (packages/db emailFoundSent); the clock counts its send sent on its next tick.
 *   not there   it never left: its send is planned again (emailNeverLeft, the clock's never_delivered), as a new email.
 *               A draft Graph left of it is deleted first.
 *   unsure      the provider could not be asked: it waits for the next tick, and the clock's day still stands.
 */
import { gmailFindSent, graphDeleteMessage, graphFindSent, mailboxMessageId } from "../../packages/channels.js";
import { MIN_MS } from "../../packages/contracts.js";
import { emailFoundSent, emailNeverLeft, unknownMailboxEmails, type Database, type MailboxConnectionRow } from "../../packages/db.js";
import { UNKNOWN_OUTCOME_MS } from "../../reach-out/clock.js";
import { tokenFor } from "./mailbox-credentials.js";
import { errField, type Logger } from "../../log.js";
import type { SupabaseClient } from "@supabase/supabase-js";

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
    const emails = await unknownMailboxEmails(db, row.id, {
      since: new Date(now - UNKNOWN_OUTCOME_MS),
      before: new Date(now - LOOK_AFTER_MS),
    });
    if (emails.length === 0) return out;
    const t = await tokenFor(db, row, now);
    if (!t.ok) return out;
    for (const e of emails) {
      if (Date.now() >= until) break;
      if (!e.to) continue;
      const want = {
        messageId: mailboxMessageId(e.id, row.host),
        to: e.to,
        subject: e.subject,
        sinceMs: Date.parse(e.writtenAt),
      };
      try {
        const found =
          row.provider === "microsoft" ? await graphFindSent(t.token, want) : await gmailFindSent(t.token, want);
        if (found.found) {
          const moved = await emailFoundSent(db, {
            tenantId: e.tenantId,
            id: e.id,
            mailboxId: row.id,
            providerId: found.id,
            rfcMessageId: found.messageId ?? want.messageId,
            threadId: found.threadId,
          });
          if (moved) out.sent += 1;
          continue;
        }
        if (found.draftId) await graphDeleteMessage(t.token, found.draftId).catch(() => null);
        if (await emailNeverLeft(db, { tenantId: e.tenantId, id: e.id, note: "not in the mailbox's sent mail" }))
          out.never += 1;
      } catch (err) {
        log.warn("mailbox_sync_failed", { mailbox: row.id, stage: "reconcile", message: e.id, error: errField(err) });
      }
    }
    if (out.sent || out.never) log.info("mailbox_reconciled", { mailbox: row.id, ...out });
  } catch (err) {
    log.warn("mailbox_sync_failed", { mailbox: row.id, stage: "reconcile", error: errField(err) });
  }
  return out;
}

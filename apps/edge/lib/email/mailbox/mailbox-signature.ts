/**
 * The signature its owner keeps in Gmail, kept on the mailbox's row (00487, the email canvas's lane B): read when it
 * connects, once a day by the mailboxes sweep (an owner who changes it in Gmail is signed with the new one by the next
 * day), and at once when they choose it again in Settings. Read with the gmail.readonly the grant already holds. A
 * read that fails changes nothing and is said; what the mailbox signs with is contracts' rule (mailboxSignsOf).
 */
import { DAY_MS } from "../../packages/contracts.js";
import { cleanGmailSignature, gmailSignature } from "../../packages/channels.js";
import { patchMailboxConnection, type Database, type MailboxConnectionRow } from "../../packages/db.js";
import { tokenFor } from "./mailbox-credentials.js";
import { errField, type Logger } from "../../log.js";
import type { SupabaseClient } from "@supabase/supabase-js";

type Db = SupabaseClient<Database>;

/** Whether a Google mailbox's Gmail signature is to be read: never yet, or not for a day. */
export function gmailSignatureDue(row: MailboxConnectionRow, now: number): boolean {
  if (row.provider !== "google" || row.state === "removed" || row.state === "reconnect") return false;
  const at = row.gmail_signature_at ? Date.parse(row.gmail_signature_at) : Number.NaN;
  return !Number.isFinite(at) || now - at >= DAY_MS;
}

/** Its Gmail signature read with this token and kept, cleaned (none where Gmail keeps none): the row as it now is. */
export async function keepGmailSignature(
  db: Db,
  row: MailboxConnectionRow,
  token: string,
  log: Logger,
  now: number,
): Promise<MailboxConnectionRow> {
  if (row.provider !== "google") return row;
  const read = await gmailSignature(token, row.address);
  if (!read.ok) {
    log.warn("mailbox_signature_unread", { mailbox: row.id, status: read.reply.status });
    return row;
  }
  const kept = await patchMailboxConnection(db, {
    tenantId: row.tenant_id,
    id: row.id,
    patch: { gmail_signature: cleanGmailSignature(read.html), gmail_signature_at: new Date(now).toISOString() },
  });
  return kept ?? row;
}

/** Its Gmail signature read now, with a token of its own (Settings' choice of it): never throws. */
export async function readGmailSignatureNow(
  db: Db,
  row: MailboxConnectionRow,
  log: Logger,
  now: number,
): Promise<MailboxConnectionRow> {
  if (row.provider !== "google") return row;
  try {
    const t = await tokenFor(db, row, now);
    return t.ok ? await keepGmailSignature(db, row, t.token, log, now) : row;
  } catch (e) {
    log.warn("mailbox_signature_unread", { mailbox: row.id, error: errField(e) });
    return row;
  }
}

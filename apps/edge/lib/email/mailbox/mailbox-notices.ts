/**
 * A connected mailbox's owner, told (decision 0056): once when its provider signed it out, once when its own mail held
 * it. The bell, and email where the workspace has somebody on file; each told once (notify's onceKey), however often a
 * send or a sweep finds it so. Best effort: the row already says it on Connections, and a notice that could not be sent
 * is logged.
 */
import { MAILBOX_PROVIDER_WORDS, mailboxHoldFixWords, mailboxHoldWords } from "../../packages/contracts.js";
import type { MailboxConnectionRow } from "../../packages/db.js";
import { notifyOnce } from "../../ops/notify.js";
import { loadTenantNotifications } from "../../tenant-runtime.js";
import { errField, type Logger } from "../../log.js";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../packages/db.js";

type Db = SupabaseClient<Database>;
type Row = Pick<MailboxConnectionRow, "id" | "tenant_id" | "address" | "provider">;

const providerWords = (r: Row) => MAILBOX_PROVIDER_WORDS[r.provider === "microsoft" ? "microsoft" : "google"];

/** Signed out: reconnect it. Told once per sign-out (the day it was found so). */
export async function tellSignedOut(db: Db, row: Row, log: Logger, at = new Date()): Promise<void> {
  try {
    const addressing = await loadTenantNotifications(db, row.tenant_id);
    await notifyOnce(
      { tenantId: row.tenant_id, ...addressing },
      {
        kind: "sweep",
        route: "admin/integrations",
        about: { type: "mailbox_connection", id: row.id },
        subject: `${row.address} needs reconnecting`,
        body:
          `${providerWords(row)} signed ${row.address} out, so nothing leaves from it and its replies aren't read. ` +
          `Its emails wait for it.\n\nConnect it again on Connections, under Email.`,
        redactedBody: "A workspace's connected mailbox was signed out.",
        onceKey: `mailbox_signed_out:${row.id}:${at.toISOString().slice(0, 10)}`,
      },
    );
  } catch (e) {
    log.error("mailbox_tell_failed", { mailbox: row.id, error: errField(e) });
  }
}

/** Held for its own mail: what happened, and what to do before resuming it. Told once per hold. */
export async function tellHeld(db: Db, row: Row, why: string, heldAt: string, log: Logger): Promise<void> {
  const because = mailboxHoldWords(why);
  const fix = mailboxHoldFixWords(why);
  try {
    const addressing = await loadTenantNotifications(db, row.tenant_id);
    await notifyOnce(
      { tenantId: row.tenant_id, ...addressing },
      {
        kind: "sweep",
        route: "admin/integrations",
        about: { type: "mailbox_connection", id: row.id },
        subject: `${row.address} is held: ${because}`,
        body:
          `Nothing leaves from ${row.address} until you resume it, because ${because}.${fix ? ` ${fix}` : ""}\n\n` +
          `Connections has the details, under Email.`,
        redactedBody: "A workspace's connected mailbox was held.",
        onceKey: `mailbox_held:${row.id}:${heldAt}`,
      },
    );
  } catch (e) {
    log.error("mailbox_tell_failed", { mailbox: row.id, error: errField(e) });
  }
}

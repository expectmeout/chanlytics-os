/**
 * A connected mailbox's owner, told (decision 0056): once when its provider signed it out, once when its own mail held
 * it. The bell, and email where the workspace has somebody on file; each told once (notify's onceKey), however often a
 * send or a sweep finds it so. Best effort: the row already says it on Connections, and a notice that could not be sent
 * is logged.
 */
import { MAILBOX_PROVIDER_WORDS, mailboxHoldFixWords, mailboxHoldWords } from "@chanlytics/contracts";
import type { MailboxConnectionRow } from "@chanlytics/db/email";
import { notifyOnce } from "../../shared/alerts/notify.js";
import { loadTenantNotifications } from "../../shared/tenant-runtime.js";
import { errField, type Logger } from "../../shared/log.js";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@chanlytics/db/types";

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

/**
 * Not read for a while (mailbox/gap.ts): what happened, what was brought in by itself, and the one thing left to its
 * owner. Told once per gap (the day it was read back), and only where something was left unread.
 */
export async function tellGap(
  db: Db,
  row: Row,
  gap: { from: string; to: string; clipped: boolean },
  log: Logger,
): Promise<void> {
  // A day as the notice says it, "Nov 1": the day the moment falls on in UTC, which a span of days needs no finer.
  const day = (iso: string): string =>
    new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  const [from, to] = [day(gap.from), day(gap.to)];
  try {
    const addressing = await loadTenantNotifications(db, row.tenant_id);
    await notifyOnce(
      { tenantId: row.tenant_id, ...addressing },
      {
        kind: "sweep",
        route: "admin/integrations",
        about: { type: "mailbox_connection", id: row.id },
        subject: `${row.address} was not read for a while`,
        body:
          `Chanlytics could not read ${row.address} from ${from} to ${to}. It is read again now, and the replies to ` +
          `emails Chanlytics sent from it in those days are in.\n\nOther email that arrived then was not brought in: ` +
          `look in ${row.address} itself for anything from those days that still needs an answer.` +
          (gap.clipped ? ` Nothing from before ${from} was looked for.` : ""),
        redactedBody: "A workspace's connected mailbox was not read for a while.",
        onceKey: `mailbox_gap:${row.id}:${gap.to.slice(0, 10)}`,
      },
      { db },
    );
  } catch (e) {
    log.error("mailbox_tell_failed", { mailbox: row.id, error: errField(e) });
  }
}

/** Held for its own mail: what happened, and what to do before resuming it. Told once per hold. */
export async function tellHeld(db: Db, row: Row, reason: string, heldAt: string, log: Logger): Promise<void> {
  const because = mailboxHoldWords(reason);
  const fix = mailboxHoldFixWords(reason);
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

/**
 * An ad that can't run, mailed (decision 0050, call 15; Ruben, 20 November 2026). Of the bell's five notices for an
 * owner's ads, the two that stop an ad until the owner fixes something in Meta (`ad_refused`, `ad_unpaid`) are mailed
 * as well; the three that are news stay on the bell. The database rings them in the read's own transaction and marks
 * each row's mail owed (migration 00664), so a mail is never lost between the ring and the send. After each good
 * read the account's job sends what is owed here, through the one mail every notice takes (notify.ts sendOpsMail, to
 * the addresses Settings › Notifications names), and says it went (recordMailSent).
 *
 *  - One mail a cause. A cause is one row for each owner who hears it, so the rows of one (kind, ad) go in one mail and
 *    are all marked. A row whose mail went is owed nothing, so nothing is mailed again while it is open; a cause that
 *    clears and comes back rings a new row, which is new news.
 *  - A row whose cause cleared before its mail went (closed) is owed nothing, and is not mailed.
 *  - At most one mail a read. Where one read rang several causes, one mail names each, so a business is mailed at most
 *    once an hour however many ads Meta turned down at once: the mail account's daily limit is the platform's, shared
 *    by every business.
 *  - A business that turned the topic's mail off, or has no address to mail, is owed nothing: the bell is the notice.
 *  - A mail that fails, or a read with too little time left to send one, leaves the mail owed: the next read sends it.
 *
 * Nothing here fails a read: what goes wrong is logged, and the mail stays owed.
 */
import { ADS_ROUTE, DAY_MS, emailsFor, type TenantId } from "@chanlytics/contracts";
import { listMailOwed, recordMailSent, type MailOwed } from "@chanlytics/db/notices";
import type { Database } from "@chanlytics/db/types";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  NOTIFY_TIMEOUT_MS,
  reachesTenant,
  sendOpsMail,
  type NotifyPorts,
  type NotifyTarget,
} from "../shared/alerts/notify.js";
import { errField, logger } from "../shared/log.js";
import { loadTenantNotifications } from "../shared/tenant-runtime.js";

type Db = SupabaseClient<Database>;

/** The bell's ad notices that are mailed: the two that stop an ad until its owner fixes something in Meta. */
const MAILED_KINDS = ["ad_refused", "ad_unpaid"] as const;
/** How far back an owed mail is looked for: the bell's own window for an ad's rows (00658). */
const OWED_DAYS = 30;
/** The most owed rows one read looks at: a few causes, each a row for each owner. */
const OWED_READ = 50;

/** What one read's mail says. */
interface AdMail {
  kind: string;
  subject: string;
  body: string;
  route: string | null;
}

/** The rows of each cause, oldest first: one row for each owner who hears it, kept under one (kind, ad). */
function causesOf(rows: readonly MailOwed[]): MailOwed[][] {
  const causes = new Map<string, MailOwed[]>();
  for (const row of rows) {
    const key = `${row.kind}:${row.subjectId ?? row.id}`;
    causes.set(key, [...(causes.get(key) ?? []), row]);
  }
  return [...causes.values()];
}

/**
 * The one mail for what a read rang: the notice itself where it is one cause, its words as the bell says them; else
 * one mail that names each, opening the Ads page.
 */
function adMailOf(causes: readonly [MailOwed, ...MailOwed[]]): AdMail {
  const [first] = causes;
  if (causes.length === 1) return { kind: first.kind, subject: first.title, body: first.body, route: first.route };
  return {
    kind: first.kind,
    subject: "Your ads need you in Meta",
    body: causes.map((cause) => `${cause.title}. ${cause.body}`).join("\n\n"),
    // Several ads: the Ads page, where each is.
    route: ADS_ROUTE,
  };
}

/** Each row's mail is owed no more. Written one at a time: a few rows, and the first that fails stops the rest. */
async function owedNoMore(db: Db, tenantId: TenantId, rows: readonly MailOwed[]): Promise<void> {
  for (const row of rows) await recordMailSent(db, { tenantId, id: row.id });
}

/** Whether this business is mailed this kind: it has not turned the topic off, and has an address of its own. */
const mailsTo = (target: NotifyTarget, kind: string): boolean =>
  emailsFor(target.notifications, kind) && reachesTenant(target);

/**
 * Mail what is owed of an account's ad notices, after its read (see the head). How many causes were mailed; null where
 * nothing could be read or sent this time, and the mail is still owed.
 */
async function mailOwed(
  db: Db,
  tenantId: TenantId,
  ports: Pick<NotifyPorts, "send" | "sendMail">,
): Promise<number | null> {
  const since = new Date(Date.now() - OWED_DAYS * DAY_MS).toISOString();
  const rows = await listMailOwed(db, { tenantId, kinds: MAILED_KINDS, since, limit: OWED_READ });
  // A cause that cleared before its mail went is owed nothing: its row is closed, and no mail tells of it.
  await owedNoMore(
    db,
    tenantId,
    rows.filter((row) => row.closed),
  );
  const causes = causesOf(rows.filter((row) => !row.closed));
  const [first, ...rest] = causes.flatMap((rowsOfCause) => rowsOfCause.slice(0, 1));
  if (!first) return 0;
  const addressing = await loadTenantNotifications(db, tenantId);
  // Who it would go to is not known: not "nobody", so nothing is let go, and the next read asks again.
  if (addressing.unread) return null;
  const target: NotifyTarget = { tenantId, ...addressing };
  const mail = adMailOf([first, ...rest]);
  const mailed = mailsTo(target, mail.kind);
  if (mailed && !(await sendOpsMail(target, { ...mail, openIt: true }, { ...ports, db }))) return null;
  await owedNoMore(db, tenantId, causes.flat());
  return mailed ? causes.length : 0;
}

/**
 * After a good read of an account: mail what is owed of its ad notices, where the read's time leaves room for one mail.
 * How many causes were mailed, for the read's line; null where the mail is still owed. Never throws.
 */
export async function mailAdNotices(
  db: Db,
  tenantId: TenantId,
  timing: { deadline: number; ports: Pick<NotifyPorts, "send" | "sendMail"> },
): Promise<number | null> {
  if (Date.now() + NOTIFY_TIMEOUT_MS > timing.deadline) return null;
  try {
    return await mailOwed(db, tenantId, timing.ports);
  } catch (e) {
    // What could not be read or marked stays owed: the next read sends it, and the bell has the row meanwhile.
    logger({ tenant_id: tenantId }).error("notification_record_failed", { kind: "ad_mail", error: errField(e) });
    return null;
  }
}

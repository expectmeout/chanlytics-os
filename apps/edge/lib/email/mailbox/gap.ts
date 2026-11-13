/**
 * What a Gmail mailbox received while its cursor was lost (13 November 2026). Gmail keeps a history cursor about a week:
 * a mailbox signed out for longer, then connected again, has a cursor Gmail answers 404 to. The sync started again from
 * now, and what arrived in between was never read: a lead's reply was not in the Inbox, nobody was told, and the
 * sequence went on writing to someone who had answered.
 *
 * So the gap is listed, ids with their threads alone (channels listGmailSince: what the mailbox received, never its own
 * sending or its drafts, never spam or the bin), from an hour before the last sync, thirty days back at most, to now.
 * The sync hands the list through the road every arrival takes (mailbox/sync.ts), by one of two rules:
 *
 *   whole     a list that is complete and short (GAP_WHOLE_MAX) is read whole, as the history would have handed it.
 *   its own   a longer one is read only where it sits in a thread an email of ours started: a reply, which stops its
 *             sequence. The rest stays in the mailbox, and its owner is told so (mailbox/notices.ts tellGap).
 *
 * Nothing is kept of where a read-back stands, and none is needed: the list is asked again while the cursor is lost,
 * what the intake already holds is left out (db getHeldEmails), and the cursor moves to Gmail's newest only once a
 * sync has been through all of it. The cursor stays a history id, so a build from before this reads it as it always did.
 *
 * Not read back: what the owner sent from Gmail meanwhile (kept in a person's thread when it arrives live), and a reply
 * Gmail took for spam. Microsoft's mailboxes start again from the last sync, a day back at most, as they did.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { listGmailSince, type ListedMail } from "@chanlytics/channels/email";
import { DAY_MS, HOUR_MS, type TenantId } from "@chanlytics/contracts";
import { getHeldEmails, type MailboxConnectionRow } from "@chanlytics/db/email";
import type { Database } from "@chanlytics/db/types";
import type { Logger } from "../../shared/log.js";
import { tellGap } from "./notices.js";

type Db = SupabaseClient<Database>;

/** How far back a read-back reaches: thirty days. A gap older than that is said to its owner. */
const GAP_BACK_MS = 30 * DAY_MS;
/** How far before the last sync it starts: a sync that could not ask still stamped its moment (db endMailboxSync). */
const GAP_OVERLAP_MS = HOUR_MS;
/** Pages of the list read in one sync (two hundred ids each, ids alone): past it, the list is said to be unfinished. */
const GAP_PAGES_MAX = 10;
/** The most a gap may list and still be read whole: more is a sync's worth of reads many times over. */
const GAP_WHOLE_MAX = 40;

/** A gap as it was listed: its span, how many it listed, and what the sync does with them. */
export interface MailGap {
  from: string;
  to: string;
  listed: number;
  /** Every message listed is read; false, only what sits in a thread of ours. */
  whole: boolean;
  /** The list reached its end; false, its pages ran past GAP_PAGES_MAX. */
  complete: boolean;
  /** The last sync is older than the read-back reaches: what came before `from` was not looked for. */
  clipped: boolean;
}

/**
 * The gap, listed: what the mailbox received from the last sync to `now`. `late` when the sync's line came before the
 * list ended (asked again next sync, the cursor where it was); not ok when Gmail could not be asked.
 */
export async function listGap(
  token: string,
  row: Pick<MailboxConnectionRow, "synced_at" | "connected_at">,
  now: number,
  until: number,
): Promise<{ ok: true; mail: ListedMail[]; gap: MailGap } | { ok: true; late: true } | { ok: false; status: number }> {
  const synced = Date.parse(row.synced_at ?? row.connected_at);
  const last = Number.isFinite(synced) ? Math.min(synced, now) : now;
  const reach = now - GAP_BACK_MS;
  const from = new Date(Math.max(last - GAP_OVERLAP_MS, reach)).toISOString();
  const to = new Date(now).toISOString();
  const mail: ListedMail[] = [];
  let page: string | null = null;
  let complete = false;
  for (let index = 0; index < GAP_PAGES_MAX; index++) {
    if (Date.now() >= until) return { ok: true, late: true };
    const listed = await listGmailSince(token, { from, to, only: "received" }, page);
    if (!listed.ok) return { ok: false, status: listed.reply.status };
    mail.push(...listed.listed);
    page = listed.next;
    if (!page) {
      complete = true;
      break;
    }
  }
  const whole = complete && mail.length <= GAP_WHOLE_MAX;
  return {
    ok: true,
    mail,
    gap: { from, to, listed: mail.length, whole, complete, clipped: last - GAP_OVERLAP_MS < reach },
  };
}

/** An arrival as the gap's rules read it: its id, its thread, and whether the read-back listed it. */
interface GapArrival {
  id: string;
  threadId: string | null;
  gap?: boolean;
}

/**
 * Which of a lost cursor's gap is read: all of it where the gap is read whole, else what sits in a thread of ours;
 * never what the intake already keeps, so a read-back a sync's line cut short goes on from there. Every arrival of a
 * sync with no gap is wanted.
 */
export async function filterGapMail(
  db: Db,
  tenantId: TenantId,
  gap: MailGap | undefined,
  arrived: GapArrival[],
  ours: Set<string>,
): Promise<(a: GapArrival) => boolean> {
  if (!gap) return () => true;
  const held = await getHeldEmails(
    db,
    tenantId,
    arrived.filter((a) => a.gap).map((a) => a.id),
  );
  return (a) => !a.gap || (!held.has(a.id) && (gap.whole || (!!a.threadId && ours.has(a.threadId))));
}

/** Whether a sync leaves its cursor lost: it never got past it, or its gap is not read through yet. */
export const stillLost = (changes: { lost?: boolean; gap?: MailGap }, behind: boolean): boolean =>
  changes.lost === true || (changes.gap !== undefined && behind);

/**
 * A gap read through, said: to the mailbox's owner where something was left unread (the rest of a gap too long to read
 * whole, a list that did not reach its end, or what came before the read-back reaches), and in the sync's own line,
 * which this answers the field of (`gap`, with whether something was left unread). Nothing for a sync with no gap, or
 * one still behind: it is said once it has been read through.
 */
export async function closeGap(
  db: Db,
  row: Pick<MailboxConnectionRow, "id" | "tenant_id" | "address" | "provider">,
  gap: MailGap | undefined,
  behind: boolean,
  log: Logger,
): Promise<{ gap?: MailGap & { unread: boolean } }> {
  if (!gap || behind) return {};
  const unread = !gap.whole || gap.clipped;
  if (unread) await tellGap(db, row, gap, log);
  return { gap: { ...gap, unread } };
}

/**
 * A connected mailbox's watch (decision 0056): how its provider tells the edge it changed, made at connect and kept
 * while it lives. Gmail's users.watch lapses after seven days and is renewed a day before; it starts the history
 * cursor the sync reads from. Graph's subscription lapses after six days here (GRAPH_SUBSCRIPTION_MS) and is renewed a
 * day before, or made again when Graph no longer has it. A deployment with no push for a provider keeps no watch, and
 * the five-minute sweep reads the mailbox all the same; a watch that could not be made is tried again next sweep.
 */
import {
  readGmailProfile,
  stopGmailWatch,
  watchGmail,
  readGraphDelta,
  renewGraph,
  subscribeGraph,
  unsubscribeGraph,
} from "@chanlytics/channels/email";
import { HOUR_MS } from "@chanlytics/contracts";
import { keepMailboxWatch, type MailboxConnectionRow } from "@chanlytics/db/email";
import { type Database } from "@chanlytics/db/types";
import { gmailPush, graphPush } from "./config.js";
import type { Logger } from "../../shared/log.js";
import type { SupabaseClient } from "@supabase/supabase-js";

type Db = SupabaseClient<Database>;

/** A watch is renewed this long before it lapses. */
const RENEW_BEFORE_MS = 24 * HOUR_MS;

/** Whether the mailbox's watch is due: none kept, or lapsing within a day. */
export function watchDue(row: Pick<MailboxConnectionRow, "watch_expires_at">, now: number): boolean {
  return !row.watch_expires_at || Date.parse(row.watch_expires_at) - RENEW_BEFORE_MS <= now;
}

/**
 * Make or renew the mailbox's watch, and start its cursor where it has none: Gmail's history id (the watch's own, or
 * the profile's when there is no push), Graph's delta link from now. True when its watch and cursor stand. No provider
 * read starts after `until` (the caller's line): the watch is then still due, and kept next tick.
 */
export async function keepWatch(
  db: Db,
  row: MailboxConnectionRow,
  token: string,
  log: Logger,
  now = Date.now(),
  until = Number.POSITIVE_INFINITY,
): Promise<boolean> {
  const late = () => Date.now() >= until;
  if (row.provider === "google") {
    const push = gmailPush();
    if (push) {
      if (late()) return false;
      const otherGmailWatch = await watchGmail(token, push.topic);
      if (!otherGmailWatch.ok) {
        log.warn("mailbox_watch_failed", { mailbox: row.id, provider: "google", status: otherGmailWatch.reply.status });
        return false;
      }
      // The cursor the watch hands back starts the history read only where there was none: a renewal keeps reading on.
      await keepMailboxWatch(db, {
        id: row.id,
        watchId: null,
        expiresAt: new Date(otherGmailWatch.expiresAt),
        cursor: row.sync_cursor ? null : otherGmailWatch.historyId,
      });
      return true;
    }
    if (row.sync_cursor) return true;
    if (late()) return false;
    const otherGmailProfile = await readGmailProfile(token);
    const historyId = (otherGmailProfile.json as { historyId?: unknown } | null)?.historyId;
    if (otherGmailProfile.outcome !== "ok" || typeof historyId !== "string") return false;
    // No push: a cursor alone, and a watch date a week on so it is not asked again every tick.
    await keepMailboxWatch(db, {
      id: row.id,
      watchId: null,
      expiresAt: new Date(now + 7 * 24 * HOUR_MS),
      cursor: historyId,
    });
    return true;
  }
  // Graph: the delta link from now, where there is none (a delta filtered to what arrives from now, so the messages
  // already in the inbox are never enumerated: the link after its pages is the cursor).
  if (!row.sync_cursor) {
    let link: string | null = null;
    for (let page = 0; page < 20; page++) {
      if (late()) return false;
      const otherGraphDelta = await readGraphDelta(token, link, undefined, new Date(now).toISOString());
      if (!otherGraphDelta.ok) return false;
      if (otherGraphDelta.deltaLink) {
        await keepMailboxWatch(db, {
          id: row.id,
          watchId: row.watch_id,
          expiresAt: row.watch_expires_at ? new Date(row.watch_expires_at) : new Date(now),
          cursor: otherGraphDelta.deltaLink,
        });
        break;
      }
      link = otherGraphDelta.nextLink;
      if (!link) return false;
    }
  }
  const push = graphPush();
  if (!push) {
    await keepMailboxWatch(db, { id: row.id, watchId: null, expiresAt: new Date(now + 7 * 24 * HOUR_MS) });
    return true;
  }
  if (late()) return false;
  if (row.watch_id) {
    const otherGraphRenew = await renewGraph(token, row.watch_id, now);
    if (otherGraphRenew.ok) {
      await keepMailboxWatch(db, { id: row.id, watchId: row.watch_id, expiresAt: new Date(otherGraphRenew.expiresAt) });
      return true;
    }
    if (!otherGraphRenew.gone) {
      log.warn("mailbox_watch_failed", {
        mailbox: row.id,
        provider: "microsoft",
        status: otherGraphRenew.reply.status,
      });
      return false;
    }
  }
  if (late()) return false;
  const result = await subscribeGraph(token, push.url, push.clientState, now);
  if (!result.ok) {
    log.warn("mailbox_watch_failed", { mailbox: row.id, provider: "microsoft", status: result.reply.status });
    return false;
  }
  await keepMailboxWatch(db, { id: row.id, watchId: result.id, expiresAt: new Date(result.expiresAt) });
  return true;
}

/** The watch ended, when the mailbox is removed: best effort, since the grant goes with it. */
export async function endWatch(row: MailboxConnectionRow, token: string): Promise<void> {
  if (row.provider === "google") await stopGmailWatch(token).catch(() => null);
  else if (row.watch_id) await unsubscribeGraph(token, row.watch_id).catch(() => null);
}

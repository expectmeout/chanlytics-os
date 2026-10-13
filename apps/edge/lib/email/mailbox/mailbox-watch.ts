/**
 * A connected mailbox's watch (decision 0056): how its provider tells the edge it changed, made at connect and kept
 * while it lives. Gmail's users.watch lapses after seven days and is renewed a day before; it starts the history
 * cursor the sync reads from. Graph's subscription lapses after six days here (GRAPH_SUBSCRIPTION_MS) and is renewed a
 * day before, or made again when Graph no longer has it. A deployment with no push for a provider keeps no watch, and
 * the five-minute sweep reads the mailbox all the same; a watch that could not be made is tried again next sweep.
 */
import {
  gmailProfile,
  gmailStop,
  gmailWatch,
  graphDelta,
  graphRenew,
  graphSubscribe,
  graphUnsubscribe,
} from "../../packages/channels.js";
import { HOUR_MS } from "../../packages/contracts.js";
import { keepMailboxWatch, type Database, type MailboxConnectionRow } from "../../packages/db.js";
import { gmailPush, graphPush } from "./mailbox-config.js";
import type { Logger } from "../../log.js";
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
      const w = await gmailWatch(token, push.topic);
      if (!w.ok) {
        log.warn("mailbox_watch_failed", { mailbox: row.id, provider: "google", status: w.reply.status });
        return false;
      }
      // The cursor the watch hands back starts the history read only where there was none: a renewal keeps reading on.
      await keepMailboxWatch(db, {
        id: row.id,
        watchId: null,
        expiresAt: new Date(w.expiresAt),
        cursor: row.sync_cursor ? null : w.historyId,
      });
      return true;
    }
    if (row.sync_cursor) return true;
    if (late()) return false;
    const p = await gmailProfile(token);
    const historyId = (p.json as { historyId?: unknown } | null)?.historyId;
    if (p.outcome !== "ok" || typeof historyId !== "string") return false;
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
      const d = await graphDelta(token, link, undefined, new Date(now).toISOString());
      if (!d.ok) return false;
      if (d.deltaLink) {
        await keepMailboxWatch(db, {
          id: row.id,
          watchId: row.watch_id,
          expiresAt: row.watch_expires_at ? new Date(row.watch_expires_at) : new Date(now),
          cursor: d.deltaLink,
        });
        break;
      }
      link = d.nextLink;
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
    const r = await graphRenew(token, row.watch_id, now);
    if (r.ok) {
      await keepMailboxWatch(db, { id: row.id, watchId: row.watch_id, expiresAt: new Date(r.expiresAt) });
      return true;
    }
    if (!r.gone) {
      log.warn("mailbox_watch_failed", { mailbox: row.id, provider: "microsoft", status: r.reply.status });
      return false;
    }
  }
  if (late()) return false;
  const s = await graphSubscribe(token, push.url, push.clientState, now);
  if (!s.ok) {
    log.warn("mailbox_watch_failed", { mailbox: row.id, provider: "microsoft", status: s.reply.status });
    return false;
  }
  await keepMailboxWatch(db, { id: row.id, watchId: s.id, expiresAt: new Date(s.expiresAt) });
  return true;
}

/** The watch ended, when the mailbox is removed: best effort, since the grant goes with it. */
export async function endWatch(row: MailboxConnectionRow, token: string): Promise<void> {
  if (row.provider === "google") await gmailStop(token).catch(() => null);
  else if (row.watch_id) await graphUnsubscribe(token, row.watch_id).catch(() => null);
}

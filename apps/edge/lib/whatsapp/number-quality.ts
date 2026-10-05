/**
 * The reading behind the channel-quality sweep (the Reports lenses spec, K9): each connected WhatsApp number's quality
 * rating, asked of Meta with the token its own workspace already holds, and kept through the database's door
 * (channel_keep_quality, 00315), which says when the word changed.
 *
 * What is asked, and when. The numbers come from whatsappNumbersToRead, never read first and then the longest unread,
 * and a number is asked only when it was never read or was last read READ_EVERY_MS ago, so a tick that is late, or
 * that ran long, never reads a number twice in a day. A stamp that is no time counts as never read, so the number is
 * asked and its read writes a stamp that is one. The tick's own clock is the door's: no read starts after `yieldAtMs`
 * from `started`, and what is left is first in line next tick.
 *
 * Meta's rate. A number is asked once in five hours with its own workspace's token, so no workspace sees more than a
 * read a number in that time, and at most AT_ONCE reads are in the air together (the reach-out check's own four), each
 * bound by the Graph timeout. No other sweep reads Meta across workspaces, so the nearest pacing to copy is the
 * reach-out check's batches of four; the domains sweep's floor between batches answers Resend's rate per account, and
 * here each read carries its own workspace's token.
 *
 * What is kept. Only one of Meta's five words (mapNumberQuality), in capitals. Whatever else comes back, an error, a
 * word that is not one of them, no word, no credentials, a credential read that failed, a database that refuses,
 * leaves the channel exactly as it was, is counted, and costs no other number its read. Nothing here ever throws for
 * one number's sake; what throws is the read of the channels themselves, which the door answers as the one 503.
 *
 * The log carries the workspace and the channel by id, and Meta's answer by its status and code: never a token, never a
 * number (Meta's own words often name the number asked about, so they are not logged either).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { keepChannelQuality, whatsappNumbersToRead, type Database, type WhatsappNumber } from "../packages/db.js";
import { HOUR_MS } from "../packages/contracts.js";
import { errField, type Logger } from "../log.js";
import { waCredentialsForTenant } from "../tenant-runtime.js";
import { phoneNumber } from "./meta-graph.js";
import { mapNumberQuality } from "./meta-templates.js";

/** How long a read holds: a number is asked again no sooner. */
const READ_EVERY_MS = 5 * HOUR_MS;
/** The most numbers a tick lists; its time budget is what bounds the work, and the longest unread are first. */
const MAX_DUE = 500;
/** How many numbers are asked together. */
const AT_ONCE = 4;

/** What a tick did: every due number is in exactly one of read (first, changed, same), gone, no_token, unreadable, not_a_rating and left. */
interface QualityTick {
  due: number;
  read: number;
  first: number;
  changed: number;
  same: number;
  gone: number;
  no_token: number;
  unreadable: number;
  not_a_rating: number;
  left: number;
}

interface QualityPorts {
  db: SupabaseClient<Database>;
  log: Logger;
  now: () => number;
  /** When the tick began, and how long into it a read may still be started: the door's YIELD_AT_MS. */
  started: number;
  yieldAtMs: number;
  /** Meta's read of one number, and a workspace's token: the real ones unless a test hands others. */
  read?: (token: string, phoneNumberId: string) => ReturnType<typeof phoneNumber>;
  credentialsOf?: typeof waCredentialsForTenant;
}

/** What one number came to: the door's own answer when its word was kept, else the way the read came to nothing. */
type Outcome = "first" | "changed" | "same" | "gone" | "no_token" | "unreadable" | "not_a_rating";

/** Whether a number is asked at `now`: never read (a stamp that is no time too), or read at least READ_EVERY_MS ago. */
function isDue(n: WhatsappNumber, now: number): boolean {
  if (n.read_at === null) return true;
  const readAt = Date.parse(n.read_at);
  return Number.isNaN(readAt) || now - readAt >= READ_EVERY_MS;
}

/** One number: its workspace's token, Meta's word, the door. Every failure is an outcome and a line, never a throw. */
async function readOne(p: QualityPorts, n: WhatsappNumber): Promise<Outcome> {
  const read = p.read ?? phoneNumber;
  const credentialsOf = p.credentialsOf ?? waCredentialsForTenant;
  try {
    const held = await credentialsOf(p.db, n.tenant_id);
    if (held.outcome === "absent") return "no_token";
    if (held.outcome === "unavailable") return "unreadable";
    const got = await read(held.credentials.accessToken, n.phone_number_id);
    if (!got.ok) {
      p.log.warn("channel_quality_read_failed", {
        tenant_id: n.tenant_id,
        channel_id: n.channel_id,
        status: got.status,
        code: got.code,
      });
      return "unreadable";
    }
    const word = mapNumberQuality(got.data.quality_rating);
    if (word === null) return "not_a_rating";
    return await keepChannelQuality(p.db, n.tenant_id, n.channel_id, word);
  } catch (e) {
    p.log.error("channel_quality_row_failed", {
      tenant_id: n.tenant_id,
      channel_id: n.channel_id,
      error: errField(e),
    });
    return "unreadable";
  }
}

/**
 * One tick of the sweep: the due numbers read AT_ONCE at a time until the tick is out of time. Throws only when the
 * channels cannot be read.
 */
export async function readNumberQualities(p: QualityPorts): Promise<QualityTick> {
  const listed = await whatsappNumbersToRead(p.db, MAX_DUE);
  const asked = p.now();
  const due = listed.filter((n) => isDue(n, asked));
  const tick: QualityTick = {
    due: due.length,
    read: 0,
    first: 0,
    changed: 0,
    same: 0,
    gone: 0,
    no_token: 0,
    unreadable: 0,
    not_a_rating: 0,
    left: 0,
  };
  for (let i = 0; i < due.length; i += AT_ONCE) {
    if (p.now() - p.started > p.yieldAtMs) {
      tick.left = due.length - i;
      break;
    }
    const outcomes = await Promise.all(due.slice(i, i + AT_ONCE).map((n) => readOne(p, n)));
    for (const outcome of outcomes) tick[outcome] += 1;
  }
  tick.read = tick.first + tick.changed + tick.same;
  return tick;
}

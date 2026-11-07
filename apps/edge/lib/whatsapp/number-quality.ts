/**
 * The reading behind the channel-quality sweep (the Reports lenses spec, K9): each connected WhatsApp number's quality
 * rating, asked of Meta with the token its own workspace already holds, and kept through the database's door
 * (channel_keep_quality, 00315), which says when the word changed. Beside it, in the same visit and with the same token,
 * what Meta holds about whether the number may send (numberStanding, kept through channel_keep_standing, 00338, and the
 * owner told once when it turns BLOCKED: lib/whatsapp/number-standing.ts).
 *
 * What is asked, and when. The numbers come from whatsappNumbersToRead, never read first and then the longest unread, and a
 * number is asked only when it was never read or was last read READ_EVERY_MS ago, so a tick that is late, or that ran long,
 * never reads a number twice in a day. A stamp that is no time counts as never read, so the number is asked and its read
 * writes a stamp that is one. The tick's own clock is the door's: no read starts after `yieldAtMs` from `started`, and what is
 * left is first in line next tick.
 *
 * Meta's rate. A number is asked once in five hours with its own workspace's token, so no workspace sees more than a
 * read a number in that time, and at most AT_ONCE reads are in the air together (the reach-out check's own four), each
 * bound by the Graph timeout. A visit asks the rating and the standing together, so it is still one Graph timeout wide
 * (the standing is itself four reads at once, the phone's and three of the account's). No other sweep reads Meta across
 * workspaces, so the nearest pacing to copy is the reach-out check's batches of four; the domains sweep's floor between
 * batches answers Resend's rate per account, and here each read carries its own workspace's token.
 *
 * What is kept. Only one of Meta's five words (mapNumberQuality), in capitals; and a standing only where Meta's answer says
 * what the number may do. Whatever else comes back, an error, a word that is not one of them, no word, no credentials, a
 * credential read that failed, a database that refuses, leaves the channel exactly as it was, is counted, and costs no other
 * number its read; the rating's failure costs the standing nothing and the standing's costs the rating nothing. Nothing here
 * ever throws for one number's sake; what throws is the read of the channels themselves, which the door answers as the one 503.
 *
 * The log carries the workspace and the channel by id, and Meta's answer by its status and code: never a token, never a
 * number (Meta's own words often name the number asked about, so they are not logged either).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { keepChannelQuality, listWhatsappNumbersToRead, type WhatsappNumber } from "@chanlytics/db/jobs";
import { type Database } from "@chanlytics/db/types";
import { HOUR_MS } from "@chanlytics/contracts";
import { errField, type Logger } from "../shared/log.js";
import type { notify } from "../shared/alerts/notify.js";
import { getWaCredentialsForTenant } from "../shared/tenant-runtime.js";
import { getPhoneNumber, type getNumberStanding } from "./meta-graph.js";
import { mapNumberQuality } from "./meta-templates.js";
import { readAndKeepStanding, type StandingOutcome } from "./number-standing.js";

/** How long a read holds: a number is asked again no sooner. */
const READ_EVERY_MS = 5 * HOUR_MS;
/** The most numbers a tick lists; its time budget is what bounds the work, and the longest unread are first. */
const MAX_DUE = 500;
/** How many numbers are asked together. */
const AT_ONCE = 4;

/**
 * What a tick did: every due number is in exactly one of read (first, changed, same), gone, no_token, unreadable,
 * not_a_rating and left. Of the numbers whose standing was asked of Meta (those with credentials), each is in exactly one of
 * `standing_first`, `standing_changed`, `standing_same`, `standing_gone` and `standing_unreadable`; `standing_told` is how
 * many owners were told that a number turned BLOCKED.
 */
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
  standing_first: number;
  standing_changed: number;
  standing_same: number;
  standing_gone: number;
  standing_unreadable: number;
  standing_told: number;
}

interface QualityPorts {
  db: SupabaseClient<Database>;
  log: Logger;
  now: () => number;
  /** When the tick began, and how long into it a read may still be started: the door's YIELD_AT_MS. */
  started: number;
  yieldAtMs: number;
  /** Meta's reads of one number, the owner's notice, and a workspace's token: the real ones unless a test hands others. */
  read?: (token: string, phoneNumberId: string) => ReturnType<typeof getPhoneNumber>;
  standing?: typeof getNumberStanding;
  tell?: typeof notify;
  credentialsOf?: typeof getWaCredentialsForTenant;
}

/** What one number's rating came to: the door's own answer when its word was kept, else the way the read came to nothing. */
type Outcome = "first" | "changed" | "same" | "gone" | "no_token" | "unreadable" | "not_a_rating";

/** What one visit to a number did: its rating's outcome, its standing's (null where Meta was not asked), and whether its owner was told. */
interface Visit {
  quality: Outcome;
  standing: StandingOutcome | null;
  told: boolean;
}

/** Whether a number is asked at `now`: never read (a stamp that is no time too), or read at least READ_EVERY_MS ago. */
function isDue(n: WhatsappNumber, now: number): boolean {
  if (n.read_at === null) return true;
  const readAt = Date.parse(n.read_at);
  return Number.isNaN(readAt) || now - readAt >= READ_EVERY_MS;
}

/** One number's token, or the visit that ends there: no credentials, or a credential read that failed. */
async function tokenOf(qualityPorts: QualityPorts, whatsappNumber: WhatsappNumber): Promise<string | Visit> {
  const credentialsOf = qualityPorts.credentialsOf ?? getWaCredentialsForTenant;
  try {
    const held = await credentialsOf(qualityPorts.db, whatsappNumber.tenant_id);
    if (held.outcome === "absent") return { quality: "no_token", standing: null, told: false };
    if (held.outcome === "unavailable") return { quality: "unreadable", standing: null, told: false };
    return held.credentials.accessToken;
  } catch (e) {
    qualityPorts.log.error("channel_quality_row_failed", {
      tenant_id: whatsappNumber.tenant_id,
      channel_id: whatsappNumber.channel_id,
      error: errField(e),
    });
    return { quality: "unreadable", standing: null, told: false };
  }
}

/** One number's rating: Meta's word, the door. Every failure is an outcome and a line, never a throw. */
async function ratingOf(qualityPorts: QualityPorts, whatsappNumber: WhatsappNumber, token: string): Promise<Outcome> {
  const read = qualityPorts.read ?? getPhoneNumber;
  try {
    const result = await read(token, whatsappNumber.phone_number_id);
    if (!result.ok) {
      qualityPorts.log.warn("channel_quality_read_failed", {
        tenant_id: whatsappNumber.tenant_id,
        channel_id: whatsappNumber.channel_id,
        status: result.status,
        code: result.code,
      });
      return "unreadable";
    }
    const word = mapNumberQuality(result.data.quality_rating);
    if (word === null) return "not_a_rating";
    return await keepChannelQuality(qualityPorts.db, whatsappNumber.tenant_id, whatsappNumber.channel_id, word);
  } catch (e) {
    qualityPorts.log.error("channel_quality_row_failed", {
      tenant_id: whatsappNumber.tenant_id,
      channel_id: whatsappNumber.channel_id,
      error: errField(e),
    });
    return "unreadable";
  }
}

/** One number: its workspace's token, then its rating and its standing together. */
async function visit(p: QualityPorts, n: WhatsappNumber): Promise<Visit> {
  const token = await tokenOf(p, n);
  if (typeof token !== "string") return token;
  const [quality, standing] = await Promise.all([
    ratingOf(p, n, token),
    readAndKeepStanding({ db: p.db, log: p.log, read: p.standing, tell: p.tell }, token, n),
  ]);
  return { quality, standing: standing.outcome, told: standing.told };
}

/**
 * One tick of the sweep: the due numbers read AT_ONCE at a time until the tick is out of time. Throws only when the
 * channels cannot be read.
 */
export async function readNumberQualities(qualityPorts: QualityPorts): Promise<QualityTick> {
  const listed = await listWhatsappNumbersToRead(qualityPorts.db, MAX_DUE);
  const request = qualityPorts.now();
  const due = listed.filter((n) => isDue(n, request));
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
    standing_first: 0,
    standing_changed: 0,
    standing_same: 0,
    standing_gone: 0,
    standing_unreadable: 0,
    standing_told: 0,
  };
  for (let index = 0; index < due.length; index += AT_ONCE) {
    if (qualityPorts.now() - qualityPorts.started > qualityPorts.yieldAtMs) {
      tick.left = due.length - index;
      break;
    }
    const visits = await Promise.all(due.slice(index, index + AT_ONCE).map((n) => visit(qualityPorts, n)));
    for (const v of visits) {
      tick[v.quality] += 1;
      if (v.standing) tick[`standing_${v.standing}`] += 1;
      if (v.told) tick.standing_told += 1;
    }
  }
  tick.read = tick.first + tick.changed + tick.same;
  return tick;
}

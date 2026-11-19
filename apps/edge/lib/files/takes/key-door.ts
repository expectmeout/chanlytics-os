/**
 * The relay's key door (the footage sources plan, "Taking a file in"): for each request the video platform makes of a
 * clip's address, the relay shows the ticket here and gets an hour's Drive key with that one file's id. Google has
 * no key for one file: this is the account's own read key, and for its hour it could read anything the account can.
 * The relay uses it for the one file the ticket names, holds it for one request, and never stores or logs it.
 *
 *   POST /api/sources/key    Authorization: Bearer <the app's key>    { ticket, method, range }
 *   200 { access_token, file_id }
 *
 * What it holds to: the knock carries the app's key, which only the relay has; the ticket is one the app signed and
 * has not ended; and the item it names is a clip being taken right now. A ticket for an item that is in, failed, gone
 * or anyone's photo opens nothing, however long it still has to run. The key comes from the sync's own reader, so the
 * refresh token never leaves Vault, and the key is written to no log and no address: only this answer's body.
 *
 * The door is told what is asked (the method), so Google's units are counted here, where the relay spends them.
 * The relay reads a 403 or 404 as "refused", passes a 503 on to the video platform, which asks again, and anything
 * else as a fault (apps/relay/src/relay.ts).
 */
import { timingSafeEqual } from "node:crypto";
import { RELAY_KEY_ASK, readRelayTicket, type RelayKeyAsk } from "@chanlytics/channels/files";
import { isUuid } from "@chanlytics/contracts";
import { findSourceItemAnywhere } from "@chanlytics/db/files";
import { env } from "../../shared/env.js";
import { json, refuse } from "../../shared/http.js";
import { errField, logger } from "../../shared/log.js";
import { pg } from "../../shared/pg.js";
import { DRIVE_UNITS } from "./budgets.js";
import { keepUnitsSpent } from "./ends.js";
import { takeSync, type TakeSync } from "./sync.js";

/** What the relay asks: a ticket is a few hundred bytes. */
const KEY_ASK_BYTES_MAX = 8 * 1024;

/** Whether a knock carries the app's key, by a compare that takes the same time for any wrong one. */
function knockIsRelays(request: Request, secret: string): boolean {
  const given = Buffer.from((request.headers.get("authorization") ?? "").replace(/^Bearer /, ""));
  const expected = Buffer.from(secret);
  return secret !== "" && given.length === expected.length && timingSafeEqual(given, expected);
}

/** What the relay asked, read through the shape of its own wire; null for anything else. */
async function keyAskOf(request: Request): Promise<RelayKeyAsk | null> {
  const raw = await request.text();
  if (raw.length > KEY_ASK_BYTES_MAX) return null;
  try {
    const parsed = RELAY_KEY_ASK.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    // Not JSON: nothing was asked.
    return null;
  }
}

export async function answerKeyDoor(request: Request, sync: TakeSync = takeSync): Promise<Response> {
  const secret = env.FOOTAGE_KEY_DOOR_SECRET;
  const ticketKey = env.FOOTAGE_TICKET_KEY;
  // A deployment without the relay's keys has no such door.
  if (!secret || !ticketKey) return refuse(404, "not_found");
  if (!knockIsRelays(request, secret)) return refuse(401, "unauthorized");
  const ask = await keyAskOf(request);
  if (!ask) return refuse(400, "bad_request");
  const ticket = readRelayTicket(ticketKey, ask.ticket, Date.now());
  if (!ticket.ok) {
    if (ticket.reason === "expired") return refuse(403, "token_expired");
    if (ticket.reason === "signature") return refuse(403, "token_signature");
    return refuse(403, "token_malformed");
  }
  const db = pg();
  if (!db) return refuse(503, "no_database");
  const item = isUuid(ticket.item) ? await findSourceItemAnywhere(db, ticket.item) : null;
  // Only a clip being taken right now: one that is in, failed or gone opens nothing, whatever its ticket still says.
  if (!item || item.kind !== "video" || item.state !== "taking") {
    logger({ door: "source-key", ...(item ? { tenant_id: item.tenant_id } : {}) }).warn("source_key", {
      item: ticket.item,
      why: item ? `the item is ${item.state}` : "no such item",
    });
    return refuse(404, "not_found");
  }
  const log = logger({ door: "source-key", tenant_id: item.tenant_id });
  let key;
  try {
    key = await sync.open(db, { tenantId: item.tenant_id, sourceId: item.source_id }, log);
  } catch (failure) {
    // Google or the database gave no answer: the video platform asks again.
    log.error("source_key", { item: item.id, error: errField(failure) });
    return refuse(503, "unavailable");
  }
  if (!key.ok) {
    log.warn("source_key", { item: item.id, why: key.skipped });
    return refuse(404, "not_connected");
  }
  // The relay's request is its own: what it is about to spend at Google is counted here, as it is given the key.
  await keepUnitsSpent(db, { units: ask.method === "HEAD" ? DRIVE_UNITS.record : DRIVE_UNITS.download });
  log.info("source_key", { item: item.id, method: ask.method, ranged: Boolean(ask.range) });
  return json(200, { access_token: key.accessToken, file_id: item.provider_id });
}

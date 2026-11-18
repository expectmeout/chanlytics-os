/**
 * Google's signal that something in a connected Drive changed (the footage sources plan, D18), signalHeard. A signal carries
 * no change: it only says "read". The door (api/sources/drive.ts) checks it, answers at once, and puts one read of the
 * folder on the ledger, due no sooner than one gap after its last read, so a hundred signals in a minute are one read.
 *
 * What is checked: the channel's id names a folder here, and the token the signal carries is the one the channel was
 * opened with (its sha256 is on the folder's row; the token is kept nowhere). One statement does both and stamps the
 * folder as signalled, so a read already running knows there is more.
 *
 * A signal that passes neither is answered all the same (anything but a 2xx is sent again) and reads nothing. Where its
 * channel names a folder that has since moved to another channel, the stale one is closed with that folder's own
 * account, so it stops signalling; one whose folder is gone ends by itself within the week.
 *
 * No body is read and none is trusted: the read asks the provider for the rest with the account's own grant.
 */
import { driveSource } from "@chanlytics/channels/files";
import { SECOND_MS } from "@chanlytics/contracts";
import { findMediaSourceAnywhere, pullSourceReadSooner } from "@chanlytics/db/files";
import { scheduleJobOnce } from "@chanlytics/jobs";
import { refuse } from "../../shared/http.js";
import { errField, logger, type Logger } from "../../shared/log.js";
import { pg } from "../../shared/pg.js";
import { channelSourceOf, verifyChannelToken } from "./channel.js";
import { getSourceToken } from "./credentials.js";
import { signalDueOf } from "./pace.js";

type Db = NonNullable<ReturnType<typeof pg>>;

/** A signal signalHeard: 204 carries no body. */
const signalHeard = (): Response => new Response(null, { status: 204 });

/** The longest a stale channel's closing may take inside the door: the answer is not kept waiting on it. */
const CLOSE_STALE_MS = 3 * SECOND_MS;

/**
 * A channel no folder holds any more, closed where its id still names a folder here: with that folder's account, since
 * only the account that opened a channel may close it. Best effort, bounded, and never the door's failure.
 */
async function closeStale(db: Db, channelId: string, resourceId: string, log: Logger): Promise<void> {
  const sourceId = channelSourceOf(channelId);
  if (!sourceId || !resourceId) return;
  const source = await findMediaSourceAnywhere(db, sourceId);
  // The folder's own channel with a token that is not its own is not stale: it is refused, and left alone.
  if (!source || source.channel_id === channelId) return;
  const token = await getSourceToken(db, source.connection_id);
  if (!token.ok) return;
  const closing = driveSource().closeChannel(token.token, { id: channelId, resourceId });
  const waited = new Promise<null>((resolve) => setTimeout(() => resolve(null), CLOSE_STALE_MS));
  const closed = await Promise.race([closing, waited]);
  log.info("source_signal", { outcome: "stale_closed", source: source.id, closed: closed?.verdict ?? "late" });
}

/** A push from Google for a watched folder's channel. */
export async function receiveDriveSignal(request: Request): Promise<Response> {
  const log = logger({ push: "drive" });
  const channelId = request.headers.get("x-goog-channel-id") ?? "";
  const token = request.headers.get("x-goog-channel-token") ?? "";
  if (!channelId || channelId.length > 64 || !token || token.length > 256) return refuse(400, "bad_request");
  // The message Google sends once when a channel opens: nothing has changed yet.
  if (request.headers.get("x-goog-resource-state") === "sync") return signalHeard();
  const db = pg();
  // Answered 503 so that Google sends it again: a signal lost here would wait for the clock's floor.
  if (!db) return refuse(503, "no_database");
  try {
    const now = Date.now();
    const source = await verifyChannelToken(db, { channelId, token }, new Date(now));
    if (!source) {
      log.warn("source_signal_refused", { reason: "unknown_channel_or_token" });
      await closeStale(db, channelId, request.headers.get("x-goog-resource-id") ?? "", log);
      return signalHeard();
    }
    if (source.state !== "watching") {
      log.info("source_signal", { outcome: "not_watching", source: source.id });
      return signalHeard();
    }
    const dueAt = signalDueOf(source.last_read_at, source.read_gap_seconds, now);
    // The folder's own row first: the clock hands it this read whatever becomes of the job below. A read that is
    // running holds the kind's key, so a job asked for now is not written, and the read may be past the point
    // where it would see the signal.
    await pullSourceReadSooner(db, { tenantId: source.tenant_id, id: source.id, to: dueAt.toISOString() });
    const scheduled = await scheduleJobOnce(db, {
      tenantId: source.tenant_id,
      kind: "source_read",
      dueAt,
      payload: { source_id: source.id },
    });
    log.info("source_signal", { outcome: scheduled, source: source.id });
  } catch (error) {
    // Read by the clock's floor all the same: a signal sent again for a database that is down helps nobody.
    log.error("source_signal_failed", { error: errField(error) });
  }
  return signalHeard();
}

/**
 * Stream's word about a video (decision 0099, stage B, §5 step 4): its webhook, one per account, says a video is playable or
 * could not be prepared. The delivery is proved by its signature over the raw body (channels verifyStreamWebhook: the HMAC of
 * `time.body` under the webhook's secret, and a time inside five minutes), and only then is a row touched: found by its id at
 * Stream (00556 file_media_ready, file_media_failed), the one thing the webhook knows. Ready makes it a file whether or not the
 * browser said done, and puts its digest's first step on the ledger.
 *
 * A delivery again changes nothing; a video this database does not know (another deployment's, a row already purged) is 200 and
 * a line, never a retry storm; a database that is down is 503, so Stream delivers it again. A deployment without the secret has
 * no such door: 404. The body says nothing of a customer, so it is not kept in the intake ledger: the sweep, which asks Stream
 * itself after two minutes, is this door's second road.
 */
import { streamVideoOf, verifyStreamWebhook } from "@chanlytics/channels/files";
import { markFileMediaFailed, markFileMediaReady, type MediaFate } from "@chanlytics/db/files";
import { env } from "../shared/env.js";
import { json, refuse } from "../shared/http.js";
import { errField, logger } from "../shared/log.js";
import { pg } from "../shared/pg.js";

/** A video's event is a few KB. */
const MAX_BODY_BYTES = 64 * 1024;

export async function receiveStreamWebhook(request: Request): Promise<Response> {
  const secret = env.CLOUDFLARE_STREAM_WEBHOOK_SECRET;
  if (!secret) return refuse(404, "no_provider_key");
  const log = logger({ door: "stream-webhook" });
  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) return refuse(413, "too_large");
  if (!verifyStreamWebhook(secret, request.headers.get("webhook-signature"), raw)) {
    log.warn("stream_webhook_bad_signature");
    return refuse(401, "bad_signature");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = null;
  }
  const video = streamVideoOf(parsed);
  if (!video) {
    log.warn("stream_webhook_not_json");
    return refuse(400, "bad_request");
  }
  if (!video.ready && video.state !== "error") {
    log.info("stream_webhook_ignored", { state: video.state });
    return json(200, { ok: true });
  }
  const db = pg();
  if (!db) return refuse(503, "no_database");
  let fate: MediaFate;
  try {
    fate = video.ready
      ? await markFileMediaReady(db, {
          mediaRef: video.uid,
          seconds: video.seconds,
          width: video.width,
          height: video.height,
        })
      : await markFileMediaFailed(db, video.uid, video.errorCode);
  } catch (e) {
    log.error("stream_webhook_unwritable", { error: errField(e) });
    return refuse(503, "no_database");
  }
  logger({ door: "stream-webhook", ...(fate.tenant_id ? { tenant_id: fate.tenant_id } : {}) }).info(
    "stream_webhook_heard",
    {
      fate: fate.fate,
      file: fate.file_id,
      state: video.state,
      ...(video.errorCode ? { error_code: video.errorCode } : {}),
    },
  );
  return json(200, { ok: true });
}

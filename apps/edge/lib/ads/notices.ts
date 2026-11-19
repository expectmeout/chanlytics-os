/**
 * /api/ads/meta: Meta's notices for ad accounts (the Ads plan's 6.6, "hear first, read second"). Meta tells the app
 * when something changes in an ad account that subscribed to it: an ad's standing, an ad it is still checking, an ad
 * with an issue. A notice is trusted only once Meta's signature over its body holds under the Meta app's secret; then
 * each account it names is asked for its read, soon (00650 ads_read_ask), and Meta is told it was received.
 *
 * A notice only says where to look. What changed is read from Meta by the account's own read, never taken from the
 * notice, so a notice that is lost, late or sent twice costs nothing: the clock reads every account all the same, and
 * a read asked for while one waits is that read.
 */
import { parseMetaAdsNotice } from "@chanlytics/channels/ads";
import { metaSignatureValid, META_SIGNATURE_HEADER } from "@chanlytics/channels/whatsapp";
import { askAdRead } from "@chanlytics/db/ads";
import { env } from "../shared/env.js";
import { json, refuse, text } from "../shared/http.js";
import { logger } from "../shared/log.js";
import { pg } from "../shared/pg.js";

const doorLog = logger();

/** Meta's check that the address is Chanlytics': the challenge is answered only to the token set for this door. */
export function answerAdsNoticeCheck(request: Request): Promise<Response> {
  const asked = new URL(request.url).searchParams;
  const token = env.META_ADS_VERIFY_TOKEN;
  if (token && asked.get("hub.mode") === "subscribe" && asked.get("hub.verify_token") === token)
    return Promise.resolve(text(200, asked.get("hub.challenge") || ""));
  return Promise.resolve(text(403, "verification failed"));
}

function safeJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    // A body that is not JSON names no account.
    return null;
  }
}

/**
 * Meta's signature over a notice's raw body, under the Meta app's secret; the retiring secret beside it while one is
 * rotated. Fail-closed: no secret proves nothing (channels metaSignatureValid).
 */
function adsNoticeSigned(request: Request, raw: string): boolean {
  return metaSignatureValid(raw, request.headers.get(META_SIGNATURE_HEADER), [
    env.META_APP_SECRET,
    env.META_APP_SECRET_PREVIOUS,
  ]);
}

export async function receiveAdsNotice(request: Request): Promise<Response> {
  const raw = await request.text();
  if (!adsNoticeSigned(request, raw)) return refuse(401, "bad_signature");
  const notice = parseMetaAdsNotice(safeJson(raw));
  if (notice.accountIds.length === 0) return json(200, { ok: true });
  const db = pg();
  if (!db) return refuse(503, "no_database");
  let asked = 0;
  for (const externalId of notice.accountIds) asked += await askAdRead(db, "meta", externalId);
  doorLog.info("ads_notice", { accounts: notice.accountIds.length, changes: notice.changes, asked });
  return json(200, { ok: true });
}

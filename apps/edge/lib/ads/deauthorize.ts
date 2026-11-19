/**
 * POST /api/ads/deauthorize: Meta's call when a business removes Chanlytics there (the Ads plan's G12; decision 0050,
 * P2's deauthorise callback, brought forward with Connect). Meta posts a signed request that names whose sign-in was
 * removed. Once its signature holds under the Meta app's secret, every ad account connected with that sign-in is
 * marked: access taken back, with when. The page then says so and offers Connect again, and nothing is read or changed
 * until the owner does.
 *
 * Meta names a person, never a workspace, so the accounts are found across workspaces by the id kept at Connect. A
 * call that names nobody Chanlytics holds changes nothing and is answered the same: Meta is told it was received. The
 * read on a clock marks a sign-in Meta no longer takes all the same, so a call that never arrives loses nothing.
 */
import { readMetaSignedRequest, type MetaSignedRequest } from "@chanlytics/channels/ads";
import { listAdAccountsOfPlatformUser, markAdAccountRevoked } from "@chanlytics/db/ads";
import { env } from "../shared/env.js";
import { json, refuse } from "../shared/http.js";
import { logger } from "../shared/log.js";
import { pg } from "../shared/pg.js";

const doorLog = logger();

/**
 * Meta's signed request out of the body it posted (a form, `signed_request=…`), trusted only where the Meta app's
 * secret signed it; the retiring secret beside it while one is rotated. Fail-closed: no secret is no request.
 */
function signedRequestOfMeta(raw: string): MetaSignedRequest | null {
  const signed = new URLSearchParams(raw).get("signed_request");
  if (!signed) return null;
  return readMetaSignedRequest(signed, [env.META_APP_SECRET, env.META_APP_SECRET_PREVIOUS]);
}

export async function receiveAdsDeauthorize(request: Request): Promise<Response> {
  const removed = signedRequestOfMeta(await request.text());
  if (!removed) return refuse(401, "bad_signature");
  const db = pg();
  if (!db) return refuse(503, "no_database");
  const accounts = await listAdAccountsOfPlatformUser(db, "meta", removed.userId);
  let marked = 0;
  for (const account of accounts)
    if (await markAdAccountRevoked(db, account.tenant_id, account.id, "platform")) {
      marked += 1;
      logger({ tenant_id: account.tenant_id, account_id: account.id }).info("ads_revoked", { how: "platform" });
    }
  if (marked === 0) doorLog.info("ads_deauthorize_unmatched", {});
  return json(200, { ok: true });
}

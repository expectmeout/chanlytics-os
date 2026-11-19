/**
 * Meta's ads wire, the two changes an owner makes from Chanlytics in step 2 (decision 0050, calls 1 and 9): an ad's
 * own switch set to paused or to active, and the ad read back to hear what Meta then says of it. A change costs three
 * of an account's allowance where a read costs one, and Meta takes one change to the same ad every thirty seconds, so
 * a caller asks its pace first (the edge's lib/ads). Each call leaves through callMetaAds, once: a change that got no
 * answer is never sent again, and is settled by reading what stands at Meta.
 */
import { valueAt } from "@chanlytics/contracts";
import { metaGraphUrl, metaObject, metaProofQuery, metaText } from "../meta/client";
import type { MetaRequest } from "../meta/client";

const ID = /^\d{5,32}$/;

/** An ad's own switch, set: Meta's `status` for the ad, PAUSED or ACTIVE. Nothing else of the ad is touched. */
export function metaAdSwitchRequest(
  token: string,
  appSecret: string,
  adId: string,
  to: "PAUSED" | "ACTIVE",
): MetaRequest {
  if (!ID.test(adId)) throw new Error("Meta's id for the ad is not one");
  return { url: metaGraphUrl(adId, { status: to, ...metaProofQuery(token, appSecret) }), method: "POST" };
}

/** One ad's standing, asked after a change: Meta's own word for where it now stands. */
export function metaAdStandingRequest(token: string, appSecret: string, adId: string): MetaRequest {
  if (!ID.test(adId)) throw new Error("Meta's id for the ad is not one");
  return {
    url: metaGraphUrl(adId, { fields: "effective_status", ...metaProofQuery(token, appSecret) }),
    method: "GET",
  };
}

/** Meta's word for where an ad stands (`effective_status`), or null where the answer gives none. */
export function parseMetaAdStanding(json: unknown): string | null {
  return metaText(valueAt(metaObject(json), "effective_status")).slice(0, 100) || null;
}

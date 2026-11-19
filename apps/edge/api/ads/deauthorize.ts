/**
 * POST /api/ads/deauthorize: Meta's call when a business removes Chanlytics there. The door names the request and
 * hands it to receiveAdsDeauthorize in lib/ads/deauthorize.ts, which trusts it only once Meta's signature holds, then
 * marks every ad account that sign-in connected: access taken back.
 */
import { door } from "../../lib/shared/log.js";
import { receiveAdsDeauthorize } from "../../lib/ads/deauthorize.js";

export const POST = door(receiveAdsDeauthorize);

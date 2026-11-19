/**
 * /api/ads/meta: Meta's notices for ad accounts. GET is Meta's check that the address is Chanlytics'; POST is a notice,
 * trusted only once Meta's signature holds, which asks each account it names for its read (lib/ads/notices.ts).
 */
import { door } from "../../lib/shared/log.js";
import { answerAdsNoticeCheck, receiveAdsNotice } from "../../lib/ads/notices.js";

export const GET = door(answerAdsNoticeCheck);
export const POST = door(receiveAdsNotice);

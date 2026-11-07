/**
 * Chanlytics Messaging -- Cloudflare Stream's webhook: a business's video is playable, or could not be prepared (decision 0099,
 * stage B). One webhook per account, pointed at production's edge; a preview never hears it, and the sweep covers it there.
 *
 * THIS FILE IS THE WIRE. Everything after the knock is receiveStreamWebhook in lib/files/video-webhook.ts: the signature over
 * the raw body first, then the row found by Stream's id for it.
 */
import { door } from "../lib/shared/log.js";
import { receiveStreamWebhook } from "../lib/files/video-webhook.js";

export const POST = door(receiveStreamWebhook);

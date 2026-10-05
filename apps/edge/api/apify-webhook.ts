/**
 * Apify's webhook for a lead search's run: a delivery is a pointer (ids and a status) that schedules the run's
 * collection.
 *
 * The door names the request (log.ts `door`: the platform's id for the invocation, never the caller's) and calls
 * receiveApifyDelivery in lib/leads/apify-delivery.ts, which holds everything the request does, in the order the door
 * had it: the run's token is checked, the delivery judged (planApifyIngress) and applied.
 */
import { door } from "../lib/log.js";
import { receiveApifyDelivery } from "../lib/leads/apify-delivery.js";

export const POST = door(receiveApifyDelivery);

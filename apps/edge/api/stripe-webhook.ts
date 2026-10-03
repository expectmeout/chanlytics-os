/**
 * POST /api/stripe-webhook: what Stripe tells us, verified, kept once, applied.
 *
 * The door names the request (log.ts `door`: the platform's id for the invocation, never the caller's) and calls
 * receiveStripeEvent in lib/billing/stripe-event.ts, which holds everything the request does, in the order the door had
 * it: the signature is checked against the raw body before anything is read, the event kept by its id under a lease and
 * applied.
 */
import { door } from "../lib/log.js";
import { receiveStripeEvent } from "../lib/billing/stripe-event.js";

export const POST = door(receiveStripeEvent);

/**
 * Resend's webhook: an event for the platform's mail domain, a receipt or a received mail, verified with Svix's
 * signature.
 *
 * The door names the request (log.ts `door`: the platform's id for the invocation, never the caller's) and calls
 * receiveResendEvent in lib/email/resend-event.ts, which holds everything the request does, in the order the door had
 * it: the event is verified and planned (planResendEvent), a receipt applied and a received mail scheduled as an
 * email_ingest job.
 */
import { door } from "../lib/log.js";
import { receiveResendEvent } from "../lib/email/resend-event.js";

export const POST = door(receiveResendEvent);

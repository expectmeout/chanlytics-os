/**
 * Twilio's status callback for a sent text: the delivery state is recorded on the message.
 *
 * The door names the request (log.ts `door`: the platform's id for the invocation, never the caller's) and calls
 * receiveSmsStatus in lib/sms/sms-status.ts, which holds everything the request does, in the order the door had it: the
 * line and its account are read, Twilio's signature checked (a dry line has none) and the status recorded.
 */
import { door } from "../lib/log.js";
import { receiveSmsStatus } from "../lib/sms/sms-status.js";

export const POST = door(receiveSmsStatus);

/**
 * Twilio's inbound-text webhook: a text arrives for one of the workspaces' lines and is handed to the receptionist's
 * message path.
 *
 * The door names the request (log.ts `door`: the platform's id for the invocation, never the caller's) and calls
 * receiveInboundText in lib/sms/inbound-text.ts, which holds everything the request does, in the order the door had it:
 * the form is read, the line and the signature judged (planSmsIngress) and the message handed on; the answer is empty
 * TwiML.
 */
import { door } from "../lib/log.js";
import { receiveInboundText } from "../lib/sms/inbound-text.js";

export const POST = door(receiveInboundText);

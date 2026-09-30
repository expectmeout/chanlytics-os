/**
 * Retell custom function send_booking_link: mid-call, the voice agent has the caller texted the booking link on
 * WhatsApp through an approved utility template, and speaks the short answer it gets back.
 *
 * The door names the request (log.ts `door`: the platform's id for the invocation, never the caller's) and calls
 * sendBookingLinkOnCall in lib/voice/call-booking-link.ts, which holds everything the request does, in the order the
 * door had it: the knock is checked (voiceDoorAuth), the call routed to its workspace, the voice gate asked, and the
 * link sent through deliver(); every refusal still answers HTTP 200 with a `result` sentence, because the agent speaks
 * that string.
 */
import { door } from "../lib/log.js";
import { sendBookingLinkOnCall } from "../lib/voice/call-booking-link.js";

export const POST = door(sendBookingLinkOnCall);

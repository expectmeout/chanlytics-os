/**
 * Retell's inbound-call webhook: it fires when a call arrives on the number and answers with what the receptionist is
 * told before it speaks (the shell's dynamic variables).
 *
 * The door names the request (log.ts `door`: the platform's id for the invocation, never the caller's) and calls
 * receiveInboundCall in lib/voice/inbound-call.ts, which holds everything the request does, in the order the door had
 * it: the knock is checked (voiceDoorAuth), the call routed on the agent it arrived on, and the answer planned by
 * planCallStart; past the key the answer is always 200.
 */
import { door } from "../lib/log.js";
import { receiveInboundCall } from "../lib/voice/inbound-call.js";

export const POST = door(receiveInboundCall);

/**
 * Retell's call webhook: call_started, transcript_updated, call_ended and call_analyzed, ingested into the call's row,
 * its thread and its recording.
 *
 * The door names the request (log.ts `door`: the platform's id for the invocation, never the caller's) and calls
 * receiveCallEvent in lib/voice/call-webhook.ts, which holds everything the request does, in the order the door had it:
 * the signature is proved, the delivery read into the shape the row keeps, an erased caller's call refused, the agent
 * routed to its workspace and the ingest run.
 */
import { door } from "../lib/log.js";
import { receiveCallEvent } from "../lib/voice/call-webhook.js";

export const POST = door(receiveCallEvent);

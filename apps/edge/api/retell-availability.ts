/**
 * Retell custom function check_availability: mid-call, the phone receptionist asks what is open and speaks the answer;
 * it can only ever read.
 *
 * The door names the request (log.ts `door`: the platform's id for the invocation, never the caller's) and calls
 * availabilityTool in lib/voice/availability-tool.ts, which holds everything the request does, in the order the door
 * had it: the knock is checked (voiceDoorAuth), the call routed to its workspace and the openings read through the
 * calendar feed's cache; every refusal still answers HTTP 200 with a `result` sentence, because the agent speaks that
 * string.
 */
import { door } from "../lib/log.js";
import { availabilityTool } from "../lib/voice/availability-tool.js";
export { spoken, availabilityAnswer } from "../lib/voice/availability-tool.js";

export const POST = door(availabilityTool);

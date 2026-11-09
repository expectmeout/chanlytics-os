/**
 * How Ask tells a call that never connected. "Missed" is the customer's dial and nobody else's (missedCall): one the
 * receptionist placed and nobody answered is a call that didn't connect (callAttemptWords). The jump list's word under a
 * call (callJumpSub) and the outcome the tools read to the model (askCallOutcome) say it from the one rule, so neither
 * calls an outbound dial "missed".
 */
import { missedCall } from "../conversations/call-dto";
import type { CallVM } from "../conversations/call-vm";

/** The word under a call in the jump list: live, "missed", "didn't connect" for a dial the receptionist placed, else none. */
export function callJumpSub(context: {
  live: boolean;
  missed: boolean;
  direction: "inbound" | "outbound" | null;
}): string | undefined {
  if (context.live) return "live";
  if (!context.missed) return undefined;
  return missedCall(context) ? "missed" : "didn't connect";
}

/**
 * How a call ended, as Ask's tools read it to the model: the Calls page's outcome (callOutcomeFor), except that a dial
 * that never connected is "missed" only where the customer dialled; the receptionist's own that nobody answered is
 * "not_connected".
 */
export function askCallOutcome(
  call: Pick<CallVM, "outcome" | "missed" | "direction">,
): CallVM["outcome"] | "not_connected" {
  return call.outcome === "missed" && !missedCall(call) ? "not_connected" : call.outcome;
}

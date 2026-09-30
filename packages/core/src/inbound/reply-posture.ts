/**
 * Whether the receptionist may speak, and in whose voice: the reply mode in force, as two rules with no dependencies,
 * so each is a truth table a test runs (reply-posture.test.mjs).
 *
 * replyPosture turns what the control plane said into the workspace's mode: a routed workspace whose runtime was read
 * follows its own reply policy, and anything else is 'ask'. effectiveReplyMode lets a person's own setting (People,
 * their profile, "Receptionist for ...") win over it; an absent setting changes nothing. openInbound (./context.ts)
 * calls the first once per message, modeInForce (./gates.ts) calls the second once the person's setting is looked up,
 * and the phone agent's booking-link message (apps/edge/api/retell-fn.ts) calls the second too, so a caller set to
 * never is left alone on a call as well.
 *
 * There is no fallback profile: a control plane that cannot be read is an outage, and during an outage the
 * receptionist says nothing in anyone's voice, so 'auto' is never the answer without a usable runtime to say so. Only
 * 'auto' and 'veto' let a message on to the model (./reply-gates.ts holds every other mode); a held message is already
 * persisted, its thread is escalated and a person is told. This file decides the mode, not the hold.
 */

export interface RoutingFacts {
  /** The tenant runtime was read AND the read succeeded. */
  runtimeUsable: boolean;
  /** policies.reply.mode for this tenant, when the runtime carried one. */
  policyMode?: string;
}

export interface ReplyPosture {
  /** The reply policy in force. Anything but 'auto' or 'veto' holds for a human. */
  replyMode: string;
}

export function replyPosture(f: RoutingFacts): ReplyPosture {
  // A routed tenant's own policy, or 'ask'. Never 'auto' without a runtime to
  // say so: that is how an unroutable number once inherited a voice.
  return { replyMode: f.runtimeUsable ? (f.policyMode ?? "ask") : "ask" };
}

/**
 * The mode in force for ONE message, once the person's own setting is known.
 *
 * A person-level setting (People, their profile, "Receptionist for ...") wins
 * over the workspace policy. An absent setting changes nothing.
 */
export function effectiveReplyMode(posture: ReplyPosture, personMode: string | null | undefined): string {
  return personMode || posture.replyMode;
}

/**
 * Whether the receptionist may speak, and in whose voice.
 *
 * One rule: a routed workspace whose runtime was read follows its own reply
 * policy; anything else holds the thread for a person. There is no fallback
 * profile. A control plane that cannot be read is an outage, and during an
 * outage the receptionist says nothing in anyone's voice: the customer's
 * message is persisted, the thread is escalated, and a person is told.
 *
 * This used to carry a second posture, `drFallback`: the environment's own
 * number rode a read failure out on a baked copy of one workspace's profile.
 * That copy was a customer's data in the repository, then in the deployment's
 * environment, with a special case in every door and a golden test to keep it
 * in step with the row it duplicated. The pilot is one workspace among many
 * and behaves like the rest.
 *
 * Deliberately dependency-free so the rule can be tested directly.
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

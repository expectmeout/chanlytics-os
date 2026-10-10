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

/**
 * Whether a reply mode lets the receptionist speak without a person: 'auto' sends, 'veto' sends once its hold window
 * passes. Every other mode holds for a person. THE statement of it: the gates (./reply-gates.ts), the unreadable
 * message's acknowledgement (./unreadable.ts) and the phone agent's outbound gate (../messages/outbound-gate.ts) ask it.
 */
export function speaksUnattended(replyMode: string): boolean {
  return replyMode === "auto" || replyMode === "veto";
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

/**
 * Why an automated message may not go to a person now, or null when it may: one order for every sender that speaks
 * without a person, the text receptionist's gates (./reply-gates.ts) and the phone agent's booking link
 * (../messages/outbound-gate.ts). They asked the same five questions in two orders, so one workspace could get two
 * answers to one moment. Consent is not here: it is the send door's, and a sender that must say why before it sends
 * asks the one consent predicate itself first (contracts mayMessageFor).
 *
 *   human_has_it              a person holds the thread: an automated message underneath them is what the pause is for.
 *   daily_cap                 the thread's automated messages today have reached their ceiling.
 *   paused                    the workspace is paused (billing stopped): nothing automated goes.
 *   booking_needs_a_person    the workspace confirms bookings itself, and this message would book (the booking link).
 *   policy_hold               the mode in force is not one that speaks without a person (speaksUnattended).
 *
 * A thread a person holds is asked first: its message is theirs to read, so it is set aside, not escalated as a
 * workspace-wide stop would be.
 */
type UnattendedHold = "human_has_it" | "daily_cap" | "paused" | "booking_needs_a_person" | "policy_hold";

export function unattendedHold(f: {
  /** conversations.paused_until, as epoch ms: a person holds the thread until then. Null or past: nobody does. */
  pausedUntilMs: number | null;
  nowMs: number;
  /** The automated messages this thread has had today, and their ceiling. */
  sentToday: number;
  dailyCap: number;
  /** tenants.status = 'paused'. */
  workspacePaused: boolean;
  /** This message would book, and the Autonomy pane's booking row is not on auto. */
  bookingHeld: boolean;
  /** The mode in force: the workspace's, or the person's own when set (effectiveReplyMode). */
  mode: string;
}): UnattendedHold | null {
  if (f.pausedUntilMs !== null && f.nowMs < f.pausedUntilMs) return "human_has_it";
  if (f.sentToday >= f.dailyCap) return "daily_cap";
  if (f.workspacePaused) return "paused";
  if (f.bookingHeld) return "booking_needs_a_person";
  if (!speaksUnattended(f.mode)) return "policy_hold";
  return null;
}

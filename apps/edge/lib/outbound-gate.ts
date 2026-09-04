/**
 * May an automated message go to this person, right now?
 *
 * Pure and dependency-free, like reply-posture.ts and consent.ts beside it.
 *
 * The WhatsApp handler enforces these rules as statement order across a
 * 300-line function, which works because every inbound message walks that one
 * path. The VOICE path is a second sender — the caller asks the phone agent to
 * text them a booking link — and it was assembled by hand: it checked consent
 * and stopped there. So a booking link would land in a thread a human had taken
 * over, which is the exact interruption the pause exists to prevent, and it
 * would keep landing after a workspace had switched its receptionist off.
 *
 * Consent is checked here too, even though the voice path already did it, so
 * that "may we send" has ONE answer rather than one-and-a-half.
 */
export interface OutboundFacts {
  /** contacts.consent === 'opted_out' or contacts.dnc. */
  optedOut: boolean;
  /** conversations.paused_until — a human has this thread. */
  pausedUntilMs: number | null;
  /** The mode in force — the workspace's, or the person's own when set.
   *  'auto' and 'veto' permit an unattended template send; anything else
   *  holds for a human. */
  replyMode: string;
  /** Voice-initiated sends already made to this thread today. */
  sentToday: number;
  /** The ceiling on those. */
  dailyCap: number;
  /** Clock, injected so this stays testable. */
  nowMs: number;
}

export type OutboundRefusal =
  | "opted_out"
  | "human_has_it"
  | "policy_hold"
  | "daily_cap";

export interface OutboundDecision {
  allowed: boolean;
  refusal: OutboundRefusal | null;
}

export function outboundGate(f: OutboundFacts): OutboundDecision {
  // 1. Consent outranks everything, including a caller asking on the phone.
  //    Someone who said stop said stop, whatever channel they said it on.
  if (f.optedOut) return { allowed: false, refusal: "opted_out" };

  // 2. A human is mid-conversation on this thread. An automated template
  //    arriving underneath them is precisely what pause is for — and the
  //    customer cannot tell it apart from the person they are talking to.
  if (f.pausedUntilMs !== null && f.nowMs < f.pausedUntilMs) {
    return { allowed: false, refusal: "human_has_it" };
  }

  // 3. The workspace turned automation off. 'ask' means a human approves
  //    everything, and a send triggered from a phone call is no less automatic
  //    for having been requested out loud. 'veto' is NOT off: it holds a reply
  //    the receptionist composed so a person can redirect it, and a booking
  //    link the caller just asked for has nothing to redirect — refusing it
  //    silently punished the workspaces that chose the middle setting.
  if (f.replyMode !== "auto" && f.replyMode !== "veto") return { allowed: false, refusal: "policy_hold" };

  // 4. Runaway guard. The conversational path caps bot replies per thread per
  //    day; nothing capped this one, so a caller who phoned thirty times — or a
  //    voice agent that called its own tool in a loop — sent thirty billable
  //    templates to one person.
  if (f.sentToday >= f.dailyCap) return { allowed: false, refusal: "daily_cap" };

  return { allowed: true, refusal: null };
}

/**
 * What the voice agent SAYS when a send is refused.
 *
 * Spoken aloud to a caller who is waiting, so each one names an alternative
 * rather than describing our internal state. The caller must never hear "policy
 * hold" or learn that a colleague is mid-thread with them elsewhere.
 */
export function refusalScript(refusal: OutboundRefusal, phoneDisplay: string): string {
  switch (refusal) {
    case "opted_out":
      return "That number has asked us to stop sending messages, so I cannot text them. Offer to book them on the call instead.";
    case "human_has_it":
      return "Someone from the team is already messaging that number, so I will not text over them. Tell the caller a person is on it and will follow up there.";
    case "policy_hold":
      return `I cannot send texts automatically for this business right now. Tell the caller they can book online, or reach the team on ${phoneDisplay}.`;
    case "daily_cap":
      return "I have already texted that number several times today, so I will not send another. Tell the caller to check their WhatsApp for the earlier message.";
  }
}

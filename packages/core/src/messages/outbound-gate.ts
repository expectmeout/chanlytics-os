/**
 * May an automated message go to this person, right now?
 *
 * Pure, and its one import is the pure predicate every other send path already
 * asks — which is the point of it rather than an exception to it.
 *
 * The WhatsApp handler enforces these rules as statement order across a
 * 300-line function, which works because every inbound message walks that one
 * path. The VOICE path is a second sender — the caller asks the phone agent to
 * text them a booking link — and it was assembled by hand: it checked consent
 * and stopped there. So a booking link would land in a thread a human had taken
 * over, which is the exact interruption the pause exists to prevent, and it
 * would keep landing after a workspace had switched its receptionist off.
 *
 * CONSENT IS ASKED HERE, and once. This file used to take a single `optedOut`
 * boolean and claim in this comment that "may we send" therefore had "ONE answer
 * rather than one-and-a-half". That stopped being true the moment consent became
 * two answers (00095): the broadcast wire moved to `mayMessageFor` and this path
 * did not, so the product was back to two bars decided per call site — which is
 * the defect 00095's own header names under UNDER-BLOCKING. It now takes the
 * person's consent row and the message's PURPOSE and asks `mayMessageFor`, so
 * there is one rule again and this file no longer holds a copy of it.
 *
 * WHY IT IS CORE'S. A rule the product enforces lives in packages/core (decision 0027): this one decides whether any
 * automated message may go, for whichever sender asks, so it moved here from apps/edge/lib/receptionist (4 Oct 2026),
 * unchanged, and the edge's voice path takes it through its package facade like every other rule it asks.
 */
import {
  mayMessageFor,
  type PurposeBearing,
  type PurposeRefusal,
  type AskedPurpose,
  type MessageAbout,
} from "@chanlytics/contracts";
import { unattendedHold } from "../inbound/reply-posture";

interface OutboundFacts {
  /**
   * The person's consent row: both answers plus the do-not-contact override.
   * Passed whole rather than pre-decided, so this gate asks the question instead
   * of being handed somebody else's answer to it.
   */
  contact: PurposeBearing;
  /**
   * What kind of message this is. Required, never defaulted: the caller knows
   * what it is about to send and the gate cannot guess.
   */
  purpose: AskedPurpose;
  /**
   * True when this send STARTS a conversation. False when it answers somebody
   * who just contacted us — which is the honest reading of a caller on the line
   * asking to be texted, and the reason that send does not need a prior opt-in.
   */
  proactive: boolean;
  /** The channel the message would go out on: a yes covers the channels it was given for (consent-channels.ts). */
  channel: string;
  /**
   * What the message is about (contracts MessageAbout, decision D1): the receptionist's are theirs (the call they are
   * on, the thread they wrote in). Required, as the purpose is: by email, the business's own news asks for a yes.
   */
  about: MessageAbout;
  /** tenants.status = 'paused' (billing stopped): nothing automated goes out. */
  paused?: boolean;
  /** conversations.paused_until — a human has this thread. */
  pausedUntilMs: number | null;
  /** The mode in force — the workspace's, or the person's own when set.
   *  'auto' and 'veto' permit an unattended template send; anything else
   *  holds for a human. */
  replyMode: string;
  /**
   * The Autonomy pane's BOOKING row is not on auto.
   *
   * A separate answer from `replyMode`, because they are separate rows on that
   * pane and a workspace sets them independently. The text receptionist has
   * obeyed this row since it existed -- `layerTwo` takes the booking link back
   * out of a reply and hands the thread to a person -- while the phone agent
   * read the REPLY row and sent the link anyway. Same workspace, same request,
   * two answers.
   */
  bookingHeld: boolean;
  /** Voice-initiated sends already made to this thread today. */
  sentToday: number;
  /** The ceiling on those. */
  dailyCap: number;
  /** Clock, injected so this stays testable. */
  nowMs: number;
}

export type OutboundRefusal =
  // Consent's own reasons (contracts mayMessageFor), each with its script below: a reason the consent rule gains has no
  // words until refusalScript gives it some, where a cast once let `unsubscribed` through with none.
  | PurposeRefusal
  | "paused"
  | "human_has_it"
  | "policy_hold"
  // The workspace confirms bookings itself (Autonomy -> Booking -> Ask me
  // first). Its own refusal rather than a policy_hold, because the caller is
  // owed the true reason: a person will confirm, rather than nothing can be
  // sent automatically at all.
  | "booking_needs_a_person"
  | "daily_cap"
  // The door's own refusal: the texting line is registered for replies and
  // appointment messages only, so a promotion by text never goes (core deliver).
  | "sms_carries_no_promotions";

interface OutboundDecision {
  allowed: boolean;
  refusal: OutboundRefusal | null;
}

export function outboundGate(f: OutboundFacts): OutboundDecision {
  // 1. Consent outranks everything, including a caller asking on the phone.
  //    Someone who said stop said stop, whatever channel they said it on — and
  //    for a promotional message, a yes to conversation is not a yes to offers.
  //    One predicate, asked with this message's own purpose.
  const may = mayMessageFor(f.contact, f.purpose, { proactive: f.proactive, channel: f.channel, about: f.about });
  if (!may.ok) return { allowed: false, refusal: may.reason };

  // 2. Then what every sender that speaks without a person asks, in the one order the text receptionist asks it too
  //    (../inbound/reply-posture.ts unattendedHold): a person holding the thread (an automated template arriving
  //    underneath them is precisely what the pause is for, and the customer cannot tell it apart from the person),
  //    the day's cap on these sends to the thread (the conversational path caps its replies; nothing capped this one,
  //    so a caller who phoned thirty times, or an agent calling its own tool in a loop, sent thirty billable
  //    templates), the workspace paused for billing, a booking the workspace confirms itself ("a person confirms your
  //    booking" is the true thing to say, even where the receptionist is otherwise free to speak), and the mode: 'ask'
  //    means a person approves everything, and a send asked for out loud on a call is no less automatic; 'veto' is
  //    NOT off, since a booking link the caller just asked for has nothing to redirect.
  const hold = unattendedHold({
    pausedUntilMs: f.pausedUntilMs,
    nowMs: f.nowMs,
    sentToday: f.sentToday,
    dailyCap: f.dailyCap,
    workspacePaused: f.paused === true,
    bookingHeld: f.bookingHeld,
    mode: f.replyMode,
  });
  if (hold) return { allowed: false, refusal: hold };

  return { allowed: true, refusal: null };
}

/** How a call names what it would have sent, by the channel the send went by: a WhatsApp message, or a text. */
const SENT_AS = {
  whatsapp: {
    one: "a WhatsApp message",
    many: "WhatsApp messages",
    Many: "WhatsApp messages",
    earlier: "their WhatsApp",
  },
  sms: { one: "a text message", many: "text messages", Many: "Text messages", earlier: "their messages" },
} as const;

/**
 * What the voice agent SAYS when a send is refused.
 *
 * Spoken aloud to a caller who is waiting, so each one names an alternative
 * rather than describing our internal state. The caller must never hear "policy
 * hold" or learn that a colleague is mid-thread with them elsewhere.
 *
 * The send being refused is the booking link, which goes by WhatsApp, or by text
 * from the business's texting line when WhatsApp cannot carry it (retell-fn.ts,
 * the live walk's SET-2, 28 Oct 2026), so each names the message it would have
 * been. Until then a call only ever sent a WhatsApp message, and said so.
 */
export function refusalScript(
  refusal: OutboundRefusal,
  phoneDisplay: string | null | undefined,
  channel: "whatsapp" | "sms",
): string {
  const m = SENT_AS[channel === "sms" ? "sms" : "whatsapp"];
  switch (refusal) {
    case "opted_out":
      return `That number has asked us to stop sending messages, so I cannot send them ${m.one}. Offer to book them on the call instead.`;
    // Reachable only when a caller asks us to text a THIRD party — the person on
    // the line is answering us, so their own send is never proactive. Spoken to
    // the caller, so it says what to do and never that we hold a record on
    // somebody else.
    case "not_opted_in":
      return `I can only send ${m.many} to the number the caller is phoning from. Offer to send it to their own mobile, or to book them on the call.`;
    // Email's own no: reachable only where the gate is asked about an email (the phone agent's link goes by WhatsApp or text).
    case "unsubscribed":
      return "They unsubscribed from this business's email, so I cannot email them. Offer to book them on the call instead.";
    // An offer's own no: the booking link a call sends by text is never one (the door holds a text to none), so WhatsApp's.
    case "no_marketing_consent":
      return "I cannot send that on WhatsApp, because it is a promotional message and that number has not asked for those. Offer to book them on the call instead.";
    // The texting line's own refusal: the door returns it on channel "sms" only
    // (core deliver), and "text" here means the texting line.
    case "sms_carries_no_promotions":
      return "I cannot send that as a text: this business sends offers on WhatsApp only, never by text message. Offer to book them on the call instead.";
    case "paused":
      return `${m.Many} are paused for this business right now, so I cannot send anything. Take the caller's name and number and say someone will call them back.`;
    case "human_has_it":
      return `Someone from the team is already messaging that number, so I will not send ${m.one} over them. Tell the caller a person is on it and will follow up there.`;
    case "policy_hold":
      // The published number is optional now (it defaults to the line), so a
      // workspace can genuinely have none. Reading "reach the team on
      // undefined" to a caller is worse than not offering a number at all.
      return phoneDisplay
        ? `I cannot send ${m.many} automatically for this business right now. Tell the caller they can book online, or reach the team on ${phoneDisplay}.`
        : `I cannot send ${m.many} automatically for this business right now. Tell the caller they can book online, and take their name.`;
    // The same sentence the prompt already gives a workspace on this setting
    // (contracts policyRules, voice): a person confirms, so take their name.
    case "booking_needs_a_person":
      return "This business confirms bookings itself, so I cannot send the booking link. Tell the caller a member of the team will call or text them to confirm, and take their name.";
    // The day's cap counts the booking link however it went (a call's sends share one source), so a text's points the
    // caller at their messages, where an earlier one may have come by WhatsApp or by text.
    case "daily_cap":
      return `I have already sent that number several ${m.many} today, so I will not send another. Tell the caller to check ${m.earlier} for the earlier message.`;
  }
}

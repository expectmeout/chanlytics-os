/**
 * Why a person is needed on a thread: the escalation as the wire gives it, and the ONE vocabulary for each reason --
 * its label for a row (a sentence), its clause for a chip or "Escalated · …" (the label's own words, lower-cased),
 * and the sentence the operator reads first. The Inbox, Today, Reports, People and the person page all read them
 * here. Reports said "Flagged by you" and "Memory was unavailable" where the Inbox said "Flagged manually" and
 * "The receptionist could not read this thread" (the 2 Oct 2026 audit): a second map in people/person-row-facts.ts
 * had become a second vocabulary for one closed set. The set is the database's (schema-sets.ts), so a reason the
 * CHECK gains without its three forms fails the package's typecheck.
 */
import { STOP_WORDS } from "../consent/consent";
import type { EscalationReason } from "../shared/enums";
import { entryOf, keysOf } from "../shared/unknown";

export interface EscalationDto {
  id: string;
  reason: string;
  details: string | null;
  state: "open" | "resolved";
  created_at: string;
  /**
   * The booking a `booking_request` hold asks to confirm (decision 0061): the request's row, its slot, its service and
   * when it stops holding the slot. Absent on every other hold, and from a server a deploy behind.
   */
  request?: BookingRequestDto | null;
}

/** A booking the receptionist asked for, as its hold carries it (the appointments row 00443 opened). */
export interface BookingRequestDto {
  id: string;
  starts_at: string;
  ends_at: string;
  service: string | null;
  expires_at: string | null;
}

// These labels headline a row on Today, where there is no thread open beside
// them to supply context — so each one says what happened AND what it means,
// in the operator's words rather than the system's.
export const ESCALATION_REASON_LABELS: Record<EscalationReason, string> = {
  human_token: "Customer asked for a person",
  refusal: "AI declined to answer",
  brain_error: "AI couldn't answer · a holding message went out",
  non_text: "Sent a voice note or photo",
  send_failed: "Reply didn't reach them",
  policy_block: "Your reply setting keeps it for you · nothing was sent",
  policy_ask: "Set to ask you first · a person answers this one",
  person_hold: "You answer this person · AI stays out",
  rate_cap: "Too many replies too fast · AI paused itself",
  deadman: "Nobody picked this up · flagged after silence",
  manual: "Flagged by hand",
  opt_out: STOP_WORDS.said(),
  state_unavailable: "AI couldn't read this conversation · needs a person",
  // True of both ways a reply comes too late: their message reached us hours after they sent it (the inbound gate), or
  // the receptionist's held reply could not leave until then (the send door's too_late). The hold's details say which.
  stale: "Too late for AI to answer · hours passed before a reply could go",
  budget: "The daily AI limit is reached · AI paused itself",
  callback: "Needs a call back · they phoned and are still owed a call",
  paused: "The workspace is paused until billing resumes",
  carriers: "Texting isn't approved for this number yet",
  email_review: "Wrote by email · a person answers",
  booking_request: "Asked to book a time · confirm it or say you can't",
  booking_reply: "Asked to book a time · reply to them",
  wrote_while_held: "Wrote again while your team had it · AI stays out",
};

/**
 * The same reason as a clause: what follows "Escalated · " on a People row, a Today queue row's status, a Reports
 * bar and the person page's timeline. The label's own words, never a second vocabulary: a reader who learns
 * "Flagged manually" in the Inbox must find "flagged by hand", not "flagged by you", on Reports.
 */
export const ESCALATION_REASON_SHORT: Record<EscalationReason, string> = {
  human_token: "asked for a person",
  refusal: "AI declined to answer",
  brain_error: "AI couldn't answer",
  non_text: "sent a voice note or photo",
  send_failed: "reply didn't reach them",
  policy_block: "your reply setting keeps it for you",
  policy_ask: "set to ask you first",
  person_hold: "you answer this person",
  rate_cap: "too many replies too fast",
  deadman: "nobody picked this up",
  manual: "flagged by hand",
  opt_out: STOP_WORDS.short,
  state_unavailable: "AI couldn't read this conversation",
  stale: "too late for AI to answer",
  budget: "the daily AI limit is reached",
  callback: "needs a call back",
  paused: "the workspace is paused until billing resumes",
  carriers: "texting isn't approved for this number yet",
  email_review: "wrote by email",
  booking_request: "asked to book a time",
  booking_reply: "asked to book a time",
  wrote_while_held: "wrote while your team had it",
};

/** The clause for a reason, or the reason's own words for one the set does not know; nothing for none. */
export function reasonShort(reason: string | null | undefined): string {
  if (!reason) return "";
  return entryOf(ESCALATION_REASON_SHORT, reason) ?? reason.replace(/_/g, " ");
}

/**
 * The same reason as why the receptionist handed a conversation over, after "Handed over once, ...": Today's receipt.
 * Every reason has its words, in the label's vocabulary ("flagged by hand", "you handle this person"), and never more
 * than the data knows: non_text is "something it can't read", not a photo, since it may have been audio, a sticker or a
 * document. Four reasons had no words and the receipt read "Handed over once, the day's model budget is used up."
 */
const ESCALATION_REASON_WHY: Record<EscalationReason, string> = {
  human_token: "because a customer asked for a person",
  refusal: "because it declined to answer",
  brain_error: "because it couldn't answer",
  non_text: "for something it can't read",
  send_failed: "because a reply didn't reach them",
  policy_block: "because your reply setting keeps it for you",
  policy_ask: "for a booking or a question set to ask you first",
  person_hold: "because you answer this person",
  rate_cap: "because the reply limit was reached",
  deadman: "because no answer came in time",
  manual: "because it was flagged by hand",
  opt_out: `because they ${STOP_WORDS.short}`,
  state_unavailable: "because it couldn't read the conversation",
  stale: "because hours passed before a reply could go",
  budget: "because the daily AI limit was reached",
  callback: "because they need a call back",
  paused: "because the workspace is paused",
  carriers: "while texting waits for approval",
  email_review: "because they wrote by email",
  booking_request: "because they asked to book a time",
  booking_reply: "because they asked to book a time",
  wrote_while_held: "because they wrote while your team had it",
};

/**
 * Why AI did not finish it, as Today's card says it first (Working for you, W20, 21 Nov 2026): "AI held it: booking a time
 * needs you." The card answers three things, what happened (their words, its title), why AI did not finish it (this), and
 * what your press does; each reason's clause is what AI could not do, or what keeps it for you.
 */
const ESCALATION_REASON_HELD: Record<EscalationReason, string> = {
  human_token: "they asked for a person",
  refusal: "it chose not to answer this one",
  brain_error: "it couldn't find an answer",
  non_text: "it can't read a voice note or a photo",
  send_failed: "the reply didn't reach them",
  policy_block: "your reply setting keeps these for you",
  policy_ask: "this kind of question is set to ask you first",
  person_hold: "you answer this person yourself",
  rate_cap: "they wrote faster than it may reply",
  deadman: "nobody picked it up in time",
  manual: "it was flagged by hand",
  opt_out: `they ${STOP_WORDS.short}`,
  state_unavailable: "it couldn't read this conversation",
  stale: "too long had passed to answer",
  budget: "today's AI limit is reached",
  callback: "they need a call back",
  paused: "the workspace is paused",
  carriers: "texting isn't approved for this number yet",
  email_review: "email replies wait for you",
  booking_request: "booking a time needs you",
  // A reply, not a press: said apart from the request above, whose card is confirmed (the walk of 22 Nov 2026).
  booking_reply: "the time they asked for isn't booked",
  wrote_while_held: "your team has this conversation",
};

/** The card's first sentence for a hold: "AI held it: …". A reason the set does not know is said by its clause. */
export function reasonHeld(reason: string): string {
  return `AI held it: ${entryOf(ESCALATION_REASON_HELD, reason) ?? reasonShort(reason)}.`;
}

/** Why a reason handed a conversation over; a reason the set does not know is said by its clause. */
export function reasonWhy(reason: string): string {
  return entryOf(ESCALATION_REASON_WHY, reason) ?? `because ${reasonShort(reason)}`;
}

/**
 * What the operator is walking into, per reason.
 *
 * This used to be ONE sentence for every escalation: "The customer already got a
 * holding reply — they're expecting a real answer." That is false for five of
 * the eleven reasons. The receptionist deliberately sends NOTHING on opt_out,
 * rate_cap, state_unavailable, and on non_text/policy_block when the workspace
 * has no persona configured — so on exactly the threads where something broke
 * and the customer is sitting in silence, the operator was told the opposite.
 *
 * Split into "a holding message went out" and "nothing was sent", because the
 * first sentence an operator reads decides whether they open with an apology or
 * an answer.
 */
export const ESCALATION_SUMMARIES: Record<EscalationReason, string> = {
  human_token: "They asked for a person. A holding message went out, and they're waiting on you.",
  refusal: "AI wouldn't answer this one. A holding message went out.",
  brain_error: "AI couldn't answer and sent a holding message. They're waiting on a real answer.",
  non_text: "They sent a voice note or photo AI can't read. Open it and reply yourself.",
  send_failed: "The reply didn't reach them. As far as they know, nobody answered.",
  policy_block: "Your reply setting keeps every message for a person. Nothing was sent, so answer them yourself.",
  policy_ask:
    "Your setting hands bookings or service questions to a person. AI told them someone will follow up, and that someone is you.",
  person_hold: "You set AI to stay out of this person's conversations. Nothing was sent, so answer them yourself.",
  rate_cap: "AI hit its daily reply limit and stopped. Nothing was sent, and they're waiting.",
  deadman: "This sat unanswered long enough to flag. Nobody has replied.",
  manual: "Flagged by hand for a person.",
  opt_out: `${STOP_WORDS.said("They")}. Nothing was sent, and nothing may be.`,
  state_unavailable: "AI couldn't read this conversation, so it stayed quiet. No reply went out.",
  stale:
    "Hours passed between their message and any reply AI could send, so AI didn't answer. Nothing was sent, and they've been waiting since they wrote.",
  budget:
    "The daily AI limit is reached, so AI paused itself and sent nothing. Answer them yourself, or raise the limit in Settings › Autonomy.",
  callback:
    "They phoned and are still owed a call: the call didn't connect, they hung up without a word, or AI couldn't finish it.",
  paused:
    "The workspace is paused because billing stopped, so AI did not answer. Resume from Settings › Billing, or answer this one yourself.",
  carriers:
    "This text came in before texting was approved for your number, so AI didn't answer. Answer it yourself, or wait for the approval on Setup.",
  email_review: "They wrote by email. Nothing was sent: email is always yours to answer.",
  booking_request:
    "They picked a time the calendar shows open, and AI told them the team will confirm it. That's you: Booked it, or Can't and reply.",
  booking_reply: "They asked to book a time, and AI told them the team will confirm. Reply with a time that works.",
  wrote_while_held:
    "They wrote again while your team had this conversation, so AI stayed out and sent nothing. Answer them yourself, or hand it back.",
};

/** The label for a reason, or the reason's own words for one the set does not know: a row never reads as nothing. */
export function reasonLabelOf(reason: string): string {
  return entryOf(ESCALATION_REASON_LABELS, reason) ?? reason;
}

/** The operator's first sentence for a reason, or the label with "Needs a human." for one the set does not know. */
export function reasonSummaryOf(reason: string): string {
  return entryOf(ESCALATION_SUMMARIES, reason) ?? `${reasonLabelOf(reason)}. Needs a human.`;
}

/**
 * What a held thread owes, in the one line its reply dock opens with (the thread canvas, 1 Nov 2026): the thing to do or
 * the fact that matters, then whether anything reached them. The summary above is the whole of it, said under the line's
 * Why? on a press. The dock opened with the summary, a sentence of up to forty words over the reply box, and the flag in
 * the conversation said it again above it: "They wrote by email. Nothing was sent: a reply is drafted for you in Need you,
 * to change or send from here." on the thread that is that place. Never more than the summary says: a holding message is
 * named only where one went out, and a draft only where the reply box holds one (it says so itself).
 */
const ESCALATION_LINES: Record<EscalationReason, string> = {
  human_token: "They asked for a person · a holding message went out",
  refusal: "AI wouldn't answer this · a holding message went out",
  brain_error: "AI couldn't answer · a holding message went out",
  non_text: "They sent something AI can't read",
  send_failed: "The reply never reached them",
  policy_block: "Your reply setting kept it for you · nothing sent",
  policy_ask: "Set to ask you first · they were told someone will follow up",
  person_hold: "You answer this person · nothing sent",
  rate_cap: "The daily reply limit was reached · nothing sent",
  deadman: "Nobody has replied yet",
  manual: "Flagged by hand",
  opt_out: `${STOP_WORDS.said("They")} · nothing may be sent`,
  state_unavailable: "AI couldn't read this conversation · nothing sent",
  stale: "Too late for AI to answer · nothing sent",
  budget: "The daily AI limit is reached · nothing sent",
  callback: "They're owed a call back",
  paused: "The workspace is paused · nothing sent",
  carriers: "Texting isn't approved for this number yet · nothing sent",
  email_review: "They wrote by email · nothing sent",
  booking_request: "Confirm the time · they're waiting to hear",
  booking_reply: "They asked to book · reply with a time that works",
  wrote_while_held: "They wrote while your team had it · nothing sent",
};

/** The dock's line for a reason, or the reason's label for one the set does not know. */
export function reasonLineOf(reason: string): string {
  return entryOf(ESCALATION_LINES, reason) ?? reasonLabelOf(reason);
}

/**
 * A dock's line as the thread canvas draws it (1 Nov 2026): what is owed in the ink at 600, and the clause after its dash
 * in the muted ink ("Check the draft · nothing sent"). A line with no clause is all lead.
 */
export function dockLineOf(line: string): { lead: string; rest: string | null } {
  const at = line.indexOf(" · ");
  return at < 0 ? { lead: line, rest: null } : { lead: line.slice(0, at), rest: line.slice(at + 3) };
}

/**
 * What a person does about a hold, by its reason, beside the reason's words (decision 0048): write to the customer
 * (`reply`), ring them back (`call_back`), or nothing may be sent and the thread only goes back (`hand_back`: Done, or
 * Hand back, and no reply). Every page and notice that draws a hold reads the verb from here, so a customer who asked to
 * stop is not offered "Open and reply" under a thread whose reply box says nothing can be sent. The set is the database's
 * (schema-sets.ts), so a reason the CHECK gains without its act fails the package's typecheck.
 */
export type HoldAct = "reply" | "call_back" | "hand_back" | "confirm";

export const ESCALATION_ACTS: Record<EscalationReason, HoldAct> = {
  human_token: "reply",
  refusal: "reply",
  brain_error: "reply",
  non_text: "reply",
  send_failed: "reply",
  policy_block: "reply",
  policy_ask: "reply",
  person_hold: "reply",
  rate_cap: "reply",
  deadman: "reply",
  manual: "reply",
  opt_out: "hand_back",
  state_unavailable: "reply",
  stale: "reply",
  budget: "reply",
  callback: "call_back",
  paused: "reply",
  carriers: "reply",
  email_review: "reply",
  booking_request: "confirm",
  booking_reply: "reply",
  wrote_while_held: "reply",
};

/** The act of a reason; a reason the set does not know is answered, as a person is needed for it. */
export function holdActOf(reason: string | null | undefined): HoldAct {
  return entryOf(ESCALATION_ACTS, reason) ?? "reply";
}

/**
 * The most open holds of each half one read of them takes (GET escalations: those that wait on a person, and those that
 * wait on nobody). A page that read fewer waiting holds than this read them all.
 */
export const OPEN_HOLDS_READ_MAX = 100;

/**
 * The reasons whose hold waits on nobody (`hand_back`: a customer's STOP, which is news). A read of the open holds asks
 * for these apart from the rest, so a page of them never crowds out a hold that waits on a person (legacy STOP holds
 * were left open, 00409); the rest is read as waiting, so a reason added later is counted, as holdActOf counts it.
 */
export const HAND_BACK_REASONS: readonly EscalationReason[] = keysOf(ESCALATION_ACTS).filter(
  (r) => ESCALATION_ACTS[r] === "hand_back",
);

/**
 * The reasons whose hold waits on a person (waitsOnAPerson): what a person's answer settles. A reply typed in the
 * WhatsApp Business app resolves the open holds of these on its thread (00438 conversation_echo_settles), never a STOP.
 */
export const WAITING_REASONS: readonly EscalationReason[] = keysOf(ESCALATION_ACTS).filter((r) => waitsOnAPerson(r));

/** The act of the open hold a thread has, or null where it has none. */
export function openHoldAct(hold: { reason: string } | null | undefined): HoldAct | null {
  return hold ? holdActOf(hold.reason) : null;
}

/**
 * Whether a hold of this reason waits on a person: it has something to be done (`reply`, `call_back`). A customer who
 * asked to stop is news, told once on the bell (consent/opt-out-notice.ts), never a wait: nothing may be sent to them,
 * so the Inbox's Needs you, Today's queue, People's flag, the badge and the deadman all read this one answer. A hold that
 * was opened before the receptionist stopped opening them (an open `opt_out`) is read as no wait, without being written
 * over.
 */
export function waitsOnAPerson(reason: string | null | undefined): boolean {
  return holdActOf(reason) !== "hand_back";
}

/** An open hold as a rule is handed it: whether one is open, or the hold itself, whose reason says whether it waits. */
export type OpenHold = boolean | { reason?: string | null } | null | undefined;

/** Whether an open hold, as `OpenHold` gives it, waits on a person: none open does not, one of no known reason does. */
export function holdWaits(hold: OpenHold): boolean {
  if (!hold) return false;
  return hold === true ? true : waitsOnAPerson(hold.reason);
}

/**
 * The verb a hold's page or notice offers, per act: the Today row's button, the thread's own first button (null where
 * the act is to hand back: Done and Hand back are the thread's, and no reply is offered), and the clause a notice ends
 * with. One set of words for all three, as the reason has one set for its label.
 */
export const HOLD_ACT_WORDS: Record<HoldAct, { cta: string; take: string | null; notice: string; todo: string }> = {
  reply: { cta: "Open and reply", take: "I'll answer this", notice: "Reply from the Inbox.", todo: "Reply" },
  call_back: { cta: "Open the call", take: "Call back", notice: "Call them back.", todo: "Call back" },
  hand_back: { cta: "Open the conversation", take: null, notice: "Nothing can be sent to them.", todo: "Hand it back" },
  // A booking request (decision 0061): Booked it confirms it; Can't is its second button, and leaves the thread to a reply.
  confirm: { cta: "Booked it", take: "Booked it", notice: "Confirm it or say you can't.", todo: "Confirm a time" },
};

/** Where Ask's draft of the reply a hold asks for is ready (decision 0093): the row says so, and the dock too. */
export const DRAFTED_TODO = "Draft ready";
/** What a row asks where the thread was set aside as not a customer's (a sales pitch, a vendor, a newsletter). */
export const PITCH_TODO = "Not a customer?";

/**
 * What a hold asks of you, as the Inbox's row says it under what they said (the thread canvas's list, 1 Nov 2026: "Draft
 * ready", "Confirm a time", "Call back"), in the coral: the act's own word, and the draft where one is ready for the reply
 * box. Nothing with no hold to act on.
 */
export function holdToDoOf(act: HoldAct | null | undefined, drafted: boolean): string | null {
  if (!act) return null;
  return act === "reply" && drafted ? DRAFTED_TODO : HOLD_ACT_WORDS[act].todo;
}

/**
 * The holds on a thread you have taken that still ask something of you (Today in three zones, 2 Nov 2026): a reply of
 * yours that never reached them, and a customer who wrote again while you had the thread. The receptionist stays out of
 * a thread you hold, so nobody else will answer either. Today's queue and the Inbox's rule (thread-move.ts) both read it.
 */
export const YOURS_STILL_WAIT: ReadonlySet<string> = new Set(["send_failed", "wrote_while_held"]);

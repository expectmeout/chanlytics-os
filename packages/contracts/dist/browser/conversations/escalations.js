import { STOP_WORDS } from "../consent/consent.js";
export const ESCALATION_REASON_LABELS = {
  human_token: "Customer asked for a person",
  refusal: "Assistant declined to answer",
  brain_error: "The receptionist hit an error \u2014 a holding message went out",
  non_text: "Sent a voice note / photo",
  send_failed: "Reply failed to deliver",
  policy_block: "Held by your reply setting \u2014 nothing was sent",
  policy_ask: "Set to Ask me first \u2014 a person answers this one",
  person_hold: "You handle this person \u2014 the receptionist stays out",
  rate_cap: "Too many replies too fast \u2014 the receptionist paused itself",
  deadman: "Nobody picked this up \u2014 flagged after silence",
  manual: "Flagged manually",
  opt_out: STOP_WORDS.said(),
  state_unavailable: "The receptionist could not read this thread \u2014 needs a human",
  stale: "Arrived hours late \u2014 too old to answer automatically",
  budget: "The day's model budget is used up \u2014 the receptionist paused itself",
  callback: "Needs a call back \u2014 they phoned and are still owed a call",
  paused: "Held \u2014 the workspace is paused until billing resumes",
  carriers: "Held \u2014 the carriers have not approved this line for texting yet",
  email_review: "Wrote by email \u2014 a person answers",
  booking_request: "Asked to book a time \u2014 confirm it or say you can't",
  booking_reply: "Asked to book a time \u2014 reply to them",
  wrote_while_held: "Wrote again while your team had the thread \u2014 the receptionist stays out"
};
export const ESCALATION_REASON_SHORT = {
  human_token: "asked for a person",
  refusal: "the receptionist declined to answer",
  brain_error: "the receptionist hit an error",
  non_text: "sent a voice note or photo",
  send_failed: "reply failed to deliver",
  policy_block: "held by your reply setting",
  policy_ask: "set to Ask me first",
  person_hold: "you handle this person",
  rate_cap: "too many replies too fast",
  deadman: "nobody picked this up",
  manual: "flagged by hand",
  opt_out: STOP_WORDS.short,
  state_unavailable: "the receptionist could not read this thread",
  stale: "arrived hours late",
  budget: "the day's model budget is used up",
  callback: "needs a call back",
  paused: "the workspace is paused until billing resumes",
  carriers: "the carriers have not approved this line",
  email_review: "wrote by email",
  booking_request: "asked to book a time",
  booking_reply: "asked to book a time",
  wrote_while_held: "wrote while your team had the thread"
};
export function reasonShort(reason) {
  if (!reason) return "";
  return ESCALATION_REASON_SHORT[reason] ?? reason.replace(/_/g, " ");
}
const ESCALATION_REASON_WHY = {
  human_token: "because a customer asked for a person",
  refusal: "because it declined to answer",
  brain_error: "because it hit an error",
  non_text: "for something it can't read",
  send_failed: "because a reply failed to send",
  policy_block: "because your reply setting held it",
  policy_ask: "for a booking or a question set to Ask me first",
  person_hold: "because you handle this person",
  rate_cap: "because the reply limit was reached",
  deadman: "because no answer came in time",
  manual: "because it was flagged by hand",
  opt_out: `because they ${STOP_WORDS.short}`,
  state_unavailable: "because it could not read the thread",
  stale: "because a message arrived too late to answer",
  budget: "because the day's model budget ran out",
  callback: "because they need a call back",
  paused: "because the workspace is paused",
  carriers: "while waiting on carriers",
  email_review: "because they wrote by email",
  booking_request: "because they asked to book a time",
  booking_reply: "because they asked to book a time",
  wrote_while_held: "because they wrote while your team had the thread"
};
export function reasonWhy(reason) {
  return ESCALATION_REASON_WHY[reason] ?? `because ${reasonShort(reason)}`;
}
export const ESCALATION_SUMMARIES = {
  human_token: "They asked for a person. A holding message went out \u2014 they're waiting on you.",
  refusal: "The receptionist wouldn't answer this one. A holding message went out.",
  brain_error: "The receptionist errored and sent a holding message. They're waiting on a real answer.",
  non_text: "They sent a voice note or photo the receptionist can't read. Open it and reply yourself.",
  send_failed: "The reply never reached them \u2014 as far as the customer knows, nobody answered.",
  policy_block: "Your reply setting holds every message for a person. Nothing was sent \u2014 answer them yourself.",
  policy_ask: "Your Autonomy setting hands bookings or service questions to a person. The receptionist told them someone will follow up \u2014 that someone is you.",
  person_hold: "You set the receptionist to stay out of this person's thread. Nothing was sent \u2014 answer them yourself.",
  rate_cap: "The receptionist hit its daily reply limit and stopped. Nothing was sent \u2014 they're waiting in silence.",
  deadman: "This sat unanswered long enough to flag. Nobody has replied.",
  manual: "Flagged by hand for a human.",
  opt_out: `${STOP_WORDS.said("They")}. Nothing was sent, and nothing may be.`,
  state_unavailable: "The receptionist couldn't read this thread, so it stayed quiet. No reply went out.",
  stale: "This reached us hours after they sent it, too late to answer automatically. Nothing was sent \u2014 they have been waiting since then.",
  budget: "The day's model budget is used up, so the receptionist paused itself. Nothing was sent \u2014 answer them yourself, or raise the budget under Settings \u203A Autonomy.",
  callback: "They phoned and are still owed a call: the call didn't connect, they hung up without a word, or the receptionist couldn't finish it.",
  paused: "The workspace is paused because billing stopped, so the receptionist did not answer. Resume from Settings \u203A Billing, or answer this one yourself.",
  carriers: "This text arrived before the carriers approved your line for texting, so the receptionist did not answer. Answer it yourself, or wait for the approval on Setup.",
  email_review: "They wrote by email. The receptionist does not answer email yet, so nothing was sent. Read it and reply from here.",
  booking_request: "They picked a time the calendar shows open, and the receptionist told them the team will confirm it. That's you: Booked it, or Can't and reply.",
  booking_reply: "They asked to book a time, and the receptionist told them the team will confirm. Reply with a time that works.",
  wrote_while_held: "They wrote again while your team had this thread, so the receptionist stayed out. Nothing was sent \u2014 answer them yourself, or hand the thread back."
};
export function reasonLabelOf(reason) {
  return ESCALATION_REASON_LABELS[reason] ?? reason;
}
export function reasonSummaryOf(reason) {
  return ESCALATION_SUMMARIES[reason] ?? `${reasonLabelOf(reason)}. Needs a human.`;
}
export const ESCALATION_ACTS = {
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
  wrote_while_held: "reply"
};
export function holdActOf(reason) {
  return ESCALATION_ACTS[reason ?? ""] ?? "reply";
}
export const OPEN_HOLDS_READ_MAX = 100;
export const HAND_BACK_REASONS = Object.keys(ESCALATION_ACTS).filter((r) => ESCALATION_ACTS[r] === "hand_back");
export const WAITING_REASONS = Object.keys(ESCALATION_ACTS).filter(
  (r) => waitsOnAPerson(r)
);
export function openHoldAct(hold) {
  return hold ? holdActOf(hold.reason) : null;
}
export function waitsOnAPerson(reason) {
  return holdActOf(reason) !== "hand_back";
}
export function holdWaits(hold) {
  if (!hold) return false;
  return hold === true ? true : waitsOnAPerson(hold.reason);
}
export const HOLD_ACT_WORDS = {
  reply: { cta: "Open and reply", take: "I'll answer this", notice: "Reply from the Inbox." },
  call_back: { cta: "Open the call", take: "Call back", notice: "Call them back." },
  hand_back: { cta: "Open the thread", take: null, notice: "Nothing can be sent to them." },
  // A booking request (decision 0061): Booked it confirms it; Can't is its second button, and leaves the thread to a reply.
  confirm: { cta: "Booked it", take: "Booked it", notice: "Confirm it or say you can't." }
};

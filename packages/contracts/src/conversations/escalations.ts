/**
 * Why a person is needed on a thread: the escalation as the wire gives it, and the ONE vocabulary for each reason --
 * its label for a row (a sentence), its clause for a chip or "Escalated · …" (the label's own words, lower-cased),
 * and the sentence the operator reads first. The Inbox, Today, Reports, People and the person page all read them
 * here. Reports said "Flagged by you" and "Memory was unavailable" where the Inbox said "Flagged manually" and
 * "The receptionist could not read this thread" (the 2 Oct 2026 audit): a second map in people/person-row-facts.ts
 * had become a second vocabulary for one closed set. The set is the database's (schema-sets.ts), so a reason the
 * CHECK gains without its three forms fails the package's typecheck.
 */
import type { EscalationReason } from "../shared/enums";

export interface EscalationDto {
  id: string;
  reason: string;
  details: string | null;
  state: "open" | "resolved";
  created_at: string;
}

// These labels headline a row on Today, where there is no thread open beside
// them to supply context — so each one says what happened AND what it means,
// in the operator's words rather than the system's.
export const ESCALATION_REASON_LABELS: Record<EscalationReason, string> = {
  human_token: "Customer asked for a person",
  refusal: "Assistant declined to answer",
  brain_error: "The receptionist hit an error — a holding message went out",
  non_text: "Sent a voice note / photo",
  send_failed: "Reply failed to deliver",
  policy_block: "Held by your reply setting — nothing was sent",
  policy_ask: "Set to Ask me first — a person answers this one",
  person_hold: "You handle this person — the receptionist stays out",
  rate_cap: "Too many replies too fast — the receptionist paused itself",
  deadman: "Nobody picked this up — flagged after silence",
  manual: "Flagged manually",
  opt_out: "Asked to stop receiving messages",
  state_unavailable: "The receptionist could not read this thread — needs a human",
  stale: "Arrived hours late — too old to answer automatically",
  budget: "The day's model budget is used up — the receptionist paused itself",
  callback: "Needs a call back — the phone receptionist could not finish it",
  paused: "Held — the workspace is paused until billing resumes",
  carriers: "Held — the carriers have not approved this line for texting yet",
  email_review: "Wrote by email — a person answers",
};

/**
 * The same reason as a clause: what follows "Escalated · " on a People row, a Today queue row's status, a Reports
 * bar and the person page's timeline. The label's own words, never a second vocabulary: a reader who learns
 * "Flagged manually" in the Inbox must find "flagged by hand", not "flagged by you", on Reports.
 */
export const ESCALATION_REASON_SHORT: Record<EscalationReason, string> = {
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
  opt_out: "asked to stop",
  state_unavailable: "the receptionist could not read this thread",
  stale: "arrived hours late",
  budget: "the day's model budget is used up",
  callback: "needs a call back",
  paused: "the workspace is paused until billing resumes",
  carriers: "the carriers have not approved this line",
  email_review: "wrote by email",
};

/** The clause for a reason, or the reason's own words for one the set does not know; nothing for none. */
export function reasonShort(reason: string | null | undefined): string {
  if (!reason) return "";
  return (ESCALATION_REASON_SHORT as Record<string, string>)[reason] ?? reason.replace(/_/g, " ");
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
  human_token: "They asked for a person. A holding message went out — they're waiting on you.",
  refusal: "The receptionist wouldn't answer this one. A holding message went out.",
  brain_error: "The receptionist errored and sent a holding message. They're waiting on a real answer.",
  non_text: "They sent a voice note or photo the receptionist can't read. Open it and reply yourself.",
  send_failed: "The reply never reached them — as far as the customer knows, nobody answered.",
  policy_block: "Your reply setting holds every message for a person. Nothing was sent — answer them yourself.",
  policy_ask:
    "Your Autonomy setting hands bookings or service questions to a person. The receptionist told them someone will follow up — that someone is you.",
  person_hold: "You set the receptionist to stay out of this person's thread. Nothing was sent — answer them yourself.",
  rate_cap: "The receptionist hit its daily reply limit and stopped. NOTHING was sent — they're waiting in silence.",
  deadman: "This sat unanswered long enough to flag. Nobody has replied.",
  manual: "Flagged by hand for a human.",
  opt_out: "They asked to stop receiving messages. Nothing was sent, and nothing may be.",
  state_unavailable: "The receptionist couldn't read this thread, so it stayed quiet. No reply went out.",
  stale:
    "This reached us hours after they sent it, too late to answer automatically. NOTHING was sent — they have been waiting since.",
  budget:
    "The day's model budget is used up, so the receptionist paused itself. NOTHING was sent — answer them yourself, or raise the budget under Settings › Autonomy.",
  callback: "They phoned and the receptionist couldn't finish it.",
  paused:
    "The workspace is paused because billing stopped, so the receptionist did not answer. Resume from Settings › Billing, or answer this one yourself.",
  carriers:
    "This text arrived before the carriers approved your line for texting, so the receptionist did not answer. Answer it yourself, or wait for the approval on Setup.",
  email_review:
    "They wrote by email. The receptionist does not answer email yet, so nothing was sent. Read it and reply from here.",
};

/** The label for a reason, or the reason's own words for one the set does not know: a row never reads as nothing. */
export function reasonLabelOf(reason: string): string {
  return (ESCALATION_REASON_LABELS as Record<string, string>)[reason] ?? reason;
}

/** The operator's first sentence for a reason, or the label with "Needs a human." for one the set does not know. */
export function reasonSummaryOf(reason: string): string {
  return (ESCALATION_SUMMARIES as Record<string, string>)[reason] ?? `${reasonLabelOf(reason)}. Needs a human.`;
}

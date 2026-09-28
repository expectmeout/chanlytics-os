/**
 * Why a person is needed on a thread: the escalation as the wire gives it, each reason's label for a row, and
 * the sentence the operator reads first. The Inbox's thread (inbox-thread.ts) and Today read them here.
 */

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
export const ESCALATION_REASON_LABELS: Record<string, string> = {
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
export const ESCALATION_SUMMARIES: Record<string, string> = {
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
  callback: "They phoned and the receptionist couldn't finish it.",
  paused:
    "The workspace is paused because billing stopped, so the receptionist did not answer. Resume from Settings › Billing, or answer this one yourself.",
  carriers:
    "This text arrived before the carriers approved your line for texting, so the receptionist did not answer. Answer it yourself, or wait for the approval on Setup.",
  email_review:
    "They wrote by email. The receptionist does not answer email yet, so nothing was sent. Read it and reply from here.",
};

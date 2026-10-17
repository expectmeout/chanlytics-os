export const DEAL_STAGES = ["proposed", "won", "lost", "ended"];
export const DEAL_PERS = ["once", "month", "year"];
export const DEAL_SOURCES = ["person", "payment"];
export const DEAL_LOST_REASONS = ["price", "timing", "elsewhere", "no_reply", "not_a_fit", "other"];
export const DEAL_LOST_REASON_WORDS = {
  price: "Price",
  timing: "Timing",
  elsewhere: "Went elsewhere",
  no_reply: "No reply",
  not_a_fit: "Not a fit",
  other: "Other"
};
export const DEAL_STAGE_WORDS = {
  proposed: "Proposal out",
  won: "Client",
  lost: "Passed",
  ended: "Ended"
};
export const DEAL_PER_WORDS = { once: "once", month: "a month", year: "a year" };
export const DEAL_LINE_NONE = "No proposal yet";
export function isDealStage(s) {
  return typeof s === "string" && DEAL_STAGES.includes(s);
}
export function isDealLostReason(s) {
  return typeof s === "string" && DEAL_LOST_REASONS.includes(s);
}
export function isDealPer(s) {
  return typeof s === "string" && DEAL_PERS.includes(s);
}
export const DEAL_CLEARABLE = ["proposal_url", "valid_until", "amount", "note"];
export const DEAL_ACT_WORDS = {
  propose: "Start a proposal",
  again: "Propose again",
  edit: "Edit proposal",
  won: "Mark as client",
  lost: "Mark as passed",
  ended: "End the engagement",
  send: "Send proposal",
  "follow-up": "Follow up"
};
export const DEAL_REFUSALS = {
  not_found: "Person not found.",
  bad_stage: "That is not a stage a deal can be in.",
  bad_per: "An amount is once, a month or a year.",
  bad_amount: "An amount cannot be negative.",
  note_too_long: "A note is at most 200 characters.",
  service_too_long: "A service name is at most 80 characters.",
  bad_move: "A new deal starts with a proposal.",
  already_open: "They already have a proposal out or an engagement running for this service.",
  moved: "Someone changed this deal since you opened it. Reload and try again.",
  ended: "An ended engagement is not reopened: record a new proposal.",
  bad_link: "That is not a web address.",
  bad_reason: "A reason for passing is price, timing, went elsewhere, no reply, not a fit or other.",
  bad_clear: "Only the link, the valid-until day, the amount or the note can be emptied."
};

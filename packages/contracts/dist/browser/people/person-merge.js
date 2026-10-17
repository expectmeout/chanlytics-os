export const MERGE_CONSENT_SOURCE = "merge";
export const MERGE_REFUSALS = {
  same: "Choose two different records to merge.",
  owner: "Only an owner can merge two records.",
  deleted: "One of these people was deleted, so there is nothing to merge.",
  merged: "One of these records was already merged into another.",
  phones: "These two records have different phone numbers, so they may be two people. They can't be merged.",
  emails: "These two records have different email addresses, so they may be two people. They can't be merged.",
  deals: "Both records have an open deal for the same service. Close or move one of them first."
};
export const MERGE_ANSWERS = "Their answers about messages and offers become the more careful of the two.";
export const MERGE_WORDS = {
  act: "Merge with another record\u2026",
  actHint: "Two records of one person become one",
  pick: "Which record is the same person?",
  pickPlaceholder: "Search by name, number or email",
  pickEmpty: "Nobody else matches",
  pickNone: "Choose the other record",
  pickReading: "People is still being read; the other records are offered once it lands.",
  question: (kept, other) => `Merge ${other} into ${kept}?`,
  detail: (kept, other) => `${kept} keeps their record and takes ${other}'s messages, calls, deals, notes and lists. ${MERGE_ANSWERS} ${other}'s record stays as a merged record with no number or address. This cannot be undone.`,
  /**
   * The sheet's own: what moves and that it cannot be undone, said first in two lines, and the rest of `detail` folded
   * under `more` (the fitted sheets, 14 Oct 2026: seven lines stood between the pick and the name typed).
   */
  lead: (kept, other) => `${other}'s messages, calls, deals, notes and lists move to ${kept}. This cannot be undone.`,
  more: "What else changes",
  rest: (other) => `${MERGE_ANSWERS} ${other}'s record stays as a merged record with no number or address.`,
  typed: (kept) => `Type ${kept} to confirm.`,
  yes: "Merge the two records",
  busy: "Merging\u2026",
  done: (kept, other) => `${other} merged into ${kept}`
};
function offersAnswer(a, b, stopped) {
  if (a === "opted_out" || b === "opted_out") return "opted_out";
  if (stopped) return "unknown";
  return a === "opted_in" || b === "opted_in" ? "opted_in" : "unknown";
}
export function mergedAnswers(a, b) {
  const stopped = a.consent === "opted_out" || a.dnc || b.consent === "opted_out" || b.dnc;
  return {
    consent: stopped ? "opted_out" : a.consent === "opted_in" || b.consent === "opted_in" ? "opted_in" : "unknown",
    dnc: stopped,
    marketing: offersAnswer(a.marketing, b.marketing, stopped),
    emailMarketing: offersAnswer(a.emailMarketing, b.emailMarketing, stopped)
  };
}

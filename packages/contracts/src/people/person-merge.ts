/**
 * Two records of one person become one (decision 0028; the 4 Oct wiring review's P1 5 and D5).
 *
 * The act is the database's (`merge_people`, 00325): one owner-only door, one transaction, never undone. This module
 * holds what the door and the app must say the same way:
 *
 *   - the sentences the door refuses with (MERGE_REFUSALS), which the route carries back as they are;
 *   - the rule for what the merged person has answered (mergedAnswers), which the door applies in SQL. One rule, two
 *     spellings, held equal case by case on a real database by tooling/scripts/tests/people/merge/merge-people.db.test.mjs;
 *   - the source a consent answer carries in the ledger when the merge changed it.
 *
 * THE RULE (D5): the most careful answer wins on each question. A stop on either record is a stop for the person: a
 * person who told one number to stop did not agree to hear from the other. A no to offers wins, and so does an
 * unsubscribe. A yes survives only where neither said no and the person is not stopped; a yes that ends there ends as
 * a stop ends one (00323): back to not asked, never a no the person did not say.
 */

/** How an answer was given, in the ledger, when it is the merge that changed it on the kept record. */
export const MERGE_CONSENT_SOURCE = "merge";

/** What the door refuses, in the words the owner reads. The door raises exactly these (00325). */
export const MERGE_REFUSALS = {
  same: "Choose two different records to merge.",
  owner: "Only an owner can merge two records.",
  deleted: "One of these people was deleted, so there is nothing to merge.",
  merged: "One of these records was already merged into another.",
  phones: "These two records have different phone numbers, so they may be two people. They can't be merged.",
  emails: "These two records have different email addresses, so they may be two people. They can't be merged.",
  deals: "Both records have an open deal for the same service. Close or move one of them first.",
} as const;

/**
 * The page's words for the act (decision 0028, step 3): the menu entry, the sheet that names the two records, and the
 * typed confirmation, which asks for the kept person's name as Delete does. `question`, `detail` and `yes` take the
 * names so the sheet says who is kept and who is merged in, never "this record" and "that one".
 */
export const MERGE_WORDS = {
  act: "Merge with another record…",
  actHint: "Two records of one person become one",
  pick: "Which record is the same person?",
  pickPlaceholder: "Search by name, number or email",
  pickEmpty: "Nobody else matches",
  pickNone: "Choose the other record",
  question: (kept: string, other: string) => `Merge ${other} into ${kept}?`,
  detail: (kept: string, other: string) =>
    `${kept} keeps their record and takes ${other}'s messages, calls, deals, notes and lists. Their answers about messages and offers become the more careful of the two. ${other}'s record stays as a merged record with no number or address. This cannot be undone.`,
  typed: (kept: string) => `Type ${kept} to confirm.`,
  yes: "Merge the two records",
  busy: "Merging…",
  done: (kept: string, other: string) => `${other} merged into ${kept}`,
} as const;

type Answer = "unknown" | "opted_in" | "opted_out";

/** What one record has answered: the three questions, and the block a stop sets. */
export interface RecordAnswers {
  /** Messages about their own visit (contacts.consent). */
  consent: string;
  /** Do-not-contact (contacts.dnc): set with a stop. */
  dnc: boolean;
  /** Offers (contacts.marketing_consent). */
  marketing: string;
  /** Offers by email (contacts.email_marketing). */
  emailMarketing: string;
}

/** What the merged person has answered. */
export interface MergedAnswers {
  consent: Answer;
  dnc: boolean;
  marketing: Answer;
  emailMarketing: Answer;
}

/** One question about offers: a no on either wins, then a stop ends a yes, then a yes on either stands. */
function offersAnswer(a: string, b: string, stopped: boolean): Answer {
  if (a === "opted_out" || b === "opted_out") return "opted_out";
  if (stopped) return "unknown";
  return a === "opted_in" || b === "opted_in" ? "opted_in" : "unknown";
}

/** The most careful answer on each question (D5). Symmetric: which record is kept does not change an answer. */
export function mergedAnswers(a: RecordAnswers, b: RecordAnswers): MergedAnswers {
  const stopped = a.consent === "opted_out" || a.dnc || b.consent === "opted_out" || b.dnc;
  return {
    consent: stopped ? "opted_out" : a.consent === "opted_in" || b.consent === "opted_in" ? "opted_in" : "unknown",
    dnc: stopped,
    marketing: offersAnswer(a.marketing, b.marketing, stopped),
    emailMarketing: offersAnswer(a.emailMarketing, b.emailMarketing, stopped),
  };
}

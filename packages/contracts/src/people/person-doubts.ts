/**
 * A doubt: two records one identity could belong to (decision 0034, step 4; 00344 person_doubts).
 *
 * The door that resolves a person (resolve_person) never merges on its own. When an arrival's name, number or address
 * names another living record that 0028's door could join with this one (no two numbers, no two addresses: those are
 * two people by rule), it writes the pair on person_doubts, once, and the person's page shows it: "Same person as …?"
 * with the two settlements. Merge is 0028's own flow, the other record chosen already; Not the same settles the pair
 * through person_doubt_dismiss, and the next arrival never raises it again. The value itself is never kept, only which
 * of the three it was.
 */

/** Which identity either record could own, as the door saw it (person_doubts.seen). */
export const DOUBT_SEEN = ["name", "phone", "email"] as const;
export type DoubtSeen = (typeof DOUBT_SEEN)[number];

/** How a doubt was settled (person_doubts.settled_as): by the merge, or by a member saying they are not the same. */
export const DOUBT_SETTLED_AS = ["merged", "not_the_same"] as const;
export type DoubtSettledAs = (typeof DOUBT_SETTLED_AS)[number];

/** One open doubt on a person's page: the other record, read as People reads a row, and what was seen. */
export interface PersonDoubtDto {
  id: string;
  seen: DoubtSeen;
  created_at: string;
  other: {
    id: string;
    display_name: string | null;
    wa_profile_name: string | null;
    phone_e164: string | null;
    email: string | null;
  };
}

/** The page's words: the row's sentence, by what was seen, and the two settlements. */
export const DOUBT_WORDS = {
  heading: "Same person?",
  seen: {
    name: (other: string) => `${other} has the same name. One person, or two?`,
    phone: (other: string) => `${other} has the number this record was reached on. One person, or two?`,
    email: (other: string) => `${other} has the address this record was reached on. One person, or two?`,
  } satisfies Record<DoubtSeen, (other: string) => string>,
  merge: "Merge",
  mergeHint: "Two records of one person become one (the owner's act)",
  apart: "Not the same",
  apartHint: "Keep both records; this pair is not asked about again",
  apartBusy: "Keeping both…",
  apartDone: (other: string) => `Kept apart from ${other}`,
  apartFailed: "Could not settle this pair.",
  notFound: "This doubt is not on this person.",
} as const;

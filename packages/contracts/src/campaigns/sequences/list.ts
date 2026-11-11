/**
 * What the Sequences list's row says at its right, as Pipeline's Select, Sort and Export stand at its bar's end (Ruben, 21 Oct
 * 2026, for parity): Type, which keeps one type of sequence, its name standing in the word once one is picked, and Sort, how
 * each group's rows are ordered. The views at the row's left are SEQUENCE_WORDS.views and the list's own groups. And what
 * needs you in a sequence, counted (needsCount), which the list and Ask count by, and the order Needs you lists it in
 * (byLongestWait); its words are words/row-line.ts's.
 */
import { plural } from "../../shared/words";
import type { SequenceNeedsDto, SequenceRowDto } from "./dto";

export const SEQUENCE_LIST_WORDS = {
  types: {
    label: "Type",
    all: "All types",
    // The groups' own names (SEQUENCE_WORDS.groups), one set of names (decision 0126).
    customers: "Your customers",
    leads: "Cold email",
    once: "One-off sends",
  },
  sorts: {
    label: "Sort",
    newest: "Newest first",
    sent: "Last sent",
    people: "Most people in it",
    name: "Name, A to Z",
    /** Under the Sort menu's choices: Needs you keeps its own order (byLongestWait). */
    needsFirst: "Needs you always lists the longest wait first.",
  },
} as const;

/**
 * What type a sequence is, as the list's Type filter says it: a one-off (once, on a date), cold email (to leads), or a
 * sequence to your customers (at a moment, or as someone joins a list).
 */
export const SEQUENCE_TYPES = ["customers", "leads", "once"] as const;
export type SequenceType = (typeof SEQUENCE_TYPES)[number];

export const sequenceTypeOf = (row: Pick<SequenceRowDto, "starts">): SequenceType =>
  row.starts === "date" ? "once" : row.starts === "leads" ? "leads" : "customers";

/** How the list orders the rows of each group: newest made (as the list is read), last sent, most people in it, by name. */
export const SEQUENCE_SORTS = ["newest", "sent", "people", "name"] as const;
export type SequenceSort = (typeof SEQUENCE_SORTS)[number];

/**
 * The rows in a sort's order, a copy: the newest made first (as the list is read, by its day made), the one sent most
 * recently first (one never sent last), the most people in it first, or by name. Ties keep the order they came in.
 */
export function sortedSequences<R extends Pick<SequenceRowDto, "name" | "created_at" | "last" | "in_it">>(
  rows: readonly R[],
  sort: SequenceSort,
): R[] {
  const by: Record<SequenceSort, (a: R, b: R) => number> = {
    newest: (a, b) => b.created_at.localeCompare(a.created_at),
    sent: (a, b) => (b.last?.at ?? "").localeCompare(a.last?.at ?? ""),
    people: (a, b) => b.in_it - a.in_it,
    name: (a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
  };
  return [...rows].sort(by[sort]);
}

/** When what needs you in a sequence began to wait: the oldest thing it holds, or a failed one-off's day; null for a twin. */
function waitedSinceMs(row: Pick<SequenceRowDto, "needs" | "starts" | "date">): number | null {
  if (row.needs.oldest_at) return Date.parse(row.needs.oldest_at);
  if (row.starts === "date" && row.date?.state === "failed") return Date.parse(row.date.at);
  return null;
}

/**
 * Needs you's order (decision 0126): the longest wait first, whatever Sort says, and a row with no age (a twin) after
 * those with one. Ties keep the order they came in, so the rest follow Sort.
 */
export function byLongestWait(
  one: Pick<SequenceRowDto, "needs" | "starts" | "date">,
  other: Pick<SequenceRowDto, "needs" | "starts" | "date">,
): number {
  const x = waitedSinceMs(one);
  const y = waitedSinceMs(other);
  if (x === y) return 0;
  if (x === null) return 1;
  if (y === null) return -1;
  return x - y;
}

/** Whether a row holds the words searched for: its name, or the lead search or list it takes people from, in any case. */
export function sequenceMatches(row: Pick<SequenceRowDto, "name" | "first">, words: string): boolean {
  const query = words.trim().toLowerCase();
  if (query === "") return true;
  const first = row.first;
  return [row.name, first?.search_name, first?.source_name, first?.list_name].some((name) =>
    (name ?? "").toLowerCase().includes(query),
  );
}

/**
 * Whether an OK to a batch to leads would send nothing: none of its emails ready, and the check holding some. What waits
 * on the owner is each held email, decided on its own, so nothing asks for the OK: the sequence's notice and count
 * (okSendsNothing), and Ask's card for the batch.
 */
export function batchOkSendsNothing(ready: number, held: number): boolean {
  return ready === 0 && held > 0;
}

/** What the check holds, as a sentence: "7 emails are held by the check". */
export const heldByCheckWords = (held: number): string => `${plural(held, "email is", "emails are")} held by the check`;

/**
 * Whether an OK would send nothing: every batch waiting is one to leads, counted as its emails ready (the server's
 * withReadyCounts), and batchOkSendsNothing over them. What waits on the owner is what is held, so it is said as that
 * (31 Oct 2026: Brooklyn's batch said "The next batch waits for your OK" over Approve with all 7 held, and an OK sent
 * nothing). A batch with nobody named yet, being planned, still waits for an OK.
 */
export function okSendsNothing(sequenceNeeds: SequenceNeedsDto): boolean {
  const toLeads =
    sequenceNeeds.batches.length > 0 && sequenceNeeds.batches.every((b) => b.audience?.kind === "reach_out");
  const ready = sequenceNeeds.batches.reduce((sum, b) => sum + b.people, 0);
  return toLeads && batchOkSendsNothing(ready, sequenceNeeds.held);
}

/** How many of a sequence's people or emails wait for you: the one count the list, the badge, Today and Ask say. */
export function needsCount(sequenceNeeds: SequenceNeedsDto): number {
  const batches =
    sequenceNeeds.waiting > 0 && sequenceNeeds.waiting_people === 0 && !okSendsNothing(sequenceNeeds)
      ? sequenceNeeds.waiting
      : 0;
  return sequenceNeeds.waiting_people + sequenceNeeds.held + sequenceNeeds.to_send + sequenceNeeds.replies + batches;
}

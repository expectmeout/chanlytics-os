/**
 * What the Sequences list's row says at its right, as Pipeline's Select, Sort and Export stand at its bar's end (Ruben, 21 Oct
 * 2026, for parity): Type, which keeps one type of sequence, its name standing in the word once one is picked, and Sort, how
 * each group's rows are ordered. The views at the row's left are SEQUENCE_WORDS.views and the list's own groups. And what
 * needs you in a sequence, its count and its line, which the row, the badge, Today and Ask say.
 */
import { plural } from "../shared/words";
import type { SequenceNeedsDto, SequenceRowDto } from "./sequence-dto";

export const SEQUENCE_LIST_WORDS = {
  types: {
    label: "Type",
    all: "All types",
    customers: "Sequences",
    leads: "Cold email",
    once: "One-off sends",
  },
  sorts: {
    label: "Sort",
    newest: "Newest first",
    sent: "Last sent",
    people: "Most people in it",
    name: "Name, A to Z",
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
export function okSendsNothing(n: SequenceNeedsDto): boolean {
  const toLeads = n.batches.length > 0 && n.batches.every((b) => b.audience?.kind === "reach_out");
  const ready = n.batches.reduce((sum, b) => sum + b.people, 0);
  return toLeads && batchOkSendsNothing(ready, n.held);
}

/** How many of a sequence's people or emails wait for you: the one count the list, the badge, Today and Ask say. */
export function needsCount(n: SequenceNeedsDto): number {
  const batches = n.waiting > 0 && n.waiting_people === 0 && !okSendsNothing(n) ? n.waiting : 0;
  return n.waiting_people + n.held + n.to_send + n.replies + batches;
}

/** What needs you in a sequence, in a few words: "14 wait for your OK · 3 held · 2 wrote back". Empty when nothing does. */
export function needsWords(n: SequenceNeedsDto): string {
  const parts: string[] = [];
  if (n.waiting_people > 0) parts.push(`${n.waiting_people} wait for your OK`);
  else if (n.waiting > 0 && !okSendsNothing(n)) parts.push("waits for your OK");
  if (n.held > 0) parts.push(`${n.held} held`);
  if (n.to_send > 0) parts.push(`${n.to_send} for you to send`);
  if (n.replies > 0) parts.push(`${plural(n.replies, "wrote back", "wrote back")} · answer them`);
  return parts.join(" · ");
}

/**
 * What the Sequences list's row says at its right, as Pipeline's Select, Sort and Export stand at its bar's end (Ruben, 21 Oct
 * 2026, for parity): Type, which keeps one type of sequence, its name standing in the word once one is picked, and Sort, how
 * each group's rows are ordered. The views at the row's left are SEQUENCE_WORDS.views and the list's own groups.
 */
import type { SequenceRowDto } from "./sequence-dto";

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

/**
 * What the Sequences list's row says at its right, as Pipeline's Select, Sort and Export stand at its bar's end (Ruben, 21 Oct
 * 2026, for parity): Type, which keeps one type of sequence, its name standing in the word once one is picked, and Sort, how
 * each group's rows are ordered. The views at the row's left are SEQUENCE_WORDS.views and the list's own groups. And what
 * needs you in a sequence, counted (needsCount), which the list and Ask count by, and the order Needs you lists it in
 * (byLongestWait); its words are words/row-line.ts's.
 */
import { plural } from "../../shared/words";
import type { CampaignMessage } from "../templates/campaign-message";
import type { SequenceNeedsDto, SequenceRowDto } from "./dto";
import { MESSAGE_OFF_WORDS } from "./words/stopped-message";
import { sequenceStuckOf } from "./run-off";

export const SEQUENCE_LIST_WORDS = {
  types: {
    label: "Type",
    all: "All types",
    // The groups' own names (SEQUENCE_WORDS.groups), one set of names (decision 0128).
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

/** What of a row says how long it has needed you. */
type WaitingRow = Pick<
  SequenceRowDto,
  "needs" | "starts" | "state" | "date" | "stuck" | "last_run_off" | "last_run_for"
>;

/**
 * When what needs you in a sequence began to wait: the oldest thing it holds, else since when it has been stuck (its
 * leads, or its last run's day), or a failed one-off's day; null for a twin, and for a run whose day is not known.
 */
function waitedSinceMs(row: WaitingRow): number | null {
  if (row.needs.oldest_at) return Date.parse(row.needs.oldest_at);
  const stuck = sequenceStuckOf(row);
  if (stuck) return stuck.sinceMs;
  if (row.starts === "date" && row.date?.state === "failed") return Date.parse(row.date.at);
  return null;
}

/**
 * Needs you's order (decision 0128): the longest wait first, whatever Sort says, and a row with no age (a twin) after
 * those with one. Ties keep the order they came in, so the rest follow Sort.
 */
export function byLongestWait(one: WaitingRow, other: WaitingRow): number {
  const x = waitedSinceMs(one);
  const y = waitedSinceMs(other);
  if (x === y) return 0;
  if (x === null) return 1;
  if (y === null) return -1;
  return x - y;
}

/**
 * The step of a sequence whose message holds the words searched for, by its title as people read it (`titleOf`, the
 * messages' own: "A short nudge") or its name, the first by place; null where none does (Campaigns, one tab, call C7).
 */
export function sequenceMessageFound(
  row: Pick<SequenceRowDto, "messages">,
  words: string,
  titleOf: (name: string) => string | null,
): { place: number; title: string } | null {
  const query = words.trim().toLowerCase();
  if (query === "") return null;
  for (const m of row.messages ?? []) {
    const title = titleOf(m.name) ?? m.name;
    if (title.toLowerCase().includes(query) || m.name.toLowerCase().includes(query)) return { place: m.place, title };
  }
  return null;
}

/** What a row found by its message says in place of its line: the step, and the message's title ("Step 2 · A short nudge"). */
export const messageFoundLine = (found: { place: number; title: string }): string =>
  `Step ${found.place} · ${found.title}`;

/**
 * Whether a row holds the words searched for: its name, or the lead search or list it takes people from, in any case,
 * or a message one of its steps sends, where the titles are given (sequenceMessageFound).
 */
export function sequenceMatches(
  row: Pick<SequenceRowDto, "name" | "first" | "messages">,
  words: string,
  titleOf: ((name: string) => string | null) | null = null,
): boolean {
  const query = words.trim().toLowerCase();
  if (query === "") return true;
  const first = row.first;
  const own = [row.name, first?.search_name, first?.source_name, first?.list_name].some((name) =>
    (name ?? "").toLowerCase().includes(query),
  );
  return own || (titleOf !== null && sequenceMessageFound(row, query, titleOf) !== null);
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

/** The fold at the list's foot of the messages no campaign sends (Campaigns, one tab, call C5), and what each says. */
export const OTHER_MESSAGES_WORDS = {
  group: "Not in a campaign",
  inbox: "The Inbox can start a chat with it",
  hidden: "Hidden from the Inbox",
  checking: "WhatsApp is checking it",
  /** WhatsApp's no, as a step's box says it of its own message (message-off.ts): pressed, the row opens the message. */
  refused: MESSAGE_OFF_WORDS.refused,
  paused: MESSAGE_OFF_WORDS.paused,
  nothing: "Nothing sends it yet",
  /** The fold's press, as the ended campaigns' says it. */
  show: (n: number): string => `Show ${n}`,
  hide: "Hide",
} as const;

/** What the fold says of one message, of its versions in every language: the first of these that is true. */
function otherMessageLine(versions: readonly CampaignMessage[]): string {
  const W = OTHER_MESSAGES_WORDS;
  if (versions.every((m) => m.hidden)) return W.hidden;
  const shown = versions.filter((m) => !m.hidden);
  const stands = (...statuses: string[]) => shown.some((m) => statuses.includes(m.versions.whatsapp?.status ?? ""));
  if (stands("approved")) return W.inbox;
  if (stands("rejected")) return W.refused;
  if (stands("paused", "disabled")) return W.paused;
  return stands("pending") ? W.checking : W.nothing;
}

/** A message no campaign sends, as the fold lists it: its name (its address), its title, and what can use it. */
export interface OtherMessage {
  name: string;
  title: string;
  line: string;
}

/**
 * The messages on file that nothing sends (`sends`: the settings read's usage, a campaign's step or the Inbox's booking),
 * one row a name whatever its languages, by title (Campaigns, one tab, call C5): with Messages folded into Campaigns they
 * sit at the list's foot, each saying what can use it. One put away is said as what that does: the Inbox's picker leaves
 * it out (offered-templates.ts templateOffered); one WhatsApp approved, that the Inbox can start a chat with it; one
 * WhatsApp refused or paused in every language it has, that, with the press that mends it (the Messages list put such a
 * message under its own Needs you, and the bell's row about it opens it too); one WhatsApp is still checking, that.
 */
export function otherMessagesOf(
  messages: readonly CampaignMessage[],
  sends: (name: string) => boolean,
): OtherMessage[] {
  const byName = new Map<string, CampaignMessage[]>();
  for (const m of messages) if (!sends(m.name)) byName.set(m.name, [...(byName.get(m.name) ?? []), m]);
  return [...byName.entries()]
    .map(([name, versions]) => {
      return { name, title: versions[0]?.title ?? name, line: otherMessageLine(versions) };
    })
    .sort((a, b) => a.title.localeCompare(b.title));
}
